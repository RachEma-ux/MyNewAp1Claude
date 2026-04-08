/**
 * Phase 19c — MCP Versioned Registry tests.
 *
 * 15+ cases covering:
 *  - Publish snapshot, read it back identically
 *  - Version increments on republish
 *  - findToolForServer happy path + miss + missing snapshot
 *  - findToolByGlobalNameAsync parses + resolves correctly
 *  - removeServer deletes the snapshot
 *  - listSnapshotsForDraft filters by draft (mocked repo)
 *  - Concurrent publishes are last-write-wins
 *  - Snapshot immutability — frozen, can't be mutated externally
 *  - Unknown server returns undefined / empty list
 *  - publishedAt is set to a recent timestamp
 *  - snapshotCount tracks the map size
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  publishSnapshot,
  getSnapshot,
  findToolForServer,
  findToolByGlobalNameAsync,
  removeServer,
  listSnapshotsForDraft,
  snapshotCount,
  __clearAllSnapshotsForTests,
} from "../registry";

vi.mock("../../../repository", () => ({
  listMcpServers: vi.fn(),
  listAllMcpServers: vi.fn(),
}));

import * as repo from "../../../repository";

const sampleTools = [
  { name: "create_issue", description: "Create a GitHub issue" },
  { name: "list_issues", description: "List repo issues" },
];
const samplePrompts = [
  { name: "summarize", description: "Summarize a PR" },
];
const sampleResources = [
  { uri: "github://repo/readme", name: "README", mimeType: "text/markdown" },
];

beforeEach(() => {
  __clearAllSnapshotsForTests();
  vi.clearAllMocks();
});

// ── Basic publish + read ──────────────────────────────────────────────────

describe("publishSnapshot + getSnapshot", () => {
  it("stores a snapshot and returns it identically", () => {
    const result = publishSnapshot({
      serverId: 1,
      tools: sampleTools,
      prompts: samplePrompts,
      resources: sampleResources,
    });
    expect(result.serverId).toBe(1);
    expect(result.version).toBe(1);
    expect(result.publishedAt).toBeGreaterThan(0);
    expect(result.tools).toEqual(sampleTools);
    expect(result.prompts).toEqual(samplePrompts);
    expect(result.resources).toEqual(sampleResources);

    const fetched = getSnapshot(1);
    expect(fetched).toBeDefined();
    expect(fetched?.tools).toEqual(sampleTools);
  });

  it("returns undefined for unknown server", () => {
    expect(getSnapshot(999)).toBeUndefined();
  });

  it("publishedAt reflects approximately current time", () => {
    const before = Date.now();
    publishSnapshot({
      serverId: 1,
      tools: [],
      prompts: [],
      resources: [],
    });
    const after = Date.now();
    const snap = getSnapshot(1);
    expect(snap?.publishedAt).toBeGreaterThanOrEqual(before);
    expect(snap?.publishedAt).toBeLessThanOrEqual(after);
  });
});

// ── Versioning ────────────────────────────────────────────────────────────

describe("version monotonicity", () => {
  it("starts at 1 on first publish", () => {
    const snap = publishSnapshot({
      serverId: 1,
      tools: [],
      prompts: [],
      resources: [],
    });
    expect(snap.version).toBe(1);
  });

  it("increments on republish", () => {
    publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });
    const second = publishSnapshot({
      serverId: 1,
      tools: sampleTools,
      prompts: [],
      resources: [],
    });
    expect(second.version).toBe(2);
    const third = publishSnapshot({
      serverId: 1,
      tools: [],
      prompts: [],
      resources: [],
    });
    expect(third.version).toBe(3);
  });

  it("versions are independent per server", () => {
    publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });
    publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });
    publishSnapshot({ serverId: 2, tools: [], prompts: [], resources: [] });
    expect(getSnapshot(1)?.version).toBe(2);
    expect(getSnapshot(2)?.version).toBe(1);
  });
});

// ── findToolForServer ─────────────────────────────────────────────────────

describe("findToolForServer", () => {
  beforeEach(() => {
    publishSnapshot({
      serverId: 1,
      tools: sampleTools,
      prompts: [],
      resources: [],
    });
  });

  it("returns the tool when present", () => {
    const tool = findToolForServer(1, "create_issue");
    expect(tool).toBeDefined();
    expect(tool?.name).toBe("create_issue");
  });

  it("returns undefined for unknown tool name", () => {
    expect(findToolForServer(1, "nonexistent")).toBeUndefined();
  });

  it("returns undefined for unknown server", () => {
    expect(findToolForServer(999, "create_issue")).toBeUndefined();
  });
});

// ── findToolByGlobalNameAsync ─────────────────────────────────────────────

describe("findToolByGlobalNameAsync", () => {
  beforeEach(() => {
    (repo.listAllMcpServers as any).mockResolvedValue([
      { id: 1, name: "github" },
      { id: 2, name: "slack" },
    ]);
    publishSnapshot({
      serverId: 1,
      tools: sampleTools,
      prompts: [],
      resources: [],
    });
  });

  it("resolves a valid mcp__server__tool name", async () => {
    const result = await findToolByGlobalNameAsync(
      "mcp__github__create_issue"
    );
    expect(result).toBeDefined();
    expect(result?.serverId).toBe(1);
    expect(result?.tool.name).toBe("create_issue");
  });

  it("returns undefined for malformed name", async () => {
    expect(await findToolByGlobalNameAsync("not_a_tool")).toBeUndefined();
    expect(await findToolByGlobalNameAsync("mcp__")).toBeUndefined();
    expect(await findToolByGlobalNameAsync("mcp__github__")).toBeUndefined();
  });

  it("returns undefined for unknown server name", async () => {
    expect(
      await findToolByGlobalNameAsync("mcp__nonexistent__create_issue")
    ).toBeUndefined();
  });

  it("returns undefined for known server but unknown tool", async () => {
    expect(
      await findToolByGlobalNameAsync("mcp__github__nonexistent")
    ).toBeUndefined();
  });
});

// ── removeServer ──────────────────────────────────────────────────────────

describe("removeServer", () => {
  it("deletes the snapshot", () => {
    publishSnapshot({ serverId: 1, tools: sampleTools, prompts: [], resources: [] });
    expect(getSnapshot(1)).toBeDefined();
    removeServer(1);
    expect(getSnapshot(1)).toBeUndefined();
  });

  it("is idempotent for unknown servers", () => {
    expect(() => removeServer(999)).not.toThrow();
  });

  it("does not affect other servers", () => {
    publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });
    publishSnapshot({ serverId: 2, tools: [], prompts: [], resources: [] });
    removeServer(1);
    expect(getSnapshot(2)).toBeDefined();
  });
});

// ── listSnapshotsForDraft ─────────────────────────────────────────────────

describe("listSnapshotsForDraft", () => {
  it("returns only the draft's servers' snapshots", async () => {
    (repo.listMcpServers as any).mockResolvedValue([
      { id: 1, name: "github" },
      { id: 3, name: "db" },
    ]);
    publishSnapshot({ serverId: 1, tools: sampleTools, prompts: [], resources: [] });
    publishSnapshot({ serverId: 2, tools: [], prompts: [], resources: [] }); // not in draft
    publishSnapshot({ serverId: 3, tools: [], prompts: [], resources: [] });

    const snaps = await listSnapshotsForDraft(100);
    expect(snaps).toHaveLength(2);
    expect(snaps.map((s) => s.serverId).sort()).toEqual([1, 3]);
  });

  it("skips servers without published snapshots", async () => {
    (repo.listMcpServers as any).mockResolvedValue([
      { id: 1, name: "github" },
      { id: 2, name: "slack" }, // never connected, no snapshot
    ]);
    publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });

    const snaps = await listSnapshotsForDraft(100);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].serverId).toBe(1);
  });

  it("returns an empty array when no servers are attached", async () => {
    (repo.listMcpServers as any).mockResolvedValue([]);
    expect(await listSnapshotsForDraft(100)).toEqual([]);
  });
});

// ── Concurrent publishes (last-write-wins) ────────────────────────────────

describe("concurrent publishes", () => {
  it("last write wins for the same serverId", () => {
    publishSnapshot({
      serverId: 1,
      tools: [{ name: "first" }],
      prompts: [],
      resources: [],
    });
    publishSnapshot({
      serverId: 1,
      tools: [{ name: "second" }],
      prompts: [],
      resources: [],
    });
    const snap = getSnapshot(1);
    expect(snap?.tools).toHaveLength(1);
    expect(snap?.tools[0].name).toBe("second");
    expect(snap?.version).toBe(2);
  });
});

// ── Snapshot immutability ─────────────────────────────────────────────────

describe("snapshot immutability", () => {
  it("frozen snapshot — caller cannot mutate the tools array", () => {
    const sourceTools = [{ name: "create_issue", description: "" }];
    publishSnapshot({
      serverId: 1,
      tools: sourceTools,
      prompts: [],
      resources: [],
    });
    const snap = getSnapshot(1)!;
    // Attempting to push to a frozen array throws in strict mode (which
    // vitest runs in by default). In non-strict mode the push is silently
    // ignored. Either way, the registry's view stays unchanged.
    try {
      (snap.tools as any).push({ name: "injected", description: "evil" });
    } catch {
      /* expected in strict mode */
    }
    expect(getSnapshot(1)?.tools).toHaveLength(1);
    expect(getSnapshot(1)?.tools[0].name).toBe("create_issue");
  });

  it("mutating the source array after publish does not affect the snapshot", () => {
    const sourceTools = [{ name: "first", description: "" }];
    publishSnapshot({
      serverId: 1,
      tools: sourceTools,
      prompts: [],
      resources: [],
    });
    sourceTools.push({ name: "after_publish", description: "" });
    expect(getSnapshot(1)?.tools).toHaveLength(1);
  });
});

// ── snapshotCount ─────────────────────────────────────────────────────────

describe("snapshotCount", () => {
  it("starts at 0", () => {
    expect(snapshotCount()).toBe(0);
  });

  it("tracks publish + remove", () => {
    publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });
    expect(snapshotCount()).toBe(1);
    publishSnapshot({ serverId: 2, tools: [], prompts: [], resources: [] });
    expect(snapshotCount()).toBe(2);
    removeServer(1);
    expect(snapshotCount()).toBe(1);
  });

  it("republishing the same server does not increment the count", () => {
    publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });
    publishSnapshot({ serverId: 1, tools: [], prompts: [], resources: [] });
    expect(snapshotCount()).toBe(1);
  });
});
