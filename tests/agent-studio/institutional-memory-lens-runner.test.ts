/**
 * Institutional Memory lens runner — eighth + final real
 * `LensRunnerFn` (T-F.69). Closes the lens-stack coverage to 8/8.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  buildInstitutionalMemoryLensSnapshot,
  clampInstitutionalMemoryLensLimit,
  createInstitutionalMemoryLensRunner,
  createInstitutionalMemoryLensAsdbReader,
  isInstitutionalMemoryNodeVisibleToViewer,
  maybeInstallInstitutionalMemoryLensRunner,
  maybeInstallInstitutionalMemoryLensRunnerWithAsdb,
  INSTITUTIONAL_MEMORY_LENS_ABSOLUTE_LIMIT,
  INSTITUTIONAL_MEMORY_LENS_DEFAULT_LIMIT,
  __resetLensRunnerRegistryForTests,
  getLensRunner,
  runLens,
  type GraphLensDefinition,
  type InstitutionalMemoryLensAgentRow,
  type InstitutionalMemoryLensReadFn,
  type InstitutionalMemoryLensReadResult,
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
    id: "inst_x",
    kind: "institutional_memory",
    label: "Institutional Memory",
    layout: "force_directed",
    governanceScope: "workspace_members",
    ...overrides,
  };
}

function makeAgent(
  overrides: Partial<InstitutionalMemoryLensAgentRow> = {},
): InstitutionalMemoryLensAgentRow {
  return {
    id: 100,
    name: "Triage Assistant",
    internalKey: "triage_assistant",
    ownerId: 42,
    domain: "support",
    visibility: "private",
    lifecycleState: "active",
    agentClass: "assistant",
    createdAt: T,
    ...overrides,
  };
}

function makeRead(
  agents: ReadonlyArray<InstitutionalMemoryLensAgentRow>,
  truncated = false,
): InstitutionalMemoryLensReadResult {
  return { agents, truncated };
}

// ============================================================================
// clamp + visibility
// ============================================================================

describe("clampInstitutionalMemoryLensLimit", () => {
  it("returns DEFAULT when undefined", () => {
    expect(clampInstitutionalMemoryLensLimit(undefined)).toBe(
      INSTITUTIONAL_MEMORY_LENS_DEFAULT_LIMIT,
    );
  });
  it("clamps to ABSOLUTE when over the cap", () => {
    expect(clampInstitutionalMemoryLensLimit(10_000)).toBe(
      INSTITUTIONAL_MEMORY_LENS_ABSOLUTE_LIMIT,
    );
  });
});

describe("isInstitutionalMemoryNodeVisibleToViewer", () => {
  it("hidden for anonymous", () => {
    expect(isInstitutionalMemoryNodeVisibleToViewer(VIEWER_ANON)).toBe(false);
  });
  it("visible for authenticated", () => {
    expect(isInstitutionalMemoryNodeVisibleToViewer(VIEWER)).toBe(true);
  });
});

// ============================================================================
// Builder shape
// ============================================================================

describe("buildInstitutionalMemoryLensSnapshot", () => {
  it("empty read returns empty snapshot", () => {
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([]),
      now: NOW,
    });
    expect(snap.nodes).toEqual([]);
    expect(snap.edges).toEqual([]);
    expect(snap.kind).toBe("institutional_memory");
  });

  it("single agent with owner + domain produces 3 nodes + 2 edges", () => {
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makeAgent({ id: 100, ownerId: 42, domain: "support" })]),
      now: NOW,
    });
    expect(snap.nodes.map((n) => n.typeKey).sort()).toEqual([
      "inst_agent",
      "inst_domain",
      "inst_owner",
    ]);
    expect(snap.edges.map((e) => e.typeKey).sort()).toEqual([
      "belongs_to_domain",
      "owned_by",
    ]);
  });

  it("agent with null owner does NOT emit owned_by edge or inst_owner node", () => {
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makeAgent({ id: 100, ownerId: null, domain: "support" })]),
      now: NOW,
    });
    expect(snap.nodes.map((n) => n.typeKey).sort()).toEqual([
      "inst_agent",
      "inst_domain",
    ]);
    expect(snap.edges.map((e) => e.typeKey)).toEqual(["belongs_to_domain"]);
  });

  it("agent with null domain does NOT emit belongs_to_domain edge or inst_domain node", () => {
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([makeAgent({ id: 100, ownerId: 42, domain: null })]),
      now: NOW,
    });
    expect(snap.nodes.map((n) => n.typeKey).sort()).toEqual([
      "inst_agent",
      "inst_owner",
    ]);
    expect(snap.edges.map((e) => e.typeKey)).toEqual(["owned_by"]);
  });

  it("dedupes inst_owner + inst_domain across multiple agents", () => {
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makeAgent({ id: 1, ownerId: 42, domain: "x" }),
        makeAgent({ id: 2, ownerId: 42, domain: "x" }),
        makeAgent({ id: 3, ownerId: 42, domain: "y" }),
        makeAgent({ id: 4, ownerId: 99, domain: "y" }),
      ]),
      now: NOW,
    });
    const owners = snap.nodes.filter((n) => n.typeKey === "inst_owner");
    const domains = snap.nodes.filter((n) => n.typeKey === "inst_domain");
    const agents = snap.nodes.filter((n) => n.typeKey === "inst_agent");
    expect(owners.map((n) => n.id).sort()).toEqual(["user:42", "user:99"]);
    expect(domains.map((n) => n.id).sort()).toEqual(["domain:x", "domain:y"]);
    expect(agents).toHaveLength(4);
    // 4 owned_by + 4 belongs_to_domain = 8 edges.
    expect(snap.edges).toHaveLength(8);
  });

  it("anonymous viewer sees redacted nodes with no label/meta", () => {
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read: makeRead([makeAgent()]),
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

  it("agent meta carries lifecycle + visibility + agentClass", () => {
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read: makeRead([
        makeAgent({
          id: 100,
          lifecycleState: "archived",
          visibility: "public",
          agentClass: "router",
        }),
      ]),
      now: NOW,
    });
    const agent = snap.nodes.find((n) => n.typeKey === "inst_agent");
    expect(agent?.meta).toMatchObject({
      lifecycleState: "archived",
      visibility: "public",
      agentClass: "router",
    });
  });

  it("forwards read.truncated to snapshot.truncated", () => {
    const snap = buildInstitutionalMemoryLensSnapshot({
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

describe("createInstitutionalMemoryLensRunner — factory", () => {
  it("clamps invalid limit", async () => {
    const captured: number[] = [];
    const read: InstitutionalMemoryLensReadFn = async (p) => {
      captured.push(p.limit);
      return makeRead([]);
    };
    const runner = createInstitutionalMemoryLensRunner({ read });
    await runner(makeDef(), { workspaceId: 1, userId: 1, limit: -7 });
    expect(captured).toEqual([INSTITUTIONAL_MEMORY_LENS_DEFAULT_LIMIT]);
  });
});

describe("maybeInstallInstitutionalMemoryLensRunner — envflag", () => {
  const noopRead: InstitutionalMemoryLensReadFn = async () => makeRead([]);

  it("no-op when missing", () => {
    expect(
      maybeInstallInstitutionalMemoryLensRunner({ env: {}, read: noopRead })
        .installed,
    ).toBe(false);
  });
  it("installs when 'on'", () => {
    expect(
      maybeInstallInstitutionalMemoryLensRunner({
        env: { AGS_GRAPH_LENS_INSTITUTIONAL_MEMORY_RUNNER_INSTALL: "on" },
        read: noopRead,
      }).installed,
    ).toBe(true);
    expect(getLensRunner("institutional_memory")).toBeDefined();
  });
  it("composer with-asdb installs when 'on'", () => {
    expect(
      maybeInstallInstitutionalMemoryLensRunnerWithAsdb({
        env: { AGS_GRAPH_LENS_INSTITUTIONAL_MEMORY_RUNNER_INSTALL: "on" },
        readerOptions: { getDbForWorkspace: () => null as never },
      }).installed,
    ).toBe(true);
  });
});

describe("runLens dispatches through the real institutional_memory runner", () => {
  it("returns an institutional_memory snapshot after install", async () => {
    maybeInstallInstitutionalMemoryLensRunner({
      env: { AGS_GRAPH_LENS_INSTITUTIONAL_MEMORY_RUNNER_INSTALL: "on" },
      read: async () =>
        makeRead([makeAgent({ id: 100, ownerId: 42, domain: "x" })]),
      now: () => NOW,
    });
    const snap = await runLens(makeDef(), { workspaceId: 1, userId: 42 });
    expect(snap.kind).toBe("institutional_memory");
    expect(snap.nodes).toHaveLength(3);
    expect(snap.edges).toHaveLength(2);
  });
});

describe("createInstitutionalMemoryLensAsdbReader — fail-soft", () => {
  it("returns empty result when getDbForWorkspace returns null", async () => {
    const read = createInstitutionalMemoryLensAsdbReader({
      getDbForWorkspace: () => null as never,
    });
    const result = await read({ workspaceId: 1, limit: 50 });
    expect(result.agents).toEqual([]);
  });
});

// ============================================================================
// Source-scan
// ============================================================================

describe("Source-scan: institutional-memory-lens-runner boundary", () => {
  it("runner file: no banned imports + no Drizzle", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/institutional-memory-lens-runner.ts",
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
        "../../server/agent-studio/services/graph-lens/runners/institutional-memory-lens-asdb-reader.ts",
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
        "../../server/agent-studio/services/graph-lens/install-institutional-memory-lens-runner.ts",
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
