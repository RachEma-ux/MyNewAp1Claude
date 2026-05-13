/**
 * Default offline drain impls — V2 Phase OL-5.
 *
 * Wires up the three default `OFFLINE_OPERATION_KINDS`
 * (vault.note.create / vault.note.update / vault.note.delete) into
 * the OL-4 drain dispatcher registry, given the operator-supplied
 * tRPC mutation closures.
 *
 * Mirror of `server/agent-studio/services/publish-targets/defaults.ts`:
 *   - factory takes per-kind injected closures rather than a tRPC
 *     client namespace (keeps this file tRPC-type-free and avoids
 *     pulling the `AppRouter` shape into the offline-cache module);
 *   - idempotent — re-invocation overwrites the prior registration
 *     for each kind;
 *   - returns the list of kinds registered so the caller can audit
 *     the wire-up in a smoke test or telemetry beacon.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` import; the tRPC client owns auth.
 *   - No `dispatchMcpToolCall` import.
 *   - No raw `process.env.*_API_KEY` reads.
 *   - No `neo4j-driver` import.
 *   - Each registered impl re-runs through the live tRPC write path
 *     — the server re-applies governance, so the offline drain
 *     never bypasses the deny-list invariant set by OL-1.
 */

import { registerOfflineDrainImpl } from "./offline-drain-dispatcher.js";
import type { OfflineOperationKind } from "./offline-cache.js";

export type OfflineDrainMutation = (
  payload: Record<string, unknown>,
) => Promise<unknown>;

export interface RegisterDefaultOfflineDrainImplsOptions {
  /** Replays `vault.note.update` entries via the standard tRPC
   *  mutation. Receives the raw payload that was queued. */
  readonly updateNote: OfflineDrainMutation;
  /** Replays `vault.note.create` entries. */
  readonly createNote: OfflineDrainMutation;
  /** Replays `vault.note.delete` entries. */
  readonly deleteNote: OfflineDrainMutation;
}

/**
 * Register the three default vault-note drain impls. Returns the
 * list of `OfflineOperationKind`s wired so callers can verify the
 * wire-up. Idempotent.
 *
 * Each impl wraps the supplied mutation in a thin adapter so the
 * `OfflineDrainImpl` signature `(payload, entry) → Promise<void>`
 * is satisfied. The mutation's return value is discarded — the OL-3
 * listener only cares whether the call resolved or threw.
 */
export function registerDefaultOfflineDrainImpls(
  opts: RegisterDefaultOfflineDrainImplsOptions,
): OfflineOperationKind[] {
  registerOfflineDrainImpl({
    kind: "vault.note.update",
    impl: async (payload) => {
      await opts.updateNote(payload);
    },
  });
  registerOfflineDrainImpl({
    kind: "vault.note.create",
    impl: async (payload) => {
      await opts.createNote(payload);
    },
  });
  registerOfflineDrainImpl({
    kind: "vault.note.delete",
    impl: async (payload) => {
      await opts.deleteNote(payload);
    },
  });
  return ["vault.note.create", "vault.note.delete", "vault.note.update"];
}
