/**
 * Graph Backend Benchmark Harness — runner.
 *
 * Phase 1.4. Executes each scenario N times against a given backend,
 * captures p50/p95/mean/samples, and produces a structured `BenchmarkReport`.
 *
 * Mirrors the V3 Phase 12 load assessor pattern (`scripts/load/lib/`).
 */

import type { GraphRepository } from "../../../server/agent-studio/services/graph/repository/index.js";
import type {
  BenchmarkReport,
  BenchmarkScenario,
  ScenarioResult,
} from "./types.js";

export interface RunBenchmarkInput {
  readonly repository: GraphRepository;
  readonly scenarios: BenchmarkScenario[];
  readonly iterations: number;
  readonly fixtureSize: BenchmarkReport["fixtureSize"];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.floor(sorted.length * p);
  return sorted[Math.min(i, sorted.length - 1)] ?? 0;
}

export async function runBenchmark(input: RunBenchmarkInput): Promise<BenchmarkReport> {
  const results: ScenarioResult[] = [];

  for (const scenario of input.scenarios) {
    const samples: number[] = [];
    let resultCount = 0;

    // Warm-up run discarded
    try {
      await scenario.run(input.repository);
    } catch {
      // Phase 7+ scenarios depend on fixture seeding; failures here are
      // operator-actionable but should not stop the rest of the suite.
    }

    for (let i = 0; i < input.iterations; i++) {
      try {
        const r = await scenario.run(input.repository);
        samples.push(r.durationMs);
        resultCount = r.resultCount;
      } catch (e) {
        // Record a synthetic sample at the timeout to keep p50/p95 honest.
        samples.push(scenario.targetP95Ms * 2);
      }
    }

    samples.sort((a, b) => a - b);
    const p50Ms = percentile(samples, 0.5);
    const p95Ms = percentile(samples, 0.95);
    const meanMs = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);

    results.push({
      scenarioKey: scenario.key,
      backendKey: input.repository.backendKey,
      p50Ms,
      p95Ms,
      meanMs,
      samples,
      resultCount,
      passedP50: p50Ms <= scenario.targetP50Ms,
      passedP95: p95Ms <= scenario.targetP95Ms,
    });
  }

  return {
    backendKey: input.repository.backendKey,
    fixtureSize: input.fixtureSize,
    results,
    // An empty scenario list MUST NOT report `overallPassed: true`.
    // `[].every(...)` returns true by JS spec, which would silently
    // declare every backend a pass when 0 scenarios actually ran. The
    // `length > 0` guard is the explicit silent-success defense
    // required by the G3 benchmark runbook §6 + the closure mission
    // acceptance criteria.
    overallPassed:
      results.length > 0 && results.every((r) => r.passedP50 && r.passedP95),
    generatedAt: new Date().toISOString(),
  };
}
