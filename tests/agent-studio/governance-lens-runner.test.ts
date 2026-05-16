/**
 * Governance lens runner — second real `LensRunnerFn` (T-F.63).
 *
 * Tests the pure builder + factory + installer + ASDB adapter. The
 * runner replicates precedent (l) on `kind="governance"`; the tRPC
 * router + UI page from T-F.61/.62 accept any registered runner so
 * no router/UI changes are needed here.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildGovernanceLensSnapshot,
  clampGovernanceLensLimit,
  createGovernanceLensRunner,
  createGovernanceLensAsdbReader,
  isGovernanceNodeVisibleToViewer,
  maybeInstallGovernanceLensRunner,
  maybeInstallGovernanceLensRunnerWithAsdb,
  GOVERNANCE_LENS_ABSOLUTE_LIMIT,
  GOVERNANCE_LENS_DEFAULT_LIMIT,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  runLens,
  type GovernanceLensReadFn,
  type GovernanceLensReadResult,
  type GovernanceLensRequestRow,
  type GovernanceLensStepRow,
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

function makeDef(
  overrides: Partial<GraphLensDefinition> = {},
): GraphLensDefinition {
  return {
    id: "governance_x",
    kind: "governance",
    label: "Governance",
    layout: "force_directed",
    governanceScope: "workspace_members",
    ...overrides,
  };
}

function makeRequest(
  overrides: Partial<GovernanceLensRequestRow> = {},
): GovernanceLensRequestRow {
  return {
    id: 1,
    agentId: 10,
    state: "pending",
    targetEnvironment: "staging",
    requestedBy: 42,
    createdAt: T,
    ...overrides,
  };
}

function makeStep(
  overrides: Partial<GovernanceLensStepRow> = {},
): GovernanceLensStepRow {
  return {
    id: 100,
    publishRequestId: 1,
    stepOrder: 1,
    approverRole: "reviewer",
    state: "pending",
    decidedBy: null,
    decidedAt: null,
    createdAt: T,
    ...overrides,
  };
}

function makeRead(
  requests: ReadonlyArray<GovernanceLensRequestRow>,
  steps: ReadonlyArray<GovernanceLensStepRow>,
  truncated = false,
): GovernanceLensReadResult {
  return { requests, steps, truncated };
}

// ============================================================================
// clampGovernanceLensLimit
// ============================================================================

describe("clampGovernanceLensLimit", () => {
  it("returns DEFAULT when undefined", () => {
    expect(clampGovernanceLensLimit(undefined)).toBe(
      GOVERNANCE_LENS_DEFAULT_LIMIT,
    );
  });

  it("clamps to ABSOLUTE when over the cap", () => {
    expect(clampGovernanceLensLimit(10_000)).toBe(
      GOVERNANCE_LENS_ABSOLUTE_LIMIT,
    );
  });

  it("preserves valid values", () => {
    expect(clampGovernanceLensLimit(50)).toBe(50);
  });
});

// ============================================================================
// isGovernanceNodeVisibleToViewer
// ============================================================================

describe("isGovernanceNodeVisibleToViewer", () => {
  it("hidden for anonymous viewer", () => {
    expect(isGovernanceNodeVisibleToViewer(VIEWER_ANON)).toBe(false);
  });

  it("visible for authenticated viewer", () => {
    expect(isGovernanceNodeVisibleToViewer(VIEWER)).toBe(true);
  });
});

// ============================================================================
// buildGovernanceLensSnapshot — shape
// ============================================================================

describe("buildGovernanceLensSnapshot", () => {
  it("empty read returns empty snapshot", () => {
    const snap = buildGovernanceLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([], []),
      now: NOW,
    });
    expect(snap.nodes).toEqual([]);
    expect(snap.edges).toEqual([]);
    expect(snap.kind).toBe("governance");
    expect(snap.layout).toBe("force_directed");
    expect(snap.producedAt).toBe(NOW);
  });

  it("renders publish_request + approval_step nodes with has_step edge", () => {
    const snap = buildGovernanceLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makeRequest({ id: 1 })], [makeStep({ id: 100, publishRequestId: 1 })]),
      now: NOW,
    });
    expect(snap.nodes.map((n) => n.typeKey).sort()).toEqual([
      "approval_step",
      "publish_request",
    ]);
    expect(snap.edges).toEqual([
      {
        typeKey: "has_step",
        sourceNodeId: "req:1",
        targetNodeId: "step:100",
        visible: true,
      },
    ]);
  });

  it("synthesizes approver node + decided_by edge for each distinct decidedBy", () => {
    const snap = buildGovernanceLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead(
        [makeRequest({ id: 1 })],
        [
          makeStep({ id: 100, publishRequestId: 1, decidedBy: 7 }),
          makeStep({ id: 101, publishRequestId: 1, decidedBy: 7 }),
          makeStep({ id: 102, publishRequestId: 1, decidedBy: 9 }),
        ],
      ),
      now: NOW,
    });
    const approvers = snap.nodes.filter((n) => n.typeKey === "approver");
    expect(approvers.map((n) => n.id).sort()).toEqual(["user:7", "user:9"]);
    const decidedByEdges = snap.edges.filter((e) => e.typeKey === "decided_by");
    expect(decidedByEdges).toHaveLength(3);
  });

  it("suppresses has_step edges when the parent request is not in scope", () => {
    // Step's publishRequestId=999 is not in the request set.
    const snap = buildGovernanceLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead(
        [],
        [makeStep({ id: 100, publishRequestId: 999 })],
      ),
      now: NOW,
    });
    expect(snap.edges.filter((e) => e.typeKey === "has_step")).toEqual([]);
  });

  it("does NOT emit decided_by edge when decidedBy is null", () => {
    const snap = buildGovernanceLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead(
        [makeRequest({ id: 1 })],
        [makeStep({ id: 100, publishRequestId: 1, decidedBy: null })],
      ),
      now: NOW,
    });
    expect(snap.edges.filter((e) => e.typeKey === "decided_by")).toEqual([]);
  });

  it("anonymous viewer sees redacted nodes with no label/meta + hiddenNodeCount", () => {
    const snap = buildGovernanceLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read: makeRead(
        [makeRequest({ id: 1 })],
        [makeStep({ id: 100, publishRequestId: 1, decidedBy: 7 })],
      ),
      now: NOW,
    });
    expect(snap.nodes).toHaveLength(3); // request + step + approver
    for (const n of snap.nodes) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    expect(snap.hiddenNodeCount).toBe(3);
  });

  it("forwards read.truncated to snapshot.truncated", () => {
    const snap = buildGovernanceLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([], [], true),
      now: NOW,
    });
    expect(snap.truncated).toBe(true);
  });
});

// ============================================================================
// createGovernanceLensRunner factory
// ============================================================================

describe("createGovernanceLensRunner — factory + DB seam", () => {
  it("calls read seam with workspaceId + limit + before", async () => {
    const captured: unknown[] = [];
    const read: GovernanceLensReadFn = async (params) => {
      captured.push(params);
      return makeRead([makeRequest()], [makeStep()]);
    };
    const runner = createGovernanceLensRunner({ read, now: () => NOW });
    const asOf = new Date("2026-05-01");
    const snap = await runner(makeDef(), {
      workspaceId: 5,
      userId: 42,
      limit: 25,
      asOf,
    });
    expect(captured).toEqual([{ workspaceId: 5, limit: 25, before: asOf }]);
    expect(snap.kind).toBe("governance");
  });

  it("clamps invalid limit before invoking the read seam", async () => {
    const captured: number[] = [];
    const read: GovernanceLensReadFn = async (params) => {
      captured.push(params.limit);
      return makeRead([], []);
    };
    const runner = createGovernanceLensRunner({ read });
    await runner(makeDef(), { workspaceId: 1, userId: 1, limit: -7 });
    await runner(makeDef(), { workspaceId: 1, userId: 1, limit: 10_000 });
    expect(captured).toEqual([
      GOVERNANCE_LENS_DEFAULT_LIMIT,
      GOVERNANCE_LENS_ABSOLUTE_LIMIT,
    ]);
  });
});

// ============================================================================
// maybeInstallGovernanceLensRunner — envflag gate
// ============================================================================

describe("maybeInstallGovernanceLensRunner — envflag gate", () => {
  const noopRead: GovernanceLensReadFn = async () => makeRead([], []);

  it("no-op when env flag is missing", () => {
    const result = maybeInstallGovernanceLensRunner({ env: {}, read: noopRead });
    expect(result.installed).toBe(false);
    expect(getLensRunner("governance")).toBeUndefined();
  });

  it("installs governance runner when 'on'", () => {
    const result = maybeInstallGovernanceLensRunner({
      env: { AGS_GRAPH_LENS_GOVERNANCE_RUNNER_INSTALL: "on" },
      read: noopRead,
    });
    expect(result.installed).toBe(true);
    expect(getLensRunner("governance")).toBeDefined();
  });

  it("composer maybeInstallGovernanceLensRunnerWithAsdb installs when 'on'", () => {
    const result = maybeInstallGovernanceLensRunnerWithAsdb({
      env: { AGS_GRAPH_LENS_GOVERNANCE_RUNNER_INSTALL: "on" },
      readerOptions: { getDbForWorkspace: () => null as never },
    });
    expect(result.installed).toBe(true);
    expect(getLensRunner("governance")).toBeDefined();
  });
});

// ============================================================================
// End-to-end via runLens
// ============================================================================

describe("runLens dispatches through the real governance runner", () => {
  it("returns a governance snapshot after install", async () => {
    const read: GovernanceLensReadFn = async () =>
      makeRead(
        [makeRequest({ id: 1, state: "approved" })],
        [makeStep({ id: 100, publishRequestId: 1, decidedBy: 7 })],
      );
    maybeInstallGovernanceLensRunner({
      env: { AGS_GRAPH_LENS_GOVERNANCE_RUNNER_INSTALL: "on" },
      read,
      now: () => NOW,
    });
    const snap = await runLens(makeDef(), { workspaceId: 1, userId: 42 });
    expect(snap.kind).toBe("governance");
    expect(snap.nodes.length).toBe(3); // request + step + approver
    expect(snap.edges.length).toBe(2); // has_step + decided_by
  });
});

// ============================================================================
// ASDB reader — fail-soft
// ============================================================================

describe("createGovernanceLensAsdbReader — fail-soft", () => {
  it("returns empty result when getDbForWorkspace returns null", async () => {
    const read = createGovernanceLensAsdbReader({
      getDbForWorkspace: () => null as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(result.requests).toEqual([]);
    expect(result.steps).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

// ============================================================================
// Source-scan: hard-rule boundary
// ============================================================================

describe("Source-scan: governance-lens-runner boundary", () => {
  it("runner file has no graph-driver / dispatcher / model-execution imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/governance-lens-runner.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
    // Pure builder must not bind to Drizzle / pg / db connection.
    expect(src).not.toMatch(/from\s+["'].*drizzle/);
    expect(src).not.toMatch(/from\s+["'].*\/db\/connection/);
  });

  it("ASDB reader has no graph-driver / dispatcher / model-execution imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/governance-lens-asdb-reader.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import[\s\S]*?neo4j-driver/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?dispatchMcpToolCall/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?openrouter/m);
    expect(src).not.toMatch(/^\s*import[\s\S]*?credential-resolver/m);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("installer file has no graph-driver / dispatcher / model-execution imports", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/install-governance-lens-runner.ts",
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
