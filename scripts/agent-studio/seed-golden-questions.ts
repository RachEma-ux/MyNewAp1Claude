/**
 * Native Graph Workspace MVP 4 — Phase 22 / 23.
 *
 * Operator entry point: seed the default Golden Question suite into
 * ASDB. Mirrors the shape referenced by the evaluation runbook at
 *   docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md
 *
 * Uses the existing pure-functional helper
 * `seedGoldenQuestionSuites` from
 *   server/agent-studio/services/graph-skill/seed-golden-questions.ts
 * by passing real ASDB upsert closures via Drizzle.
 *
 * Idempotent. Outputs a JSON result line to stdout for the operator
 * (and downstream workflow_dispatch parsing).
 *
 * Usage:
 *   DATABASE_URL_ASDB=postgres://... pnpm tsx scripts/agent-studio/seed-golden-questions.ts
 */

import { eq, and } from "drizzle-orm";

import {
  DEFAULT_GOLDEN_QUESTION_SUITES,
  seedGoldenQuestionSuites,
  type GoldenQuestionSeed,
} from "../../server/agent-studio/services/graph-skill/seed-golden-questions.js";
import { getAsDb } from "../../server/agent-studio/db/connection.js";
import {
  agsGoldenQuestionSuites,
  agsGoldenQuestions,
} from "../../drizzle/tables/agent-studio-graph-quality.js";

async function main() {
  const db = getAsDb();
  if (!db) {
    console.error(JSON.stringify({
      ok: false,
      error: "ASDB not configured. Set DATABASE_URL_ASDB and retry.",
    }));
    process.exit(2);
  }

  const result = await seedGoldenQuestionSuites(
    async (suite) => {
      const existing = await db
        .select({ id: agsGoldenQuestionSuites.id })
        .from(agsGoldenQuestionSuites)
        .where(eq(agsGoldenQuestionSuites.suiteKey, suite.suiteKey))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(agsGoldenQuestionSuites)
          .set({ name: suite.name, description: suite.description })
          .where(eq(agsGoldenQuestionSuites.id, existing[0].id));
        return { id: existing[0].id, status: "updated" as const };
      }
      const inserted = await db
        .insert(agsGoldenQuestionSuites)
        .values({
          suiteKey: suite.suiteKey,
          name: suite.name,
          description: suite.description,
        })
        .returning({ id: agsGoldenQuestionSuites.id });
      return { id: inserted[0].id, status: "inserted" as const };
    },
    async (suiteId, q: Omit<GoldenQuestionSeed, "suiteKey">) => {
      const existing = await db
        .select({ id: agsGoldenQuestions.id })
        .from(agsGoldenQuestions)
        .where(
          and(
            eq(agsGoldenQuestions.suiteId, suiteId),
            eq(agsGoldenQuestions.questionKey, q.questionKey),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(agsGoldenQuestions)
          .set({
            question: q.question,
            expectedAnswerPattern: q.expectedAnswerPattern,
            expectedPaths: q.expectedPaths ?? null,
            minimumCitationCount: q.minimumCitationCount,
          })
          .where(eq(agsGoldenQuestions.id, existing[0].id));
        return "updated";
      }
      await db.insert(agsGoldenQuestions).values({
        suiteId,
        questionKey: q.questionKey,
        question: q.question,
        expectedAnswerPattern: q.expectedAnswerPattern,
        expectedPaths: q.expectedPaths ?? null,
        minimumCitationCount: q.minimumCitationCount,
      });
      return "inserted";
    },
  );

  console.log(JSON.stringify({
    ok: result.errors.length === 0,
    suiteCount: DEFAULT_GOLDEN_QUESTION_SUITES.length,
    ...result,
  }));
  process.exit(result.errors.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({
    ok: false,
    error: e instanceof Error ? e.message : String(e),
  }));
  process.exit(2);
});
