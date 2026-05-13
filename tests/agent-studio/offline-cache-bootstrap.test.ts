/**
 * Offline queue bootstrap tests — V2 Phase OL-3.
 *
 * Covers:
 *   - getOfflineQueueInstance is a module-singleton (returns same
 *     instance on subsequent calls); override seam swaps cleanly;
 *     test reset clears
 *   - hydrateOfflineQueueOnLoad calls queue.hydrate(); before/after
 *     hooks fire
 *   - installOfflineDrainListener registers an "online" handler on
 *     the supplied EventTarget; the handler triggers drain; the
 *     returned handle's `drainNow` manually drains; `uninstall`
 *     removes the listener
 *   - install is a no-op when eventTarget is absent; drainNow still
 *     works manually
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     *_API_KEY / neo4j-driver
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OfflineQueue,
  type OfflineQueueEntry,
} from "../../client/src/modules/agent-studio/services/offline-cache.js";
import { InMemoryOfflineQueueStore } from "../../client/src/modules/agent-studio/services/offline-cache-store.js";
import {
  __resetOfflineQueueInstanceForTests,
  getOfflineQueueInstance,
  hydrateOfflineQueueOnLoad,
  installOfflineDrainListener,
} from "../../client/src/modules/agent-studio/services/offline-cache-bootstrap.js";

beforeEach(() => {
  __resetOfflineQueueInstanceForTests();
});
afterEach(() => {
  __resetOfflineQueueInstanceForTests();
});

function makeQueueWithMemoryStore(): {
  queue: OfflineQueue;
  store: InMemoryOfflineQueueStore;
} {
  const store = new InMemoryOfflineQueueStore();
  const queue = new OfflineQueue(store);
  return { queue, store };
}

describe("getOfflineQueueInstance — singleton accessor", () => {
  it("is idempotent — same instance across calls", () => {
    const a = getOfflineQueueInstance();
    const b = getOfflineQueueInstance();
    expect(a).toBe(b);
  });

  it("accepts an override via options.queue", () => {
    const { queue } = makeQueueWithMemoryStore();
    const got = getOfflineQueueInstance({ queue });
    expect(got).toBe(queue);
  });

  it("__resetOfflineQueueInstanceForTests clears the singleton", () => {
    const a = getOfflineQueueInstance();
    __resetOfflineQueueInstanceForTests();
    const b = getOfflineQueueInstance();
    expect(a).not.toBe(b);
  });
});

describe("hydrateOfflineQueueOnLoad", () => {
  it("hydrates persisted entries into the in-memory queue", async () => {
    const { queue, store } = makeQueueWithMemoryStore();
    await store.put({
      id: "x",
      kind: "vault.note.update",
      payload: { v: 1 },
      queuedAt: new Date(),
      attempts: 0,
    });
    const res = await hydrateOfflineQueueOnLoad({ queue });
    expect(res.hydratedCount).toBe(1);
    expect(queue.size()).toBe(1);
  });

  it("invokes beforeHydrate + afterHydrate hooks", async () => {
    const { queue, store } = makeQueueWithMemoryStore();
    await store.put({
      id: "y",
      kind: "vault.note.update",
      payload: {},
      queuedAt: new Date(),
      attempts: 0,
    });
    const before = vi.fn();
    const after = vi.fn();
    await hydrateOfflineQueueOnLoad({
      queue,
      beforeHydrate: before,
      afterHydrate: after,
    });
    expect(before).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledWith(1);
  });

  it("handles empty store gracefully (count = 0)", async () => {
    const { queue } = makeQueueWithMemoryStore();
    const res = await hydrateOfflineQueueOnLoad({ queue });
    expect(res.hydratedCount).toBe(0);
  });
});

describe("installOfflineDrainListener", () => {
  it("registers an 'online' listener on the supplied EventTarget", () => {
    const target = new EventTarget();
    const add = vi.spyOn(target, "addEventListener");
    const { queue } = makeQueueWithMemoryStore();
    const handle = installOfflineDrainListener({
      queue,
      onDrain: async () => {},
      eventTarget: target,
    });
    expect(add).toHaveBeenCalledWith("online", expect.any(Function));
    handle.uninstall();
  });

  it("'online' event triggers drain via the handler", async () => {
    const target = new EventTarget();
    const { queue } = makeQueueWithMemoryStore();
    queue.enqueue({ id: "1", kind: "vault.note.update", payload: {} });
    queue.enqueue({ id: "2", kind: "vault.note.update", payload: {} });
    const drainOne = vi.fn(async () => {});
    installOfflineDrainListener({
      queue,
      onDrain: drainOne,
      eventTarget: target,
    });
    target.dispatchEvent(new Event("online"));
    // Wait for the microtask queue to flush the void-promise drain.
    await new Promise((r) => setTimeout(r, 0));
    expect(drainOne).toHaveBeenCalledTimes(2);
  });

  it("returns a handle with manual drainNow + uninstall", async () => {
    const target = new EventTarget();
    const { queue } = makeQueueWithMemoryStore();
    queue.enqueue({ id: "1", kind: "vault.note.update", payload: {} });
    const drainOne = vi.fn(async () => {});
    const handle = installOfflineDrainListener({
      queue,
      onDrain: drainOne,
      eventTarget: target,
    });
    const res = await handle.drainNow();
    expect(res.drained).toBe(1);
    expect(res.remaining).toBe(0);
    handle.uninstall();
  });

  it("afterDrain hook fires with { drained, remaining }", async () => {
    const target = new EventTarget();
    const { queue } = makeQueueWithMemoryStore();
    queue.enqueue({ id: "1", kind: "vault.note.update", payload: {} });
    queue.enqueue({ id: "2", kind: "vault.note.update", payload: {} });
    const afterDrain = vi.fn();
    const handle = installOfflineDrainListener({
      queue,
      onDrain: async (entry: OfflineQueueEntry) => {
        if (entry.id === "1") throw new Error("flaky");
      },
      eventTarget: target,
      afterDrain,
    });
    await handle.drainNow();
    expect(afterDrain).toHaveBeenCalledTimes(1);
    expect(afterDrain).toHaveBeenCalledWith({ drained: 1, remaining: 1 });
    handle.uninstall();
  });

  it("uninstall removes the listener (re-dispatch is a no-op)", async () => {
    const target = new EventTarget();
    const { queue } = makeQueueWithMemoryStore();
    queue.enqueue({ id: "1", kind: "vault.note.update", payload: {} });
    const drainOne = vi.fn(async () => {});
    const handle = installOfflineDrainListener({
      queue,
      onDrain: drainOne,
      eventTarget: target,
    });
    handle.uninstall();
    target.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 0));
    expect(drainOne).not.toHaveBeenCalled();
  });

  it("uninstall is idempotent", async () => {
    const target = new EventTarget();
    const { queue } = makeQueueWithMemoryStore();
    const handle = installOfflineDrainListener({
      queue,
      onDrain: async () => {},
      eventTarget: target,
    });
    expect(() => {
      handle.uninstall();
      handle.uninstall();
    }).not.toThrow();
  });

  it("install is a no-op when eventTarget is unavailable but drainNow still works", async () => {
    const { queue } = makeQueueWithMemoryStore();
    queue.enqueue({ id: "1", kind: "vault.note.update", payload: {} });
    const drainOne = vi.fn(async () => {});
    // Pass `undefined` eventTarget explicitly (mirrors SSR/CLI path).
    const handle = installOfflineDrainListener({
      queue,
      onDrain: drainOne,
      eventTarget: undefined as unknown as EventTarget,
    });
    const res = await handle.drainNow();
    expect(res.drained).toBe(1);
    handle.uninstall(); // no-op
  });
});

describe("source-scan boundary — offline-cache-bootstrap.ts", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/services/offline-cache-bootstrap.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does not import credential-resolver", () => {
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
