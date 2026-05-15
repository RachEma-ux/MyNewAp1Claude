/**
 * Extensions invocations workspace-aggregate summary line — PR-V1-207.
 *
 * Symmetric with publish executions aggregate (#957). Surfaces
 * total + allowed/denied breakdown above the filter row, derived
 * from the existing `workspaceInvocationSummaries` query.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-207 — extensions invocations workspace aggregate summary", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("renders aggregate summary line with testid + 3 totals", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      'data-testid="extensions-invocations-aggregate-summary"',
    );
    expect(/total\s*\+=\s*s\.totalInvocations/.test(src)).toBe(true);
    expect(/allowed\s*\+=\s*s\.allowedCount/.test(src)).toBe(true);
    expect(/denied\s*\+=\s*s\.deniedCount/.test(src)).toBe(true);
  });

  it("color-codes allowed-emerald + denied-destructive", () => {
    const src = readFileSync(panel, "utf8");
    expect(
      /allowed\s*>\s*0\s*\?\s*"text-emerald-600 dark:text-emerald-400"/.test(
        src,
      ),
    ).toBe(true);
    expect(/denied\s*>\s*0\s*\?\s*"text-destructive"/.test(src)).toBe(true);
  });

  it("render-gated on summariesQ.data with at least one row", () => {
    const src = readFileSync(panel, "utf8");
    // Multiple summariesQ refs exist; the aggregate is specifically
    // inside the Recent invocations Card.
    const card = src.slice(src.indexOf("Recent invocations"));
    expect(
      /summariesQ\.data\s*&&\s*summariesQ\.data\.length\s*>\s*0/.test(card),
    ).toBe(true);
  });
});
