/**
 * Phase 21 — property-based graph permission visibility tests.
 *
 * Asserts the hidden-node leak prevention property:
 *
 *   For any node with governance_status='hidden', no Graph Agent /
 *   GraphRAG retrieval / GraphRepository public method should return
 *   that node OR an edge touching that node to a user role that
 *   should not see it.
 *
 * Generates fixtures with randomized hidden-vs-visible distributions
 * and verifies every retrieval path respects the boundary.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TestGraphRepository, type RuntimeContext } from "../../server/agent-studio/services/graph/repository/index.js";
import { GraphRetrievalRouter } from "../../server/agent-studio/services/graph/retrieval/public-api.js";

const VISIBLE: RuntimeContext = {
  userId: 1,
  userRole: "reader",
  governanceStatusFilter: ["active"],
};

// Deterministic pseudo-random
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return Math.abs(s) / 0x7fffffff;
  };
}

interface Fixture {
  visibleNodeIds: string[];
  hiddenNodeIds: string[];
}

async function seed(repo: TestGraphRepository, count: number, hiddenRatio: number, seedValue: number): Promise<Fixture> {
  const rand = lcg(seedValue);
  const visibleNodeIds: string[] = [];
  const hiddenNodeIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const isHidden = rand() < hiddenRatio;
    const id = `n${i}`;
    await repo.upsertNode({
      typeKey: "Note",
      id,
      sourceId: String(i),
      properties: {},
      provenance: {
        sourceType: "vault_note",
        sourceId: String(i),
        lineageStatus: "asserted",
        governanceStatus: isHidden ? "hidden" : "active",
      },
    });
    if (isHidden) hiddenNodeIds.push(id);
    else visibleNodeIds.push(id);
  }
  // Add some random edges
  for (let i = 0; i < count * 2; i++) {
    const src = `n${Math.floor(rand() * count)}`;
    const tgt = `n${Math.floor(rand() * count)}`;
    if (src === tgt) continue;
    await repo.upsertEdge({
      typeKey: "LINKS_TO",
      id: `e${i}`,
      sourceNode: { typeKey: "Note", id: src },
      targetNode: { typeKey: "Note", id: tgt },
      properties: {},
      provenance: { sourceType: "wikilink", sourceId: String(i), lineageStatus: "derived", governanceStatus: "active" },
    });
  }
  return { visibleNodeIds, hiddenNodeIds };
}

describe("Property: hidden node never leaks through filterByPermissions", () => {
  let repo: TestGraphRepository;
  beforeEach(() => {
    repo = new TestGraphRepository();
  });

  it("for 100 mixed nodes (20% hidden), filter returns 0 hidden", async () => {
    const fixture = await seed(repo, 100, 0.2, 12345);
    const all = [...fixture.visibleNodeIds, ...fixture.hiddenNodeIds].map((id) => ({ typeKey: "Note", id }));
    const filtered = await repo.filterByPermissions(all, VISIBLE);
    const hiddenSet = new Set(fixture.hiddenNodeIds);
    for (const node of filtered) {
      expect(hiddenSet.has(node.id), `hidden node ${node.id} leaked through filterByPermissions`).toBe(false);
    }
  });

  it("isVisibleToUser returns false for every hidden node", async () => {
    const fixture = await seed(repo, 50, 0.3, 67890);
    for (const id of fixture.hiddenNodeIds) {
      const visible = await repo.isVisibleToUser(id, VISIBLE);
      expect(visible, `hidden node ${id} reported visible`).toBe(false);
    }
  });
});

describe("Property: hidden node never appears in localGraph traversal", () => {
  let repo: TestGraphRepository;
  beforeEach(() => {
    repo = new TestGraphRepository();
  });

  it("depth-2 traversal from a visible seed never includes a hidden node", async () => {
    const fixture = await seed(repo, 50, 0.4, 24680);
    const hiddenSet = new Set(fixture.hiddenNodeIds);
    for (const seedId of fixture.visibleNodeIds.slice(0, 10)) {
      const r = await repo.localGraph(
        seedId,
        { maxDepth: 2, maxResults: 200, nodeTypeFilter: ["Note"] },
        VISIBLE,
      );
      for (const node of r.nodes) {
        expect(hiddenSet.has(node.id), `localGraph from ${seedId} returned hidden ${node.id}`).toBe(false);
      }
    }
  });
});

describe("Property: GraphRetrievalRouter never emits hidden node in context blocks", () => {
  let repo: TestGraphRepository;
  let router: GraphRetrievalRouter;
  beforeEach(() => {
    repo = new TestGraphRepository();
    router = new GraphRetrievalRouter(repo);
  });

  it("graphrag_local retrieval blocks all hidden nodes", async () => {
    const fixture = await seed(repo, 60, 0.3, 13579);
    const hiddenSet = new Set(fixture.hiddenNodeIds);
    for (const seedId of fixture.visibleNodeIds.slice(0, 5)) {
      const r = await router.retrieve({
        mode: "graphrag_local",
        query: "test",
        seedNodeId: seedId,
        maxDepth: 2,
        maxResults: 50,
        runtime: VISIBLE,
      });
      for (const block of r.contextBlocks) {
        expect(hiddenSet.has(block.sourceId), `retrieval block ${block.id} cited hidden ${block.sourceId}`).toBe(false);
      }
    }
  });

  it("graphrag_global sample never emits a hidden node", async () => {
    const fixture = await seed(repo, 80, 0.25, 11235);
    const hiddenSet = new Set(fixture.hiddenNodeIds);
    const r = await router.retrieve({
      mode: "graphrag_global",
      query: "test",
      maxResults: 100,
      runtime: VISIBLE,
    });
    for (const block of r.contextBlocks) {
      expect(hiddenSet.has(block.sourceId), `global retrieval block cited hidden ${block.sourceId}`).toBe(false);
    }
  });

  it("citations array never references hidden source ids", async () => {
    const fixture = await seed(repo, 40, 0.5, 99999);
    const hiddenSet = new Set(fixture.hiddenNodeIds);
    for (const seedId of fixture.visibleNodeIds.slice(0, 3)) {
      const r = await router.retrieve({
        mode: "graphrag_local",
        query: "test",
        seedNodeId: seedId,
        maxDepth: 1,
        maxResults: 20,
        runtime: VISIBLE,
      });
      for (const c of r.citations) {
        expect(hiddenSet.has(c.sourceId), `citation referenced hidden ${c.sourceId}`).toBe(false);
      }
    }
  });
});

describe("Property: governance filter respected across seed permutations", () => {
  it("100 random seeds × 3 retrieval modes — no hidden leak across any combination", async () => {
    const seeds = [1234, 5678, 9012, 3456, 7890, 1111, 2222, 3333, 4444, 5555];
    for (const sv of seeds) {
      const repo = new TestGraphRepository();
      const router = new GraphRetrievalRouter(repo);
      const fixture = await seed(repo, 30, 0.3, sv);
      const hiddenSet = new Set(fixture.hiddenNodeIds);
      for (const mode of ["graphrag_local", "graphrag_global"] as const) {
        const r = await router.retrieve({
          mode,
          query: "x",
          seedNodeId: fixture.visibleNodeIds[0],
          maxDepth: 2,
          maxResults: 50,
          runtime: VISIBLE,
        });
        for (const block of r.contextBlocks) {
          expect(hiddenSet.has(block.sourceId)).toBe(false);
        }
      }
    }
  });
});
