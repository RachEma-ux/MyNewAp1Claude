/**
 * Graph Backend Benchmark Harness — markdown reporter.
 *
 * Phase 1.4. Renders a `BenchmarkReport` as operator-facing markdown.
 */

import type { BenchmarkReport, ScenarioResult } from "./types.js";

export function formatReport(report: BenchmarkReport): string {
  const passEmoji = report.overallPassed ? "✅" : "❌";
  const lines: string[] = [
    `# Graph Backend Benchmark — \`${report.backendKey}\``,
    "",
    `Generated: ${report.generatedAt}`,
    `Overall: ${passEmoji} ${report.overallPassed ? "PASS" : "FAIL"}`,
    "",
    "## Fixture",
    "",
    `- Notes: ${report.fixtureSize.notes.toLocaleString()}`,
    `- Links: ${report.fixtureSize.links.toLocaleString()}`,
    `- Graph nodes: ${report.fixtureSize.nodes.toLocaleString()}`,
    `- Graph edges: ${report.fixtureSize.edges.toLocaleString()}`,
    "",
    "## Scenario results",
    "",
    "| Scenario | p50 (ms) | target | p95 (ms) | target | result |",
    "|---|---:|---:|---:|---:|:---:|",
  ];

  for (const r of report.results) {
    const meta = scenarioRow(r);
    lines.push(meta);
  }

  lines.push("");
  lines.push("## Samples");
  lines.push("");
  for (const r of report.results) {
    lines.push(`### \`${r.scenarioKey}\``);
    lines.push("");
    lines.push(`mean: ${r.meanMs.toFixed(1)} ms | iterations: ${r.samples.length} | resultCount: ${r.resultCount}`);
    lines.push("");
  }

  return lines.join("\n");
}

function scenarioRow(r: ScenarioResult): string {
  const p50Status = r.passedP50 ? "✅" : "❌";
  const p95Status = r.passedP95 ? "✅" : "❌";
  return `| \`${r.scenarioKey}\` | ${r.p50Ms.toFixed(1)} ${p50Status} | — | ${r.p95Ms.toFixed(1)} ${p95Status} | — | ${r.passedP50 && r.passedP95 ? "PASS" : "FAIL"} |`;
}
