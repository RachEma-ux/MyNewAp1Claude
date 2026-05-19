/**
 * Neo4j CE G3 bench dispatcher script — source-scan integrity.
 *
 * Slice 24 of the no-deferral catalogue (2026-05-19). Closes the
 * "T-B.1 Neo4j CE benchmark execution: operator-action only" residual
 * by shipping a one-command dispatcher. The script doesn't run the
 * bench locally (the runbook prohibits that — the CE fixture is
 * meaningless without the standardized GitHub-side environment); it
 * just collapses the multi-step operator gesture (dispatch → wait →
 * download → commit) into a single command.
 *
 * Locks the dispatcher's wiring against the workflow's input contract
 * so an accidental rename / input-removal on the GHA side is caught.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const SCRIPT_PATH = join(
  REPO_ROOT,
  "scripts/graph-bench/run-neo4j-ce-bench.ts",
);
const WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github/workflows/graph-bench-neo4j-ce.yml",
);

describe("scripts/graph-bench/run-neo4j-ce-bench.ts — slice 24", () => {
  const script = readFileSync(SCRIPT_PATH, "utf8");
  const workflow = readFileSync(WORKFLOW_PATH, "utf8");

  it("script ships at the documented path with a tsx shebang", () => {
    expect(script).toMatch(/^#!\/usr\/bin\/env tsx/);
  });

  it("dispatches the canonical workflow file by name", () => {
    expect(script).toMatch(
      /gh\(\s*`workflow run graph-bench-neo4j-ce\.yml/,
    );
  });

  it("supplies all four workflow_dispatch inputs", () => {
    expect(script).toMatch(/-f scenarios=\$\{args\.scenarios\}/);
    expect(script).toMatch(/-f iterations=\$\{args\.iterations\}/);
    expect(script).toMatch(/-f fixture_scale=\$\{args\.fixtureScale\}/);
    expect(script).toMatch(
      /-f include_postgres_baseline=\$\{args\.includePostgresBaseline\}/,
    );
  });

  it("workflow declares the four inputs the script supplies", () => {
    // The script and the workflow share an input contract — drift
    // here means the dispatch will be silently ignored.
    expect(workflow).toMatch(/scenarios:/);
    expect(workflow).toMatch(/iterations:/);
    expect(workflow).toMatch(/fixture_scale:/);
    expect(workflow).toMatch(/include_postgres_baseline:/);
  });

  it("polls run completion + downloads artifact + commits to evidence dir", () => {
    expect(script).toMatch(/waitForRun\(/);
    expect(script).toMatch(/downloadArtifact\(/);
    expect(script).toMatch(/docs\/evidence\/graph-backend\//);
  });

  it("prints the operator next-step recipe (git add + commit + gh pr create)", () => {
    expect(script).toMatch(/Operator next-step recipe/);
    expect(script).toMatch(/git add docs\/evidence\//);
    expect(script).toMatch(/gh pr create/);
  });

  it("exits non-zero on bench failure so CI/cron callers can branch", () => {
    expect(script).toMatch(
      /process\.exit\(completed\.conclusion === ["']success["'] \? 0 : 1\)/,
    );
  });

  it("declines to execute the bench locally (gates on `gh` CLI presence)", () => {
    expect(script).toMatch(/ensureGhAvailable\(\)/);
    expect(script).toMatch(/gh CLI not found on PATH/);
  });

  it("requires the script to run from inside the git repo", () => {
    expect(script).toMatch(/ensureGitRepoRoot\(\)/);
    expect(script).toMatch(/not inside a git repository/);
  });

  it("accepts CLI overrides via --flag=value pairs", () => {
    expect(script).toMatch(/--scenarios=/);
    expect(script).toMatch(/--iterations=/);
    expect(script).toMatch(/--fixture-scale=/);
    expect(script).toMatch(/--include-postgres-baseline=/);
    expect(script).toMatch(/--ref=/);
  });
});
