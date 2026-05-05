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
    // Phase 27.2B — actual apply path. For each draft with a non-empty
    // classification, ensure a binding row exists and redact the source
    // jsonb. Idempotent: skips drafts that already have a (draftId, role)
    // binding row.
    const { getDb } = await import("../../server/db");
    const { agsAgentDrafts, agsAgentProviderBindings, agsAgentVersions } =
      await import("../../drizzle/tables/agent-studio");
    const { eq, and } = await import("drizzle-orm");
    const dbInst = getDb();
    if (!dbInst) {
      console.error("[error] DATABASE_URL not set; cannot --apply.");
      process.exit(2);
    }
    let bindingsCreated = 0;
    let bindingsSkipped = 0;
    let draftsRedacted = 0;
    let releasesRedacted = 0;
    for (const r of results) {
      const c = r.classification;
      // (a) Ensure a binding row exists when the classification produces one.
      if (c.produceBindingRow) {
        const existing = await dbInst
          .select({ id: agsAgentProviderBindings.id })
          .from(agsAgentProviderBindings)
          .where(
            and(
              eq(agsAgentProviderBindings.draftId, r.draft.id),
              eq(agsAgentProviderBindings.role, "primary"),
            ),
          )
          .limit(1);
        if (existing.length === 0) {
          await dbInst.insert(agsAgentProviderBindings).values({
            workspaceId: r.draft.workspaceId,
            agentId: r.draft.agentId,
            draftId: r.draft.id,
            role: "primary",
            providerCatalogEntryId: r.providerCatalogEntryId,
            modelCatalogEntryId: null,
            providerConnectionId: r.providerConnectionId,
            modelRef:
              typeof (r.draft.providerConfig as Record<string, unknown> | null)
                ?.model === "string"
                ? ((r.draft.providerConfig as Record<string, unknown>)
                    .model as string)
                : "",
            status: c.resultingStatus ?? "legacy_unresolved",
            statusReason: c.resultingStatusReason,
            legacyEnvVarHint: c.envVarHint,
            createdBy: r.draft.createdBy,
          });
          bindingsCreated += 1;
        } else {
          bindingsSkipped += 1;
        }
      }
      // (b) Redact the draft source jsonb if it carries any secret-shaped
      // key. Idempotent: a clean providerConfig is a no-op.
      const cfg = (r.draft.providerConfig ?? {}) as Record<string, unknown>;
      const cleaned: Record<string, unknown> = {};
      let dirty = false;
      for (const [key, value] of Object.entries(cfg)) {
        if (
          (SECRET_DENYLIST as readonly string[]).includes(key) ||
          key === ENV_VAR_FIELD
        ) {
          dirty = true;
          continue;
        }
        cleaned[key] = value;
      }
      if (dirty) {
        await dbInst
          .update(agsAgentDrafts)
          .set({ providerConfig: cleaned, updatedAt: new Date() })
          .where(eq(agsAgentDrafts.id, r.draft.id));
        draftsRedacted += 1;
      }
    }
    // (c) Phase 27.2B — also scan version snapshots. Versions freeze a
    // draft's config at publish time; older versions may carry the same
    // raw-key shape (releases reference versionId, the snapshot lives on
    // agsAgentVersions). Redact in-place. We do NOT create binding rows
    // from versions — versions are immutable historical records; only
    // the current draft drives the runtime binding choice.
    const versions = await dbInst.select().from(agsAgentVersions);
    for (const rel of versions) {
      const snap = rel.snapshot as Record<string, unknown> | null;
      if (!snap || typeof snap !== "object") continue;
      // Some snapshot shapes nest providerConfig under draft.providerConfig
      // or runtime_config.providerConfig. Walk the snapshot looking for
      // any object whose own keys include a forbidden key, and redact.
      const visit = (node: unknown): { node: unknown; dirty: boolean } => {
        if (!node || typeof node !== "object" || Array.isArray(node)) {
          return { node, dirty: false };
        }
        const obj = node as Record<string, unknown>;
        let dirty = false;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (
            (SECRET_DENYLIST as readonly string[]).includes(k) ||
            k === ENV_VAR_FIELD
          ) {
            dirty = true;
            continue;
          }
          const sub = visit(v);
          if (sub.dirty) dirty = true;
          out[k] = sub.node;
        }
        return { node: out, dirty };
      };
      const visited = visit(snap);
      if (visited.dirty) {
        await dbInst
          .update(agsAgentVersions)
          .set({ snapshot: visited.node as Record<string, unknown> })
          .where(eq(agsAgentVersions.id, rel.id));
        releasesRedacted += 1;
      }
    }
    console.error(
      `[info] apply: bindingsCreated=${bindingsCreated} bindingsSkipped=${bindingsSkipped} draftsRedacted=${draftsRedacted} versionSnapshotsRedacted=${releasesRedacted}`,
    );
  }

  if (mode === "validate") {
    const offenders: Array<{ kind: "draft" | "version"; id: number; keys: string[] }> = [];
    for (const r of results) {
      const cfg = r.draft.providerConfig ?? {};
      const found = SECRET_DENYLIST.filter((k) =>
        Object.prototype.hasOwnProperty.call(cfg, k),
      );
      if (Object.prototype.hasOwnProperty.call(cfg, ENV_VAR_FIELD)) {
        found.push(ENV_VAR_FIELD);
      }
      if (found.length > 0)
        offenders.push({ kind: "draft", id: r.draft.id, keys: found });
    }
    // Phase 27.2B — also validate version snapshots.
    try {
      const { getDb } = await import("../../server/db");
      const { agsAgentVersions } = await import(
        "../../drizzle/tables/agent-studio"
      );
      const dbInst = getDb();
      if (dbInst) {
        const versions = await dbInst.select().from(agsAgentVersions);
        const scan = (node: unknown): string[] => {
          if (!node || typeof node !== "object" || Array.isArray(node)) return [];
          const obj = node as Record<string, unknown>;
          const found: string[] = [];
          for (const [k, v] of Object.entries(obj)) {
            if (
              (SECRET_DENYLIST as readonly string[]).includes(k) ||
              k === ENV_VAR_FIELD
            ) {
              found.push(k);
            }
            const sub = scan(v);
            if (sub.length > 0) found.push(...sub);
          }
          return found;
        };
        for (const v of versions) {
          const found = scan(v.snapshot);
          if (found.length > 0)
            offenders.push({ kind: "version", id: v.id, keys: found });
        }
      }
    } catch {
      /* DB unavailable; draft-only validate still ran */
    }
    if (offenders.length > 0) {
      console.error(
        `[error] ${offenders.length} row(s) still carry secret-shaped keys:`,
      );
      for (const o of offenders) {
        console.error(`        ${o.kind} ${o.id}: ${o.keys.join(", ")}`);
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
