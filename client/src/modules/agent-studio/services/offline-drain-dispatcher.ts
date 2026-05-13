/**
 * Offline drain dispatcher — V2 Phase OL-4.
 *
 * Composes Phase OL-3 (#773) `installOfflineDrainListener({ onDrain })`
 * with a per-operationKind handler registry, so the offline queue can
 * drain into the standard tRPC write path without each call site
 * hand-rolling its own dispatch switch.
 *
 * Pattern mirrors the server-side `publish-targets/registry.ts`:
 *   - module-scoped Map keyed by operation kind
 *   - register / get / list public surface
 *   - `__reset...ForTests` mutation seam (source-scan-pinned)
 *
 * The dispatcher itself is a pure composer: given a registry
 * snapshot, it returns an `OfflineDrainOne` function that the
 * Phase OL-3 listener accepts as its `onDrain` option.
 *
 * Why dispatch by kind:
 *   - Each `OFFLINE_OPERATION_KINDS` value (vault.note.update /
 *     vault.note.create / vault.note.delete today) needs a distinct
 *     tRPC mutation call. Hard-coding the routing in the bootstrap
 *     would block module-level testability and bind the OL-4 layer
 *     to a specific tRPC client. Registration keeps it decoupled.
 *
 * Hard-rule compliance (CLAUDE.md + OL-1 deny-list):
 *   - The dispatcher does NOT validate against
 *     `OFFLINE_DENIED_OPERATION_KINDS` — `enqueue()` already enforces
 *     that gate at staging time, so the queue cannot contain denied
 *     kinds. The dispatcher throws on an UNREGISTERED kind so a
 *     silent drop never masks a missing wiring.
 *   - No `credential-resolver` import. No raw `process.env.*_API_KEY`.
 *   - No `dispatchMcpToolCall` import. No `neo4j-driver` import.
 *   - Pure client-side module. No DB, no network — that's the
 *     caller's job in the registered impl.
 */

import type { OfflineQueueEntry } from "./offline-cache.js";

export type OfflineDrainImpl = (
  payload: Record<string, unknown>,
  entry: OfflineQueueEntry,
) => Promise<void>;

export interface RegisterOfflineDrainImplInput {
  readonly kind: string;
  readonly impl: OfflineDrainImpl;
}

const registry = new Map<string, OfflineDrainImpl>();

export function registerOfflineDrainImpl(
  input: RegisterOfflineDrainImplInput,
): void {
  registry.set(input.kind, input.impl);
}

export function getOfflineDrainImpl(
  kind: string,
): OfflineDrainImpl | null {
  return registry.get(kind) ?? null;
}

export function listRegisteredOfflineDrainKinds(): readonly string[] {
  return [...registry.keys()].sort();
}

/**
 * Test seam — clears the registry. Production code MUST NOT call
 * this. Source-scan tests pin the visibility of this symbol.
 */
export function __resetOfflineDrainRegistryForTests(): void {
  registry.clear();
}

export class OfflineDrainImplNotRegisteredError extends Error {
  readonly code = "offline_drain_impl_not_registered";
  constructor(public readonly kind: string) {
    super(
      `No offline drain impl registered for kind "${kind}". ` +
        `Register one via registerOfflineDrainImpl({ kind, impl }) ` +
        `during app bootstrap.`,
    );
    this.name = "OfflineDrainImplNotRegisteredError";
  }
}

export interface CreateOfflineDrainDispatcherOptions {
  /** Test seam — substitute the registry entirely. Defaults to the
   *  module-scoped registry. */
  readonly lookup?: (kind: string) => OfflineDrainImpl | null;
}

/**
 * Build an `OfflineDrainOne`-compatible function that routes each
 * entry to its registered `OfflineDrainImpl` by `entry.kind`. Pass
 * the result to `installOfflineDrainListener({ onDrain })`.
 *
 * Throws `OfflineDrainImplNotRegisteredError` when an entry's kind
 * has no registered impl. The Phase OL-3 listener catches per-entry
 * errors, increments the entry's `attempts` counter, and leaves the
 * entry queued for the next drain — so an unregistered kind doesn't
 * lose the entry, it just stalls drain progress until the missing
 * impl is wired.
 */
export function createOfflineDrainDispatcher(
  options: CreateOfflineDrainDispatcherOptions = {},
): (entry: OfflineQueueEntry) => Promise<void> {
  const lookup = options.lookup ?? getOfflineDrainImpl;
  return async function dispatch(entry): Promise<void> {
    const impl = lookup(entry.kind);
    if (!impl) {
      throw new OfflineDrainImplNotRegisteredError(entry.kind);
    }
    await impl(entry.payload, entry);
  };
}
