/**
 * Golden Questions — tRPC router (T-D.5.α).
 *
 * Operator-facing read surface for seeded golden-question suites +
 * questions. Closes a "completion gap": the seed file
 * (`seed-golden-questions.ts`) populates `ags_golden_question_suites`
 * + `ags_golden_questions` at boot via `seedAsDb()`, but no tRPC
 * mount existed for operators to enumerate them — they had to either
 * read the seed file source-of-truth client-side or hit the DB
 * directly.
 *
 * Mounted at `agentStudio.goldenQuestions.*`. Both procedures are
 * `adminProcedure` (operator-only) and read-only.
 *
 * **Deferred — run lifecycle persistence + caller.**
 * `runLiveEvaluation(suites, runner, options)` exists at
 * `services/graph-skill/golden-questions/live-evaluator.ts` but:
 *
 *   - Has NO caller in production (cron / operator-trigger
 *     mutation not built)
 *   - Has NO persistence write to `ags_golden_question_runs` /
 *     `ags_golden_question_results` (returns the summary
 *     in-memory only)
 *
 * The run-lifecycle persistence + the caller form a 2-3 slice
 * follow-up arc (T-D.5.β / T-D.5.γ). This slice ships the read
 * surface so the operator dashboard can render the "browse
 * golden-question suites" picker today.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - DB I/O routes through `createGoldenQuestionsReadStore` — no
 *     Drizzle imports in the router file.
 *   - `adminProcedure` floor preserved.
 */

import { z } from "zod";

import { adminProcedure, router } from "../../../../_core/trpc.js";
import {
  createGoldenQuestionsReadStore,
  type GoldenQuestionDetail,
  type GoldenQuestionListRow,
  type GoldenQuestionResultListRow,
  type GoldenQuestionRunListRow,
  type GoldenQuestionRunStats,
  type GoldenQuestionSuiteListRow,
} from "./golden-questions-read-store.js";

// ============================================================================
// Limit constants
// ============================================================================

export const GOLDEN_QUESTIONS_LIST_RUNS_DEFAULT_LIMIT = 50;
export const GOLDEN_QUESTIONS_LIST_RUNS_ABSOLUTE_LIMIT = 200;

// ============================================================================
// Output envelopes
// ============================================================================

export interface ListGoldenQuestionSuitesEnvelope {
  readonly suites: ReadonlyArray<GoldenQuestionSuiteListRow>;
}

/**
 * `listQuestionsInSuite` envelope. Discriminated `status` for
 * stale-link safety (operators may click a link to a suite that
 * was renamed / removed); see `codeGraph.getIngestionStats` for
 * the same pattern.
 */
export interface ListGoldenQuestionsInSuiteEnvelope {
  readonly status: "ok" | "not_found";
  readonly suiteKey: string;
  readonly questions?: ReadonlyArray<GoldenQuestionListRow>;
}

/**
 * `listRecentRuns` envelope (T-D.5.γ). Plain wrapper; no
 * discriminated outcome since an empty-list result is the natural
 * "no runs yet" state.
 */
export interface ListGoldenQuestionRecentRunsEnvelope {
  readonly runs: ReadonlyArray<GoldenQuestionRunListRow>;
}

/**
 * `getRunStats` envelope (T-D.5.γ). Discriminated `not_found` for
 * stale-link safety; mirrors codeGraph.getIngestionStats /
 * semanticEnrichment.getRunStats.
 */
export interface GetGoldenQuestionRunStatsEnvelope {
  readonly status: "ok" | "not_found";
  readonly stats?: GoldenQuestionRunStats;
}

/**
 * `listRunResults` envelope (T-D.5.γ). Discriminated `not_found`
 * for stale-link safety.
 */
export interface ListGoldenQuestionRunResultsEnvelope {
  readonly status: "ok" | "not_found";
  readonly runId: number;
  readonly results?: ReadonlyArray<GoldenQuestionResultListRow>;
}

/**
 * `getQuestionDetail` envelope (T-D.5.δ). Includes the heavy
 * `expectedPaths` JSON the T-D.5.α list view omits. Discriminated
 * `not_found` for stale-link safety.
 */
export interface GetGoldenQuestionDetailEnvelope {
  readonly status: "ok" | "not_found";
  readonly questionId: number;
  readonly question?: GoldenQuestionDetail;
}

// ============================================================================
// Router
// ============================================================================

export const goldenQuestionsRouter = router({
  /**
   * Enumerate seeded golden-question suites with active flag +
   * question count. Drives the operator dashboard's "browse
   * golden-question suites" picker. Parameterless — closed
   * taxonomy is owned by `seed-golden-questions.ts`.
   */
  listSuites: adminProcedure.query(
    async (): Promise<ListGoldenQuestionSuitesEnvelope> => {
      const store = createGoldenQuestionsReadStore();
      const suites = await store.listSuites();
      return { suites };
    },
  ),

  /**
   * Questions within one suite, looked up by `suiteKey`. Discriminated
   * envelope so stale dashboard links don't throw.
   */
  listQuestionsInSuite: adminProcedure
    .input(z.object({ suiteKey: z.string().min(1).max(100) }))
    .query(
      async ({
        input,
      }): Promise<ListGoldenQuestionsInSuiteEnvelope> => {
        const store = createGoldenQuestionsReadStore();
        const questions = await store.listQuestionsInSuite(input.suiteKey);
        if (questions === null) {
          return { status: "not_found", suiteKey: input.suiteKey };
        }
        return { status: "ok", suiteKey: input.suiteKey, questions };
      },
    ),

  /**
   * Recent golden-question evaluation runs (T-D.5.γ), newest-first
   * by createdAt. Optional `suiteKey` filter for per-suite drill-in.
   * Empty list = no runs persisted yet (T-D.5.β write-store +
   * T-D.5.δ caller wiring required before this returns anything).
   */
  listRecentRuns: adminProcedure
    .input(
      z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(GOLDEN_QUESTIONS_LIST_RUNS_ABSOLUTE_LIMIT)
          .default(GOLDEN_QUESTIONS_LIST_RUNS_DEFAULT_LIMIT),
        suiteKey: z.string().min(1).max(100).optional(),
      }),
    )
    .query(
      async ({ input }): Promise<ListGoldenQuestionRecentRunsEnvelope> => {
        const store = createGoldenQuestionsReadStore();
        const runs = await store.listRecentRuns({
          limit: input.limit,
          ...(input.suiteKey !== undefined ? { suiteKey: input.suiteKey } : {}),
        });
        return { runs };
      },
    ),

  /**
   * Per-run aggregate stats (T-D.5.γ) — pass/fail counts + total
   * + status + timestamps. Discriminated `not_found` envelope so
   * stale dashboard links don't throw.
   */
  getRunStats: adminProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .query(
      async ({ input }): Promise<GetGoldenQuestionRunStatsEnvelope> => {
        const store = createGoldenQuestionsReadStore();
        const stats = await store.getRunStats(input.runId);
        if (stats === null) return { status: "not_found" };
        return { status: "ok", stats };
      },
    ),

  /**
   * Per-question results for one run (T-D.5.γ). Joined with
   * `agsGoldenQuestions` for questionKey + question text — drives
   * the per-run drill-in panel showing each question's result +
   * failure reason. Discriminated `not_found` for stale-link safety.
   */
  listRunResults: adminProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .query(
      async ({
        input,
      }): Promise<ListGoldenQuestionRunResultsEnvelope> => {
        const store = createGoldenQuestionsReadStore();
        const results = await store.listRunResults(input.runId);
        if (results === null) {
          return { status: "not_found", runId: input.runId };
        }
        return { status: "ok", runId: input.runId, results };
      },
    ),

  /**
   * Full per-question detail (T-D.5.δ). Returns the heavy
   * `expectedPaths` JSON that the T-D.5.α list view omits — useful
   * for triaging why a question failed (compare expected paths to
   * actual engine output). Discriminated `not_found` envelope for
   * stale-link safety. Same pattern as
   * semanticEnrichment.getProposalDetail (T-D.3.ε).
   */
  getQuestionDetail: adminProcedure
    .input(z.object({ questionId: z.number().int().positive() }))
    .query(
      async ({ input }): Promise<GetGoldenQuestionDetailEnvelope> => {
        const store = createGoldenQuestionsReadStore();
        const question = await store.getQuestionDetail(input.questionId);
        if (question === null) {
          return { status: "not_found", questionId: input.questionId };
        }
        return { status: "ok", questionId: input.questionId, question };
      },
    ),
});

export type GoldenQuestionsRouter = typeof goldenQuestionsRouter;
