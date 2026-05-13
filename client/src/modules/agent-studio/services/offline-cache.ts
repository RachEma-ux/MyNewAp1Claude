/**
 * Agent Studio — client-side offline cache + write queue
 * (V2 Phase OL-1 first slice).
 *
 * Tracks the offline cache contract per the ADR
 * `docs/architecture/agent-studio-offline-local-first.md`:
 *
 *   - Server Postgres is the canonical source of truth.
 *   - The client-side cache is a DERIVED view of a workspace
 *     subset. Read-fast, write-buffered.
 *   - Offline mutations queue locally and are drained on reconnect
 *     through the standard tRPC write paths (governance reapplies
 *     server-side).
 *   - Graph mutations + agent/RAG operations are DENIED while
 *     offline — the deny-mutation gate is the load-bearing rule
 *     that prevents an offline escape hatch around governance.
 *
 * This file is the pure data-model + queue surface. The actual
 * IndexedDB binding (and any service-worker wiring) lands in
 * Phase OL-2 — this PR ships the contract + queue semantics so
 * tests can verify the rules without a browser.
 */

export const OFFLINE_OPERATION_KINDS = [
  "vault.note.update",
  "vault.note.create",
  "vault.note.delete",
] as const;

export type OfflineOperationKind =
  (typeof OFFLINE_OPERATION_KINDS)[number];

export function isOfflineOperationKind(
  s: unknown,
): s is OfflineOperationKind {
  return (
    typeof s === "string" &&
    (OFFLINE_OPERATION_KINDS as readonly string[]).includes(s)
  );
}

/**
 * Operations that MUST NOT be queued offline — they require
 * server-side state the client cannot validate. Listed explicitly
 * (allowlist mirror of OFFLINE_OPERATION_KINDS) so a future
 * contributor adding a new offline-queueable kind has to think
 * about the security model.
 *
 * The DENIED set is the source-of-truth for the V2 Phase OL-1 ADR
 * §"Graph projection behavior" deny-mutation rule.
 */
export const OFFLINE_DENIED_OPERATION_KINDS = [
  "graph.node.create",
  "graph.node.update",
  "graph.edge.create",
  "graph.edge.delete",
  "graph.change.proposal.create",
  "graph.change.proposal.approve",
  "promotion.create",
  "promotion.approve",
  "graphAgent.run",
  "graphRag.query",
  "openrouter.execute",
  "mcp.dispatch",
] as const;

export type OfflineDeniedOperationKind =
  (typeof OFFLINE_DENIED_OPERATION_KINDS)[number];

export class OfflineMutationDeniedError extends Error {
  readonly code = "offline_mutation_denied";
  constructor(
    public readonly attemptedKind: string,
    reason: string,
  ) {
    super(
      `Offline mutation denied: ${attemptedKind} — ${reason}. ` +
        `Reconnect and retry; graph mutations and agent/RAG operations require a live connection.`,
    );
    this.name = "OfflineMutationDeniedError";
  }
}

export interface OfflineQueueEntry {
  readonly id: string;
  readonly kind: OfflineOperationKind;
  readonly payload: Record<string, unknown>;
  readonly queuedAt: Date;
  readonly attempts: number;
  readonly lastError?: string;
}

/**
 * Pure guard. Returns true iff the named operation is allowed to
 * queue locally while offline. The deny set is the load-bearing
 * security invariant of the offline mode.
 */
export function isOperationOfflineQueueable(kind: string): boolean {
  if (
    (OFFLINE_DENIED_OPERATION_KINDS as readonly string[]).includes(kind)
  ) {
    return false;
  }
  return isOfflineOperationKind(kind);
}

/**
 * Pure check — throws `OfflineMutationDeniedError` when the
 * operation is on the deny list. Callers use this BEFORE staging
 * a mutation into the offline queue.
 */
export function assertOfflineQueueable(kind: string): void {
  if (
    (OFFLINE_DENIED_OPERATION_KINDS as readonly string[]).includes(kind)
  ) {
    throw new OfflineMutationDeniedError(
      kind,
      "in deny-list; requires live connection for governance",
    );
  }
  if (!isOfflineOperationKind(kind)) {
    throw new OfflineMutationDeniedError(
      kind,
      "not in the offline-queueable allowlist",
    );
  }
}

/**
 * In-memory offline queue. Persistence (IndexedDB) is a separate
 * concern wired in Phase OL-2; this implementation keeps the
 * queue semantics testable without a browser environment.
 */
export class OfflineQueue {
  private readonly entries: OfflineQueueEntry[] = [];

  size(): number {
    return this.entries.length;
  }

  list(): ReadonlyArray<OfflineQueueEntry> {
    return [...this.entries];
  }

  enqueue(input: {
    readonly kind: string;
    readonly payload: Record<string, unknown>;
    /** Caller-supplied id (e.g. UUIDv4) so the entry is durable
     *  across reconnect/retry. */
    readonly id: string;
  }): OfflineQueueEntry {
    assertOfflineQueueable(input.kind);
    const entry: OfflineQueueEntry = {
      id: input.id,
      kind: input.kind as OfflineOperationKind,
      payload: input.payload,
      queuedAt: new Date(),
      attempts: 0,
    };
    this.entries.push(entry);
    return entry;
  }

  /**
   * Drain the queue by invoking the supplied `drainOne` callback
   * for each entry in order. On a thrown error, the entry's
   * `attempts` counter is incremented + `lastError` recorded; the
   * entry stays in the queue. On success the entry is removed.
   *
   * Returns the count of successful drains.
   */
  async drain(
    drainOne: (entry: OfflineQueueEntry) => Promise<void>,
  ): Promise<number> {
    let drained = 0;
    const remaining: OfflineQueueEntry[] = [];
    for (const entry of this.entries) {
      try {
        await drainOne(entry);
        drained += 1;
      } catch (err) {
        remaining.push({
          ...entry,
          attempts: entry.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.entries.length = 0;
    this.entries.push(...remaining);
    return drained;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
