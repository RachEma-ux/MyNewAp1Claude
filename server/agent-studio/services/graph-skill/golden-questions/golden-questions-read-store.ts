/**
 * Golden Questions read store — T-D.5.α.
 *
 * ASDB read boundary for `ags_golden_question_suites` +
 * `ags_golden_questions`. Operator-facing surfaces consume this to
 * enumerate seeded suites + their questions without re-implementing
 * the closed-taxonomy lookup client-side.
 *
 * **Read-only.** Writes are NOT part of this store's contract:
 *
 *   - Suites + questions are seeded by
 *     `seed-golden-questions.ts` at boot via the shared
 *     `seedAsDb()` orchestration.
 *   - Run + result persistence (T-D.5.β candidate) wires into
 *     `runLiveEvaluation` via an optional recorder injection —
 *     separate concern, separate slice.
 *
 * Hard rules:
 *   - No `neo4j-driver` import — Postgres-only persistence.
 *   - No LLM / MCP / OpenRouter access — pure DB reads.
 *   - ASDB-null path: `getAsDb()` returning null throws a tagged
 *     error so callers can short-circuit.
 */

import { asc, desc, eq } from "drizzle-orm";

import { getAsDb } from "../../../db/connection.js";
import {
  agsGoldenQuestionSuites,
  agsGoldenQuestions,
  agsGoldenQuestionRuns,
  agsGoldenQuestionResults,
} from "../../../../../drizzle/tables/agent-studio-graph-quality.js";

/**
 * Operator-facing list row for `ags_golden_question_suites`.
 * Active + question-count attached for the operator picker.
 */
export interface GoldenQuestionSuiteListRow {
  readonly id: number;
  readonly suiteKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly active: boolean;
  readonly questionCount: number;
  readonly createdAt: Date;
}

/**
 * Operator-facing list row for `ags_golden_questions`.
 * Strips the heavy `expectedPaths` JSON for list views.
 */
export interface GoldenQuestionListRow {
  readonly id: number;
  readonly suiteId: number;
  readonly suiteKey: string;
  readonly questionKey: string;
  readonly question: string;
  readonly expectedAnswerPattern: string | null;
  readonly minimumCitationCount: number;
  readonly createdAt: Date;
}

/**
 * Operator-facing list row for `ags_golden_question_runs` (T-D.5.γ).
 * Joins suiteKey so the operator dashboard can render
 * "knowledge_graph_core — passed 6/7 (1 failed) — 2026-05-18" without
 * a second fetch.
 */
export interface GoldenQuestionRunListRow {
  readonly id: number;
  readonly suiteId: number;
  readonly suiteKey: string;
  readonly status: string;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * One per-question result row for `ags_golden_question_results`
 * (T-D.5.γ). `actualAnswer` is included since operators need it
 * for failure triage; the list view caps at `runId` scope so the
 * payload size is bounded by the suite size.
 */
export interface GoldenQuestionResultListRow {
  readonly id: number;
  readonly runId: number;
  readonly questionId: number;
  readonly questionKey: string;
  readonly question: string;
  readonly actualAnswer: string | null;
  readonly citationCount: number | null;
  readonly passed: boolean;
  readonly failureReason: string | null;
  readonly durationMs: number | null;
  readonly createdAt: Date;
}

/**
 * Full per-question detail row (T-D.5.δ). Includes the heavy
 * `expectedPaths` JSON that the T-D.5.α list view intentionally
 * omits. Operator drill-in for a single question's expected
 * shape — useful when triaging why a question failed.
 */
export interface GoldenQuestionDetail {
  readonly id: number;
  readonly suiteId: number;
  readonly suiteKey: string;
  readonly questionKey: string;
  readonly question: string;
  readonly expectedAnswerPattern: string | null;
  readonly expectedPaths: Record<string, unknown> | null;
  readonly minimumCitationCount: number;
  readonly createdAt: Date;
}

/**
 * Aggregate per-run stats (T-D.5.γ). Same shape as
 * `SemanticEnrichmentRunStats` but for golden-question runs.
 */
export interface GoldenQuestionRunStats {
  readonly runId: number;
  readonly suiteId: number;
  readonly suiteKey: string;
  readonly status: string;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly totalCount: number;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
}

export interface GoldenQuestionsReadStore {
  /**
   * Recent seeded suites, ordered by `suiteKey` ascending for
   * deterministic picker rendering. Includes a `questionCount`
   * field computed via a JOIN-aggregate so the operator sees
   * "Knowledge Graph Suite (7 questions)" without an N+1 fetch.
   */
  listSuites(): Promise<ReadonlyArray<GoldenQuestionSuiteListRow>>;

  /**
   * Questions within one suite, looked up by `suiteKey` (the
   * stable string identifier the seed file owns). Returns null
   * when the suite isn't seeded — operators may click stale links.
   */
  listQuestionsInSuite(
    suiteKey: string,
  ): Promise<ReadonlyArray<GoldenQuestionListRow> | null>;

  /**
   * T-D.5.γ — Recent run rows, newest-first by createdAt. Optional
   * suiteKey filter. Joins suiteKey for display without N+1 fetches.
   */
  listRecentRuns(input: {
    readonly limit: number;
    readonly suiteKey?: string;
  }): Promise<ReadonlyArray<GoldenQuestionRunListRow>>;

  /**
   * T-D.5.γ — Per-run stats. Returns null when the runId isn't
   * found (stale-link safety per the §22 lesson).
   */
  getRunStats(runId: number): Promise<GoldenQuestionRunStats | null>;

  /**
   * T-D.5.γ — Per-question results for one run, ordered by
   * questionKey ascending. Returns null when the runId isn't
   * found.
   */
  listRunResults(
    runId: number,
  ): Promise<ReadonlyArray<GoldenQuestionResultListRow> | null>;

  /**
   * T-D.5.δ — Full per-question detail row, including the heavy
   * `expectedPaths` JSON that the T-D.5.α list view omits.
   * Returns null when the questionId isn't found (stale-link
   * safety per §22 lesson #5).
   */
  getQuestionDetail(
    questionId: number,
  ): Promise<GoldenQuestionDetail | null>;
}

export interface CreateGoldenQuestionsReadStoreOptions {
  readonly db?: unknown;
}

type AsDb = NonNullable<ReturnType<typeof getAsDb>>;

function requireDb(injected: unknown): AsDb {
  const db = (injected as AsDb | null) ?? (getAsDb() as AsDb | null);
  if (!db) {
    throw new Error(
      "[T-D.5.α] golden-questions-read-store — ASDB is null; configure DATABASE_URL_ASDB",
    );
  }
  return db;
}

export function createGoldenQuestionsReadStore(
  options: CreateGoldenQuestionsReadStoreOptions = {},
): GoldenQuestionsReadStore {
  return {
    async listSuites() {
      const db = requireDb(options.db);
      const suiteRows = await db
        .select()
        .from(agsGoldenQuestionSuites)
        .orderBy(asc(agsGoldenQuestionSuites.suiteKey));
      if (suiteRows.length === 0) return [];
      // Count questions per suite. We do a second small query
      // grouped by suiteId rather than a JOIN-aggregate to keep
      // the suite-row shape clean (Drizzle's groupBy returns
      // arrays of partial rows that mixed with the full suite
      // select wedges the typing).
      const countRows = await db
        .select({
          suiteId: agsGoldenQuestions.suiteId,
        })
        .from(agsGoldenQuestions);
      const counts = new Map<number, number>();
      for (const r of countRows as ReadonlyArray<{ suiteId: number }>) {
        counts.set(r.suiteId, (counts.get(r.suiteId) ?? 0) + 1);
      }
      return suiteRows.map(
        (s: typeof agsGoldenQuestionSuites.$inferSelect) => ({
          id: s.id,
          suiteKey: s.suiteKey,
          name: s.name,
          description: s.description,
          active: s.active,
          questionCount: counts.get(s.id) ?? 0,
          createdAt: s.createdAt,
        }),
      );
    },

    async listRecentRuns(input) {
      const db = requireDb(options.db);
      const baseQuery = db
        .select({
          id: agsGoldenQuestionRuns.id,
          suiteId: agsGoldenQuestionRuns.suiteId,
          suiteKey: agsGoldenQuestionSuites.suiteKey,
          status: agsGoldenQuestionRuns.status,
          passedCount: agsGoldenQuestionRuns.passedCount,
          failedCount: agsGoldenQuestionRuns.failedCount,
          startedAt: agsGoldenQuestionRuns.startedAt,
          completedAt: agsGoldenQuestionRuns.completedAt,
          createdAt: agsGoldenQuestionRuns.createdAt,
        })
        .from(agsGoldenQuestionRuns)
        .innerJoin(
          agsGoldenQuestionSuites,
          eq(agsGoldenQuestionRuns.suiteId, agsGoldenQuestionSuites.id),
        );
      const rows = await (input.suiteKey !== undefined
        ? baseQuery.where(
            eq(agsGoldenQuestionSuites.suiteKey, input.suiteKey),
          )
        : baseQuery
      )
        .orderBy(desc(agsGoldenQuestionRuns.createdAt))
        .limit(input.limit);
      return rows.map(
        (r: {
          id: number;
          suiteId: number;
          suiteKey: string;
          status: string;
          passedCount: number | null;
          failedCount: number | null;
          startedAt: Date | null;
          completedAt: Date | null;
          createdAt: Date;
        }) => ({
          id: r.id,
          suiteId: r.suiteId,
          suiteKey: r.suiteKey,
          status: r.status,
          passedCount: r.passedCount ?? 0,
          failedCount: r.failedCount ?? 0,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          createdAt: r.createdAt,
        }),
      );
    },

    async getRunStats(runId) {
      const db = requireDb(options.db);
      const rows = await db
        .select({
          id: agsGoldenQuestionRuns.id,
          suiteId: agsGoldenQuestionRuns.suiteId,
          suiteKey: agsGoldenQuestionSuites.suiteKey,
          status: agsGoldenQuestionRuns.status,
          passedCount: agsGoldenQuestionRuns.passedCount,
          failedCount: agsGoldenQuestionRuns.failedCount,
          startedAt: agsGoldenQuestionRuns.startedAt,
          completedAt: agsGoldenQuestionRuns.completedAt,
        })
        .from(agsGoldenQuestionRuns)
        .innerJoin(
          agsGoldenQuestionSuites,
          eq(agsGoldenQuestionRuns.suiteId, agsGoldenQuestionSuites.id),
        )
        .where(eq(agsGoldenQuestionRuns.id, runId))
        .limit(1);
      if (rows.length === 0) return null;
      const r = rows[0] as {
        id: number;
        suiteId: number;
        suiteKey: string;
        status: string;
        passedCount: number | null;
        failedCount: number | null;
        startedAt: Date | null;
        completedAt: Date | null;
      };
      const passedCount = r.passedCount ?? 0;
      const failedCount = r.failedCount ?? 0;
      return {
        runId: r.id,
        suiteId: r.suiteId,
        suiteKey: r.suiteKey,
        status: r.status,
        passedCount,
        failedCount,
        totalCount: passedCount + failedCount,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      };
    },

    async listRunResults(runId) {
      const db = requireDb(options.db);
      const runExists = await db
        .select({ id: agsGoldenQuestionRuns.id })
        .from(agsGoldenQuestionRuns)
        .where(eq(agsGoldenQuestionRuns.id, runId))
        .limit(1);
      if (runExists.length === 0) return null;
      const rows = await db
        .select({
          id: agsGoldenQuestionResults.id,
          runId: agsGoldenQuestionResults.runId,
          questionId: agsGoldenQuestionResults.questionId,
          questionKey: agsGoldenQuestions.questionKey,
          question: agsGoldenQuestions.question,
          actualAnswer: agsGoldenQuestionResults.actualAnswer,
          citationCount: agsGoldenQuestionResults.citationCount,
          passed: agsGoldenQuestionResults.passed,
          failureReason: agsGoldenQuestionResults.failureReason,
          durationMs: agsGoldenQuestionResults.durationMs,
          createdAt: agsGoldenQuestionResults.createdAt,
        })
        .from(agsGoldenQuestionResults)
        .innerJoin(
          agsGoldenQuestions,
          eq(agsGoldenQuestionResults.questionId, agsGoldenQuestions.id),
        )
        .where(eq(agsGoldenQuestionResults.runId, runId))
        .orderBy(asc(agsGoldenQuestions.questionKey));
      return rows.map(
        (r: {
          id: number;
          runId: number;
          questionId: number;
          questionKey: string;
          question: string;
          actualAnswer: string | null;
          citationCount: number | null;
          passed: boolean;
          failureReason: string | null;
          durationMs: number | null;
          createdAt: Date;
        }) => ({
          id: r.id,
          runId: r.runId,
          questionId: r.questionId,
          questionKey: r.questionKey,
          question: r.question,
          actualAnswer: r.actualAnswer,
          citationCount: r.citationCount,
          passed: r.passed,
          failureReason: r.failureReason,
          durationMs: r.durationMs,
          createdAt: r.createdAt,
        }),
      );
    },

    async getQuestionDetail(questionId) {
      const db = requireDb(options.db);
      const rows = await db
        .select({
          id: agsGoldenQuestions.id,
          suiteId: agsGoldenQuestions.suiteId,
          suiteKey: agsGoldenQuestionSuites.suiteKey,
          questionKey: agsGoldenQuestions.questionKey,
          question: agsGoldenQuestions.question,
          expectedAnswerPattern: agsGoldenQuestions.expectedAnswerPattern,
          expectedPaths: agsGoldenQuestions.expectedPaths,
          minimumCitationCount: agsGoldenQuestions.minimumCitationCount,
          createdAt: agsGoldenQuestions.createdAt,
        })
        .from(agsGoldenQuestions)
        .innerJoin(
          agsGoldenQuestionSuites,
          eq(agsGoldenQuestions.suiteId, agsGoldenQuestionSuites.id),
        )
        .where(eq(agsGoldenQuestions.id, questionId))
        .limit(1);
      if (rows.length === 0) return null;
      const r = rows[0] as {
        id: number;
        suiteId: number;
        suiteKey: string;
        questionKey: string;
        question: string;
        expectedAnswerPattern: string | null;
        expectedPaths: Record<string, unknown> | null;
        minimumCitationCount: number;
        createdAt: Date;
      };
      return {
        id: r.id,
        suiteId: r.suiteId,
        suiteKey: r.suiteKey,
        questionKey: r.questionKey,
        question: r.question,
        expectedAnswerPattern: r.expectedAnswerPattern,
        expectedPaths: r.expectedPaths,
        minimumCitationCount: r.minimumCitationCount,
        createdAt: r.createdAt,
      };
    },

    async listQuestionsInSuite(suiteKey) {
      const db = requireDb(options.db);
      const suiteRows = await db
        .select()
        .from(agsGoldenQuestionSuites)
        .where(eq(agsGoldenQuestionSuites.suiteKey, suiteKey))
        .limit(1);
      if (suiteRows.length === 0) return null;
      const suite = suiteRows[0] as typeof agsGoldenQuestionSuites.$inferSelect;
      const questionRows = await db
        .select({
          id: agsGoldenQuestions.id,
          suiteId: agsGoldenQuestions.suiteId,
          questionKey: agsGoldenQuestions.questionKey,
          question: agsGoldenQuestions.question,
          expectedAnswerPattern: agsGoldenQuestions.expectedAnswerPattern,
          minimumCitationCount: agsGoldenQuestions.minimumCitationCount,
          createdAt: agsGoldenQuestions.createdAt,
        })
        .from(agsGoldenQuestions)
        .where(eq(agsGoldenQuestions.suiteId, suite.id))
        .orderBy(asc(agsGoldenQuestions.questionKey));
      return questionRows.map(
        (q: {
          id: number;
          suiteId: number;
          questionKey: string;
          question: string;
          expectedAnswerPattern: string | null;
          minimumCitationCount: number;
          createdAt: Date;
        }) => ({
          id: q.id,
          suiteId: q.suiteId,
          suiteKey: suite.suiteKey,
          questionKey: q.questionKey,
          question: q.question,
          expectedAnswerPattern: q.expectedAnswerPattern,
          minimumCitationCount: q.minimumCitationCount,
          createdAt: q.createdAt,
        }),
      );
    },
  };
}
