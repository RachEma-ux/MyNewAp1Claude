/**
 * T-D.5.α — Golden Questions read tRPC surface.
 *
 * Opens the operator-facing read surface for seeded golden-question
 * suites + questions. Seed file (`seed-golden-questions.ts`)
 * populates `ags_golden_question_suites` + `ags_golden_questions`
 * at boot via `seedAsDb()`; prior to this PR no tRPC mount existed
 * for operators to enumerate them.
 *
 * Run-lifecycle persistence + caller deferred to T-D.5.β/.γ
 * (`runLiveEvaluation` exists at
 * `services/graph-skill/golden-questions/live-evaluator.ts` but
 * has no caller AND no persistence write).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  goldenQuestionsRouter,
  type ListGoldenQuestionSuitesEnvelope,
  type ListGoldenQuestionsInSuiteEnvelope,
} from "../../server/agent-studio/services/graph-skill/golden-questions/golden-questions-router";
import type {
  GoldenQuestionSuiteListRow,
  GoldenQuestionListRow,
} from "../../server/agent-studio/services/graph-skill/golden-questions/golden-questions-read-store";

describe("T-D.5.α — goldenQuestionsRouter shape", () => {
  it("exports listSuites + listQuestionsInSuite procedures", () => {
    const procedures = (goldenQuestionsRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listSuites");
    expect(keys).toContain("listQuestionsInSuite");
  });

  it("listSuites envelope wraps suite-row array with question count", () => {
    const env: ListGoldenQuestionSuitesEnvelope = {
      suites: [
        {
          id: 1,
          suiteKey: "knowledge_graph_core",
          name: "Knowledge Graph Core",
          description: "Anchor questions for the core graph traversals",
          active: true,
          questionCount: 7,
          createdAt: new Date("2026-05-13T10:00:00Z"),
        },
      ] satisfies ReadonlyArray<GoldenQuestionSuiteListRow>,
    };
    expect(env.suites.length).toBe(1);
    expect(env.suites[0]!.suiteKey).toBe("knowledge_graph_core");
    expect(env.suites[0]!.questionCount).toBe(7);
    expect(env.suites[0]!.active).toBe(true);
  });

  it("listQuestionsInSuite envelope discriminates ok / not_found", () => {
    const ok: ListGoldenQuestionsInSuiteEnvelope = {
      status: "ok",
      suiteKey: "knowledge_graph_core",
      questions: [
        {
          id: 101,
          suiteId: 1,
          suiteKey: "knowledge_graph_core",
          questionKey: "anchor_q_01",
          question: "Who owns the checkout Service?",
          expectedAnswerPattern: null,
          minimumCitationCount: 1,
          createdAt: new Date("2026-05-13T10:00:00Z"),
        },
      ] satisfies ReadonlyArray<GoldenQuestionListRow>,
    };
    expect(ok.status).toBe("ok");
    expect(ok.questions!.length).toBe(1);
    expect(ok.questions![0]!.questionKey).toBe("anchor_q_01");

    const notFound: ListGoldenQuestionsInSuiteEnvelope = {
      status: "not_found",
      suiteKey: "renamed_or_deleted",
    };
    expect(notFound.status).toBe("not_found");
    expect(notFound.questions).toBeUndefined();
  });

  it("list rows strip heavy JSON (expectedPaths)", () => {
    // The store explicitly omits `expectedPaths` from list rows —
    // detail surfaces (not yet built) re-read with full JSON.
    // Same pattern as T-D.3.β proposal list rows omitting `payload`
    // / `sourceEvidence`.
    const row: GoldenQuestionListRow = {
      id: 1,
      suiteId: 1,
      suiteKey: "k",
      questionKey: "q",
      question: "q?",
      expectedAnswerPattern: null,
      minimumCitationCount: 1,
      createdAt: new Date(),
    };
    expect("expectedPaths" in row).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — mount drift guard.
// ──────────────────────────────────────────────────────────────────

describe("T-D.5.α source-scan — goldenQuestions router is mounted", () => {
  it("api/router.ts imports goldenQuestionsRouter and mounts it at `goldenQuestions`", () => {
    const file = readFileSync(
      resolve(__dirname, "../../server/agent-studio/api/router.ts"),
      "utf-8",
    );
    expect(file).toContain(
      'import { goldenQuestionsRouter } from "../services/graph-skill/golden-questions/golden-questions-router"',
    );
    expect(file).toMatch(/\bgoldenQuestions:\s*goldenQuestionsRouter,/);
  });
});
