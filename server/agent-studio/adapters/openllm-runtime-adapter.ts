/**
 * AI Agent Studio — openllm-agent2 Live Runtime Adapter
 *
 * Opens a WebSocket to openllm-agent2's `/ws` endpoint and runs an actual
 * agent loop, streaming token chunks back. This is the first time the
 * Studio executes against a real external runtime — Phase 1b.
 *
 * Protocol (from openllm-agent2 src/web/ws-bridge.ts):
 *   client → server:
 *     { type: "message", content, provider?, model?, apiKey? }
 *     { type: "cancel" }
 *     { type: "permission_response", allowed: boolean }
 *     { type: "configure_session", mcpServers?, scope? }   ← Phase 18 (NEW)
 *
 *   server → client:
 *     { type: "token",  content }      // streamed text chunk
 *     { type: "done",   usage }        // generation finished
 *     { type: "error",  message }      // generation failed
 *     { type: "permission_request", ... }  // server asks user to allow
 *     { type: "session_configured", mcpServerCount, mcpToolCount, errors? } ← Phase 18 (NEW)
 *     (other types ignored — heartbeats, etc.)
 *
 * Phase 1c: permission_request is resolved by a caller-supplied
 * `permissionResolver` callback. The simulation engine builds the resolver
 * from the agent's `agsDraftPermissionRules` table (allow/deny/ask), giving
 * each draft its own per-tool permission policy. When no resolver is
 * supplied, the adapter falls back to the Phase 1b "deny everything"
 * default for safety. The "ask" rule behavior maps to "needs_human" — the
 * adapter still denies (no interactive UI yet) but logs a policy event so
 * the user can see which permissions are blocked on their attention.
 *
 * Phase 18: configure_session injects MCP servers into the live runtime so
 * the agent's tool universe matches simulation mode. The send is gated by
 * `mcpServers && mcpServers.length > 0` (decision #8b). Feature detection:
 * we wait up to 2 seconds for a `session_configured` ack before sending the
 * first `message`. If the ack never arrives (un-patched openllm-agent2 just
 * silently ignores unknown message types), we fall through and proceed —
 * the live run still works, just without MCP. Backward compatible by design.
 *
 * Local-first: defaults to ws://127.0.0.1:5000/ws when no endpoint is
 * provided. Tunnel URLs work too (just pass them in).
 */

import WebSocket from "ws";

// ── Public types ────────────────────────────────────────────────────────────

/**
 * Phase 1c: Permission decision returned by a `permissionResolver`.
 *  - "allow"  → respond { allowed: true } and let the agent loop continue
 *  - "deny"   → respond { allowed: false } and let the agent see the denial
 *  - "needs_human" → still respond { allowed: false } (no interactive UI yet)
 *                    BUT log it as a needs-interactive-flow event so users
 *                    can see which permissions are blocked on their attention
 */
export type PermissionDecision = "allow" | "deny" | "needs_human";

/**
 * Phase 1c: Resolver callback used by the adapter to decide each permission
 * request. Called once per `{type:"permission_request"}` from openllm-agent2.
 *
 * The simulation engine builds this from the agent's `agsDraftPermissionRules`
 * table. If the caller passes nothing (or omits the callback), the adapter
 * falls back to "deny" for safety.
 */
export type PermissionResolver = (request: {
  toolName?: string;
  toolKey?: string;
  description?: string;
  rawPayload: Record<string, unknown>;
}) => PermissionDecision | Promise<PermissionDecision>;

/**
 * Phase 18: MCP server config sent to the openllm-agent2 bridge as part of
 * `configure_session`. This is a discriminated union mirroring the upstream
 * `McpServerConfig` shape (`src/services/mcp/types.ts` in openllm-agent2).
 *
 * We only emit the 5 transports our drafts use today; the upstream patch
 * accepts the full 8-transport union (decision #12a) so future additions
 * pass straight through without an adapter change.
 *
 * OAuth tokens are decrypted server-side BEFORE being put into this object
 * (decision #9a). The adapter MUST NOT log the `headers` field — it may
 * contain bearer tokens. The simulation caller is responsible for the
 * decrypt step (it has the platform encryption helper import authorization).
 */
export type McpServerConfigForBridge =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | {
      type: "http";
      url: string;
      headers?: Record<string, string>;
    }
  | {
      type: "sse";
      url: string;
      headers?: Record<string, string>;
    }
  | {
      type: "websocket";
      url: string;
      headers?: Record<string, string>;
    }
  | {
      type: "sdk";
      /** in-process registry key, e.g. "studio.echo" */
      serverName: string;
    };

/**
 * Phase 18: result of the `configure_session` handshake. Populated when the
 * upstream bridge replies with `{type:"session_configured"}` within the
 * 2-second feature-detection window. When the field is null, either the
 * caller didn't pass `mcpServers` or the upstream bridge is un-patched
 * (older openllm-agent2 silently ignores unknown message types).
 */
export interface OpenllmSessionConfigResult {
  /** Number of MCP servers the bridge accepted */
  mcpServerCount: number;
  /** Total tools discovered across all accepted servers */
  mcpToolCount: number;
  /** Per-server connect failures, if any (soft-fail per decision #4b) */
  errors: Array<{ serverName: string; error: string }>;
}

export interface OpenllmRuntimeRequest {
  /** WebSocket URL pointing at openllm-agent2's /ws endpoint */
  wsUrl: string;
  /** The user message to send as the first turn */
  message: string;
  /** Optional provider override (per-message in openllm-agent2) */
  provider?: string;
  /** Optional model override */
  model?: string;
  /** Optional API key — passed per-message, not stored on the openllm side */
  apiKey?: string;
  /** Hard timeout for the whole run (default 60s) */
  timeoutMs?: number;
  /** AbortSignal — when aborted, sends {type:"cancel"} and closes the WS */
  signal?: AbortSignal;
  /**
   * Phase 1c: callback to decide each permission request. If omitted,
   * the adapter denies every permission request (Phase 1b safety default).
   */
  permissionResolver?: PermissionResolver;
  /**
   * Phase 18: MCP servers to inject into the live runtime via the new
   * `configure_session` message. Empty / omitted → no `configure_session`
   * is sent (decision #8b: minimize wire traffic when not needed).
   *
   * Tokens inside `headers` are expected to be PLAINTEXT — the caller is
   * responsible for decrypting `oauthState.encryptedTokens` before
   * populating this field (decision #9a). The adapter never reads from
   * the platform encryption helper itself (no cross-module import).
   */
  mcpServers?: McpServerConfigForBridge[];
  /**
   * Phase 18: scope hint forwarded to openllm-agent2's MCP plugin
   * attribution. Defaults to "managed" (Studio-owned) when omitted.
   */
  mcpScope?: "project" | "user" | "managed";
  /**
   * Phase 18: how long to wait for the bridge's `session_configured` ack
   * before falling through and sending the first `message`. Default 2s.
   * If the ack arrives later it is recorded silently (the run still
   * continues with whatever the engine has).
   */
  sessionConfigureTimeoutMs?: number;
  /** Streaming callbacks (optional — caller can collect via the result) */
  onToken?: (chunk: string) => void;
  onPermissionRequest?: (payload: Record<string, unknown>) => void;
  onPolicyEvent?: (payload: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  /**
   * Phase 18: fired once when `session_configured` arrives (or never, if
   * the upstream is un-patched / no MCP servers were sent).
   */
  onSessionConfigured?: (result: OpenllmSessionConfigResult) => void;
}

/**
 * Phase 5: Token + cost usage parsed from the `{type:"done", usage}`
 * message. All fields are optional because the shape varies by provider —
 * Anthropic returns `input_tokens`/`output_tokens`, OpenAI returns
 * `prompt_tokens`/`completion_tokens`, etc. The adapter normalizes them
 * here so the simulation engine can persist a single shape.
 */
export interface OpenllmUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** USD * 1_000_000 (microcents) — int math, no float drift */
  costMicrocents?: number;
  /** Original payload as received, for forensic display */
  raw?: Record<string, unknown>;
}

export interface OpenllmRuntimeResult {
  ok: boolean;
  /** Concatenated token stream — the agent's actual response text */
  text: string;
  tokenCount: number;
  durationMs: number;
  /** Set when ok=false */
  error?: string;
  /** True when the server emitted {type:"done"} normally */
  finalizedNormally: boolean;
  /** Phase 5: usage from the done message (provider-normalized) */
  usage?: OpenllmUsage;
  /**
   * Permission requests received during the run. Each was resolved via
   * the caller's `permissionResolver` (Phase 1c) — or auto-denied if no
   * resolver was supplied. The result of each resolution is sent back to
   * openllm-agent2 as a `permission_response` message; this array only
   * records the *requests*, not the decisions. Decisions are tracked by
   * the caller (see simulation.ts decisionLog).
   */
  permissionEvents: Array<{ ts: number; payload: Record<string, unknown> }>;
  /** Other policy events received during the run */
  policyEvents: Array<{ ts: number; payload: Record<string, unknown> }>;
  /**
   * Phase 18: outcome of the `configure_session` handshake.
   *  - null    → no `configure_session` was sent (no MCP servers attached)
   *  - object  → upstream bridge replied; counts and per-server errors
   *  - "no_ack"→ upstream is un-patched / silently dropped the message
   *              (we waited the timeout window and gave up). Live runtime
   *              proceeded WITHOUT MCP injection. Surface this in the
   *              run trace so users see the upstream-patch gap.
   */
  sessionConfig: OpenllmSessionConfigResult | "no_ack" | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert an HTTP base URL like "http://127.0.0.1:5000" or
 * "https://tunnel.example.com" to a WebSocket URL pointing at the
 * openllm-agent2 /ws endpoint.
 *
 *   http://host:port  → ws://host:port/ws
 *   https://host      → wss://host/ws
 *   ws://host:port    → ws://host:port/ws (preserved)
 *
 * Best-effort — returns the input unchanged if URL parsing fails.
 */
export function deriveOpenllmWsUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.protocol === "ws:" || url.protocol === "wss:") {
      // Already a WS URL — make sure it points at /ws
      if (!url.pathname || url.pathname === "/") {
        url.pathname = "/ws";
      }
      return url.toString();
    }
    const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${url.host}/ws`;
  } catch {
    return baseUrl;
  }
}

/**
 * Read the openllm-agent2 endpoint from a draft's providerConfig with a
 * fallback chain:
 *   1. providerConfig.baseUrl (per-agent override)
 *   2. process.env.OPENLLM_AGENT_URL (server-wide override)
 *   3. http://127.0.0.1:5000 (local default — what `bun dist/cli.mjs serve 5000` produces)
 *
 * Returns null when no endpoint can be derived AND the user hasn't opted
 * into live execution. Use this to decide whether to call the runtime
 * adapter at all.
 */
export function resolveOpenllmEndpoint(
  providerConfig: Record<string, unknown> | null | undefined
): {
  wsUrl: string;
  provider: string | undefined;
  model: string | undefined;
  apiKey: string | undefined;
  source: "provider_config" | "env" | "default";
} | null {
  const pc = (providerConfig ?? {}) as Record<string, unknown>;
  const provider = typeof pc.provider === "string" ? pc.provider : undefined;
  const model = typeof pc.model === "string" ? pc.model : undefined;
  const apiKey = typeof pc.apiKey === "string" ? pc.apiKey : undefined;

  if (typeof pc.baseUrl === "string" && pc.baseUrl) {
    return {
      wsUrl: deriveOpenllmWsUrl(pc.baseUrl),
      provider,
      model,
      apiKey,
      source: "provider_config",
    };
  }

  const envUrl = process.env.OPENLLM_AGENT_URL;
  if (envUrl) {
    return {
      wsUrl: deriveOpenllmWsUrl(envUrl),
      provider,
      model,
      apiKey,
      source: "env",
    };
  }

  // No explicit endpoint — only return the local default if the caller
  // also gave us a provider+model (otherwise the agent isn't really
  // configured for live execution and we should stay deterministic).
  if (provider && model) {
    return {
      wsUrl: deriveOpenllmWsUrl("http://127.0.0.1:5000"),
      provider,
      model,
      apiKey,
      source: "default",
    };
  }

  return null;
}

/**
 * Phase 5: Provider-tolerant usage parser. openllm-agent2 forwards the
 * provider's raw usage block on the done message; the shape varies:
 *
 *   Anthropic:  { input_tokens, output_tokens }
 *   OpenAI:     { prompt_tokens, completion_tokens, total_tokens }
 *   Gemini:     { promptTokenCount, candidatesTokenCount, totalTokenCount }
 *   Ollama:     { prompt_eval_count, eval_count }
 *   (others)    arbitrary
 *
 * We try a few aliases for each field and fall back to undefined when no
 * field matches. Cost may or may not be present; when missing it stays
 * undefined and the UI shows just tokens.
 */
function parseUsage(raw: unknown): OpenllmUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;

  const num = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = u[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return undefined;
  };

  const inputTokens = num(
    "input_tokens",
    "inputTokens",
    "prompt_tokens",
    "promptTokens",
    "promptTokenCount",
    "prompt_eval_count"
  );
  const outputTokens = num(
    "output_tokens",
    "outputTokens",
    "completion_tokens",
    "completionTokens",
    "candidatesTokenCount",
    "eval_count"
  );
  const explicitTotal = num("total_tokens", "totalTokens", "totalTokenCount");
  const totalTokens =
    explicitTotal ??
    (inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : undefined);

  // Cost — try common shapes. Convert dollars to microcents to keep
  // everything in int math downstream.
  let costMicrocents: number | undefined;
  const costUsd = num("cost_usd", "costUsd", "cost", "total_cost", "totalCost");
  if (costUsd != null) {
    costMicrocents = Math.round(costUsd * 1_000_000);
  } else {
    const microcents = num("cost_microcents", "costMicrocents");
    if (microcents != null) costMicrocents = Math.round(microcents);
  }

  // Bail entirely if nothing useful was found — cleaner than returning
  // an empty object that fakes "we got usage but it's all undefined".
  if (
    inputTokens == null &&
    outputTokens == null &&
    totalTokens == null &&
    costMicrocents == null
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    costMicrocents,
    raw: u,
  };
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Run a single turn against an openllm-agent2 endpoint over WebSocket.
 * Returns when {type:"done"} is received OR an error/timeout occurs.
 *
 * This is async-but-promise-based: the WebSocket lifecycle happens inside
 * the Promise so callers just `await` and get the full result.
 */
export async function runViaOpenllmAgent(
  req: OpenllmRuntimeRequest
): Promise<OpenllmRuntimeResult> {
  const startMs = Date.now();
  const tokens: string[] = [];
  const permissionEvents: OpenllmRuntimeResult["permissionEvents"] = [];
  const policyEvents: OpenllmRuntimeResult["policyEvents"] = [];
  let finalizedNormally = false;
  let runtimeError: string | undefined;
  // Phase 5: usage payload from the done message — populated by the
  // permissive parser below. Stays undefined for runs that never
  // received a done message.
  let parsedUsage: OpenllmUsage | undefined;
  // Phase 18: session_configured handshake state
  let sessionConfigResult: OpenllmRuntimeResult["sessionConfig"] = null;
  let sessionConfigAckTimer: NodeJS.Timeout | null = null;
  let messageSent = false;

  return new Promise<OpenllmRuntimeResult>((resolve) => {
    const timeoutMs = req.timeoutMs ?? 60_000;
    let resolved = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    // Construct the WebSocket. Wrap in try/catch — invalid URLs throw sync.
    let ws: WebSocket;
    try {
      ws = new WebSocket(req.wsUrl);
    } catch (e) {
      resolve({
        ok: false,
        text: "",
        tokenCount: 0,
        durationMs: Date.now() - startMs,
        error: `WebSocket connection failed: ${e instanceof Error ? e.message : String(e)}`,
        finalizedNormally: false,
        permissionEvents: [],
        policyEvents: [],
        sessionConfig: null,
      });
      return;
    }

    const finalize = (ok: boolean, errMsg?: string) => {
      if (resolved) return;
      resolved = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (sessionConfigAckTimer) clearTimeout(sessionConfigAckTimer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve({
        ok,
        text: tokens.join(""),
        tokenCount: tokens.length,
        durationMs: Date.now() - startMs,
        error: errMsg ?? runtimeError,
        finalizedNormally,
        usage: parsedUsage,
        permissionEvents,
        policyEvents,
        sessionConfig: sessionConfigResult,
      });
    };

    timeoutHandle = setTimeout(() => {
      finalize(false, `WebSocket timeout after ${timeoutMs}ms`);
    }, timeoutMs);

    // AbortSignal handling — send cancel + close
    if (req.signal) {
      const onAbort = () => {
        try {
          ws.send(JSON.stringify({ type: "cancel" }));
        } catch {
          /* ignore */
        }
        finalize(false, "Aborted by caller");
      };
      if (req.signal.aborted) {
        onAbort();
        return;
      }
      req.signal.addEventListener("abort", onAbort, { once: true });
    }

    // Phase 18: send the first `message` frame. Extracted so it can be
    // called either immediately on `open` (no MCP servers) or after the
    // configure_session ack (or its timeout fallback).
    const sendMessageFrame = () => {
      if (messageSent || resolved) return;
      messageSent = true;
      const payload: Record<string, unknown> = {
        type: "message",
        content: req.message,
      };
      if (req.provider) payload.provider = req.provider;
      if (req.model) payload.model = req.model;
      if (req.apiKey) payload.apiKey = req.apiKey;
      try {
        ws.send(JSON.stringify(payload));
      } catch (e) {
        finalize(
          false,
          `Failed to send message: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    };

    ws.on("open", () => {
      // Phase 18: when MCP servers are attached, send `configure_session`
      // FIRST (decision #7a — strict ordering before any `message`). The
      // upstream openllm-agent2 patch acks with `session_configured`. If
      // the upstream is un-patched it silently ignores the unknown type;
      // we wait `sessionConfigureTimeoutMs` (default 2s) before falling
      // through and sending the message anyway. This makes the adapter
      // backward-compatible with both patched and un-patched bridges.
      const mcpServers = req.mcpServers ?? [];
      if (mcpServers.length === 0) {
        // No MCP servers — send the message immediately, classic behavior.
        sendMessageFrame();
        return;
      }

      const configurePayload = {
        type: "configure_session" as const,
        mcpServers,
        scope: req.mcpScope ?? "managed",
      };
      try {
        ws.send(JSON.stringify(configurePayload));
      } catch {
        // configure_session send failed — fall through to messaging anyway
        sessionConfigResult = "no_ack";
        sendMessageFrame();
        return;
      }

      // Arm the feature-detection fallback. If session_configured doesn't
      // arrive within the timeout window, mark sessionConfig="no_ack" and
      // proceed with the message frame regardless.
      const ackTimeoutMs = req.sessionConfigureTimeoutMs ?? 2_000;
      sessionConfigAckTimer = setTimeout(() => {
        if (messageSent || resolved) return;
        sessionConfigResult = "no_ack";
        sendMessageFrame();
      }, ackTimeoutMs);
    });

    ws.on("message", (raw: Buffer | string) => {
      const text = typeof raw === "string" ? raw : raw.toString("utf-8");
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // Ignore malformed messages — could be a heartbeat ping
        return;
      }

      const type = msg.type;
      switch (type) {
        case "token": {
          if (typeof msg.content === "string") {
            tokens.push(msg.content);
            req.onToken?.(msg.content);
          }
          break;
        }
        case "done": {
          finalizedNormally = true;
          // Phase 5: parse usage if present (provider-tolerant)
          parsedUsage = parseUsage(msg.usage);
          finalize(true);
          break;
        }
        case "error": {
          const errMsg =
            typeof msg.message === "string" ? msg.message : "unknown error";
          runtimeError = errMsg;
          req.onError?.(errMsg);
          finalize(false, errMsg);
          break;
        }
        case "permission_request": {
          permissionEvents.push({ ts: Date.now(), payload: msg });
          req.onPermissionRequest?.(msg);
          // Phase 1c: resolve via caller-supplied resolver (driven by the
          // agent's agsDraftPermissionRules table). Falls back to "deny"
          // when no resolver is supplied — matches Phase 1b safety default.
          const resolverInput = {
            toolName:
              typeof msg.toolName === "string" ? msg.toolName : undefined,
            toolKey: typeof msg.toolKey === "string" ? msg.toolKey : undefined,
            description:
              typeof msg.description === "string"
                ? msg.description
                : undefined,
            rawPayload: msg,
          };
          const resolver = req.permissionResolver;
          // Resolve asynchronously so the resolver can do DB lookups, then
          // send the response. We don't await this in the switch — the
          // adapter is callback-driven and the resolver is responsible for
          // not throwing.
          Promise.resolve(
            resolver ? resolver(resolverInput) : ("deny" as PermissionDecision)
          )
            .catch(() => "deny" as PermissionDecision)
            .then((decision) => {
              const allowed = decision === "allow";
              if (decision === "needs_human") {
                // No interactive UI yet — record as a policy event so the
                // run trace surfaces "this permission needs a human".
                policyEvents.push({
                  ts: Date.now(),
                  payload: {
                    type: "permission_needs_human",
                    request: msg,
                  },
                });
                req.onPolicyEvent?.({
                  type: "permission_needs_human",
                  request: msg,
                });
              }
              try {
                ws.send(
                  JSON.stringify({
                    type: "permission_response",
                    allowed,
                  })
                );
              } catch {
                /* ignore — socket may have closed */
              }
            });
          break;
        }
        case "policy_event":
        case "audit_event": {
          policyEvents.push({ ts: Date.now(), payload: msg });
          req.onPolicyEvent?.(msg);
          break;
        }
        case "session_configured": {
          // Phase 18: upstream patched bridge acked our configure_session.
          // Cancel the no-ack fallback timer, record counts, then send
          // the first `message` frame so the agent loop kicks off with
          // the merged tool universe.
          if (sessionConfigAckTimer) {
            clearTimeout(sessionConfigAckTimer);
            sessionConfigAckTimer = null;
          }
          const result: OpenllmSessionConfigResult = {
            mcpServerCount:
              typeof msg.mcpServerCount === "number" ? msg.mcpServerCount : 0,
            mcpToolCount:
              typeof msg.mcpToolCount === "number" ? msg.mcpToolCount : 0,
            errors: Array.isArray(msg.errors)
              ? (msg.errors as Array<{ serverName: string; error: string }>)
              : [],
          };
          sessionConfigResult = result;
          req.onSessionConfigured?.(result);
          sendMessageFrame();
          break;
        }
        default: {
          // Heartbeat / unknown — ignore silently
          break;
        }
      }
    });

    ws.on("error", (err: Error) => {
      const msg = err.message || "WebSocket error";
      finalize(false, msg);
    });

    ws.on("close", () => {
      if (!finalizedNormally && !resolved) {
        finalize(false, runtimeError ?? "WebSocket closed before done");
      }
    });
  });
}
