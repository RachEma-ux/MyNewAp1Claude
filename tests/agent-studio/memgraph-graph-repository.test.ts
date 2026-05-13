// MemgraphGraphRepository — Bolt query path tests.
//
// Uses a fully-stubbable `BoltDriverFactory` so the unit suite never
// touches a live Memgraph container nor the real `neo4j-driver`
// package. The factory + driver + session are simple `vi.fn()`
// stubs that record the Cypher + parameters the repository emits.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BoltDriver,
  BoltDriverFactory,
  BoltRecord,
  BoltResult,
  BoltSession,
} from "../../server/agent-studio/services/graph/repository/bolt-driver-port.js";
import { MemgraphGraphRepository } from "../../server/agent-studio/services/graph/repository/memgraph-graph-repository.js";

type RunFn = (cypher: string, params?: Record<string, unknown>) => Promise<BoltResult>;

function makeRecord(obj: Record<string, unknown>): BoltRecord {
  return {
    keys: Object.keys(obj),
    get: (k) => obj[k],
    toObject: () => obj,
  };
}

function makeFactory(runImpl: RunFn): {
  factory: BoltDriverFactory;
  sessionClose: ReturnType<typeof vi.fn>;
  driverClose: ReturnType<typeof vi.fn>;
  verifyConnectivity: ReturnType<typeof vi.fn>;
  runCalls: Array<{ cypher: string; params?: Record<string, unknown> }>;
} {
  const runCalls: Array<{ cypher: string; params?: Record<string, unknown> }> = [];
  const sessionClose = vi.fn(async () => undefined);
  const driverClose = vi.fn(async () => undefined);
  const verifyConnectivity = vi.fn(async () => undefined);
  const session: BoltSession = {
    run: vi.fn(async (cypher, params) => {
      runCalls.push({ cypher, params });
      return runImpl(cypher, params);
    }),
    close: sessionClose,
  };
  const driver: BoltDriver = {
    session: vi.fn(() => session),
    verifyConnectivity,
    close: driverClose,
  };
  const factory: BoltDriverFactory = {
    createDriver: vi.fn(() => driver),
  };
  return { factory, sessionClose, driverClose, verifyConnectivity, runCalls };
}

function makeRepo(runImpl: RunFn, opts: { templateResolver?: (k: string) => Promise<{ body: string; version: string }>; maxTemplateRows?: number } = {}) {
  const f = makeFactory(runImpl);
  const repo = new MemgraphGraphRepository({
    endpoint: "bolt://memgraph:7687",
    username: "u",
    password: "p",
    driverFactory: f.factory,
    templateResolver: opts.templateResolver,
    maxTemplateRows: opts.maxTemplateRows,
  });
  return { repo, ...f };
}

const RUNTIME = {} as Parameters<MemgraphGraphRepository["localGraph"]>[2];

describe("MemgraphGraphRepository — health", () => {
  it("returns status='healthy' when verifyConnectivity + RETURN 1 succeed", async () => {
    const { repo, verifyConnectivity, runCalls } = makeRepo(async () => ({
      records: [makeRecord({ one: 1 })],
      summary: {},
    }));
    const result = await repo.health();
    expect(result.status).toBe("healthy");
    expect(verifyConnectivity).toHaveBeenCalledOnce();
    expect(runCalls[0].cypher).toMatch(/RETURN 1/);
  });

  it("returns status='unavailable' with an error string when the driver throws", async () => {
    const { repo, verifyConnectivity } = makeRepo(async () => {
      throw new Error("connection refused");
    });
    // Make verifyConnectivity succeed but session.run throw.
    (verifyConnectivity as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const result = await repo.health();
    expect(result.status).toBe("unavailable");
    expect(result.errors?.[0]).toMatch(/connection refused/);
  });

  it("surfaces verifyConnectivity errors", async () => {
    const { repo, verifyConnectivity } = makeRepo(async () => ({
      records: [],
      summary: {},
    }));
    (verifyConnectivity as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("auth failed"),
    );
    const result = await repo.health();
    expect(result.status).toBe("unavailable");
    expect(result.errors?.[0]).toMatch(/auth failed/);
  });
});

describe("MemgraphGraphRepository — localGraph", () => {
  it("issues a parametrized MATCH and returns mapped NodeIdentity + EdgeIdentity", async () => {
    const { repo, runCalls } = makeRepo(async () => ({
      records: [
        makeRecord({
          nodes: [
            { properties: { id: "n1" }, labels: ["Person"] },
            { properties: { id: "n2", source_id: "v:1" }, labels: ["Note"] },
          ],
          edges: [
            {
              properties: { id: "e1" },
              type: "AUTHORED",
              start: { properties: { id: "n1" }, labels: ["Person"] },
              end: { properties: { id: "n2" }, labels: ["Note"] },
            },
          ],
        }),
      ],
      summary: {},
    }));
    const result = await repo.localGraph("n1", { maxDepth: 2, maxResults: 100 }, RUNTIME);
    expect(runCalls[0].params).toEqual({ seedNodeId: "n1", maxDepth: 2, maxResults: 100 });
    expect(runCalls[0].cypher).toMatch(/MATCH path/);
    expect(result.nodes).toEqual([
      { id: "n1", typeKey: "Person", sourceId: undefined, sourceVersionId: undefined },
      { id: "n2", typeKey: "Note", sourceId: "v:1", sourceVersionId: undefined },
    ]);
    expect(result.edges[0]).toEqual({
      id: "e1",
      typeKey: "AUTHORED",
      sourceNode: { id: "n1", typeKey: "Person" },
      targetNode: { id: "n2", typeKey: "Note" },
    });
    expect(result.truncated).toBe(false);
  });

  it("flags truncated=true when result count hits maxResults", async () => {
    const { repo } = makeRepo(async () => ({
      records: [
        makeRecord({ nodes: [{ properties: { id: "n1" }, labels: ["X"] }], edges: [] }),
        makeRecord({ nodes: [{ properties: { id: "n2" }, labels: ["X"] }], edges: [] }),
      ],
      summary: {},
    }));
    const result = await repo.localGraph("n1", { maxDepth: 2, maxResults: 2 }, RUNTIME);
    expect(result.truncated).toBe(true);
  });
});

describe("MemgraphGraphRepository — neighborhood", () => {
  it("passes nodeId + depth as named params", async () => {
    const { repo, runCalls } = makeRepo(async () => ({ records: [], summary: {} }));
    await repo.neighborhood("seed", 3, RUNTIME);
    expect(runCalls[0].params).toEqual({ nodeId: "seed", depth: 3 });
  });
});

describe("MemgraphGraphRepository — shortestPath", () => {
  it("returns null when no path is found", async () => {
    const { repo } = makeRepo(async () => ({ records: [], summary: {} }));
    const result = await repo.shortestPath("a", "b", RUNTIME);
    expect(result).toBeNull();
  });

  it("returns a TraversalPath with length when records are present", async () => {
    const { repo } = makeRepo(async () => ({
      records: [
        makeRecord({
          nodes: [
            { properties: { id: "a" }, labels: ["X"] },
            { properties: { id: "b" }, labels: ["X"] },
          ],
          edges: [
            {
              properties: { id: "e" },
              type: "REL",
              start: { properties: { id: "a" }, labels: ["X"] },
              end: { properties: { id: "b" }, labels: ["X"] },
            },
          ],
          length: 1,
        }),
      ],
      summary: {},
    }));
    const result = await repo.shortestPath("a", "b", RUNTIME);
    expect(result?.length).toBe(1);
    expect(result?.nodes).toHaveLength(2);
    expect(result?.edges).toHaveLength(1);
  });
});

describe("MemgraphGraphRepository — executeTemplate", () => {
  it("returns 'missing-resolver' when no resolver is configured", async () => {
    const { repo } = makeRepo(async () => ({ records: [], summary: {} }));
    const result = await repo.executeTemplate({
      templateKey: "any",
      parameters: {},
      runtime: { workspaceId: 1 } as Parameters<MemgraphGraphRepository["executeTemplate"]>[0]["runtime"],
    });
    expect(result.templateVersion).toBe("missing-resolver");
    expect(result.rows).toEqual([]);
  });

  it("resolves the template body, runs the Cypher with the supplied parameters, and returns rows", async () => {
    const resolver = vi.fn(async (key: string) => ({
      body: "MATCH (n {id: $id}) RETURN n.label AS label",
      version: `v1:${key}`,
    }));
    const { repo, runCalls } = makeRepo(
      async () => ({
        records: [makeRecord({ label: "alpha" }), makeRecord({ label: "beta" })],
        summary: {},
      }),
      { templateResolver: resolver },
    );
    const result = await repo.executeTemplate({
      templateKey: "note_backlinks",
      parameters: { id: "x" },
      runtime: { workspaceId: 1 } as Parameters<MemgraphGraphRepository["executeTemplate"]>[0]["runtime"],
    });
    expect(resolver).toHaveBeenCalledWith("note_backlinks");
    expect(runCalls[0].cypher).toMatch(/MATCH \(n \{id: \$id\}\)/);
    expect(runCalls[0].params).toEqual({ id: "x" });
    expect(result.rows).toEqual([{ label: "alpha" }, { label: "beta" }]);
    expect(result.truncated).toBe(false);
    expect(result.templateVersion).toBe("v1:note_backlinks");
  });

  it("caps rows at maxTemplateRows and flags truncated=true", async () => {
    const resolver = vi.fn(async () => ({ body: "RETURN 1", version: "v1" }));
    const { repo } = makeRepo(
      async () => ({
        records: [
          makeRecord({ x: 1 }),
          makeRecord({ x: 2 }),
          makeRecord({ x: 3 }),
        ],
        summary: {},
      }),
      { templateResolver: resolver, maxTemplateRows: 2 },
    );
    const result = await repo.executeTemplate({
      templateKey: "x",
      parameters: {},
      runtime: {} as Parameters<MemgraphGraphRepository["executeTemplate"]>[0]["runtime"],
    });
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});

describe("MemgraphGraphRepository — session lifecycle", () => {
  let runCallCount = 0;

  beforeEach(() => {
    runCallCount = 0;
  });

  it("closes the session after every operation, even on throw", async () => {
    const { repo, sessionClose } = makeRepo(async () => {
      runCallCount++;
      if (runCallCount === 1) throw new Error("boom");
      return { records: [], summary: {} };
    });
    await expect(repo.neighborhood("n", 1, RUNTIME)).rejects.toThrow(/boom/);
    expect(sessionClose).toHaveBeenCalled();
  });

  it("reuses the driver instance across calls", async () => {
    const { repo, factory } = makeRepo(async () => ({ records: [], summary: {} }));
    await repo.neighborhood("a", 1, RUNTIME);
    await repo.neighborhood("b", 1, RUNTIME);
    expect((factory.createDriver as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});

describe("MemgraphGraphRepository — projection writes stay no-op", () => {
  it("upsertNode + upsertEdge + applyProjectionJob never hit Bolt", async () => {
    const { repo, runCalls } = makeRepo(async () => ({ records: [], summary: {} }));
    await repo.upsertNode({
      id: "n",
      typeKey: "X",
      properties: {},
      provenance: { sourceType: "t", sourceId: "s", lineageStatus: "asserted" },
    });
    await repo.upsertEdge({
      typeKey: "EDGE",
      sourceNode: { id: "a", typeKey: "X" },
      targetNode: { id: "b", typeKey: "X" },
      properties: {},
      provenance: { sourceType: "t", sourceId: "s", lineageStatus: "asserted" },
    });
    const proj = await repo.applyProjectionJob([]);
    expect(runCalls.length).toBe(0);
    expect(proj.nodesCreated).toBe(0);
    expect(proj.errors).toEqual([]);
  });
});

describe("MemgraphGraphRepository — async factory loader", () => {
  it("accepts an async loader and awaits it on first use", async () => {
    const stubFactory = makeFactory(async () => ({
      records: [makeRecord({ one: 1 })],
      summary: {},
    }));
    const loader = vi.fn(async () => stubFactory.factory);
    const repo = new MemgraphGraphRepository({
      endpoint: "bolt://x:7687",
      username: "u",
      password: "p",
      driverFactory: loader,
    });
    await repo.health();
    expect(loader).toHaveBeenCalledOnce();
    expect(stubFactory.factory.createDriver).toHaveBeenCalledOnce();
    // Second call reuses the resolved factory.
    await repo.health();
    expect(loader).toHaveBeenCalledOnce();
  });
});
