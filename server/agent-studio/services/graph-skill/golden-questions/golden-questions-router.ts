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
  type GoldenQuestionListRow,
  type GoldenQuestionSuiteListRow,
} from "./golden-questions-read-store.js";

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
});

export type GoldenQuestionsRouter = typeof goldenQuestionsRouter;
