/**
 * Provider Connections — Internal Credential Resolver
 *
 * Per Plan v3 Decision D2: this file is the only place where a
 * decrypted provider credential exists outside `server/secrets/`. It
 * is reachable ONLY from `server/openrouter/model-access/**`. The
 * boundary is enforced by `scripts/check-provider-credential-resolver-boundary.ts`
 * (Phase 3).
 *
 * The preferred API is the callback form `withProviderCredential` —
 * the credential lives only inside the callback closure, not on a
 * persisted object. The caller never sees the raw secret directly,
 * only the resolved `authHeaders` (which Model Access immediately
 * sends to the upstream provider HTTP call).
 *
 * RULES (these are the actual D1+D2 invariants encoded in code):
 *
 *   - Resolver never logs the decrypted secret.
 *   - Resolver never writes the decrypted secret to `process.env`.
 *   - Resolver never returns the decrypted secret as a free-standing
 *     string in the public API; it is shaped into `authHeaders`
 *     immediately before the callback.
 *   - On callback exit (success or throw), the local `pat` binding
 *     goes out of scope; no caching or retention.
 *
 * Phase 2 implementation supports two header styles:
 *   - Anthropic-style: `x-api-key` + `anthropic-version`
 *   - Bearer-style (OpenAI-compatible default): `Authorization: Bearer <pat>`
 *
 * Provider-specific style is selected from the `providers.type`/
 * `providers.name` row referenced by the Provider Connection. New
 * provider types extend the switch in `buildAuthHeaders` below.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import {
  providerConnections,
  providers,
  type Provider,
} from "../../../drizzle/schema";
import { getLatestSecret } from "../db";
import { decrypt } from "../../secrets/encryption";

export interface ResolvedProviderCredentialContext {
  /** Base URL the upstream call should target. */
  baseUrl: string;
  /** Auth headers ready to spread into a `fetch()` call. */
  authHeaders: Record<string, string>;
  /**
   * Provider type string (e.g. "anthropic", "openai", "ollama").
   * Lets the caller adjust request shape, not auth.
   */
  providerType: string;
}

export class ProviderCredentialResolutionError extends Error {
  constructor(
    public readonly reason:
      | "connection_not_found"
      | "connection_not_active"
      | "secret_missing"
      | "secret_decrypt_failed"
      | "provider_missing",
    message: string,
  ) {
    super(message);
    this.name = "ProviderCredentialResolutionError";
  }
}

/**
 * Resolve a provider credential by Provider Connection ID and run
 * the caller's `fn` with it. The credential exists only inside `fn`'s
 * closure; on return (or throw) it goes out of scope.
 *
 * @returns Whatever `fn` returns.
 *
 * Throws `ProviderCredentialResolutionError` on resolution failure.
 * Does NOT swallow errors thrown by `fn`.
 */
export async function withProviderCredential<T>(
  providerConnectionId: number,
  fn: (credential: ResolvedProviderCredentialContext) => Promise<T>,
): Promise<T> {
  const db = getDb();
  if (!db) {
    throw new ProviderCredentialResolutionError(
      "connection_not_found",
      "Database not available for credential resolution",
    );
  }

  // 1. Load the connection.
  const [connection] = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, providerConnectionId));

  if (!connection) {
    throw new ProviderCredentialResolutionError(
      "connection_not_found",
      `Provider connection ${providerConnectionId} not found`,
    );
  }

  if (connection.lifecycleStatus !== "active") {
    throw new ProviderCredentialResolutionError(
      "connection_not_active",
      `Provider connection ${providerConnectionId} has status "${connection.lifecycleStatus}", expected "active"`,
    );
  }

  // 2. Load the provider row (needed for header style).
  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, connection.providerId));

  if (!provider) {
    throw new ProviderCredentialResolutionError(
      "provider_missing",
      `Provider ${connection.providerId} referenced by connection ${providerConnectionId} not found`,
    );
  }

  // 3. Load the latest encrypted secret. Decrypt it.
  const secret = await getLatestSecret(providerConnectionId);
  if (!secret) {
    throw new ProviderCredentialResolutionError(
      "secret_missing",
      `Provider connection ${providerConnectionId} has no stored secret`,
    );
  }

  let pat: string;
  try {
    pat = decrypt(secret.encryptedPat);
  } catch (err) {
    throw new ProviderCredentialResolutionError(
      "secret_decrypt_failed",
      `Failed to decrypt secret for provider connection ${providerConnectionId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // 4. Build auth headers. The decrypted PAT is shaped into headers
  //    here and never returned to the caller as a bare string.
  const authHeaders = buildAuthHeaders(provider, pat);

  // 5. Hand the resolved context to the caller. The PAT closure goes
  //    out of scope on return.
  try {
    return await fn({
      baseUrl: connection.baseUrl,
      authHeaders,
      providerType: provider.type,
    });
  } finally {
    // Best-effort scrub. JS can't truly zero strings, but reassigning
    // makes the intent explicit and prevents accidental capture.
    pat = "";
    // Headers map is kept in scope only as long as `fn` runs; after
    // `fn` returns it is unreachable from this function.
  }
}

/**
 * Construct the upstream auth headers for a given provider.
 *
 * Style selection rules (extend as new provider types are supported):
 *   - `provider.type === "anthropic"` OR `provider.name` contains
 *     "anthropic" → x-api-key + anthropic-version + Authorization Bearer
 *   - default → Authorization: Bearer <pat>  (OpenAI-compatible)
 *
 * Local providers (Ollama, llama.cpp) typically need no auth header,
 * but the connection can still go through this function — they will
 * receive a Bearer header that the local server ignores. Callers
 * targeting purely-local providers may bypass the resolver entirely.
 */
function buildAuthHeaders(
  provider: Provider,
  pat: string,
): Record<string, string> {
  const isAnthropic =
    provider.type === "anthropic" ||
    (provider.name ?? "").toLowerCase().includes("anthropic");

  if (isAnthropic) {
    return {
      "anthropic-version": "2023-06-01",
      "x-api-key": pat,
      Authorization: `Bearer ${pat}`,
    };
  }

  // Default: OpenAI-compatible Bearer token.
  return {
    Authorization: `Bearer ${pat}`,
  };
}
