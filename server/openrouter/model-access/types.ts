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
  | "chat"
  /**
   * PMB Phase 29.4a — system-internal calls invoked by infrastructure
   * (document indexing, embedding-backed RAG retrieval, operator
   * classifiers, automation invokeAgent fallbacks) where the caller
   * has no `governanceReceiptId` because the work is not user-attributed.
   *
   * Like `agent-test`, this intent is **exempt from the receipt policy**
   * (`enforceModelAccessReceipt` in `server/openrouter/manifest.ts`).
   * Unlike `agent-test`, it is NOT a test — calls do hit live providers
   * and consume budget. The exemption exists because the receipt policy
   * was designed for user-facing chat/run paths, not infrastructure.
   *
   * Audit/observability for `system-internal` calls is captured by:
   *   - the `correlationId` carried on every Model Access result
   *   - the calling subsystem's own audit log (e.g., document upload
   *     audit, agent runtime trace, operator job ledger)
   *
   * Use `agent-run` / `chat` / `evaluation` whenever the caller has
   * a real user context AND can mint a receipt. `system-internal` is
   * the explicit "infrastructure" lane.
   */
  | "system-internal";

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

// ── Phase 28.6 — openllm-agent bridge primitive types ───────────────

/**
 * Phase 28.6 (D-MA-TOOL-3): permission decision returned by the
 * caller-supplied resolver callback.
 *
 *  - "allow"        → respond `{ allowed: true }` to openllm-agent2
 *  - "deny"         → respond `{ allowed: false }`
 *  - "needs_human"  → still respond `{ allowed: false }` (no
 *                     interactive UI yet) but log a policy event
 */
export type BridgePermissionDecision = "allow" | "deny" | "needs_human";

/**
 * Phase 28.6 (D-MA-TOOL-3): caller-supplied permission resolver.
 * Called once per `{type:"permission_request"}` message from the
 * openllm-agent2 WebSocket. Falls back to "deny" if omitted (Phase 1b
 * safety default preserved).
 */
export type BridgePermissionResolver = (request: {
  toolName?: string;
  toolKey?: string;
  description?: string;
  rawPayload: Record<string, unknown>;
}) => BridgePermissionDecision | Promise<BridgePermissionDecision>;

/**
 * Phase 28.6 (D-MA-TOOL-6): MCP server config sent to the bridge as
 * part of `configure_session`. Mirrors the upstream
 * `McpServerConfig` shape (`src/services/mcp/types.ts` in
 * openllm-agent2). The discriminated union covers the 5 transports
 * Studio drafts use today; the upstream patch accepts the full
 * 8-transport union so future additions pass straight through.
 *
 * OAuth tokens are decrypted **server-side BEFORE** being put into
 * this object (decision #9a). The bridge MUST NOT log the `headers`
 * field — it may contain bearer tokens.
 */
export type BridgeMcpServerConfig =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | { type: "http"; url: string; headers?: Record<string, string> }
  | { type: "sse"; url: string; headers?: Record<string, string> }
  | { type: "websocket"; url: string; headers?: Record<string, string> }
  | { type: "sdk"; serverName: string };

/**
 * Phase 28.6: result of the `configure_session` handshake. Populated
 * when the upstream bridge replies with `{type:"session_configured"}`
 * within the 2-second feature-detection window.
 */
export interface BridgeSessionConfigResult {
  mcpServerCount: number;
  mcpToolCount: number;
  errors: Array<{ serverName: string; error: string }>;
}

/**
 * Phase 28.6: token + cost usage parsed from the `{type:"done"}`
 * message. Provider-tolerant (Anthropic / OpenAI / Gemini / Ollama
 * field aliases all collapse here). All fields optional because
 * shape varies by provider; the parser bails to `undefined` if no
 * field matches.
 */
export interface BridgeUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** USD * 1_000_000 (microcents) — int math, no float drift */
  costMicrocents?: number;
  /** Original payload as received, for forensic display */
  raw?: Record<string, unknown>;
}

/**
 * Phase 28.6 (D-MA-TOOL-4): input for the openllm-agent bridge
 * primitive. Replaces the legacy adapter's `wsUrl + apiKey + provider`
 * fields with `providerConnectionId`. The bridge resolves the
 * credential internally via `withProviderCredential`, derives the
 * WebSocket URL from `baseUrl`, and extracts the API key from the
 * resolved auth headers.
 */
export interface RunViaOpenllmBridgeInput {
  providerConnectionId: number;
  modelRef: string;
  /** The user message to send as the first turn */
  message: string;
  /** Hard timeout for the whole run (default 60s; simulation uses 6 min) */
  timeoutMs?: number;
  /** AbortSignal — when aborted, sends {type:"cancel"} and closes the WS */
  signal?: AbortSignal;
  /** Phase 1c: caller-supplied permission resolver (D-MA-TOOL-3) */
  permissionResolver?: BridgePermissionResolver;
  /** Phase 18: MCP servers to inject via configure_session */
  mcpServers?: BridgeMcpServerConfig[];
  /** Phase 18: scope hint forwarded to openllm-agent2 MCP plugin */
  mcpScope?: "project" | "user" | "managed";
  /** Phase 18: configure_session ack timeout (default 2s) */
  sessionConfigureTimeoutMs?: number;
  /** Streaming callbacks (optional — caller can collect via the result) */
  onToken?: (chunk: string) => void;
  onPermissionRequest?: (payload: Record<string, unknown>) => void;
  onPolicyEvent?: (payload: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  onSessionConfigured?: (result: BridgeSessionConfigResult) => void;
  /** Identity for governance/telemetry (D-MA-TOOL-5) */
  intent: ModelAccessIntent;
  workspaceId: number;
  actorId: number;
  correlationId?: string;
}

/**
 * Phase 28.6 (D-MA-TOOL-4): result of the bridge run.
 */
export interface RunViaOpenllmBridgeResult {
  ok: boolean;
  text: string;
  tokenCount: number;
  durationMs: number;
  error?: string;
  finalizedNormally: boolean;
  usage?: BridgeUsage;
  permissionEvents: Array<{ ts: number; payload: Record<string, unknown> }>;
  policyEvents: Array<{ ts: number; payload: Record<string, unknown> }>;
  /**
   *  - null     → no `configure_session` was sent
   *  - object   → upstream acknowledged with counts/errors
   *  - "no_ack" → upstream silently dropped the message; live run
   *               proceeded WITHOUT MCP injection
   */
  sessionConfig: BridgeSessionConfigResult | "no_ack" | null;
  correlationId?: string;
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
