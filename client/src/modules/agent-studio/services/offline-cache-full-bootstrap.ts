/**
 * Offline cache full bootstrap — V2 Phase OL-6.
 *
 * Composes the entire OL-1 → OL-5 chain into a single call site, so
 * App.tsx / main.tsx wire-up is a one-liner with operator-supplied
 * tRPC mutation closures.
 *
 * Composition order (locked):
 *   1. `registerDefaultOfflineDrainImpls(closures)` — OL-5
 *      Wires the three `OFFLINE_OPERATION_KINDS` into the OL-4
 *      registry before anything tries to drain.
 *   2. `createOfflineDrainDispatcher()` — OL-4
 *      Builds the per-kind router; reads the registry that step 1
 *      just populated.
 *   3. `await hydrateOfflineQueueOnLoad()` — OL-3
 *      Restores persisted entries from the IDB store (OL-2) into the
 *      in-memory queue. Must run BEFORE `installOfflineDrainListener`
 *      so any `online` event after this point sees the full queue.
 *   4. `installOfflineDrainListener({ onDrain: dispatcher })` — OL-3
 *      Registers the `window.addEventListener("online", drainNow)`
 *      handler. Returns an `OfflineDrainListenerHandle` so callers
 *      can manually `drainNow()` (e.g., a "retry now" button) or
 *      `uninstall()` (React cleanup).
 *
 * Why a separate composer rather than collapsing into OL-3:
 *   - The OL-3 bootstrap module is intentionally narrow — it only
 *     knows about the queue + listener. It does NOT know about the
 *     OL-4 registry or the OL-5 defaults. Keeping the composition
 *     here preserves that layering.
 *   - Tests can substitute any of the four steps via the options
 *     seam (eventTarget, beforeHydrate/afterHydrate, afterDrain) so
 *     the composer is verifiable without IDB or a real DOM.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` import.
 *   - No `dispatchMcpToolCall` import.
 *   - No raw `process.env.*_API_KEY` reads.
 *   - No `neo4j-driver` import.
 *   - No `AppRouter` / `@/lib/trpc` import. Callers pass the three
 *     `OfflineDrainMutation` closures directly so this module stays
 *     tRPC-type-free.
 */

import {
  hydrateOfflineQueueOnLoad,
  installOfflineDrainListener,
  type OfflineDrainListenerHandle,
} from "./offline-cache-bootstrap.js";
import { createOfflineDrainDispatcher } from "./offline-drain-dispatcher.js";
import {
  registerDefaultOfflineDrainImpls,
  type OfflineDrainMutation,
} from "./offline-drain-defaults.js";

export interface BootstrapOfflineCacheOptions {
  /** Replays `vault.note.update` entries via the standard tRPC
   *  mutation. Wire to `trpc.agentStudio.vault.updateNote.mutate`. */
  readonly updateNote: OfflineDrainMutation;
  /** Replays `vault.note.create` entries. */
  readonly createNote: OfflineDrainMutation;
  /** Replays `vault.note.delete` entries. */
  readonly deleteNote: OfflineDrainMutation;
  /** Telemetry beacon fired before hydrate kicks off. */
  readonly beforeHydrate?: () => void;
  /** Telemetry beacon fired after hydrate completes (entry count
   *  available). */
  readonly afterHydrate?: (entryCount: number) => void;
  /** Telemetry beacon fired after each automatic drain pass. */
  readonly afterDrain?: (result: {
    drained: number;
    remaining: number;
  }) => void;
  /** Test seam — override the `window` event target. SSR / CLI
   *  paths leave this unset and the listener install becomes a
   *  no-op (per OL-3). */
  readonly eventTarget?: EventTarget;
}

export interface BootstrapOfflineCacheResult {
  /** Number of entries restored from IDB into the in-memory queue. */
  readonly hydratedCount: number;
  /** Listener handle with `drainNow()` + `uninstall()`. Hold onto
   *  this if the caller needs to expose a manual "retry now" button
   *  or to clean up the listener at unmount. */
  readonly handle: OfflineDrainListenerHandle;
}

/**
 * Bootstrap the entire offline-cache subsystem. Idempotent at the
 * registry layer (re-invocation overwrites prior closures per OL-5
 * semantics) but creates a NEW listener handle per call, so callers
 * should `uninstall()` the previous handle if they re-bootstrap.
 */
export async function bootstrapOfflineCache(
  opts: BootstrapOfflineCacheOptions,
): Promise<BootstrapOfflineCacheResult> {
  registerDefaultOfflineDrainImpls({
    updateNote: opts.updateNote,
    createNote: opts.createNote,
    deleteNote: opts.deleteNote,
  });
  const dispatcher = createOfflineDrainDispatcher();
  const { hydratedCount } = await hydrateOfflineQueueOnLoad({
    beforeHydrate: opts.beforeHydrate,
    afterHydrate: opts.afterHydrate,
  });
  const handle = installOfflineDrainListener({
    onDrain: dispatcher,
    eventTarget: opts.eventTarget,
    afterDrain: opts.afterDrain,
  });
  return { hydratedCount, handle };
}
