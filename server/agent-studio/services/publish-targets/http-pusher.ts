/**
 * Shared HTTP pusher factory — V1+ Phase 19-β.
 *
 * Phase 19-α (#749) shipped the executor + registry + ledger, but
 * left the registry empty: there were no pushers registered for the
 * three `PublishTargetType` values (`staging_env`, `remote_vault`,
 * `external_kb`), so `executePublish()` always threw
 * `PublishPusherNotRegisteredError`.
 *
 * This module provides the shared factory the three default pushers
 * use. All three share the same HTTP-call shape (request URL,
 * headers, body, parse response, classify outcome); they differ only
 * in method, path suffix, content-type, and credential header. A
 * shared factory is the cheapest correct abstraction here — V1.5+
 * can keep one specialization in the registry and add new pushers
 * without modifying this module.
 *
 * Hard-rule compliance (Plan v3 D2 + CLAUDE.md):
 *   - No `credential-resolver` import. The pusher receives an
 *     opaque `credentialFn(target)` closure from its registrant —
 *     that closure may consult Model Access (for AI-bound targets)
 *     or any operator-defined surface. The factory never touches a
 *     credential primitive directly.
 *   - No raw `process.env.*_API_KEY` reads. Source-scan tested.
 *   - Test seam: `fetchImpl` is injectable so unit tests run
 *     without network I/O.
 *   - Idempotency: the factory does NOT retry on its own. The
 *     executor's `nextAttempt` ledger handles retry tracking; a
 *     failed pusher returns `status: "failed"` and the operator
 *     re-invokes `executePublish()`.
 */

import type {
  PublishExecutionOutcome,
  PublishPayload,
  PublishPusher,
  PublishTargetRecord,
} from "./types.js";

export type HttpMethod = "POST" | "PUT" | "PATCH";

export interface MakeHttpPusherOptions {
  /** HTTP method. Default `"POST"`. */
  readonly method?: HttpMethod;
  /**
   * Suffix appended to `target.endpoint` to form the final URL.
   * Default `""` (no suffix). May begin with `"/"` or not — the
   * factory normalizes a single separator.
   */
  readonly pathSuffix?: string;
  /**
   * Content type sent in `Content-Type`. Default `"application/json"`.
   */
  readonly contentType?: string;
  /**
   * Header name in which the credential is sent. Default
   * `"Authorization"` (with `"Bearer "` prefix). Set to e.g.
   * `"X-API-Key"` for API-key auth (no prefix).
   */
  readonly credentialHeader?: string;
  /**
   * Set to `false` to send the credential as a raw header value
   * (no `"Bearer "` prefix). Default `true`.
   */
  readonly useBearerPrefix?: boolean;
  /**
   * Opaque credential acquisition closure. Returns `null` to send
   * the request without auth (e.g. for an unauthenticated dev
   * endpoint). The closure is registered by the operator at boot
   * time and may consult Model Access, secret stores, or any other
   * surface — the factory does not assume a credential origin.
   */
  readonly credentialFn?: (
    target: PublishTargetRecord,
  ) => Promise<string | null>;
  /**
   * Compose the request body from the payload. Default returns the
   * canonical `{ promotionId, sourceVersionId, body }` shape.
   */
  readonly composeBody?: (
    payload: PublishPayload,
    target: PublishTargetRecord,
  ) => unknown;
  /**
   * Read an upstream artifact identifier from the response JSON.
   * Default reads `id` or `artifactId` field if present.
   */
  readonly readArtifactId?: (json: unknown) => string | undefined;
  /**
   * Test seam — replace the global `fetch` for unit tests. Default
   * uses `globalThis.fetch`.
   */
  readonly fetchImpl?: typeof fetch;
}

function joinUrl(base: string, suffix: string): string {
  if (!suffix) return base;
  const a = base.endsWith("/") ? base.slice(0, -1) : base;
  const b = suffix.startsWith("/") ? suffix.slice(1) : suffix;
  return `${a}/${b}`;
}

function defaultComposeBody(
  payload: PublishPayload,
  _target: PublishTargetRecord,
): unknown {
  return {
    promotionId: payload.sourcePromotionId,
    sourceVersionId: payload.sourceVersionId ?? null,
    body: payload.body,
  };
}

function defaultReadArtifactId(json: unknown): string | undefined {
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (typeof o.id === "string") return o.id;
    if (typeof o.artifactId === "string") return o.artifactId;
  }
  return undefined;
}

async function sha256Hex(input: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(input).digest("hex");
}

export function makeHttpPusher(opts: MakeHttpPusherOptions = {}): PublishPusher {
  const method = opts.method ?? "POST";
  const pathSuffix = opts.pathSuffix ?? "";
  const contentType = opts.contentType ?? "application/json";
  const credentialHeader = opts.credentialHeader ?? "Authorization";
  const useBearerPrefix = opts.useBearerPrefix ?? true;
  const composeBody = opts.composeBody ?? defaultComposeBody;
  const readArtifactId = opts.readArtifactId ?? defaultReadArtifactId;

  return async function httpPusher({
    target,
    payload,
  }): Promise<PublishExecutionOutcome> {
    const url = joinUrl(target.endpoint, pathSuffix);
    const body = composeBody(payload, target);
    const bodyText = JSON.stringify(body);
    const payloadDigest = await sha256Hex(bodyText);

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      Accept: "application/json",
    };

    if (opts.credentialFn) {
      const cred = await opts.credentialFn(target);
      if (cred) {
        headers[credentialHeader] = useBearerPrefix ? `Bearer ${cred}` : cred;
      }
    }

    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

    let resp: Response;
    try {
      resp = await fetchImpl(url, {
        method,
        headers,
        body: bodyText,
      });
    } catch (err) {
      return {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        payloadDigest,
        details: { url, method, transportError: true },
      };
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        status: "failed",
        errorMessage: `HTTP ${resp.status} ${resp.statusText}`,
        payloadDigest,
        details: {
          url,
          method,
          httpStatus: resp.status,
          responseSnippet: text.slice(0, 500),
        },
      };
    }

    let respJson: unknown = null;
    try {
      respJson = await resp.json();
    } catch {
      // Some endpoints return empty 200; not fatal.
    }
    return {
      status: "succeeded",
      upstreamArtifactId: readArtifactId(respJson),
      payloadDigest,
      details: {
        url,
        method,
        httpStatus: resp.status,
      },
    };
  };
}
