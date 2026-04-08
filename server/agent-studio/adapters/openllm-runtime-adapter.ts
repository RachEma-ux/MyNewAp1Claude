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
 *
 *   server → client:
 *     { type: "token",  content }      // streamed text chunk
 *     { type: "done",   usage }        // generation finished
 *     { type: "error",  message }      // generation failed
 *     { type: "permission_request", ... }  // server asks user to allow
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
  /** Streaming callbacks (optional — caller can collect via the result) */
  onToken?: (chunk: string) => void;
  onPermissionRequest?: (payload: Record<string, unknown>) => void;
  onPolicyEvent?: (payload: Record<string, unknown>) => void;
  onError?: (message: string) => void;
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
      });
      return;
    }

    const finalize = (ok: boolean, errMsg?: string) => {
      if (resolved) return;
      resolved = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
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
        permissionEvents,
        policyEvents,
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

    ws.on("open", () => {
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
