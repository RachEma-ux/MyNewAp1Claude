/**
 * Graph-health open-alerts Age column — PR-V1-225.
 *
 * The open-alerts table renders raisedAt (ISO timestamp) but not
 * the time-since-raised. "How long has this alert been open" is
 * a more operator-friendly signal — a 3-day-old warning is
 * languishing and probably needs attention even if it's not
 * critical severity.
 *
 * Adds an Age column rendering "<1m / Xm / Xh Ym / Xd Yh" using
 * a parameterized-`now` formatter so future operator-derived
 * gauges (e.g. oldest-alert summary) can reuse it without
 * Date.now() coupling.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-225 — graph-health alert Age column", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
  );

  it("renders Age header + per-row testid + fmtAge call", () => {
    const src = readFileSync(panel, "utf8");
    // Header (whitespace-flexible).
    expect(/<th[^>]*>\s*Age\s*<\/th>/.test(src)).toBe(true);
    expect(src).toContain("`graph-health-alert-age-${a.id}`");
    expect(src).toContain("fmtAge(a.raisedAt)");
  });

  it("fmtAge tiering matches <1m / Xm / Xh Ym / Xd Yh", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('return "<1m"');
    expect(src).toContain("`${totalMinutes}m`");
    expect(src).toContain("`${hours}h ${minutes}m`");
    expect(src).toContain("`${days}d ${remHours}h`");
  });

  it("fmtAge `now` is parameterized so tests can pin time", () => {
    const src = readFileSync(panel, "utf8");
    // The signature should accept `now` with a default of Date.now().
    expect(/fmtAge\([^)]*now:\s*number\s*=\s*Date\.now\(\)/.test(src)).toBe(
      true,
    );
  });

  it("invalid / missing raisedAt → em-dash (defense in depth)", () => {
    const src = readFileSync(panel, "utf8");
    // Two distinct em-dash returns in fmtAge: null / NaN guards.
    const matches = src.match(/return\s+"—"/g) ?? [];
    // fmtTs has 2 em-dash returns; fmtAge adds 3 more (null,
    // NaN-getTime, negative-ms).
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});
