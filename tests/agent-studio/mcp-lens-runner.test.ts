/**
 * MCP lens runner — third real `LensRunnerFn` (T-F.64).
 *
 * Tests the pure builder + factory + installer + ASDB adapter.
 * Continues precedent (l) replication; node/edge typeKeys reflect
 * the dispatcher trace (runtime_run / tool_call / tool).
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildMcpLensSnapshot,
  clampMcpLensLimit,
  createMcpLensRunner,
  createMcpLensAsdbReader,
  isMcpNodeVisibleToViewer,
  maybeInstallMcpLensRunner,
  maybeInstallMcpLensRunnerWithAsdb,
  MCP_LENS_ABSOLUTE_LIMIT,
  MCP_LENS_DEFAULT_LIMIT,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  runLens,
  type GraphLensDefinition,
  type LensRunnerViewerContext,
  type McpLensReadFn,
  type McpLensReadResult,
  type McpLensToolCallRow,
} from "../../server/agent-studio/services/graph-lens/public-api";

beforeEach(() => {
  __resetLensRunnerRegistryForTests();
});

const NOW = new Date("2026-05-16T12:00:00Z");
const T = new Date("2026-05-16T00:00:00Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(
  overrides: Partial<GraphLensDefinition> = {},
): GraphLensDefinition {
  return {
    id: "mcp_x",
    kind: "mcp",
    label: "MCP",
    layout: "force_directed",
    governanceScope: "workspace_members",
    ...overrides,
  };
}

function makeToolCall(
  overrides: Partial<McpLensToolCallRow> = {},
): McpLensToolCallRow {
  return {
    id: 100,
    runId: 7,
    toolKey: "read_file",
    verdict: "ok",
    durationMs: 123,
    createdAt: T,
    ...overrides,
  };
}

function makeRead(
  toolCalls: ReadonlyArray<McpLensToolCallRow>,
  truncated = false,
): McpLensReadResult {
  return { toolCalls, truncated };
}

// ============================================================================
// clamp + visibility
// ============================================================================

describe("clampMcpLensLimit", () => {
  it("returns DEFAULT when undefined", () => {
    expect(clampMcpLensLimit(undefined)).toBe(MCP_LENS_DEFAULT_LIMIT);
  });
  it("clamps to ABSOLUTE when over the cap", () => {
    expect(clampMcpLensLimit(10_000)).toBe(MCP_LENS_ABSOLUTE_LIMIT);
  });
});

describe("isMcpNodeVisibleToViewer", () => {
  it("hidden for anonymous", () => {
    expect(isMcpNodeVisibleToViewer(VIEWER_ANON)).toBe(false);
  });
  it("visible for authenticated", () => {
    expect(isMcpNodeVisibleToViewer(VIEWER)).toBe(true);
  });
});

// ============================================================================
// Builder shape
// ============================================================================

describe("buildMcpLensSnapshot", () => {
  it("empty read returns empty snapshot", () => {
    const snap = buildMcpLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([]),
      now: NOW,
    });
    expect(snap.nodes).toEqual([]);
    expect(snap.edges).toEqual([]);
    expect(snap.kind).toBe("mcp");
  });

  it("single tool call produces 3 nodes (run + tool + tool_call) + 2 edges", () => {
    const snap = buildMcpLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makeToolCall()]),
      now: NOW,
    });
    const typeKeys = snap.nodes.map((n) => n.typeKey).sort();
    expect(typeKeys).toEqual(["runtime_run", "tool", "tool_call"]);
    expect(snap.edges.map((e) => e.typeKey).sort()).toEqual([
      "dispatched",
      "target_tool",
    ]);
  });

  it("deduplicates run + tool nodes when multiple calls share them", () => {
    const snap = buildMcpLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makeToolCall({ id: 100, runId: 7, toolKey: "read_file" }),
        makeToolCall({ id: 101, runId: 7, toolKey: "read_file" }),
        makeToolCall({ id: 102, runId: 7, toolKey: "write_file" }),
        makeToolCall({ id: 103, runId: 8, toolKey: "read_file" }),
      ]),
      now: NOW,
    });
    const runs = snap.nodes.filter((n) => n.typeKey === "runtime_run");
    const tools = snap.nodes.filter((n) => n.typeKey === "tool");
    const calls = snap.nodes.filter((n) => n.typeKey === "tool_call");
    expect(runs.map((n) => n.id).sort()).toEqual(["run:7", "run:8"]);
    expect(tools.map((n) => n.id).sort()).toEqual([
      "tool:read_file",
      "tool:write_file",
    ]);
    expect(calls).toHaveLength(4);
    // Edge counts: one dispatched + one target_tool per call.
    expect(snap.edges).toHaveLength(8);
  });

  it("anonymous viewer sees redacted nodes with no label/meta + hiddenNodeCount", () => {
    const snap = buildMcpLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read: makeRead([makeToolCall({ id: 100, runId: 7, toolKey: "x" })]),
      now: NOW,
    });
    expect(snap.nodes).toHaveLength(3); // run + tool + call
    for (const n of snap.nodes) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    expect(snap.hiddenNodeCount).toBe(3);
  });

  it("forwards read.truncated to snapshot.truncated", () => {
    const snap = buildMcpLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([], true),
      now: NOW,
    });
    expect(snap.truncated).toBe(true);
  });
});

// ============================================================================
// Factory
// ============================================================================

describe("createMcpLensRunner — factory + DB seam", () => {
  it("calls read seam with workspaceId + limit + before; clamps limit", async () => {
    const captured: unknown[] = [];
    const read: McpLensReadFn = async (params) => {
      captured.push(params);
      return makeRead([]);
    };
    const runner = createMcpLensRunner({ read, now: () => NOW });
    const asOf = new Date("2026-05-01");
    await runner(makeDef(), {
      workspaceId: 5,
      userId: 42,
      limit: -7,
      asOf,
    });
    expect(captured).toEqual([
      { workspaceId: 5, limit: MCP_LENS_DEFAULT_LIMIT, before: asOf },
    ]);
  });
});

// ============================================================================
// Installer
// ============================================================================

describe("maybeInstallMcpLensRunner — envflag gate", () => {
  const noopRead: McpLensReadFn = async () => makeRead([]);

  it("no-op when env flag missing", () => {
    const result = maybeInstallMcpLensRunner({ env: {}, read: noopRead });
    expect(result.installed).toBe(false);
    expect(getLensRunner("mcp")).toBeUndefined();
  });

  it("installs when 'on'", () => {
    const result = maybeInstallMcpLensRunner({
      env: { AGS_GRAPH_LENS_MCP_RUNNER_INSTALL: "on" },
      read: noopRead,
    });
    expect(result.installed).toBe(true);
    expect(getLensRunner("mcp")).toBeDefined();
  });

  it("composer with-asdb installs when 'on'", () => {
    const result = maybeInstallMcpLensRunnerWithAsdb({
      env: { AGS_GRAPH_LENS_MCP_RUNNER_INSTALL: "on" },
      readerOptions: { getDbForWorkspace: () => null as never },
    });
    expect(result.installed).toBe(true);
    expect(getLensRunner("mcp")).toBeDefined();
  });
});

// ============================================================================
// End-to-end via runLens
// ============================================================================

describe("runLens dispatches through the real mcp runner", () => {
  it("returns an mcp snapshot after install", async () => {
    const read: McpLensReadFn = async () =>
      makeRead([
        makeToolCall({ id: 100, runId: 7, toolKey: "read_file", verdict: "ok" }),
      ]);
    maybeInstallMcpLensRunner({
      env: { AGS_GRAPH_LENS_MCP_RUNNER_INSTALL: "on" },
      read,
      now: () => NOW,
    });
    const snap = await runLens(makeDef(), { workspaceId: 1, userId: 42 });
    expect(snap.kind).toBe("mcp");
    expect(snap.nodes).toHaveLength(3);
    expect(snap.edges).toHaveLength(2);
  });
});

// ============================================================================
// ASDB reader fail-soft
// ============================================================================

describe("createMcpLensAsdbReader — fail-soft", () => {
  it("returns empty result when getDbForWorkspace returns null", async () => {
    const read = createMcpLensAsdbReader({
      getDbForWorkspace: () => null as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(result.toolCalls).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

// ============================================================================
// Source-scan
// ============================================================================

describe("Source-scan: mcp-lens-runner boundary", () => {
  it("runner file: no graph-driver / dispatcher / model-execution imports + no Drizzle", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/mcp-lens-runner.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
    expect(src).not.toMatch(/from\s+["'].*drizzle/);
    expect(src).not.toMatch(/from\s+["'].*\/db\/connection/);
  });

  it("ASDB reader file: no banned imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/mcp-lens-asdb-reader.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("installer file: no banned imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/install-mcp-lens-runner.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });
});
