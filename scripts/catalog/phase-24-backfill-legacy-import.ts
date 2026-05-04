#!/usr/bin/env tsx
/**
 * Plan v3 Phase 24 — catalog_entries legacy import backfill driver.
 *
 * Reads every catalog_entries row whose `legacy_import_state IS NULL`
 * and classifies it per CATALOG_SOURCE_MAPPING.md (Phase 23 evidence
 * report). Writes:
 *   - legacy_import_state          — "legacy_imported" | "legacy_imported_unresolved"
 *   - active_source_version_id     — release id, when sourceType="ags_agent" + resolved
 *
 * Runs across two databases:
 *   - main DB (`getDb`)  — owns `catalog_entries`, `llm_authority`, `models`,
 *                          `providers`, `bots`
 *   - asdb   (`getAsDb`) — owns `ags_agents`, `ags_agent_releases`
 *
 * Modes:
 *   --dry-run    Default. Scan + classify + write evidence report.
 *                No DB writes.
 *   --apply      Scan + classify + write classification + evidence report.
 *                One UPDATE per row.
 *   --validate   After --apply, re-scan and assert zero rows remain
 *                with `legacy_import_state IS NULL` AND `sourceType IS NOT NULL`.
 *                Exits non-zero on any finding.
 *
 * Idempotent: rows that already have `legacy_import_state` set are
 * left alone (the classifier short-circuits via `already_classified`).
 *
 * Evidence report:
 *   docs/evidence/provider-model-binding/CATALOG_LEGACY_IMPORT_BACKFILL_REPORT.md
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { sql } from "drizzle-orm";
import {
  classifyLegacyImport,
  scanUnclassifiedRows,
  type CatalogRowSourceLink,
  type ClassificationResult,
  type LegacyFkTable,
  type SourceLookups,
} from "../../server/ai-types/legacy-import";

const EVIDENCE_PATH = join(
  process.cwd(),
  "docs/evidence/provider-model-binding/CATALOG_LEGACY_IMPORT_BACKFILL_REPORT.md",
);

type Mode = "dry-run" | "apply" | "validate";

function parseMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes("--apply")) return "apply";
  if (args.includes("--validate")) return "validate";
  return "dry-run";
}

interface Outcome {
  row: CatalogRowSourceLink;
  classification: ClassificationResult;
}

async function buildLookups(): Promise<SourceLookups> {
  const { getDb } = await import("../../server/db");
  const { getAsDb } = await import("../../server/agent-studio/db/connection");

  const mainDb = getDb();
  const asDb = getAsDb();

  if (!mainDb) {
    console.error(
      "[error] DATABASE_URL not set; cannot read catalog_entries. Aborting.",
    );
    process.exit(2);
  }

  return {
    async resolveAgsAgentPublishedRelease(agentId: number): Promise<number | null> {
      if (!asDb) {
        console.error(
          "[warn] ASDB not available; ags_agent rows cannot be resolved — they will be flagged unresolved.",
        );
        return null;
      }
      const r = await asDb.execute(
        sql`SELECT id FROM ags_agent_releases
            WHERE agent_id = ${agentId} AND state = 'published'
            ORDER BY published_at DESC NULLS LAST LIMIT 1`,
      );
      const row = Array.isArray(r) ? r[0] : (r as any)?.rows?.[0];
      return row?.id ?? null;
    },
    async rowExists(table: LegacyFkTable, id: number): Promise<boolean> {
      const r = await mainDb.execute(
        sql`SELECT 1 AS one FROM ${sql.identifier(table)} WHERE id = ${id} LIMIT 1`,
      );
      const row = Array.isArray(r) ? r[0] : (r as any)?.rows?.[0];
      return Boolean(row?.one);
    },
  };
}

async function classifyAll(): Promise<Outcome[]> {
  const { getDb } = await import("../../server/db");
  const mainDb = getDb()!;
  const lookups = await buildLookups();

  const rows = await scanUnclassifiedRows(mainDb);
  console.error(`[info] Scanned ${rows.length} unclassified row(s).`);

  const results: Outcome[] = [];
  for (const row of rows) {
    const classification = await classifyLegacyImport(row, lookups);
    results.push({ row, classification });
  }
  return results;
}

async function applyClassifications(results: Outcome[]): Promise<number> {
  const { getDb } = await import("../../server/db");
  const { catalogEntries } = await import("../../drizzle/tables/catalog");
  const { eq } = await import("drizzle-orm");
  const db = getDb()!;
  let writes = 0;
  for (const { row, classification } of results) {
    if (classification.legacyImportState == null) continue; // skip null-source rows
    if (classification.reason === "already_classified") continue;
    await db
      .update(catalogEntries)
      .set({
        legacyImportState: classification.legacyImportState,
        activeSourceVersionId: classification.activeSourceVersionId,
        updatedAt: new Date(),
      })
      .where(eq(catalogEntries.id, row.id));
    writes += 1;
  }
  return writes;
}

async function validateNoUnclassified(): Promise<void> {
  const { getDb } = await import("../../server/db");
  const mainDb = getDb()!;
  const r = await mainDb.execute(
    sql`SELECT COUNT(*)::int AS n FROM catalog_entries
        WHERE source_type IS NOT NULL AND legacy_import_state IS NULL`,
  );
  const row = Array.isArray(r) ? r[0] : (r as any)?.rows?.[0];
  const n = Number(row?.n ?? 0);
  if (n > 0) {
    console.error(
      `[error] ${n} catalog row(s) still have sourceType set but no legacy_import_state. Backfill incomplete.`,
    );
    process.exit(1);
  }
  console.error("[info] No residual unclassified source-bearing rows. validate OK.");
}

function renderEvidence(results: Outcome[], mode: Mode, writes: number): string {
  const counts = {
    total: results.length,
    legacy_imported: 0,
    legacy_imported_unresolved: 0,
    no_source_linkage: 0,
    already_classified: 0,
  };
  const bySource: Record<string, number> = {};

  for (const r of results) {
    const state = r.classification.legacyImportState;
    const reason = r.classification.reason;
    if (reason === "already_classified") counts.already_classified += 1;
    else if (state === "legacy_imported") counts.legacy_imported += 1;
    else if (state === "legacy_imported_unresolved")
      counts.legacy_imported_unresolved += 1;
    else if (reason === "no_source_linkage") counts.no_source_linkage += 1;
    bySource[r.row.sourceType ?? "(null)"] =
      (bySource[r.row.sourceType ?? "(null)"] ?? 0) + 1;
  }

  const lines: string[] = [];
  lines.push("# Catalog — Legacy Import Backfill Report");
  lines.push("");
  lines.push(`**Plan v3 Phase 24.** Source: \`scripts/catalog/phase-24-backfill-legacy-import.ts\`.`);
  lines.push("");
  lines.push(`**Mode:** \`${mode}\``);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Rows scanned:** ${counts.total}`);
  if (mode === "apply") lines.push(`**Rows written:** ${writes}`);
  lines.push("");
  lines.push("## Counts by classification");
  lines.push("");
  lines.push(`- legacy_imported: ${counts.legacy_imported}`);
  lines.push(`- legacy_imported_unresolved: ${counts.legacy_imported_unresolved}`);
  lines.push(`- no_source_linkage (skipped): ${counts.no_source_linkage}`);
  lines.push(`- already_classified (idempotent skip): ${counts.already_classified}`);
  lines.push("");
  lines.push("## Counts by sourceType");
  lines.push("");
  for (const [k, v] of Object.entries(bySource).sort()) {
    lines.push(`- \`${k}\`: ${v}`);
  }
  lines.push("");
  lines.push("## Per-row classification");
  lines.push("");
  lines.push("| catalogEntryId | sourceType | sourceId | classification | activeSourceVersionId | reason |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(
      `| ${r.row.id} | ${r.row.sourceType ?? "(null)"} | ${r.row.sourceId ?? "(null)"} | ${r.classification.legacyImportState ?? "(skip)"} | ${r.classification.activeSourceVersionId ?? "(null)"} | ${r.classification.reason} |`,
    );
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- Rows classified `legacy_imported_unresolved` require admin review via the **Reconcile Legacy Import** action (`reconcileLegacyImport()` in `server/ai-types/legacy-import.ts`). Phase 25's `aiTypes.catalog.register` will refuse to operate on them automatically.",
  );
  lines.push(
    "- Rows with `sourceType IS NULL` are admin-created direct entries; they are not legacy imports and are intentionally skipped.",
  );
  lines.push(
    "- The script is idempotent: re-running `--apply` is a no-op for rows already classified.",
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const mode = parseMode();
  console.error(`[info] Mode: ${mode}`);

  if (mode === "validate") {
    await validateNoUnclassified();
    process.exit(0);
  }

  const results = await classifyAll();

  let writes = 0;
  if (mode === "apply") {
    writes = await applyClassifications(results);
    console.error(`[info] Wrote ${writes} catalog row update(s).`);
  }

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, renderEvidence(results, mode, writes), "utf8");
  console.error(`[info] Evidence report written to ${EVIDENCE_PATH}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
