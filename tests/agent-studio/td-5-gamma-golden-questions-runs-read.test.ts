/**
 * T-D.5.γ — Golden Questions runs read surface.
 *
 * Extends the T-D.5.α router (#1441) with 3 read procedures
 * backed by 3 new `GoldenQuestionsReadStore` methods:
 *
 *   - `listRecentRuns({ limit, suiteKey? })` — newest-first run rows
 *     joined with suiteKey for display; optional per-suite filter
 *   - `getRunStats({ runId })` — per-run aggregate (passed/failed
 *     counts + total + status + timestamps), discriminated
 *     not_found envelope
 *   - `listRunResults({ runId })` — per-question results for one
 *     run, joined with question text + key for the operator
 *     drill-in panel, discriminated not_found envelope
 *
 * Once T-D.5.β persistence is being written by a future caller
 * (T-D.5.δ — cron / operator-trigger mutation), the operator
 * dashboard can drill into past evaluation runs without
 * re-implementing the SQL client-side.
 */

import { describe, it, expect } from "vitest";

import {
  goldenQuestionsRouter,
  GOLDEN_QUESTIONS_LIST_RUNS_DEFAULT_LIMIT,
  GOLDEN_QUESTIONS_LIST_RUNS_ABSOLUTE_LIMIT,
  type ListGoldenQuestionRecentRunsEnvelope,
  type GetGoldenQuestionRunStatsEnvelope,
  type ListGoldenQuestionRunResultsEnvelope,
} from "../../server/agent-studio/services/graph-skill/golden-questions/golden-questions-router";
import type {
  GoldenQuestionRunListRow,
  GoldenQuestionResultListRow,
  GoldenQuestionRunStats,
} from "../../server/agent-studio/services/graph-skill/golden-questions/golden-questions-read-store";

describe("T-D.5.γ — goldenQuestions runs read shape", () => {
  it("router exposes listRecentRuns + getRunStats + listRunResults (plus α procedures)", () => {
    const procedures = (goldenQuestionsRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listRecentRuns");
    expect(keys).toContain("getRunStats");
    expect(keys).toContain("listRunResults");
    // α procedures preserved (regression check).
    expect(keys).toContain("listSuites");
    expect(keys).toContain("listQuestionsInSuite");
  });

  it("default + absolute limit constants are sane", () => {
    expect(GOLDEN_QUESTIONS_LIST_RUNS_DEFAULT_LIMIT).toBe(50);
    expect(GOLDEN_QUESTIONS_LIST_RUNS_ABSOLUTE_LIMIT).toBe(200);
    expect(GOLDEN_QUESTIONS_LIST_RUNS_DEFAULT_LIMIT).toBeLessThan(
      GOLDEN_QUESTIONS_LIST_RUNS_ABSOLUTE_LIMIT,
    );
  });

  it("listRecentRuns envelope wraps a run-row array with suiteKey join", () => {
    const env: ListGoldenQuestionRecentRunsEnvelope = {
      runs: [
        {
          id: 7,
          suiteId: 1,
          suiteKey: "knowledge_graph_core",
          status: "passed",
          passedCount: 6,
          failedCount: 1,
          startedAt: new Date("2026-05-18T10:00:00Z"),
          completedAt: new Date("2026-05-18T10:05:00Z"),
          createdAt: new Date("2026-05-18T10:00:00Z"),
        },
      ] satisfies ReadonlyArray<GoldenQuestionRunListRow>,
    };
    expect(env.runs.length).toBe(1);
    expect(env.runs[0]!.suiteKey).toBe("knowledge_graph_core");
    expect(env.runs[0]!.passedCount).toBe(6);
    expect(env.runs[0]!.failedCount).toBe(1);
  });

  it("getRunStats envelope discriminates ok / not_found", () => {
    const ok: GetGoldenQuestionRunStatsEnvelope = {
      status: "ok",
      stats: {
        runId: 7,
        suiteId: 1,
        suiteKey: "knowledge_graph_core",
        status: "passed",
        passedCount: 6,
        failedCount: 1,
        totalCount: 7,
        startedAt: new Date("2026-05-18T10:00:00Z"),
        completedAt: new Date("2026-05-18T10:05:00Z"),
      } satisfies GoldenQuestionRunStats,
    };
    expect(ok.status).toBe("ok");
    expect(ok.stats!.totalCount).toBe(7);
    expect(ok.stats!.passedCount + ok.stats!.failedCount).toBe(
      ok.stats!.totalCount,
    );

    const notFound: GetGoldenQuestionRunStatsEnvelope = { status: "not_found" };
    expect(notFound.status).toBe("not_found");
    expect(notFound.stats).toBeUndefined();
  });

  it("listRunResults envelope discriminates ok / not_found + carries question text", () => {
    const ok: ListGoldenQuestionRunResultsEnvelope = {
      status: "ok",
      runId: 7,
      results: [
        {
          id: 101,
          runId: 7,
          questionId: 1,
          questionKey: "anchor_q_01",
          question: "Who owns the checkout Service?",
          actualAnswer: "Team Payments owns checkout",
          citationCount: 2,
          passed: true,
          failureReason: null,
          durationMs: 150,
          createdAt: new Date("2026-05-18T10:00:00Z"),
        },
        {
          id: 102,
          runId: 7,
          questionId: 2,
          questionKey: "anchor_q_02",
          question: "Which packages does the checkout Service depend on?",
          actualAnswer: null,
          citationCount: 0,
          passed: false,
          failureReason: "engine error: timeout",
          durationMs: 5000,
          createdAt: new Date("2026-05-18T10:00:00Z"),
        },
      ] satisfies ReadonlyArray<GoldenQuestionResultListRow>,
    };
    expect(ok.status).toBe("ok");
    expect(ok.results!.length).toBe(2);
    expect(ok.results![0]!.passed).toBe(true);
    expect(ok.results![1]!.passed).toBe(false);
    expect(ok.results![1]!.failureReason).toBe("engine error: timeout");

    const notFound: ListGoldenQuestionRunResultsEnvelope = {
      status: "not_found",
      runId: 999,
    };
    expect(notFound.status).toBe("not_found");
    expect(notFound.results).toBeUndefined();
  });
});
