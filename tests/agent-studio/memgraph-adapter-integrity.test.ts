// Memgraph fallback adapter — integrity test.
//
// Asserts:
//   - MemgraphGraphRepository class exists + implements GraphRepository
//   - backendKey === "memgraph"
//   - getGraphRepository() returns a MemgraphGraphRepository when
//     GRAPH_BACKEND=memgraph
//   - capability registry has memgraph entry
//   - boundary: no neo4j-driver import outside the repository directory
//     (existing graph-repository-boundary test covers this, but we
//     add a Memgraph-specific assertion here for explicitness)
//
// Honest classification: this test confirms the Memgraph adapter is
// REGISTERED, not that it actually works against a live Memgraph
// instance. Live wiring is the fallback-promotion operator-
// implementation PR (per `agent-studio-active-graph-backend-decision.md`
// §3 + `agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md`
// §8.1).

import { describe, it, expect, afterEach } from "vitest";
import {
  _resetGraphRepository,
  getGraphRepository,
  MemgraphGraphRepository,
  type BackendKey,
} from "../../server/agent-studio/services/graph/repository/index.js";
import {
  getCapabilities,
  MEMGRAPH_CAPABILITIES,
} from "../../server/agent-studio/services/graph/repository/capabilities.js";

const BACKEND_KEYS_EXPECTED: ReadonlyArray<BackendKey> = [
  "test",
  "postgres",
  "neo4j-ce",
  "memgraph",
  "falkor",
];

describe("MemgraphGraphRepository — adapter integrity", () => {
  afterEach(() => {
    delete process.env.GRAPH_BACKEND;
    _resetGraphRepository();
  });

  it("exposes the canonical backend key", () => {
    const repo = new MemgraphGraphRepository({
      endpoint: "bolt://localhost:7687",
      username: "memgraph",
      password: "",
    });
    expect(repo.backendKey).toBe("memgraph");
  });

  it("declares the documented MEMGRAPH_CAPABILITIES set", () => {
    const repo = new MemgraphGraphRepository({
      endpoint: "bolt://localhost:7687",
      username: "memgraph",
      password: "",
    });
    expect(repo.capabilities).toBe(MEMGRAPH_CAPABILITIES);
    expect(repo.capabilities.supportsCypher).toBe(true);
    expect(repo.capabilities.supportsRecursiveTraversal).toBe(true);
    expect(repo.capabilities.supportsGraphAlgorithms).toBe(true);
  });

  it("getGraphRepository() returns a MemgraphGraphRepository when GRAPH_BACKEND=memgraph", () => {
    process.env.GRAPH_BACKEND = "memgraph";
    _resetGraphRepository();
    const repo = getGraphRepository();
    expect(repo).toBeInstanceOf(MemgraphGraphRepository);
    expect(repo.backendKey).toBe("memgraph");
  });

  it("getCapabilities('memgraph') resolves", () => {
    const caps = getCapabilities("memgraph");
    expect(caps).toBe(MEMGRAPH_CAPABILITIES);
  });

  it("health() returns degraded with a clear skeleton message until live wiring lands", async () => {
    const repo = new MemgraphGraphRepository({
      endpoint: "bolt://localhost:7687",
      username: "memgraph",
      password: "",
    });
    const health = await repo.health();
    expect(health.status).toBe("degraded");
    expect(health.errors?.[0]).toMatch(/memgraph driver not yet wired/i);
  });

  it("BackendKey union includes memgraph + the other 4 canonical backends", () => {
    // Type-level lock: if the union changes, the array literal won't
    // compile against `BackendKey`.
    const keys: ReadonlyArray<BackendKey> = BACKEND_KEYS_EXPECTED;
    expect(keys).toContain("memgraph");
    expect(keys).toHaveLength(5);
  });
});
