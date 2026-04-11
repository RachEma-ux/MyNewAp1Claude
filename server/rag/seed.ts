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

    // ── Manual Nodes (user-designed) ─────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_manual_nodes (
        id SERIAL PRIMARY KEY,
        unique_id VARCHAR(255) UNIQUE,
        name TEXT NOT NULL,
        short_name VARCHAR(500),
        family VARCHAR(50) NOT NULL,
        kind VARCHAR(50) NOT NULL,
        description TEXT,
        properties JSONB DEFAULT '{}',
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        applied_template_id INTEGER,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kgra_mn_unique_id ON kgra_manual_nodes(unique_id);
      CREATE INDEX IF NOT EXISTS idx_kgra_mn_family ON kgra_manual_nodes(family);
      CREATE INDEX IF NOT EXISTS idx_kgra_mn_kind ON kgra_manual_nodes(kind);
      CREATE INDEX IF NOT EXISTS idx_kgra_mn_status ON kgra_manual_nodes(status);
    `);

    // ── Manual Edges (user-designed) ──────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_manual_edges (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        source_node_id INTEGER NOT NULL,
        target_node_id INTEGER NOT NULL,
        source_is_auto VARCHAR(5) NOT NULL DEFAULT 'false',
        target_is_auto VARCHAR(5) NOT NULL DEFAULT 'false',
        relationship_type VARCHAR(50) NOT NULL,
        relationship_category VARCHAR(30),
        weight INTEGER NOT NULL DEFAULT 1,
        confidence VARCHAR(10),
        provenance VARCHAR(255),
        link_strength VARCHAR(10) NOT NULL DEFAULT 'hard',
        description TEXT,
        properties JSONB DEFAULT '{}',
        rules JSONB,
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        applied_template_id INTEGER,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kgra_me_source ON kgra_manual_edges(source_node_id);
      CREATE INDEX IF NOT EXISTS idx_kgra_me_target ON kgra_manual_edges(target_node_id);
      CREATE INDEX IF NOT EXISTS idx_kgra_me_status ON kgra_manual_edges(status);
      CREATE INDEX IF NOT EXISTS idx_kgra_me_category ON kgra_manual_edges(relationship_category);
    `);

    // ── Templates ────────────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version VARCHAR(20),
        description TEXT,
        purpose TEXT,
        is_default VARCHAR(5) NOT NULL DEFAULT 'false',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        design_principles JSONB,
        overlays JSONB,
        visualization_rules JSONB,
        quality_guards JSONB,
        portability_profiles JSONB,
        maturity_levels JSONB,
        example_queries JSONB,
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_template_nodes (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL,
        unique_id VARCHAR(255),
        name TEXT NOT NULL,
        short_name VARCHAR(500),
        family VARCHAR(50) NOT NULL,
        kind VARCHAR(50) NOT NULL,
        description TEXT,
        properties JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kgra_tn_template ON kgra_template_nodes(template_id);
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_template_edges (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        source_node_id INTEGER NOT NULL,
        target_node_id INTEGER NOT NULL,
        relationship_type VARCHAR(50) NOT NULL,
        relationship_category VARCHAR(30),
        weight INTEGER NOT NULL DEFAULT 1,
        link_strength VARCHAR(10) NOT NULL DEFAULT 'hard',
        description TEXT,
        properties JSONB DEFAULT '{}',
        rules JSONB,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kgra_te_template ON kgra_template_edges(template_id);
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_applied_templates (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL,
        applied_at TIMESTAMP DEFAULT now() NOT NULL,
        applied_by VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'active'
      );
    `);

    // ── Modes ───────────────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_modes (
        id SERIAL PRIMARY KEY,
        template_id INTEGER,
        mode_id VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        persona VARCHAR(255),
        primary_question TEXT,
        includes JSONB NOT NULL,
        emphasis_rules JSONB,
        default_view_layout VARCHAR(30),
        example_use_case TEXT,
        is_default VARCHAR(5) NOT NULL DEFAULT 'false',
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kgra_modes_template ON kgra_modes(template_id);
      CREATE INDEX IF NOT EXISTS idx_kgra_modes_mode_id ON kgra_modes(mode_id);
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS kgra_mode_compositions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        mode_ids JSONB NOT NULL,
        merge_strategy VARCHAR(30) NOT NULL DEFAULT 'union',
        conflict_resolution VARCHAR(50),
        zoom_level VARCHAR(30),
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
    `);

    console.log("[RAGDB Seed] Tables created/verified (11 tables)");

    // ── Seed default ontology template + modes ──────────────────
    await seedDefaultOntology(db);

  } catch (error: any) {
    console.warn(`[RAGDB Seed] Failed: ${error.message}`);
  }
}

async function seedDefaultOntology(db: any) {
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const ontologyPath = join(process.cwd(), "server/rag/default-ontology.json");
    const ontology = JSON.parse(readFileSync(ontologyPath, "utf-8"));
    const modesPath = join(process.cwd(), "server/rag/default-modes.json");
    const modesData = JSON.parse(readFileSync(modesPath, "utf-8"));

    // Get or create default template
    let templateId: number;
    const existing = ((await db.execute(sql`SELECT id FROM kgra_templates WHERE is_default = 'true' LIMIT 1`)) as any).rows;
    if (existing?.length > 0) {
      templateId = existing[0].id;
    } else {
      const result = ((await db.execute(sql`
        INSERT INTO kgra_templates (name, version, description, purpose, is_default, design_principles, overlays, visualization_rules, quality_guards, portability_profiles, maturity_levels, example_queries)
        VALUES (
          ${ontology.name}, ${ontology.version}, ${ontology.description}, ${ontology.purpose}, 'true',
          ${JSON.stringify(ontology.design_principles)}::jsonb,
          ${JSON.stringify(ontology.overlays)}::jsonb,
          ${JSON.stringify(ontology.visualization_rules)}::jsonb,
          ${JSON.stringify(ontology.quality_guards)}::jsonb,
          ${JSON.stringify(ontology.portability_profiles)}::jsonb,
          ${JSON.stringify(ontology.maturity_levels)}::jsonb,
          ${JSON.stringify(ontology.example_queries)}::jsonb
        ) RETURNING id
      `)) as any).rows?.[0];
      templateId = result?.id;
      if (!templateId) { console.warn("[RAGDB] Failed to insert default template"); return; }
      console.log(`[RAGDB] Default template created: id=${templateId}`);
    }

    // Seed missing modes (idempotent — skip existing mode_ids)
    const existingModes = ((await db.execute(sql`SELECT mode_id FROM kgra_modes WHERE template_id = ${templateId}`)) as any).rows || [];
    const existingModeIds = new Set(existingModes.map((m: any) => m.mode_id));
    let newModes = 0;
    for (const mode of modesData.modes || []) {
      if (existingModeIds.has(mode.mode_id)) continue;
      await db.execute(sql`
        INSERT INTO kgra_modes (template_id, mode_id, name, persona, primary_question, includes, emphasis_rules, default_view_layout, example_use_case, is_default, sort_order)
        VALUES (${templateId}, ${mode.mode_id}, ${mode.name}, ${mode.persona}, ${mode.primary_question},
          ${JSON.stringify(mode.includes)}::jsonb, ${JSON.stringify(mode.emphasis_rules)}::jsonb,
          ${mode.default_view_layout}, ${mode.example_use_case}, 'true', ${mode.sort_order || 0})
      `);
      newModes++;
    }

    // Seed missing compositions
    const existingComps = ((await db.execute(sql`SELECT name FROM kgra_mode_compositions`)) as any).rows || [];
    const existingCompNames = new Set(existingComps.map((c: any) => c.name));
    let newComps = 0;
    for (const comp of modesData.compositions || []) {
      if (existingCompNames.has(comp.name)) continue;
      await db.execute(sql`
        INSERT INTO kgra_mode_compositions (name, mode_ids, merge_strategy, conflict_resolution, zoom_level)
        VALUES (${comp.name}, ${JSON.stringify(comp.mode_ids)}::jsonb, ${comp.merge_strategy}, ${comp.conflict_resolution}, ${comp.zoom_level})
      `);
      newComps++;
    }

    // Seed template nodes from ontology families (idempotent — skip if any exist)
    const existingTNodes = ((await db.execute(sql`SELECT COUNT(*) as cnt FROM kgra_template_nodes WHERE template_id = ${templateId}`)) as any).rows?.[0]?.cnt;
    if (Number(existingTNodes) === 0) {
      let nodeCount = 0;
      for (const [family, info] of Object.entries(ontology.node_families || {})) {
        const kinds = (info as any).kinds || [];
        for (const kind of kinds) {
          await db.execute(sql`
            INSERT INTO kgra_template_nodes (template_id, unique_id, name, short_name, family, kind, description)
            VALUES (${templateId}, ${family.toLowerCase() + '_' + kind}, ${kind}, ${kind}, ${family}, ${kind}, ${(info as any).description || ''})
          `);
          nodeCount++;
        }
      }

      // Seed template edges — one example per relationship category
      const relTypes = ontology.relationship_types || {};
      let edgeCount = 0;
      const tNodes = ((await db.execute(sql`SELECT id, family, kind FROM kgra_template_nodes WHERE template_id = ${templateId}`)) as any).rows || [];
      const nodeByKind = new Map(tNodes.map((n: any) => [n.kind, n.id]));

      const exampleEdges: Array<[string, string, string, string]> = [
        ["CONTAINS", "application", "service", "structural"],
        ["IMPORTS", "file", "module", "dependency"],
        ["USES", "service", "library", "dependency"],
        ["DEPENDS_ON", "service", "database", "dependency"],
        ["EXPOSES", "service", "http_endpoint", "interface_flow"],
        ["ROUTES_TO", "ui_route", "handler", "interface_flow"],
        ["READS", "service", "table", "data_flow"],
        ["WRITES", "handler", "database", "data_flow"],
        ["RUNS_IN", "service", "container", "runtime_flow"],
        ["DEPLOYS_TO", "service", "cluster", "runtime_flow"],
        ["PROTECTED_BY", "http_endpoint", "policy", "control_flow"],
        ["GOVERNED_BY_SLO", "service", "slo", "control_flow"],
        ["DOCUMENTED_BY", "service", "document", "traceability"],
        ["VULNERABLE_TO", "service", "vulnerability", "risk_incident"],
        ["CAUSED_INCIDENT", "service", "outage", "risk_incident"],
        ["CONFIGURED_BY", "service", "feature_flag", "configuration"],
      ];

      for (const [relName, srcKind, tgtKind, category] of exampleEdges) {
        const srcId = nodeByKind.get(srcKind);
        const tgtId = nodeByKind.get(tgtKind);
        if (srcId && tgtId) {
          await db.execute(sql`
            INSERT INTO kgra_template_edges (template_id, name, source_node_id, target_node_id, relationship_type, relationship_category)
            VALUES (${templateId}, ${relName}, ${srcId}, ${tgtId}, ${relName}, ${category})
          `);
          edgeCount++;
        }
      }

      console.log(`[RAGDB] Template nodes/edges seeded: ${nodeCount} nodes, ${edgeCount} edges`);
    }

    if (newModes > 0 || newComps > 0) {
      console.log(`[RAGDB] Seeded ${newModes} new modes, ${newComps} new compositions`);
    } else {
      console.log("[RAGDB] Default ontology up to date");
    }
  } catch (err: any) {
    console.warn(`[RAGDB] Default ontology seed failed: ${err.message}`);
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
