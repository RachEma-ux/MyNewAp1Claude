/**
 * T-G.4.1 — Recommendation Service runtime.
 *
 * Behavioral test for the thin runtime shell that composes the
 * caller-injected candidate fetcher + assemble-response (the pure
 * decision logic shipped in T-G.8).
 *
 * The runtime itself is intentionally thin per assemble-response.ts
 * comment. The behavioral coverage here verifies:
 *
 *   - createRecommendationService factory wires the fetch fn
 *   - recommend() calls the fetch fn exactly once per request
 *   - recommend() forwards the assembled response unchanged
 *   - assembler's decision logic flows through (limit / minConfidence
 *     / permission-status partitioning) — sampled, not duplicated
 *     (the full coverage lives in recommendation-assemble-response.test.ts)
 *
 * Source-scan coverage verifies the runtime stays a thin shell
 * (no neo4j-driver, no openrouter, no env reads, no direct
 * GraphRAG router import — fetch is injected via the boundary
 * fetchCandidates fn).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  createRecommendationService,
  type RecommendationCandidate,
  type RecommendationCandidateFetchFn,
  type RecommendationRequest,
} from "../../server/agent-studio/services/recommendation/public-api";

const RUNTIME_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/recommendation/runtime/recommendation-service.ts",
);

function readRuntime(): string {
  return readFileSync(RUNTIME_FILE, "utf8");
}

function makeRequest(
  overrides: Partial<RecommendationRequest> = {},
): RecommendationRequest {
  return {
    kind: "relevant_notes",
    anchor: { typeKey: "user", id: "user:42" },
    workspaceId: 1,
    limit: 10,
    minConfidence: 0.5,
    ...overrides,
  };
}

function visibleCandidate(
  confidence: number,
  id: string,
): RecommendationCandidate {
  return {
    permissionStatus: "visible",
    reason: `because of ${id}`,
    graphPath: ["edge"],
    sourceCitations: [{ typeKey: "note", id }],
    confidence,
    recommendedNode: { typeKey: "note", id },
  };
}

describe("T-G.4.1 — Recommendation Service runtime", () => {
  // ── source-scan ─────────────────────────────────────────────────

  it("runtime is a thin shell — imports only contracts + assembler", () => {
    const src = readRuntime();
    expect(src).toMatch(/import\s*\{\s*assembleRecommendationResponse\s*\}\s*from\s+["']\.\.\/assemble-response\.js["']/);
    // Negative: no boundary-violating imports
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(src).not.toMatch(/from\s+["']drizzle-orm/);
    expect(src).not.toMatch(/^import[^\n]*dispatchMcpToolCall/m);
    expect(src).not.toMatch(/dispatchMcpToolCall\(/);
    // Negative: no direct GraphRAG router import (caller wires it
    // via the fetchCandidates injection)
    expect(src).not.toMatch(/from\s+["'][^"']*graph-rag/);
    expect(src).not.toMatch(/process\.env\.[A-Z]/);
  });

  it("runtime declares the RecommendationCandidateFetchFn boundary contract", () => {
    const src = readRuntime();
    expect(src).toMatch(
      /export\s+type\s+RecommendationCandidateFetchFn\s*=\s*\([\s\S]*?request:\s*RecommendationRequest[\s\S]*?\)\s*=>\s*Promise<ReadonlyArray<RecommendationCandidate>>/,
    );
  });

  it("runtime declares RecommendationService { recommend(request): Promise<RecommendationResponse> }", () => {
    const src = readRuntime();
    expect(src).toMatch(/export\s+interface\s+RecommendationService\s*\{/);
    expect(src).toMatch(
      /recommend\(request:\s*RecommendationRequest\):\s*Promise<RecommendationResponse>/,
    );
  });

  it("factory takes CreateRecommendationServiceOptions { fetchCandidates }", () => {
    const src = readRuntime();
    expect(src).toMatch(/export\s+interface\s+CreateRecommendationServiceOptions/);
    expect(src).toMatch(/readonly\s+fetchCandidates:\s*RecommendationCandidateFetchFn/);
  });

  // ── behavioral ──────────────────────────────────────────────────

  it("recommend() calls fetchCandidates exactly once per request", async () => {
    const calls: RecommendationRequest[] = [];
    const fetch: RecommendationCandidateFetchFn = async (req) => {
      calls.push(req);
      return [];
    };
    const svc = createRecommendationService({ fetchCandidates: fetch });
    const req = makeRequest();
    await svc.recommend(req);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(req);
  });

  it("empty candidates → empty response with zero counts", async () => {
    const svc = createRecommendationService({
      fetchCandidates: async () => [],
    });
    const res = await svc.recommend(makeRequest());
    expect(res.results).toHaveLength(0);
    expect(res.redactedCount).toBe(0);
    expect(res.fullyHiddenCount).toBe(0);
    expect(res.kind).toBe("relevant_notes");
    expect(res.anchor).toEqual({ typeKey: "user", id: "user:42" });
  });

  it("forwards visible candidates with rank assigned by confidence-desc", async () => {
    const svc = createRecommendationService({
      fetchCandidates: async () => [
        visibleCandidate(0.7, "note:b"),
        visibleCandidate(0.9, "note:a"),
        visibleCandidate(0.6, "note:c"),
      ],
    });
    const res = await svc.recommend(makeRequest());
    expect(res.results.map((r) => r.recommendedNode.id)).toEqual([
      "note:a", // 0.9
      "note:b", // 0.7
      "note:c", // 0.6
    ]);
    expect(res.results.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("drops candidates below request.minConfidence", async () => {
    const svc = createRecommendationService({
      fetchCandidates: async () => [
        visibleCandidate(0.9, "note:a"),
        visibleCandidate(0.4, "note:b"), // below 0.5 default
      ],
    });
    const res = await svc.recommend(makeRequest({ minConfidence: 0.5 }));
    expect(res.results).toHaveLength(1);
    expect(res.results[0]?.recommendedNode.id).toBe("note:a");
  });

  it("truncates to request.limit after rank-sort", async () => {
    const svc = createRecommendationService({
      fetchCandidates: async () => [
        visibleCandidate(0.9, "a"),
        visibleCandidate(0.8, "b"),
        visibleCandidate(0.7, "c"),
        visibleCandidate(0.6, "d"),
      ],
    });
    const res = await svc.recommend(makeRequest({ limit: 2 }));
    expect(res.results.map((r) => r.recommendedNode.id)).toEqual(["a", "b"]);
  });

  it("redacted candidates surface with redaction sentinel + redactedCount", async () => {
    const svc = createRecommendationService({
      fetchCandidates: async () => [
        visibleCandidate(0.9, "note:visible"),
        {
          permissionStatus: "redacted",
          reason: "leaky reason that should be replaced",
          graphPath: ["edge"],
          sourceCitations: [{ typeKey: "note", id: "note:secret" }],
          confidence: 0.85,
          recommendedNode: { typeKey: "note", id: "note:secret" },
        },
      ],
    });
    const res = await svc.recommend(makeRequest());
    expect(res.redactedCount).toBe(1);
    const redacted = res.results.find((r) => r.permissionStatus === "redacted");
    expect(redacted).toBeDefined();
    // Assembler replaces reason + scrubs path/citations to prevent leakage.
    expect(redacted!.reason).not.toContain("leaky");
    expect(redacted!.graphPath).toEqual([]);
    expect(redacted!.sourceCitations).toEqual([]);
  });

  it("hidden candidates fully dropped + fullyHiddenCount populated", async () => {
    const svc = createRecommendationService({
      fetchCandidates: async () => [
        visibleCandidate(0.9, "note:visible"),
        {
          permissionStatus: "hidden",
          reason: "should not appear",
          graphPath: [],
          sourceCitations: [],
          confidence: 0.95,
          recommendedNode: { typeKey: "note", id: "note:hidden" },
        },
      ],
    });
    const res = await svc.recommend(makeRequest());
    expect(res.results).toHaveLength(1);
    expect(res.results[0]?.recommendedNode.id).toBe("note:visible");
    expect(res.fullyHiddenCount).toBe(1);
  });

  it("passes through the kind from the request (no reclassification)", async () => {
    const svc = createRecommendationService({
      fetchCandidates: async () => [visibleCandidate(0.9, "tool:x")],
    });
    const res = await svc.recommend(makeRequest({ kind: "relevant_tools" }));
    expect(res.kind).toBe("relevant_tools");
  });
});
