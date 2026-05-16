/**
 * Runtime lens runner — first real `LensRunnerFn` (T-F.59).
 *
 * Unit tests for the pure builder + the runner factory + the
 * permission-leak invariant. The pure builder is the heart of the
 * slice; the factory is a thin DB-read wrapper.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildRuntimeLensSnapshot,
  clampRuntimeLensLimit,
  createRuntimeLensRunner,
  isRuntimeRunVisibleToViewer,
  maybeInstallRuntimeLensRunner,
  RUNTIME_LENS_ABSOLUTE_LIMIT,
  RUNTIME_LENS_DEFAULT_LIMIT,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  runLens,
  type GraphLensDefinition,
  type LensRunnerViewerContext,
  type RuntimeLensAgentRow,
  type RuntimeLensReadFn,
  type RuntimeLensReadResult,
  type RuntimeLensRunRow,
} from "../../server/agent-studio/services/graph-lens/public-api";

beforeEach(() => {
  __resetLensRunnerRegistryForTests();
});

function makeDef(
  overrides: Partial<GraphLensDefinition> = {},
): GraphLensDefinition {
  return {
    id: "runtime_x",
    kind: "runtime",
    label: "Runtime",
    layout: "timeline",
    governanceScope: "workspace_members",
    ...overrides,
  };
}

function makeRun(
  overrides: Partial<RuntimeLensRunRow> = {},
): RuntimeLensRunRow {
  return {
    id: 1,
    agentId: 10,
    status: "completed",
    parentRunId: null,
    resumedFromRunId: null,
    compactedFromRunId: null,
    triggeredBy: 42,
    summary: "ok",
    durationMs: 1234,
    errorReason: null,
    createdAt: new Date("2026-05-16T00:00:00Z"),
    ...overrides,
  };
}

function makeAgent(
  overrides: Partial<RuntimeLensAgentRow> = {},
): RuntimeLensAgentRow {
  return {
    id: 10,
    ownerId: 42,
    visibility: "private",
    ...overrides,
  };
}

function makeRead(
  runs: ReadonlyArray<RuntimeLensRunRow>,
  agents: ReadonlyArray<RuntimeLensAgentRow>,
  truncated = false,
): RuntimeLensReadResult {
  return {
    runs,
    agentsById: new Map(agents.map((a) => [a.id, a])),
    truncated,
  };
}

const NOW = new Date("2026-05-16T12:00:00Z");

const VIEWER_OWNER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_OTHER: LensRunnerViewerContext = { workspaceId: 1, userId: 99 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

// ============================================================================
// clampRuntimeLensLimit
// ============================================================================

describe("clampRuntimeLensLimit", () => {
  it("returns DEFAULT when undefined", () => {
    expect(clampRuntimeLensLimit(undefined)).toBe(RUNTIME_LENS_DEFAULT_LIMIT);
  });

  it("returns DEFAULT when NaN", () => {
    expect(clampRuntimeLensLimit(Number.NaN)).toBe(RUNTIME_LENS_DEFAULT_LIMIT);
  });

  it("returns DEFAULT when <= 0", () => {
    expect(clampRuntimeLensLimit(0)).toBe(RUNTIME_LENS_DEFAULT_LIMIT);
    expect(clampRuntimeLensLimit(-5)).toBe(RUNTIME_LENS_DEFAULT_LIMIT);
  });

  it("returns ABSOLUTE when over the cap", () => {
    expect(clampRuntimeLensLimit(10_000)).toBe(RUNTIME_LENS_ABSOLUTE_LIMIT);
  });

  it("preserves valid values", () => {
    expect(clampRuntimeLensLimit(25)).toBe(25);
    expect(clampRuntimeLensLimit(RUNTIME_LENS_ABSOLUTE_LIMIT)).toBe(
      RUNTIME_LENS_ABSOLUTE_LIMIT,
    );
  });

  it("floors fractional values", () => {
    expect(clampRuntimeLensLimit(25.7)).toBe(25);
  });
});

// ============================================================================
// isRuntimeRunVisibleToViewer
// ============================================================================

describe("isRuntimeRunVisibleToViewer", () => {
  it("hidden for anonymous viewer", () => {
    expect(isRuntimeRunVisibleToViewer(makeRun(), makeAgent(), VIEWER_ANON)).toBe(
      false,
    );
  });

  it("visible when run.triggeredBy matches viewer", () => {
    const run = makeRun({ triggeredBy: 42 });
    const agent = makeAgent({ ownerId: 999, visibility: "private" });
    expect(isRuntimeRunVisibleToViewer(run, agent, VIEWER_OWNER)).toBe(true);
  });

  it("visible when agent.ownerId matches viewer", () => {
    const run = makeRun({ triggeredBy: 999 });
    const agent = makeAgent({ ownerId: 42, visibility: "private" });
    expect(isRuntimeRunVisibleToViewer(run, agent, VIEWER_OWNER)).toBe(true);
  });

  it("visible when agent.visibility === 'public'", () => {
    const run = makeRun({ triggeredBy: 999 });
    const agent = makeAgent({ ownerId: 999, visibility: "public" });
    expect(isRuntimeRunVisibleToViewer(run, agent, VIEWER_OWNER)).toBe(true);
  });

  it("hidden when none of the rules match", () => {
    const run = makeRun({ triggeredBy: 999 });
    const agent = makeAgent({ ownerId: 999, visibility: "private" });
    expect(isRuntimeRunVisibleToViewer(run, agent, VIEWER_OTHER)).toBe(false);
  });

  it("hidden when agent is missing (orphaned run)", () => {
    const run = makeRun({ triggeredBy: 999 });
    expect(isRuntimeRunVisibleToViewer(run, undefined, VIEWER_OWNER)).toBe(false);
  });
});

// ============================================================================
// buildRuntimeLensSnapshot — shape
// ============================================================================

describe("buildRuntimeLensSnapshot", () => {
  it("empty read returns empty snapshot", () => {
    const snap = buildRuntimeLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_OWNER,
      read: makeRead([], []),
      now: NOW,
    });
    expect(snap.nodes).toEqual([]);
    expect(snap.edges).toEqual([]);
    expect(snap.hiddenNodeCount).toBe(0);
    expect(snap.truncated).toBe(false);
    expect(snap.kind).toBe("runtime");
    expect(snap.layout).toBe("timeline");
    expect(snap.producedAt).toBe(NOW);
  });

  it("single visible run produces 1 node + 0 edges", () => {
    const run = makeRun({ id: 7, status: "running" });
    const snap = buildRuntimeLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_OWNER,
      read: makeRead([run], [makeAgent()]),
      now: NOW,
    });
    expect(snap.nodes).toHaveLength(1);
    expect(snap.nodes[0]).toMatchObject({
      typeKey: "runtime_run",
      id: "7",
      visible: true,
      label: "run #7 — running",
    });
    expect(snap.nodes[0].meta).toMatchObject({
      status: "running",
      agentId: 10,
      triggeredBy: 42,
    });
    expect(snap.edges).toEqual([]);
    expect(snap.hiddenNodeCount).toBe(0);
  });

  it("parent → child lineage produces 1 parent_run edge", () => {
    const parent = makeRun({ id: 1 });
    const child = makeRun({ id: 2, parentRunId: 1 });
    const snap = buildRuntimeLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_OWNER,
      read: makeRead([parent, child], [makeAgent()]),
      now: NOW,
    });
    expect(snap.nodes).toHaveLength(2);
    expect(snap.edges).toHaveLength(1);
    expect(snap.edges[0]).toEqual({
      typeKey: "parent_run",
      sourceNodeId: "2",
      targetNodeId: "1",
      visible: true,
    });
  });

  it("resumedFromRunId + compactedFromRunId produce their own typed edges", () => {
    const source = makeRun({ id: 100 });
    const resumed = makeRun({ id: 101, resumedFromRunId: 100 });
    const compacted = makeRun({ id: 102, compactedFromRunId: 100 });
    const snap = buildRuntimeLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_OWNER,
      read: makeRead([source, resumed, compacted], [makeAgent()]),
      now: NOW,
    });
    expect(snap.edges).toHaveLength(2);
    expect(snap.edges.map((e) => e.typeKey).sort()).toEqual([
      "compacted_from_run",
      "resumed_from_run",
    ]);
  });

  it("lineage edges are NOT created when the parent is absent (cap-truncated)", () => {
    // child references parent #999 but only child is in the cap-clipped
    // result set. No dangling edge.
    const child = makeRun({ id: 2, parentRunId: 999 });
    const snap = buildRuntimeLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_OWNER,
      read: makeRead([child], [makeAgent()]),
      now: NOW,
    });
    expect(snap.edges).toEqual([]);
  });

  it("forwards read.truncated to snapshot.truncated", () => {
    const snap = buildRuntimeLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_OWNER,
      read: makeRead([], [], true),
      now: NOW,
    });
    expect(snap.truncated).toBe(true);
  });
});

// ============================================================================
// buildRuntimeLensSnapshot — permission post-filter
// ============================================================================

describe("buildRuntimeLensSnapshot — permission post-filter", () => {
  it("hidden runs appear as nodes with visible=false and no label/meta", () => {
    const ownedRun = makeRun({ id: 1, triggeredBy: 42 });
    const otherRun = makeRun({ id: 2, agentId: 11, triggeredBy: 999 });
    const ownedAgent = makeAgent({ id: 10, ownerId: 42 });
    const otherAgent = makeAgent({ id: 11, ownerId: 999, visibility: "private" });
    const snap = buildRuntimeLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_OWNER,
      read: makeRead([ownedRun, otherRun], [ownedAgent, otherAgent]),
      now: NOW,
    });
    expect(snap.nodes).toHaveLength(2);
    expect(snap.nodes[0].visible).toBe(true);
    expect(snap.nodes[0].label).toBeDefined();
    expect(snap.nodes[0].meta).toBeDefined();
    expect(snap.nodes[1].visible).toBe(false);
    expect(snap.nodes[1].label).toBeUndefined();
    expect(snap.nodes[1].meta).toBeUndefined();
    expect(snap.hiddenNodeCount).toBe(1);
  });

  it("permission-leak invariant — every visible=false node lacks label AND meta", () => {
    // Property-style scan: synthesize a permutation of permission
    // attributes; every hidden node must have neither label nor meta.
    const runs: RuntimeLensRunRow[] = [];
    const agents: RuntimeLensAgentRow[] = [];
    let nextId = 1;
    for (const triggeredBy of [null, 42, 99] as const) {
      for (const ownerId of [null, 42, 99] as const) {
        for (const visibility of ["private", "public", "internal"] as const) {
          const agentId = nextId * 100;
          agents.push({ id: agentId, ownerId, visibility });
          runs.push({
            id: nextId,
            agentId,
            status: "completed",
            parentRunId: null,
            resumedFromRunId: null,
            compactedFromRunId: null,
            triggeredBy,
            summary: `secret-${nextId}`,
            durationMs: 1000,
            errorReason: `secret-error-${nextId}`,
            createdAt: NOW,
          });
          nextId += 1;
        }
      }
    }
    const snap = buildRuntimeLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_OWNER,
      read: makeRead(runs, agents),
      now: NOW,
    });
    expect(snap.nodes).toHaveLength(runs.length);
    for (const node of snap.nodes) {
      if (!node.visible) {
        expect(node.label).toBeUndefined();
        expect(node.meta).toBeUndefined();
      } else {
        expect(node.label).toBeDefined();
        expect(node.meta).toBeDefined();
      }
    }
    // hiddenNodeCount aligns with the count derived from the nodes array.
    const expectedHidden = snap.nodes.filter((n) => !n.visible).length;
    expect(snap.hiddenNodeCount).toBe(expectedHidden);
  });

  it("anonymous viewer sees only public-agent runs", () => {
    const publicRun = makeRun({ id: 1, agentId: 10, triggeredBy: 999 });
    const privateRun = makeRun({ id: 2, agentId: 11, triggeredBy: 999 });
    const publicAgent = makeAgent({ id: 10, visibility: "public", ownerId: 999 });
    const privateAgent = makeAgent({ id: 11, visibility: "private", ownerId: 999 });
    const snap = buildRuntimeLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read: makeRead([publicRun, privateRun], [publicAgent, privateAgent]),
      now: NOW,
    });
    // Anon (`userId: null`) is rejected by the gate even when an agent
    // is public — there's no userId to compare.
    expect(snap.nodes[0].visible).toBe(false);
    expect(snap.nodes[1].visible).toBe(false);
    expect(snap.hiddenNodeCount).toBe(2);
  });
});

// ============================================================================
// createRuntimeLensRunner — factory wiring
// ============================================================================

describe("createRuntimeLensRunner — factory + DB seam", () => {
  it("calls read seam with viewer params, returns snapshot", async () => {
    const captured: unknown[] = [];
    const read: RuntimeLensReadFn = async (params) => {
      captured.push(params);
      return makeRead(
        [makeRun({ id: 7 })],
        [makeAgent({ id: 10, ownerId: 42 })],
      );
    };
    const runner = createRuntimeLensRunner({ read, now: () => NOW });
    const snap = await runner(makeDef(), { workspaceId: 5, userId: 42, limit: 25 });
    expect(captured).toEqual([{ workspaceId: 5, limit: 25, before: undefined }]);
    expect(snap.nodes).toHaveLength(1);
    expect(snap.nodes[0]).toMatchObject({ id: "7", visible: true });
    expect(snap.producedAt).toBe(NOW);
  });

  it("clamps invalid limit before invoking the read seam", async () => {
    const captured: number[] = [];
    const read: RuntimeLensReadFn = async (params) => {
      captured.push(params.limit);
      return makeRead([], []);
    };
    const runner = createRuntimeLensRunner({ read });
    await runner(makeDef(), { workspaceId: 1, userId: 1, limit: -7 });
    await runner(makeDef(), { workspaceId: 1, userId: 1, limit: 10_000 });
    expect(captured).toEqual([
      RUNTIME_LENS_DEFAULT_LIMIT,
      RUNTIME_LENS_ABSOLUTE_LIMIT,
    ]);
  });

  it("forwards asOf as `before`", async () => {
    const captured: unknown[] = [];
    const read: RuntimeLensReadFn = async (params) => {
      captured.push(params.before);
      return makeRead([], []);
    };
    const runner = createRuntimeLensRunner({ read });
    const asOf = new Date("2026-05-01T00:00:00Z");
    await runner(makeDef(), { workspaceId: 1, userId: 1, asOf });
    expect(captured).toEqual([asOf]);
  });
});

// ============================================================================
// maybeInstallRuntimeLensRunner — envflag gate
// ============================================================================

describe("maybeInstallRuntimeLensRunner — envflag gate", () => {
  const noopRead: RuntimeLensReadFn = async () => makeRead([], []);

  it("no-op when env flag is missing", () => {
    const result = maybeInstallRuntimeLensRunner({ env: {}, read: noopRead });
    expect(result.installed).toBe(false);
    expect(getLensRunner("runtime")).toBeUndefined();
  });

  it("no-op when env flag is not 'on'", () => {
    for (const value of ["off", "true", "1", ""]) {
      __resetLensRunnerRegistryForTests();
      const result = maybeInstallRuntimeLensRunner({
        env: { AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL: value },
        read: noopRead,
      });
      expect(result.installed).toBe(false);
    }
  });

  it("installs runtime runner when 'on'", () => {
    const result = maybeInstallRuntimeLensRunner({
      env: { AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL: "on" },
      read: noopRead,
    });
    expect(result.installed).toBe(true);
    expect(getLensRunner("runtime")).toBeDefined();
  });

  it("registrar test-seam bypasses the real registry", () => {
    const calls: number[] = [];
    const result = maybeInstallRuntimeLensRunner({
      env: { AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL: "on" },
      read: noopRead,
      register: () => {
        calls.push(1);
      },
    });
    expect(result.installed).toBe(true);
    expect(calls).toEqual([1]);
    expect(getLensRunner("runtime")).toBeUndefined();
  });
});

// ============================================================================
// End-to-end through runLens
// ============================================================================

describe("runLens dispatches through the real runtime runner", () => {
  it("returns a meaningful runtime snapshot after install", async () => {
    const read: RuntimeLensReadFn = async () =>
      makeRead(
        [makeRun({ id: 7, status: "running" })],
        [makeAgent({ id: 10, ownerId: 42 })],
      );
    maybeInstallRuntimeLensRunner({
      env: { AGS_GRAPH_LENS_RUNTIME_RUNNER_INSTALL: "on" },
      read,
      now: () => NOW,
    });
    const def = makeDef();
    const snap = await runLens(def, { workspaceId: 1, userId: 42 });
    expect(snap.kind).toBe("runtime");
    expect(snap.nodes).toHaveLength(1);
    expect(snap.nodes[0]).toMatchObject({ id: "7", visible: true });
  });
});

// ============================================================================
// Source-scan: hard-rule boundary
// ============================================================================

describe("Source-scan: runtime-lens-runner boundary", () => {
  it("runtime-lens-runner.ts has no graph-driver / dispatcher / model-execution imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/runtime-lens-runner.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("install-runtime-lens-runner.ts has no graph-driver / dispatcher / model-execution imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/install-runtime-lens-runner.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("runner file does not import Drizzle / pg directly — DB I/O stays in the read-seam adapter", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/runtime-lens-runner.ts",
      ),
      "utf8",
    );
    // The pure builder + factory must not bind to Drizzle / pg / db
    // connection helpers; the DB-backed adapter that satisfies
    // `RuntimeLensReadFn` is a separate slice.
    expect(src).not.toMatch(/from\s+["'].*drizzle/);
    expect(src).not.toMatch(/from\s+["'].*\/db\/connection/);
    expect(src).not.toMatch(/getAsDb(?:ForWorkspace)?/);
  });
});
