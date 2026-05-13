/**
 * Offline queue bootstrap — V2 Phase OL-3.
 *
 * Wires the previously-shipped pieces into a working client-side
 * surface:
 *   - OL-1 (#756) shipped the in-memory `OfflineQueue` + deny-list.
 *   - OL-2 (#762) shipped the `OfflineQueueStore` contract +
 *     `InMemoryOfflineQueueStore` + `IndexedDbOfflineQueueStore`
 *     + `createOfflineQueueStore()` factory.
 * Until now the queue was never instantiated at app start — every
 * caller would have constructed its own `new OfflineQueue()` and
 * the persistence + drain logic stayed dormant.
 *
 * This OL-3 slice ships:
 *   - `getOfflineQueueInstance()` — module-singleton accessor.
 *     Lazy-inits with the IDB store on first call; subsequent
 *     calls return the same instance.
 *   - `hydrateOfflineQueueOnLoad()` — call once at app start;
 *     rehydrates persisted entries into the in-memory queue.
 *   - `installOfflineDrainListener({ onDrain })` — installs a
 *     `window.addEventListener("online", ...)` listener that
 *     calls `drain(onDrain)` when the browser reports
 *     reconnection. Returns an `uninstall()` thunk for tests +
 *     React-cleanup hooks.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Client-side cache is a DERIVED view. The drain callback
 *     replays each entry via the standard tRPC write path; the
 *     server re-runs governance on each call.
 *   - `OFFLINE_DENIED_OPERATION_KINDS` (OL-1) is the load-bearing
 *     deny-list. OL-3 does NOT touch that invariant; the queue
 *     still rejects denied kinds at enqueue time.
 *   - No `credential-resolver` import. No raw
 *     `process.env.*_API_KEY` reads. No `neo4j-driver` import.
 *
 * Test seams:
 *   - All three exported functions accept an `options.queue?`
 *     override so unit tests can substitute a queue with a
 *     known-deterministic backing store.
 *   - `installOfflineDrainListener` accepts an `eventTarget?`
 *     override so tests can use a plain `EventTarget` instead of
 *     a JSDOM `window`.
 */

import {
  OfflineQueue,
  type OfflineQueueEntry,
} from "./offline-cache.js";
import { createOfflineQueueStore } from "./offline-cache-store.js";

// ============================================================================
// Module-singleton accessor
// ============================================================================

let _instance: OfflineQueue | null = null;

export interface GetOfflineQueueInstanceOptions {
  /** Test seam — substitute the queue instance entirely. */
  readonly queue?: OfflineQueue;
}

/**
 * Return the process-local OfflineQueue instance, creating it on
 * first call. Idempotent — the same instance is returned for the
 * lifetime of the process.
 */
export function getOfflineQueueInstance(
  options: GetOfflineQueueInstanceOptions = {},
): OfflineQueue {
  if (options.queue) {
    _instance = options.queue;
    return options.queue;
  }
  if (_instance) return _instance;
  _instance = new OfflineQueue(createOfflineQueueStore());
  return _instance;
}

/**
 * Drop the cached instance. Production code MUST NOT call this —
 * source-scan tests pin the symbol visibility.
 */
export function __resetOfflineQueueInstanceForTests(): void {
  _instance = null;
}

// ============================================================================
// Hydrate-on-load
// ============================================================================

export interface HydrateOfflineQueueOptions extends GetOfflineQueueInstanceOptions {
  /** Optional pre-hydrate side-effect (e.g. emit a telemetry
   *  beacon "starting hydrate"). */
  readonly beforeHydrate?: () => void;
  /** Optional post-hydrate side-effect (e.g. emit a telemetry
   *  beacon "hydrated N entries"). */
  readonly afterHydrate?: (entryCount: number) => void;
}

/**
 * Restore persisted entries from the IDB store into the in-memory
 * queue. Call once at app start. Subsequent calls re-hydrate (test
 * scenario) but the queue's `hydrate()` clears the in-memory
 * working set first so duplicate calls don't double-count.
 */
export async function hydrateOfflineQueueOnLoad(
  options: HydrateOfflineQueueOptions = {},
): Promise<{ hydratedCount: number }> {
  const queue = getOfflineQueueInstance(options);
  options.beforeHydrate?.();
  await queue.hydrate();
  const count = queue.size();
  options.afterHydrate?.(count);
  return { hydratedCount: count };
}

// ============================================================================
// Drain-on-online listener
// ============================================================================

export type OfflineDrainOne = (
  entry: OfflineQueueEntry,
) => Promise<void>;

export interface InstallOfflineDrainListenerOptions
  extends GetOfflineQueueInstanceOptions {
  /**
   * Per-entry drain implementation. Production wires this to the
   * standard tRPC client (e.g. for `vault.note.update` it calls
   * `trpc.agentStudio.vault.updateNote.mutate(entry.payload)`).
   * Test stubs pass a no-op or a recorder.
   */
  readonly onDrain: OfflineDrainOne;
  /**
   * Test seam — override the event target. Default is
   * `globalThis.window` (browser only); when unavailable, the
   * installer is a no-op and `uninstall()` is also a no-op.
   */
  readonly eventTarget?: EventTarget;
  /**
   * Optional side-effect after a drain completes (e.g. emit
   * telemetry "drained N / failed M"). */
  readonly afterDrain?: (result: {
    drained: number;
    remaining: number;
  }) => void;
}

export interface OfflineDrainListenerHandle {
  /** Manually trigger a drain (useful for tests + "retry now"
   *  operator UI). Returns the counts. */
  drainNow(): Promise<{ drained: number; remaining: number }>;
  /** Remove the event listener. Idempotent. */
  uninstall(): void;
}

/**
 * Install a `window.addEventListener("online", drainNow)` listener
 * so the queue drains automatically when the browser reports a
 * reconnection. Returns a handle with `drainNow()` for manual
 * triggers + `uninstall()` for React cleanup.
 *
 * When `eventTarget` is unavailable (e.g. SSR / node CLI), the
 * listener install is a no-op and `drainNow()` still works (so
 * callers can drive drains manually).
 */
export function installOfflineDrainListener(
  options: InstallOfflineDrainListenerOptions,
): OfflineDrainListenerHandle {
  const queue = getOfflineQueueInstance(options);
  const target =
    options.eventTarget ??
    (typeof globalThis !== "undefined" &&
    "window" in globalThis &&
    (globalThis as { window?: EventTarget }).window
      ? (globalThis as { window: EventTarget }).window
      : undefined);

  async function drainNow(): Promise<{ drained: number; remaining: number }> {
    const drained = await queue.drain(options.onDrain);
    const remaining = queue.size();
    options.afterDrain?.({ drained, remaining });
    return { drained, remaining };
  }

  const handler = () => {
    void drainNow();
  };

  let installed = false;
  if (target) {
    target.addEventListener("online", handler);
    installed = true;
  }

  return {
    drainNow,
    uninstall: () => {
      if (installed && target) {
        target.removeEventListener("online", handler);
        installed = false;
      }
    },
  };
}
