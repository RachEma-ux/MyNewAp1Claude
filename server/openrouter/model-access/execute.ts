/**
 * OpenRouter Model Access — execute / stream / validateBinding
 *
 * Plan v3 Phase 4. This file is the ONLY place outside
 * `server/secrets/` that resolves a decrypted provider credential at
 * runtime, and it does so through the Provider Connections internal
 * resolver `withProviderCredential`. The boundary is enforced by
 * `scripts/check-provider-credential-resolver-boundary.ts` (Phase 3).
 *
 * Two adapter shapes at Phase 4: OpenAI-compatible (`/v1/chat/completions`)
 * and Anthropic (`/v1/messages`). Local providers (Ollama, llama.cpp)
 * are reachable through the OpenAI-compatible adapter when they
 * expose the OpenAI shape; otherwise they are out of scope until
 * Phase 17+ (Expert chat migration) adds the Ollama-native path.
 */

import {
  withProviderCredential,
  ProviderCredentialResolutionError,
} from "../../provider-connections/internal/credential-resolver";
import {
  ModelAccessError,
  type ModelAccessExecuteInput,
  type ModelAccessResult,
  type ModelAccessStreamChunk,
  type ValidateBindingInput,
  type ValidateBindingResult,
  type ModelAccessUsage,
  type ModelAccessToolCall,
} from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;

// ─── Helpers ─────────────────────────────────────────────────────────

function newCorrelationId(): string {
  // Cheap, dependency-free correlation id. Not cryptographic.
  return `mod-acc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAnthropic(providerType: string, baseUrl: string): boolean {
  return (
    providerType === "anthropic" ||
    /anthropic\.com/i.test(baseUrl)
  );
}

function buildOpenAiBody(input: ModelAccessExecuteInput): Record<string, unknown> {
  // Plan v3 Phase 18 — translate ModelAccessMessage → OpenAI shape.
  // The `toolCalls` / `toolCallId` fields on assistant / tool messages
  // map onto OpenAI's `tool_calls` and `tool_call_id` respectively.
  const messages = input.messages.map((m) => {
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        tool_call_id: m.toolCallId ?? "",
        content: m.content,
      };
    }
    return { role: m.role, content: m.content };
  });
  const body: Record<string, unknown> = {
    model: input.modelRef,
    messages,
    stream: input.stream ?? false,
  };
  if (typeof input.temperature === "number") body.temperature = input.temperature;
  if (typeof input.tokenBudget === "number") body.max_tokens = input.tokenBudget;
  if (input.tools && input.tools.length > 0) body.tools = input.tools;
  return body;
}

function buildAnthropicBody(input: ModelAccessExecuteInput): Record<string, unknown> {
  // Anthropic separates `system` from the messages array.
  const systemMessage = input.messages.find((m) => m.role === "system");
  const otherMessages = input.messages.filter((m) => m.role !== "system");
  const body: Record<string, unknown> = {
    model: input.modelRef,
    messages: otherMessages,
    max_tokens: input.tokenBudget ?? 4096,
    stream: input.stream ?? false,
  };
  if (systemMessage) body.system = systemMessage.content;
  if (typeof input.temperature === "number") body.temperature = input.temperature;
  if (input.tools && input.tools.length > 0) body.tools = input.tools;
  return body;
}

function extractOpenAiOutput(payload: any): {
  output?: string;
  usage?: ModelAccessUsage;
  finishReason?: string;
  toolCalls?: ModelAccessToolCall[];
} {
  const choice = payload?.choices?.[0];
  const output = choice?.message?.content ?? undefined;
  const u = payload?.usage;
  const usage: ModelAccessUsage | undefined = u
    ? {
        inputTokens: u.prompt_tokens,
        outputTokens: u.completion_tokens,
        totalTokens: u.total_tokens,
      }
    : undefined;
  // Plan v3 Phase 18 — extract tool calls. OpenAI returns each call
  // as `{id, type:"function", function:{name, arguments}}`.
  let toolCalls: ModelAccessToolCall[] | undefined;
  const rawToolCalls = choice?.message?.tool_calls;
  if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
    toolCalls = rawToolCalls
      .filter((tc: any) => tc?.function?.name)
      .map((tc: any) => ({
        id: typeof tc.id === "string" ? tc.id : "",
        name: String(tc.function.name),
        arguments:
          typeof tc.function.arguments === "string"
            ? tc.function.arguments
            : JSON.stringify(tc.function.arguments ?? {}),
      }));
  }
  return {
    output: typeof output === "string" ? output : undefined,
    usage,
    finishReason: choice?.finish_reason,
    toolCalls,
  };
}

function extractAnthropicOutput(payload: any): {
  output?: string;
  usage?: ModelAccessUsage;
  finishReason?: string;
  toolCalls?: ModelAccessToolCall[];
} {
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  const text = blocks
    .filter((b: any) => b?.type === "text" && typeof b?.text === "string")
    .map((b: any) => b.text)
    .join("");
  // Plan v3 Phase 18 — extract `tool_use` blocks. Anthropic returns
  // structured input as a JSON object; stringify it to keep the
  // public shape uniform with OpenAI.
  const toolUseBlocks = blocks.filter((b: any) => b?.type === "tool_use");
  let toolCalls: ModelAccessToolCall[] | undefined;
  if (toolUseBlocks.length > 0) {
    toolCalls = toolUseBlocks.map((b: any) => ({
      id: typeof b.id === "string" ? b.id : "",
      name: typeof b.name === "string" ? b.name : "",
      arguments:
        typeof b.input === "string" ? b.input : JSON.stringify(b.input ?? {}),
    }));
  }
  const u = payload?.usage;
  const usage: ModelAccessUsage | undefined = u
    ? {
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        totalTokens:
          typeof u.input_tokens === "number" &&
          typeof u.output_tokens === "number"
            ? u.input_tokens + u.output_tokens
            : undefined,
      }
    : undefined;
  return {
    output: text || undefined,
    usage,
    finishReason: payload?.stop_reason,
    toolCalls,
  };
}

// ─── execute() — non-streaming ───────────────────────────────────────

export async function execute(
  input: ModelAccessExecuteInput,
): Promise<ModelAccessResult> {
  const correlationId = input.correlationId ?? newCorrelationId();
  const start = Date.now();

  // Force non-streaming on this code path. Streaming consumers go
  // through `stream()`.
  const nonStreamingInput: ModelAccessExecuteInput = {
    ...input,
    stream: false,
    correlationId,
  };

  try {
    return await withProviderCredential(
      input.providerConnectionId,
      async (credential) => {
        const useAnthropic = isAnthropic(
          credential.providerType,
          credential.baseUrl,
        );
        const body = useAnthropic
          ? buildAnthropicBody(nonStreamingInput)
          : buildOpenAiBody(nonStreamingInput);
        const url = `${credential.baseUrl.replace(/\/$/, "")}${
          useAnthropic ? "/v1/messages" : "/v1/chat/completions"
        }`;

        let res: Response;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...credential.authHeaders,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
          });
        } catch (err) {
          const isAbort = err instanceof DOMException && err.name === "AbortError";
          throw new ModelAccessError(
            isAbort ? "upstream_timeout" : "upstream_network_error",
            isAbort
              ? `Upstream call to ${url} timed out after ${DEFAULT_TIMEOUT_MS}ms`
              : `Upstream call to ${url} failed: ${
                  err instanceof Error ? err.message : String(err)
                }`,
            err,
          );
        }

        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new ModelAccessError(
            "upstream_http_error",
            `Upstream returned ${res.status}: ${text.slice(0, 500)}`,
          );
        }

        let payload: any;
        try {
          payload = await res.json();
        } catch (err) {
          throw new ModelAccessError(
            "upstream_invalid_response",
            "Upstream response could not be parsed as JSON",
            err,
          );
        }

        const extracted = useAnthropic
          ? extractAnthropicOutput(payload)
          : extractOpenAiOutput(payload);

        const result: ModelAccessResult = {
          status: "ok",
          providerConnectionId: input.providerConnectionId,
          modelRef: input.modelRef,
          latencyMs: Date.now() - start,
          output: extracted.output,
          usage: extracted.usage,
          correlationId,
          toolCalls: extracted.toolCalls,
          finishReason: extracted.finishReason,
        };
        return result;
      },
    );
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (err instanceof ProviderCredentialResolutionError) {
      return {
        status: "error",
        providerConnectionId: input.providerConnectionId,
        modelRef: input.modelRef,
        latencyMs,
        error: `credential_resolution_failed: ${err.message}`,
        correlationId,
      };
    }
    if (err instanceof ModelAccessError) {
      return {
        status: "error",
        providerConnectionId: input.providerConnectionId,
        modelRef: input.modelRef,
        latencyMs,
        error: `${err.code}: ${err.message}`,
        correlationId,
      };
    }
    return {
      status: "error",
      providerConnectionId: input.providerConnectionId,
      modelRef: input.modelRef,
      latencyMs,
      error:
        err instanceof Error
          ? `unexpected: ${err.message}`
          : `unexpected: ${String(err)}`,
      correlationId,
    };
  }
}

// ─── stream() — streaming via async iterable ─────────────────────────
//
// Phase 4 implements text-only SSE for the OpenAI-compatible shape.
// Anthropic streaming and tool-call streaming are deferred to
// Phase 17/18 (Expert chat / runChatWithTools migration). When a
// caller invokes `stream()` against an Anthropic provider connection,
// this function falls back to the non-streaming `execute()` path and
// yields a single chunk with the full output.

export async function* stream(
  input: ModelAccessExecuteInput,
): AsyncGenerator<ModelAccessStreamChunk> {
  const correlationId = input.correlationId ?? newCorrelationId();

  // Resolve credential outside the for-await loop so that an
  // unsupported provider falls through to execute() before we open
  // any HTTP body.
  let providerType = "";
  let baseUrl = "";
  let authHeaders: Record<string, string> = {};
  let credentialError: Error | null = null;
  try {
    await withProviderCredential(input.providerConnectionId, async (cred) => {
      providerType = cred.providerType;
      baseUrl = cred.baseUrl;
      authHeaders = cred.authHeaders;
      // We capture credential context here. The actual streaming HTTP
      // call below uses the captured headers map. This is OK because
      // `stream()` is invoked synchronously by the caller; the captured
      // headers are immediately spread into the `fetch` and the local
      // `authHeaders` reference goes out of scope when this generator
      // is garbage-collected. No persistence.
    });
  } catch (err) {
    credentialError = err as Error;
  }

  if (credentialError) {
    yield {
      delta: "",
      done: true,
      finishReason: "credential_resolution_failed",
    };
    return;
  }

  if (isAnthropic(providerType, baseUrl)) {
    // Phase 4 fallback: defer to non-streaming execute() and emit
    // the full output as one chunk. Phase 17/18 replaces this with
    // native Anthropic SSE.
    const result = await execute({ ...input, stream: false, correlationId });
    yield {
      delta: result.output ?? "",
      done: true,
      usage: result.usage,
      finishReason: result.status === "ok" ? "stop" : "error",
    };
    return;
  }

  const body = buildOpenAiBody({ ...input, stream: true, correlationId });
  const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    yield { delta: "", done: true, finishReason: "upstream_network_error" };
    return;
  }

  if (!res.ok || !res.body) {
    yield { delta: "", done: true, finishReason: `http_${res.status}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let usage: ModelAccessUsage | undefined;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const evt of events) {
        const dataLine = evt
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const payloadText = dataLine.slice("data:".length).trim();
        if (payloadText === "[DONE]") {
          yield { delta: "", done: true, usage, finishReason: "stop" };
          return;
        }
        try {
          const json = JSON.parse(payloadText);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            yield { delta, done: false };
          }
          // Some providers emit usage on the final SSE event.
          if (json?.usage) {
            usage = {
              inputTokens: json.usage.prompt_tokens,
              outputTokens: json.usage.completion_tokens,
              totalTokens: json.usage.total_tokens,
            };
          }
        } catch {
          // Skip malformed event; SSE keep-alives etc.
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
  yield { delta: "", done: true, usage, finishReason: "stop" };
}

// ─── validateBinding() ────────────────────────────────────────────────

export async function validateBinding(
  input: ValidateBindingInput,
): Promise<ValidateBindingResult> {
  const start = Date.now();
  try {
    return await withProviderCredential(
      input.providerConnectionId,
      async (credential) => {
        const useAnthropic = isAnthropic(
          credential.providerType,
          credential.baseUrl,
        );
        const probeUrl = `${credential.baseUrl.replace(/\/$/, "")}/v1/models`;

        let res: Response;
        try {
          res = await fetch(probeUrl, {
            method: "GET",
            headers: { ...credential.authHeaders },
            signal: AbortSignal.timeout(15_000),
          });
        } catch (err) {
          return {
            ok: false,
            reason: "provider_unreachable",
            detail:
              err instanceof Error ? err.message : String(err),
            latencyMs: Date.now() - start,
          };
        }

        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          return {
            ok: false,
            reason: "http_error",
            detail: `${res.status}: ${text.slice(0, 200)}`,
            latencyMs: Date.now() - start,
          };
        }

        // Optional: confirm the requested modelRef appears in the
        // returned list. Some providers don't surface the model in
        // /v1/models (Anthropic), so we treat absence as "not
        // listed" rather than failure when the provider type is
        // known to underreport.
        if (input.modelRef) {
          try {
            const body = await res.json();
            const models = (body?.data ?? body?.models ?? []) as Array<{
              id?: string;
              name?: string;
            }>;
            const found = models.some(
              (m) => m?.id === input.modelRef || m?.name === input.modelRef,
            );
            if (!found && !useAnthropic) {
              return {
                ok: false,
                reason: "model_not_listed",
                detail: `Provider's /v1/models did not include "${input.modelRef}"`,
                latencyMs: Date.now() - start,
              };
            }
          } catch {
            // If we can't parse, prefer ok-with-unknown over false
            // positive failure.
          }
        }

        return { ok: true, latencyMs: Date.now() - start };
      },
    );
  } catch (err) {
    if (err instanceof ProviderCredentialResolutionError) {
      return {
        ok: false,
        reason: "credential_resolution_failed",
        detail: err.message,
        latencyMs: Date.now() - start,
      };
    }
    return {
      ok: false,
      reason: "credential_resolution_failed",
      detail: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}
