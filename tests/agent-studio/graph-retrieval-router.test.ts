/**
 * Phase 12 §4 — GraphRetrievalRouter tests.
 *
 * Covers mode dispatch, Text2Cypher gating, missing-input early-exits,
 * safety filter integration, citation assembly, and the lockstep
 * guarantee between `retrieval-router.ts:RetrievalMode` and
 * `services/rac/planner-mode.ts:PHASE_12_RESERVED_MODES`.
 */

import { describe, it, expect } from "vitest";
import {
  GraphRetrievalRouter,
  type GraphRetrievalInput,
  type RetrievalMode,
} from "../../server/agent-studio/services/graph/retrieval/retrieval-router";
import { PHASE_12_RESERVED_MODES } from "../../server/agent-studio/services/rac/planner-mode";
import type {
  EdgeIdentity,
  GraphRepository,
  NodeIdentity,
  QueryTemplateExecutionInput,
  QueryTemplateExecutionResult,
  RuntimeContext,
  TraversalOptions,
} from "../../server/agent-studio/services/graph/repository";

/** Recording stub repository implementing only the methods the router calls. */
function makeStubRepo(opts?: {
  localGraphResult?: Partial<{
    nodes: NodeIdentity[];
    edges: EdgeIdentity[];
    truncated: boolean;
  }>;
  globalSampleResult?: Partial<{
    nodes: NodeIdentity[];
    edges: EdgeIdentity[];
    truncated: boolean;
  }>;
  templateResult?: Partial<QueryTemplateExecutionResult>;
}): {
  repo: GraphRepository;
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const localGraphDefault = {
    nodes: opts?.localGraphResult?.nodes ?? [],
    edges: opts?.localGraphResult?.edges ?? [],
    truncated: opts?.localGraphResult?.truncated ?? false,
  };
  const globalSampleDefault = {
    nodes: opts?.globalSampleResult?.nodes ?? [],
    edges: opts?.globalSampleResult?.edges ?? [],
    truncated: opts?.globalSampleResult?.truncated ?? false,
  };
  const templateDefault: QueryTemplateExecutionResult = {
    rows: opts?.templateResult?.rows ?? [],
    truncated: opts?.templateResult?.truncated ?? false,
    durationMs: opts?.templateResult?.durationMs ?? 0,
    templateVersion: opts?.templateResult?.templateVersion ?? "v1",
  };
  const repo = {
    async localGraph(
      seedNodeId: string,
      options: TraversalOptions,
      runtime: RuntimeContext,
    ) {
      calls.push({ method: "localGraph", args: [seedNodeId, options, runtime] });
      return localGraphDefault;
    },
    async globalGraphSample(options: TraversalOptions, runtime: RuntimeContext) {
      calls.push({ method: "globalGraphSample", args: [options, runtime] });
      return globalSampleDefault;
    },
    async executeTemplate(input: QueryTemplateExecutionInput) {
      calls.push({ method: "executeTemplate", args: [input] });
      return templateDefault;
    },
    // The rest of GraphRepository's surface is unused by the router; the
    // cast is safe given the router's narrow consumption.
  } as unknown as GraphRepository;
  return { repo, calls };
}

const RUNTIME: RuntimeContext = {
  userId: 1,
  userRole: "operator",
  workspaceId: 1,
  allowedWorkspaces: [1],
};

function baseInput(mode: RetrievalMode): GraphRetrievalInput {
  return { mode, query: "test", runtime: RUNTIME };
}

const ACTIVE_NODE: NodeIdentity = {
  typeKey: "company",
  id: "n:1",
  sourceId: "n:1",
};

// ─── Lockstep guard with planner-mode ────────────────────────────────

describe("Phase 12 §4 — RetrievalMode lockstep with PHASE_12_RESERVED_MODES", () => {
  it("the 7 RetrievalMode literals match planner-mode's PHASE_12_RESERVED_MODES", () => {
    const reserved = new Set<string>(PHASE_12_RESERVED_MODES);
    const usedByRouter: RetrievalMode[] = [
      "graphrag_local",
      "graphrag_global",
      "graphrag_traversal",
      "graphrag_text2cypher",
      "graphrag_algorithm",
      "hybrid_cag_graphrag",
      "hybrid_rac_graphrag",
    ];
    // Every router mode is reserved planner-side …
    for (const m of usedByRouter) expect(reserved.has(m)).toBe(true);
    // … and every planner-reserved mode is recognized router-side.
    expect(usedByRouter.length).toBe(reserved.size);
  });
});

// ─── Mode dispatch ───────────────────────────────────────────────────

describe("GraphRetrievalRouter — mode dispatch", () => {
  it("graphrag_local calls localGraph with the seed node", async () => {
    const { repo, calls } = makeStubRepo({
      localGraphResult: { nodes: [ACTIVE_NODE] },
    });
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      ...baseInput("graphrag_local"),
      seedNodeId: "n:1",
      maxDepth: 3,
      maxResults: 25,
    });
    expect(calls[0]?.method).toBe("localGraph");
    expect(calls[0]?.args[0]).toBe("n:1");
    expect((calls[0]?.args[1] as TraversalOptions).maxDepth).toBe(3);
    expect((calls[0]?.args[1] as TraversalOptions).maxResults).toBe(25);
    expect(r.mode).toBe("graphrag_local");
    expect(r.contextBlocks).toHaveLength(1);
    expect(r.citations).toHaveLength(1);
    expect(r.rejectionReason).toBeUndefined();
  });

  it("graphrag_local without seedNodeId short-circuits with no_seed_node", async () => {
    const { repo, calls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve(baseInput("graphrag_local"));
    expect(calls).toHaveLength(0);
    expect(r.rejectionReason).toBe("no_seed_node");
    expect(r.contextBlocks).toEqual([]);
  });

  it("graphrag_global calls globalGraphSample", async () => {
    const { repo, calls } = makeStubRepo({
      globalSampleResult: { nodes: [ACTIVE_NODE] },
    });
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      ...baseInput("graphrag_global"),
      maxResults: 10,
    });
    expect(calls[0]?.method).toBe("globalGraphSample");
    expect((calls[0]?.args[0] as TraversalOptions).maxResults).toBe(10);
    expect(r.mode).toBe("graphrag_global");
    expect(r.contextBlocks).toHaveLength(1);
  });

  it("graphrag_traversal with templateKey calls executeTemplate", async () => {
    const { repo, calls } = makeStubRepo({
      templateResult: { rows: [{ name: "Acme" }, { name: "Beta" }] },
    });
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      ...baseInput("graphrag_traversal"),
      templateKey: "tpl-x",
      templateParameters: { limit: 5 },
    });
    expect(calls[0]?.method).toBe("executeTemplate");
    const arg = calls[0]?.args[0] as QueryTemplateExecutionInput;
    expect(arg.templateKey).toBe("tpl-x");
    expect(arg.parameters).toEqual({ limit: 5 });
    expect(r.contextBlocks).toHaveLength(2);
    // Subgraph blocks rendered with cypher_template sourceKind
    expect(r.contextBlocks[0].sourceKind).toBe("cypher_template");
  });

  it("graphrag_traversal without templateKey returns empty (no rejection — caller may have chosen mode optimistically)", async () => {
    const { repo, calls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve(baseInput("graphrag_traversal"));
    expect(calls).toHaveLength(0);
    expect(r.contextBlocks).toEqual([]);
    expect(r.rejectionReason).toBeUndefined();
  });

  it("graphrag_algorithm is a Phase 13.5 placeholder — returns empty without errors", async () => {
    const { repo, calls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve(baseInput("graphrag_algorithm"));
    expect(calls).toHaveLength(0);
    expect(r.contextBlocks).toEqual([]);
  });

  it("hybrid_cag_graphrag with seedNodeId uses localGraph with default maxResults=25", async () => {
    const { repo, calls } = makeStubRepo({
      localGraphResult: { nodes: [ACTIVE_NODE] },
    });
    const router = new GraphRetrievalRouter(repo);
    await router.retrieve({
      ...baseInput("hybrid_cag_graphrag"),
      seedNodeId: "n:1",
    });
    expect(calls[0]?.method).toBe("localGraph");
    expect((calls[0]?.args[1] as TraversalOptions).maxResults).toBe(25);
  });

  it("hybrid_rac_graphrag without seedNodeId returns empty (caller supplies non-graph results elsewhere)", async () => {
    const { repo, calls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve(baseInput("hybrid_rac_graphrag"));
    expect(calls).toHaveLength(0);
    expect(r.contextBlocks).toEqual([]);
  });
});

// ─── Text2Cypher gating ──────────────────────────────────────────────

describe("GraphRetrievalRouter — Text2Cypher gating", () => {
  it("graphrag_text2cypher without generatedCypher → no_cypher_provided", async () => {
    const { repo, calls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve(baseInput("graphrag_text2cypher"));
    expect(calls).toHaveLength(0);
    expect(r.rejectionReason).toBe("no_cypher_provided");
  });

  it("graphrag_text2cypher with mutation token in Cypher → rejected before any repo call", async () => {
    const { repo, calls } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      ...baseInput("graphrag_text2cypher"),
      generatedCypher: "CREATE (n:Foo {id: 1}) RETURN n",
    });
    expect(calls).toHaveLength(0);
    expect(r.rejectionReason).toMatch(/^text2cypher_/);
    expect(r.contextBlocks).toEqual([]);
  });

  it("graphrag_text2cypher with read-only Cypher passes validation; needs templateKey to actually fetch", async () => {
    const { repo, calls } = makeStubRepo({
      templateResult: { rows: [{ x: 1 }] },
    });
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      ...baseInput("graphrag_text2cypher"),
      generatedCypher: "MATCH (n:Foo) RETURN n LIMIT 10",
      templateKey: "ad-hoc-template",
    });
    expect(r.rejectionReason).toBeUndefined();
    expect(calls[0]?.method).toBe("executeTemplate");
    expect(r.contextBlocks).toHaveLength(1);
  });
});

// ─── Safety filter + citation integration ────────────────────────────

describe("GraphRetrievalRouter — safety filter + citations", () => {
  it("nodes returned with sourceId become citations on output", async () => {
    const { repo } = makeStubRepo({
      localGraphResult: {
        nodes: [
          { typeKey: "company", id: "n:1", sourceId: "src-1", sourceVersionId: "v-1" },
          { typeKey: "company", id: "n:2", sourceId: "src-2" },
        ],
      },
    });
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      ...baseInput("graphrag_local"),
      seedNodeId: "n:1",
    });
    expect(r.citations.map((c) => c.sourceId)).toEqual(["src-1", "src-2"]);
    expect(r.citations[0].sourceVersionId).toBe("v-1");
    expect(r.citations[1].sourceVersionId).toBeUndefined();
  });

  it("durationMs is populated on every result", async () => {
    const { repo } = makeStubRepo();
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve(baseInput("graphrag_global"));
    expect(typeof r.durationMs).toBe("number");
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("truncated flag passes through from repo to output", async () => {
    const { repo } = makeStubRepo({
      localGraphResult: { nodes: [ACTIVE_NODE], truncated: true },
    });
    const router = new GraphRetrievalRouter(repo);
    const r = await router.retrieve({
      ...baseInput("graphrag_local"),
      seedNodeId: "n:1",
    });
    expect(r.truncated).toBe(true);
  });
});
