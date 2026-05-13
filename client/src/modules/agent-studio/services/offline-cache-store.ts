/**
 * Offline queue persistence adapters — V2 Phase OL-2 first slice.
 *
 * PR-V2-3 (#756) shipped the in-memory `OfflineQueue`; the data
 * model + deny-list semantics + queue ordering all worked, but the
 * queue evaporated on page reload. OL-2 closes the durability gap
 * by adding an `OfflineQueueStore` contract + two adapters:
 *
 *   - `InMemoryOfflineQueueStore` — pure-Map-backed default. Used by
 *     unit tests (no IndexedDB required) and as a fall-through for
 *     non-browser environments (server-side rendering, headless
 *     scripts).
 *   - `IndexedDbOfflineQueueStore` — production adapter. Lazy-opens
 *     a database `agent-studio-offline` with one object store
 *     `offline_queue` keyed by entry id. Survives page reloads.
 *
 * Hard-rule compliance (CLAUDE.md Non-Build List):
 *   - Client-side cache is a DERIVED view of Postgres. Persisting
 *     the offline write queue does NOT change the source-of-truth
 *     contract — server reconciliation still re-runs governance.
 *   - The deny-mutation gate (`OFFLINE_DENIED_OPERATION_KINDS`)
 *     remains the load-bearing security invariant; persistence is
 *     orthogonal to authorization.
 *   - No `credential-resolver` import. No raw `process.env.*_API_KEY`.
 *
 * Idempotency:
 *   - `put(entry)` is an upsert keyed by `entry.id` — re-queuing
 *     the same entry (e.g. a retry-after-failure path) replaces the
 *     prior row in IDB, preserving the caller-supplied UUID as the
 *     durable identity.
 */

import type { OfflineQueueEntry } from "./offline-cache.js";

export interface OfflineQueueStore {
  /** Insert or replace an entry by id. */
  put(entry: OfflineQueueEntry): Promise<void>;
  /** Delete one entry by id. No-op if absent. */
  delete(id: string): Promise<void>;
  /** Read all entries in insertion order. Empty array if uninitialized. */
  getAll(): Promise<OfflineQueueEntry[]>;
  /** Remove every entry. */
  clear(): Promise<void>;
}

// ============================================================================
// In-memory adapter (test default + non-browser fall-through)
// ============================================================================

export class InMemoryOfflineQueueStore implements OfflineQueueStore {
  private readonly entries = new Map<string, OfflineQueueEntry>();
  private readonly insertionOrder: string[] = [];

  async put(entry: OfflineQueueEntry): Promise<void> {
    if (!this.entries.has(entry.id)) {
      this.insertionOrder.push(entry.id);
    }
    this.entries.set(entry.id, entry);
  }

  async delete(id: string): Promise<void> {
    if (!this.entries.delete(id)) return;
    const idx = this.insertionOrder.indexOf(id);
    if (idx >= 0) this.insertionOrder.splice(idx, 1);
  }

  async getAll(): Promise<OfflineQueueEntry[]> {
    return this.insertionOrder
      .map((id) => this.entries.get(id))
      .filter((e): e is OfflineQueueEntry => e !== undefined);
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.insertionOrder.length = 0;
  }
}

// ============================================================================
// IndexedDB adapter (production)
// ============================================================================

const DB_NAME = "agent-studio-offline";
const DB_VERSION = 1;
const STORE_NAME = "offline_queue";

function isIndexedDbAvailable(): boolean {
  return typeof globalThis !== "undefined" && "indexedDB" in globalThis;
}

/**
 * IDB-backed offline-queue store. Wraps the raw IndexedDB API
 * with a small, promise-friendly surface that matches the
 * `OfflineQueueStore` contract.
 *
 * The store keeps `OfflineQueueEntry.queuedAt` as a Date — IDB
 * structured clone preserves the Date type natively, so we don't
 * serialize through JSON.
 */
export class IndexedDbOfflineQueueStore implements OfflineQueueStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName: string = DB_NAME,
    private readonly storeName: string = STORE_NAME,
  ) {}

  private openDb(): Promise<IDBDatabase> {
    if (!isIndexedDbAvailable()) {
      return Promise.reject(
        new Error(
          "IndexedDB is not available in this environment. " +
            "Use InMemoryOfflineQueueStore for non-browser code paths.",
        ),
      );
    }
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = globalThis.indexedDB.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    });
    return this.dbPromise;
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.openDb();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(this.storeName, mode);
      const store = tx.objectStore(this.storeName);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error ?? new Error("IDB op failed"));
    });
  }

  async put(entry: OfflineQueueEntry): Promise<void> {
    await this.withStore("readwrite", (s) => s.put(entry));
  }

  async delete(id: string): Promise<void> {
    await this.withStore("readwrite", (s) => s.delete(id));
  }

  async getAll(): Promise<OfflineQueueEntry[]> {
    const all = await this.withStore<OfflineQueueEntry[]>(
      "readonly",
      (s) => s.getAll() as IDBRequest<OfflineQueueEntry[]>,
    );
    // IDB getAll() returns entries in key (id) order; the offline
    // queue cares about insertion order. We sort by queuedAt to
    // re-establish FIFO semantics on reload — entries with identical
    // queuedAt fall back to id sort, which is stable.
    return [...all].sort((a, b) => {
      const ta = a.queuedAt instanceof Date ? a.queuedAt.getTime() : 0;
      const tb = b.queuedAt instanceof Date ? b.queuedAt.getTime() : 0;
      if (ta !== tb) return ta - tb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  async clear(): Promise<void> {
    await this.withStore("readwrite", (s) => s.clear());
  }
}

/**
 * Factory — returns the best available store for the current
 * runtime. Production callers should prefer this over instantiating
 * an adapter directly.
 */
export function createOfflineQueueStore(): OfflineQueueStore {
  if (isIndexedDbAvailable()) {
    return new IndexedDbOfflineQueueStore();
  }
  return new InMemoryOfflineQueueStore();
}
