/**
 * Realtime-doc upgrade handler — V1+ CRDT-γ-3-upgrade-handler (PR-V1-37).
 *
 * Composes the CRDT-γ-3-auth rule (PR-V1-36 / #787) with the
 * CRDT-γ-2 transport (#774). The future WebSocket-upgrade pipeline
 * (TBD; framework choice not yet locked) calls this entry-point with
 * a `RealtimeDocConnection`-shaped handle + the resolved sessionKey +
 * the authenticated userId; we either attach or close-with-reason.
 *
 * On `allow: true`:
 *   - Calls `transport.attachConnection(conn, { sessionKey })`.
 *   - Returns the transport's disposer (caller can hold it for
 *     externally-initiated shutdowns).
 *
 * On `allow: false`:
 *   - Closes the connection with a stable code + the deny reason as
 *     the close message so clients can surface it (e.g. "not a vault
 *     member"). NEVER attaches — the auth rule is the gate.
 *   - Returns `null` (no disposer; nothing to dispose).
 *
 * Close-code taxonomy (stable; clients can branch on them):
 *
 *   | reason                          | code |
 *   |---------------------------------|------|
 *   | missing_user_id                 | 4401 (≈ HTTP 401)
 *   | not_a_vault_member              | 4403 (≈ HTTP 403)
 *   | vault_membership_lookup_failed  | 4500 (≈ HTTP 500)
 *
 * 4xxx codes are in the WebSocket private-use range so they will
 * never collide with future IETF assignments.
 *
 * Hard-rule compliance:
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` imports.
 *   - The transport is a DI seam (`transport.attachConnection`) so
 *     tests don't need the singleton.
 *   - The authorizer is a DI seam too — production wires the AS-4
 *     payload-resolver pattern (closure capture), tests pass a
 *     pre-configured async stub.
 */

import {
  authorizeRealtimeDocConnection,
  type RealtimeDocAuthorizationDenyReason,
  type RealtimeDocAuthorizationResult,
  type GetVaultIdsForUserFn,
} from "./realtime-doc-authorize.js";
import type {
  RealtimeDocConnection,
  RealtimeDocTransport,
} from "./realtime-doc-transport.js";
import type { RealtimeDocSessionKey } from "./realtime-doc.js";

export const REALTIME_DOC_DENY_CLOSE_CODES: Record<
  RealtimeDocAuthorizationDenyReason,
  number
> = {
  missing_user_id: 4401,
  not_a_vault_member: 4403,
  vault_membership_lookup_failed: 4500,
} as const;

export type AuthorizeRealtimeDocConnectionFn = (input: {
  readonly sessionKey: RealtimeDocSessionKey;
  readonly userId: number | null | undefined;
}) => Promise<RealtimeDocAuthorizationResult>;

export interface HandleRealtimeDocUpgradeInput {
  readonly conn: RealtimeDocConnection;
  readonly sessionKey: RealtimeDocSessionKey;
  readonly userId: number | null | undefined;
  readonly transport: Pick<RealtimeDocTransport, "attachConnection">;
  /** Pre-bound authorizer. Production: closure that captures
   *  `getVaultIdsForUser`; tests pass a pre-configured stub.
   *  When omitted, the caller must supply `getVaultIdsForUser`. */
  readonly authorize?: AuthorizeRealtimeDocConnectionFn;
  /** Production wiring — passed through to the default authorizer
   *  when `authorize` is not supplied. */
  readonly getVaultIdsForUser?: GetVaultIdsForUserFn;
}

export type HandleRealtimeDocUpgradeResult =
  | { readonly attached: true; readonly disposer: () => void }
  | {
      readonly attached: false;
      readonly reason: RealtimeDocAuthorizationDenyReason;
      readonly closeCode: number;
    };

function makeDefaultAuthorize(
  getVaultIdsForUser: GetVaultIdsForUserFn,
): AuthorizeRealtimeDocConnectionFn {
  return ({ sessionKey, userId }) =>
    authorizeRealtimeDocConnection({
      sessionKey,
      userId,
      getVaultIdsForUser,
    });
}

/**
 * Compose authz + transport attach. Production calls this from
 * inside the WebSocket-upgrade pipeline once the framework decides
 * the upgrade has produced a `RealtimeDocConnection`-shaped handle.
 */
export async function handleRealtimeDocUpgrade(
  input: HandleRealtimeDocUpgradeInput,
): Promise<HandleRealtimeDocUpgradeResult> {
  const authorize =
    input.authorize ??
    (input.getVaultIdsForUser
      ? makeDefaultAuthorize(input.getVaultIdsForUser)
      : null);
  if (!authorize) {
    throw new Error(
      "handleRealtimeDocUpgrade: must supply either `authorize` or `getVaultIdsForUser`",
    );
  }

  const decision = await authorize({
    sessionKey: input.sessionKey,
    userId: input.userId,
  });

  if (decision.allow) {
    const disposer = input.transport.attachConnection(input.conn, {
      sessionKey: input.sessionKey,
    });
    return { attached: true, disposer };
  }

  // Narrow `decision` to the deny variant. Repo runs `strict: false`
  // so the discriminated union does not auto-narrow after the early
  // return above; pull the deny payload out explicitly.
  const denyReason = (decision as { allow: false; reason: RealtimeDocAuthorizationDenyReason }).reason;
  const closeCode = REALTIME_DOC_DENY_CLOSE_CODES[denyReason];
  try {
    input.conn.close(closeCode, denyReason);
  } catch {
    // Tolerate a connection that's already closed (race against
    // client-side abort). The deny outcome is unchanged.
  }
  return { attached: false, reason: denyReason, closeCode };
}
