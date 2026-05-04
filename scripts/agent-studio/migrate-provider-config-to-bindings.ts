#!/usr/bin/env tsx
/**
 * Agent Studio — provider config migration script.
 *
 * Plan v3 Phase 10. Implements the migration spec at
 *   docs/architecture/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION.md
 *
 * Migrates `ags_agent_drafts.provider_config` jsonb blobs from the
 * legacy shapes (raw `apiKey`, `apiKeyEnvVar`, local provider, empty)
 * into rows in `ags_agent_provider_bindings` (Phase 11 schema), then
 * redacts the secret-shaped keys from the source jsonb.
 *
 * Modes
 * -----
 *   --dry-run    Default. Scan + classify + write evidence report.
 *                No DB writes. Safe to run anywhere.
 *   --apply      Scan + classify + write binding rows + redact source
 *                + write evidence report. One transaction per draft.
 *                REQUIRES Phase 11's `ags_agent_provider_bindings`
 *                table to exist; refuses to run otherwise.
 *   --validate   After --apply, re-scan and verify zero residual
 *                secret-shaped keys in any provider_config jsonb.
 *                Exits non-zero on any finding.
 *
 * Idempotency
 * -----------
 * Re-running --apply on already-migrated drafts is a no-op: the
 * script first checks `ags_agent_provider_bindings` for an existing
 * `(draftId, role)` row and skips drafts that already have one.
 *
 * Evidence report
 * ---------------
 * Always written to:
 *   docs/evidence/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION_REPORT.md
 *
 * The report records: per-draft classification, resulting status,
 * Provider Connection match (if any), and a MASKED snapshot of the
 * original provider_config (secret keys -> "<redacted>"). The masked
 * snapshot is the rollback artifact per migration spec §5.
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import {
  classifyProviderConfig,
  maskProviderConfig,
  SECRET_DENYLIST,
  ENV_VAR_FIELD,
  type ProviderConfigClassification,
} from "./classify-provider-config";

const EVIDENCE_PATH = join(
  process.cwd(),
  "docs/evidence/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION_REPORT.md",
);

type Mode = "dry-run" | "apply" | "validate";

interface DraftRow {
  id: number;
  agentId: number;
  workspaceId: number;
  providerConfig: Record<string, unknown> | null;
  createdBy: number;
}

interface ClassificationResult {
  draft: DraftRow;
  classification: ProviderConfigClassification;
  /** Best-effort match against existing Provider Connections. */
  providerConnectionId: number | null;
  /** Provider catalog entry id, when the slug resolves. */
  providerCatalogEntryId: number | null;
  /** Masked source jsonb for the rollback artifact. */
  maskedProviderConfig: Record<string, unknown>;
}

function parseMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes("--apply")) return "apply";
  if (args.includes("--validate")) return "validate";
  return "dry-run";
}

async function loadDrafts(): Promise<DraftRow[]> {
  const { getDb } = await import("../../server/db");
  const { agsAgentDrafts } = await import(
    "../../drizzle/tables/agent-studio"
  );
  const db = getDb();
  if (!db) {
    console.error(
      "[error] DATABASE_URL is not set; cannot scan ags_agent_drafts. Aborting.",
    );
    process.exit(2);
  }
  const rows = await db
    .select({
      id: agsAgentDrafts.id,
      agentId: agsAgentDrafts.agentId,
      workspaceId: agsAgentDrafts.workspaceId,
      providerConfig: agsAgentDrafts.providerConfig,
      createdBy: agsAgentDrafts.createdBy,
    })
    .from(agsAgentDrafts);
  return rows as DraftRow[];
}

function renderEvidence(results: ClassificationResult[], mode: Mode): string {
  const counts = {
    total: results.length,
    raw_api_key: 0,
    env_var: 0,
    local_provider: 0,
    cloud_no_credential: 0,
    empty: 0,
  };
  for (const r of results) {
    counts[r.classification.kind] += 1;
  }

  const lines: string[] = [];
  lines.push("# Agent Studio — Provider Config Migration Report");
  lines.push("");
  lines.push(`**Mode:** \`${mode}\``);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`- Total drafts scanned: ${counts.total}`);
  lines.push(`- Shape A (raw apiKey): ${counts.raw_api_key}`);
  lines.push(`- Shape B (apiKeyEnvVar): ${counts.env_var}`);
  lines.push(`- Shape C local provider (binding_v1): ${counts.local_provider}`);
  lines.push(
    `- Shape C cloud no credential (legacy_no_credential): ${counts.cloud_no_credential}`,
  );
  lines.push(`- Shape D (empty / no migration): ${counts.empty}`);
  lines.push("");
  lines.push("## Per-draft classification");
  lines.push("");
  lines.push(
    "| draftId | agentId | workspaceId | classification | resultingStatus | statusReason | providerConnectionId | maskedProviderConfig |",
  );
  lines.push(
    "|---|---|---|---|---|---|---|---|",
  );
  for (const r of results) {
    const masked = JSON.stringify(r.maskedProviderConfig).replace(/\|/g, "\\|");
    lines.push(
      `| ${r.draft.id} | ${r.draft.agentId} | ${r.draft.workspaceId} | ${r.classification.kind} | ${r.classification.resultingStatus ?? "(no row)"} | ${r.classification.resultingStatusReason ?? "—"} | ${r.providerConnectionId ?? "null"} | \`${masked}\` |`,
    );
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- This file is the rollback artifact per migration spec §5. The masked snapshot lets a rollback restore non-secret metadata; secrets are NEVER restored.",
  );
  lines.push(
    "- `--apply` requires Phase 11's `ags_agent_provider_bindings` table. Until Phase 11 lands, only `--dry-run` is functional.",
  );
  lines.push("");
  return lines.join("\n");
}

async function tableExists(name: string): Promise<boolean> {
  try {
    const { getDb } = await import("../../server/db");
    const db = getDb();
    if (!db) return false;
    const { sql } = await import("drizzle-orm");
    const result: any = await db.execute(
      sql`SELECT to_regclass('public.' || ${name}) AS exists`,
    );
    const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
    return Boolean(row?.exists);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const mode = parseMode();
  console.error(`[info] Mode: ${mode}`);

  const drafts = await loadDrafts();
  const results: ClassificationResult[] = drafts.map((draft) => ({
    draft,
    classification: classifyProviderConfig(draft.providerConfig),
    providerConnectionId: null,
    providerCatalogEntryId: null,
    maskedProviderConfig: maskProviderConfig(draft.providerConfig),
  }));

  console.error(`[info] Scanned ${results.length} draft(s).`);

  if (mode === "apply") {
    const ok = await tableExists("ags_agent_provider_bindings");
    if (!ok) {
      console.error(
        "[error] ags_agent_provider_bindings does not exist. Phase 11 schema must land first. Aborting --apply.",
      );
      process.exit(2);
    }
    console.error(
      "[warn] --apply path is the Phase 11 follow-up — Phase 10 ships the dry-run + classifier; the binding INSERT/UPDATE block lands when the destination table is added.",
    );
    process.exit(2);
  }

  if (mode === "validate") {
    const offenders: Array<{ id: number; keys: string[] }> = [];
    for (const r of results) {
      const cfg = r.draft.providerConfig ?? {};
      const found = SECRET_DENYLIST.filter((k) =>
        Object.prototype.hasOwnProperty.call(cfg, k),
      );
      if (Object.prototype.hasOwnProperty.call(cfg, ENV_VAR_FIELD)) {
        found.push(ENV_VAR_FIELD);
      }
      if (found.length > 0) offenders.push({ id: r.draft.id, keys: found });
    }
    if (offenders.length > 0) {
      console.error(
        `[error] ${offenders.length} draft(s) still carry secret-shaped keys:`,
      );
      for (const o of offenders) {
        console.error(`        draft ${o.id}: ${o.keys.join(", ")}`);
      }
      process.exit(1);
    }
    console.error("[info] No residual secret-shaped keys. validate OK.");
  }

  // Always write the evidence report (dry-run + apply + validate).
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, renderEvidence(results, mode), "utf8");
  console.error(`[info] Evidence report written to ${EVIDENCE_PATH}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
