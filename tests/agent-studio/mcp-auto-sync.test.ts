/**
 * Follow-up A4 — registry subscribers + auto-sync wrapper tests.
 *
 * Locks the registry's new `subscribeSnapshots` API and the auto-sync
 * subscriber's resolver+sync orchestration. The DB-backed
 * `syncToolKnowledge` is injected as a fake so the orchestration can
 * be exercised without a live ASDB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __clearAllSnapshotsForTests,
  __clearListenersForTests,
  publishSnapshot,
  subscribeSnapshots,
} from "../../server/agent-studio/services/mcp/registry";
import { installAutoSync } from "../../server/agent-studio/services/mcp/auto-sync";

beforeEach(() => {
  __clearAllSnapshotsForTests();
  __clearListenersForTests();
});

afterEach(() => {
  __clearAllSnapshotsForTests();
  __clearListenersForTests();
});

describe("subscribeSnapshots — registry listener API", () => {
  it("fires the listener with current + previous snapshot", () => {
    const events: { current: any; previous: any }[] = [];
    subscribeSnapshots((e) => {
      events.push(e);
    });
    publishSnapshot({ serverId: 1, tools: [{ name: "a" }], prompts: [], resources: [] });
    publishSnapshot({ serverId: 1, tools: [{ name: "b" }], prompts: [], resources: [] });
    expect(events).toHaveLength(2);
    expect(events[0].previous).toBeUndefined();
    expect(events[0].current.tools[0].name).toBe("a");
    expect(events[1].previous?.tools[0].name).toBe("a");
    expect(events[1].current.tools[0].name).toBe("b");
    expect(events[1].current.version).toBe(2);
  });

  it("returns an unsubscribe function", () => {
    const fired = vi.fn();
    const off = subscribeSnapshots(fired);
    publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });
    off();
    publishSnapshot({ serverId: 1, tools: [{ name: "x" }], prompts: [], resources: [] });
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break publish or block other listeners", () => {
    const second = vi.fn();
    subscribeSnapshots(() => {
      throw new Error("boom");
    });
    subscribeSnapshots(second);
    expect(() => {
      publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });
    }).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a rejecting async listener does not surface as an unhandled rejection", async () => {
    subscribeSnapshots(async () => {
      throw new Error("async boom");
    });
    expect(() => {
      publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });
    }).not.toThrow();
    // Give the rejection a microtask to surface and confirm nothing throws.
    await Promise.resolve();
  });
});

describe("installAutoSync — orchestration", () => {
  it("calls syncToolKnowledge when the resolver returns a context", async () => {
    const sync = vi.fn().mockResolvedValue({
      workspaceId: 1,
      mcpServerId: "srv1",
      toolsAdded: 1,
      toolsUpdated: 0,
      toolsUnchanged: 0,
      toolsMarkedUnavailable: 0,
      changedToolNames: [],
    });
    const onSync = vi.fn();
    installAutoSync({
      resolveContext: () => ({
        workspaceId: 1,
        mcpServerId: "srv1",
        knowledgeSourceId: 10,
        actorId: 5,
      }),
      syncToolKnowledge: sync,
      onSync,
    });
    publishSnapshot({
      serverId: 100,
      tools: [{ name: "search" }],
      prompts: [],
      resources: [],
    });
    // Allow the async listener microtasks to settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0][0].workspaceId).toBe(1);
    expect(sync.mock.calls[0][0].mcpServerId).toBe("srv1");
    expect(sync.mock.calls[0][0].knowledgeSourceId).toBe(10);
    expect(sync.mock.calls[0][0].actorId).toBe(5);
    expect(sync.mock.calls[0][0].tools).toEqual([{ name: "search" }]);
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("skips publish silently when the resolver returns null", async () => {
    const sync = vi.fn();
    installAutoSync({
      resolveContext: () => null,
      syncToolKnowledge: sync,
    });
    publishSnapshot({
      serverId: 100,
      tools: [{ name: "x" }],
      prompts: [],
      resources: [],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(sync).not.toHaveBeenCalled();
  });

  it("supports an async resolver", async () => {
    const sync = vi.fn().mockResolvedValue({
      workspaceId: 1,
      mcpServerId: "srv1",
      toolsAdded: 0,
      toolsUpdated: 0,
      toolsUnchanged: 1,
      toolsMarkedUnavailable: 0,
      changedToolNames: [],
    });
    installAutoSync({
      resolveContext: async () => ({
        workspaceId: 1,
        mcpServerId: "srv1",
        knowledgeSourceId: 10,
        actorId: 5,
      }),
      syncToolKnowledge: sync,
    });
    publishSnapshot({
      serverId: 100,
      tools: [],
      prompts: [],
      resources: [],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("fires onError and continues when the resolver throws", async () => {
    const sync = vi.fn();
    const onError = vi.fn();
    installAutoSync({
      resolveContext: () => {
        throw new Error("resolver boom");
      },
      syncToolKnowledge: sync,
      onError,
    });
    publishSnapshot({
      serverId: 100,
      tools: [],
      prompts: [],
      resources: [],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toBe(100);
    expect(sync).not.toHaveBeenCalled();
  });

  it("fires onError when syncToolKnowledge rejects (and never throws)", async () => {
    const sync = vi.fn().mockRejectedValue(new Error("sync boom"));
    const onError = vi.fn();
    installAutoSync({
      resolveContext: () => ({
        workspaceId: 1,
        mcpServerId: "srv1",
        knowledgeSourceId: 10,
        actorId: 5,
      }),
      syncToolKnowledge: sync,
      onError,
    });
    expect(() => {
      publishSnapshot({
        serverId: 100,
        tools: [],
        prompts: [],
        resources: [],
      });
    }).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("the unsubscribe function returned by installAutoSync stops further calls", async () => {
    const sync = vi.fn().mockResolvedValue({
      workspaceId: 1,
      mcpServerId: "srv1",
      toolsAdded: 0,
      toolsUpdated: 0,
      toolsUnchanged: 0,
      toolsMarkedUnavailable: 0,
      changedToolNames: [],
    });
    const off = installAutoSync({
      resolveContext: () => ({
        workspaceId: 1,
        mcpServerId: "srv1",
        knowledgeSourceId: 10,
        actorId: 5,
      }),
      syncToolKnowledge: sync,
    });
    publishSnapshot({
      serverId: 100,
      tools: [],
      prompts: [],
      resources: [],
    });
    await new Promise((r) => setTimeout(r, 0));
    off();
    publishSnapshot({
      serverId: 100,
      tools: [{ name: "x" }],
      prompts: [],
      resources: [],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
