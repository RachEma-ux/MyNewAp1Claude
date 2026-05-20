/**
 * Behavior test for the Memgraph MAGE algorithm pass-through.
 *
 * Closes PR #1398 item 16 (GDS / real graph algorithm pass-through:
 * "Neo4j CE correctly rejects unsupported graph algorithms; real GDS
 * algorithm execution requires Memgraph or Neo4j Enterprise"). The
 * Memgraph repository now routes 4 MAGE algorithms via Bolt and
 * surfaces a "MAGE not installed" condition as the typed
 * `GraphCapabilityUnsupportedError`.
 */

import { describe, expect, it } from "vitest";
import {
  MemgraphGraphRepository,
  MAGE_ALGORITHMS,
  MEMGRAPH_SUPPORTED_ALGORITHM_KEYS,
} from "../../server/agent-studio/services/graph/repository/memgraph-graph-repository";
import { GraphCapabilityUnsupportedError } from "../../server/agent-studio/services/graph/repository/types";
import type {
  BoltDriver,
  BoltDriverFactory,
  BoltRecord,
  BoltResult,
  BoltSession,
} from "../../server/agent-studio/services/graph/repository/bolt-driver-port";

interface StubRunCall {
  cypher: string;
  parameters: Record<string, unknown>;
}

class StubBoltSession implements BoltSession {
  constructor(
    private readonly runHandler: (
      cypher: string,
      parameters: Record<string, unknown>,
    ) => BoltResult | Promise<BoltResult>,
    public readonly calls: StubRunCall[],
  ) {}
  async run(
    cypher: string,
    parameters: Record<string, unknown> = {},
  ): Promise<BoltResult> {
    this.calls.push({ cypher, parameters });
    return this.runHandler(cypher, parameters);
  }
  async close(): Promise<void> {}
}

class StubBoltDriver implements BoltDriver {
  constructor(
    private readonly runHandler: (
      cypher: string,
      parameters: Record<string, unknown>,
    ) => BoltResult | Promise<BoltResult>,
    public readonly calls: StubRunCall[],
  ) {}
  session(): BoltSession {
    return new StubBoltSession(this.runHandler, this.calls);
  }
  async verifyConnectivity(): Promise<void> {}
  async close(): Promise<void> {}
}

function recordFromObject(o: Record<string, unknown>): BoltRecord {
  return {
    keys: Object.keys(o),
    get: (k: string) => o[k],
    toObject: () => ({ ...o }),
  };
}

function buildRepo(
  runHandler: (
    cypher: string,
    parameters: Record<string, unknown>,
  ) => BoltResult | Promise<BoltResult>,
): { repo: MemgraphGraphRepository; calls: StubRunCall[] } {
  const calls: StubRunCall[] = [];
  const factory: BoltDriverFactory = {
    createDriver: () => new StubBoltDriver(runHandler, calls),
  };
  const repo = new MemgraphGraphRepository({
    endpoint: "bolt://stub:7687",
    username: "stub",
    password: "stub",
    driverFactory: factory,
  });
  return { repo, calls };
}

describe("Memgraph MAGE algorithm pass-through", () => {
  describe("supported-algorithm-keys taxonomy", () => {
    it("exports a closed list including shortest_path + all 4 MAGE algos", () => {
      expect([...MEMGRAPH_SUPPORTED_ALGORITHM_KEYS].sort()).toEqual(
        [
          "shortest_path",
          "pagerank",
          "betweenness_centrality",
          "community_detection",
          "weakly_connected_components",
        ].sort(),
      );
    });

    it("MAGE_ALGORITHMS spec map has exactly the 4 MAGE keys", () => {
      expect(Object.keys(MAGE_ALGORITHMS).sort()).toEqual([
        "betweenness_centrality",
        "community_detection",
        "pagerank",
        "weakly_connected_components",
      ]);
    });

    it("every spec carries call + yield + return clauses", () => {
      for (const [key, spec] of Object.entries(MAGE_ALGORITHMS)) {
        expect(spec.callClause).toMatch(/^CALL\s+\w+\.get\(\)$/);
        expect(spec.yieldClause.length).toBeGreaterThan(0);
        expect(spec.returnClause).toContain("node.id");
        // Sanity-check the call clause matches the key.
        expect(spec.callClause).toContain(key);
      }
    });
  });

  describe("pagerank", () => {
    it("runs the MAGE pagerank procedure and returns {nodeId, score} rows", async () => {
      const { repo, calls } = buildRepo((_cypher, _params) => ({
        records: [
          recordFromObject({ nodeId: "n-1", score: 0.41 }),
          recordFromObject({ nodeId: "n-2", score: 0.32 }),
        ],
        summary: {},
      }));
      const result = await repo.runAlgorithm({
        algorithmKey: "pagerank",
        parameters: {},
        runtime: { workspaceId: 1 } as never,
      });
      expect(result.rows).toEqual([
        { nodeId: "n-1", score: 0.41 },
        { nodeId: "n-2", score: 0.32 },
      ]);
      expect(calls.length).toBe(1);
      expect(calls[0].cypher).toContain("CALL pagerank.get()");
      expect(calls[0].cypher).toContain("YIELD node, rank");
      expect(calls[0].cypher).toContain("RETURN node.id AS nodeId");
    });

    it("threads `maxResults` into the LIMIT clause", async () => {
      const { repo, calls } = buildRepo(() => ({
        records: [],
        summary: {},
      }));
      await repo.runAlgorithm({
        algorithmKey: "pagerank",
        parameters: { maxResults: 7 },
        runtime: { workspaceId: 1 } as never,
      });
      expect(calls[0].cypher).toContain("LIMIT $maxResults");
      expect(calls[0].parameters.maxResults).toBe(7);
    });

    it("caps maxResults at 2000 (DOS guard)", async () => {
      const { repo, calls } = buildRepo(() => ({
        records: [],
        summary: {},
      }));
      await repo.runAlgorithm({
        algorithmKey: "pagerank",
        parameters: { maxResults: 999_999 },
        runtime: { workspaceId: 1 } as never,
      });
      expect(calls[0].parameters.maxResults).toBe(2000);
    });
  });

  describe("betweenness_centrality", () => {
    it("runs the betweenness_centrality MAGE procedure", async () => {
      const { repo, calls } = buildRepo(() => ({
        records: [recordFromObject({ nodeId: "n-1", score: 1.5 })],
        summary: {},
      }));
      const result = await repo.runAlgorithm({
        algorithmKey: "betweenness_centrality",
        parameters: {},
        runtime: { workspaceId: 1 } as never,
      });
      expect(result.rows[0]).toEqual({ nodeId: "n-1", score: 1.5 });
      expect(calls[0].cypher).toContain("CALL betweenness_centrality.get()");
    });
  });

  describe("community_detection", () => {
    it("runs the Louvain community_detection MAGE procedure", async () => {
      const { repo, calls } = buildRepo(() => ({
        records: [recordFromObject({ nodeId: "n-1", communityId: 3 })],
        summary: {},
      }));
      const result = await repo.runAlgorithm({
        algorithmKey: "community_detection",
        parameters: {},
        runtime: { workspaceId: 1 } as never,
      });
      expect(result.rows[0]).toEqual({ nodeId: "n-1", communityId: 3 });
      expect(calls[0].cypher).toContain("CALL community_detection.get()");
    });
  });

  describe("weakly_connected_components", () => {
    it("runs the WCC MAGE procedure", async () => {
      const { repo, calls } = buildRepo(() => ({
        records: [recordFromObject({ nodeId: "n-1", componentId: 7 })],
        summary: {},
      }));
      const result = await repo.runAlgorithm({
        algorithmKey: "weakly_connected_components",
        parameters: {},
        runtime: { workspaceId: 1 } as never,
      });
      expect(result.rows[0]).toEqual({ nodeId: "n-1", componentId: 7 });
      expect(calls[0].cypher).toContain("CALL weakly_connected_components.get()");
    });
  });

  describe("MAGE not installed", () => {
    it("surfaces 'procedure not registered' as GraphCapabilityUnsupportedError", async () => {
      const { repo } = buildRepo(() => {
        throw new Error(
          "Memgraph: Procedure 'pagerank.get' not registered on this server",
        );
      });
      await expect(
        repo.runAlgorithm({
          algorithmKey: "pagerank",
          parameters: {},
          runtime: { workspaceId: 1 } as never,
        }),
      ).rejects.toBeInstanceOf(GraphCapabilityUnsupportedError);
    });

    it("re-throws unrelated Bolt errors verbatim (not as capability error)", async () => {
      const sentinel = new Error("syntax error at line 1");
      const { repo } = buildRepo(() => {
        throw sentinel;
      });
      await expect(
        repo.runAlgorithm({
          algorithmKey: "pagerank",
          parameters: {},
          runtime: { workspaceId: 1 } as never,
        }),
      ).rejects.toBe(sentinel);
    });
  });

  describe("unknown algorithm key", () => {
    it("throws GraphCapabilityUnsupportedError (typed capability error)", async () => {
      const { repo } = buildRepo(() => ({ records: [], summary: {} }));
      await expect(
        repo.runAlgorithm({
          algorithmKey: "fancy_new_algo_2030",
          parameters: {},
          runtime: { workspaceId: 1 } as never,
        }),
      ).rejects.toBeInstanceOf(GraphCapabilityUnsupportedError);
    });
  });

  describe("shortest_path back-compat", () => {
    it("shortest_path still routes through the existing Bolt path (not MAGE)", async () => {
      // shortest_path uses `MATCH ... shortestPath(...)` Cypher, not
      // a `CALL ....get()`. The handler sees a different Cypher
      // shape; we assert the call clause is NOT one of the MAGE
      // procedures.
      const { repo, calls } = buildRepo(() => ({
        records: [],
        summary: {},
      }));
      await repo
        .runAlgorithm({
          algorithmKey: "shortest_path",
          parameters: { from: "a", to: "b" },
          runtime: { workspaceId: 1 } as never,
        })
        .catch(() => {
          /* the stub returns empty so shortestPath returns null and
             produces []. Either outcome is fine; the test point is
             the Cypher shape, captured in `calls`. */
        });
      const mageCallClauses = Object.values(MAGE_ALGORITHMS).map((s) => s.callClause);
      for (const c of calls) {
        for (const mage of mageCallClauses) {
          expect(c.cypher).not.toContain(mage);
        }
      }
    });
  });
});
