/**
 * Phase 12.5 / 22 / 23 — seed invariants.
 *
 * Verifies the default seed data is well-formed and consistent.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_CYPHER_TEMPLATES,
  seedCypherTemplates,
  type CypherTemplateSeed,
} from "../../server/agent-studio/services/graph-skill/seed-cypher-templates.js";
import {
  DEFAULT_GRAPH_SKILL_PACKS,
  seedGraphSkillPacks,
} from "../../server/agent-studio/services/graph-skill/seed-default-packs.js";
import {
  DEFAULT_GOLDEN_QUESTION_SUITES,
  seedGoldenQuestionSuites,
} from "../../server/agent-studio/services/graph-skill/seed-golden-questions.js";

const FORBIDDEN_TOKENS = ["CREATE", "MERGE", "SET", "DELETE", "DETACH", "REMOVE", "DROP", "LOAD CSV"];

describe("DEFAULT_CYPHER_TEMPLATES", () => {
  it("includes all 16 default categories", () => {
    expect(DEFAULT_CYPHER_TEMPLATES.length).toBe(16);
  });

  it("template keys are unique", () => {
    const keys = DEFAULT_CYPHER_TEMPLATES.map((t) => t.templateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every template is read_only=true", () => {
    for (const t of DEFAULT_CYPHER_TEMPLATES) {
      expect(t.readOnly, `${t.templateKey} must be read_only`).toBe(true);
    }
  });

  it("every template requires permission filter", () => {
    for (const t of DEFAULT_CYPHER_TEMPLATES) {
      expect(t.permissionFilterRequired, `${t.templateKey} must require permission filter`).toBe(true);
    }
  });

  it("no template contains a forbidden mutation token in cypher body", () => {
    for (const t of DEFAULT_CYPHER_TEMPLATES) {
      const upper = t.cypherBody.toUpperCase();
      for (const tok of FORBIDDEN_TOKENS) {
        const re = new RegExp(`\\b${tok.replace(/\s+/g, "\\s+")}\\b`);
        expect(re.test(upper), `${t.templateKey} cypher contains forbidden ${tok}`).toBe(false);
      }
    }
  });

  it("every template has a parameter schema", () => {
    for (const t of DEFAULT_CYPHER_TEMPLATES) {
      expect(Object.keys(t.parameterSchema).length, `${t.templateKey} must declare parameters`).toBeGreaterThan(0);
    }
  });

  it("high-risk templates restrict to specific roles", () => {
    for (const t of DEFAULT_CYPHER_TEMPLATES) {
      if (t.riskLevel === "high") {
        expect(t.allowedRoles, `high-risk template ${t.templateKey} must restrict allowedRoles`).not.toBeNull();
        expect(t.allowedRoles!.length).toBeGreaterThan(0);
      }
    }
  });

  it("seedCypherTemplates produces an inserted=16 result on first run", async () => {
    let calls = 0;
    const result = await seedCypherTemplates(async (_t: CypherTemplateSeed) => {
      calls++;
      return "inserted";
    });
    expect(result.inserted).toBe(16);
    expect(result.updated).toBe(0);
    expect(result.errors).toEqual([]);
    expect(calls).toBe(16);
  });
});

describe("DEFAULT_GRAPH_SKILL_PACKS", () => {
  it("includes 7 default packs", () => {
    expect(DEFAULT_GRAPH_SKILL_PACKS.length).toBe(7);
  });

  it("pack keys are unique", () => {
    const keys = DEFAULT_GRAPH_SKILL_PACKS.map((p) => p.skillKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every pack references templates that exist in DEFAULT_CYPHER_TEMPLATES", () => {
    const templateKeys = new Set(DEFAULT_CYPHER_TEMPLATES.map((t) => t.templateKey));
    for (const pack of DEFAULT_GRAPH_SKILL_PACKS) {
      for (const tk of pack.templateKeys) {
        expect(templateKeys.has(tk), `pack ${pack.skillKey} references unknown template ${tk}`).toBe(true);
      }
    }
  });

  it("high-risk packs require approval and restrict allowedRoles", () => {
    for (const p of DEFAULT_GRAPH_SKILL_PACKS) {
      if (p.riskLevel === "high") {
        expect(p.approvalRequired, `${p.skillKey} high-risk must require approval`).toBe(true);
        expect(p.allowedRoles, `${p.skillKey} high-risk must restrict roles`).not.toBeNull();
      }
    }
  });

  it("seedGraphSkillPacks emits inserted=7 on fresh run", async () => {
    const result = await seedGraphSkillPacks(async () => "inserted");
    expect(result.inserted).toBe(7);
    expect(result.errors).toEqual([]);
  });
});

describe("DEFAULT_GOLDEN_QUESTION_SUITES", () => {
  it("includes 4 suites", () => {
    expect(DEFAULT_GOLDEN_QUESTION_SUITES.length).toBe(4);
  });

  it("suite keys are unique", () => {
    const keys = DEFAULT_GOLDEN_QUESTION_SUITES.map((s) => s.suiteKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("each suite contains at least 2 questions", () => {
    for (const s of DEFAULT_GOLDEN_QUESTION_SUITES) {
      expect(s.questions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("question keys within a suite are unique", () => {
    for (const s of DEFAULT_GOLDEN_QUESTION_SUITES) {
      const keys = s.questions.map((q) => q.questionKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("expectedPaths.skillPackKey references DEFAULT_GRAPH_SKILL_PACKS", () => {
    const packKeys = new Set(DEFAULT_GRAPH_SKILL_PACKS.map((p) => p.skillKey));
    for (const s of DEFAULT_GOLDEN_QUESTION_SUITES) {
      for (const q of s.questions) {
        if (q.expectedPaths?.skillPackKey) {
          expect(packKeys.has(q.expectedPaths.skillPackKey), `${s.suiteKey}/${q.questionKey} unknown skillPackKey`).toBe(true);
        }
      }
    }
  });

  it("seedGoldenQuestionSuites emits suite + question counts on fresh run", async () => {
    let suiteId = 0;
    const result = await seedGoldenQuestionSuites(
      async () => ({ id: ++suiteId, status: "inserted" }),
      async () => "inserted",
    );
    expect(result.suitesInserted).toBe(4);
    const totalQuestions = DEFAULT_GOLDEN_QUESTION_SUITES.reduce((acc, s) => acc + s.questions.length, 0);
    expect(result.questionsInserted).toBe(totalQuestions);
    expect(result.errors).toEqual([]);
  });
});
