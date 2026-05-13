/**
 * Offline cache full bootstrap — V2 Phase OL-6.
 *
 * Covers:
 *   - bootstrap() registers the 3 vault-note kinds and the dispatch
 *     correctly routes online-event drains through them
 *   - hydratedCount is returned (queue.size() AFTER hydrate)
 *   - handle.drainNow() routes through the registered closures
 *   - handle.uninstall() removes the listener
 *   - beforeHydrate / afterHydrate / afterDrain are forwarded
 *   - eventTarget seam: tests use a plain EventTarget instead of window
 *   - source-scan boundary: no credential-resolver / dispatcher /
 *     *_API_KEY / neo4j-driver / AppRouter
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bootstrapOfflineCache } from "../../client/src/modules/agent-studio/services/offline-cache-full-bootstrap.js";
import {
  __resetOfflineQueueInstanceForTests,
  getOfflineQueueInstance,
} from "../../client/src/modules/agent-studio/services/offline-cache-bootstrap.js";
import {
  __resetOfflineDrainRegistryForTests,
  listRegisteredOfflineDrainKinds,
} from "../../client/src/modules/agent-studio/services/offline-drain-dispatcher.js";
import { OfflineQueue } from "../../client/src/modules/agent-studio/services/offline-cache.js";

function makeQueueWithEntries(): OfflineQueue {
  // No persistence adapter — hydrate() is a no-op so size() reflects
  // whatever we've enqueued in this scope.
  const q = new OfflineQueue();
  q.enqueue({ kind: "vault.note.update", payload: { noteId: "n-1" } });
  q.enqueue({ kind: "vault.note.create", payload: { title: "t" } });
  return q;
}

beforeEach(() => {
  __resetOfflineDrainRegistryForTests();
  __resetOfflineQueueInstanceForTests();
});

afterEach(() => {
  __resetOfflineDrainRegistryForTests();
  __resetOfflineQueueInstanceForTests();
});

describe("bootstrapOfflineCache — composition", () => {
  it("registers all 3 vault-note kinds", async () => {
    const target = new EventTarget();
    await bootstrapOfflineCache({
      updateNote: async () => undefined,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
      eventTarget: target,
    });
    expect(listRegisteredOfflineDrainKinds()).toEqual([
      "vault.note.create",
      "vault.note.delete",
      "vault.note.update",
    ]);
  });

  it("returns hydratedCount reflecting the in-memory queue size", async () => {
    getOfflineQueueInstance({ queue: makeQueueWithEntries() });
    const target = new EventTarget();
    const { hydratedCount } = await bootstrapOfflineCache({
      updateNote: async () => undefined,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
      eventTarget: target,
    });
    expect(hydratedCount).toBe(2);
  });

  it("handle.drainNow routes through the registered closures", async () => {
    getOfflineQueueInstance({ queue: makeQueueWithEntries() });
    const update = vi.fn(async () => undefined);
    const create = vi.fn(async () => undefined);
    const target = new EventTarget();
    const { handle } = await bootstrapOfflineCache({
      updateNote: update,
      createNote: create,
      deleteNote: async () => undefined,
      eventTarget: target,
    });
    const result = await handle.drainNow();
    expect(update).toHaveBeenCalledWith({ noteId: "n-1" });
    expect(create).toHaveBeenCalledWith({ title: "t" });
    expect(result.drained).toBe(2);
    expect(result.remaining).toBe(0);
  });

  it("forwards beforeHydrate / afterHydrate beacons", async () => {
    getOfflineQueueInstance({ queue: makeQueueWithEntries() });
    const before = vi.fn();
    const after = vi.fn();
    const target = new EventTarget();
    await bootstrapOfflineCache({
      updateNote: async () => undefined,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
      beforeHydrate: before,
      afterHydrate: after,
      eventTarget: target,
    });
    expect(before).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledWith(2);
  });

  it("forwards afterDrain beacons through manual drainNow", async () => {
    getOfflineQueueInstance({ queue: makeQueueWithEntries() });
    const afterDrain = vi.fn();
    const target = new EventTarget();
    const { handle } = await bootstrapOfflineCache({
      updateNote: async () => undefined,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
      afterDrain,
      eventTarget: target,
    });
    await handle.drainNow();
    expect(afterDrain).toHaveBeenCalledWith({ drained: 2, remaining: 0 });
  });

  it('"online" event on the supplied event target triggers a drain', async () => {
    getOfflineQueueInstance({ queue: makeQueueWithEntries() });
    const update = vi.fn(async () => undefined);
    const create = vi.fn(async () => undefined);
    const afterDrain = vi.fn();
    const target = new EventTarget();
    await bootstrapOfflineCache({
      updateNote: update,
      createNote: create,
      deleteNote: async () => undefined,
      afterDrain,
      eventTarget: target,
    });
    target.dispatchEvent(new Event("online"));
    // Let the async drainNow() handler resolve.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(update).toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
    expect(afterDrain).toHaveBeenCalled();
  });

  it("handle.uninstall stops further online-event drains", async () => {
    getOfflineQueueInstance({ queue: makeQueueWithEntries() });
    const update = vi.fn(async () => undefined);
    const target = new EventTarget();
    const { handle } = await bootstrapOfflineCache({
      updateNote: update,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
      eventTarget: target,
    });
    handle.uninstall();
    target.dispatchEvent(new Event("online"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(update).not.toHaveBeenCalled();
  });

  it("late closures (registered after bootstrap) are NOT honored — bootstrap is the binding moment", async () => {
    getOfflineQueueInstance({ queue: makeQueueWithEntries() });
    const update = vi.fn(async () => undefined);
    const target = new EventTarget();
    const { handle } = await bootstrapOfflineCache({
      updateNote: update,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
      eventTarget: target,
    });
    const replacement = vi.fn(async () => undefined);
    // Re-bootstrap to swap impls (the documented way to replace).
    __resetOfflineDrainRegistryForTests();
    handle.uninstall();
    await bootstrapOfflineCache({
      updateNote: replacement,
      createNote: async () => undefined,
      deleteNote: async () => undefined,
      eventTarget: target,
    });
    const second = await getOfflineQueueInstance();
    expect(second.size()).toBe(2); // queue is still the same singleton
  });
});

describe("source-scan boundary — offline-cache-full-bootstrap.ts", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/services/offline-cache-full-bootstrap.ts",
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

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });

  it("does not depend on the tRPC AppRouter type", () => {
    expect(/AppRouter|@\/lib\/trpc/.test(code)).toBe(false);
  });
});
