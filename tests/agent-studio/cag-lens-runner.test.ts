/**
 * CAG lens runner — fourth real `LensRunnerFn` (T-F.65).
 *
 * Continues precedent (l) replication on `kind="cag"`. Tests the
 * pure builder + factory + installer + ASDB adapter.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildCagLensSnapshot,
  clampCagLensLimit,
  createCagLensRunner,
  createCagLensAsdbReader,
  isCagNodeVisibleToViewer,
  maybeInstallCagLensRunner,
  maybeInstallCagLensRunnerWithAsdb,
  CAG_LENS_ABSOLUTE_LIMIT,
  CAG_LENS_DEFAULT_LIMIT,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  runLens,
  type CagLensPackRow,
  type CagLensReadFn,
  type CagLensReadResult,
  type GraphLensDefinition,
  type LensRunnerViewerContext,
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
    id: "cag_x",
    kind: "cag",
    label: "CAG",
    layout: "force_directed",
    governanceScope: "workspace_members",
    ...overrides,
  };
}

function makePack(overrides: Partial<CagLensPackRow> = {}): CagLensPackRow {
  return {
    id: 100,
    workspaceId: 1,
    agentId: 10,
    packType: "capability_v1",
    packVersion: 1,
    status: "fresh",
    tokenEstimate: 500,
    compileResult: "ok",
    governanceVerdict: "cleared",
    useCount: 3,
    createdAt: T,
    ...overrides,
  };
}

function makeRead(
  packs: ReadonlyArray<CagLensPackRow>,
  truncated = false,
): CagLensReadResult {
  return { packs, truncated };
}

// ============================================================================
// clamp + visibility
// ============================================================================

describe("clampCagLensLimit", () => {
  it("returns DEFAULT when undefined", () => {
    expect(clampCagLensLimit(undefined)).toBe(CAG_LENS_DEFAULT_LIMIT);
  });
  it("clamps to ABSOLUTE when over the cap", () => {
    expect(clampCagLensLimit(10_000)).toBe(CAG_LENS_ABSOLUTE_LIMIT);
  });
});

describe("isCagNodeVisibleToViewer", () => {
  it("hidden for anonymous", () => {
    expect(isCagNodeVisibleToViewer(VIEWER_ANON)).toBe(false);
  });
  it("visible for authenticated", () => {
    expect(isCagNodeVisibleToViewer(VIEWER)).toBe(true);
  });
});

// ============================================================================
// Builder shape
// ============================================================================

describe("buildCagLensSnapshot", () => {
  it("empty read returns empty snapshot", () => {
    const snap = buildCagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([]),
      now: NOW,
    });
    expect(snap.nodes).toEqual([]);
    expect(snap.edges).toEqual([]);
    expect(snap.kind).toBe("cag");
  });

  it("single pack produces 2 nodes (cag_agent + cag_pack) + 1 owns edge", () => {
    const snap = buildCagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makePack({ id: 100, agentId: 10 })]),
      now: NOW,
    });
    expect(snap.nodes.map((n) => n.typeKey).sort()).toEqual([
      "cag_agent",
      "cag_pack",
    ]);
    expect(snap.edges).toEqual([
      {
        typeKey: "owns",
        sourceNodeId: "agent:10",
        targetNodeId: "pack:100",
        visible: true,
      },
    ]);
  });

  it("dedupes cag_agent across multiple packs for the same agent", () => {
    const snap = buildCagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makePack({ id: 100, agentId: 10 }),
        makePack({ id: 101, agentId: 10 }),
        makePack({ id: 102, agentId: 11 }),
      ]),
      now: NOW,
    });
    const agents = snap.nodes.filter((n) => n.typeKey === "cag_agent");
    const packs = snap.nodes.filter((n) => n.typeKey === "cag_pack");
    expect(agents.map((n) => n.id).sort()).toEqual(["agent:10", "agent:11"]);
    expect(packs).toHaveLength(3);
    expect(snap.edges).toHaveLength(3);
  });

  it("anonymous viewer sees redacted nodes with no label/meta", () => {
    const snap = buildCagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read: makeRead([makePack({ id: 100, agentId: 10 })]),
      now: NOW,
    });
    expect(snap.nodes).toHaveLength(2);
    for (const n of snap.nodes) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    expect(snap.hiddenNodeCount).toBe(2);
  });

  it("forwards read.truncated to snapshot.truncated", () => {
    const snap = buildCagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([], true),
      now: NOW,
    });
    expect(snap.truncated).toBe(true);
  });

  it("pack node meta carries the full lifecycle shape", () => {
    const snap = buildCagLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makePack({
          id: 100,
          agentId: 10,
          packType: "capability_v1",
          packVersion: 3,
          status: "stale",
          tokenEstimate: 1024,
          compileResult: "warn",
          governanceVerdict: "cleared",
          useCount: 7,
        }),
      ]),
      now: NOW,
    });
    const pack = snap.nodes.find((n) => n.typeKey === "cag_pack");
    expect(pack?.meta).toMatchObject({
      packType: "capability_v1",
      packVersion: 3,
      status: "stale",
      tokenEstimate: 1024,
      compileResult: "warn",
      governanceVerdict: "cleared",
      useCount: 7,
    });
  });
});

// ============================================================================
// Factory
// ============================================================================

describe("createCagLensRunner — factory + DB seam", () => {
  it("calls read seam with workspaceId + limit + before; clamps limit", async () => {
    const captured: unknown[] = [];
    const read: CagLensReadFn = async (params) => {
      captured.push(params);
      return makeRead([]);
    };
    const runner = createCagLensRunner({ read, now: () => NOW });
    const asOf = new Date("2026-05-01");
    await runner(makeDef(), {
      workspaceId: 5,
      userId: 42,
      limit: -7,
      asOf,
    });
    expect(captured).toEqual([
      { workspaceId: 5, limit: CAG_LENS_DEFAULT_LIMIT, before: asOf },
    ]);
  });
});

// ============================================================================
// Installer
// ============================================================================

describe("maybeInstallCagLensRunner — envflag gate", () => {
  const noopRead: CagLensReadFn = async () => makeRead([]);

  it("no-op when env flag missing", () => {
    const result = maybeInstallCagLensRunner({ env: {}, read: noopRead });
    expect(result.installed).toBe(false);
    expect(getLensRunner("cag")).toBeUndefined();
  });

  it("installs when 'on'", () => {
    const result = maybeInstallCagLensRunner({
      env: { AGS_GRAPH_LENS_CAG_RUNNER_INSTALL: "on" },
      read: noopRead,
    });
    expect(result.installed).toBe(true);
    expect(getLensRunner("cag")).toBeDefined();
  });

  it("composer with-asdb installs when 'on'", () => {
    const result = maybeInstallCagLensRunnerWithAsdb({
      env: { AGS_GRAPH_LENS_CAG_RUNNER_INSTALL: "on" },
      readerOptions: { getDbForWorkspace: () => null as never },
    });
    expect(result.installed).toBe(true);
    expect(getLensRunner("cag")).toBeDefined();
  });
});

// ============================================================================
// End-to-end via runLens
// ============================================================================

describe("runLens dispatches through the real cag runner", () => {
  it("returns a cag snapshot after install", async () => {
    const read: CagLensReadFn = async () =>
      makeRead([makePack({ id: 100, agentId: 10 })]);
    maybeInstallCagLensRunner({
      env: { AGS_GRAPH_LENS_CAG_RUNNER_INSTALL: "on" },
      read,
      now: () => NOW,
    });
    const snap = await runLens(makeDef(), { workspaceId: 1, userId: 42 });
    expect(snap.kind).toBe("cag");
    expect(snap.nodes).toHaveLength(2);
    expect(snap.edges).toHaveLength(1);
  });
});

// ============================================================================
// ASDB reader fail-soft
// ============================================================================

describe("createCagLensAsdbReader — fail-soft", () => {
  it("returns empty result when getDbForWorkspace returns null", async () => {
    const read = createCagLensAsdbReader({
      getDbForWorkspace: () => null as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(result.packs).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

// ============================================================================
// Source-scan
// ============================================================================

describe("Source-scan: cag-lens-runner boundary", () => {
  it("runner file: no graph-driver / dispatcher / model-execution imports + no Drizzle", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/cag-lens-runner.ts",
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
        "../../server/agent-studio/services/graph-lens/runners/cag-lens-asdb-reader.ts",
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
        "../../server/agent-studio/services/graph-lens/install-cag-lens-runner.ts",
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
