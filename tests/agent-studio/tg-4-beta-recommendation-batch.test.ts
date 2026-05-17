/**
 * T-G.4.β — Recommendation Service batch surface.
 *
 * Stacks on α (#1422). Adds `recommendBatch` — multi-kind recommend in
 * one round-trip for dashboard surfaces that render N kinds in
 * parallel panels.
 *
 *   1. Router exposes `recommendBatch` procedure.
 *   2. Envelope shape: `ok` with per-kind results, or
 *      `graphrag_unavailable`.
 *   3. Per-kind result discriminator: `ok` with response, or `error`
 *      with errorMessage — so partial-success batches don't
 *      collapse.
 */

import { describe, it, expect } from "vitest";

import {
  recommendationRouter,
  type BatchKindResult,
  type RecommendBatchEnvelope,
} from "../../server/agent-studio/services/recommendation/recommendation-router";

describe("T-G.4.β — recommendationRouter.recommendBatch shape", () => {
  it("router exposes recommendBatch procedure", () => {
    const procedures = (recommendationRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("recommendBatch");
    // α procedures still present.
    expect(keys).toContain("recommend");
    expect(keys).toContain("listKnownKinds");
  });

  it("batch envelope: ok with results or graphrag_unavailable", () => {
    const ok: RecommendBatchEnvelope = {
      status: "ok",
      results: [
        {
          kind: "note",
          status: "ok",
          response: {
            kind: "note",
            anchor: { typeKey: "person", id: "42" },
            results: [],
            redactedCount: 0,
            fullyHiddenCount: 0,
          },
        },
      ],
    };
    const unavailable: RecommendBatchEnvelope = {
      status: "graphrag_unavailable",
    };
    if (ok.status === "ok") {
      expect(ok.results.length).toBe(1);
      expect(ok.results[0]!.kind).toBe("note");
    }
    expect(unavailable.status).toBe("graphrag_unavailable");
  });

  it("per-kind result discriminator: ok with response, or error with errorMessage", () => {
    const okResult: BatchKindResult = {
      kind: "tool",
      status: "ok",
      response: {
        kind: "tool",
        anchor: { typeKey: "person", id: "1" },
        results: [],
        redactedCount: 0,
        fullyHiddenCount: 0,
      },
    };
    const errResult: BatchKindResult = {
      kind: "policy",
      status: "error",
      errorMessage: "fetchCandidates threw",
    };
    expect(okResult.status).toBe("ok");
    expect(okResult.response?.kind).toBe("tool");
    expect(errResult.status).toBe("error");
    expect(errResult.errorMessage).toBe("fetchCandidates threw");
    // Partial-success contract: error results have no `response`.
    expect(errResult.response).toBeUndefined();
  });
});
