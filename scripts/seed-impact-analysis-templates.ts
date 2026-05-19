/**
 * scripts/seed-impact-analysis-templates.ts
 *
 * Slice 29 of the no-deferral continuation catalogue (2026-05-19).
 *
 * Operator-callable one-shot seed that writes the per-kind Impact
 * Analysis Cypher templates (declared in
 * `services/graph-lens/impact-analysis-templates.ts`) into
 * `ags_query_templates`. Idempotent — re-running the script is safe
 * because the `template_key` column is unique and the upsert path
 * uses `ON CONFLICT (template_key) DO UPDATE`.
 *
 * Usage:
 *
 *   pnpm tsx scripts/seed-impact-analysis-templates.ts
 *
 * Requires `DATABASE_URL_ASDB` (or whatever the ASDB connection env
 * var is on the target). Prints the inserted / updated row count.
 */

import { sql } from "drizzle-orm";
import { getAsDb } from "../server/agent-studio/db/connection.js";
import { agsQueryTemplates } from "../drizzle/tables/agent-studio-graph-skill.js";
import { buildImpactAnalysisTemplateSeedRows } from "../server/agent-studio/services/graph-lens/impact-analysis-templates.js";

async function main(): Promise<void> {
  const rows = buildImpactAnalysisTemplateSeedRows();
  if (rows.length === 0) {
    console.log("[seed-impact-analysis-templates] no rows to seed");
    return;
  }

  const db = getAsDb();
  if (!db) {
    throw new Error(
      "[seed-impact-analysis-templates] ASDB connection unavailable — set DATABASE_URL_ASDB",
    );
  }

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    // Probe before upsert so we can report inserted vs updated counts.
    const existing = await db
      .select({ id: agsQueryTemplates.id })
      .from(agsQueryTemplates)
      .where(sql`${agsQueryTemplates.templateKey} = ${row.templateKey}`)
      .limit(1);
    const wasInsert = existing.length === 0;
    await db
      .insert(agsQueryTemplates)
      .values({
        templateKey: row.templateKey,
        name: row.name,
        description: row.description,
        graphBackend: row.graphBackend,
        queryLanguage: row.queryLanguage,
        cypherBody: row.cypherBody,
        parameterSchema: row.parameterSchema,
        permissionFilterRequired: row.permissionFilterRequired,
        maxDepth: row.maxDepth,
        maxResults: row.maxResults,
        timeoutMs: row.timeoutMs,
        readOnly: row.readOnly,
        riskLevel: row.riskLevel,
      })
      .onConflictDoUpdate({
        target: agsQueryTemplates.templateKey,
        set: {
          name: row.name,
          description: row.description,
          graphBackend: row.graphBackend,
          queryLanguage: row.queryLanguage,
          cypherBody: row.cypherBody,
          parameterSchema: row.parameterSchema,
          permissionFilterRequired: row.permissionFilterRequired,
          maxDepth: row.maxDepth,
          maxResults: row.maxResults,
          timeoutMs: row.timeoutMs,
          readOnly: row.readOnly,
          riskLevel: row.riskLevel,
          updatedAt: new Date(),
        },
      });
    if (wasInsert) inserted++;
    else updated++;
  }

  console.log(
    `[seed-impact-analysis-templates] inserted=${inserted} updated=${updated} total=${rows.length}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-impact-analysis-templates] failed:", err);
    process.exit(1);
  });
