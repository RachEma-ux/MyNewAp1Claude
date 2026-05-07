/**
 * Provider Hub Router — Unified LLM Gateway for Operators.
 *
 * ALL operator LLM calls MUST go through this module. No operator may
 * call OpenAI / Ollama / Anthropic directly.
 *
 * **PMB Phase 29.5 (LR-04 closure):** the previous local provider-chain
 * (`getOpenAIClient` + `getOllamaClient`, both reading the OpenAI env
 * var directly) is gone. Provider selection now lives at the workspace
 * level — each
 * workspace's `classifier` default binding (table:
 * `ags_workspace_default_provider_bindings`, role: `"classifier"`) names
 * the provider connection + model used by every operator call from
 * that workspace.
 *
 * Migration shape:
 *   1. `callProviderHub` takes a `workspaceId` on its request.
 *   2. Resolves the workspace's classifier default via
 *      `resolveWorkspaceDefaultBinding`.
 *   3. Dispatches through `gatewayCall(openRouter.modelAccess.execute)`
 *      with `intent: "system-internal"` (29.4a — operator runtime is
 *      infrastructure, not user-attributed; receipt policy exempts it).
 *   4. The per-operator `OPERATOR_MODEL_CONSTRAINTS` (max tokens,
 *      max temperature) are preserved as governance guardrails. The
 *      `allowedModels` list is dropped: the workspace admin owns model
 *      selection via the binding. If a workspace admin configures a
 *      model that doesn't fit an operator's risk profile, the fix is
 *      changing the binding — not adding hard-coded model lists here.
 *   5. JSON-validation retry loop is preserved — the LLM may not
 *      always return valid JSON, and the hub retries once with a
 *      stricter system prompt.
 *
 * Failure modes (typed via `OperatorBindingError`):
 *   - `workspace_required` — no `workspaceId` on the request
 *   - `default_not_set` — workspace has no classifier default
 *   - `provider_connection_missing` / `_disabled` / `_unhealthy` —
 *     binding's provider connection failed eligibility
 */

import type { ProviderHubRequest, ProviderHubResponse, OperatorName } from "@shared/operator-types";
import { gatewayCall } from "../platform/modules/module-gateway";
import { resolveWorkspaceDefaultBinding } from "../agent-studio/workspace-default-bindings";
import type {
  ModelAccessExecuteInput,
  ModelAccessResult,
} from "../openrouter/model-access/types";

// ============================================================================
// Operator Model Constraints (governance guardrails)
// ============================================================================
//
// `allowedModels` was dropped in Phase 29.5 — see file-level docs.

interface OperatorModelConstraints {
  maxTokens: number;
  maxTemperature: number;
}

const OPERATOR_MODEL_CONSTRAINTS: Record<OperatorName, OperatorModelConstraints> = {
  builder: { maxTokens: 16384, maxTemperature: 0.7 },
  auditor: { maxTokens: 8192, maxTemperature: 0.3 },
  governance: { maxTokens: 4096, maxTemperature: 0.1 },
  deploy: { maxTokens: 8192, maxTemperature: 0.2 },
};

// ============================================================================
// Errors
// ============================================================================

export class OperatorBindingError extends Error {
  constructor(
    public readonly workspaceId: number,
    public readonly reason:
      | "workspace_required"
      | "default_not_set"
      | "provider_connection_missing"
      | "provider_connection_disabled"
      | "provider_connection_unhealthy",
  ) {
    super(
      `[ProviderHub] Workspace ${workspaceId} has no usable classifier binding (reason=${reason}). ` +
        `Configure the default via ags_workspace_default_provider_bindings (role='classifier').`,
    );
    this.name = "OperatorBindingError";
  }
}

// ============================================================================
// Provider Hub — Main entry point
// ============================================================================

export async function callProviderHub(request: ProviderHubRequest): Promise<ProviderHubResponse> {
  const constraints = OPERATOR_MODEL_CONSTRAINTS[request.operator];
  if (!constraints) {
    throw new Error(`Unknown operator: ${request.operator}`);
  }
  if (!request.workspaceId) {
    throw new OperatorBindingError(0, "workspace_required");
  }

  // Resolve workspace classifier default binding
  const binding = await resolveWorkspaceDefaultBinding({
    workspaceId: request.workspaceId,
    role: "classifier",
  });
  if (!binding) {
    throw new OperatorBindingError(request.workspaceId, "default_not_set");
  }
  if (!binding.ok) {
    throw new OperatorBindingError(
      request.workspaceId,
      binding.reason ?? "provider_connection_missing",
    );
  }

  // Enforce per-operator constraints (governance guardrails preserved
  // even when the workspace admin's binding allows higher caps).
  const effectiveMaxTokens = Math.min(request.maxTokens, constraints.maxTokens);
  const effectiveTemperature = Math.min(request.temperature, constraints.maxTemperature);

  // Strict-JSON system-prompt suffix used when the first attempt
  // returns invalid JSON. The retry happens once.
  const STRICT_JSON_HINT =
    "\n\nCRITICAL: Your previous response was not valid JSON. You MUST respond with valid JSON only.";

  const start = Date.now();
  let attempt = 0;
  let lastResult: ModelAccessResult | null = null;

  // Retry loop: max 2 attempts (initial + 1 retry on JSON parse failure)
  while (attempt < 2) {
    const systemPrompt =
      attempt === 0 ? request.systemPrompt : request.systemPrompt + STRICT_JSON_HINT;

    const result = await gatewayCall<ModelAccessExecuteInput, ModelAccessResult>({
      ctx: {
        sourceModule: "operators",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.execute",
        workspaceId: request.workspaceId,
      },
      input: {
        providerConnectionId: binding.providerConnectionId,
        modelRef: binding.modelRef,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        intent: "system-internal",
        workspaceId: request.workspaceId,
        actorId: 0,
        temperature: effectiveTemperature,
        tokenBudget: effectiveMaxTokens,
      },
    });

    lastResult = result;
    if (result.status !== "ok" || !result.output) {
      throw new Error(
        `[ProviderHub] modelAccess.execute failed for operator '${request.operator}' on workspace ${request.workspaceId}: ${result.error ?? "no output"}`,
      );
    }

    const content = result.output.trim();
    try {
      JSON.parse(content);
      // Valid JSON — return.
      const latencyMs = Date.now() - start;
      console.log(
        `[ProviderHub] ${request.operator}/${request.jobId} → ${binding.modelRef} (${result.usage?.totalTokens ?? 0} tokens, ${latencyMs}ms${attempt > 0 ? ", retry" : ""})`,
      );
      return {
        content,
        model: result.modelRef,
        provider: `pcid:${binding.providerConnectionId}`,
        tokensUsed: result.usage?.totalTokens ?? 0,
        latencyMs,
        traceId: request.traceId,
        fallbackUsed: false,
      };
    } catch {
      attempt += 1;
      // fall through to retry
    }
  }

  // Both attempts produced invalid JSON.
  throw new Error(
    `[ProviderHub] Operator '${request.operator}' produced invalid JSON twice on workspace ${request.workspaceId} (last raw output ${(lastResult?.output ?? "").slice(0, 200)}…)`,
  );
}
