/**
 * Realtime-doc connection authorization — V1+ CRDT-γ-3-auth (PR-V1-36).
 *
 * The CRDT-γ-2 transport (`realtime-doc-transport.ts` #774) attaches
 * a WebSocket-like connection to a session keyed by
 * `(vaultId, noteId)`. The transport itself does NOT verify that the
 * connecting user is allowed to subscribe — that check lives in the
 * WS-upgrade handler (not yet built) and was explicitly named as
 * out-of-scope at the end of #774.
 *
 * This module ships the pure authorization rule the future
 * upgrade handler will call:
 *
 *   `authorizeRealtimeDocConnection({ sessionKey, userId, getVaultIdsForUser })`
 *
 * Returns:
 *   `{ allow: true }`                                  — user is a member of the vault
 *   `{ allow: false, reason: "not_a_vault_member" }`   — vault id not in user's list
 *   `{ allow: false, reason: "missing_user_id" }`      — null/undefined userId
 *   `{ allow: false, reason: "vault_membership_lookup_failed" }` — DI lookup threw
 *
 * Why a pure helper (not a transport-side hook):
 *   The transport's `attachConnection` is synchronous and returns a
 *   disposer. Adding an async auth check inside would require making
 *   the whole API async (breaking change). Putting auth BEFORE the
 *   attach call keeps the transport contract stable; the upgrade
 *   handler holds the auth + attach in sequence.
 *
 * Defensive failure:
 *   When the DI lookup throws (DB down, etc.), we DENY rather than
 *   ALLOW. A realtime collab session opens a duplex channel — silent-
 *   approve on lookup failure would be a security hole. Operator
 *   tooling can surface the `vault_membership_lookup_failed` reason
 *   for triage.
 *
 * Hard-rule compliance:
 *   - Pure module. No DB / IO. No `credential-resolver`, no
 *     `dispatchMcpToolCall`, no `*_API_KEY`, no `neo4j-driver`.
 *   - `getVaultIdsForUser` is a closure the caller supplies; this
 *     module never imports the repository directly.
 */

import type { RealtimeDocSessionKey } from "./realtime-doc.js";

export const REALTIME_DOC_AUTHORIZATION_DENY_REASONS = [
  "missing_user_id",
  "not_a_vault_member",
  "vault_membership_lookup_failed",
] as const;

export type RealtimeDocAuthorizationDenyReason =
  (typeof REALTIME_DOC_AUTHORIZATION_DENY_REASONS)[number];

export type RealtimeDocAuthorizationResult =
  | { readonly allow: true }
  | {
      readonly allow: false;
      readonly reason: RealtimeDocAuthorizationDenyReason;
    };

export type GetVaultIdsForUserFn = (
  userId: number,
) => Promise<readonly number[]>;

export interface AuthorizeRealtimeDocConnectionInput {
  readonly sessionKey: RealtimeDocSessionKey;
  /** Authenticated user id. `null` / `undefined` → "missing_user_id". */
  readonly userId: number | null | undefined;
  /** DI seam: returns the vault ids the user is a member of. Production
   *  wires this from `VaultRepository.listVaultsForUser` mapped to ids. */
  readonly getVaultIdsForUser: GetVaultIdsForUserFn;
}

/**
 * Pure authorization rule for realtime-doc subscriptions. Caller
 * (WS-upgrade handler) MUST run this before invoking
 * `RealtimeDocTransport.attachConnection`.
 */
export async function authorizeRealtimeDocConnection(
  input: AuthorizeRealtimeDocConnectionInput,
): Promise<RealtimeDocAuthorizationResult> {
  if (input.userId == null) {
    return { allow: false, reason: "missing_user_id" };
  }
  let vaultIds: readonly number[];
  try {
    vaultIds = await input.getVaultIdsForUser(input.userId);
  } catch {
    // Defensive deny — never silent-approve on lookup failure.
    return { allow: false, reason: "vault_membership_lookup_failed" };
  }
  if (!vaultIds.includes(input.sessionKey.vaultId)) {
    return { allow: false, reason: "not_a_vault_member" };
  }
  return { allow: true };
}
