/**
 * Agent Studio — binding-driven test run.
 *
 * Plan v3 Phase 16. The first live integration of OpenRouter's Model
 * Access from outside the OpenRouter module: `resolveForRun` produces
 * the no-secret reference projection, then `openRouter.modelAccess.execute`
 * is invoked through the platform gateway.
 *
 * Why a new service (rather than retrofitting `services/simulation.ts`):
 *   - Phase 16's contract is "test runs through Model Access" — a
 *     binding-driven, credentials-never-touched path. The legacy
 *     simulation service still reads `endpoint.apiKey` (Phase 17 / LR-01
 *     will replace that). Keeping the new path on its own service makes
 *     the boundary clear in code review and doesn't entangle the LR-01
 *     removal with the Phase 16 wiring.
 *
 * Failure surface:
 *   - `binding_not_found`, `legacy_unresolved`, `binding_disabled`,
 *     `provider_connection_ineligible`, `validation_stale` — surfaced
 *     verbatim from `resolveForRun`. Phase 15's staleness gate flows
 *     through here.
 *   - `model_access_failed` — Model Access returned `status="error"`
 *     or threw. The detail (latencyMs, error string) is preserved so
 *     the UI/tests can render it.
 *
 * Credential boundary:
 *   - This file MUST NOT import the Provider Connections internal
 *     credential resolver. The check
 *     `scripts/check-provider-credential-resolver-boundary.ts`
 *     enforces D2 — only `server/openrouter/model-access/` may.
 */

import { resolveForRun } from "../bindings";
import type { BindingPolicyReason, ResolveForRunResult } from "../bindings";
import { gatewayCall } from "../../platform/modules/module-gateway";
import type {
  ModelAccessExecuteInput,
  ModelAccessIntent,
  ModelAccessMessage,
  ModelAccessResult,
} from "../../openrouter/model-access/types";
import {
  evaluateProviderUsePolicy,
  type ProviderUsePolicyReason,
} from "./provider-use-governance";

/**
 * Reason a test-run could not produce output. Either a binding-policy
 * problem (bubbled from `resolveForRun`), a Phase 21 provider-use
 * governance denial, or a Model Access execution failure.
 */
export type TestRunBindingFailureReason =
  | BindingPolicyReason
  | ProviderUsePolicyReason
  | "model_access_failed";

export interface RunTestWithBindingInput {
  draftId: number;
  /** Defaults to "primary". */
  role?: string;
  /**
   * Workspace this run belongs to. Stamped onto the Model Access
   * call for governance/telemetry correlation.
   */
  workspaceId: number;
  /** Actor performing the test run; passed through to Model Access. */
  actorId: number;
  /** Free-form prompt — sent as the `user` message to the model. */
  prompt: string;
  /** Optional system prompt. */
  systemPrompt?: string;
  /**
   * Defaults to "agent-test". The `role` argument on the binding is
   * separate (Plan v3 Fix N4) — `intent` lives on the call, not the
   * binding.
   */
  intent?: ModelAccessIntent;
  temperature?: number;
  tokenBudget?: number;
  correlationId?: string;
}

export interface RunTestWithBindingSuccess {
  ok: true;
  output: string;
  latencyMs: number;
  usage?: ModelAccessResult["usage"];
  /** Echoed refs so the UI / persistence layer can correlate. */
  providerConnectionId: number | null;
  providerCatalogEntryId: number | null;
  modelCatalogEntryId: number | null;
  modelRef: string;
  correlationId?: string;
}

export interface RunTestWithBindingFailure {
  ok: false;
  reason: TestRunBindingFailureReason;
  /** Human-readable failure detail. Always safe to show; never carries credentials. */
  detail?: string;
  /** Populated when `reason="model_access_failed"`. */
  latencyMs?: number;
  /**
   * The Model Access result echoed verbatim when the failure came
   * from `openRouter.modelAccess.execute`. Useful for assertions
   * and debugging; does not carry credentials.
   */
  modelAccessResult?: ModelAccessResult;
}

export type RunTestWithBindingResult =
  | RunTestWithBindingSuccess
  | RunTestWithBindingFailure;

/**
 * Run a single binding-driven test. Loads the binding, gates on
 * Phase 15's staleness rule via `resolveForRun`, then calls
 * `openRouter.modelAccess.execute` through the gateway.
 *
 * The local-provider case (`providerConnection=null`) is REJECTED
 * for now with `reason="provider_connection_ineligible"` — Model
 * Access does not yet have a local-provider adapter (Ollama / llama.cpp).
 * Phase 17/18 may extend this.
 */
export async function runTestWithBinding(
  input: RunTestWithBindingInput,
): Promise<RunTestWithBindingResult> {
  const role = input.role ?? "primary";

  const resolved: ResolveForRunResult = await resolveForRun({
    draftId: input.draftId,
    role,
  });

  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason ?? "binding_not_found",
      detail: `Binding for draftId=${input.draftId} role=${role} is not eligible: ${resolved.reason ?? "unknown"}`,
    };
  }

  if (resolved.providerConnection === null) {
    // Local-provider binding — Model Access does not yet adapt local
    // providers. Surface as ineligible so the caller can fall back
    // to the legacy path or display the "configure a hosted provider"
    // hint. Tracked separately from the staleness branch.
    return {
      ok: false,
      reason: "provider_connection_ineligible",
      detail:
        "Local-provider bindings are not supported by Model Access in Phase 16. Bind a hosted provider connection or wait for Phase 17/18.",
    };
  }

  const messages: ModelAccessMessage[] = [];
  if (input.systemPrompt && input.systemPrompt.length > 0) {
    messages.push({ role: "system", content: input.systemPrompt });
  }
  messages.push({ role: "user", content: input.prompt });

  // Plan v3 Phase 21 — provider-use governance gates.
  // resolveForRun (Phase 12) already checks Phase 8 eligibility, so
  // we pass `skipEligibilityCheck: true`.
  const policy = await evaluateProviderUsePolicy({
    binding: resolved.binding,
    messages,
    skipEligibilityCheck: true,
  });
  if (policy.ok === false) {
    return {
      ok: false,
      reason: policy.reason,
      detail: policy.detail,
    };
  }

  const executeInput: ModelAccessExecuteInput = {
    providerConnectionId: resolved.providerConnection.providerConnectionId,
    modelRef: resolved.binding.modelRef,
    messages,
    intent: input.intent ?? "agent-test",
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    temperature: input.temperature,
    tokenBudget: input.tokenBudget,
    correlationId: input.correlationId,
  };

  let modelAccessResult: ModelAccessResult;
  try {
    modelAccessResult = await gatewayCall<
      ModelAccessExecuteInput,
      ModelAccessResult
    >({
      ctx: {
        sourceModule: "agentStudio",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.execute",
        actorId: input.actorId,
        workspaceId: input.workspaceId,
      },
      input: executeInput,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "model_access_failed",
      detail,
    };
  }

  if (modelAccessResult.status !== "ok") {
    return {
      ok: false,
      reason: "model_access_failed",
      detail: modelAccessResult.error ?? "Model Access returned status=error",
      latencyMs: modelAccessResult.latencyMs,
      modelAccessResult,
    };
  }

  return {
    ok: true,
    output: modelAccessResult.output ?? "",
    latencyMs: modelAccessResult.latencyMs,
    usage: modelAccessResult.usage,
    providerConnectionId: resolved.providerConnection.providerConnectionId,
    providerCatalogEntryId:
      resolved.binding.providerCatalogEntryId,
    modelCatalogEntryId: resolved.binding.modelCatalogEntryId,
    modelRef: resolved.binding.modelRef,
    correlationId: modelAccessResult.correlationId,
  };
}
