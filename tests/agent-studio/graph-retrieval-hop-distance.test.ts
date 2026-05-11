/**
 * Phase 12 §6 — hop-distance hybrid ranking.
 *
 * Covers:
 *   - `computeHopDistances` BFS correctness (seed, 1-hop, 2-hop,
 *     disconnected, missing-seed)
 *   - `GraphRetrievalRouter` attaches `hopDistance` to ContextBlock
 *     payloads for graphrag_local / hybrid_*_graphrag paths and omits
 *     it for graphrag_global / template paths
 *   - `graphragAdapter` derives `score = 1 / (1 + hopDistance)` and
 *     falls back to 1.0 when hopDistance is absent
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  computeHopDistances,
  GraphRetrievalRouter,
  type GraphRetrievalInput,
} from "../../server/agent-studio/services/graph/retrieval/retrieval-router";
import { graphragAdapter } from "../../server/agent-studio/services/rac/ingestion/graphrag-adapter";
import {
  _resetGraphRepository,
  type EdgeIdentity,
  type GraphRepository,
  type NodeIdentity,
  type RuntimeContext,
  type TraversalOptions,
} from "../../server/agent-studio/services/graph/repository";

const RUNTIME: RuntimeContext = {
  workspaceId: 1,
  userRole: "operator",
};

const N = (id: string, sourceId = id): NodeIdentity => ({
  typeKey: "company",
  id,
  sourceId,
});

const E = (a: string, b: string): EdgeIdentity => ({
  typeKey: "ref",
  sourceNode: N(a),
  targetNode: N(b),
});

// ─── computeHopDistances ─────────────────────────────────────────────

describe("computeHopDistances", () => {
  it("seed has distance 0", () => {
    const d = computeHopDistances("seed", [N("seed")], []);
    expect(d.get("seed")).toBe(0);
  });

  it("1-hop and 2-hop neighbors via BFS", () => {
    // seed — a — b
    //    \
    //     c
    const nodes = [N("seed"), N("a"), N("b"), N("c")];
    const edges = [E("seed", "a"), E("a", "b"), E("seed", "c")];
    const d = computeHopDistances("seed", nodes, edges);
    expect(d.get("seed")).toBe(0);
    expect(d.get("a")).toBe(1);
    expect(d.get("c")).toBe(1);
    expect(d.get("b")).toBe(2);
  });

  it("treats edges as undirected (reverse direction still 1-hop)", () => {
    // a → seed should still make `a` 1-hop from `seed`
    const d = computeHopDistances("seed", [N("seed"), N("a")], [E("a", "seed")]);
    expect(d.get("seed")).toBe(0);
    expect(d.get("a")).toBe(1);
  });

  it("disconnected nodes get Infinity", () => {
    const d = computeHopDistances(
      "seed",
      [N("seed"), N("isolated")],
      [], // no edges
    );
    expect(d.get("seed")).toBe(0);
    expect(d.get("isolated")).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns all-infinity when seed is not in node set", () => {
    const d = computeHopDistances("missing-seed", [N("a"), N("b")], [E("a", "b")]);
    expect(d.get("a")).toBe(Number.POSITIVE_INFINITY);
    expect(d.get("b")).toBe(Number.POSITIVE_INFINITY);
  });

  it("BFS picks the shortest path through cycles", () => {
    // seed — a — b — seed (cycle); ensure b stays at distance 2 via short path
    const nodes = [N("seed"), N("a"), N("b")];
    const edges = [E("seed", "a"), E("a", "b"), E("b", "seed")];
    const d = computeHopDistances("seed", nodes, edges);
    expect(d.get("a")).toBe(1);
    expect(d.get("b")).toBe(1); // reachable directly via the cycle edge
  });

  it("counts edges referencing nodes outside the node set still build adjacency", () => {
    // Edge mentions "ghost" which isn't in nodes[]; helper still gives
    // it distance 1 in the returned map (helper is permissive — caller
    // can filter against the node set).
    const d = computeHopDistances(
      "seed",
      [N("seed")],
      [E("seed", "ghost")],
    );
    expect(d.get("seed")).toBe(0);
    expect(d.get("ghost")).toBe(1);
  });
});

// ─── Router attaches hopDistance ─────────────────────────────────────

function makeStubRepo(
  nodes: NodeIdentity[],
  edges: EdgeIdentity[],
): { repo: GraphRepository; calls: string[] } {
  const calls: string[] = [];
  const repo = {
    async localGraph(
      _seed: string,
      _opts: TraversalOptions,
      _rt: RuntimeContext,
    ) {
      calls.push("localGraph");
      return { nodes, edges, truncated: false };
    },
    async globalGraphSample(_opts: TraversalOptions, _rt: RuntimeContext) {
      calls.push("globalGraphSample");
      return { nodes, edges, truncated: false };
    },
    async executeTemplate() {
      calls.push("executeTemplate");
      return { rows: [{ x: 1 }], truncated: false, durationMs: 0, templateVersion: "v1" };
    },
  } as unknown as GraphRepository;
  return { repo, calls };
}

describe("GraphRetrievalRouter — hopDistance payload", () => {
  it("graphrag_local attaches hopDistance for each node", async () => {
    const { repo } = makeStubRepo(
      [N("seed"), N("a"), N("b")],
      [E("seed", "a"), E("a", "b")],
    );
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      mode: "graphrag_local",
      query: "test",
      runtime: RUNTIME,
      seedNodeId: "seed",
    });
    expect(r.contextBlocks).toHaveLength(3);
    const byId = new Map(r.contextBlocks.map((b) => [b.id, b]));
    expect((byId.get("seed")?.payload as { hopDistance?: number }).hopDistance).toBe(0);
    expect((byId.get("a")?.payload as { hopDistance?: number }).hopDistance).toBe(1);
    expect((byId.get("b")?.payload as { hopDistance?: number }).hopDistance).toBe(2);
  });

  it("graphrag_local omits hopDistance for disconnected nodes (Infinity is filtered out)", async () => {
    const { repo } = makeStubRepo(
      [N("seed"), N("isolated")],
      [],
    );
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      mode: "graphrag_local",
      query: "test",
      runtime: RUNTIME,
      seedNodeId: "seed",
    });
    const byId = new Map(r.contextBlocks.map((b) => [b.id, b]));
    expect((byId.get("seed")?.payload as { hopDistance?: number }).hopDistance).toBe(0);
    expect((byId.get("isolated")?.payload as { hopDistance?: number }).hopDistance).toBeUndefined();
  });

  it("graphrag_global does NOT attach hopDistance (no seed semantics)", async () => {
    const { repo } = makeStubRepo([N("a"), N("b")], [E("a", "b")]);
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      mode: "graphrag_global",
      query: "test",
      runtime: RUNTIME,
    });
    for (const b of r.contextBlocks) {
      expect((b.payload as { hopDistance?: number }).hopDistance).toBeUndefined();
    }
  });

  it("hybrid_rac_graphrag also attaches hopDistance when seedNodeId is present", async () => {
    const { repo } = makeStubRepo(
      [N("seed"), N("a")],
      [E("seed", "a")],
    );
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      mode: "hybrid_rac_graphrag",
      query: "test",
      runtime: RUNTIME,
      seedNodeId: "seed",
    });
    const byId = new Map(r.contextBlocks.map((b) => [b.id, b]));
    expect((byId.get("seed")?.payload as { hopDistance?: number }).hopDistance).toBe(0);
    expect((byId.get("a")?.payload as { hopDistance?: number }).hopDistance).toBe(1);
  });
});

// ─── End-to-end: adapter derives score from hopDistance ──────────────

const ORIGINAL_BACKEND = process.env.GRAPH_BACKEND;
beforeEach(() => {
  process.env.GRAPH_BACKEND = "test";
  _resetGraphRepository();
});
afterEach(() => {
  process.env.GRAPH_BACKEND = ORIGINAL_BACKEND;
  _resetGraphRepository();
});

describe("graphragAdapter — score derivation from hopDistance", () => {
  it("seed scores 1.0; 1-hop scores 0.5; 2-hop scores ~0.333", async () => {
    const { getGraphRepository } = await import(
      "../../server/agent-studio/services/graph/repository"
    );
    const repo = getGraphRepository() as InstanceType<
      typeof import("../../server/agent-studio/services/graph/repository").TestGraphRepository
    >;
    const baseProv = {
      sourceType: "test",
      sourceId: "src",
      lineageStatus: "asserted" as const,
      governanceStatus: "active" as const,
    };
    await repo.upsertNode({
      typeKey: "company",
      id: "seed",
      sourceId: "src-seed",
      properties: {},
      provenance: { ...baseProv, sourceId: "src-seed" },
    });
    await repo.upsertNode({
      typeKey: "company",
      id: "a",
      sourceId: "src-a",
      properties: {},
      provenance: { ...baseProv, sourceId: "src-a" },
    });
    await repo.upsertNode({
      typeKey: "company",
      id: "b",
      sourceId: "src-b",
      properties: {},
      provenance: { ...baseProv, sourceId: "src-b" },
    });
    await repo.upsertEdge({
      typeKey: "ref",
      id: "e1",
      sourceNode: N("seed"),
      targetNode: N("a"),
      properties: {},
      provenance: { ...baseProv, sourceId: "src-e1" },
    });
    await repo.upsertEdge({
      typeKey: "ref",
      id: "e2",
      sourceNode: N("a"),
      targetNode: N("b"),
      properties: {},
      provenance: { ...baseProv, sourceId: "src-e2" },
    });

    const r = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 7,
      query: "test",
      topK: 5,
      retrievalMethod: "local",
      filters: { seedNodeId: "seed", maxDepth: 3 },
    });
    const byId = new Map(r.chunks.map((c) => [c.sourceChunkId, c]));
    expect(byId.get("seed")?.score).toBeCloseTo(1.0, 5);
    expect(byId.get("a")?.score).toBeCloseTo(0.5, 5);
    expect(byId.get("b")?.score).toBeCloseTo(1 / 3, 5);
    // Metadata records the distance so downstream can re-rank without
    // re-deriving from payload.
    expect(byId.get("b")?.metadata?.hopDistance).toBe(2);
  });

  it("score falls back to 1.0 when payload has no hopDistance (e.g. global sample)", async () => {
    const { getGraphRepository } = await import(
      "../../server/agent-studio/services/graph/repository"
    );
    const repo = getGraphRepository() as InstanceType<
      typeof import("../../server/agent-studio/services/graph/repository").TestGraphRepository
    >;
    await repo.upsertNode({
      typeKey: "company",
      id: "x",
      sourceId: "src-x",
      properties: {},
      provenance: {
        sourceType: "test",
        sourceId: "src-x",
        lineageStatus: "asserted",
        governanceStatus: "active",
      },
    });

    const r = await graphragAdapter.search({
      workspaceId: 1,
      sourceId: 7,
      query: "test",
      topK: 5,
      retrievalMethod: "global",
    });
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0].score).toBe(1);
    expect(r.chunks[0].metadata?.hopDistance).toBeUndefined();
  });
});
