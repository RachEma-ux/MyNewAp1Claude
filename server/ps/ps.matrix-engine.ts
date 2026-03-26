/**
 * PS Module — DB-Backed Matrix Classification Engine
 *
 * Loads active matrix version from DB (scopes, questions, cells,
 * dimensions, values), evaluates user answers against matrix cells,
 * ranks scopes by weighted score, and produces explainability +
 * confidence reports.
 *
 * Zero hard-coded logic — everything is DB-driven.
 * Deterministic results with alphabetical tie-breaking.
 */

import * as repo from "./ps.repository";
import { computeExplainability } from "./ps.explainability";
import { computeConfidence } from "./ps.confidence";
import type {
  LoadedMatrix,
  MatrixEvaluationResult,
  EnrichedMatrixResult,
  ScopeScore,
} from "./ps.types";

// ── Load Matrix ──────────────────────────────────────────────────────

/**
 * Load the active matrix version with all scopes, questions, cells,
 * dimensions, and dimension values in a single batch.
 */
export async function loadActiveMatrix(): Promise<LoadedMatrix | null> {
  const version = await repo.getActiveMatrixVersion();
  if (!version) return null;

  const [scopes, questions, cells, dimensions] = await Promise.all([
    repo.listScopesByVersion(version.id),
    repo.listQuestionsByVersion(version.id),
    repo.listCellsByVersion(version.id),
    repo.listDimensionsByVersion(version.id),
  ]);

  // Load dimension values in parallel
  const dimensionValues = await Promise.all(
    dimensions.map((dim) => repo.listDimensionValues(dim.id)),
  );

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
    dimensions: dimensions.map((dim, i) => ({
      id: dim.id,
      dimensionKey: dim.dimensionKey,
      dimensionLabel: dim.dimensionLabel,
      values: dimensionValues[i].map((v) => ({
        id: v.id,
        valueKey: v.valueKey,
        valueLabel: v.valueLabel,
      })),
    })),
  };
}

// ── Evaluate Matrix (basic — backward-compatible) ───────────────────

/**
 * Basic evaluation: score per scope, selected scope, matched questions.
 * Kept for backward compatibility with existing callers.
 */
export function evaluateMatrix(
  matrix: LoadedMatrix,
  answers: Record<string, boolean | string | number>,
): MatrixEvaluationResult {
  const { matchedQuestionIds, matchedQuestionCodes, scores } = computeScores(matrix, answers);

  const ranked = rankScopes(scores);

  return {
    selectedScope: ranked.length > 0 ? ranked[0].code : "",
    scores,
    matchedQuestions: matchedQuestionCodes,
    matrixVersion: matrix.version,
  };
}

// ── Evaluate Matrix (enriched — with explainability + confidence) ────

/**
 * Full evaluation: scores, ranking, top 3, explainability, confidence.
 * This is the primary entry point for the classification API.
 */
export function evaluateMatrixEnriched(
  matrix: LoadedMatrix,
  answers: Record<string, boolean | string | number>,
): EnrichedMatrixResult {
  const { matchedQuestionIds, matchedQuestionCodes, scores } = computeScores(matrix, answers);

  const rankedRaw = rankScopes(scores);

  // Build lookup maps for labels
  const scopeIdToLabel = new Map<number, string>();
  const scopeCodeToLabel = new Map<string, string>();
  for (const s of matrix.scopes) {
    scopeIdToLabel.set(s.id, s.label);
    scopeCodeToLabel.set(s.code, s.label);
  }

  const ranking: ScopeScore[] = rankedRaw.map((r, i) => ({
    code: r.code,
    label: scopeCodeToLabel.get(r.code) ?? r.code,
    score: r.score,
    rank: i + 1,
  }));

  const top3 = ranking.slice(0, 3);

  const selectedScope = ranking.length > 0 ? ranking[0].code : "";
  const selectedScopeLabel = selectedScope ? (scopeCodeToLabel.get(selectedScope) ?? selectedScope) : "";

  const explainability = computeExplainability(
    matrix,
    answers,
    matchedQuestionIds,
    scores,
    ranking,
  );

  const confidence = computeConfidence(
    matrix,
    answers,
    matchedQuestionIds,
    scores,
    ranking,
  );

  return {
    selectedScope,
    selectedScopeLabel,
    top3,
    ranking,
    scores,
    matchedQuestions: matchedQuestionCodes,
    totalQuestions: matrix.questions.length,
    matrixVersion: matrix.version,
    explainability,
    confidence,
  };
}

// ── Compute Scores ──────────────────────────────────────────────────

/**
 * Core scoring logic: for each truthy answer, accumulate cell weight
 * into the corresponding scope. All logic DB-driven.
 */
function computeScores(
  matrix: LoadedMatrix,
  answers: Record<string, boolean | string | number>,
): {
  matchedQuestionIds: Set<number>;
  matchedQuestionCodes: string[];
  scores: Record<string, number>;
} {
  // Build lookup: questionCode → question
  const questionByCode = new Map<string, { id: number; code: string }>();
  for (const q of matrix.questions) {
    questionByCode.set(q.code, q);
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
    const q = questionByCode.get(code);
    if (q) {
      matchedQuestionIds.add(q.id);
      matchedQuestionCodes.push(code);
    }
  }

  // Initialise scores for all scopes to zero
  const scores: Record<string, number> = {};
  for (const s of matrix.scopes) {
    scores[s.code] = 0;
  }

  // Accumulate weights from cells matching truthy answers
  for (const cell of matrix.cells) {
    if (!matchedQuestionIds.has(cell.questionId)) continue;
    const scopeCode = scopeIdToCode.get(cell.scopeId);
    if (scopeCode && scores[scopeCode] !== undefined) {
      scores[scopeCode] += cell.weight;
    }
  }

  return { matchedQuestionIds, matchedQuestionCodes, scores };
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

// ── Answer Truthiness ────────────────────────────────────────────────

/**
 * Interpret answer value:
 * - boolean true → matched
 * - string (non-empty, not "false"/"0"/"no") → matched
 * - number > 0 → matched
 * - everything else → not matched
 */
export function isAnswerTruthy(value: boolean | string | number): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    return lower !== "" && lower !== "false" && lower !== "0" && lower !== "no";
  }
  return false;
}
