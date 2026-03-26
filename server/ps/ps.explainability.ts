/**
 * PS Module — Explainability Engine
 *
 * Analyses matrix evaluation results to produce human-readable
 * signal reports. No hard-coded logic — all driven by the loaded
 * matrix data.
 *
 * Positive signals: answered questions where the winner gained weight.
 * Negative signals: answered questions where a competitor gained more
 * weight than the winner.
 * Winner margin: score difference between #1 and #2.
 */

import { isAnswerTruthy } from "./ps.matrix-engine";
import type {
  LoadedMatrix,
  ExplainabilityReport,
  ExplainabilitySignal,
  ScopeScore,
} from "./ps.types";

/**
 * Compute explainability report for a matrix evaluation.
 *
 * @param matrix      - The full loaded matrix (scopes, questions, cells)
 * @param answers     - User-provided answers keyed by question code
 * @param matchedIds  - Set of question IDs that were truthy
 * @param scores      - Final scope scores (code → score)
 * @param ranking     - Ranked scope scores (index 0 = winner)
 */
export function computeExplainability(
  matrix: LoadedMatrix,
  answers: Record<string, boolean | string | number>,
  matchedIds: Set<number>,
  scores: Record<string, number>,
  ranking: ScopeScore[],
): ExplainabilityReport {
  if (ranking.length === 0) {
    return {
      positiveSignals: [],
      negativeSignals: [],
      winnerMargin: 0,
      winnerCode: "",
      runnerUpCode: "",
    };
  }

  const winnerCode = ranking[0].code;
  const runnerUpCode = ranking.length > 1 ? ranking[1].code : "";
  const winnerMargin = ranking.length > 1
    ? ranking[0].score - ranking[1].score
    : ranking[0].score;

  // Build lookups
  const questionById = new Map<number, { code: string; label: string }>();
  for (const q of matrix.questions) {
    questionById.set(q.id, { code: q.code, label: q.label });
  }

  const scopeIdToCode = new Map<number, string>();
  const scopeCodeToId = new Map<string, number>();
  for (const s of matrix.scopes) {
    scopeIdToCode.set(s.id, s.code);
    scopeCodeToId.set(s.code, s.id);
  }

  // Index cells: (questionId, scopeId) → weight
  const cellWeight = new Map<string, number>();
  for (const c of matrix.cells) {
    cellWeight.set(`${c.questionId}-${c.scopeId}`, c.weight);
  }

  const winnerId = scopeCodeToId.get(winnerCode)!;
  const runnerUpId = runnerUpCode ? scopeCodeToId.get(runnerUpCode) : undefined;

  const positiveSignals: ExplainabilitySignal[] = [];
  const negativeSignals: ExplainabilitySignal[] = [];

  // Iterate over matched (truthy) questions
  for (const qId of matchedIds) {
    const qInfo = questionById.get(qId);
    if (!qInfo) continue;

    const winnerWeight = cellWeight.get(`${qId}-${winnerId}`) ?? 0;

    if (winnerWeight > 0) {
      // This question contributed to the winner's score
      positiveSignals.push({
        questionCode: qInfo.code,
        questionLabel: qInfo.label,
        weight: winnerWeight,
        scopeCode: winnerCode,
      });
    }

    // Check if any competitor gained more from this question
    if (runnerUpId !== undefined) {
      const runnerUpWeight = cellWeight.get(`${qId}-${runnerUpId}`) ?? 0;
      if (runnerUpWeight > winnerWeight) {
        negativeSignals.push({
          questionCode: qInfo.code,
          questionLabel: qInfo.label,
          weight: runnerUpWeight - winnerWeight,
          scopeCode: runnerUpCode,
        });
      }
    }
  }

  // Sort signals by weight descending for readability
  positiveSignals.sort((a, b) => b.weight - a.weight);
  negativeSignals.sort((a, b) => b.weight - a.weight);

  return {
    positiveSignals,
    negativeSignals,
    winnerMargin,
    winnerCode,
    runnerUpCode,
  };
}
