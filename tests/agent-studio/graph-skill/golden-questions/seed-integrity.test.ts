// Native Graph Workspace MVP 4 — Phase 22/23.
//
// CI-safe static integrity tests for the Golden Question seed.
//
// Asserts that the default suite seed in
// `server/agent-studio/services/graph-skill/seed-golden-questions.ts`
// is well-formed, has no duplicate identifiers, and every
// `expectedPaths.{skillPackKey,templateKey}` resolves to a real
// skill pack or Cypher template in the sibling seed files. The
// upsert helper is also exercised against stub functions to prove
// the seed parses and walks without thrown errors.
//
// These tests do NOT touch Postgres / Neo4j / OpenRouter. They
// guard the seed-to-registry contract that Graph Agent Lite
// eligibility (Phase 13) depends on.
//
// Linked runbook:
//   docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md

import { describe, it, expect } from "vitest";

import {
  DEFAULT_GOLDEN_QUESTION_SUITES,
  seedGoldenQuestionSuites,
  type GoldenQuestionSeed,
} from "../../../../server/agent-studio/services/graph-skill/seed-golden-questions.js";
import { DEFAULT_GRAPH_SKILL_PACKS } from "../../../../server/agent-studio/services/graph-skill/seed-default-packs.js";
import { DEFAULT_CYPHER_TEMPLATES } from "../../../../server/agent-studio/services/graph-skill/seed-cypher-templates.js";

describe("Golden Question seed — static integrity", () => {
  it("exports at least one suite", () => {
    expect(Array.isArray(DEFAULT_GOLDEN_QUESTION_SUITES)).toBe(true);
    expect(DEFAULT_GOLDEN_QUESTION_SUITES.length).toBeGreaterThan(0);
  });

  it("every suite has the required top-level fields", () => {
    for (const suite of DEFAULT_GOLDEN_QUESTION_SUITES) {
      expect(suite.suiteKey).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(typeof suite.name).toBe("string");
      expect(suite.name.length).toBeGreaterThan(0);
      expect(typeof suite.description).toBe("string");
      expect(suite.description.length).toBeGreaterThan(0);
      expect(Array.isArray(suite.questions)).toBe(true);
      expect(suite.questions.length).toBeGreaterThan(0);
    }
  });

  it("every question has the required fields", () => {
    for (const suite of DEFAULT_GOLDEN_QUESTION_SUITES) {
      for (const q of suite.questions) {
        expect(q.questionKey).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(typeof q.question).toBe("string");
        expect(q.question.length).toBeGreaterThan(0);
        expect(typeof q.minimumCitationCount).toBe("number");
        expect(q.minimumCitationCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("has no duplicate suiteKey values", () => {
    const seen = new Set<string>();
    for (const suite of DEFAULT_GOLDEN_QUESTION_SUITES) {
      expect(seen.has(suite.suiteKey)).toBe(false);
      seen.add(suite.suiteKey);
    }
  });

  it("has no duplicate questionKey values within a suite", () => {
    for (const suite of DEFAULT_GOLDEN_QUESTION_SUITES) {
      const seen = new Set<string>();
      for (const q of suite.questions) {
        expect(
          seen.has(q.questionKey),
        ).toBe(false);
        seen.add(q.questionKey);
      }
    }
  });

  it("every expectedPaths.skillPackKey resolves to a default skill pack", () => {
    const validSkillKeys = new Set(
      DEFAULT_GRAPH_SKILL_PACKS.map((p) => p.skillKey),
    );
    for (const suite of DEFAULT_GOLDEN_QUESTION_SUITES) {
      for (const q of suite.questions) {
        const skillPackKey = q.expectedPaths?.skillPackKey;
        if (skillPackKey) {
          expect(
            validSkillKeys.has(skillPackKey),
          ).toBe(true);
        }
      }
    }
  });

  it("every expectedPaths.templateKey resolves to a default Cypher template", () => {
    const validTemplateKeys = new Set(
      DEFAULT_CYPHER_TEMPLATES.map((t) => t.templateKey),
    );
    for (const suite of DEFAULT_GOLDEN_QUESTION_SUITES) {
      for (const q of suite.questions) {
        const templateKey = q.expectedPaths?.templateKey;
        if (templateKey) {
          expect(
            validTemplateKeys.has(templateKey),
          ).toBe(true);
        }
      }
    }
  });

  it("expectedAnswerPattern is either null or a non-empty string", () => {
    for (const suite of DEFAULT_GOLDEN_QUESTION_SUITES) {
      for (const q of suite.questions) {
        if (q.expectedAnswerPattern !== null) {
          expect(typeof q.expectedAnswerPattern).toBe("string");
          expect((q.expectedAnswerPattern as string).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("seedGoldenQuestionSuites walks every suite + question through stub upserts", async () => {
    const suiteCalls: string[] = [];
    const questionCalls: Array<{ suiteId: number; q: Omit<GoldenQuestionSeed, "suiteKey"> }> = [];
    let nextId = 0;

    const result = await seedGoldenQuestionSuites(
      async (suite) => {
        suiteCalls.push(suite.suiteKey);
        nextId += 1;
        return { id: nextId, status: "inserted" };
      },
      async (suiteId, q) => {
        questionCalls.push({ suiteId, q });
        return "inserted";
      },
    );

    const totalSuites = DEFAULT_GOLDEN_QUESTION_SUITES.length;
    const totalQuestions = DEFAULT_GOLDEN_QUESTION_SUITES.reduce(
      (sum, s) => sum + s.questions.length,
      0,
    );

    expect(suiteCalls).toHaveLength(totalSuites);
    expect(questionCalls).toHaveLength(totalQuestions);
    expect(result.suitesInserted).toBe(totalSuites);
    expect(result.questionsInserted).toBe(totalQuestions);
    expect(result.errors).toEqual([]);
  });

  it("upsert helper surfaces per-question errors without aborting", async () => {
    const result = await seedGoldenQuestionSuites(
      async (_suite) => ({ id: 1, status: "inserted" }),
      async (_id, q) => {
        if (q.questionKey === "vault_overview") {
          throw new Error("simulated upsert failure");
        }
        return "inserted";
      },
    );

    const failingRef = result.errors.find((e) =>
      e.ref.endsWith("/vault_overview"),
    );
    expect(failingRef).toBeDefined();
    expect(failingRef?.error).toMatch(/simulated upsert failure/);

    const totalQuestions = DEFAULT_GOLDEN_QUESTION_SUITES.reduce(
      (sum, s) => sum + s.questions.length,
      0,
    );
    expect(result.questionsInserted + result.errors.length).toBe(totalQuestions);
  });
});
