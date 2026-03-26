/**
 * PS Module — Matrix Simulation Engine
 *
 * Run matrix evaluation against any version (not just active).
 * Compare draft vs active results for the same answer set.
 * Persist simulation records for audit trail.
 */

import * as repo from "./ps.repository";
import { evaluateMatrixEnriched } from "./ps.matrix-engine";
import type {
  LoadedMatrix,
  SimulationInput,
  SimulationResult,
  SimulationDiff,
  EnrichedMatrixResult,
} from "./ps.types";

// ── Load Matrix by Version ID ────────────────────────────────────────

/**
 * Load a matrix by version ID (not just active).
 * Reuses the same structure as loadActiveMatrix but for any version.
 */
export async function loadMatrixByVersionId(
  workspaceId: number,
  versionId: number,
): Promise<LoadedMatrix | null> {
  const version = await repo.getMatrixVersionById(workspaceId, versionId);
  if (!version) return null;

  const [scopes, questions, cells, dimensions] = await Promise.all([
    repo.listScopesByVersion(version.id),
    repo.listQuestionsByVersion(version.id),
    repo.listCellsByVersion(version.id),
    repo.listDimensionsByVersion(version.id),
  ]);

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

// ── Run Simulation ──────────────────────────────────────────────────

/**
 * Run matrix simulation: evaluate answers against a version,
 * optionally compare with a second version.
 */
export async function runSimulation(
  input: SimulationInput,
  actorId: number,
): Promise<SimulationResult> {
  const { workspaceId, versionId, answers, compareVersionId } = input;

  // Load primary version
  const matrix = await loadMatrixByVersionId(workspaceId, versionId);
  if (!matrix) {
    throw new Error(`Matrix version ${versionId} not found`);
  }

  if (matrix.questions.length === 0 || matrix.scopes.length === 0) {
    throw new Error("Matrix version has no questions or scopes defined");
  }

  // Evaluate primary
  const result = evaluateMatrixEnriched(matrix, answers);

  // Optionally compare
  let compareResult: EnrichedMatrixResult | undefined;
  let compareVersionLabel: string | undefined;
  let diff: SimulationDiff | undefined;

  if (compareVersionId) {
    const compareMatrix = await loadMatrixByVersionId(workspaceId, compareVersionId);
    if (!compareMatrix) {
      throw new Error(`Compare version ${compareVersionId} not found`);
    }

    if (compareMatrix.questions.length > 0 && compareMatrix.scopes.length > 0) {
      compareResult = evaluateMatrixEnriched(compareMatrix, answers);
      compareVersionLabel = compareMatrix.version;
      diff = computeDiff(result, compareResult);
    }
  }

  // Persist simulation record
  const simRecord = await repo.createMatrixSimulation({
    workspaceId,
    versionId,
    compareVersionId: compareVersionId ?? null,
    answersJson: answers,
    resultJson: sanitizeResult(result),
    compareResultJson: compareResult ? sanitizeResult(compareResult) : null,
    diffSummary: diff?.summary ?? null,
    createdBy: actorId,
  });

  return {
    simulationId: simRecord.id,
    versionId,
    versionLabel: matrix.version,
    result,
    compareVersionId: compareVersionId ?? undefined,
    compareVersionLabel,
    compareResult,
    diff,
  };
}

// ── Compute Diff ────────────────────────────────────────────────────

/**
 * Compare two evaluation results and produce a structured diff.
 */
function computeDiff(
  primary: EnrichedMatrixResult,
  compare: EnrichedMatrixResult,
): SimulationDiff {
  const selectedScopeChanged = primary.selectedScope !== compare.selectedScope;

  // Build ranking lookup for compare result
  const compareRankMap = new Map<string, { rank: number; score: number }>();
  for (const r of compare.ranking) {
    compareRankMap.set(r.code, { rank: r.rank, score: r.score });
  }

  const rankingChanges: SimulationDiff["rankingChanges"] = [];
  for (const r of primary.ranking) {
    const comp = compareRankMap.get(r.code);
    if (comp && (comp.rank !== r.rank || comp.score !== r.score)) {
      rankingChanges.push({
        scopeCode: r.code,
        oldRank: comp.rank,
        newRank: r.rank,
        oldScore: comp.score,
        newScore: r.score,
      });
    }
  }

  const parts: string[] = [];
  if (selectedScopeChanged) {
    parts.push(`Selected scope changed: ${compare.selectedScope} → ${primary.selectedScope}`);
  } else {
    parts.push(`Selected scope unchanged: ${primary.selectedScope}`);
  }
  if (rankingChanges.length > 0) {
    parts.push(`${rankingChanges.length} scope(s) changed rank/score`);
  }

  return {
    selectedScopeChanged,
    previousScope: compare.selectedScope,
    newScope: primary.selectedScope,
    rankingChanges,
    summary: parts.join(". "),
  };
}

// ── List Simulations ────────────────────────────────────────────────

export async function listSimulations(workspaceId: number) {
  return repo.listMatrixSimulations(workspaceId);
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Strip non-serializable data from enriched result for JSON storage.
 */
function sanitizeResult(r: EnrichedMatrixResult): Record<string, unknown> {
  return {
    selectedScope: r.selectedScope,
    selectedScopeLabel: r.selectedScopeLabel,
    top3: r.top3,
    ranking: r.ranking,
    scores: r.scores,
    matchedQuestions: r.matchedQuestions,
    totalQuestions: r.totalQuestions,
    matrixVersion: r.matrixVersion,
    confidence: r.confidence,
  };
}
