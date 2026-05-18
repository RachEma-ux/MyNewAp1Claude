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

import { asc, eq } from "drizzle-orm";

import { getAsDb } from "../../../db/connection.js";
import {
  agsGoldenQuestionSuites,
  agsGoldenQuestions,
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
