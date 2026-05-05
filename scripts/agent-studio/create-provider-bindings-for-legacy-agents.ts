#!/usr/bin/env tsx
/**
 * Phase 27.5a — Migration helper for unbound legacy agents.
 *
 * Companion to `migrate-provider-config-to-bindings.ts`. Where that
 * script handles `ags_agent_drafts.providerConfig` cleanup (LK-01),
 * this script tackles the **runtime** side: legacy agents whose drafts
 * already contain a sane non-secret config (provider, model, etc.) but
 * who do NOT yet have a corresponding `ags_agent_provider_bindings`
 * row. These are the agents that would have hit the legacy
 * `runChatWithTools` / `OpenAIProvider` fallback before Phase 27.5
 * removed it.
 *
 * Behavior:
 *   - Scans `ags_agent_drafts` for rows whose providerConfig has a
 *     `provider` slug AND no matching `ags_agent_provider_bindings`
 *     row (status="binding_v1") for that draft.
 *   - For each match, attempts to find an active Provider Connection
 *     (`provider_connections` row with `lifecycle_status='active'` and
 *     a matching provider type/slug).
 *   - If found → creates a `binding_v1` row pointing at it.
 *   - If not found → creates a `legacy_unresolved` row with a clear
 *     statusReason so the operator knows to bind through the Phase 14
 *     picker.
 *   - Idempotent: skips drafts that already have a `(draftId, role='primary')`
 *     binding row.
 *
 * Modes:
 *   --dry-run   (default) Prints what it would do, no DB writes.
 *   --apply     Performs the writes.
 *
 * This helper is part of Phase 27.5a. The actual fallback REMOVAL in
 * `services/chat.ts` shipped in Phase 27.5; this helper exists so that
 * environments which still have unbound agents can migrate them to
 * bindings before discovering the new "binding_required" error in
 * production.
 *
 * Phase 27.5b will delete this script once no environment depends on it.
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

type Mode = "dry-run" | "apply";

interface DraftRow {
  id: number;
  agentId: number;
  workspaceId: number;
  createdBy: number;
  providerConfig: Record<string, unknown> | null;
}

interface ResolvedAction {
  draft: DraftRow;
  decision:
    | "skip_already_has_binding"
    | "skip_empty_provider_config"
    | "create_binding_v1"
    | "create_legacy_unresolved";
  providerSlug: string | null;
  modelRef: string | null;
  providerCatalogEntryId: number | null;
  providerConnectionId: number | null;
  reason: string | null;
}

const EVIDENCE_PATH = join(
  process.cwd(),
  "docs/evidence/provider-model-binding/CREATE_PROVIDER_BINDINGS_FOR_LEGACY_AGENTS_REPORT.md",
);

function parseMode(): Mode {
  return process.argv.includes("--apply") ? "apply" : "dry-run";
}

async function main(): Promise<void> {
  const mode = parseMode();
  console.error(`[info] Mode: ${mode}`);

  const { getDb } = await import("../../server/db");
  const {
    agsAgentDrafts,
    agsAgentProviderBindings,
  } = await import("../../drizzle/tables/agent-studio");
  const { providerConnections, providerCatalogEntries } = await import(
    "../../drizzle/tables/provider-connections"
  );
  const { eq, and } = await import("drizzle-orm");
  const dbInst = getDb();
  if (!dbInst) {
    console.error(
      "[error] DATABASE_URL is not set; cannot scan ags_agent_drafts. Aborting.",
    );
    process.exit(2);
  }

  const drafts = (await dbInst
    .select({
      id: agsAgentDrafts.id,
      agentId: agsAgentDrafts.agentId,
      workspaceId: agsAgentDrafts.workspaceId,
      createdBy: agsAgentDrafts.createdBy,
      providerConfig: agsAgentDrafts.providerConfig,
    })
    .from(agsAgentDrafts)) as DraftRow[];

  console.error(`[info] Scanned ${drafts.length} draft(s).`);

  const actions: ResolvedAction[] = [];

  for (const draft of drafts) {
    const cfg = (draft.providerConfig ?? {}) as Record<string, unknown>;
    const providerSlug =
      typeof cfg.provider === "string" ? cfg.provider.toLowerCase() : null;
    const modelRef = typeof cfg.model === "string" ? cfg.model : null;

    // Already-bound check.
    const existing = await dbInst
      .select({ id: agsAgentProviderBindings.id })
      .from(agsAgentProviderBindings)
      .where(
        and(
          eq(agsAgentProviderBindings.draftId, draft.id),
          eq(agsAgentProviderBindings.role, "primary"),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      actions.push({
        draft,
        decision: "skip_already_has_binding",
        providerSlug,
        modelRef,
        providerCatalogEntryId: null,
        providerConnectionId: null,
        reason: null,
      });
      continue;
    }

    if (!providerSlug) {
      actions.push({
        draft,
        decision: "skip_empty_provider_config",
        providerSlug: null,
        modelRef: null,
        providerCatalogEntryId: null,
        providerConnectionId: null,
        reason: "providerConfig has no `provider` slug",
      });
      continue;
    }

    // Try to resolve a provider catalog entry for this slug.
    const pce = await dbInst
      .select({ id: providerCatalogEntries.id })
      .from(providerCatalogEntries)
      .where(eq(providerCatalogEntries.slug, providerSlug))
      .limit(1);
    const providerCatalogEntryId = pce[0]?.id ?? null;

    // Try to resolve an active Provider Connection in the same workspace
    // for that provider catalog entry.
    let providerConnectionId: number | null = null;
    if (providerCatalogEntryId !== null) {
      const conns = await dbInst
        .select({
          id: providerConnections.id,
          lifecycleStatus: providerConnections.lifecycleStatus,
        })
        .from(providerConnections)
        .where(
          and(
            eq(providerConnections.workspaceId, draft.workspaceId),
            eq(providerConnections.providerCatalogEntryId, providerCatalogEntryId),
          ),
        );
      const active = conns.find((c) => c.lifecycleStatus === "active");
      providerConnectionId = active?.id ?? null;
    }

    if (providerConnectionId !== null && modelRef) {
      actions.push({
        draft,
        decision: "create_binding_v1",
        providerSlug,
        modelRef,
        providerCatalogEntryId,
        providerConnectionId,
        reason: null,
      });
    } else {
      actions.push({
        draft,
        decision: "create_legacy_unresolved",
        providerSlug,
        modelRef,
        providerCatalogEntryId,
        providerConnectionId: null,
        reason:
          providerConnectionId === null
            ? `No active Provider Connection found for slug=${providerSlug} in workspace=${draft.workspaceId}`
            : "providerConfig has no `model` field",
      });
    }
  }

  // Counts
  const counts = {
    total: actions.length,
    skip_already_has_binding: 0,
    skip_empty_provider_config: 0,
    create_binding_v1: 0,
    create_legacy_unresolved: 0,
  };
  for (const a of actions) counts[a.decision] += 1;

  // Apply
  if (mode === "apply") {
    let written = 0;
    for (const a of actions) {
      if (
        a.decision !== "create_binding_v1" &&
        a.decision !== "create_legacy_unresolved"
      ) {
        continue;
      }
      const isV1 = a.decision === "create_binding_v1";
      await dbInst.insert(agsAgentProviderBindings).values({
        workspaceId: a.draft.workspaceId,
        agentId: a.draft.agentId,
        draftId: a.draft.id,
        role: "primary",
        providerCatalogEntryId: a.providerCatalogEntryId,
        modelCatalogEntryId: null,
        providerConnectionId: a.providerConnectionId,
        modelRef: a.modelRef ?? "",
        status: isV1 ? "binding_v1" : "legacy_unresolved",
        statusReason: isV1 ? null : "migration_skipped",
        legacyEnvVarHint: null,
        createdBy: a.draft.createdBy,
      });
      written += 1;
    }
    console.error(`[info] apply: rowsWritten=${written}`);
  }

  // Evidence report
  const lines: string[] = [];
  lines.push("# Phase 27.5a — Create Provider Bindings for Legacy Agents");
  lines.push("");
  lines.push(`**Mode:** \`${mode}\``);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`- Total drafts scanned: ${counts.total}`);
  lines.push(`- skip_already_has_binding: ${counts.skip_already_has_binding}`);
  lines.push(`- skip_empty_provider_config: ${counts.skip_empty_provider_config}`);
  lines.push(`- create_binding_v1: ${counts.create_binding_v1}`);
  lines.push(`- create_legacy_unresolved: ${counts.create_legacy_unresolved}`);
  lines.push("");
  lines.push("## Per-draft actions");
  lines.push("");
  lines.push(
    "| draftId | agentId | workspaceId | decision | providerSlug | modelRef | providerConnectionId | reason |",
  );
  lines.push(
    "|---|---|---|---|---|---|---|---|",
  );
  for (const a of actions) {
    lines.push(
      `| ${a.draft.id} | ${a.draft.agentId} | ${a.draft.workspaceId} | ${a.decision} | ${a.providerSlug ?? "—"} | ${a.modelRef ?? "—"} | ${a.providerConnectionId ?? "—"} | ${a.reason ?? ""} |`,
    );
  }
  lines.push("");
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, lines.join("\n"), "utf8");
  console.error(`[info] Evidence report written to ${EVIDENCE_PATH}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
