/**
 * OpenRouter Model Access — embedding-execute primitive.
 *
 * Phase 28.4 (PMB Plan v3 follow-up). Adds `openRouter.modelAccess.embed`
 * to the Model Access surface. Per Decision D-MA-EMBED-1..7
 * (`docs/architecture/provider-model-binding/MODEL_ACCESS_EMBED_DECISION.md`),
 * the primitive mirrors `execute()` exactly — same credential-resolver
 * boundary, same governance/receipt policy — but targets `/v1/embeddings`
 * instead of `/v1/chat/completions`.
 *
 * **Provider support (D-MA-EMBED-2):**
 *   - OpenAI / OpenAI-compatible — `POST /v1/embeddings`.
 *   - Anthropic — refused with `ModelAccessError("unsupported_provider_type", ...)`.
 *     Anthropic has no embedding API today.
 *
 * **Batch semantics (D-MA-EMBED-6):** single-call batch. Pass
 * `inputs: string[]` and a single HTTP call carries the array.
 * Single-string inputs return a one-element batch. The primitive does
 * NOT split oversize batches; callers chunk themselves.
 *
 * **Dimension (D-MA-EMBED-5):** not enforced here. The result's
 * `embeddings[i].length` reflects the upstream model's native dim
 * (e.g. 1536 for `text-embedding-3-small`, 3072 for `-large`).
 * Callers that need an explicit dimension contract assert it
 * themselves (RAC asserts against `embedding_model_dim` from the
 * source row).
 */

import {
  withProviderCredential,
  ProviderCredentialResolutionError,
} from "../../provider-connections/internal/credential-resolver";
import {
  ModelAccessError,
  type ModelAccessEmbedInput,
  type ModelAccessEmbedResult,
  type ModelAccessUsage,
} from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;

function newCorrelationId(): string {
  return `mod-acc-embed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAnthropic(providerType: string, baseUrl: string): boolean {
  return providerType === "anthropic" || /anthropic\.com/i.test(baseUrl);
}

function normalizeInputs(inputs: string | string[]): string[] {
  return typeof inputs === "string" ? [inputs] : inputs;
}

function buildOpenAiEmbedBody(
  input: ModelAccessEmbedInput,
): Record<string, unknown> {
  return {
    model: input.modelRef,
    input: input.inputs, // OpenAI accepts string or string[] natively
  };
}

function extractOpenAiEmbedOutput(payload: any): {
  embeddings: number[][];
  usage?: ModelAccessUsage;
} {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const embeddings: number[][] = data.map((d: any) =>
    Array.isArray(d?.embedding) ? (d.embedding as number[]) : [],
  );
  const u = payload?.usage;
  const usage: ModelAccessUsage | undefined = u
    ? {
        inputTokens: u.prompt_tokens,
        outputTokens: undefined, // embeddings have no output tokens
        totalTokens: u.total_tokens,
      }
    : undefined;
  return { embeddings, usage };
}

export async function embed(
  input: ModelAccessEmbedInput,
): Promise<ModelAccessEmbedResult> {
  const correlationId = input.correlationId ?? newCorrelationId();
  const start = Date.now();

  try {
    return await withProviderCredential(
      input.providerConnectionId,
      async (credential) => {
        if (isAnthropic(credential.providerType, credential.baseUrl)) {
          throw new ModelAccessError(
            "unsupported_provider_type",
            `Provider type '${credential.providerType}' (baseUrl ${credential.baseUrl}) does not support embeddings. ` +
              `Per D-MA-EMBED-2, only OpenAI-compatible providers expose /v1/embeddings.`,
          );
        }

        const body = buildOpenAiEmbedBody(input);
        const url = `${credential.baseUrl.replace(/\/$/, "")}/v1/embeddings`;

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
              ? `Upstream embedding call to ${url} timed out after ${DEFAULT_TIMEOUT_MS}ms`
              : `Upstream embedding call to ${url} failed: ${
                  err instanceof Error ? err.message : String(err)
                }`,
            err,
          );
        }

        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new ModelAccessError(
            "upstream_http_error",
            `Upstream embedding endpoint returned ${res.status}: ${text.slice(0, 500)}`,
          );
        }

        let payload: any;
        try {
          payload = await res.json();
        } catch (err) {
          throw new ModelAccessError(
            "upstream_invalid_response",
            "Upstream embedding response could not be parsed as JSON",
            err,
          );
        }

        const { embeddings, usage } = extractOpenAiEmbedOutput(payload);

        // Sanity check: result count should match request count.
        const requested = normalizeInputs(input.inputs).length;
        if (embeddings.length !== requested) {
          throw new ModelAccessError(
            "upstream_invalid_response",
            `Upstream returned ${embeddings.length} embeddings for ${requested} inputs (mismatch).`,
          );
        }

        return {
          status: "ok",
          providerConnectionId: input.providerConnectionId,
          modelRef: input.modelRef,
          latencyMs: Date.now() - start,
          embeddings,
          usage,
          correlationId,
        } satisfies ModelAccessEmbedResult;
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
        embeddings: [],
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
        embeddings: [],
        error: `${err.code}: ${err.message}`,
        correlationId,
      };
    }
    return {
      status: "error",
      providerConnectionId: input.providerConnectionId,
      modelRef: input.modelRef,
      latencyMs,
      embeddings: [],
      error: `unknown_error: ${err instanceof Error ? err.message : String(err)}`,
      correlationId,
    };
  }
}
