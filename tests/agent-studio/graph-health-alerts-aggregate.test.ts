/**
 * Graph health open alerts severity-aggregate line — PR-V1-208.
 *
 * Same pattern as publish-executions aggregate (#957) and
 * extensions invocations aggregate (#958). Sums openQ.data by
 * severity and surfaces a one-line breakdown above the table.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-208 — graph health open alerts severity aggregate", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
  );

  it("renders severity-aggregate line with testid + 3 counts", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      'data-testid="graph-health-alerts-aggregate-summary"',
    );
    expect(/a\.severity\s*===\s*"critical"/.test(src)).toBe(true);
    expect(/a\.severity\s*===\s*"warning"/.test(src)).toBe(true);
    expect(/a\.severity\s*===\s*"info"/.test(src)).toBe(true);
  });

  it("color-codes critical-destructive + warning-amber", () => {
    const src = readFileSync(panel, "utf8");
    expect(/critical\s*>\s*0\s*\?\s*"text-destructive"/.test(src)).toBe(true);
    expect(
      /warning\s*>\s*0\s*\?\s*"text-amber-600 dark:text-amber-400"/.test(src),
    ).toBe(true);
  });

  it("render-gated on openQ.data with at least one row", () => {
    const src = readFileSync(panel, "utf8");
    expect(/openQ\.data\s*&&\s*openQ\.data\.length\s*>\s*0/.test(src)).toBe(
      true,
    );
  });
});
