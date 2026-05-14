/**
 * Offline-or-live mutation router — V2 Phase OL-9 (PR-V1-34).
 *
 * The OL-1..OL-8 chain is now end-to-end:
 *   - OL-1..OL-2 — in-memory + persistent OfflineQueue
 *   - OL-3       — module-singleton + drain listener bootstrap
 *   - OL-4..OL-5 — drain dispatcher registry + default impls
 *   - OL-6       — single-call bootstrap composer
 *   - OL-7       — main.tsx wire-up to the live vanilla tRPC client
 *   - OL-8       — enqueueOfflineVaultMutation consumer surface
 *
 * What's still missing: a one-liner UI call sites can use to decide
 * between "call the live mutation" (online) and "enqueue offline"
 * (offline). This OL-9 slice ships that decision.
 *
 * Contract:
 *   `routeVaultMutation({ kind, payload, callLive, isOnline?, ... })`
 *   - When online (default: `navigator.onLine`), invokes `callLive`
 *     and returns `{ mode: "live", result }`.
 *   - When offline, calls `enqueueOfflineVaultMutation` and returns
 *     `{ mode: "queued", entry }`.
 *
 * Why a router function and not a React hook:
 *   - Pure function = trivially testable without JSDOM / React Query.
 *   - Call sites already have the trpc client in scope; passing
 *     `callLive` is no more code than `mutation.mutateAsync`.
 *   - The OL-1..OL-8 chain is React-free by design (see OL-5/OL-7
 *     comments); a hook layer would re-introduce the coupling and
 *     belongs in a separate UI-layer PR if/when needed.
 *
 * Hard-rule compliance:
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` imports.
 *   - tRPC-type-free — `callLive` is a `(payload) => Promise<unknown>`
 *     closure the call site captures from its own typed mutation.
 *   - Online path runs unchanged code (server re-runs governance).
 *     Offline path goes through the OL-1 deny-list gate.
 */

import {
  enqueueOfflineVaultMutation,
  type EnqueueOfflineVaultMutationInput,
} from "./offline-cache-enqueue.js";
import type {
  OfflineOperationKind,
  OfflineQueueEntry,
} from "./offline-cache.js";

export interface RouteVaultMutationInput
  extends Omit<EnqueueOfflineVaultMutationInput, "kind" | "payload"> {
  readonly kind: OfflineOperationKind;
  readonly payload: Record<string, unknown>;
  /** Live tRPC mutation closure. Receives the same payload that
   *  would be enqueued; returns whatever the live mutation returns. */
  readonly callLive: (payload: Record<string, unknown>) => Promise<unknown>;
  /** Override the online check. Defaults to `navigator.onLine`
   *  (or `true` when `navigator` is unavailable — non-browser env). */
  readonly isOnline?: boolean;
}

export type RouteVaultMutationResult =
  | { readonly mode: "live"; readonly result: unknown }
  | { readonly mode: "queued"; readonly entry: OfflineQueueEntry };

function defaultIsOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/**
 * Route one vault-note mutation either through the live tRPC client
 * (online) or through the offline queue (offline). The server re-
 * runs Zod + governance on every call — the offline drain replays
 * the exact payload at enqueue time.
 *
 * Throws `OfflineMutationDeniedError` if the kind is on the OL-1
 * deny-list when offline. Live-mode errors propagate unchanged.
 */
export async function routeVaultMutation(
  input: RouteVaultMutationInput,
): Promise<RouteVaultMutationResult> {
  const online = input.isOnline ?? defaultIsOnline();
  if (online) {
    const result = await input.callLive(input.payload);
    return { mode: "live", result };
  }
  const entry = enqueueOfflineVaultMutation({
    kind: input.kind,
    payload: input.payload,
    id: input.id,
    generateId: input.generateId,
    queue: input.queue,
  });
  return { mode: "queued", entry };
}
