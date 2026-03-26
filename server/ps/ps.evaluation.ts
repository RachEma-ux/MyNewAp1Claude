/**
 * PS Module — Evaluation Suite Engine
 *
 * Define benchmark cases with expected outcomes, run them against
 * a matrix version, and produce pass/fail reports.
 */

import * as repo from "./ps.repository";
import { evaluateMatrixEnriched } from "./ps.matrix-engine";
import { loadMatrixByVersionId } from "./ps.simulation";
import type {
  EvalCaseInput,
  EvalCaseResult,
  EvalSuiteInput,
  EvalSuiteResult,
} from "./ps.types";

// ── Eval Case CRUD ───────────────────────────────────────────────────

export async function createEvalCase(
  input: EvalCaseInput,
  actorId: number,
) {
  return repo.createEvalCase({
    workspaceId: input.workspaceId,
    name: input.name,
    description: input.description ?? null,
    answersJson: input.answersJson,
    expectedScopeCode: input.expectedScopeCode,
    tags: input.tags ?? [],
    isActive: 1,
    createdBy: actorId,
  });
}

export async function listEvalCases(workspaceId: number) {
  return repo.listEvalCases(workspaceId);
}

export async function getEvalCase(workspaceId: number, id: number) {
  return repo.getEvalCaseById(workspaceId, id);
}

export async function updateEvalCase(
  workspaceId: number,
  id: number,
  data: {
    name?: string;
    description?: string;
    answersJson?: Record<string, boolean | string | number>;
    expectedScopeCode?: string;
    tags?: string[];
    isActive?: number;
  },
) {
  return repo.updateEvalCase(workspaceId, id, data);
}

export async function deleteEvalCase(workspaceId: number, id: number) {
  return repo.deleteEvalCase(workspaceId, id);
}

// ── Run Evaluation Suite ─────────────────────────────────────────────

/**
 * Run a suite of benchmark cases against a matrix version.
 * Returns pass/fail for each case plus aggregate stats.
 */
export async function runEvaluationSuite(
  input: EvalSuiteInput,
  actorId: number,
): Promise<EvalSuiteResult> {
  const { workspaceId, versionId, caseIds, tags } = input;

  // Load matrix
  const matrix = await loadMatrixByVersionId(workspaceId, versionId);
  if (!matrix) {
    throw new Error(`Matrix version ${versionId} not found`);
  }
  if (matrix.questions.length === 0 || matrix.scopes.length === 0) {
    throw new Error("Matrix version has no questions or scopes defined");
  }

  // Load eval cases
  let cases = await repo.listEvalCases(workspaceId);

  // Filter by specific IDs
  if (caseIds && caseIds.length > 0) {
    const idSet = new Set(caseIds);
    cases = cases.filter((c) => idSet.has(c.id));
  }

  // Filter by tags
  if (tags && tags.length > 0) {
    const tagSet = new Set(tags);
    cases = cases.filter((c) => {
      const caseTags = (c.tags as string[]) || [];
      return caseTags.some((t) => tagSet.has(t));
    });
  }

  if (cases.length === 0) {
    throw new Error("No matching eval cases found");
  }

  // Run each case
  const results: EvalCaseResult[] = [];
  const failedDetails: EvalSuiteResult["failedDetails"] = [];
  let passedCases = 0;

  for (const evalCase of cases) {
    const answers = evalCase.answersJson as Record<string, boolean | string | number>;
    const enriched = evaluateMatrixEnriched(matrix, answers);

    const passed = enriched.selectedScope === evalCase.expectedScopeCode;
    if (passed) passedCases++;

    const caseResult: EvalCaseResult = {
      caseId: evalCase.id,
      caseName: evalCase.name,
      expectedScope: evalCase.expectedScopeCode,
      actualScope: enriched.selectedScope,
      passed,
      confidence: enriched.confidence.overall,
      scores: enriched.scores,
      ranking: enriched.ranking,
    };

    results.push(caseResult);

    if (!passed) {
      const expectedScore = enriched.scores[evalCase.expectedScopeCode] ?? 0;
      const actualScore = enriched.scores[enriched.selectedScope] ?? 0;
      failedDetails.push({
        caseName: evalCase.name,
        expectedScope: evalCase.expectedScopeCode,
        actualScope: enriched.selectedScope,
        scoreDelta: actualScore - expectedScore,
      });
    }
  }

  const totalCases = results.length;
  const failedCases = totalCases - passedCases;
  const passRate = totalCases > 0 ? Math.round((passedCases / totalCases) * 10000) / 100 : 0;

  // Persist eval run record
  const evalRun = await repo.createEvalRun({
    workspaceId,
    versionId,
    totalCases,
    passedCases,
    failedCases,
    passRate: String(passRate),
    resultsJson: results.map((r) => ({
      caseId: r.caseId,
      caseName: r.caseName,
      expectedScope: r.expectedScope,
      actualScope: r.actualScope,
      passed: r.passed,
      confidence: r.confidence,
    })),
    status: "completed",
    createdBy: actorId,
  });

  return {
    evalRunId: evalRun.id,
    versionId,
    versionLabel: matrix.version,
    totalCases,
    passedCases,
    failedCases,
    passRate,
    results,
    failedDetails,
  };
}

// ── List Eval Runs ──────────────────────────────────────────────────

export async function listEvalRuns(workspaceId: number) {
  return repo.listEvalRuns(workspaceId);
}

export async function getEvalRun(workspaceId: number, id: number) {
  return repo.getEvalRunById(workspaceId, id);
}
