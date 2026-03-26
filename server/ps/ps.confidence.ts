/**
 * PS Module — Confidence Engine
 *
 * Computes a confidence report for a matrix evaluation result.
 * No hard-coded logic — metrics are derived from the matrix data
 * and scoring distribution.
 *
 * Three pillars:
 * - Spread:       How differentiated are the scope scores?
 * - Completeness: What fraction of questions were answered?
 * - Ambiguity:    How close are the top 2 scores?
 *
 * Overall confidence = weighted composite of the three pillars.
 */

import type {
  LoadedMatrix,
  ConfidenceReport,
  ScopeScore,
} from "./ps.types";

/**
 * Compute confidence report for a matrix evaluation.
 *
 * @param matrix      - The full loaded matrix
 * @param answers     - User-provided answers keyed by question code
 * @param matchedIds  - Set of question IDs that were truthy
 * @param scores      - Final scope scores (code → score)
 * @param ranking     - Ranked scope scores (index 0 = winner)
 */
export function computeConfidence(
  matrix: LoadedMatrix,
  answers: Record<string, boolean | string | number>,
  matchedIds: Set<number>,
  scores: Record<string, number>,
  ranking: ScopeScore[],
): ConfidenceReport {
  const completeness = computeCompleteness(matrix, matchedIds);
  const spread = computeSpread(scores, matrix);
  const ambiguity = computeAmbiguity(ranking, matrix);

  // Weighted composite: completeness 30%, spread 30%, (1-ambiguity) 40%
  const overall = clamp(
    0.30 * completeness + 0.30 * spread + 0.40 * (1 - ambiguity),
    0,
    1,
  );

  return {
    overall: round(overall, 4),
    spread: round(spread, 4),
    completeness: round(completeness, 4),
    ambiguity: round(ambiguity, 4),
  };
}

// ── Completeness ────────────────────────────────────────────────────

/**
 * Fraction of active matrix questions that the user answered (truthy).
 * 0 = no answers, 1 = all questions answered.
 */
function computeCompleteness(
  matrix: LoadedMatrix,
  matchedIds: Set<number>,
): number {
  if (matrix.questions.length === 0) return 0;
  return matchedIds.size / matrix.questions.length;
}

// ── Spread ──────────────────────────────────────────────────────────

/**
 * Normalised standard deviation of scope scores.
 * High spread means the scores are well-differentiated (good).
 * Low spread means all scopes scored similarly (ambiguous).
 *
 * Normalised against the maximum possible single-scope score
 * to produce a 0..1 range.
 */
function computeSpread(
  scores: Record<string, number>,
  matrix: LoadedMatrix,
): number {
  const vals = Object.values(scores);
  if (vals.length <= 1) return 1; // Single scope = perfect certainty

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length;
  const stddev = Math.sqrt(variance);

  // Max possible score for any single scope: sum of all cell weights
  // (if every question were answered truthy)
  const maxPossible = computeMaxPossibleScore(matrix);
  if (maxPossible === 0) return 0;

  // Normalise: stddev / maxPossible, clamped to 0..1
  return clamp(stddev / maxPossible, 0, 1);
}

// ── Ambiguity ───────────────────────────────────────────────────────

/**
 * How close the top 2 scores are, normalised to 0..1.
 * 0 = clear winner (large gap), 1 = tied (no gap).
 *
 * Uses the margin between #1 and #2 relative to the maximum possible
 * score to produce a stable metric.
 */
function computeAmbiguity(
  ranking: ScopeScore[],
  matrix: LoadedMatrix,
): number {
  if (ranking.length <= 1) return 0; // Single scope = no ambiguity

  const score1 = ranking[0].score;
  const score2 = ranking[1].score;
  const margin = score1 - score2;

  // If both are zero, result is maximally ambiguous
  if (score1 === 0 && score2 === 0) return 1;

  // Normalise against the max possible score
  const maxPossible = computeMaxPossibleScore(matrix);
  if (maxPossible === 0) return 1;

  // ambiguity = 1 - (normalised margin)
  return clamp(1 - margin / maxPossible, 0, 1);
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Compute the maximum possible score any single scope could achieve
 * (if every question were answered truthy).
 *
 * max = MAX over scopes of SUM(cell.weight) for that scope.
 */
function computeMaxPossibleScore(matrix: LoadedMatrix): number {
  const byScope = new Map<number, number>();
  for (const cell of matrix.cells) {
    const cur = byScope.get(cell.scopeId) ?? 0;
    byScope.set(cell.scopeId, cur + cell.weight);
  }
  let max = 0;
  for (const total of byScope.values()) {
    if (total > max) max = total;
  }
  return max;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
