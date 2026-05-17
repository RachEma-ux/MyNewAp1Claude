/**
 * T-G.4.2 — GraphRAG-backed candidate fetcher.
 *
 * Behavioral + source-scan test for the production fetcher that
 * maps a RecommendationRequest → GraphRetrievalInput, calls the
 * router, and transforms returned context blocks + safety events
 * into RecommendationCandidate[].
 *
 * Source-scan locks the boundary invariants (no direct neo4j /
 * drizzle / dispatchMcpToolCall / process.env reads — all flows
 * through the injected router boundary).
 *
 * Behavioral coverage with a stub router:
 *   - default kind mapper produces graphrag_traversal mode +
 *     anchor-seeded input + preferTemplateKeys per kind
 *   - block transform classifies permissionStatus from safety events
 *     (governance_hidden → hidden / permission_denied → redacted /
 *      clean → visible)
 *   - default scorer = 0.7; custom scorer overrides
 *   - end-to-end: fetcher composes with the recommendation runtime
 *     so the assembler's rank/limit/permission policy flows through
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  createGraphRagCandidateFetcher,
  createRecommendationService,
  defaultRecommendationKindMapper,
  defaultBlockScorer,
  classifyBlockPermissionStatus,
  transformBlocksToCandidates,
  DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS,
  type RecommendationGraphRouter,
  type RecommendationKind,
  type RecommendationRequest,
} from "../../server/agent-studio/services/recommendation/public-api";
import type {
  GraphRetrievalInput,
  GraphRetrievalOutput,
} from "../../server/agent-studio/services/graph/retrieval/retrieval-router";
import type { ContextBlockOutput, SafetyEvent } from "../../server/agent-studio/services/graph/retrieval/safety-filter";

const FETCHER_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/recommendation/runtime/graphrag-candidate-fetcher.ts",
);

function readSrc(): string {
  return readFileSync(FETCHER_FILE, "utf8");
}

function makeRequest(
  overrides: Partial<RecommendationRequest> = {},
): RecommendationRequest {
  return {
    kind: "relevant_notes",
    anchor: { typeKey: "note", id: "note:seed-1" },
    workspaceId: 1,
    limit: 10,
    minConfidence: 0.5,
    ...overrides,
  };
}

function makeBlock(
  overrides: Partial<ContextBlockOutput> = {},
): ContextBlockOutput {
  return {
    id: "block:1",
    kind: "text",
    sourceKind: "note",
    sourceId: "note:result-1",
    contentSnippet: "this is a relevant note",
    tokenCount: 12,
    payload: {},
    citation: { sourceKind: "note", sourceId: "note:result-1" },
    ...overrides,
  };
}

function makeRouter(opts: {
  output: GraphRetrievalOutput;
  capture?: GraphRetrievalInput[];
}): RecommendationGraphRouter {
  return {
    async retrieve(input) {
      opts.capture?.push(input);
      return opts.output;
    },
  };
}

function emptyOutput(): GraphRetrievalOutput {
  return {
    mode: "graphrag_traversal",
    contextBlocks: [],
    safetyEvents: [],
    citations: [],
    truncated: false,
    durationMs: 0,
  };
}

describe("T-G.4.2 — GraphRAG candidate fetcher", () => {
  // ── source-scan ─────────────────────────────────────────────────

  it("fetcher imports GraphRetrievalRouter types but NOT the router class directly", () => {
    const src = readSrc();
    expect(src).toMatch(
      /import\s+type\s+\{[\s\S]*?GraphRetrievalInput[\s\S]*?GraphRetrievalOutput[\s\S]*?RetrievalMode[\s\S]*?\}\s+from\s+["']\.\.\/\.\.\/graph\/retrieval\/retrieval-router\.js["']/,
    );
    // Negative: must NOT import the router class (router is injected
    // via the RecommendationGraphRouter boundary).
    expect(src).not.toMatch(/import\s*\{[\s\S]*GraphRetrievalRouter\s*\}[\s\S]*from/);
  });

  it("fetcher has NO neo4j-driver / drizzle / dispatchMcpToolCall / process.env reads", () => {
    const src = readSrc();
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(src).not.toMatch(/from\s+["']drizzle-orm/);
    expect(src).not.toMatch(/^import[^\n]*dispatchMcpToolCall/m);
    expect(src).not.toMatch(/dispatchMcpToolCall\(/);
    expect(src).not.toMatch(/process\.env\.[A-Z]/);
  });

  it("RecommendationGraphRouter interface narrows to just .retrieve()", () => {
    const src = readSrc();
    expect(src).toMatch(/export\s+interface\s+RecommendationGraphRouter/);
    expect(src).toMatch(
      /retrieve\(input:\s*GraphRetrievalInput\):\s*Promise<GraphRetrievalOutput>/,
    );
  });

  // ── default kind mapper ─────────────────────────────────────────

  it("DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS covers all 8 closed-taxonomy kinds", () => {
    const expectedKinds: ReadonlyArray<RecommendationKind> = [
      "relevant_notes",
      "relevant_cag_blocks",
      "relevant_graph_skill_packs",
      "relevant_tools",
      "relevant_policies",
      "relevant_workflows",
      "relevant_experts",
      "next_actions",
    ];
    for (const k of expectedKinds) {
      expect(DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS[k]).toBeDefined();
      expect(DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS[k].length).toBeGreaterThan(0);
    }
    expect(Object.keys(DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS)).toHaveLength(
      expectedKinds.length,
    );
  });

  it("defaultRecommendationKindMapper produces graphrag_traversal mode + anchor-seeded input", () => {
    const input = defaultRecommendationKindMapper({
      kind: "relevant_tools",
      anchor: { typeKey: "agent", id: "agent:42" },
      limit: 5,
      runtime: { workspaceId: 1 },
    });
    expect(input.mode).toBe("graphrag_traversal");
    expect(input.seedNodeId).toBe("agent:42");
    expect(input.maxDepth).toBe(3);
    expect(input.maxResults).toBe(15); // limit * 3 over-fetch
    expect(input.preferTemplateKeys).toEqual(
      DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS.relevant_tools,
    );
    expect(input.runtime.workspaceId).toBe(1);
  });

  // ── classifyBlockPermissionStatus ───────────────────────────────

  it("clean blocks → visible", () => {
    expect(classifyBlockPermissionStatus("block:1", [])).toBe("visible");
  });

  it("governance_hidden → hidden", () => {
    const events: SafetyEvent[] = [
      { blockId: "block:1", reason: "governance_hidden" },
    ];
    expect(classifyBlockPermissionStatus("block:1", events)).toBe("hidden");
  });

  it("permission_denied → redacted", () => {
    const events: SafetyEvent[] = [
      { blockId: "block:1", reason: "permission_denied" },
    ];
    expect(classifyBlockPermissionStatus("block:1", events)).toBe("redacted");
  });

  it("governance_archived → hidden (archived blocks treated as hidden)", () => {
    const events: SafetyEvent[] = [
      { blockId: "block:1", reason: "governance_archived" },
    ];
    expect(classifyBlockPermissionStatus("block:1", events)).toBe("hidden");
  });

  it("event for different blockId → no effect", () => {
    const events: SafetyEvent[] = [
      { blockId: "other-block", reason: "governance_hidden" },
    ];
    expect(classifyBlockPermissionStatus("block:1", events)).toBe("visible");
  });

  // ── transformBlocksToCandidates ─────────────────────────────────

  it("blocks transform to candidates with citation + reason + score 0.7 default", () => {
    const output: GraphRetrievalOutput = {
      ...emptyOutput(),
      contextBlocks: [makeBlock()],
    };
    const candidates = transformBlocksToCandidates(output, {
      kind: "relevant_notes",
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.permissionStatus).toBe("visible");
    expect(candidates[0]?.recommendedNode).toEqual({
      typeKey: "note",
      id: "note:result-1",
    });
    expect(candidates[0]?.confidence).toBe(0.7);
    expect(candidates[0]?.sourceCitations).toEqual([
      { typeKey: "note", id: "note:result-1" },
    ]);
    expect(candidates[0]?.reason).toContain("relevant note");
  });

  it("custom scorer overrides default", () => {
    const output: GraphRetrievalOutput = {
      ...emptyOutput(),
      contextBlocks: [makeBlock()],
    };
    const candidates = transformBlocksToCandidates(output, {
      kind: "relevant_notes",
      score: () => 0.95,
    });
    expect(candidates[0]?.confidence).toBe(0.95);
  });

  it("hidden blocks surface with empty citations + reason (assembler counts them)", () => {
    const output: GraphRetrievalOutput = {
      ...emptyOutput(),
      contextBlocks: [makeBlock({ id: "block:hide" })],
      safetyEvents: [{ blockId: "block:hide", reason: "governance_hidden" }],
    };
    const candidates = transformBlocksToCandidates(output, {
      kind: "relevant_notes",
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.permissionStatus).toBe("hidden");
    expect(candidates[0]?.sourceCitations).toEqual([]);
    expect(candidates[0]?.reason).toBe("");
  });

  // ── factory + end-to-end with recommendation runtime ────────────

  it("createGraphRagCandidateFetcher returns a RecommendationCandidateFetchFn", async () => {
    const capture: GraphRetrievalInput[] = [];
    const router = makeRouter({
      output: { ...emptyOutput(), contextBlocks: [makeBlock()] },
      capture,
    });
    const fetcher = createGraphRagCandidateFetcher({ router });
    const candidates = await fetcher(makeRequest());
    expect(candidates).toHaveLength(1);
    expect(capture).toHaveLength(1);
    expect(capture[0]?.mode).toBe("graphrag_traversal");
    expect(capture[0]?.seedNodeId).toBe("note:seed-1");
  });

  it("end-to-end: runtime + fetcher → assembled RecommendationResponse", async () => {
    const router = makeRouter({
      output: {
        ...emptyOutput(),
        contextBlocks: [
          makeBlock({ id: "b1", sourceId: "note:a" }),
          makeBlock({ id: "b2", sourceId: "note:b" }),
          makeBlock({ id: "b3", sourceId: "note:c" }),
        ],
      },
    });
    const fetcher = createGraphRagCandidateFetcher({
      router,
      score: ({ block }) => {
        // Strictly ordered scoring so we can verify rank-sort.
        if (block.sourceId === "note:a") return 0.95;
        if (block.sourceId === "note:b") return 0.85;
        return 0.75;
      },
    });
    const svc = createRecommendationService({ fetchCandidates: fetcher });
    const res = await svc.recommend(makeRequest({ limit: 2 }));
    expect(res.results).toHaveLength(2);
    expect(res.results.map((r) => r.recommendedNode.id)).toEqual([
      "note:a", // 0.95
      "note:b", // 0.85
    ]);
    expect(res.results[0]?.rank).toBe(1);
  });

  it("permission_denied block flows through as redacted in the assembled response", async () => {
    const router = makeRouter({
      output: {
        ...emptyOutput(),
        contextBlocks: [
          makeBlock({ id: "b1", sourceId: "note:visible" }),
          makeBlock({ id: "b2", sourceId: "note:secret" }),
        ],
        safetyEvents: [{ blockId: "b2", reason: "permission_denied" }],
      },
    });
    const fetcher = createGraphRagCandidateFetcher({ router });
    const svc = createRecommendationService({ fetchCandidates: fetcher });
    const res = await svc.recommend(makeRequest());
    expect(res.redactedCount).toBe(1);
    const redacted = res.results.find((r) => r.permissionStatus === "redacted");
    expect(redacted).toBeDefined();
  });

  // ── defaultBlockScorer ──────────────────────────────────────────

  it("defaultBlockScorer returns 0.7", () => {
    expect(defaultBlockScorer({ block: makeBlock(), kind: "relevant_notes" })).toBe(0.7);
  });
});
