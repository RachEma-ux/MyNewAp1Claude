/**
 * Realtime-doc — production `getUserIdFromUpgradeRequest` factory.
 *
 * Closes the V1+ named follow-up surfaced by PR-V1-38 (#789): the
 * realtime-doc WebSocket bridge accepts a `getUserIdFromUpgradeRequest`
 * resolver but the first slice shipped with `defaultGetUserIdFromUpgradeRequest`
 * returning `null` — every upgrade landed `missing_user_id` (4401).
 *
 * This module supplies the canonical production closure: it parses
 * the session cookie from the upgrade request's headers, asks the
 * OAuth SDK to verify + sync the user, and returns the resulting
 * userId (or `null` for unauthenticated requests).
 *
 * DI seam (`authenticate`) lets tests inject a stub authenticator
 * without touching the OAuth SDK. Production defaults to
 * `sdk.authenticateRequest(req)`. The cast to `Request` is safe at
 * runtime because `authenticateRequest` only reads
 * `req.headers.cookie` — and an `IncomingMessage` carries that
 * field with the same shape Express extends.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No credential-resolver / dispatchMcpToolCall / *_API_KEY /
 *     neo4j-driver / openrouter imports. (Auth path uses the OAuth
 *     SDK already wired into Express tRPC context.)
 *   - Read-only: authenticate path verifies + reads `users`; no
 *     mutations from the realtime-doc path.
 *   - Defensive: ANY throw from the authenticator is treated as
 *     `null` so the upgrade handler maps to `missing_user_id`
 *     (close code 4401). The bridge MUST never silently allow on
 *     auth failure.
 */

import type { IncomingMessage } from "node:http";

export type AuthenticateUpgradeRequestFn = (
  req: IncomingMessage,
) => Promise<{ id: number } | null>;

export interface CreateDefaultGetUserIdFromUpgradeRequestOptions {
  /**
   * Test seam — override the authenticator. Production uses the
   * default which delegates to the OAuth SDK's `authenticateRequest`.
   */
  readonly authenticate?: AuthenticateUpgradeRequestFn;
}

/**
 * Returns the production `getUserIdFromUpgradeRequest` closure. The
 * closure:
 *   1. Invokes the supplied (or default) authenticator with the raw
 *      upgrade request.
 *   2. Returns `result.id` when the authenticator returns a user.
 *   3. Returns `null` when the authenticator returns `null` OR
 *      throws — the upgrade handler maps `null` to
 *      `missing_user_id` (close code 4401). Defensive deny on
 *      auth-error is load-bearing: a duplex realtime channel cannot
 *      afford a silent allow on session-cookie verification failure.
 */
export function createDefaultGetUserIdFromUpgradeRequest(
  options: CreateDefaultGetUserIdFromUpgradeRequestOptions = {},
): (req: IncomingMessage) => Promise<number | null> {
  const authenticate = options.authenticate;
  return async (req: IncomingMessage): Promise<number | null> => {
    try {
      const auth = authenticate ?? (await loadDefaultAuthenticate());
      const user = await auth(req);
      if (!user) return null;
      return user.id;
    } catch {
      // Defensive deny — never throw out of the upgrade resolver.
      // The bridge maps `null` to close code 4401 via the upgrade
      // handler's `missing_user_id` branch.
      return null;
    }
  };
}

/**
 * Lazy-load the SDK-backed authenticator. Kept private so the unit
 * test for the factory doesn't pay the SDK import cost when the test
 * injects `authenticate` directly.
 *
 * Cast to `unknown` first because `Request` (Express) is structurally
 * a superset of `IncomingMessage` for the `req.headers.cookie` field
 * the SDK reads — at runtime the field shape matches; the type-level
 * cast is the explicit safety boundary.
 */
async function loadDefaultAuthenticate(): Promise<AuthenticateUpgradeRequestFn> {
  const mod = await import("../../../_core/sdk.js");
  return async (req: IncomingMessage) => {
    const user = await mod.sdk.authenticateRequest(req as unknown as never);
    return user ? { id: user.id } : null;
  };
}
