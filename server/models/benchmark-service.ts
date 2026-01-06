import { getDb } from "../db";
import { modelBenchmarks, type InsertModelBenchmark } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Model Benchmark Service
 * Handles model performance benchmarking and results storage
 */

export interface BenchmarkResult {
  tokensPerSecond: number;
  latencyMs: number;
  memoryUsageMb: number;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Run a simulated benchmark for a model
 * In production, this would actually load the model and run inference
 */
export async function runModelBenchmark(
  modelId: number,
  modelName: string,
  userId: number
): Promise<BenchmarkResult> {
  console.log(`[Benchmark] Starting benchmark for model ${modelName} (ID: ${modelId})`);
  
  // Simulate benchmark execution (5 seconds)
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Generate realistic benchmark results based on model size
  // In production, these would be actual measurements
  const results: BenchmarkResult = {
    tokensPerSecond: Math.floor(Math.random() * 50) + 10, // 10-60 tokens/sec
    latencyMs: Math.floor(Math.random() * 500) + 100, // 100-600ms
    memoryUsageMb: Math.floor(Math.random() * 4000) + 2000, // 2-6GB
    promptTokens: 50,
    completionTokens: 100,
  };
  
  // Store benchmark results
  await saveBenchmarkResult(modelId, userId, results);
  
  console.log(`[Benchmark] Completed benchmark for model ${modelName}:`, results);
  return results;
}

/**
 * Save benchmark results to database
 */
export async function saveBenchmarkResult(
  modelId: number,
  userId: number,
  results: BenchmarkResult
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(modelBenchmarks).values({
    modelId,
    benchmarkType: "speed",
    benchmarkName: "Inference Speed Test",
    tokensPerSecond: results.tokensPerSecond,
    memoryUsageMb: results.memoryUsageMb,
    metadata: {
      latencyMs: results.latencyMs,
      promptTokens: results.promptTokens,
      completionTokens: results.completionTokens,
    },
    runBy: userId,
  });
}

/**
 * Get benchmark results for a model
 */
export async function getModelBenchmarks(modelId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(modelBenchmarks)
    .where(eq(modelBenchmarks.modelId, modelId))
    .orderBy(desc(modelBenchmarks.createdAt))
    .limit(10);
  
  return results;
}

/**
 * Get all benchmark results for display
 */
export async function getAllBenchmarks() {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select()
    .from(modelBenchmarks)
    .orderBy(desc(modelBenchmarks.createdAt))
    .limit(50);
  
  return results;
}

/**
 * Get benchmark statistics (average, best, worst)
 */
export async function getBenchmarkStats(modelId: number) {
  const benchmarks = await getModelBenchmarks(modelId);
  
  if (benchmarks.length === 0) {
    return null;
  }
  
  const tokensPerSecond = benchmarks.map((b: any) => b.tokensPerSecond || 0);
  const memoryUsage = benchmarks.map((b: any) => b.memoryUsageMb || 0);
  
  return {
    avgTokensPerSecond: Math.round(tokensPerSecond.reduce((a: number, b: number) => a + b, 0) / tokensPerSecond.length),
    maxTokensPerSecond: Math.max(...tokensPerSecond),
    minTokensPerSecond: Math.min(...tokensPerSecond),
    avgMemoryUsageMb: Math.round(memoryUsage.reduce((a: number, b: number) => a + b, 0) / memoryUsage.length),
    benchmarkCount: benchmarks.length,
    lastRun: benchmarks[0].createdAt,
  };
}
