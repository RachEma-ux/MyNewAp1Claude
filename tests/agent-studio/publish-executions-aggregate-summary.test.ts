/**
 * Publish executions workspace-aggregate summary line — PR-V1-206.
 *
 * Source-scan that the executions card now has a one-line workspace
 * totals summary above the filter row, derived by summing the
 * per-target `executionSummaries` data. Color coding: emerald for
 * succeeded > 0, amber for pending > 0, destructive for failed > 0.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-206 — publish executions workspace aggregate summary", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );

  it("renders aggregate summary line with testid + 4 totals", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="publish-executions-aggregate-summary"');
    // Sums total/succeeded/pending/failed across summariesQ.data.
    expect(/total\s*\+=\s*s\.totalExecutions/.test(src)).toBe(true);
    expect(/succeeded\s*\+=\s*s\.succeededCount/.test(src)).toBe(true);
    expect(/pending\s*\+=\s*s\.pendingCount/.test(src)).toBe(true);
    expect(/failed\s*\+=\s*s\.failedCount/.test(src)).toBe(true);
  });

  it("color-codes each count branch", () => {
    const src = readFileSync(panel, "utf8");
    // succeeded > 0 → emerald
    expect(
      /succeeded\s*>\s*0\s*\?\s*"text-emerald-600 dark:text-emerald-400"/.test(
        src,
      ),
    ).toBe(true);
    // pending > 0 → amber
    expect(
      /pending\s*>\s*0\s*\?\s*"text-amber-600 dark:text-amber-400"/.test(src),
    ).toBe(true);
    // failed > 0 → destructive
    expect(/failed\s*>\s*0\s*\?\s*"text-destructive"/.test(src)).toBe(true);
  });

  it("only renders when summariesQ.data has at least one row", () => {
    const src = readFileSync(panel, "utf8");
    expect(/summariesQ\.data\s*&&\s*summariesQ\.data\.length\s*>\s*0/.test(src)).toBe(
      true,
    );
  });
});
