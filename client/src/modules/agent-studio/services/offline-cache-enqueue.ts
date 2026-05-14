/**
 * Offline-cache enqueue helper — V2 Phase OL-8.
 *
 * Closes the consumer side of the OL-1..OL-7 compose chain. The
 * chain is now bootstrapped at `main.tsx` boot (OL-7) and ready to
 * drain on reconnect (OL-3 + OL-6) — but until this slice no call
 * site had a one-line, type-narrowed way to put an entry IN.
 *
 * This is the call-site surface: a single helper that
 *   1. Asserts the kind is in the OL-1 allowlist (deny-list throws)
 *   2. Generates a UUIDv4 id when the caller does not supply one
 *   3. Routes the entry through the OL-3 module-singleton queue
 *
 * Why not match each `agentStudio.vault.*Note` input shape exactly:
 *   The offline-cache module stays tRPC-type-free by design (see
 *   the OL-7 wire-up file's comment block). Coupling this helper to
 *   `AppRouter` would re-introduce that dependency at every UI call
 *   site. Callers pass plain `Record<string, unknown>` payloads that
 *   the server re-validates with the same Zod the live tRPC mutation
 *   uses; the offline drain replays the exact payload at enqueue
 *   time, so server-side guarantees are unchanged.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` import. No `dispatchMcpToolCall`
 *     import. No `*_API_KEY` reads. No `neo4j-driver` import.
 *   - The OL-1 deny-list is still the only enqueue gate — this
 *     helper delegates to `OfflineQueue.enqueue()` which calls
 *     `assertOfflineQueueable(kind)` before staging.
 */

import {
  type OfflineOperationKind,
  type OfflineQueueEntry,
} from "./offline-cache.js";
import {
  getOfflineQueueInstance,
  type GetOfflineQueueInstanceOptions,
} from "./offline-cache-bootstrap.js";

export interface EnqueueOfflineVaultMutationInput
  extends GetOfflineQueueInstanceOptions {
  /** Closed-union kind for the OL-1 allowlist. */
  readonly kind: OfflineOperationKind;
  /** Mutation payload — replayed verbatim by the offline drain.
   *  Shape must match the live tRPC mutation input; the server re-
   *  runs the same Zod on drain so a malformed payload fails server-
   *  side rather than silently dropping. */
  readonly payload: Record<string, unknown>;
  /** Optional caller-supplied id. When omitted, the helper generates
   *  a UUIDv4 via the `generateId` seam (default `crypto.randomUUID`). */
  readonly id?: string;
  /** Test seam — override id generation. */
  readonly generateId?: () => string;
}

function defaultGenerateId(): string {
  return crypto.randomUUID();
}

/**
 * Stage one vault-note mutation into the offline queue.
 *
 * Throws `OfflineMutationDeniedError` if `kind` is on the OL-1 deny
 * list or not in the offline-queueable allowlist (re-export below
 * for callers that want to catch + degrade gracefully).
 */
export function enqueueOfflineVaultMutation(
  input: EnqueueOfflineVaultMutationInput,
): OfflineQueueEntry {
  const queue = getOfflineQueueInstance({ queue: input.queue });
  const id = input.id ?? (input.generateId ?? defaultGenerateId)();
  return queue.enqueue({
    kind: input.kind,
    payload: input.payload,
    id,
  });
}

export { OfflineMutationDeniedError } from "./offline-cache.js";
