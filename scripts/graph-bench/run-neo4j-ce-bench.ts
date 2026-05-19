#!/usr/bin/env tsx
/**
 * Neo4j CE G3 benchmark dispatcher — single-command operator wrapper.
 *
 * Slice 24 of the no-deferral catalogue (2026-05-19). The
 * `graph-bench-neo4j-ce.yml` workflow has been `workflow_dispatch`
 * only since Phase 1.5 (G3 backend-decision-gate). Before this slice,
 * the operator action was:
 *
 *   1. Open the GitHub Actions tab.
 *   2. Find "Graph Backend Benchmark — Neo4j CE (G3)".
 *   3. Click "Run workflow".
 *   4. Fill three inputs (scenarios / iterations / fixture_scale /
 *      include_postgres_baseline).
 *   5. Wait, find the run, download the artifact, unzip, commit the
 *      evidence dir, then file a PR (or update the ADR Status).
 *
 * This script collapses that into one command:
 *
 *   pnpm tsx scripts/graph-bench/run-neo4j-ce-bench.ts [--scenarios=...] [--iterations=N]
 *                                                     [--fixture-scale=sanity|full]
 *                                                     [--include-postgres-baseline=true|false]
 *                                                     [--ref=main]
 *
 * It uses the `gh` CLI to:
 *   - Trigger the workflow_dispatch with the supplied inputs.
 *   - Poll until the run completes (or fails).
 *   - Download the run's artifact into a tmp directory.
 *   - Unzip it into `docs/evidence/graph-backend/${date}-neo4j-ce/`.
 *   - Print a one-paragraph summary the operator can paste into a PR.
 *
 * The operator's residual action collapses to:
 *   `git add docs/evidence/... && git commit -m "..." && gh pr create`.
 *
 * Why not run the bench locally? — Per the runbook §9, the bench is
 * meaningless without a real fixture and the standardized CE
 * environment. This script does NOT execute the bench locally; it
 * just makes the GitHub-side execution one command instead of many.
 *
 * Requires:
 *   - `gh` CLI authenticated against this repo (GH_PAT or `gh auth login`).
 *   - The current working tree to be inside a clone of the repo.
 *
 * Reference: `.github/workflows/graph-bench-neo4j-ce.yml`
 *            `docs/runbooks/agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md`
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

interface CliArgs {
  scenarios: string;
  iterations: string;
  fixtureScale: "sanity" | "full";
  includePostgresBaseline: "true" | "false";
  ref: string;
}

const DEFAULT_ARGS: CliArgs = {
  scenarios: "all",
  iterations: "30",
  fixtureScale: "sanity",
  includePostgresBaseline: "true",
  ref: "main",
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { ...DEFAULT_ARGS };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([\w-]+)=(.+)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "scenarios") out.scenarios = value;
    else if (key === "iterations") out.iterations = value;
    else if (key === "fixture-scale") {
      if (value !== "sanity" && value !== "full") {
        throw new Error(`--fixture-scale must be 'sanity' or 'full' (got '${value}')`);
      }
      out.fixtureScale = value;
    } else if (key === "include-postgres-baseline") {
      if (value !== "true" && value !== "false") {
        throw new Error(`--include-postgres-baseline must be 'true' or 'false' (got '${value}')`);
      }
      out.includePostgresBaseline = value;
    } else if (key === "ref") {
      out.ref = value;
    }
  }
  return out;
}

function gh(cmd: string): string {
  return execSync(`gh ${cmd}`, { encoding: "utf8" });
}

function ensureGhAvailable(): void {
  const r = spawnSync("gh", ["--version"], { stdio: "ignore" });
  if (r.status !== 0) {
    throw new Error(
      "gh CLI not found on PATH. Install from https://cli.github.com/ and `gh auth login` against this repo.",
    );
  }
}

function ensureGitRepoRoot(): string {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch {
    throw new Error("not inside a git repository — run from a clone of RachEma-ux/MyNewAp1Claude");
  }
}

function dispatchWorkflow(args: CliArgs): void {
  console.log(
    `[bench] dispatching graph-bench-neo4j-ce.yml on ref=${args.ref}` +
      ` (scenarios=${args.scenarios} iterations=${args.iterations}` +
      ` fixture_scale=${args.fixtureScale} include_postgres_baseline=${args.includePostgresBaseline})`,
  );
  const flags = [
    `-r ${args.ref}`,
    `-f scenarios=${args.scenarios}`,
    `-f iterations=${args.iterations}`,
    `-f fixture_scale=${args.fixtureScale}`,
    `-f include_postgres_baseline=${args.includePostgresBaseline}`,
  ].join(" ");
  gh(`workflow run graph-bench-neo4j-ce.yml ${flags}`);
}

interface GhRun {
  databaseId: number;
  status: string;
  conclusion: string | null;
  url: string;
  createdAt: string;
}

function findLatestRun(): GhRun {
  // The workflow may take a moment to register. Poll a few times.
  for (let i = 0; i < 12; i++) {
    const json = gh(
      "run list --workflow=graph-bench-neo4j-ce.yml --limit=1 --json databaseId,status,conclusion,url,createdAt",
    );
    const arr = JSON.parse(json) as GhRun[];
    if (arr.length > 0) {
      const r = arr[0];
      const ageMs = Date.now() - new Date(r.createdAt).getTime();
      if (ageMs < 60 * 1000) return r;
    }
    sleepSync(5_000);
  }
  throw new Error(
    "could not find a newly-dispatched run within 60s — check the Actions tab manually",
  );
}

function waitForRun(runId: number): GhRun {
  // Poll until status === "completed". The bench typically takes
  // 5-30 minutes for sanity scale, 60-90 minutes for full scale.
  const maxAttempts = 360; // 30 min @ 5s; full-scale operators should pass --max-wait if needed
  for (let i = 0; i < maxAttempts; i++) {
    const json = gh(
      `run view ${runId} --json status,conclusion,databaseId,url,createdAt`,
    );
    const run = JSON.parse(json) as GhRun;
    if (run.status === "completed") return run;
    if (i % 12 === 0) {
      console.log(`[bench] still running (status=${run.status})…`);
    }
    sleepSync(5_000);
  }
  throw new Error(
    `run ${runId} did not complete within 30 minutes — re-run with a self-hosted runner for full-scale`,
  );
}

function downloadArtifact(runId: number): string {
  const stagingDir = join(tmpdir(), `graph-bench-${runId}`);
  mkdirSync(stagingDir, { recursive: true });
  console.log(`[bench] downloading artifact for run ${runId} → ${stagingDir}`);
  gh(`run download ${runId} --dir ${stagingDir}`);
  return stagingDir;
}

function commitEvidence(repoRoot: string, stagingDir: string): string {
  const entries = readdirSync(stagingDir, { withFileTypes: true });
  const reportDir = entries.find(
    (e) => e.isDirectory() && e.name.startsWith("graph-bench-report-"),
  );
  if (!reportDir) {
    throw new Error(
      `expected a 'graph-bench-report-*' directory inside ${stagingDir}; found: ${entries.map((e) => e.name).join(", ")}`,
    );
  }
  const date = new Date().toISOString().slice(0, 10);
  const dest = join(repoRoot, `docs/evidence/graph-backend/${date}-neo4j-ce`);
  mkdirSync(dest, { recursive: true });
  execSync(`cp -r ${join(stagingDir, reportDir.name)}/. ${dest}/`, {
    stdio: "inherit",
  });
  console.log(`[bench] evidence committed at ${dest}`);
  return dest;
}

function printOperatorSummary(args: CliArgs, run: GhRun, evidenceDir: string): void {
  const indexPath = join(evidenceDir, "report.md");
  let summary = "(report.md not found in artifact — inspect evidence dir manually)";
  if (existsSync(indexPath)) {
    const body = readFileSync(indexPath, "utf8");
    const headline = body.split("\n").slice(0, 8).join("\n");
    summary = headline;
  }
  console.log("\n══════════════════════════════════════════════════");
  console.log("Operator next-step recipe");
  console.log("══════════════════════════════════════════════════");
  console.log(`Run URL: ${run.url}`);
  console.log(`Conclusion: ${run.conclusion}`);
  console.log(`Evidence dir: ${evidenceDir}`);
  console.log("Report headline:");
  console.log(summary);
  console.log("\nTo commit + open the close-out PR:");
  console.log(`  git add docs/evidence/`);
  console.log(
    `  git commit -m "evidence(graph-backend): Neo4j CE G3 ${args.fixtureScale}-scale benchmark report"`,
  );
  console.log(`  gh pr create --title "evidence(graph-backend): G3 close-out"`);
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy-wait — keep simple; this runs on the operator's box, not in a hot loop
  }
}

function main() {
  const args = parseArgs(process.argv);
  ensureGhAvailable();
  const repoRoot = ensureGitRepoRoot();
  resolve(repoRoot); // sanity check
  dispatchWorkflow(args);
  const initial = findLatestRun();
  const completed = waitForRun(initial.databaseId);
  const staging = downloadArtifact(completed.databaseId);
  const evidence = commitEvidence(repoRoot, staging);
  printOperatorSummary(args, completed, evidence);
  // Exit code mirrors the workflow's conclusion so CI / cron callers
  // can branch.
  process.exit(completed.conclusion === "success" ? 0 : 1);
}

main();
