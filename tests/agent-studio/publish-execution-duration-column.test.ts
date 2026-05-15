/**
 * Publish-targets executions table duration column — PR-V1-194.
 *
 * Source-scan that the executions table now renders a derived
 * Duration column from `completedAt - startedAt`, with the
 * "<1s"/"Xs"/"Xm Ys" / "—" format, and the expanded-row colSpan
 * stays in sync.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-194 — publish executions duration column", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );

  it("renders a Duration column with fmtDuration helper", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(">Duration<");
    expect(/function\s+fmtDuration/.test(src)).toBe(true);
    expect(src).toContain("publish-execution-duration-");
    // Empty/missing case returns the standard em-dash placeholder.
    expect(src).toContain('return "—"');
    // Sub-second case.
    expect(/return\s+"<1s"/.test(src)).toBe(true);
    // Seconds-only.
    expect(/return\s+`\$\{totalSeconds\}s`/.test(src)).toBe(true);
    // Minutes + seconds.
    expect(/return\s+`\$\{minutes\}m\s+\$\{seconds\}s`/.test(src)).toBe(true);
    // Cell uses fmtDuration with startedAt + completedAt.
    expect(/fmtDuration\(r\.startedAt,\s*r\.completedAt\)/.test(src)).toBe(true);
  });

  it("expanded execution-details row colSpan stays in sync after adding the column", () => {
    const src = readFileSync(panel, "utf8");
    // Both expanded rows (target-config + execution-details) span 9
    // columns now that the executions table has 9 columns.
    expect(/colSpan=\{9\}/.test(src)).toBe(true);
    // There should be no stale colSpan=8 left behind.
    expect(/colSpan=\{8\}/.test(src)).toBe(false);
  });
});
