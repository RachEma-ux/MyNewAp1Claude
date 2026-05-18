/**
 * T-D.5.β — Golden Questions write store + persist helper.
 *
 * Closes the persistence gap on top of T-D.5.α (#1441 read surface):
 * `runLiveEvaluation` returns a `LiveEvaluationSummary` in-memory
 * with no DB writes, so `ags_golden_question_runs` +
 * `ags_golden_question_results` stay empty in production. This
 * write store + `persistEvaluationSummary` helper let the future
 * caller (cron / operator-trigger mutation — T-D.5.γ) persist a
 * summary after evaluation.
 *
 * Design choice: persistence is OUTSIDE `runLiveEvaluation` (which
 * remains pure + boundary-agnostic per its module doc-block). The
 * future caller does `runLiveEvaluation(...)` then
 * `persistEvaluationSummary(summary.suites, store)`. This avoids
 * coupling the well-tested evaluator to ASDB.
 *
 * suiteKey-not-found returns a discriminated `"suite_not_seeded"`
 * outcome rather than throwing — the caller may have an in-memory
 * suite that was never persisted (local dev without seed run), and
 * treating that as fatal would break local-first iteration.
 */

import { describe, it, expect, vi } from "vitest";

import {
  createGoldenQuestionsWriteStore,
  persistEvaluationSummary,
  type GoldenQuestionsWriteStore,
  type RecordSuiteRunOutcome,
  type PersistEvaluationSummaryOutcome,
} from "../../server/agent-studio/services/graph-skill/golden-questions/golden-questions-write-store";
import type {
  GoldenQuestionScore,
  GoldenQuestionSuiteResult,
} from "../../server/agent-studio/services/graph-skill/golden-questions/live-evaluator";

function makeScore(
  questionKey: string,
  suiteKey: string,
  passed: boolean,
  overrides?: Partial<GoldenQuestionScore>,
): GoldenQuestionScore {
  return {
    questionKey,
    suiteKey,
    passed,
    failures: passed ? [] : ["mock failure"],
    actualCitationCount: 2,
    actualRetrievalMode: "graphrag",
    answerText: "mock answer",
    durationMs: 100,
    ...(overrides ?? {}),
  };
}

function makeSuite(
  suiteKey: string,
  passed: boolean,
  results: ReadonlyArray<GoldenQuestionScore>,
): GoldenQuestionSuiteResult {
  return {
    suiteKey,
    name: `Suite ${suiteKey}`,
    passed,
    results,
  };
}

describe("T-D.5.β — golden-questions write store contract", () => {
  it("factory + exports are present", () => {
    expect(createGoldenQuestionsWriteStore).toBeDefined();
    expect(persistEvaluationSummary).toBeDefined();
  });

  it("RecordSuiteRunOutcome discriminates ok / suite_not_seeded", () => {
    const ok: RecordSuiteRunOutcome = {
      status: "ok",
      runId: 7,
      suiteId: 1,
      questionsRecorded: 5,
      questionsSkippedMissingSeed: 0,
    };
    expect(ok.status).toBe("ok");
    expect(ok.questionsRecorded).toBe(5);

    const notSeeded: RecordSuiteRunOutcome = {
      status: "suite_not_seeded",
      suiteKey: "exploratory_suite",
    };
    expect(notSeeded.status).toBe("suite_not_seeded");
  });
});

describe("T-D.5.β — persistEvaluationSummary helper", () => {
  it("calls recordSuiteRun once per suite, returning outcomes in order", async () => {
    const outcomes: RecordSuiteRunOutcome[] = [
      {
        status: "ok",
        runId: 1,
        suiteId: 10,
        questionsRecorded: 2,
        questionsSkippedMissingSeed: 0,
      },
      {
        status: "suite_not_seeded",
        suiteKey: "untouched",
      },
    ];
    const recordSuiteRun = vi.fn(async () => outcomes.shift()!);
    const store: GoldenQuestionsWriteStore = { recordSuiteRun };

    const suites = [
      makeSuite("knowledge_graph_core", true, [
        makeScore("q1", "knowledge_graph_core", true),
        makeScore("q2", "knowledge_graph_core", true),
      ]),
      makeSuite("untouched", false, [makeScore("q1", "untouched", false)]),
    ];

    const results = await persistEvaluationSummary(suites, store);

    expect(recordSuiteRun).toHaveBeenCalledTimes(2);
    expect(results.length).toBe(2);
    expect(results[0]!.status).toBe("ok");
    expect(results[1]!.status).toBe("suite_not_seeded");
  });

  it("swallows per-suite errors as { status: 'error' } outcomes", async () => {
    let calls = 0;
    const recordSuiteRun = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw new Error("boom: suite 2");
      return {
        status: "ok",
        runId: calls,
        suiteId: 10 + calls,
        questionsRecorded: 1,
        questionsSkippedMissingSeed: 0,
      } satisfies RecordSuiteRunOutcome;
    });
    const store: GoldenQuestionsWriteStore = { recordSuiteRun };

    const suites = [
      makeSuite("a", true, [makeScore("q1", "a", true)]),
      makeSuite("b", true, [makeScore("q1", "b", true)]),
      makeSuite("c", true, [makeScore("q1", "c", true)]),
    ];

    const results: ReadonlyArray<PersistEvaluationSummaryOutcome> =
      await persistEvaluationSummary(suites, store);

    expect(results.length).toBe(3);
    expect(results[0]!.status).toBe("ok");
    expect(results[1]!.status).toBe("error");
    expect((results[1] as { status: "error"; error: string }).error).toMatch(
      /boom: suite 2/,
    );
    expect(results[2]!.status).toBe("ok");
    // Critically, the third suite was still processed despite the
    // second suite's failure — single-suite breakage doesn't abort
    // persistence for the rest.
    expect(recordSuiteRun).toHaveBeenCalledTimes(3);
  });

  it("forwards runtimeRunId option to each recordSuiteRun call", async () => {
    const recordSuiteRun = vi.fn(async () => ({
      status: "ok" as const,
      runId: 1,
      suiteId: 1,
      questionsRecorded: 1,
      questionsSkippedMissingSeed: 0,
    }));
    const store: GoldenQuestionsWriteStore = { recordSuiteRun };

    await persistEvaluationSummary(
      [makeSuite("a", true, [makeScore("q1", "a", true)])],
      store,
      { runtimeRunId: 42 },
    );

    expect(recordSuiteRun).toHaveBeenCalledWith(
      expect.objectContaining({ suiteKey: "a" }),
      { runtimeRunId: 42 },
    );
  });
});
