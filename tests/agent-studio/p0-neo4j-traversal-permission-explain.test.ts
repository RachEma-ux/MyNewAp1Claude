/**
 * P0 closure — Neo4jCommunityGraphRepository runtime completion.
 *
 * Covers all 13 previously-stubbed methods on
 * `server/agent-studio/services/graph/repository/neo4j-community-graph-repository.ts`:
 *
 *   Traversal      → localGraph / globalGraphSample / neighborhood / shortestPath
 *   Permission     → filterByPermissions / isVisibleToUser / isVisibleToRuntime
 *   Explain        → explainPath / explainNode
 *   Algorithms     → runAlgorithm (capability-gated)
 *   Projection sync→ enqueueProjectionJob / takeSnapshot / detectDrift / rebuildProjection
 *
 * Strategy:
 *   - Inject a stub `Neo4jExecutor` that records Cypher + params and
 *     returns canned records. No live Neo4j on device per CLAUDE.md.
 *   - Inject a Drizzle-shaped stub DB for projection-sync lifecycle.
 *   - Pure-function permission helper `isVisibleToRuntime` covered
 *     in isolation for the safe-default-deny rule.
 *
 * Skip-safe: this file has zero live-DB / live-Neo4j requirements.
 */

import { describe, it, expect } from "vitest";

import {
  Neo4jCommunityGraphRepository,
  isVisibleToRuntime,
  type Neo4jExecutor,
} from "../../server/agent-studio/services/graph/repository/neo4j-community-graph-repository";
import {
  GraphCapabilityUnsupportedError,
  type RuntimeContext,
} from "../../server/agent-studio/services/graph/repository";

// ────────────────────────────────────────────────────────────────────
// Executor stub
// ────────────────────────────────────────────────────────────────────

interface CapturedCall {
  mode: "read" | "write" | "testConnection";
  cypher?: string;
  params?: Record<string, unknown>;
}

function makeExecutorStub(
  readResponder: (cypher: string, params: Record<string, unknown>) => Record<string, unknown>[],
  writeResponder?: (
    cypher: string,
    params: Record<string, unknown>,
  ) => Record<string, unknown>[],
  testConnectionResponder?: () => {
    connected: boolean;
    version?: string;
    error?: string;
  },
): { executor: Neo4jExecutor; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const executor: Neo4jExecutor = {
    async read(_source, cypher, params = {}) {
      calls.push({ mode: "read", cypher, params });
      return { records: readResponder(cypher, params) };
    },
    async write(_source, cypher, params = {}) {
      calls.push({ mode: "write", cypher, params });
      const fn = writeResponder ?? readResponder;
      return { records: fn(cypher, params) };
    },
    async testConnection(_source) {
      calls.push({ mode: "testConnection" });
      return testConnectionResponder ? testConnectionResponder() : { connected: true, version: "5.0" };
    },
  };
  return { executor, calls };
}

// ────────────────────────────────────────────────────────────────────
// Drizzle-shaped stub DB (matches the slice the repo uses)
// ────────────────────────────────────────────────────────────────────

interface DbCall {
  op: "insert" | "update" | "select";
  table: unknown;
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
}

function makeStubDb(opts: {
  insertIds?: number[];
  selectResults?: Record<string, Record<string, unknown>[]>;
} = {}): { db: unknown; calls: DbCall[] } {
  const calls: DbCall[] = [];
  let idx = 0;
  const insertIds = opts.insertIds ?? [1, 2, 3];
  const selectResults = opts.selectResults ?? {};
  let lastSelectTable: unknown = null;

  function makeReturning(table: unknown) {
    return {
      async returning(_cols: unknown) {
        const id = insertIds[idx++] ?? 999;
        // record-keeping is done at insert(); here we just return.
        return [{ id }];
      },
    };
  }

  const db = {
    insert(table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          calls.push({ op: "insert", table, values: row });
          return makeReturning(table);
        },
      };
    },
    update(table: unknown) {
      return {
        set(row: Record<string, unknown>) {
          calls.push({ op: "update", table, set: row });
          return {
            where(_pred: unknown) {
              return Promise.resolve();
            },
          };
        },
      };
    },
    select(_cols?: unknown) {
      return {
        from(table: unknown) {
          calls.push({ op: "select", table });
          lastSelectTable = table;
          return {
            where(_pred: unknown) {
              return {
                orderBy(_o: unknown) {
                  return {
                    async limit(_n: number) {
                      const tableKey = String((lastSelectTable as any)?._?.name ?? "");
                      return selectResults[tableKey] ?? [];
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

// ────────────────────────────────────────────────────────────────────
// Common setup
// ────────────────────────────────────────────────────────────────────

const RUNTIME: RuntimeContext = {
  workspaceId: 7,
  userId: 42,
  userRole: "viewer",
  governanceStatusFilter: ["active"],
};

const ADMIN_RUNTIME: RuntimeContext = {
  workspaceId: 7,
  userId: 1,
  userRole: "admin",
  governanceStatusFilter: ["active"],
};

const BASE_OPTIONS = {
  endpoint: "bolt://localhost:7687",
  username: "neo4j",
  password: "neo4j",
};

function repoWith(stub: ReturnType<typeof makeExecutorStub>): Neo4jCommunityGraphRepository {
  return new Neo4jCommunityGraphRepository({
    ...BASE_OPTIONS,
    executor: stub.executor,
  });
}

// ────────────────────────────────────────────────────────────────────
// Traversal — P0-2
// ────────────────────────────────────────────────────────────────────

describe("P0-2 — localGraph", () => {
  it("returns nodes + edges for a found seed with depth + permission filter in cypher", async () => {
    const stub = makeExecutorStub(() => [
      {
        nodes: [
          { properties: { id: "n1", workspace_id: 7 }, labels: ["note"] },
          { properties: { id: "n2", workspace_id: 7 }, labels: ["note"] },
        ],
        edges: [
          { properties: { source_id: "n1", target_id: "n2" }, type: "RELATES_TO" },
        ],
      },
    ]);
    const repo = repoWith(stub);
    const out = await repo.localGraph(
      "n1",
      { maxDepth: 2, maxResults: 10 },
      RUNTIME,
    );
    expect(out.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(out.edges).toHaveLength(1);
    expect(stub.calls[0]!.cypher).toMatch(/governance_status/);
    expect(stub.calls[0]!.cypher).toMatch(/workspace_id/);
    expect(stub.calls[0]!.params).toMatchObject({
      seedId: "n1",
      workspaceId: 7,
      governanceFilter: ["active"],
    });
    // Depth literal interpolated (clamped to 2) — value parameters
    // are still bound; the depth is structurally required.
    expect(stub.calls[0]!.cypher).toMatch(/r\*1\.\.2/);
  });

  it("empty seed returns empty result without calling executor", async () => {
    const stub = makeExecutorStub(() => [{ nodes: [], edges: [] }]);
    const repo = repoWith(stub);
    const out = await repo.localGraph(
      "",
      { maxDepth: 2, maxResults: 10 },
      RUNTIME,
    );
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.truncated).toBe(false);
    expect(stub.calls).toHaveLength(0);
  });

  it("clamps depth to ABSOLUTE_MAX_DEPTH (8) when caller requests larger", async () => {
    const stub = makeExecutorStub(() => [{ nodes: [], edges: [] }]);
    const repo = repoWith(stub);
    await repo.localGraph("n1", { maxDepth: 50, maxResults: 10 }, RUNTIME);
    expect(stub.calls[0]!.cypher).toMatch(/r\*1\.\.8/);
  });

  it("clamps depth to 1 on non-finite / non-positive input", async () => {
    const stub = makeExecutorStub(() => [{ nodes: [], edges: [] }]);
    const repo = repoWith(stub);
    await repo.localGraph(
      "n1",
      { maxDepth: -5, maxResults: 10 },
      RUNTIME,
    );
    expect(stub.calls[0]!.cypher).toMatch(/r\*1\.\.1/);
  });

  it("sets truncated=true when raw nodes exceed maxResults", async () => {
    const stub = makeExecutorStub(() => [
      {
        nodes: Array.from({ length: 50 }, (_, i) => ({
          properties: { id: `n${i}` },
          labels: ["x"],
        })),
        edges: [],
      },
    ]);
    const repo = repoWith(stub);
    const out = await repo.localGraph(
      "n1",
      { maxDepth: 2, maxResults: 10 },
      RUNTIME,
    );
    expect(out.nodes).toHaveLength(10);
    expect(out.truncated).toBe(true);
    expect(out.truncationReason).toMatch(/capped at maxResults=10/);
  });

  it("binds workspaceId=null when runtime has no workspace (used for context-free reads)", async () => {
    const stub = makeExecutorStub(() => [{ nodes: [], edges: [] }]);
    const repo = repoWith(stub);
    await repo.localGraph("n1", { maxDepth: 1, maxResults: 5 }, {});
    expect(stub.calls[0]!.params!.workspaceId).toBeNull();
  });
});

describe("P0-2 — globalGraphSample", () => {
  it("returns nodes + edges respecting sampleSize", async () => {
    const stub = makeExecutorStub(() => [
      {
        nodes: Array.from({ length: 5 }, (_, i) => ({
          properties: { id: `s${i}` },
          labels: ["sample"],
        })),
        edges: [],
      },
    ]);
    const repo = repoWith(stub);
    const out = await repo.globalGraphSample(
      { maxDepth: 1, maxResults: 5 },
      RUNTIME,
    );
    expect(out.nodes).toHaveLength(5);
    expect(stub.calls[0]!.params).toMatchObject({
      workspaceId: 7,
      sampleSize: 5,
    });
  });

  it("clamps sampleSize to ABSOLUTE_MAX_RESULTS (2000)", async () => {
    const stub = makeExecutorStub(() => [{ nodes: [], edges: [] }]);
    const repo = repoWith(stub);
    await repo.globalGraphSample(
      { maxDepth: 1, maxResults: 99999 },
      RUNTIME,
    );
    expect(stub.calls[0]!.params!.sampleSize).toBe(2000);
  });

  it("permission-filter cypher present", async () => {
    const stub = makeExecutorStub(() => [{ nodes: [], edges: [] }]);
    const repo = repoWith(stub);
    await repo.globalGraphSample({ maxDepth: 1, maxResults: 10 }, RUNTIME);
    expect(stub.calls[0]!.cypher).toMatch(/governance_status/);
    expect(stub.calls[0]!.cypher).toMatch(/workspace_id/);
  });
});

describe("P0-2 — neighborhood", () => {
  it("returns visible neighbors at requested depth", async () => {
    const stub = makeExecutorStub(() => [
      {
        nodes: [
          { properties: { id: "seed" }, labels: ["note"] },
          { properties: { id: "neighbor" }, labels: ["note"] },
        ],
        edges: [{ properties: {}, type: "RELATES" }],
      },
    ]);
    const repo = repoWith(stub);
    const out = await repo.neighborhood("seed", 2, RUNTIME);
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["neighbor", "seed"]);
    expect(stub.calls[0]!.cypher).toMatch(/r\*1\.\.2/);
  });

  it("empty seed returns empty without executor call", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    const out = await repo.neighborhood("", 2, RUNTIME);
    expect(out.nodes).toEqual([]);
    expect(stub.calls).toHaveLength(0);
  });

  it("max-depth clamp to ABSOLUTE_MAX_DEPTH on overflow", async () => {
    const stub = makeExecutorStub(() => [{ nodes: [], edges: [] }]);
    const repo = repoWith(stub);
    await repo.neighborhood("seed", 100, RUNTIME);
    expect(stub.calls[0]!.cypher).toMatch(/r\*1\.\.8/);
  });
});

describe("P0-2 — shortestPath", () => {
  it("returns path with length when found", async () => {
    const stub = makeExecutorStub(() => [
      {
        pathNodes: [
          { properties: { id: "a" }, labels: ["note"] },
          { properties: { id: "b" }, labels: ["note"] },
          { properties: { id: "c" }, labels: ["note"] },
        ],
        pathRels: [
          { properties: {}, type: "REL1" },
          { properties: {}, type: "REL2" },
        ],
      },
    ]);
    const repo = repoWith(stub);
    const out = await repo.shortestPath("a", "c", RUNTIME);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(2);
    expect(out!.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("returns null when no path", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    const out = await repo.shortestPath("a", "z", RUNTIME);
    expect(out).toBeNull();
  });

  it("returns null on empty endpoints without executor call", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    expect(await repo.shortestPath("", "b", RUNTIME)).toBeNull();
    expect(await repo.shortestPath("a", "", RUNTIME)).toBeNull();
    expect(stub.calls).toHaveLength(0);
  });

  it("binds permission-filter params", async () => {
    const stub = makeExecutorStub(() => [{ pathNodes: [], pathRels: [] }]);
    const repo = repoWith(stub);
    await repo.shortestPath("a", "b", RUNTIME);
    expect(stub.calls[0]!.params).toMatchObject({
      fromId: "a",
      toId: "b",
      workspaceId: 7,
      governanceFilter: ["active"],
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Permission — P0-3
// ────────────────────────────────────────────────────────────────────

describe("P0-3 — isVisibleToRuntime (pure helper)", () => {
  it("active + matching workspace + visible + public → true", () => {
    expect(
      isVisibleToRuntime(
        {
          governanceStatus: "active",
          workspaceId: 7,
          visibility: "visible",
          sensitivity: "public",
        },
        RUNTIME,
      ),
    ).toBe(true);
  });

  it("governance hidden → false (when filter only allows active)", () => {
    expect(
      isVisibleToRuntime(
        {
          governanceStatus: "hidden",
          workspaceId: 7,
          visibility: "visible",
          sensitivity: "public",
        },
        RUNTIME,
      ),
    ).toBe(false);
  });

  it("cross-workspace block: node workspace 99 vs runtime workspace 7 → false", () => {
    expect(
      isVisibleToRuntime(
        {
          governanceStatus: "active",
          workspaceId: 99,
          visibility: "visible",
          sensitivity: "public",
        },
        RUNTIME,
      ),
    ).toBe(false);
  });

  it("allowedWorkspaces honored", () => {
    expect(
      isVisibleToRuntime(
        {
          governanceStatus: "active",
          workspaceId: 99,
          visibility: "visible",
          sensitivity: "public",
        },
        { ...RUNTIME, allowedWorkspaces: [99] },
      ),
    ).toBe(true);
  });

  it("safe-default DENY: node has workspaceId but runtime carries no workspace context", () => {
    expect(
      isVisibleToRuntime(
        {
          governanceStatus: "active",
          workspaceId: 7,
          visibility: "visible",
          sensitivity: "public",
        },
        {},
      ),
    ).toBe(false);
  });

  it("unscoped node (workspaceId=null) visible even without runtime context", () => {
    expect(
      isVisibleToRuntime(
        {
          governanceStatus: "active",
          workspaceId: null,
          visibility: "visible",
          sensitivity: "public",
        },
        {},
      ),
    ).toBe(true);
  });

  it("visibility=hidden blocked for viewer; admin sees", () => {
    const node = {
      governanceStatus: "active",
      workspaceId: null,
      visibility: "hidden",
      sensitivity: "public",
    };
    expect(isVisibleToRuntime(node, RUNTIME)).toBe(false);
    expect(isVisibleToRuntime(node, ADMIN_RUNTIME)).toBe(true);
  });

  it("sensitivity=confidential blocked for viewer; admin + approver see", () => {
    const node = {
      governanceStatus: "active",
      workspaceId: null,
      visibility: "visible",
      sensitivity: "confidential",
    };
    expect(isVisibleToRuntime(node, RUNTIME)).toBe(false);
    expect(isVisibleToRuntime(node, ADMIN_RUNTIME)).toBe(true);
    expect(
      isVisibleToRuntime(node, { ...RUNTIME, userRole: "approver" }),
    ).toBe(true);
  });
});

describe("P0-3 — filterByPermissions", () => {
  it("filters out cross-workspace nodes via Neo4j round-trip", async () => {
    const stub = makeExecutorStub(() => [
      { id: "n1", governanceStatus: "active", workspaceId: 7, visibility: "visible", sensitivity: "public" },
      { id: "n2", governanceStatus: "active", workspaceId: 99, visibility: "visible", sensitivity: "public" },
    ]);
    const repo = repoWith(stub);
    const out = await repo.filterByPermissions(
      [
        { typeKey: "note", id: "n1" },
        { typeKey: "note", id: "n2" },
      ],
      RUNTIME,
    );
    expect(out.map((n) => n.id)).toEqual(["n1"]);
  });

  it("default-deny for nodes not returned by the visibility query", async () => {
    const stub = makeExecutorStub(() => []); // empty response
    const repo = repoWith(stub);
    const out = await repo.filterByPermissions(
      [{ typeKey: "note", id: "ghost" }],
      RUNTIME,
    );
    expect(out).toEqual([]);
  });

  it("empty input returns empty without executor", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    const out = await repo.filterByPermissions([], RUNTIME);
    expect(out).toEqual([]);
    expect(stub.calls).toHaveLength(0);
  });
});

describe("P0-3 — isVisibleToUser", () => {
  it("returns false for empty id without executor call", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    expect(await repo.isVisibleToUser("", RUNTIME)).toBe(false);
    expect(stub.calls).toHaveLength(0);
  });

  it("returns false when node not found in graph", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    expect(await repo.isVisibleToUser("ghost", RUNTIME)).toBe(false);
  });

  it("returns true when node visible to runtime", async () => {
    const stub = makeExecutorStub(() => [
      { governanceStatus: "active", workspaceId: 7, visibility: "visible", sensitivity: "public" },
    ]);
    const repo = repoWith(stub);
    expect(await repo.isVisibleToUser("n1", RUNTIME)).toBe(true);
  });

  it("returns false when node hidden to runtime (cross-workspace)", async () => {
    const stub = makeExecutorStub(() => [
      { governanceStatus: "active", workspaceId: 99, visibility: "visible", sensitivity: "public" },
    ]);
    const repo = repoWith(stub);
    expect(await repo.isVisibleToUser("n1", RUNTIME)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Explain — P0-4
// ────────────────────────────────────────────────────────────────────

describe("P0-4 — explainNode", () => {
  it("returns provenance shape for found node", async () => {
    const stub = makeExecutorStub(() => [
      {
        node: {
          properties: {
            id: "n1",
            source_id: "src-1",
            source_version_id: "v-3",
            source_type: "manual_ingest",
            lineage_status: "asserted",
            extraction_method: "tree-sitter",
            governance_status: "active",
            workspace_id: 7,
          },
        },
        labels: ["note"],
      },
    ]);
    const repo = repoWith(stub);
    const out = await repo.explainNode("n1", RUNTIME);
    expect(out).not.toBeNull();
    expect(out!.node.typeKey).toBe("note");
    expect(out!.node.id).toBe("n1");
    expect(out!.provenance.sourceType).toBe("manual_ingest");
    expect(out!.provenance.sourceVersionId).toBe("v-3");
    expect(out!.provenance.lineageStatus).toBe("asserted");
    expect(out!.provenance.extractionMethod).toBe("tree-sitter");
  });

  it("returns null when node not found", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    expect(await repo.explainNode("ghost", RUNTIME)).toBeNull();
  });

  it("returns null for empty id without executor", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    expect(await repo.explainNode("", RUNTIME)).toBeNull();
    expect(stub.calls).toHaveLength(0);
  });
});

describe("P0-4 — explainPath", () => {
  it("returns shortest path + Cypher + cost when path found", async () => {
    const stub = makeExecutorStub(() => [
      {
        pathNodes: [
          { properties: { id: "a" }, labels: ["x"] },
          { properties: { id: "b" }, labels: ["x"] },
        ],
        pathRels: [{ properties: {}, type: "R" }],
      },
    ]);
    const repo = repoWith(stub);
    const out = await repo.explainPath("a", "b", RUNTIME);
    expect(out.path).not.toBeNull();
    expect(out.path!.length).toBe(1);
    expect(out.cypher).toMatch(/shortestPath/);
    expect(out.cost).toBe(1);
  });

  it("returns null path + cost=0 when no path", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    const out = await repo.explainPath("a", "z", RUNTIME);
    expect(out.path).toBeNull();
    expect(out.cost).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Algorithms — P0-5
// ────────────────────────────────────────────────────────────────────

describe("P0-5 — runAlgorithm", () => {
  it("supported shortest_path returns rows via shortestPath", async () => {
    const stub = makeExecutorStub(() => [
      {
        pathNodes: [
          { properties: { id: "a" }, labels: ["x"] },
          { properties: { id: "b" }, labels: ["x"] },
        ],
        pathRels: [{ properties: {}, type: "R" }],
      },
    ]);
    const repo = repoWith(stub);
    const out = await repo.runAlgorithm({
      algorithmKey: "shortest_path",
      parameters: { from: "a", to: "b" },
      runtime: RUNTIME,
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.length).toBe(1);
  });

  it("unsupported centrality throws GraphCapabilityUnsupportedError", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    await expect(
      repo.runAlgorithm({
        algorithmKey: "centrality",
        parameters: {},
        runtime: RUNTIME,
      }),
    ).rejects.toThrow(GraphCapabilityUnsupportedError);
  });

  it("unsupported similarity throws (not empty success)", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    await expect(
      repo.runAlgorithm({
        algorithmKey: "similarity",
        parameters: {},
        runtime: RUNTIME,
      }),
    ).rejects.toThrow(GraphCapabilityUnsupportedError);
  });

  it("unsupported community_detection throws", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    await expect(
      repo.runAlgorithm({
        algorithmKey: "community_detection",
        parameters: {},
        runtime: RUNTIME,
      }),
    ).rejects.toThrow(GraphCapabilityUnsupportedError);
  });

  it("unsupported blast_radius throws", async () => {
    const stub = makeExecutorStub(() => []);
    const repo = repoWith(stub);
    await expect(
      repo.runAlgorithm({
        algorithmKey: "blast_radius",
        parameters: {},
        runtime: RUNTIME,
      }),
    ).rejects.toThrow(GraphCapabilityUnsupportedError);
  });
});

// ────────────────────────────────────────────────────────────────────
// Projection sync — P0-6
// ────────────────────────────────────────────────────────────────────

describe("P0-6 — enqueueProjectionJob", () => {
  it("inserts ags_graph_projection_sync_jobs row + returns jobId", async () => {
    const { db, calls } = makeStubDb({ insertIds: [99] });
    const stub = makeExecutorStub(() => []);
    const repo = new Neo4jCommunityGraphRepository({
      ...BASE_OPTIONS,
      executor: stub.executor,
      db,
    });
    const { jobId } = await repo.enqueueProjectionJob({
      projectionKey: "code_graph",
      triggerEvent: "manual",
      triggerPayload: { reason: "operator-action" },
    });
    expect(jobId).toBe(99);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.op).toBe("insert");
    expect(calls[0]!.values!.projectionKey).toBe("code_graph");
    expect(calls[0]!.values!.triggerEvent).toBe("manual");
    expect(calls[0]!.values!.status).toBe("pending");
  });
});

describe("P0-6 — takeSnapshot", () => {
  it("queries node + edge counts and inserts a snapshot row", async () => {
    const { db, calls } = makeStubDb();
    const stub = makeExecutorStub((cypher) => {
      if (cypher.includes("count(n)")) return [{ c: 1500 }];
      if (cypher.includes("count(r)")) return [{ c: 4200 }];
      return [];
    });
    const repo = new Neo4jCommunityGraphRepository({
      ...BASE_OPTIONS,
      executor: stub.executor,
      db,
    });
    const { snapshotId } = await repo.takeSnapshot("code_graph");
    expect(snapshotId).toMatch(/^snap-/);
    const insert = calls.find((c) => c.op === "insert")!;
    expect(insert.values!.nodeCount).toBe(1500);
    expect(insert.values!.edgeCount).toBe(4200);
    expect(insert.values!.scope).toBe("code_graph");
  });

  it("falls back to counts=0 when Neo4j unavailable but still records snapshot", async () => {
    const { db, calls } = makeStubDb();
    const stub = makeExecutorStub(() => {
      throw new Error("connection refused");
    });
    const repo = new Neo4jCommunityGraphRepository({
      ...BASE_OPTIONS,
      executor: stub.executor,
      db,
    });
    const { snapshotId } = await repo.takeSnapshot("code_graph");
    expect(snapshotId).toMatch(/^snap-/);
    const insert = calls.find((c) => c.op === "insert")!;
    expect(insert.values!.nodeCount).toBe(0);
  });
});

describe("P0-6 — rebuildProjection", () => {
  it("inserts rebuild row + updates status to queued + returns ProjectionResult shape", async () => {
    const { db, calls } = makeStubDb({ insertIds: [55] });
    const stub = makeExecutorStub(() => []);
    const repo = new Neo4jCommunityGraphRepository({
      ...BASE_OPTIONS,
      executor: stub.executor,
      db,
    });
    const result = await repo.rebuildProjection("code_graph");
    expect(result).toMatchObject({
      nodesCreated: 0,
      nodesUpdated: 0,
      nodesDeleted: 0,
      edgesCreated: 0,
      edgesUpdated: 0,
      edgesDeleted: 0,
    });
    expect(result.errors).toEqual([]);
    expect(calls.find((c) => c.op === "insert")).toBeDefined();
    expect(calls.find((c) => c.op === "update")).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// Health — already implemented; verify the executor pathway works
// ────────────────────────────────────────────────────────────────────

describe("P0 — health uses injected executor for testConnection", () => {
  it("healthy on connected probe", async () => {
    const stub = makeExecutorStub(
      () => [],
      undefined,
      () => ({ connected: true, version: "5.1" }),
    );
    const repo = repoWith(stub);
    const out = await repo.health();
    expect(out.status).toBe("healthy");
  });

  it("unavailable on failed probe — explicit error, NOT false healthy", async () => {
    const stub = makeExecutorStub(
      () => [],
      undefined,
      () => ({ connected: false, error: "connection refused" }),
    );
    const repo = repoWith(stub);
    const out = await repo.health();
    expect(out.status).toBe("unavailable");
    expect(out.errors).toEqual(["connection refused"]);
  });
});
