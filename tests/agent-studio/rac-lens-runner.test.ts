/**
 * RAC lens runner — sixth real `LensRunnerFn` (T-F.67).
 *
 * Continues precedent (l) replication on `kind="rac"`. Surfaces
 * `agsRacRuntimeTraces` — one row per chat-stream turn.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildRacLensSnapshot,
  clampRacLensLimit,
  createRacLensRunner,
  createRacLensAsdbReader,
  isRacNodeVisibleToViewer,
  maybeInstallRacLensRunner,
  maybeInstallRacLensRunnerWithAsdb,
  RAC_LENS_ABSOLUTE_LIMIT,
  RAC_LENS_DEFAULT_LIMIT,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  runLens,
  type GraphLensDefinition,
  type LensRunnerViewerContext,
  type RacLensReadFn,
  type RacLensReadResult,
  type RacLensTraceRow,
} from "../../server/agent-studio/services/graph-lens/public-api";

beforeEach(() => {
  __resetLensRunnerRegistryForTests();
});

const NOW = new Date("2026-05-16T12:00:00Z");
const T = new Date("2026-05-16T00:00:00Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(overrides: Partial<GraphLensDefinition> = {}): GraphLensDefinition {
  return {
    id: "rac_x",
    kind: "rac",
    label: "RAC",
    layout: "force_directed",
    governanceScope: "workspace_members",
    ...overrides,
  };
}

function makeTrace(overrides: Partial<RacLensTraceRow> = {}): RacLensTraceRow {
  return {
    id: 100,
    workspaceId: 1,
    agentId: 10,
    mode: "strict",
    plannerMode: "hybrid_cag_rag",
    retrievalEnabled: true,
    cagPackId: 200,
    chunksReturned: 5,
    chunksFiltered: 1,
    chunksIncluded: 4,
    tokenBudgetUsed: 1500,
    groundednessScore: 0.85,
    fallbackReason: null,
    createdAt: T,
    ...overrides,
  };
}

function makeRead(
  traces: ReadonlyArray<RacLensTraceRow>,
  truncated = false,
): RacLensReadResult {
  return { traces, truncated };
}

// ============================================================================
// clamp + visibility
// ============================================================================

describe("clampRacLensLimit", () => {
  it("returns DEFAULT when undefined", () => {
    expect(clampRacLensLimit(undefined)).toBe(RAC_LENS_DEFAULT_LIMIT);
  });
  it("clamps to ABSOLUTE when over the cap", () => {
    expect(clampRacLensLimit(10_000)).toBe(RAC_LENS_ABSOLUTE_LIMIT);
  });
});

describe("isRacNodeVisibleToViewer", () => {
  it("hidden for anonymous", () => {
    expect(isRacNodeVisibleToViewer(VIEWER_ANON)).toBe(false);
  });
  it("visible for authenticated", () => {
    expect(isRacNodeVisibleToViewer(VIEWER)).toBe(true);
  });
});

// ============================================================================
// Builder shape
// ============================================================================

describe("buildRacLensSnapshot", () => {
  it("empty read returns empty snapshot", () => {
    const snap = buildRacLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([]),
      now: NOW,
    });
    expect(snap.nodes).toEqual([]);
    expect(snap.edges).toEqual([]);
    expect(snap.kind).toBe("rac");
  });

  it("single trace with cagPackId produces 3 nodes + 2 edges", () => {
    const snap = buildRacLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makeTrace({ id: 100, agentId: 10, cagPackId: 200 })]),
      now: NOW,
    });
    expect(snap.nodes.map((n) => n.typeKey).sort()).toEqual([
      "rac_agent",
      "rac_cag_pack",
      "rac_trace",
    ]);
    expect(snap.edges.map((e) => e.typeKey).sort()).toEqual([
      "trace_for_agent",
      "uses_cag_pack",
    ]);
  });

  it("trace with null cagPackId does NOT emit uses_cag_pack edge", () => {
    const snap = buildRacLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makeTrace({ id: 100, cagPackId: null })]),
      now: NOW,
    });
    expect(snap.edges.map((e) => e.typeKey)).toEqual(["trace_for_agent"]);
    expect(snap.nodes.filter((n) => n.typeKey === "rac_cag_pack")).toEqual([]);
  });

  it("dedupes rac_agent + rac_cag_pack across multiple traces", () => {
    const snap = buildRacLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makeTrace({ id: 100, agentId: 10, cagPackId: 200 }),
        makeTrace({ id: 101, agentId: 10, cagPackId: 200 }),
        makeTrace({ id: 102, agentId: 10, cagPackId: 201 }),
        makeTrace({ id: 103, agentId: 11, cagPackId: null }),
      ]),
      now: NOW,
    });
    expect(snap.nodes.filter((n) => n.typeKey === "rac_agent").map((n) => n.id).sort()).toEqual([
      "agent:10",
      "agent:11",
    ]);
    expect(snap.nodes.filter((n) => n.typeKey === "rac_cag_pack").map((n) => n.id).sort()).toEqual([
      "pack:200",
      "pack:201",
    ]);
    expect(snap.nodes.filter((n) => n.typeKey === "rac_trace")).toHaveLength(4);
  });

  it("anonymous viewer sees redacted nodes with no label/meta", () => {
    const snap = buildRacLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read: makeRead([makeTrace()]),
      now: NOW,
    });
    expect(snap.nodes).toHaveLength(3);
    for (const n of snap.nodes) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    expect(snap.hiddenNodeCount).toBe(3);
  });

  it("trace meta carries planner + retrieval shape", () => {
    const snap = buildRacLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makeTrace({
          id: 100,
          plannerMode: "knowledge_retrieval",
          retrievalEnabled: true,
          chunksReturned: 10,
          groundednessScore: 0.9,
          fallbackReason: null,
        }),
      ]),
      now: NOW,
    });
    const trace = snap.nodes.find((n) => n.typeKey === "rac_trace");
    expect(trace?.meta).toMatchObject({
      plannerMode: "knowledge_retrieval",
      retrievalEnabled: true,
      chunksReturned: 10,
      groundednessScore: 0.9,
    });
  });

  it("forwards read.truncated to snapshot.truncated", () => {
    const snap = buildRacLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([], true),
      now: NOW,
    });
    expect(snap.truncated).toBe(true);
  });
});

// ============================================================================
// Factory + installer + e2e + fail-soft
// ============================================================================

describe("createRacLensRunner — factory", () => {
  it("clamps invalid limit before invoking the read seam", async () => {
    const captured: number[] = [];
    const read: RacLensReadFn = async (p) => {
      captured.push(p.limit);
      return makeRead([]);
    };
    const runner = createRacLensRunner({ read });
    await runner(makeDef(), { workspaceId: 1, userId: 1, limit: -7 });
    expect(captured).toEqual([RAC_LENS_DEFAULT_LIMIT]);
  });
});

describe("maybeInstallRacLensRunner — envflag", () => {
  const noopRead: RacLensReadFn = async () => makeRead([]);

  it("no-op when missing", () => {
    expect(maybeInstallRacLensRunner({ env: {}, read: noopRead }).installed).toBe(
      false,
    );
  });
  it("installs when 'on'", () => {
    expect(
      maybeInstallRacLensRunner({
        env: { AGS_GRAPH_LENS_RAC_RUNNER_INSTALL: "on" },
        read: noopRead,
      }).installed,
    ).toBe(true);
    expect(getLensRunner("rac")).toBeDefined();
  });
  it("composer with-asdb installs when 'on'", () => {
    expect(
      maybeInstallRacLensRunnerWithAsdb({
        env: { AGS_GRAPH_LENS_RAC_RUNNER_INSTALL: "on" },
        readerOptions: { getDbForWorkspace: () => null as never },
      }).installed,
    ).toBe(true);
  });
});

describe("runLens dispatches through the real rac runner", () => {
  it("returns a rac snapshot after install", async () => {
    maybeInstallRacLensRunner({
      env: { AGS_GRAPH_LENS_RAC_RUNNER_INSTALL: "on" },
      read: async () => makeRead([makeTrace({ id: 100, cagPackId: 200 })]),
      now: () => NOW,
    });
    const snap = await runLens(makeDef(), { workspaceId: 1, userId: 42 });
    expect(snap.kind).toBe("rac");
    expect(snap.nodes).toHaveLength(3);
    expect(snap.edges).toHaveLength(2);
  });
});

describe("createRacLensAsdbReader — fail-soft", () => {
  it("returns empty result when getDbForWorkspace returns null", async () => {
    const read = createRacLensAsdbReader({
      getDbForWorkspace: () => null as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(result.traces).toEqual([]);
  });
});

// ============================================================================
// Source-scan
// ============================================================================

describe("Source-scan: rac-lens-runner boundary", () => {
  it("runner file: no banned imports + no Drizzle", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/rac-lens-runner.ts",
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
        "../../server/agent-studio/services/graph-lens/runners/rac-lens-asdb-reader.ts",
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
        "../../server/agent-studio/services/graph-lens/install-rac-lens-runner.ts",
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
