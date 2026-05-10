/**
 * Phase 1.4 — graph benchmark runner tests.
 *
 * Verifies the runner correctly computes p50/p95/mean from synthetic
 * scenarios and produces a structured BenchmarkReport.
 */

import { describe, it, expect } from "vitest";
import { TestGraphRepository } from "../../server/agent-studio/services/graph/repository/index.js";
import { runBenchmark } from "../../scripts/graph-bench/lib/runner.js";
import type { BenchmarkScenario } from "../../scripts/graph-bench/lib/types.js";
import { formatReport } from "../../scripts/graph-bench/lib/reporter.js";

const synthetic = (durations: number[]): BenchmarkScenario => {
  let i = 0;
  return {
    key: "synthetic",
    description: "synthetic deterministic scenario",
    targetP50Ms: 100,
    targetP95Ms: 300,
    run: async () => {
      const d = durations[i % durations.length] ?? 0;
      i++;
      return { durationMs: d, resultCount: 1 };
    },
  };
};

describe("graph-bench runner — percentile math", () => {
  it("p50 + p95 + mean computed correctly across 20 iterations", async () => {
    const repo = new TestGraphRepository();
    const durations = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 250, 280, 290, 295];
    const report = await runBenchmark({
      repository: repo,
      scenarios: [synthetic(durations)],
      iterations: 20,
      fixtureSize: { notes: 10000, links: 100000, nodes: 50000, edges: 250000 },
    });
    expect(report.results.length).toBe(1);
    const r = report.results[0]!;
    expect(r.p50Ms).toBeGreaterThan(100);
    expect(r.p95Ms).toBeGreaterThan(200);
    expect(r.samples.length).toBe(20);
    expect(r.passedP50).toBe(false); // 100 ms target violated above
    expect(r.passedP95).toBe(true); // 300 ms target met
  });

  it("emits pass when all scenarios are within targets", async () => {
    const repo = new TestGraphRepository();
    const fast = synthetic([10, 20, 30, 40, 50]);
    const report = await runBenchmark({
      repository: repo,
      scenarios: [fast],
      iterations: 10,
      fixtureSize: { notes: 0, links: 0, nodes: 0, edges: 0 },
    });
    expect(report.overallPassed).toBe(true);
    expect(report.results[0]?.passedP50).toBe(true);
    expect(report.results[0]?.passedP95).toBe(true);
  });

  it("formatReport produces a non-empty markdown report", async () => {
    const repo = new TestGraphRepository();
    const report = await runBenchmark({
      repository: repo,
      scenarios: [synthetic([50])],
      iterations: 5,
      fixtureSize: { notes: 10, links: 10, nodes: 10, edges: 10 },
    });
    const md = formatReport(report);
    expect(md).toContain("# Graph Backend Benchmark");
    expect(md).toContain("`test`");
    expect(md).toContain("synthetic");
  });

  it("catches scenario errors and records a timeout-like sample", async () => {
    const repo = new TestGraphRepository();
    const broken: BenchmarkScenario = {
      key: "broken",
      description: "throws",
      targetP50Ms: 100,
      targetP95Ms: 200,
      run: async () => {
        throw new Error("boom");
      },
    };
    const report = await runBenchmark({
      repository: repo,
      scenarios: [broken],
      iterations: 5,
      fixtureSize: { notes: 0, links: 0, nodes: 0, edges: 0 },
    });
    expect(report.results[0]?.samples.length).toBe(5);
    expect(report.results[0]?.passedP50).toBe(false);
  });
});
