/**
 * Effective chat-binding resolver — Option-B PR 4 (2026-05-23).
 *
 * Two-step binding resolution for Agent Studio chat paths, matching
 * the D-PR-4 pattern that `server/chat/stream.ts:41-119` already
 * implements for the legacy chat endpoint:
 *
 *   1. Per-agent binding (`ags_agent_provider_bindings` keyed on
 *      `(draftId, role="primary")`) — the explicit per-agent override.
 *   2. Fall back to workspace-default binding
 *      (`ags_workspace_default_provider_bindings` keyed on
 *      `(workspaceId, role="chat")`) — the "set once for all"
 *      surface defined by D-WDB-1..8 in
 *      `docs/architecture/provider-model-binding/WORKSPACE_DEFAULT_BINDING_DECISION.md`.
 *
 * Per D-WDB-3: "Caller decides whether to refuse the call (preferred)
 * or fall back to a system default. There is no automatic system-
 * default fallback inside this primitive — explicit-over-implicit
 * avoids the 'why is my call going to the wrong provider?' debug
 * class." This resolver is the *caller decision* for Agent Studio
 * chat — both `services/chat.ts:sendChatMessage` and
 * `chat-stream.ts` consume it and refuse with the existing
 * `binding_required` typed error only when both layers miss.
 *
 * Returns `null` when both layers miss. Returns a fully-populated
 * `AgentProviderBindingPublic` shape so downstream code paths
 * (governance, model-access, tool-loop) don't need to branch on
 * "where did this binding come from?" — the `source` field is
 * available for callers that DO want to log or audit the path.
 */

import { and, eq, or } from "drizzle-orm";
import {
  getAgentProviderBinding,
  type AgentProviderBindingPublic,
  type AgentProviderBindingStatus,
} from "../bindings";
import { resolveWorkspaceDefaultBinding } from "../workspace-default-bindings";
import { getDb } from "../../db";
import { catalogEntries } from "../../../drizzle/schema";
import { aiTypeModels } from "../../../drizzle/tables/ai-types";

export type ChatBindingSource = "per-agent" | "workspace-default";

export interface EffectiveChatBindingResult {
  /** Provider-binding shape downstream code can use uniformly. */
  binding: AgentProviderBindingPublic;
  /** Where the binding came from — useful for governance/audit logs. */
  source: ChatBindingSource;
}

export interface ResolveEffectiveChatBindingInput {
  draftId: number;
  workspaceId: number;
}

/**
 * Try per-agent first; fall back to workspace-default for `role="chat"`.
 * Returns `null` when both miss.
 *
 * A binding is "usable" (the per-agent fast path) only when:
 *   - status === "binding_v1"
 *   - providerConnectionId !== null
 *
 * Anything else (`legacy_unresolved`, `disabled`, `archived`,
 * local-provider stubs) falls through to the workspace-default
 * lookup. That matches the prior `canUseBindingPath` gate in
 * `services/chat.ts:1260-1263` — the workspace-default is the
 * second-chance, not a replacement for the explicit-override fast
 * path.
 */
export async function resolveEffectiveChatBinding(
  input: ResolveEffectiveChatBindingInput,
): Promise<EffectiveChatBindingResult | null> {
  // ── Step (I): per-agent binding ───────────────────────────────────
  const perAgent = await getAgentProviderBinding(input.draftId, "primary");
  if (
    perAgent !== null &&
    perAgent.status === "binding_v1" &&
    perAgent.providerConnectionId !== null
  ) {
    return { binding: perAgent, source: "per-agent" };
  }

  // ── Step (II): workspace-default (role="chat") ────────────────────
  const wsDefault = await resolveWorkspaceDefaultBinding({
    workspaceId: input.workspaceId,
    role: "chat",
  });
  if (
    wsDefault !== null &&
    wsDefault.ok &&
    wsDefault.providerConnectionId !== null
  ) {
    // Resolve the model's `catalog_entries.id` from its modelRef so
    // the synthesized binding satisfies Gate 4 of
    // `provider-use-governance.ts:172-185`
    // (`model_unknown_in_catalog` fires when modelCatalogEntryId is
    // null). Match `ai_type_models.apiModelId` (the canonical model
    // identifier) OR `name` as a fallback. Filtered to the canonical
    // `sourceType="ai_type_model"` per the 2026-05-23 extension to
    // `CATALOG_SOURCE_MAPPING.md`. Null-tolerant: an unresolved
    // model catalog entry doesn't block synthesis — it just means
    // the chat path will hit Gate 4 with a clear error, matching
    // the pre-PR-4 behavior for any legacy per-agent binding with
    // a missing modelCatalogEntryId.
    const db = getDb();
    let modelCatalogEntryId: number | null = null;
    if (db) {
      const rows = await db
        .select({ id: catalogEntries.id })
        .from(catalogEntries)
        .innerJoin(
          aiTypeModels,
          eq(aiTypeModels.id, catalogEntries.sourceId),
        )
        .where(
          and(
            eq(catalogEntries.entryType, "model"),
            eq(catalogEntries.sourceType, "ai_type_model"),
            or(
              eq(aiTypeModels.apiModelId, wsDefault.modelRef),
              eq(aiTypeModels.name, wsDefault.modelRef),
            ),
          ),
        )
        .limit(1);
      modelCatalogEntryId = rows[0]?.id ?? null;
    }

    const now = new Date();
    const synthesized: AgentProviderBindingPublic = {
      id: 0, // synthesized — no row in ags_agent_provider_bindings
      workspaceId: wsDefault.workspaceId,
      agentId: 0, // not consumed by the chat path
      draftId: input.draftId,
      role: "primary",
      providerCatalogEntryId: wsDefault.providerCatalogEntryId,
      modelCatalogEntryId,
      providerConnectionId: wsDefault.providerConnectionId,
      modelRef: wsDefault.modelRef,
      status: "binding_v1" as AgentProviderBindingStatus,
      statusReason: null,
      legacyEnvVarHint: null,
      // The wsDefault primitive has already passed eligibility
      // gating (`getBindingEligibility` inside
      // `resolveWorkspaceDefaultBinding`); mark as freshly-validated
      // so downstream staleness checks (Phase 15) don't bail.
      lastValidatedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    return { binding: synthesized, source: "workspace-default" };
  }

  return null;
}
