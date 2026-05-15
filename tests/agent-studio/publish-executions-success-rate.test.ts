/**
 * Publish-executions settled success rate — PR-V1-223.
 *
 * The workspace-aggregate health summary (#957/PR-V1-206) shows
 * total / succeeded / pending / failed but no rate. Adds an
 * appended "X% success rate (settled)" metric using
 * succeeded / (succeeded + failed). Pending excluded so a backlog
 * doesn't suppress the rate. Color-mirrors a "≥99 emerald /
 * ≥90 amber / else destructive" heuristic.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-223 — publish-executions settled success rate", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );

  it("renders success rate with testid + tenths-of-a-percent precision", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="publish-executions-success-rate"');
    // succeeded / (succeeded + failed) — pending excluded.
    expect(src).toContain("const settled = succeeded + failed");
    expect(src).toContain("succeeded / settled");
    // 1 decimal place (× 1000 / 10).
    expect(/Math\.round\(\(succeeded\s*\/\s*settled\)\s*\*\s*1000\)\s*\/\s*10/.test(src)).toBe(true);
  });

  it("renders null guard when settled === 0 (no successes or failures yet)", () => {
    const src = readFileSync(panel, "utf8");
    // settled === 0 short-circuits the percent computation to null.
    expect(/settled\s*>\s*0[\s\S]*?:\s*null/.test(src)).toBe(true);
    // The rate row is rendered only when rate !== null.
    expect(/rate\s*!==\s*null/.test(src)).toBe(true);
  });

  it("color tiering matches a ≥99 / ≥90 / else SLO heuristic", () => {
    const src = readFileSync(panel, "utf8");
    expect(/rate\s*>=\s*99/.test(src)).toBe(true);
    expect(/rate\s*>=\s*90/.test(src)).toBe(true);
    expect(src).toContain("text-destructive");
    expect(src).toContain("text-emerald-600 dark:text-emerald-400");
    expect(src).toContain("text-amber-600 dark:text-amber-400");
  });

  it("title attribute names pending-exclusion explicitly", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "pending excluded so a backlog doesn't suppress the rate",
    );
  });
});
