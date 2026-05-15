/**
 * Extensions list status-aggregate line — PR-V1-210.
 *
 * Fifth in the aggregate-summary mini-arc (#957–#960/this).
 * Surfaces status breakdown above the installed-extensions table
 * so operators see at a glance how many extensions are
 * approved/pending/rejected/disabled/revoked without scanning the
 * Status column.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-210 — extensions list status aggregate", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("renders status-aggregate line with testid + 5 closed-taxonomy counts", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="extensions-list-aggregate-summary"');
    // Closed taxonomy: approved / pending_approval / rejected /
    // disabled / revoked.
    expect(/case\s+"approved":/.test(src)).toBe(true);
    expect(/case\s+"pending_approval":/.test(src)).toBe(true);
    expect(/case\s+"rejected":/.test(src)).toBe(true);
    expect(/case\s+"disabled":/.test(src)).toBe(true);
    expect(/case\s+"revoked":/.test(src)).toBe(true);
  });

  it("color-codes pending-amber + rejected+revoked-destructive", () => {
    const src = readFileSync(panel, "utf8");
    expect(
      /pending\s*>\s*0[\s\S]{0,50}text-amber-600 dark:text-amber-400/.test(src),
    ).toBe(true);
    expect(
      /rejected\s*\+\s*revoked\s*>\s*0\s*\?\s*"text-destructive"/.test(src),
    ).toBe(true);
  });

  it("render-gated on listQ.data.length > 0", () => {
    const src = readFileSync(panel, "utf8");
    expect(/listQ\.data\s*&&\s*listQ\.data\.length\s*>\s*0/.test(src)).toBe(
      true,
    );
  });
});
