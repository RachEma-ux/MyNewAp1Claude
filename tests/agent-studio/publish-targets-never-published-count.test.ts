/**
 * Publish-targets never-published count — PR-V1-221.
 *
 * The enabled/disabled aggregate (#962) and type breakdown
 * (#970) surface registry shape but not registry *use*. A
 * target that exists but has never received an execution is
 * either misconfigured, quiesced, or recently added — and the
 * `executionSummaries` join already carries that fact. This
 * slice rolls it up to a single inline count.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-221 — publish-targets never-published count", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );
  const queries = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/admin-queries.ts",
  );

  it("renders count with testid + predicate using summaryByTargetId", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      'data-testid="publish-targets-never-published-count"',
    );
    // Predicate: targets with no summary row OR summary.totalExecutions === 0.
    expect(/summaryByTargetId\.get\(t\.id\)/.test(src)).toBe(true);
    expect(/totalExecutions\s*===\s*0/.test(src)).toBe(true);
  });

  it("amber highlight when neverPublished > 0", () => {
    const src = readFileSync(panel, "utf8");
    // The amber class applies inside this region; match a small
    // window around the highlight ternary.
    expect(
      /neverPublished\s*>\s*0[\s\S]{0,80}text-amber-600/.test(src),
    ).toBe(true);
  });

  it("render gate requires both targetsQ.data and summariesQ.data", () => {
    const src = readFileSync(panel, "utf8");
    expect(
      /targetsQ\.data\s*&&[\s\S]{0,80}targetsQ\.data\.length\s*>\s*0[\s\S]{0,80}summariesQ\.data/.test(
        src,
      ),
    ).toBe(true);
  });

  it("contract anchor: PublishTargetExecutionSummary still carries totalExecutions: number", () => {
    const src = readFileSync(queries, "utf8");
    expect(/readonly\s+totalExecutions:\s*number/.test(src)).toBe(true);
  });
});
