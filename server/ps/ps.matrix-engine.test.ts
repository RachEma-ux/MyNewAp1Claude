/**
 * PS Matrix Engine — Unit Tests
 *
 * Tests the core classification logic without DB dependencies.
 * Uses evaluateMatrix() directly with mock LoadedMatrix data.
 */

import { describe, it, expect } from "vitest";
import { evaluateMatrix, evaluateMatrixEnriched, rankScopes } from "./ps.matrix-engine";
import type { LoadedMatrix } from "./ps.types";

// ── Test Matrix Setup ────────────────────────────────────────────────

function buildTestMatrix(): LoadedMatrix {
  return {
    versionId: 1,
    version: "1.0.0",
    scopes: [
      { id: 1, code: "SOFTWARE_LIFECYCLE", label: "Software Lifecycle", family: "delivery" },
      { id: 2, code: "PROGRAM_MANAGEMENT", label: "Program Management", family: "governance" },
      { id: 3, code: "OPERATIONS_IMPROVEMENT", label: "Operations Improvement", family: "operations" },
    ],
    questions: [
      { id: 10, code: "Q_SDLC", label: "Does the project involve a software development lifecycle?", description: null },
      { id: 11, code: "Q_CI_CD", label: "Does the project require CI/CD pipelines?", description: null },
      { id: 12, code: "Q_AGILE", label: "Will the project use agile methodology?", description: null },
      { id: 13, code: "Q_PORTFOLIO", label: "Does this span multiple projects in a portfolio?", description: null },
      { id: 14, code: "Q_CROSS_PROJECT", label: "Is cross-project coordination required?", description: null },
      { id: 15, code: "Q_GOVERNANCE", label: "Are formal governance gates required?", description: null },
      { id: 16, code: "Q_PROCESS_OPT", label: "Is this focused on process optimization?", description: null },
      { id: 17, code: "Q_COST_REDUCE", label: "Is cost reduction the primary objective?", description: null },
    ],
    cells: [
      // Q_SDLC weights
      { questionId: 10, scopeId: 1, weight: 10 }, // SOFTWARE_LIFECYCLE
      { questionId: 10, scopeId: 2, weight: 2 },  // PROGRAM_MANAGEMENT
      { questionId: 10, scopeId: 3, weight: 0 },  // OPERATIONS_IMPROVEMENT

      // Q_CI_CD weights
      { questionId: 11, scopeId: 1, weight: 8 },
      { questionId: 11, scopeId: 2, weight: 1 },
      { questionId: 11, scopeId: 3, weight: 3 },

      // Q_AGILE weights
      { questionId: 12, scopeId: 1, weight: 5 },
      { questionId: 12, scopeId: 2, weight: 3 },
      { questionId: 12, scopeId: 3, weight: 1 },

      // Q_PORTFOLIO weights
      { questionId: 13, scopeId: 1, weight: 1 },
      { questionId: 13, scopeId: 2, weight: 10 },
      { questionId: 13, scopeId: 3, weight: 2 },

      // Q_CROSS_PROJECT weights
      { questionId: 14, scopeId: 1, weight: 2 },
      { questionId: 14, scopeId: 2, weight: 9 },
      { questionId: 14, scopeId: 3, weight: 1 },

      // Q_GOVERNANCE weights
      { questionId: 15, scopeId: 1, weight: 3 },
      { questionId: 15, scopeId: 2, weight: 8 },
      { questionId: 15, scopeId: 3, weight: 2 },

      // Q_PROCESS_OPT weights
      { questionId: 16, scopeId: 1, weight: 1 },
      { questionId: 16, scopeId: 2, weight: 2 },
      { questionId: 16, scopeId: 3, weight: 10 },

      // Q_COST_REDUCE weights
      { questionId: 17, scopeId: 1, weight: 0 },
      { questionId: 17, scopeId: 2, weight: 1 },
      { questionId: 17, scopeId: 3, weight: 9 },
    ],
    dimensions: [],
  };
}

// ── Test 1: Software profile → SOFTWARE_LIFECYCLE ────────────────────

describe("Matrix Engine - Test 1: Software Profile", () => {
  it("should select SOFTWARE_LIFECYCLE when answering software-related questions", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrix(matrix, {
      Q_SDLC: true,
      Q_CI_CD: true,
      Q_AGILE: true,
    });

    expect(result.selectedScope).toBe("SOFTWARE_LIFECYCLE");
    expect(result.scores["SOFTWARE_LIFECYCLE"]).toBe(10 + 8 + 5); // 23
    expect(result.scores["PROGRAM_MANAGEMENT"]).toBe(2 + 1 + 3); // 6
    expect(result.scores["OPERATIONS_IMPROVEMENT"]).toBe(0 + 3 + 1); // 4
    expect(result.matchedQuestions).toContain("Q_SDLC");
    expect(result.matchedQuestions).toContain("Q_CI_CD");
    expect(result.matchedQuestions).toContain("Q_AGILE");
    expect(result.matrixVersion).toBe("1.0.0");
  });
});

// ── Test 2: Program profile → PROGRAM_MANAGEMENT ─────────────────────

describe("Matrix Engine - Test 2: Program Profile", () => {
  it("should select PROGRAM_MANAGEMENT when answering program-related questions", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrix(matrix, {
      Q_PORTFOLIO: true,
      Q_CROSS_PROJECT: true,
      Q_GOVERNANCE: true,
    });

    expect(result.selectedScope).toBe("PROGRAM_MANAGEMENT");
    expect(result.scores["PROGRAM_MANAGEMENT"]).toBe(10 + 9 + 8); // 27
    expect(result.scores["SOFTWARE_LIFECYCLE"]).toBe(1 + 2 + 3); // 6
    expect(result.scores["OPERATIONS_IMPROVEMENT"]).toBe(2 + 1 + 2); // 5
    expect(result.matchedQuestions.length).toBe(3);
  });
});

// ── Test 3: Conflicting answers → highest score wins ─────────────────

describe("Matrix Engine - Test 3: Conflicting Answers", () => {
  it("should select scope with highest cumulative score", () => {
    const matrix = buildTestMatrix();

    // Answer one SW question and one PM question
    const result = evaluateMatrix(matrix, {
      Q_SDLC: true,     // SW=10, PM=2
      Q_PORTFOLIO: true, // SW=1, PM=10
    });

    // SW total = 10 + 1 = 11
    // PM total = 2 + 10 = 12
    expect(result.selectedScope).toBe("PROGRAM_MANAGEMENT");
    expect(result.scores["SOFTWARE_LIFECYCLE"]).toBe(11);
    expect(result.scores["PROGRAM_MANAGEMENT"]).toBe(12);
  });

  it("should break ties alphabetically", () => {
    // Create a matrix where two scopes get the same score
    const matrix: LoadedMatrix = {
      versionId: 1,
      version: "1.0.0",
      scopes: [
        { id: 1, code: "ALPHA", label: "Alpha", family: null },
        { id: 2, code: "BETA", label: "Beta", family: null },
      ],
      questions: [
        { id: 10, code: "Q1", label: "Question 1", description: null },
      ],
      cells: [
        { questionId: 10, scopeId: 1, weight: 5 },
        { questionId: 10, scopeId: 2, weight: 5 },
      ],
      dimensions: [],
    };

    const result = evaluateMatrix(matrix, { Q1: true });
    expect(result.selectedScope).toBe("ALPHA"); // alphabetical tie-break
    expect(result.scores["ALPHA"]).toBe(5);
    expect(result.scores["BETA"]).toBe(5);
  });
});

// ── Test 4: No answers → graceful handling ───────────────────────────

describe("Matrix Engine - Test 4: No Answers", () => {
  it("should handle empty answers gracefully", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrix(matrix, {});

    // All scores should be 0
    expect(result.scores["SOFTWARE_LIFECYCLE"]).toBe(0);
    expect(result.scores["PROGRAM_MANAGEMENT"]).toBe(0);
    expect(result.scores["OPERATIONS_IMPROVEMENT"]).toBe(0);
    expect(result.matchedQuestions).toEqual([]);
    // selectedScope should be deterministic (alphabetical when all 0)
    expect(result.selectedScope).toBe("OPERATIONS_IMPROVEMENT"); // O < P < S alphabetically
  });

  it("should handle all-false answers gracefully", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrix(matrix, {
      Q_SDLC: false,
      Q_CI_CD: false,
      Q_AGILE: false,
    });

    expect(result.scores["SOFTWARE_LIFECYCLE"]).toBe(0);
    expect(result.matchedQuestions).toEqual([]);
  });

  it("should handle unknown question codes", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrix(matrix, {
      UNKNOWN_Q: true,
      ANOTHER_UNKNOWN: true,
    });

    // Unknown codes should not affect scores
    expect(result.scores["SOFTWARE_LIFECYCLE"]).toBe(0);
    expect(result.matchedQuestions).toEqual([]);
  });
});

// ── rankScopes unit tests ────────────────────────────────────────────

describe("rankScopes", () => {
  it("should sort by score descending", () => {
    const result = rankScopes({ A: 5, B: 10, C: 3 });
    expect(result[0]).toEqual({ code: "B", score: 10 });
    expect(result[1]).toEqual({ code: "A", score: 5 });
    expect(result[2]).toEqual({ code: "C", score: 3 });
  });

  it("should break ties alphabetically", () => {
    const result = rankScopes({ Z: 5, A: 5, M: 5 });
    expect(result[0].code).toBe("A");
    expect(result[1].code).toBe("M");
    expect(result[2].code).toBe("Z");
  });

  it("should handle empty scores", () => {
    const result = rankScopes({});
    expect(result).toEqual([]);
  });
});

// ── Operations Improvement profile ───────────────────────────────────

describe("Matrix Engine - Operations Profile", () => {
  it("should select OPERATIONS_IMPROVEMENT for ops-related answers", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrix(matrix, {
      Q_PROCESS_OPT: true,
      Q_COST_REDUCE: true,
    });

    expect(result.selectedScope).toBe("OPERATIONS_IMPROVEMENT");
    expect(result.scores["OPERATIONS_IMPROVEMENT"]).toBe(10 + 9); // 19
    expect(result.matchedQuestions).toContain("Q_PROCESS_OPT");
    expect(result.matchedQuestions).toContain("Q_COST_REDUCE");
  });
});

// ── Enriched Evaluation Tests ─────────────────────────────────────────

describe("Matrix Engine - Enriched Evaluation", () => {
  it("should return top 3, ranking, explainability and confidence", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrixEnriched(matrix, {
      Q_SDLC: true,
      Q_CI_CD: true,
      Q_AGILE: true,
    });

    expect(result.selectedScope).toBe("SOFTWARE_LIFECYCLE");
    expect(result.selectedScopeLabel).toBe("Software Lifecycle");
    expect(result.top3.length).toBe(3);
    expect(result.top3[0].code).toBe("SOFTWARE_LIFECYCLE");
    expect(result.top3[0].rank).toBe(1);
    expect(result.top3[1].rank).toBe(2);
    expect(result.top3[2].rank).toBe(3);
    expect(result.ranking.length).toBe(3);
    expect(result.totalQuestions).toBe(8);
    expect(result.matchedQuestions.length).toBe(3);
  });

  it("should produce positive signals for the winner", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrixEnriched(matrix, {
      Q_SDLC: true,
      Q_CI_CD: true,
    });

    // Winner is SOFTWARE_LIFECYCLE with score 18
    expect(result.explainability.winnerCode).toBe("SOFTWARE_LIFECYCLE");
    expect(result.explainability.positiveSignals.length).toBeGreaterThan(0);
    // Q_SDLC has weight 10 for SOFTWARE_LIFECYCLE
    const sdlcSignal = result.explainability.positiveSignals.find(
      (s) => s.questionCode === "Q_SDLC",
    );
    expect(sdlcSignal).toBeDefined();
    expect(sdlcSignal!.weight).toBe(10);
  });

  it("should report winner margin correctly", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrixEnriched(matrix, {
      Q_SDLC: true,
      Q_CI_CD: true,
      Q_AGILE: true,
    });

    // SW=23, PM=6 → margin = 17
    expect(result.explainability.winnerMargin).toBe(17);
  });

  it("should produce confidence metrics in 0..1 range", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrixEnriched(matrix, {
      Q_SDLC: true,
      Q_CI_CD: true,
    });

    expect(result.confidence.overall).toBeGreaterThanOrEqual(0);
    expect(result.confidence.overall).toBeLessThanOrEqual(1);
    expect(result.confidence.spread).toBeGreaterThanOrEqual(0);
    expect(result.confidence.spread).toBeLessThanOrEqual(1);
    expect(result.confidence.completeness).toBeGreaterThanOrEqual(0);
    expect(result.confidence.completeness).toBeLessThanOrEqual(1);
    expect(result.confidence.ambiguity).toBeGreaterThanOrEqual(0);
    expect(result.confidence.ambiguity).toBeLessThanOrEqual(1);
  });

  it("should report completeness as fraction of answered questions", () => {
    const matrix = buildTestMatrix();
    // Answer 3 of 8 questions
    const result = evaluateMatrixEnriched(matrix, {
      Q_SDLC: true,
      Q_CI_CD: true,
      Q_AGILE: true,
    });

    expect(result.confidence.completeness).toBeCloseTo(3 / 8, 3);
  });

  it("should handle empty answers for enriched eval", () => {
    const matrix = buildTestMatrix();
    const result = evaluateMatrixEnriched(matrix, {});

    expect(result.confidence.completeness).toBe(0);
    expect(result.explainability.positiveSignals.length).toBe(0);
    expect(result.explainability.negativeSignals.length).toBe(0);
  });
});
