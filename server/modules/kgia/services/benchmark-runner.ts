/**
 * KGIA — Benchmark Runner
 *
 * Executes benchmark cases through the KGIA pipeline and scores results
 * against expected answers and modes.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../../../db/connection";
import { kgiaBenchmarkCases, kgiaBenchmarkRuns, kgiaSessions } from "../schema";
import { createSession, executeRun } from "../runtime/orchestrator";

export interface BenchmarkResult {
  benchmarkRunId: number;
  caseId: number;
  passed: boolean;
  score: number;
  actualAnswer: string;
  actualMode: string;
  durationMs: number;
  notes: string;
}

/**
 * Run a single benchmark case through the pipeline.
 */
export async function runBenchmark(
  caseId: number,
  workspaceId: number,
  actorId?: number
): Promise<BenchmarkResult> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  // Load the benchmark case
  const [benchCase] = await db
    .select()
    .from(kgiaBenchmarkCases)
    .where(and(eq(kgiaBenchmarkCases.id, caseId), eq(kgiaBenchmarkCases.workspaceId, workspaceId)))
    .limit(1);

  if (!benchCase) throw new Error(`Benchmark case ${caseId} not found`);

  // Create a temporary session for the benchmark
  const sessionId = await createSession({
    workspaceId,
    userId: actorId,
    title: `Benchmark: ${benchCase.name}`,
    config: { benchmark: true, caseId },
  });

  if (!sessionId) throw new Error("Failed to create benchmark session");

  const startTime = Date.now();

  // Execute the question through the pipeline
  const result = await executeRun({
    workspaceId,
    sessionId,
    question: benchCase.question,
    sourceIds: benchCase.sourceIds as number[] | undefined,
    actorId,
  });

  const durationMs = Date.now() - startTime;

  // Score the result
  let passed = false;
  let score = 0;
  let actualAnswer = "";
  let actualMode = "";
  const notes: string[] = [];

  if ("envelope" in result) {
    actualAnswer = result.envelope.answer;
    actualMode = result.envelope.selectedMode;

    // Score answer similarity
    if (benchCase.expectedAnswer) {
      score = scoreSimilarity(benchCase.expectedAnswer, actualAnswer);
      notes.push(`Answer similarity: ${(score * 100).toFixed(1)}%`);
    } else {
      // No expected answer — just check we got one
      score = actualAnswer.length > 0 ? 0.5 : 0;
      notes.push("No expected answer defined; scored on non-empty response");
    }

    // Score mode match
    if (benchCase.expectedMode) {
      if (actualMode === benchCase.expectedMode) {
        score = Math.min(1, score + 0.2);
        notes.push(`Mode match: ${actualMode} ✓`);
      } else {
        notes.push(`Mode mismatch: expected ${benchCase.expectedMode}, got ${actualMode}`);
      }
    }

    passed = score >= 0.5;
  } else {
    actualAnswer = result.error;
    notes.push(`Error: ${result.error}`);

    // Governance block benchmarks expect denial
    if (benchCase.category === "governance_block") {
      passed = true;
      score = 1.0;
      notes.push("Governance block verified — denial is the expected outcome");
    }
  }

  // Persist benchmark run
  const [benchRun] = await db
    .insert(kgiaBenchmarkRuns)
    .values({
      workspaceId,
      caseId,
      runId: "runId" in result ? result.runId : null,
      status: "completed",
      passed,
      actualAnswer,
      actualMode,
      durationMs,
      score,
      notes: notes.join("; "),
    })
    .returning({ id: kgiaBenchmarkRuns.id });

  return {
    benchmarkRunId: benchRun.id,
    caseId,
    passed,
    score,
    actualAnswer,
    actualMode,
    durationMs,
    notes: notes.join("; "),
  };
}

/**
 * Run all benchmark cases in a category (or all if no category specified).
 */
export async function runBenchmarkSuite(
  workspaceId: number,
  category?: string,
  actorId?: number
): Promise<BenchmarkResult[]> {
  const db = getDb();
  if (!db) return [];

  const conditions = [eq(kgiaBenchmarkCases.workspaceId, workspaceId)];
  if (category) {
    conditions.push(eq(kgiaBenchmarkCases.category, category));
  }

  const cases = await db
    .select()
    .from(kgiaBenchmarkCases)
    .where(and(...conditions));

  const results: BenchmarkResult[] = [];
  for (const benchCase of cases) {
    const result = await runBenchmark(benchCase.id, workspaceId, actorId);
    results.push(result);
  }

  return results;
}

/**
 * Compute similarity between expected and actual answers.
 * Uses word overlap (Jaccard coefficient).
 */
function scoreSimilarity(expected: string, actual: string): number {
  const expectedWords = new Set(expected.toLowerCase().split(/\s+/).filter(Boolean));
  const actualWords = new Set(actual.toLowerCase().split(/\s+/).filter(Boolean));

  if (expectedWords.size === 0 && actualWords.size === 0) return 1;
  if (expectedWords.size === 0 || actualWords.size === 0) return 0;

  let intersection = 0;
  for (const word of expectedWords) {
    if (actualWords.has(word)) intersection++;
  }

  const union = new Set([...expectedWords, ...actualWords]).size;
  return intersection / union;
}
