/**
 * PS Module — DB-Backed Matrix Classification Engine
 *
 * Replaces the hardcoded rule-based classifier. Loads active matrix
 * version from DB, evaluates user answers against matrix cells,
 * and ranks scopes by weighted score.
 *
 * Fallback: If no active matrix version exists, returns null so
 * the caller can fall back to the legacy classifier.
 */

import * as repo from "./ps.repository";
import type { LoadedMatrix, MatrixEvaluationResult } from "./ps.types";

// ── Load Matrix ──────────────────────────────────────────────────────

/**
 * Load the active matrix version with all scopes, questions, and cells
 * in a single batch (3 queries, no N+1).
 */
export async function loadActiveMatrix(workspaceId: number): Promise<LoadedMatrix | null> {
  const version = await repo.getActiveMatrixVersion(workspaceId);
  if (!version) return null;

  const [scopes, questions, cells] = await Promise.all([
    repo.listScopesByVersion(version.id),
    repo.listQuestionsByVersion(version.id),
    repo.listCellsByVersion(version.id),
  ]);

  return {
    versionId: version.id,
    version: version.version,
    scopes: scopes.map((s) => ({
      id: s.id,
      code: s.code,
      label: s.label,
      family: s.family,
    })),
    questions: questions.map((q) => ({
      id: q.id,
      code: q.code,
      label: q.label,
      description: q.description,
    })),
    cells: cells.map((c) => ({
      questionId: c.questionId,
      scopeId: c.scopeId,
      weight: c.weight,
    })),
  };
}

// ── Evaluate Matrix ──────────────────────────────────────────────────

/**
 * Evaluate user answers against the loaded matrix.
 *
 * score(scope) = SUM(weight) for each question where answer is truthy.
 *
 * Answer interpretation:
 * - boolean true → matched
 * - string (non-empty, not "false", not "0") → matched
 * - number > 0 → matched
 * - everything else → not matched
 */
export function evaluateMatrix(
  matrix: LoadedMatrix,
  answers: Record<string, boolean | string | number>,
): MatrixEvaluationResult {
  // Build lookup: questionCode → questionId
  const questionCodeToId = new Map<string, number>();
  for (const q of matrix.questions) {
    questionCodeToId.set(q.code, q.id);
  }

  // Build lookup: scopeId → scopeCode
  const scopeIdToCode = new Map<number, string>();
  for (const s of matrix.scopes) {
    scopeIdToCode.set(s.id, s.code);
  }

  // Determine which questions are "answered" (truthy)
  const matchedQuestionIds = new Set<number>();
  const matchedQuestionCodes: string[] = [];

  for (const [code, value] of Object.entries(answers)) {
    if (!isAnswerTruthy(value)) continue;
    const qId = questionCodeToId.get(code);
    if (qId !== undefined) {
      matchedQuestionIds.add(qId);
      matchedQuestionCodes.push(code);
    }
  }

  // Compute scores per scope
  const scores: Record<string, number> = {};
  for (const s of matrix.scopes) {
    scores[s.code] = 0;
  }

  for (const cell of matrix.cells) {
    if (!matchedQuestionIds.has(cell.questionId)) continue;
    const scopeCode = scopeIdToCode.get(cell.scopeId);
    if (scopeCode && scores[scopeCode] !== undefined) {
      scores[scopeCode] += cell.weight;
    }
  }

  // Rank scopes — highest score wins
  const ranked = rankScopes(scores);

  return {
    selectedScope: ranked.length > 0 ? ranked[0].code : "",
    scores,
    matchedQuestions: matchedQuestionCodes,
    matrixVersion: matrix.version,
  };
}

// ── Rank Scopes ──────────────────────────────────────────────────────

/**
 * Sort scopes by score descending. Deterministic tie-breaking
 * by alphabetical scope code.
 */
export function rankScopes(
  scores: Record<string, number>,
): Array<{ code: string; score: number }> {
  return Object.entries(scores)
    .map(([code, score]) => ({ code, score }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.code.localeCompare(b.code);
    });
}

// ── Helpers ──────────────────────────────────────────────────────────

function isAnswerTruthy(value: boolean | string | number): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    return lower !== "" && lower !== "false" && lower !== "0" && lower !== "no";
  }
  return false;
}
