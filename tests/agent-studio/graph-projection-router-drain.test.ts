/**
 * Graph Projection tRPC — admin drain trigger + drain cron status.
 *
 * Closes the operator-trigger gap left by #1479 + #1480: the drain
 * orchestrator + cron exist, but operators had no on-demand path to
 * force a drain (had to wait up to 5min for the next cron tick).
 *
 * The two new procedures:
 *   - `runDrainNow` — admin mutation that immediately processes
 *     pending rows. Returns the full DrainSummary so the operator
 *     UI can render per-row outcomes.
 *   - `getDrainCronStatus` — admin query mirroring the existing
 *     drift + staleness cron status surfaces so the operator panel
 *     can render all three side by side.
 *
 * Structural source-scan + behavioral via the existing tRPC router
 * pattern (same shape as the runDriftScan + runStalenessCheck tests
 * already in the repo).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const ROUTER = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/projection/router.ts",
);
const src = readFileSync(ROUTER, "utf8");

describe("graphProjectionRouter — drain admin surface", () => {
  it("imports drainPendingProjectionJobs (the orchestrator from #1479)", () => {
    expect(src).toContain('drainPendingProjectionJobs');
    expect(src).toMatch(
      /from\s*["']\.\/queue-drain\.js["']/,
    );
  });

  it("imports getProjectionDrainCronStatus (the cron from #1480)", () => {
    expect(src).toContain("getProjectionDrainCronStatus");
    expect(src).toMatch(
      /from\s*["']\.\/queue-drain-cron\.js["']/,
    );
  });

  it("declares `getDrainCronStatus` as an admin query", () => {
    expect(src).toMatch(
      /getDrainCronStatus:\s*adminProcedure\.query\(/,
    );
  });

  it("declares `runDrainNow` as an admin mutation", () => {
    expect(src).toMatch(
      /runDrainNow:\s*adminProcedure[\s\S]*?\.mutation\(/,
    );
  });

  it("runDrainNow caps limit at 1000 (admin safety)", () => {
    expect(src).toMatch(
      /runDrainNow:[\s\S]*?\.max\(1000\)/,
    );
  });

  it("runDrainNow returns the full DrainSummary (no field stripping)", () => {
    expect(src).toMatch(
      /runDrainNow[\s\S]*?return\s+drainPendingProjectionJobs\(/,
    );
  });

  it("does NOT escalate beyond adminProcedure (no public/protected drain)", () => {
    // The whole router uses adminProcedure; this test pins that
    // intent specifically for the drain surface so a future refactor
    // can't silently relax it.
    const drainSnippet = src.match(
      /(getDrainCronStatus|runDrainNow):[\s\S]*?(?=\n  [a-z]|\n}\)|\n})/g,
    );
    expect(drainSnippet).not.toBeNull();
    for (const snippet of drainSnippet ?? []) {
      expect(snippet).toContain("adminProcedure");
      expect(snippet).not.toContain("publicProcedure");
      expect(snippet).not.toContain("protectedProcedure");
    }
  });
});

describe("graphProjectionRouter — drain procedure mounting", () => {
  const apiRouter = resolve(
    __dirname,
    "../../server/agent-studio/api/router.ts",
  );
  const apiSrc = readFileSync(apiRouter, "utf8");

  it("api/router.ts mounts graphProjectionRouter under `graphProjection`", () => {
    expect(apiSrc).toContain("graphProjection: graphProjectionRouter");
  });
});
