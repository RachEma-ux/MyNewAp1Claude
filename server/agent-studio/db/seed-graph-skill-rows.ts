/**
 * Phase 12.5 / 22 / 23 — boot-time row seeds for the Graph Skill registry.
 *
 * Wires the pure seed-data modules under
 * `server/agent-studio/services/graph-skill/` to Drizzle-backed upserts
 * against ASDB. Idempotent: every call re-upserts by natural key
 * (`template_key` / `skill_key` / `suite_key` + `question_key`).
 *
 * Boot call site: server/agent-studio/boot.ts via `bootAgentStudio()`,
 * after `seedAsDb()` has provisioned the underlying tables.
 *
 * ADRs:
 *   docs/architecture/agent-studio-cypher-query-template-system.md
 *   docs/architecture/agent-studio-graph-skill-packs.md
 *   docs/architecture/agent-studio-native-graph-workspace-user-feedback.md
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "./connection";
import {
  agsGraphSkillPacks,
  agsQueryTemplates,
} from "../../../drizzle/tables/agent-studio-graph-skill";
import {
  agsGoldenQuestionSuites,
  agsGoldenQuestions,
} from "../../../drizzle/tables/agent-studio-graph-quality";
import {
  seedCypherTemplates,
  type CypherTemplateSeed,
} from "../services/graph-skill/seed-cypher-templates";
import {
  seedGraphSkillPacks,
  type GraphSkillPackSeed,
} from "../services/graph-skill/seed-default-packs";
import {
  seedGoldenQuestionSuites,
  type GoldenQuestionSeed,
} from "../services/graph-skill/seed-golden-questions";

export interface GraphSkillRowSeedResult {
  cypherTemplates: { inserted: number; updated: number; failed: number };
  graphSkillPacks: { inserted: number; updated: number; failed: number };
  goldenQuestions: {
    suitesInserted: number;
    suitesUpdated: number;
    questionsInserted: number;
    questionsUpdated: number;
    failed: number;
  };
}

/**
 * Idempotent row seeder. Skips entirely (logs warning) if `getAsDb()`
 * returns null — boot of `seedAsDb()` already logged the missing pool.
 */
export async function seedGraphSkillRows(): Promise<GraphSkillRowSeedResult> {
  const result: GraphSkillRowSeedResult = {
    cypherTemplates: { inserted: 0, updated: 0, failed: 0 },
    graphSkillPacks: { inserted: 0, updated: 0, failed: 0 },
    goldenQuestions: {
      suitesInserted: 0,
      suitesUpdated: 0,
      questionsInserted: 0,
      questionsUpdated: 0,
      failed: 0,
    },
  };

  const db = getAsDb();
  if (!db) {
    console.warn("[ASDB] Graph Skill row seeds skipped — no asdb connection");
    return result;
  }

  // ── Cypher templates ────────────────────────────────────────────────────
  const cypherRes = await seedCypherTemplates(async (t: CypherTemplateSeed) => {
    const existing = await db
      .select({ id: agsQueryTemplates.id })
      .from(agsQueryTemplates)
      .where(eq(agsQueryTemplates.templateKey, t.templateKey))
      .limit(1);
    const row = {
      templateKey: t.templateKey,
      name: t.name,
      description: t.description,
      graphBackend: t.graphBackend,
      queryLanguage: t.queryLanguage,
      cypherBody: t.cypherBody,
      parameterSchema: t.parameterSchema as Record<string, unknown>,
      permissionFilterRequired: t.permissionFilterRequired,
      maxDepth: t.maxDepth,
      maxResults: t.maxResults,
      timeoutMs: t.timeoutMs,
      readOnly: t.readOnly,
      riskLevel: t.riskLevel,
      allowedRoles: t.allowedRoles,
      updatedAt: new Date(),
    };
    if (existing.length > 0) {
      await db
        .update(agsQueryTemplates)
        .set(row)
        .where(eq(agsQueryTemplates.id, existing[0].id));
      return "updated" as const;
    }
    await db.insert(agsQueryTemplates).values(row);
    return "inserted" as const;
  });
  result.cypherTemplates.inserted = cypherRes.inserted;
  result.cypherTemplates.updated = cypherRes.updated;
  result.cypherTemplates.failed = cypherRes.errors.length;
  for (const err of cypherRes.errors) {
    console.warn(`[ASDB] cypher template ${err.templateKey}: ${err.error}`);
  }

  // ── Graph Skill Packs ───────────────────────────────────────────────────
  const packRes = await seedGraphSkillPacks(async (p: GraphSkillPackSeed) => {
    const existing = await db
      .select({ id: agsGraphSkillPacks.id })
      .from(agsGraphSkillPacks)
      .where(eq(agsGraphSkillPacks.skillKey, p.skillKey))
      .limit(1);
    const row = {
      skillKey: p.skillKey,
      name: p.name,
      description: p.description,
      domain: p.domain,
      supportedNodeTypeKeys: p.supportedNodeTypeKeys,
      supportedEdgeTypeKeys: p.supportedEdgeTypeKeys,
      riskLevel: p.riskLevel,
      approvalRequired: p.approvalRequired,
      active: true,
      updatedAt: new Date(),
    };
    if (existing.length > 0) {
      await db
        .update(agsGraphSkillPacks)
        .set(row)
        .where(eq(agsGraphSkillPacks.id, existing[0].id));
      return "updated" as const;
    }
    await db.insert(agsGraphSkillPacks).values(row);
    return "inserted" as const;
  });
  result.graphSkillPacks.inserted = packRes.inserted;
  result.graphSkillPacks.updated = packRes.updated;
  result.graphSkillPacks.failed = packRes.errors.length;
  for (const err of packRes.errors) {
    console.warn(`[ASDB] graph skill pack ${err.skillKey}: ${err.error}`);
  }

  // ── Golden question suites + questions ──────────────────────────────────
  const goldenRes = await seedGoldenQuestionSuites(
    async (suite) => {
      const existing = await db
        .select({ id: agsGoldenQuestionSuites.id })
        .from(agsGoldenQuestionSuites)
        .where(eq(agsGoldenQuestionSuites.suiteKey, suite.suiteKey))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(agsGoldenQuestionSuites)
          .set({
            name: suite.name,
            description: suite.description,
          })
          .where(eq(agsGoldenQuestionSuites.id, existing[0].id));
        return { id: existing[0].id, status: "updated" };
      }
      const inserted = await db
        .insert(agsGoldenQuestionSuites)
        .values({
          suiteKey: suite.suiteKey,
          name: suite.name,
          description: suite.description,
        })
        .returning({ id: agsGoldenQuestionSuites.id });
      return { id: inserted[0].id, status: "inserted" };
    },
    async (suiteId: number, q: Omit<GoldenQuestionSeed, "suiteKey">) => {
      const existing = await db
        .select({ id: agsGoldenQuestions.id })
        .from(agsGoldenQuestions)
        .where(eq(agsGoldenQuestions.questionKey, q.questionKey))
        .limit(1);
      const row = {
        suiteId,
        questionKey: q.questionKey,
        question: q.question,
        expectedAnswerPattern: q.expectedAnswerPattern,
        expectedPaths: q.expectedPaths as Record<string, unknown> | null,
        minimumCitationCount: q.minimumCitationCount,
      };
      if (existing.length > 0) {
        await db
          .update(agsGoldenQuestions)
          .set(row)
          .where(eq(agsGoldenQuestions.id, existing[0].id));
        return "updated" as const;
      }
      await db.insert(agsGoldenQuestions).values(row);
      return "inserted" as const;
    },
  );
  result.goldenQuestions.suitesInserted = goldenRes.suitesInserted;
  result.goldenQuestions.suitesUpdated = goldenRes.suitesUpdated;
  result.goldenQuestions.questionsInserted = goldenRes.questionsInserted;
  result.goldenQuestions.questionsUpdated = goldenRes.questionsUpdated;
  result.goldenQuestions.failed = goldenRes.errors.length;
  for (const err of goldenRes.errors) {
    console.warn(`[ASDB] golden question ${err.ref}: ${err.error}`);
  }

  return result;
}
