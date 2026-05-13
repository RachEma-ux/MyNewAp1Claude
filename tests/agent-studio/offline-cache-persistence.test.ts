/**
 * Offline-queue persistence tests — V2 Phase OL-2.
 *
 * Covers:
 *   - InMemoryOfflineQueueStore: put / getAll / delete / clear, in
 *     insertion order. Re-put is an upsert (same key replaces).
 *   - createOfflineQueueStore picks the right adapter for the env
 *     (in-memory in jsdom without explicit IDB; IDB-flagged when
 *     a stub is installed).
 *   - OfflineQueue with persistence: enqueue mirrors to store
 *   - OfflineQueue.hydrate() rehydrates from store on construction
 *   - drain success removes the entry from the store
 *   - drain failure persists the updated attempts + lastError
 *   - clear() empties both in-memory + store
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     *_API_KEY reads in the new persistence module
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OfflineQueue,
  type OfflineQueueEntry,
} from "../../client/src/modules/agent-studio/services/offline-cache.js";
import {
  InMemoryOfflineQueueStore,
  IndexedDbOfflineQueueStore,
  createOfflineQueueStore,
  type OfflineQueueStore,
} from "../../client/src/modules/agent-studio/services/offline-cache-store.js";

describe("InMemoryOfflineQueueStore", () => {
  it("put + getAll preserves insertion order", async () => {
    const s = new InMemoryOfflineQueueStore();
    await s.put({
      id: "a",
      kind: "vault.note.update",
      payload: {},
      queuedAt: new Date("2026-05-13T00:00:00Z"),
      attempts: 0,
    });
    await s.put({
      id: "b",
      kind: "vault.note.create",
      payload: {},
      queuedAt: new Date("2026-05-13T00:01:00Z"),
      attempts: 0,
    });
    const all = await s.getAll();
    expect(all.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("put with existing id is an upsert (replaces value, preserves position)", async () => {
    const s = new InMemoryOfflineQueueStore();
    await s.put({
      id: "a",
      kind: "vault.note.update",
      payload: { v: 1 },
      queuedAt: new Date(),
      attempts: 0,
    });
    await s.put({
      id: "b",
      kind: "vault.note.update",
      payload: {},
      queuedAt: new Date(),
      attempts: 0,
    });
    await s.put({
      id: "a",
      kind: "vault.note.update",
      payload: { v: 2 },
      queuedAt: new Date(),
      attempts: 1,
      lastError: "boom",
    });
    const all = await s.getAll();
    expect(all.map((e) => e.id)).toEqual(["a", "b"]);
    expect(all[0].payload).toEqual({ v: 2 });
    expect(all[0].attempts).toBe(1);
    expect(all[0].lastError).toBe("boom");
  });

  it("delete removes one entry and preserves order of the rest", async () => {
    const s = new InMemoryOfflineQueueStore();
    for (const id of ["a", "b", "c"]) {
      await s.put({
        id,
        kind: "vault.note.update",
        payload: {},
        queuedAt: new Date(),
        attempts: 0,
      });
    }
    await s.delete("b");
    const all = await s.getAll();
    expect(all.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("clear empties the store", async () => {
    const s = new InMemoryOfflineQueueStore();
    await s.put({
      id: "a",
      kind: "vault.note.update",
      payload: {},
      queuedAt: new Date(),
      attempts: 0,
    });
    await s.clear();
    expect(await s.getAll()).toEqual([]);
  });
});

describe("createOfflineQueueStore — environment dispatch", () => {
  const original = (globalThis as { indexedDB?: unknown }).indexedDB;

  afterEach(() => {
    if (original === undefined) {
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
    } else {
      (globalThis as { indexedDB?: unknown }).indexedDB = original;
    }
  });

  it("returns InMemory store when indexedDB is absent", () => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    const s = createOfflineQueueStore();
    expect(s).toBeInstanceOf(InMemoryOfflineQueueStore);
  });

  it("returns IndexedDbOfflineQueueStore when indexedDB is present", () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = {
      open: vi.fn(),
    } as unknown;
    const s = createOfflineQueueStore();
    expect(s).toBeInstanceOf(IndexedDbOfflineQueueStore);
  });
});

describe("OfflineQueue with persistence adapter", () => {
  let store: OfflineQueueStore;
  let queue: OfflineQueue;

  beforeEach(() => {
    store = new InMemoryOfflineQueueStore();
    queue = new OfflineQueue(store);
  });

  it("enqueue mirrors to the persistence store", async () => {
    queue.enqueue({ id: "a", kind: "vault.note.update", payload: { v: 1 } });
    // The persistence write is fire-and-forget; await a microtask.
    await Promise.resolve();
    const all = await store.getAll();
    expect(all.map((e) => e.id)).toEqual(["a"]);
  });

  it("hydrate restores entries from the store on construction", async () => {
    await store.put({
      id: "x",
      kind: "vault.note.update",
      payload: { rehydrated: true },
      queuedAt: new Date(),
      attempts: 0,
    });
    const q2 = new OfflineQueue(store);
    expect(q2.size()).toBe(0); // not yet hydrated
    await q2.hydrate();
    expect(q2.size()).toBe(1);
    expect(q2.list()[0].id).toBe("x");
  });

  it("drain success removes the entry from the persistence store", async () => {
    queue.enqueue({ id: "a", kind: "vault.note.update", payload: {} });
    queue.enqueue({ id: "b", kind: "vault.note.update", payload: {} });
    await Promise.resolve();
    const drained = await queue.drain(async () => {
      // success on both
    });
    expect(drained).toBe(2);
    expect((await store.getAll()).length).toBe(0);
  });

  it("drain failure persists the updated attempts + lastError", async () => {
    queue.enqueue({ id: "a", kind: "vault.note.update", payload: {} });
    await Promise.resolve();
    await queue.drain(async () => {
      throw new Error("network down");
    });
    const all = await store.getAll();
    expect(all.length).toBe(1);
    expect(all[0].attempts).toBe(1);
    expect(all[0].lastError).toMatch(/network down/);
  });

  it("clear empties both the in-memory + store", async () => {
    queue.enqueue({ id: "a", kind: "vault.note.update", payload: {} });
    await Promise.resolve();
    await queue.clear();
    expect(queue.size()).toBe(0);
    expect((await store.getAll()).length).toBe(0);
  });
});

describe("OfflineQueue without persistence — OL-1 compat", () => {
  it("works identically to OL-1 when constructed without an adapter", async () => {
    const queue = new OfflineQueue();
    queue.enqueue({ id: "1", kind: "vault.note.update", payload: { a: 1 } });
    queue.enqueue({ id: "2", kind: "vault.note.update", payload: { a: 2 } });
    const drained = await queue.drain(async () => {});
    expect(drained).toBe(2);
    expect(queue.size()).toBe(0);
  });
});

describe("IndexedDbOfflineQueueStore — environment guard", () => {
  const original = (globalThis as { indexedDB?: unknown }).indexedDB;

  afterEach(() => {
    if (original === undefined) {
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
    } else {
      (globalThis as { indexedDB?: unknown }).indexedDB = original;
    }
  });

  it("rejects when indexedDB is unavailable", async () => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    const s = new IndexedDbOfflineQueueStore();
    const entry: OfflineQueueEntry = {
      id: "a",
      kind: "vault.note.update",
      payload: {},
      queuedAt: new Date(),
      attempts: 0,
    };
    await expect(s.put(entry)).rejects.toThrow(/IndexedDB is not available/);
  });
});

describe("source-scan boundary — offline-cache-store.ts", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/services/offline-cache-store.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does not import credential-resolver (Plan v3 D2)", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not import the MCP dispatcher", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });

  it("does not import neo4j-driver (client-only module)", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });
});
