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
 * Phase 1b decision: permission_request is **auto-denied** because there's
 * no user-in-the-loop UI yet. The denial is logged as a runtime policy
 * event. Phase 1c will add real interactive permission flow.
 *
 * Local-first: defaults to ws://127.0.0.1:5000/ws when no endpoint is
 * provided. Tunnel URLs work too (just pass them in).
 */

import WebSocket from "ws";

// ── Public types ────────────────────────────────────────────────────────────

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
  /** Permission requests received during the run (auto-denied in Phase 1b) */
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
          // Phase 1b: auto-deny. Phase 1c will add interactive flow.
          try {
            ws.send(
              JSON.stringify({
                type: "permission_response",
                allowed: false,
              })
            );
          } catch {
            /* ignore */
          }
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
