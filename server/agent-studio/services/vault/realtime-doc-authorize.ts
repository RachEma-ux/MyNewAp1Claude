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

// ============================================================================
// Per-deny-reason operator-facing metadata (T-B.1)
// ============================================================================

export interface RealtimeDocAuthorizationDenyReasonMetadata {
  /** Display label for operator dashboards / WS-upgrade decline logs. */
  readonly label: string;
  /** Short operator-facing description of why this denial occurred. */
  readonly description: string;
  /** Closed-taxonomy classification:
   *  - `auth_required`: the caller is not authenticated — surface a
   *    re-login prompt.
   *  - `policy_denial`: the user IS authenticated but lacks vault
   *    membership — surface "request access" affordance.
   *  - `transient_failure`: lookup itself failed (DB error, timeout)
   *    — caller may retry. */
  readonly classification:
    | "auth_required"
    | "policy_denial"
    | "transient_failure";
  /** Operator-facing remediation hint. */
  readonly remediation: string;
}

export const REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA: Readonly<
  Record<
    RealtimeDocAuthorizationDenyReason,
    RealtimeDocAuthorizationDenyReasonMetadata
  >
> = {
  missing_user_id: {
    label: "Missing User ID",
    description:
      "The WS-upgrade handler invoked authorization without a resolved userId — typically an unauthenticated connection attempt.",
    classification: "auth_required",
    remediation:
      "Verify the auth layer attaches a userId before invoking the realtime-doc handler. If OAuth is bypassed, demo-mode connections need a stub user id.",
  },
  not_a_vault_member: {
    label: "Not a Vault Member",
    description:
      "Authenticated user is not a member of the target vault — vault-membership table returned no match for this user+vault pair.",
    classification: "policy_denial",
    remediation:
      "Surface a 'request access' affordance in the realtime-doc UI; do not auto-grant. Operator decides whether to add the user to the vault via the admin panel.",
  },
  vault_membership_lookup_failed: {
    label: "Membership Lookup Failed",
    description:
      "The vault-membership query threw — defensive deny means the realtime-doc handler returned no allowance, but the underlying error is logged separately.",
    classification: "transient_failure",
    remediation:
      "Investigate the lookup error in the trace logs. Caller may retry safely — the deny is fail-closed for safety, not a permanent rejection.",
  },
};

export function getRealtimeDocAuthorizationDenyReasonMetadata(
  reason: RealtimeDocAuthorizationDenyReason,
): RealtimeDocAuthorizationDenyReasonMetadata {
  return REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA[reason];
}

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
