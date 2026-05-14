/**
 * routeVaultMutation — V2 Phase OL-9 (PR-V1-34).
 *
 * Covers:
 *   - Online path: callLive invoked once with payload; result wrapped
 *     in { mode: "live", result }
 *   - Offline path: enqueueOfflineVaultMutation invoked; callLive
 *     NOT invoked; entry wrapped in { mode: "queued", entry }
 *   - isOnline override wins over navigator.onLine
 *   - Live-mode errors propagate unchanged
 *   - Offline-mode deny-listed kind throws OfflineMutationDeniedError
 *     (and callLive is NOT invoked)
 *   - id / generateId / queue seams pass through to the enqueue helper
 *   - Source-scan boundary
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { routeVaultMutation } from "../../client/src/modules/agent-studio/services/offline-cache-router.js";
import {
  OfflineMutationDeniedError,
  OfflineQueue,
} from "../../client/src/modules/agent-studio/services/offline-cache.js";
import { __resetOfflineQueueInstanceForTests } from "../../client/src/modules/agent-studio/services/offline-cache-bootstrap.js";

afterEach(() => {
  __resetOfflineQueueInstanceForTests();
});

describe("routeVaultMutation — online path", () => {
  it("invokes callLive once with the payload and wraps result", async () => {
    const callLive = vi.fn(async (p: Record<string, unknown>) => ({
      ok: true,
      echoed: p,
    }));
    const res = await routeVaultMutation({
      kind: "vault.note.update",
      payload: { noteId: 1, content: "x" },
      isOnline: true,
      callLive,
    });
    expect(callLive).toHaveBeenCalledTimes(1);
    expect(callLive).toHaveBeenCalledWith({ noteId: 1, content: "x" });
    expect(res).toEqual({
      mode: "live",
      result: { ok: true, echoed: { noteId: 1, content: "x" } },
    });
  });

  it("propagates callLive errors unchanged (online mode does NOT fall through)", async () => {
    const err = new Error("server 500");
    const callLive = vi.fn(async () => {
      throw err;
    });
    const queue = new OfflineQueue();
    await expect(
      routeVaultMutation({
        kind: "vault.note.update",
        payload: { noteId: 1 },
        isOnline: true,
        callLive,
        queue,
      }),
    ).rejects.toBe(err);
    // Online failure does NOT enqueue (caller decides retry semantics).
    expect(queue.size()).toBe(0);
  });
});

describe("routeVaultMutation — offline path", () => {
  it("enqueues + does NOT invoke callLive", async () => {
    const queue = new OfflineQueue();
    const callLive = vi.fn(async () => ({ unreachable: true }));
    const res = await routeVaultMutation({
      kind: "vault.note.create",
      payload: { vaultId: 1, title: "draft" },
      isOnline: false,
      callLive,
      queue,
      id: "uuid-offline-1",
    });
    expect(callLive).not.toHaveBeenCalled();
    expect(queue.size()).toBe(1);
    if (res.mode !== "queued") throw new Error("expected queued");
    expect(res.entry.id).toBe("uuid-offline-1");
    expect(res.entry.kind).toBe("vault.note.create");
    expect(res.entry.payload).toEqual({ vaultId: 1, title: "draft" });
  });

  it("throws OfflineMutationDeniedError on a deny-listed kind (callLive NOT invoked)", async () => {
    const queue = new OfflineQueue();
    const callLive = vi.fn(async () => ({ unreachable: true }));
    await expect(
      routeVaultMutation({
        // Deliberate union violation to exercise the runtime gate.
        kind: "graph.node.create" as unknown as "vault.note.update",
        payload: {},
        isOnline: false,
        callLive,
        queue,
        id: "uuid-deny",
      }),
    ).rejects.toThrow(OfflineMutationDeniedError);
    expect(callLive).not.toHaveBeenCalled();
    expect(queue.size()).toBe(0);
  });

  it("uses generateId seam when no id is supplied", async () => {
    const queue = new OfflineQueue();
    const generateId = vi.fn(() => "generated-uuid");
    const res = await routeVaultMutation({
      kind: "vault.note.delete",
      payload: { noteId: 7 },
      isOnline: false,
      callLive: async () => null,
      queue,
      generateId,
    });
    expect(generateId).toHaveBeenCalledTimes(1);
    if (res.mode !== "queued") throw new Error("expected queued");
    expect(res.entry.id).toBe("generated-uuid");
  });
});

describe("routeVaultMutation — isOnline default", () => {
  it("defaults to navigator.onLine when isOnline is omitted", async () => {
    const originalNavigator = globalThis.navigator;
    try {
      Object.defineProperty(globalThis, "navigator", {
        value: { onLine: true },
        configurable: true,
      });
      const callLive = vi.fn(async () => "ok");
      const res = await routeVaultMutation({
        kind: "vault.note.update",
        payload: {},
        callLive,
      });
      expect(callLive).toHaveBeenCalledTimes(1);
      expect(res).toEqual({ mode: "live", result: "ok" });
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    }
  });

  it("offline via navigator.onLine=false routes to enqueue", async () => {
    const originalNavigator = globalThis.navigator;
    try {
      const queue = new OfflineQueue();
      Object.defineProperty(globalThis, "navigator", {
        value: { onLine: false },
        configurable: true,
      });
      const callLive = vi.fn(async () => "unreachable");
      const res = await routeVaultMutation({
        kind: "vault.note.update",
        payload: { noteId: 9 },
        callLive,
        queue,
        id: "uuid-nav-offline",
      });
      expect(callLive).not.toHaveBeenCalled();
      expect(queue.size()).toBe(1);
      if (res.mode !== "queued") throw new Error("expected queued");
      expect(res.entry.id).toBe("uuid-nav-offline");
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    }
  });
});

describe("source-scan boundary", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/services/offline-cache-router.ts",
  );
  const src = readFileSync(file, "utf8");

  it("does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(src)).toBe(false);
  });

  it("does not import dispatchMcpToolCall", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        src,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(src)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(src)).toBe(false);
  });

  it("does not import AppRouter (stays tRPC-type-free)", () => {
    expect(
      /import[^;]*\bAppRouter\b[^;]*from\s+["']/.test(src),
    ).toBe(false);
  });

  it("does not import react / react-dom (no UI coupling)", () => {
    expect(/from\s+["']react(\/|["'])/.test(src)).toBe(false);
    expect(/from\s+["']react-dom/.test(src)).toBe(false);
  });
});
