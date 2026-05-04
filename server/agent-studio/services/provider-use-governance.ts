/**
 * Agent Studio — provider/model use governance.
 *
 * Plan v3 Phase 21. Aggregates the policy gates that fire BEFORE a
 * binding-driven model call leaves the building:
 *
 *   1. **Workspace can use provider** — a workspace-level opt-out
 *      flag (`workspace.allowExternalProviders === false` blocks any
 *      hosted-provider call regardless of binding state).
 *   2. **Workspace can use this connection** — covered by the
 *      Phase 8 binding-eligibility gate; this module re-runs the
 *      check for callers who haven't already.
 *   3. **Agent can use external provider** — an agent-level flag
 *      (`draft.governance.externalProvidersAllowed === false`
 *      blocks the call). Mirrors the workspace flag at agent scope.
 *   4. **Model approved** — the AI Types catalog availability check
 *      (Phase 7 contract). Stubbed permissive in Phase 21 (returns
 *      `model_unknown_in_catalog` only when the binding is missing
 *      a `modelCatalogEntryId`); Phase 25's catalog hardening
 *      tightens this.
 *   5. **Connection active** — covered by Phase 8.
 *   6. **Health acceptable** — covered by Phase 8.
 *   7. **Sensitive-prompt egress policy** — scans the outgoing
 *      messages for obvious credential markers (`-----BEGIN ...
 *      KEY-----`, `sk-` keys, `Bearer `, `password=`) and blocks
 *      with a structured reason. Cheap regex pass; ride the existing
 *      content-scan budget.
 *
 * The module exports a SINGLE composed `evaluateProviderUsePolicy`
 * function that returns a discriminated-union result. Callers that
 * need fine-grained control can invoke individual gates.
 *
 * No credential material crosses the boundary. The function takes
 * the no-secret `AgentProviderBindingPublic` projection plus the
 * outgoing messages.
 */

import type { AgentProviderBindingPublic } from "../bindings";
import type { BindingEligibilityResult } from "../../provider-connections/public-api";
import { getBindingEligibility } from "../../provider-connections/public-api";

export type ProviderUsePolicyReason =
  | "workspace_provider_disallowed"
  | "agent_external_provider_disallowed"
  | "connection_ineligible"
  | "model_unknown_in_catalog"
  | "sensitive_egress_blocked";

export interface ProviderUsePolicyOk {
  ok: true;
}

export interface ProviderUsePolicyDenied {
  ok: false;
  reason: ProviderUsePolicyReason;
  /** Always-safe-to-display detail string. Never carries credentials. */
  detail: string;
  /** Eligibility echo when reason=connection_ineligible (Phase 8 result). */
  eligibility?: BindingEligibilityResult;
}

export type ProviderUsePolicyResult =
  | ProviderUsePolicyOk
  | ProviderUsePolicyDenied;

export interface ProviderUseGovernanceContext {
  /**
   * The resolved binding (no-secret projection). Phase 12's
   * `resolveForRun` is the canonical producer.
   */
  binding: AgentProviderBindingPublic;
  /**
   * Outgoing messages. Used by the sensitive-egress gate. Caller
   * passes `[{role,content}]`-shaped objects; only `content` is
   * scanned.
   */
  messages: ReadonlyArray<{ role: string; content: string }>;
  /**
   * Workspace-level governance flags. Optional — when omitted,
   * defaults to "external providers allowed" (the demo-workspace
   * shape).
   */
  workspace?: {
    allowExternalProviders?: boolean;
  };
  /**
   * Agent-level (draft) governance flags. Optional — same default.
   */
  agent?: {
    externalProvidersAllowed?: boolean;
  };
  /**
   * When true, skip the Phase 8 eligibility re-check (saves a DB
   * roundtrip when the caller has already done it). Default false.
   */
  skipEligibilityCheck?: boolean;
}

// ─── Sensitive-egress detector ───────────────────────────────────────

const SENSITIVE_EGRESS_PATTERNS: ReadonlyArray<RegExp> = [
  // PEM-encoded keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // Common API-key prefixes
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bxoxb-[A-Za-z0-9-]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  // Bearer-prefixed tokens (lowercase + uppercase variants)
  /\bBearer\s+[A-Za-z0-9._-]{20,}/i,
  // Password-style key/value pairs
  /password\s*[:=]\s*\S{8,}/i,
];

export function scanSensitiveEgress(
  messages: ReadonlyArray<{ content: string }>,
): { blocked: boolean; matchedPattern?: string } {
  for (const m of messages) {
    if (typeof m.content !== "string" || m.content.length === 0) continue;
    for (const pat of SENSITIVE_EGRESS_PATTERNS) {
      if (pat.test(m.content)) {
        return { blocked: true, matchedPattern: pat.source };
      }
    }
  }
  return { blocked: false };
}

// ─── Composed evaluator ──────────────────────────────────────────────

export async function evaluateProviderUsePolicy(
  ctx: ProviderUseGovernanceContext,
): Promise<ProviderUsePolicyResult> {
  // Gate 1: workspace can use provider.
  if (ctx.workspace?.allowExternalProviders === false) {
    return {
      ok: false,
      reason: "workspace_provider_disallowed",
      detail:
        "This workspace has external providers disabled. Enable in workspace governance settings, or use a local-provider binding.",
    };
  }

  // Gate 3: agent can use external provider.
  if (ctx.agent?.externalProvidersAllowed === false) {
    return {
      ok: false,
      reason: "agent_external_provider_disallowed",
      detail:
        "This agent has external providers disabled in its draft governance config.",
    };
  }

  // Gate 5/6: connection active + health acceptable (Phase 8).
  // Skipped when caller already did it, e.g. resolveForRun callers.
  if (
    !ctx.skipEligibilityCheck &&
    ctx.binding.providerConnectionId !== null
  ) {
    const eligibility = await getBindingEligibility({
      providerConnectionId: ctx.binding.providerConnectionId,
    });
    if (!eligibility.ok) {
      return {
        ok: false,
        reason: "connection_ineligible",
        detail: `Provider Connection #${ctx.binding.providerConnectionId} is not eligible: ${eligibility.reason ?? "unknown"}`,
        eligibility,
      };
    }
  }

  // Gate 4: model approved (catalog availability — stubbed
  // permissive in Phase 21; only blocks when the binding has no
  // catalog ref at all).
  if (
    ctx.binding.modelCatalogEntryId === null &&
    ctx.binding.providerConnectionId !== null
  ) {
    return {
      ok: false,
      reason: "model_unknown_in_catalog",
      detail:
        "Binding has no AI Types catalog entry for the model. Re-bind through the picker so the catalog ref is captured.",
    };
  }

  // Gate 7: sensitive-prompt egress scan.
  const egress = scanSensitiveEgress(ctx.messages);
  if (egress.blocked) {
    return {
      ok: false,
      reason: "sensitive_egress_blocked",
      detail:
        "Outgoing message matches a sensitive-content pattern (credentials/keys/passwords). Redact the message before retrying.",
    };
  }

  return { ok: true };
}
