/**
 * Golden Questions write store — T-D.5.β.
 *
 * ASDB write boundary for `ags_golden_question_runs` +
 * `ags_golden_question_results`. Lets future callers (cron /
 * operator-trigger mutation) persist a `LiveEvaluationSummary`
 * after `runLiveEvaluation` returns.
 *
 * Why a separate helper rather than injecting into runLiveEvaluation:
 *   - runLiveEvaluation is pure + boundary-agnostic (per its module
 *     doc-block). Mixing persistence in would couple it to ASDB and
 *     undo the careful boundary-preservation work in the existing
 *     test suite.
 *   - The persistence is a strictly POST-evaluation concern. The
 *     future caller already needs to know how to interpret the
 *     summary (e.g., for cron-driven failure alerts); adding the
 *     persistence call there is cheap.
 *
 * Flow:
 *
 *   const summary = await runLiveEvaluation(suites, runner, options);
 *   const store = createGoldenQuestionsWriteStore();
 *   for (const suiteResult of summary.suites) {
 *     await store.recordSuiteRun(suiteResult);
 *   }
 *
 * (Per-suite recording lets the caller fan out failure handling per
 * suite — e.g., page on knowledge-graph-core failures but not on
 * exploratory-suite failures.)
 *
 * Hard rules:
 *   - No `neo4j-driver` import. Postgres-only.
 *   - No LLM / MCP / OpenRouter access — pure DB writes.
 *   - ASDB-null path: `getAsDb()` returning null throws a tagged
 *     error so callers can short-circuit / fall back to log-only.
 *   - suiteKey-not-found: returns a discriminated outcome
 *     `{ status: "suite_not_seeded" }` rather than throwing — the
 *     caller may have an in-memory suite that was never persisted
 *     (e.g. local dev with seed not run), and treating that as a
 *     fatal error would break local development.
 */

import { eq } from "drizzle-orm";

import { getAsDb } from "../../../db/connection.js";
import {
  agsGoldenQuestionSuites,
  agsGoldenQuestions,
  agsGoldenQuestionRuns,
  agsGoldenQuestionResults,
} from "../../../../../drizzle/tables/agent-studio-graph-quality.js";
import type {
  GoldenQuestionScore,
  GoldenQuestionSuiteResult,
} from "./live-evaluator.js";

export type RecordSuiteRunOutcome =
  | {
      readonly status: "ok";
      readonly runId: number;
      readonly suiteId: number;
      readonly questionsRecorded: number;
      readonly questionsSkippedMissingSeed: number;
    }
  | {
      readonly status: "suite_not_seeded";
      readonly suiteKey: string;
    };

export interface GoldenQuestionsWriteStore {
  /**
   * Persist one suite's results from a LiveEvaluationSummary.
   *
   * - Resolves suiteId from suiteKey via a single SELECT.
   * - Inserts an `ags_golden_question_runs` row with passed/failed
   *   counts derived from the suite results.
   * - For each scored question, looks up questionId by questionKey
   *   within the suite + inserts a result row. Questions whose
   *   questionKey isn't seeded are silently skipped (counted
   *   separately) — this can happen during seed-file drift or
   *   when the evaluator was passed in-memory questions that don't
   *   exist in ASDB.
   * - Updates the run row's `completedAt` + final status after
   *   results land.
   *
   * No transaction — each insert is independent and a partial
   * failure leaves a run-row + some-result-rows recorded, which
   * is operator-debuggable. (A tx wrapper can be added in a
   * follow-up slice if cross-row consistency becomes a concern.)
   */
  recordSuiteRun(
    suiteResult: GoldenQuestionSuiteResult,
    options?: { readonly runtimeRunId?: number },
  ): Promise<RecordSuiteRunOutcome>;
}

export interface CreateGoldenQuestionsWriteStoreOptions {
  readonly db?: unknown;
}

type AsDb = NonNullable<ReturnType<typeof getAsDb>>;

function requireDb(injected: unknown): AsDb {
  const db = (injected as AsDb | null) ?? (getAsDb() as AsDb | null);
  if (!db) {
    throw new Error(
      "[T-D.5.β] golden-questions-write-store — ASDB is null; configure DATABASE_URL_ASDB",
    );
  }
  return db;
}

export function createGoldenQuestionsWriteStore(
  options: CreateGoldenQuestionsWriteStoreOptions = {},
): GoldenQuestionsWriteStore {
  return {
    async recordSuiteRun(suiteResult, recordOptions) {
      const db = requireDb(options.db);

      // 1. Resolve suiteId by suiteKey.
      const suiteRows = await db
        .select({ id: agsGoldenQuestionSuites.id })
        .from(agsGoldenQuestionSuites)
        .where(eq(agsGoldenQuestionSuites.suiteKey, suiteResult.suiteKey))
        .limit(1);
      if (suiteRows.length === 0) {
        return {
          status: "suite_not_seeded",
          suiteKey: suiteResult.suiteKey,
        };
      }
      const suiteId = (suiteRows[0] as { id: number }).id;

      // 2. Load this suite's seeded questions (questionKey → id map)
      //    so we can resolve per-result FKs in O(N) without N round-trips.
      const seededQuestions = await db
        .select({
          id: agsGoldenQuestions.id,
          questionKey: agsGoldenQuestions.questionKey,
        })
        .from(agsGoldenQuestions)
        .where(eq(agsGoldenQuestions.suiteId, suiteId));
      const keyToId = new Map<string, number>(
        (seededQuestions as ReadonlyArray<{ id: number; questionKey: string }>).map(
          (q) => [q.questionKey, q.id],
        ),
      );

      // 3. Compute passed/failed counts from the in-memory results.
      let passedCount = 0;
      let failedCount = 0;
      for (const r of suiteResult.results) {
        if (r.passed) passedCount += 1;
        else failedCount += 1;
      }

      // 4. Insert run row.
      const startedAt = new Date();
      const [runRow] = await db
        .insert(agsGoldenQuestionRuns)
        .values({
          suiteId,
          ...(recordOptions?.runtimeRunId !== undefined
            ? { runtimeRunId: recordOptions.runtimeRunId }
            : {}),
          startedAt,
          status: "running",
          passedCount: 0,
          failedCount: 0,
        })
        .returning({ id: agsGoldenQuestionRuns.id });
      if (!runRow) {
        throw new Error(
          "[T-D.5.β] recordSuiteRun — run insert returned no row",
        );
      }
      const runId = runRow.id;

      // 5. Insert per-question result rows. Track skips for
      //    seed-drift visibility.
      let questionsRecorded = 0;
      let questionsSkippedMissingSeed = 0;
      for (const score of suiteResult.results) {
        const questionId = keyToId.get(score.questionKey);
        if (questionId === undefined) {
          questionsSkippedMissingSeed += 1;
          continue;
        }
        await db.insert(agsGoldenQuestionResults).values({
          runId,
          questionId,
          actualAnswer: score.answerText,
          citationCount: score.actualCitationCount,
          matchedExpectedPattern: null,
          passed: score.passed,
          ...(score.error !== undefined
            ? { failureReason: score.error }
            : score.failures.length > 0
              ? { failureReason: score.failures.join("; ") }
              : {}),
          durationMs: score.durationMs,
        });
        questionsRecorded += 1;
      }

      // 6. Finalize run row.
      const completedAt = new Date();
      await db
        .update(agsGoldenQuestionRuns)
        .set({
          completedAt,
          passedCount,
          failedCount,
          status: suiteResult.passed ? "passed" : "failed",
        })
        .where(eq(agsGoldenQuestionRuns.id, runId));

      return {
        status: "ok",
        runId,
        suiteId,
        questionsRecorded,
        questionsSkippedMissingSeed,
      };
    },
  };
}

/**
 * Convenience wrapper. Persists every suite in a
 * `LiveEvaluationSummary` and returns the per-suite outcomes.
 * Caller-friendly for the typical "run + persist all" cron flow.
 *
 * Errors from a single suite's persistence are caught and surfaced
 * as a `{ status: "error", error }` entry in the outcomes array,
 * NOT propagated — a single broken suite shouldn't abort
 * persistence for the rest. The caller decides whether to alert
 * on the error.
 */
export type PersistEvaluationSummaryOutcome =
  | RecordSuiteRunOutcome
  | { readonly status: "error"; readonly suiteKey: string; readonly error: string };

export async function persistEvaluationSummary(
  suiteResults: ReadonlyArray<GoldenQuestionSuiteResult>,
  store: GoldenQuestionsWriteStore,
  options?: { readonly runtimeRunId?: number },
): Promise<ReadonlyArray<PersistEvaluationSummaryOutcome>> {
  const out: PersistEvaluationSummaryOutcome[] = [];
  for (const suite of suiteResults) {
    try {
      out.push(
        await store.recordSuiteRun(
          suite,
          options ?? {},
        ),
      );
    } catch (err) {
      out.push({
        status: "error",
        suiteKey: suite.suiteKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

// Silence unused-import lint when the public callsite shape stabilises.
export type { GoldenQuestionScore };
