/**
 * Graph-health oldest-alert summary — PR-V1-226.
 *
 * The Age column (#976) lets operators sort/scan within rows,
 * but the headline "how stale is the longest-open alert?"
 * question still requires reading the whole table. Adds a
 * one-line summary above the severity breakdown surfacing the
 * oldest open alert + its severity + its age — independent of
 * the severity-tier signal.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-226 — graph-health oldest-alert summary", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
  );

  it("renders line with testid + reuses fmtAge + severityClass", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      'data-testid="graph-health-oldest-alert-summary"',
    );
    expect(src).toContain("fmtAge(oldest.raisedAt)");
    expect(src).toContain("severityClass(oldest.severity)");
  });

  it("uses min-by-raisedAt with NaN-safe guards", () => {
    const src = readFileSync(panel, "utf8");
    expect(/let\s+oldest\s*=\s*openQ\.data\[0\]/.test(src)).toBe(true);
    expect(/Number\.isFinite\(aMs\)/.test(src)).toBe(true);
    expect(/aMs\s*<\s*oldestMs/.test(src)).toBe(true);
  });

  it("render-gated on openQ.data.length > 0", () => {
    const src = readFileSync(panel, "utf8");
    // The render guard appears twice now in this region (oldest +
    // severity breakdown). Both must be present.
    const matches = src.match(/openQ\.data\s*&&\s*openQ\.data\.length\s*>\s*0/g);
    expect(matches).not.toBeNull();
    expect((matches as RegExpMatchArray).length).toBeGreaterThanOrEqual(2);
  });
});
