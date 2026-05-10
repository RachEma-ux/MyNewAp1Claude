#!/usr/bin/env tsx
/**
 * Phase 12 (Roadmap V3) — runtime load certification: report CLI.
 *
 * Reads a JSON file containing a `LoadReportInput` (operator-captured
 * metrics from any load harness — k6, autocannon, custom Node script,
 * synthetic-test-output) and emits a markdown certification report.
 *
 * Usage:
 *   npx tsx scripts/load/runtime-load-report.ts <input.json> [output.md]
 *
 * Stdout: markdown report (also written to output.md if provided).
 * Exit codes:
 *   0 — overall PASS (every SLO PASS, no UNKNOWNs)
 *   1 — overall NOT PASS (any FAIL or UNKNOWN, OR I/O failure)
 *
 * The script doesn't talk to ASDB or any service. Operators run their
 * preferred load tool, capture the inputs, write a JSON file, run
 * this script, and the script answers "did Gate 7 numerics certify?"
 *
 * The required input shape is documented in
 * `scripts/load/lib/types.ts` and `scripts/load/README.md`.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { assessLoadReport } from "./lib/slo-checker";
import { formatLoadReport } from "./lib/report-formatter";
import type { LoadReportInput } from "./lib/types";

function main(): void {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) {
    console.error(
      "usage: runtime-load-report.ts <input.json> [output.md]",
    );
    process.exit(1);
  }
  if (!existsSync(inputPath)) {
    console.error(`input file not found: ${inputPath}`);
    process.exit(1);
  }
  let input: LoadReportInput;
  try {
    input = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch (e) {
    console.error(
      `failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  }
  const report = assessLoadReport(input);
  const md = formatLoadReport(report);
  if (outputPath) {
    writeFileSync(outputPath, md);
    console.error(`wrote report to ${outputPath}`);
  }
  console.log(md);
  process.exit(report.summary.overallPass ? 0 : 1);
}

main();
