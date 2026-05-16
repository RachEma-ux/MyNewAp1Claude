/**
 * Graph Skill lens runner — seventh real `LensRunnerFn` (T-F.68).
 *
 * Continues precedent (l) replication on `kind="graph_skill"`.
 * Surfaces `agsGraphSkillPacks` — global skill registry.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildGraphSkillLensSnapshot,
  clampGraphSkillLensLimit,
  createGraphSkillLensRunner,
  createGraphSkillLensAsdbReader,
  isGraphSkillNodeVisibleToViewer,
  maybeInstallGraphSkillLensRunner,
  maybeInstallGraphSkillLensRunnerWithAsdb,
  GRAPH_SKILL_LENS_ABSOLUTE_LIMIT,
  GRAPH_SKILL_LENS_DEFAULT_LIMIT,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  runLens,
  type GraphLensDefinition,
  type GraphSkillLensPackRow,
  type GraphSkillLensReadFn,
  type GraphSkillLensReadResult,
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
    id: "graph_skill_x",
    kind: "graph_skill",
    label: "Graph Skills",
    layout: "force_directed",
    governanceScope: "workspace_members",
    ...overrides,
  };
}

function makePack(overrides: Partial<GraphSkillLensPackRow> = {}): GraphSkillLensPackRow {
  return {
    id: 100,
    skillKey: "find_related",
    name: "Find Related Nodes",
    description: null,
    domain: "exploration",
    riskLevel: "low",
    approvalRequired: false,
    active: true,
    createdAt: T,
    ...overrides,
  };
}

function makeRead(
  packs: ReadonlyArray<GraphSkillLensPackRow>,
  truncated = false,
): GraphSkillLensReadResult {
  return { packs, truncated };
}

// ============================================================================
// clamp + visibility
// ============================================================================

describe("clampGraphSkillLensLimit", () => {
  it("returns DEFAULT when undefined", () => {
    expect(clampGraphSkillLensLimit(undefined)).toBe(GRAPH_SKILL_LENS_DEFAULT_LIMIT);
  });
  it("clamps to ABSOLUTE when over the cap", () => {
    expect(clampGraphSkillLensLimit(10_000)).toBe(GRAPH_SKILL_LENS_ABSOLUTE_LIMIT);
  });
});

describe("isGraphSkillNodeVisibleToViewer", () => {
  it("hidden for anonymous", () => {
    expect(isGraphSkillNodeVisibleToViewer(VIEWER_ANON)).toBe(false);
  });
  it("visible for authenticated", () => {
    expect(isGraphSkillNodeVisibleToViewer(VIEWER)).toBe(true);
  });
});

// ============================================================================
// Builder shape
// ============================================================================

describe("buildGraphSkillLensSnapshot", () => {
  it("empty read returns empty snapshot", () => {
    const snap = buildGraphSkillLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([]),
      now: NOW,
    });
    expect(snap.nodes).toEqual([]);
    expect(snap.edges).toEqual([]);
    expect(snap.kind).toBe("graph_skill");
  });

  it("single pack with domain produces 2 nodes + 1 belongs_to_domain edge", () => {
    const snap = buildGraphSkillLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makePack({ id: 100, domain: "exploration" })]),
      now: NOW,
    });
    expect(snap.nodes.map((n) => n.typeKey).sort()).toEqual([
      "graph_skill",
      "graph_skill_domain",
    ]);
    expect(snap.edges).toEqual([
      {
        typeKey: "belongs_to_domain",
        sourceNodeId: "skill:100",
        targetNodeId: "domain:exploration",
        visible: true,
      },
    ]);
  });

  it("pack with null domain produces only the skill node (no edge)", () => {
    const snap = buildGraphSkillLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makePack({ id: 100, domain: null })]),
      now: NOW,
    });
    expect(snap.nodes).toHaveLength(1);
    expect(snap.nodes[0].typeKey).toBe("graph_skill");
    expect(snap.edges).toEqual([]);
  });

  it("dedupes graph_skill_domain across multiple packs in the same domain", () => {
    const snap = buildGraphSkillLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makePack({ id: 100, domain: "exploration" }),
        makePack({ id: 101, domain: "exploration" }),
        makePack({ id: 102, domain: "auditing" }),
      ]),
      now: NOW,
    });
    const domains = snap.nodes.filter((n) => n.typeKey === "graph_skill_domain");
    const skills = snap.nodes.filter((n) => n.typeKey === "graph_skill");
    expect(domains.map((n) => n.id).sort()).toEqual([
      "domain:auditing",
      "domain:exploration",
    ]);
    expect(skills).toHaveLength(3);
    expect(snap.edges).toHaveLength(3);
  });

  it("anonymous viewer sees redacted nodes with no label/meta", () => {
    const snap = buildGraphSkillLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read: makeRead([makePack({ id: 100, domain: "x" })]),
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

  it("skill meta carries riskLevel + approvalRequired + active", () => {
    const snap = buildGraphSkillLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makePack({
          id: 100,
          riskLevel: "high",
          approvalRequired: true,
          active: false,
        }),
      ]),
      now: NOW,
    });
    const skill = snap.nodes.find((n) => n.typeKey === "graph_skill");
    expect(skill?.meta).toMatchObject({
      riskLevel: "high",
      approvalRequired: true,
      active: false,
    });
  });

  it("forwards read.truncated to snapshot.truncated", () => {
    const snap = buildGraphSkillLensSnapshot({
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

describe("createGraphSkillLensRunner — factory", () => {
  it("clamps invalid limit", async () => {
    const captured: number[] = [];
    const read: GraphSkillLensReadFn = async (p) => {
      captured.push(p.limit);
      return makeRead([]);
    };
    const runner = createGraphSkillLensRunner({ read });
    await runner(makeDef(), { workspaceId: 1, userId: 1, limit: -7 });
    expect(captured).toEqual([GRAPH_SKILL_LENS_DEFAULT_LIMIT]);
  });
});

describe("maybeInstallGraphSkillLensRunner — envflag", () => {
  const noopRead: GraphSkillLensReadFn = async () => makeRead([]);

  it("no-op when missing", () => {
    expect(maybeInstallGraphSkillLensRunner({ env: {}, read: noopRead }).installed).toBe(
      false,
    );
  });
  it("installs when 'on'", () => {
    expect(
      maybeInstallGraphSkillLensRunner({
        env: { AGS_GRAPH_LENS_GRAPH_SKILL_RUNNER_INSTALL: "on" },
        read: noopRead,
      }).installed,
    ).toBe(true);
    expect(getLensRunner("graph_skill")).toBeDefined();
  });
  it("composer with-asdb installs when 'on'", () => {
    expect(
      maybeInstallGraphSkillLensRunnerWithAsdb({
        env: { AGS_GRAPH_LENS_GRAPH_SKILL_RUNNER_INSTALL: "on" },
        readerOptions: { getDbForWorkspace: () => null as never },
      }).installed,
    ).toBe(true);
  });
});

describe("runLens dispatches through the real graph_skill runner", () => {
  it("returns a graph_skill snapshot after install", async () => {
    maybeInstallGraphSkillLensRunner({
      env: { AGS_GRAPH_LENS_GRAPH_SKILL_RUNNER_INSTALL: "on" },
      read: async () => makeRead([makePack({ id: 100, domain: "x" })]),
      now: () => NOW,
    });
    const snap = await runLens(makeDef(), { workspaceId: 1, userId: 42 });
    expect(snap.kind).toBe("graph_skill");
    expect(snap.nodes).toHaveLength(2);
    expect(snap.edges).toHaveLength(1);
  });
});

describe("createGraphSkillLensAsdbReader — fail-soft", () => {
  it("returns empty result when getDbForWorkspace returns null", async () => {
    const read = createGraphSkillLensAsdbReader({
      getDbForWorkspace: () => null as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(result.packs).toEqual([]);
  });
});

// ============================================================================
// Source-scan
// ============================================================================

describe("Source-scan: graph-skill-lens-runner boundary", () => {
  it("runner file: no banned imports + no Drizzle", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/graph-skill-lens-runner.ts",
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
        "../../server/agent-studio/services/graph-lens/runners/graph-skill-lens-asdb-reader.ts",
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
        "../../server/agent-studio/services/graph-lens/install-graph-skill-lens-runner.ts",
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
