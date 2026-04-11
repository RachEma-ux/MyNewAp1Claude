/**
 * RagDB — Seed Script
 *
 * Creates the kgra_entities, kgra_relationships, and kgra_build_runs tables.
 * Idempotent: uses CREATE TABLE IF NOT EXISTS.
 *
 * Called on server startup from server/_core/index.ts.
 */

import { sql } from "drizzle-orm";
import { getRagDb } from "./connection";

export async function seedRagDb() {
  const db = getRagDb();
  if (!db) {
    console.log("[RAGDB Seed] Cannot seed — RAGDB not connected");
    return;
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_entities (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        short_name VARCHAR(500),
        entity_type VARCHAR(50) NOT NULL,
        mentions INTEGER NOT NULL DEFAULT 1,
        directory VARCHAR(500),
        source_doc_id INTEGER,
        build_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kgra_entities_name ON kgra_entities(name);
      CREATE INDEX IF NOT EXISTS idx_kgra_entities_type ON kgra_entities(entity_type);
      CREATE INDEX IF NOT EXISTS idx_kgra_entities_build ON kgra_entities(build_id);
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_relationships (
        id SERIAL PRIMARY KEY,
        source_entity_id INTEGER NOT NULL REFERENCES kgra_entities(id) ON DELETE CASCADE,
        target_entity_id INTEGER NOT NULL REFERENCES kgra_entities(id) ON DELETE CASCADE,
        relationship_type VARCHAR(50) NOT NULL,
        weight INTEGER NOT NULL DEFAULT 1,
        build_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kgra_rels_source ON kgra_relationships(source_entity_id);
      CREATE INDEX IF NOT EXISTS idx_kgra_rels_target ON kgra_relationships(target_entity_id);
      CREATE INDEX IF NOT EXISTS idx_kgra_rels_type ON kgra_relationships(relationship_type);
      CREATE INDEX IF NOT EXISTS idx_kgra_rels_build ON kgra_relationships(build_id);
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_build_runs (
        id SERIAL PRIMARY KEY,
        build_id VARCHAR(100) NOT NULL UNIQUE,
        entity_count INTEGER NOT NULL DEFAULT 0,
        relationship_count INTEGER NOT NULL DEFAULT 0,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        type_counts JSONB,
        status VARCHAR(50) NOT NULL DEFAULT 'completed',
        built_at TIMESTAMP DEFAULT now() NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
    `);

    console.log("[RAGDB Seed] Tables created/verified");
  } catch (error: any) {
    console.warn(`[RAGDB Seed] Failed: ${error.message}`);
  }
}

/**
 * Migrate existing JSON blob from system_settings (main DB) into ragdb tables.
 * Runs once — skips if ragdb already has entity data.
 */
export async function migrateJsonBlobToRagDb() {
  const ragDb = getRagDb();
  if (!ragDb) return;

  // Check if already migrated
  const existing = (await ragDb.execute(sql`SELECT COUNT(*) as cnt FROM kgra_entities`) as any).rows?.[0];
  if (Number(existing?.cnt) > 0) {
    console.log("[RAGDB] Already populated — skipping migration");
    return;
  }

  // Read JSON blob from main DB
  let mainDb: any;
  try {
    const { getDb } = await import("../db/connection");
    mainDb = getDb();
  } catch {
    console.log("[RAGDB] Cannot access main DB for migration — skipping");
    return;
  }
  if (!mainDb) return;

  const row = ((await mainDb.execute(sql`SELECT "settingValue" FROM system_settings WHERE "settingKey" = 'kgra_graph_data'`)) as any).rows?.[0];
  if (!row?.settingValue) {
    console.log("[RAGDB] No JSON blob to migrate");
    return;
  }

  const graph = typeof row.settingValue === "string" ? JSON.parse(row.settingValue) : row.settingValue;
  const entities: any[] = graph.entities || [];
  const relationships: any[] = graph.relationships || [];

  if (entities.length === 0) {
    console.log("[RAGDB] JSON blob has no entities — skipping");
    return;
  }

  const buildId = graph.builtAt || new Date().toISOString();
  const BATCH = 500;

  // Insert entities in batches, build name→id map
  const nameToId = new Map<string, number>();

  for (let i = 0; i < entities.length; i += BATCH) {
    const batch = entities.slice(i, i + BATCH);
    const values = batch.map((e: any) =>
      sql`(${e.name}, ${(e.name || "").split("/").pop() || e.name}, ${e.type || "file"}, ${e.mentions || 1}, ${e.dir || null}, ${null}, ${buildId})`
    );
    const inserted = (await ragDb.execute(sql`
      INSERT INTO kgra_entities (name, short_name, entity_type, mentions, directory, source_doc_id, build_id)
      VALUES ${sql.join(values, sql`, `)}
      RETURNING id, name
    `)) as any;
    for (const r of inserted.rows || []) {
      nameToId.set(r.name, r.id);
    }
  }

  // Insert relationships in batches
  let relCount = 0;
  const validRels = relationships.filter((r: any) => nameToId.has(r.from) && nameToId.has(r.to));

  for (let i = 0; i < validRels.length; i += BATCH) {
    const batch = validRels.slice(i, i + BATCH);
    const values = batch.map((r: any) =>
      sql`(${nameToId.get(r.from)!}, ${nameToId.get(r.to)!}, ${r.type || "related_to"}, ${1}, ${buildId})`
    );
    await ragDb.execute(sql`
      INSERT INTO kgra_relationships (source_entity_id, target_entity_id, relationship_type, weight, build_id)
      VALUES ${sql.join(values, sql`, `)}
    `);
    relCount += batch.length;
  }

  // Record build run
  const typeCounts: Record<string, number> = {};
  for (const e of entities) {
    const t = e.type || "file";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  await ragDb.execute(sql`
    INSERT INTO kgra_build_runs (build_id, entity_count, relationship_count, chunk_count, type_counts, built_at)
    VALUES (${buildId}, ${entities.length}, ${relCount}, ${graph.chunkCount || 0}, ${JSON.stringify(typeCounts)}::jsonb, ${buildId})
  `);

  // Delete old blob from main DB
  await mainDb.execute(sql`DELETE FROM system_settings WHERE "settingKey" = 'kgra_graph_data'`);

  console.log(`[RAGDB] Migrated ${entities.length} entities + ${relCount} relationships from JSON blob`);
}
