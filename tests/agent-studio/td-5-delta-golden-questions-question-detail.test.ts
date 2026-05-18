/**
 * T-D.5.δ — Golden Questions question detail surface.
 *
 * Adds `getQuestionDetail({ questionId })` returning the heavy
 * `expectedPaths` JSON that the T-D.5.α list view
 * (`listQuestionsInSuite`) intentionally omits. Same detail-vs-list
 * pattern as T-D.3.ε `semanticEnrichment.getProposalDetail` (#1446)
 * — list rows strip heavy JSON, detail rows include it.
 *
 * Operator drill-in for a single question's expected shape —
 * useful when triaging why a question failed in a past evaluation
 * run (compare expected paths to actual engine output).
 */

import { describe, it, expect } from "vitest";

import {
  goldenQuestionsRouter,
  type GetGoldenQuestionDetailEnvelope,
} from "../../server/agent-studio/services/graph-skill/golden-questions/golden-questions-router";
import type { GoldenQuestionDetail } from "../../server/agent-studio/services/graph-skill/golden-questions/golden-questions-read-store";

describe("T-D.5.δ — goldenQuestionsRouter.getQuestionDetail shape", () => {
  it("router exposes getQuestionDetail (plus α/γ procedures)", () => {
    const procedures = (goldenQuestionsRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("getQuestionDetail");
    // α + γ procedures preserved (regression check).
    expect(keys).toContain("listSuites");
    expect(keys).toContain("listQuestionsInSuite");
    expect(keys).toContain("listRecentRuns");
    expect(keys).toContain("getRunStats");
    expect(keys).toContain("listRunResults");
  });

  it("envelope discriminates ok / not_found", () => {
    const ok: GetGoldenQuestionDetailEnvelope = {
      status: "ok",
      questionId: 42,
      question: {
        id: 42,
        suiteId: 1,
        suiteKey: "knowledge_graph_core",
        questionKey: "anchor_q_01",
        question: "Who owns the checkout Service?",
        expectedAnswerPattern: null,
        expectedPaths: {
          skillPackKey: "kg-ownership",
          templateKey: "owner-by-service",
        },
        minimumCitationCount: 1,
        createdAt: new Date("2026-05-13T10:00:00Z"),
      } satisfies GoldenQuestionDetail,
    };
    expect(ok.status).toBe("ok");
    expect(ok.question!.id).toBe(42);
    // Heavy JSON IS present in detail view (the whole point of
    // this slice vs the list view which omits expectedPaths).
    expect(ok.question!.expectedPaths).toBeDefined();
    expect(
      (ok.question!.expectedPaths as { skillPackKey?: string }).skillPackKey,
    ).toBe("kg-ownership");

    const notFound: GetGoldenQuestionDetailEnvelope = {
      status: "not_found",
      questionId: 9999,
    };
    expect(notFound.status).toBe("not_found");
    expect(notFound.question).toBeUndefined();
  });

  it("detail row carries fields list row omits (expectedPaths)", () => {
    // Surface the invariant: list-rows-strip-heavy-JSON +
    // detail-rows-include-heavy-JSON. T-D.3.ε established this
    // pattern; T-D.5.δ extends it to golden-questions.
    const detail: GoldenQuestionDetail = {
      id: 1,
      suiteId: 1,
      suiteKey: "k",
      questionKey: "q",
      question: "q?",
      expectedAnswerPattern: null,
      expectedPaths: { skillPackKey: "x" },
      minimumCitationCount: 1,
      createdAt: new Date(),
    };
    expect("expectedPaths" in detail).toBe(true);
    expect(detail.expectedPaths).not.toBeNull();
  });
});
