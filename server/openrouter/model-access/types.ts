/**
 * OpenRouter Model Access — public contracts
 *
 * Plan v3 Phase 4. Per Decision D4, OpenRouter hosts the Model Access
 * facade that converges all provider model-call execution. Per D1,
 * runtime never reads provider keys from process.env. Per D2, only
 * this subtree is permitted to import the Provider Connections
 * internal credential resolver.
 *
 * The contract here is the input/output shape for
 * `openRouter.modelAccess.execute|stream|validateBinding`. It is
 * deliberately narrow at Phase 4 — extensions (full tool-call schema,
 * streaming SSE with tool deltas) land at Phase 17/18 when Agent
 * Studio's chat paths migrate onto Model Access.
 */

export type ModelAccessIntent =
  | "agent-test"
  | "agent-run"
  | "evaluation"
  | "chat";

/**
 * Per Plan v3 Fix N4 (separate `role` from `intent`):
 *   - Binding `role` lives on AgentProviderBinding (Phase 7+).
 *   - Execution `intent` is THIS field; describes why the call is
 *     being made (used for governance receipts and telemetry).
 */

export interface ModelAccessMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ModelAccessExecuteInput {
  providerConnectionId: number;
  modelRef: string;
  messages: ModelAccessMessage[];
  /**
   * Tools at Phase 4 are passed through opaquely to the upstream
   * adapter. Phase 17/18 will replace `unknown[]` with a typed
   * tool-call schema once Agent Studio's tool-use migration starts.
   */
  tools?: unknown[];
  stream?: boolean;
  tokenBudget?: number;
  temperature?: number;
  intent: ModelAccessIntent;
  workspaceId: number;
  actorId: number;
  correlationId?: string;
}

export interface ModelAccessUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ModelAccessResult {
  status: "ok" | "error";
  output?: string;
  providerConnectionId: number;
  modelRef: string;
  latencyMs: number;
  usage?: ModelAccessUsage;
  error?: string;
  /** Echoed back so callers can correlate logs / telemetry. */
  correlationId?: string;
}

/** Streaming chunk emitted by `stream()`. */
export interface ModelAccessStreamChunk {
  /** Incremental text delta from the upstream provider. */
  delta: string;
  /** True on the final chunk; usage may be populated alongside. */
  done: boolean;
  usage?: ModelAccessUsage;
  /** Provider-specific finish reason, normalized to a string when present. */
  finishReason?: string;
}

export interface ValidateBindingInput {
  providerConnectionId: number;
  modelRef?: string;
  workspaceId: number;
}

export interface ValidateBindingResult {
  ok: boolean;
  reason?:
    | "credential_resolution_failed"
    | "provider_unreachable"
    | "model_not_listed"
    | "http_error";
  detail?: string;
  latencyMs: number;
}

/** Normalized error class for Model Access execution failures. */
export class ModelAccessError extends Error {
  constructor(
    public readonly code:
      | "credential_resolution_failed"
      | "upstream_http_error"
      | "upstream_network_error"
      | "upstream_timeout"
      | "upstream_invalid_response"
      | "unsupported_provider_type",
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ModelAccessError";
  }
}
