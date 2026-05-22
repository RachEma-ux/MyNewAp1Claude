/**
 * ASDB — Agent Studio Schema Seed
 *
 * Phase 12.5: idempotent CREATE TABLE / CREATE INDEX runner that
 * provisions all 32 ags_* tables in the dedicated `asdb` database.
 *
 * Why introspection instead of hand-written SQL:
 *  - 32 tables + ~150 columns + 30+ indexes = ~400 lines of SQL to maintain
 *  - The drizzle schema in drizzle/tables/agent-studio.ts is the source
 *    of truth — every column, index, default
 *  - Drift between hand-written SQL and the schema would be silent and
 *    painful (we already hit this with drizzle-kit's rename prompts)
 *
 * The runtime introspection uses `getTableConfig` from drizzle/pg-core
 * to derive each table's columns + defaults, then emits idempotent
 * CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS statements.
 * Errors per-table are caught and logged so a single failure doesn't
 * prevent the others from being created.
 *
 * Boot-time call site: server/agent-studio/boot.ts via bootAgentStudio()
 * which is invoked from server/_core/index.ts.
 */

import pg from "pg";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import * as agsSchema from "../../../drizzle/tables/agent-studio";
// Native Graph Workspace — additional ags_* tables (Phase 0.5 / 1.6 / 1.7 / 7 / 11 / 12 / 13).
// Imported here so the introspection loop picks them up at boot.
import * as agsVaultSchema from "../../../drizzle/tables/agent-studio-vault";
import * as agsGraphSchema from "../../../drizzle/tables/agent-studio-graph";
import * as agsGraphProjectionSchema from "../../../drizzle/tables/agent-studio-graph-projection";
import * as agsGraphPromotionSchema from "../../../drizzle/tables/agent-studio-graph-promotion";
import * as agsGraphSkillSchema from "../../../drizzle/tables/agent-studio-graph-skill";
import * as agsGraphAgentSchema from "../../../drizzle/tables/agent-studio-graph-agent";
import * as agsGraphRagSchema from "../../../drizzle/tables/agent-studio-graph-rag";
import * as agsGraphQualitySchema from "../../../drizzle/tables/agent-studio-graph-quality";
// V1+ Phase 17-α / 17-γ — Canvas tables (Canvas + Node + Edge from #752; the
// 17-γ Projection-Events table added in PR-V1-53). The seed loop introspects
// every export starting with `ags*` and provisions it.
import * as agsCanvasSchema from "../../../drizzle/tables/agent-studio-canvas";
// Phase 24 — Bases MVP (T-F.1).
import * as agsBasesSchema from "../../../drizzle/tables/agent-studio-bases";
// F5 (2026-05-22) — eight `agent-studio-*` table files that were defined +
// re-exported via `drizzle/schema.ts` but never wired into this seed's
// `combinedSchema`. Result before this fix: the corresponding `ags_*` tables
// did not exist on a freshly-seeded ASDB.
//
// Originally surfaced as: `ags_regions` + `ags_workspace_region_pins` +
// `ags_runtime_alerts` missing → region-cache-rewarm + graph-health-alert
// crons failed every tick with `Failed query: ...`. The completeness
// source-scan test caught five more drifted files in the same sweep.
//
// Source-scan regression guard:
//   `tests/agent-studio/seed-combined-schema-completeness.test.ts`
// — fails if a new `drizzle/tables/agent-studio-*.ts` lands without being
// either imported here or added to KNOWN_NON_ASDB_TABLES.
import * as agsRegionsSchema from "../../../drizzle/tables/agent-studio-regions";
import * as agsWorkspaceRegionPinsSchema from "../../../drizzle/tables/agent-studio-workspace-region-pins";
import * as agsRuntimeAlertsSchema from "../../../drizzle/tables/agent-studio-runtime-alerts";
import * as agsCodeGraphSchema from "../../../drizzle/tables/agent-studio-code-graph";
import * as agsExtensionsSchema from "../../../drizzle/tables/agent-studio-extensions";
import * as agsPublishTargetsSchema from "../../../drizzle/tables/agent-studio-publish-targets";
import * as agsSecurityGraphSchema from "../../../drizzle/tables/agent-studio-security-graph";
import * as agsVaultTemplateInstantiationsSchema from "../../../drizzle/tables/agent-studio-vault-template-instantiations";

interface SeedResult {
  created: number;
  skipped: number;
  failed: number;
  /** Columns added to existing tables via ALTER TABLE (Phase 19c follow-up) */
  altered: number;
  failures: Array<{ table: string; error: string }>;
}

// ── SQL generation helpers ──────────────────────────────────────────────────

/**
 * Map a drizzle PgColumn to a SQL type + modifiers fragment.
 *
 * Handles the column types we use in agent-studio.ts: serial, integer,
 * varchar, text, boolean, jsonb, timestamp. Adds NOT NULL, PRIMARY KEY,
 * and DEFAULT clauses as configured.
 */
function columnToSqlFragment(col: PgColumn): string {
  const name = col.name;
  const ct = col.columnType;

  let sqlType: string;
  if (ct === "PgSerial") sqlType = "serial";
  else if (ct === "PgInteger") sqlType = "integer";
  else if (ct === "PgVarchar") {
    const length = (col as any).length as number | undefined;
    sqlType = length ? `varchar(${length})` : "varchar";
  } else if (ct === "PgText") sqlType = "text";
  else if (ct === "PgBoolean") sqlType = "boolean";
  else if (ct === "PgJsonb") sqlType = "jsonb";
  else if (ct === "PgJson") sqlType = "json";
  else if (ct === "PgTimestamp") sqlType = "timestamp";
  else if (ct === "PgDate") sqlType = "date";
  else if (ct === "PgUUID") sqlType = "uuid";
  else if (ct === "PgNumeric") sqlType = "numeric";
  else sqlType = "text"; // safe fallback

  const parts: string[] = [`"${name}"`, sqlType];
  if (col.primary) parts.push("PRIMARY KEY");
  if (col.notNull) parts.push("NOT NULL");

  if (col.hasDefault) {
    const d = (col as any).default;
    // SQL fragment (defaultNow() returns one) — render as raw SQL
    if (d && typeof d === "object" && (d as any).queryChunks) {
      parts.push("DEFAULT now()");
    } else if (d === null) {
      parts.push("DEFAULT NULL");
    } else if (typeof d === "string") {
      parts.push(`DEFAULT '${d.replace(/'/g, "''")}'`);
    } else if (typeof d === "number") {
      parts.push(`DEFAULT ${d}`);
    } else if (typeof d === "boolean") {
      parts.push(`DEFAULT ${d}`);
    } else if (Array.isArray(d) || (d && typeof d === "object")) {
      parts.push(
        `DEFAULT '${JSON.stringify(d).replace(/'/g, "''")}'::jsonb`
      );
    } else if ((col as any).defaultFn || sqlType === "timestamp") {
      // hasDefault=true with no `default` value usually means defaultNow()
      // or defaultFn — for timestamp columns this is the safe fallback
      parts.push("DEFAULT now()");
    }
  }
  return parts.join(" ");
}

/**
 * Build a CREATE TABLE IF NOT EXISTS statement for a drizzle pgTable.
 */
function buildCreateTableSql(table: PgTable): string {
  const config = getTableConfig(table);
  const cols = config.columns.map(columnToSqlFragment).join(",\n  ");
  return `CREATE TABLE IF NOT EXISTS "${config.name}" (\n  ${cols}\n);`;
}

/**
 * Render a drizzle SQL `.where(sql\`...\`)` chunk array into a raw
 * SQL fragment suitable for a partial-index `WHERE` clause.
 *
 * F6 (2026-05-22) — before this helper landed, `buildIndexSql`
 * silently dropped the `.where(...)` clause from drizzle's partial
 * unique indexes (e.g. `idx_ags_graph_edges_type_edge_key` defined
 * as `.uniqueIndex(...).where(sql\`edge_key IS NOT NULL\`)`).
 * The seed then attempted a NON-partial unique, which collided with
 * legitimately-duplicate rows whose `edge_key` was NULL or with
 * legacy duplicates from before the constraint existed → repeating
 * `[ASDB] index error on ags_graph_edges: could not create unique index`
 * at every boot, with the unique constraint never actually landing.
 *
 * Supported chunk shapes (matches what `sql\`<col> IS NOT NULL\``
 * etc. produces):
 *   - String tags: a drizzle `SQL` chunk whose `.value[0]` is a
 *     literal SQL fragment, e.g. `' IS NOT NULL'`.
 *   - Column references: a `PgColumn`-like object exposing `.name`.
 *
 * Unrecognized chunk shapes throw so we don't silently emit a
 * partial-clause that doesn't match drizzle's intent.
 */
function renderIndexWhereChunks(chunks: ReadonlyArray<unknown>): string {
  const parts: string[] = [];
  for (const chunk of chunks) {
    if (typeof chunk === "string") {
      parts.push(chunk);
      continue;
    }
    const obj = chunk as Record<string, unknown>;
    if (obj && Array.isArray((obj as any).value)) {
      // Drizzle string-tag wrapping: { value: ['<literal>'] }
      for (const v of (obj as any).value as unknown[]) {
        if (typeof v === "string") parts.push(v);
      }
      continue;
    }
    if (obj && typeof (obj as any).name === "string") {
      // Drizzle column reference.
      parts.push(`"${(obj as any).name}"`);
      continue;
    }
    throw new Error(
      `[seed] unsupported partial-index WHERE chunk shape: ${JSON.stringify(
        obj,
      )}`,
    );
  }
  return parts.join("").trim();
}

/**
 * Build CREATE INDEX IF NOT EXISTS statements for the table's indexes.
 * Both regular and unique indexes are derived from the same config.
 * F6 (2026-05-22): partial-index `WHERE` clauses are now rendered
 * (previously they were silently stripped).
 */
function buildIndexSql(table: PgTable): string[] {
  const config = getTableConfig(table);
  const stmts: string[] = [];
  for (const idx of (config.indexes ?? []) as any[]) {
    const cfg = idx.config ?? idx;
    const idxName = cfg.name;
    const colNames = (cfg.columns ?? [])
      .map((c: any) => `"${c.name}"`)
      .join(", ");
    const tableName = config.name;
    if (!idxName || !colNames) continue;
    const unique = cfg.unique ? "UNIQUE " : "";
    let whereClause = "";
    if (cfg.where && Array.isArray(cfg.where.queryChunks)) {
      const rendered = renderIndexWhereChunks(cfg.where.queryChunks);
      if (rendered.length > 0) {
        whereClause = ` WHERE ${rendered}`;
      }
    }
    stmts.push(
      `CREATE ${unique}INDEX IF NOT EXISTS "${idxName}" ON "${tableName}" (${colNames})${whereClause};`
    );
  }
  return stmts;
}

// F6 — exported for unit-testing the WHERE-clause renderer in isolation.
export const __testing__ = { renderIndexWhereChunks, buildIndexSql };

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve the asdb connection string from the same fallback chain as
 * the connection module. We connect with a fresh pg client (NOT through
 * drizzle) because drizzle's `sql.raw()` + `db.execute()` path mangles
 * raw DDL — every CREATE TABLE silently fails. Using the bare pg client
 * is the same approach the local debug script used successfully.
 */
function resolveAsdbUrl(): string {
  if (process.env.DATABASE_URL_ASDB) return process.env.DATABASE_URL_ASDB;
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL.replace(/\/[^/]+$/, "/asdb");
  }
  return "postgresql://localhost:5432/asdb";
}

/**
 * Idempotent: provisions every ags_* table + index in asdb. Safe to
 * call on every boot. Returns counts so the caller can log a summary.
 *
 * Throws only if the database connection itself can't be established;
 * per-table failures are collected and logged but don't abort the seed.
 */
export async function seedAsDb(): Promise<SeedResult> {
  const url = resolveAsdbUrl();

  // Connect with a bare pg client. We bypass the drizzle wrapper for
  // DDL because `db.execute(sql.raw(...))` silently fails on raw
  // CREATE TABLE statements (the failure shows up only as "Failed
  // query: ..." with no underlying PG error). The bare client.query
  // approach was verified to work in the local debug script.
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(
      `[ASDB] Cannot connect to ${url.replace(/:([^:@]+)@/, ":****@")}: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const result: SeedResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    altered: 0,
    failures: [],
  };

  // Combined iteration across the original agent-studio.ts schema and the
  // Native Graph Workspace additions. Each new file uses the `ags*` export
  // prefix so the filter below picks them up unchanged.
  const combinedSchema: Record<string, unknown> = {
    ...agsSchema,
    ...agsVaultSchema,
    ...agsGraphSchema,
    ...agsGraphProjectionSchema,
    ...agsGraphPromotionSchema,
    ...agsGraphSkillSchema,
    ...agsGraphAgentSchema,
    ...agsGraphRagSchema,
    ...agsGraphQualitySchema,
    ...agsCanvasSchema,
    ...agsBasesSchema,
    ...agsRegionsSchema,
    ...agsWorkspaceRegionPinsSchema,
    ...agsRuntimeAlertsSchema,
    ...agsCodeGraphSchema,
    ...agsExtensionsSchema,
    ...agsPublishTargetsSchema,
    ...agsSecurityGraphSchema,
    ...agsVaultTemplateInstantiationsSchema,
  };

  try {
    for (const [exportName, value] of Object.entries(combinedSchema)) {
      if (!exportName.startsWith("ags") || !value || typeof value !== "object") {
        continue;
      }
      let config;
      try {
        config = getTableConfig(value as PgTable);
      } catch {
        continue;
      }
      const tableName = config.name;
      try {
        const createSql = buildCreateTableSql(value as PgTable);
        await client.query(createSql);
        result.created++;

        // ── Phase 19c follow-up: detect & add missing columns ──
        //
        // CREATE TABLE IF NOT EXISTS only creates the table the FIRST time.
        // When schema columns are added later (e.g., Phase 15b's
        // oauth_config / oauth_state on ags_draft_mcp_servers), the seed
        // would silently no-op and Drizzle's full-row SELECT would fail
        // at runtime with "column does not exist".
        //
        // We compare the schema's expected column set against the live
        // information_schema and emit ALTER TABLE ADD COLUMN for anything
        // missing. Idempotent — uses ADD COLUMN IF NOT EXISTS so a
        // race or repeat is harmless.
        try {
          const liveColsRes = await client.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
            [tableName]
          );
          const liveCols = new Set<string>(
            liveColsRes.rows.map((r: any) => r.column_name)
          );
          for (const col of config.columns) {
            if (liveCols.has(col.name)) continue;
            const fragment = columnToSqlFragment(col as PgColumn);
            // Strip the leading "name" from the fragment because ALTER
            // TABLE ADD COLUMN repeats the name in its own clause
            const alterSql = `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS ${fragment};`;
            try {
              await client.query(alterSql);
              result.altered++;
              console.log(
                `[ASDB] altered ${tableName}: added column ${col.name}`
              );
            } catch (e) {
              console.warn(
                `[ASDB] ALTER TABLE failed for ${tableName}.${col.name}: ${e instanceof Error ? e.message : String(e)}`
              );
            }
          }
        } catch (e) {
          console.warn(
            `[ASDB] column-drift check failed for ${tableName}: ${e instanceof Error ? e.message : String(e)}`
          );
        }

        // Indexes — per-index failures logged but non-fatal
        for (const idxSql of buildIndexSql(value as PgTable)) {
          try {
            await client.query(idxSql);
          } catch (e) {
            console.warn(
              `[ASDB] index error on ${tableName}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
      } catch (e) {
        result.failed++;
        const message = e instanceof Error ? e.message : String(e);
        result.failures.push({ table: tableName, error: message });
        console.error(`[ASDB] CREATE TABLE failed for ${tableName}: ${message}`);
      }
    }
  } finally {
    await client.end().catch(() => {
      /* ignore — client may already be closed on error */
    });
  }

  console.log(
    `[ASDB] Seed complete — ${result.created} tables created/verified, ${result.altered} columns added, ${result.failed} failed`
  );
  return result;
}
