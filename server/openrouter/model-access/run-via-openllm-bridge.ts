/**
 * OpenRouter Model Access — openllm-agent bridge primitive.
 *
 * Phase 28.6 (PMB Plan v3 follow-up). Per Decision D-MA-TOOL-1..8
 * (`docs/architecture/provider-model-binding/MODEL_ACCESS_TOOL_LOOP_DECISION.md`),
 * this is a **direct-import** function (NOT gateway-callable) because
 * the `permissionResolver` callback can't pass through gateway-call
 * serialization. Mirrors the existing `stream()` precedent.
 *
 * The bridge replaces `runViaOpenllmAgent` from
 * `server/agent-studio/adapters/openllm-runtime-adapter.ts` (which
 * dies in Phase 28.7). It encapsulates:
 *
 *  - Credential resolution via `withProviderCredential` (D2 boundary).
 *  - WebSocket URL derivation from `baseUrl`.
 *  - Extraction of the openllm-agent2 `apiKey` from resolved auth headers.
 *  - The `configure_session` handshake (Phase 18 / decision #7a).
 *  - The `permission_request` → `permission_response` flow (Phase 1c).
 *  - The `done` / `error` finalization protocol.
 *  - Provider-tolerant `usage` parsing.
 *
 * Protocol (mirrors openllm-agent2 `src/web/ws-bridge.ts`):
 *
 *   client → server:
 *     { type: "message", content, provider?, model?, apiKey? }
 *     { type: "cancel" }
 *     { type: "permission_response", allowed: boolean }
 *     { type: "configure_session", mcpServers?, scope? }
 *
 *   server → client:
 *     { type: "token", content }
 *     { type: "done", usage }
 *     { type: "error", message }
 *     { type: "permission_request", ... }
 *     { type: "session_configured", mcpServerCount, mcpToolCount, errors? }
 */

import WebSocket from "ws";
import {
  withProviderCredential,
  ProviderCredentialResolutionError,
} from "../../provider-connections/internal/credential-resolver";
import {
  ModelAccessError,
  type RunViaOpenllmBridgeInput,
  type RunViaOpenllmBridgeResult,
  type BridgePermissionDecision,
  type BridgeSessionConfigResult,
  type BridgeUsage,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────

function newCorrelationId(): string {
  return `mod-acc-bridge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Convert an HTTP base URL to a WebSocket URL pointing at openllm-agent2's
 * `/ws` endpoint:
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
 * Extract a bearer token from a `{ Authorization: "Bearer X" }` headers
 * map. Returns `undefined` when the header is missing or malformed.
 *
 * The openllm-agent2 WS protocol expects a plain apiKey on the `message`
 * frame. The Provider Connections credential resolver returns the same
 * key wrapped in OpenAI-style `Authorization: Bearer <key>` headers; this
 * helper unwraps it.
 */
function extractApiKeyFromAuthHeaders(
  authHeaders: Record<string, string> | undefined,
): string | undefined {
  if (!authHeaders) return undefined;
  const auth =
    authHeaders.Authorization ??
    authHeaders.authorization ??
    authHeaders["x-api-key"] ??
    authHeaders["X-Api-Key"];
  if (typeof auth !== "string") return undefined;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : auth;
}

/**
 * Provider-tolerant usage parser. Tries field aliases for OpenAI /
 * Anthropic / Gemini / Ollama and falls back to `undefined` when no
 * field matches. Returns `undefined` rather than an empty object so
 * downstream "we got usage" checks work.
 */
function parseUsage(raw: unknown): BridgeUsage | undefined {
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
    "prompt_eval_count",
  );
  const outputTokens = num(
    "output_tokens",
    "outputTokens",
    "completion_tokens",
    "completionTokens",
    "candidatesTokenCount",
    "eval_count",
  );
  const explicitTotal = num("total_tokens", "totalTokens", "totalTokenCount");
  const totalTokens =
    explicitTotal ??
    (inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : undefined);

  let costMicrocents: number | undefined;
  const costUsd = num("cost_usd", "costUsd", "cost", "total_cost", "totalCost");
  if (costUsd != null) {
    costMicrocents = Math.round(costUsd * 1_000_000);
  } else {
    const microcents = num("cost_microcents", "costMicrocents");
    if (microcents != null) costMicrocents = Math.round(microcents);
  }

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

// ── Public API ──────────────────────────────────────────────────────

/**
 * Run a single-turn agent loop against openllm-agent2 via WebSocket.
 *
 * Resolves with a populated `RunViaOpenllmBridgeResult`. Failures are
 * returned in the result rather than thrown — same shape as today's
 * adapter — so the simulation engine's downstream handling stays
 * unchanged. The promise never rejects.
 */
export async function runViaOpenllmBridge(
  input: RunViaOpenllmBridgeInput,
): Promise<RunViaOpenllmBridgeResult> {
  const correlationId = input.correlationId ?? newCorrelationId();
  const startMs = Date.now();

  // Resolve credential first; this is the only place outside server/secrets
  // where a decrypted credential exists. We capture the bits we need
  // (baseUrl, apiKey extracted from Authorization header) and let the
  // resolver scope close immediately afterward.
  let baseUrl = "";
  let apiKey: string | undefined;
  let providerType = "";
  let credentialError: Error | null = null;
  try {
    await withProviderCredential(input.providerConnectionId, async (cred) => {
      baseUrl = cred.baseUrl;
      providerType = cred.providerType;
      apiKey = extractApiKeyFromAuthHeaders(cred.authHeaders);
    });
  } catch (err) {
    credentialError = err as Error;
  }

  if (credentialError) {
    const isResolution =
      credentialError instanceof ProviderCredentialResolutionError;
    return {
      ok: false,
      text: "",
      tokenCount: 0,
      durationMs: Date.now() - startMs,
      error: isResolution
        ? `credential_resolution_failed: ${credentialError.message}`
        : `credential_error: ${credentialError.message}`,
      finalizedNormally: false,
      permissionEvents: [],
      policyEvents: [],
      sessionConfig: null,
      correlationId,
    };
  }

  const wsUrl = deriveOpenllmWsUrl(baseUrl);

  // Local state for this run
  const tokens: string[] = [];
  const permissionEvents: RunViaOpenllmBridgeResult["permissionEvents"] = [];
  const policyEvents: RunViaOpenllmBridgeResult["policyEvents"] = [];
  let finalizedNormally = false;
  let runtimeError: string | undefined;
  let parsedUsage: BridgeUsage | undefined;
  let sessionConfigResult: RunViaOpenllmBridgeResult["sessionConfig"] = null;
  let sessionConfigAckTimer: NodeJS.Timeout | null = null;
  let messageSent = false;

  return new Promise<RunViaOpenllmBridgeResult>((resolve) => {
    const timeoutMs = input.timeoutMs ?? 60_000;
    let resolved = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
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
        correlationId,
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
        correlationId,
      });
    };

    timeoutHandle = setTimeout(() => {
      finalize(false, `WebSocket timeout after ${timeoutMs}ms`);
    }, timeoutMs);

    if (input.signal) {
      const onAbort = () => {
        try {
          ws.send(JSON.stringify({ type: "cancel" }));
        } catch {
          /* ignore */
        }
        finalize(false, "Aborted by caller");
      };
      if (input.signal.aborted) {
        onAbort();
        return;
      }
      input.signal.addEventListener("abort", onAbort, { once: true });
    }

    const sendMessageFrame = () => {
      if (messageSent || resolved) return;
      messageSent = true;
      const payload: Record<string, unknown> = {
        type: "message",
        content: input.message,
      };
      // Forward provider type + model + apiKey so the upstream agent
      // routes correctly. `providerType` from the credential resolver
      // matches the upstream's expected provider name (openai /
      // anthropic / google / etc.).
      if (providerType) payload.provider = providerType;
      if (input.modelRef) payload.model = input.modelRef;
      if (apiKey) payload.apiKey = apiKey;
      try {
        ws.send(JSON.stringify(payload));
      } catch (e) {
        finalize(
          false,
          `Failed to send message: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    };

    ws.on("open", () => {
      const mcpServers = input.mcpServers ?? [];
      if (mcpServers.length === 0) {
        sendMessageFrame();
        return;
      }

      const configurePayload = {
        type: "configure_session" as const,
        mcpServers,
        scope: input.mcpScope ?? "managed",
      };
      try {
        ws.send(JSON.stringify(configurePayload));
      } catch {
        sessionConfigResult = "no_ack";
        sendMessageFrame();
        return;
      }

      const ackTimeoutMs = input.sessionConfigureTimeoutMs ?? 2_000;
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
        return;
      }

      const type = msg.type;
      switch (type) {
        case "token": {
          if (typeof msg.content === "string") {
            tokens.push(msg.content);
            input.onToken?.(msg.content);
          }
          break;
        }
        case "done": {
          finalizedNormally = true;
          parsedUsage = parseUsage(msg.usage);
          finalize(true);
          break;
        }
        case "error": {
          const errMsg =
            typeof msg.message === "string" ? msg.message : "unknown error";
          runtimeError = errMsg;
          input.onError?.(errMsg);
          finalize(false, errMsg);
          break;
        }
        case "permission_request": {
          permissionEvents.push({ ts: Date.now(), payload: msg });
          input.onPermissionRequest?.(msg);
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
          const resolver = input.permissionResolver;
          Promise.resolve(
            resolver
              ? resolver(resolverInput)
              : ("deny" as BridgePermissionDecision),
          )
            .catch(() => "deny" as BridgePermissionDecision)
            .then((decision) => {
              const allowed = decision === "allow";
              if (decision === "needs_human") {
                policyEvents.push({
                  ts: Date.now(),
                  payload: {
                    type: "permission_needs_human",
                    request: msg,
                  },
                });
                input.onPolicyEvent?.({
                  type: "permission_needs_human",
                  request: msg,
                });
              }
              try {
                ws.send(
                  JSON.stringify({
                    type: "permission_response",
                    allowed,
                  }),
                );
              } catch {
                /* socket may have closed */
              }
            });
          break;
        }
        case "policy_event":
        case "audit_event": {
          policyEvents.push({ ts: Date.now(), payload: msg });
          input.onPolicyEvent?.(msg);
          break;
        }
        case "session_configured": {
          if (sessionConfigAckTimer) {
            clearTimeout(sessionConfigAckTimer);
            sessionConfigAckTimer = null;
          }
          const result: BridgeSessionConfigResult = {
            mcpServerCount:
              typeof msg.mcpServerCount === "number" ? msg.mcpServerCount : 0,
            mcpToolCount:
              typeof msg.mcpToolCount === "number" ? msg.mcpToolCount : 0,
            errors: Array.isArray(msg.errors)
              ? (msg.errors as Array<{ serverName: string; error: string }>)
              : [],
          };
          sessionConfigResult = result;
          input.onSessionConfigured?.(result);
          sendMessageFrame();
          break;
        }
        default:
          break;
      }
    });

    ws.on("error", (err: Error) => {
      const m = err.message || "WebSocket error";
      finalize(false, m);
    });

    ws.on("close", () => {
      if (!finalizedNormally && !resolved) {
        finalize(false, runtimeError ?? "WebSocket closed before done");
      }
    });
  });
}

// Re-export the unused error class to keep the module surface explicit.
export { ModelAccessError };
