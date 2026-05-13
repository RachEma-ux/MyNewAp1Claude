/**
 * Graph Backend Benchmark Harness — CLI.
 *
 * Phase 1.4. Operator entry point: runs the scenario suite against the
 * active GraphRepository backend and emits a markdown report.
 *
 * Mirrors `scripts/load/runtime-load-report.ts` (V3 Phase 12).
 *
 * Usage:
 *   GRAPH_BACKEND=postgres pnpm tsx scripts/graph-bench/run-benchmark.ts \
 *     --scenarios all --iterations 30 \
 *     --output docs/evidence/graph-backend/2026-MM-DD-postgres-baseline/report.md
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";

import { getGraphRepository } from "../../server/agent-studio/services/graph/repository/index.js";
import { validateScenarioKeys } from "./lib/scenarios.js";
import { generateFixture, DEFAULT_FIXTURE } from "./lib/fixtures.js";
import { runBenchmark } from "./lib/runner.js";
import { formatReport } from "./lib/reporter.js";

interface CliArgs {
  scenarios: string[];
  iterations: number;
  output: string | null;
  skipFixture: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    scenarios: ["all"],
    iterations: 30,
    output: null,
    skipFixture: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scenarios") {
      args.scenarios = (argv[++i] ?? "all").split(",");
    } else if (a === "--iterations") {
      args.iterations = Number.parseInt(argv[++i] ?? "30", 10);
    } else if (a === "--output") {
      args.output = argv[++i] ?? null;
    } else if (a === "--skip-fixture") {
      args.skipFixture = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  // Strict scenario-key validation BEFORE touching the repository.
  // The G3 runbook + the closure mission both require unknown keys
  // to fail loudly; silent-empty-then-report-pass is the bug that
  // motivates this guard.
  const validation = validateScenarioKeys(args.scenarios);
  if (validation.unknown.length > 0) {
    console.error(
      `[graph-bench] unknown scenario key(s): ${validation.unknown.join(", ")}.`,
    );
    console.error(
      "[graph-bench] valid keys: all, " +
        validation.valid.join(", "),
    );
    process.exit(2);
  }
  if (validation.resolved.length === 0) {
    console.error(
      "[graph-bench] no scenarios resolved from --scenarios input. " +
        "Use --scenarios all or supply at least one valid key.",
    );
    process.exit(2);
  }

  const repo = getGraphRepository();
  console.log(`[graph-bench] backend=${repo.backendKey}`);

  const health = await repo.health();
  console.log(`[graph-bench] health=${health.status}`);

  if (!args.skipFixture) {
    console.log(`[graph-bench] generating fixture (${DEFAULT_FIXTURE.notes} notes / ${DEFAULT_FIXTURE.links} links)…`);
    try {
      await generateFixture(repo);
    } catch (e) {
      console.warn(`[graph-bench] fixture generation failed; continuing with existing state: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const scenarios = validation.resolved;
  console.log(`[graph-bench] running ${scenarios.length} scenarios × ${args.iterations} iterations…`);

  const report = await runBenchmark({
    repository: repo,
    scenarios,
    iterations: args.iterations,
    fixtureSize: DEFAULT_FIXTURE,
  });

  const markdown = formatReport(report);

  if (args.output) {
    const path = isAbsolute(args.output) ? args.output : resolve(process.cwd(), args.output);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, markdown, "utf8");
    console.log(`[graph-bench] report written to ${path}`);
  } else {
    process.stdout.write(markdown + "\n");
  }

  process.exit(report.overallPassed ? 0 : 1);
}

main().catch((e) => {
  console.error("[graph-bench] fatal:", e);
  process.exit(2);
});
