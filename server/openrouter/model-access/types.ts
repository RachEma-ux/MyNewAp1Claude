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
  /**
   * Plan v3 Phase 18 — when an `assistant` turn requested tool calls,
   * the caller must echo them back on the same message so the model
   * has matching tool responses on the next turn. OpenAI accepts the
   * raw `tool_calls` array as it was returned. Opaque pass-through.
   */
  toolCalls?: ModelAccessToolCall[];
  /**
   * Plan v3 Phase 18 — for `tool` messages, the id of the tool_call
   * this response satisfies. Required by OpenAI's chat-completions
   * tool-loop protocol. Ignored on other roles.
   */
  toolCallId?: string;
}

/**
 * Plan v3 Phase 18 — tool call returned by the model. Mirror the
 * OpenAI shape (id, function-style name + JSON-string arguments)
 * since both Anthropic and OpenAI map cleanly to this projection.
 * Anthropic's `tool_use.input` (object) is JSON-stringified into
 * `arguments` so callers can use a single decode path.
 */
export interface ModelAccessToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments string. May be `"{}"` when the model called with no args. */
  arguments: string;
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
  /**
   * Plan v3 Phase 18 — tool calls returned by the model on this turn.
   * Empty / undefined when no tools were called or no tools were
   * passed in. The chat-tools loop in Agent Studio re-emits these
   * on the next turn paired with role="tool" responses.
   */
  toolCalls?: ModelAccessToolCall[];
  /** Provider-reported finish reason, e.g. "stop", "tool_calls", "length". */
  finishReason?: string;
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

/**
 * Phase 28.4 (D-MA-EMBED-1): input for the embedding-execute primitive.
 * Mirrors `ModelAccessExecuteInput` minus chat-specific fields. Inputs
 * may be a single string (returned as a one-element batch) or an
 * array — the upstream call shape is identical.
 */
export interface ModelAccessEmbedInput {
  providerConnectionId: number;
  modelRef: string;
  inputs: string | string[];
  intent: ModelAccessIntent;
  workspaceId: number;
  actorId: number;
  correlationId?: string;
}

/**
 * Phase 28.4 (D-MA-EMBED-1): result. `embeddings` is always batch-
 * shaped — single-string inputs return a one-element array — so
 * callers don't have to branch on input shape.
 */
export interface ModelAccessEmbedResult {
  status: "ok" | "error";
  providerConnectionId: number;
  modelRef: string;
  latencyMs: number;
  embeddings: number[][];
  usage?: ModelAccessUsage;
  error?: string;
  correlationId?: string;
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
