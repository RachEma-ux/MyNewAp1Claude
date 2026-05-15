/**
 * Canvas-projection-events drain tick success rate — PR-V1-228.
 *
 * Third in the success-rate mini-arc (#974 publish executions /
 * #975 extensions invocations / this). The drain status shows
 * "Last tick processed: N events" + "(X failed)" but no rate.
 * The processed/failed split is settled at drain-time so no
 * pending denominator is needed. Adds an inline "Tick success
 * rate: X%" line using the same ≥99 emerald / ≥90 amber / else
 * destructive heuristic.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-228 — drain tick success rate", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/CanvasProjectionEventsDrainStatusPanel.tsx",
  );

  it("renders rate with testid + processed/(processed+failed) computation", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="drain-tick-success-rate"');
    expect(
      /const\s+processed\s*=\s*status\.lastTickResult\.totalProcessed/.test(src),
    ).toBe(true);
    expect(
      /const\s+failed\s*=\s*status\.lastTickResult\.totalFailed/.test(src),
    ).toBe(true);
    expect(/Math\.round\(\(processed\s*\/\s*total\)\s*\*\s*1000\)\s*\/\s*10/.test(src)).toBe(true);
  });

  it("render gate suppresses the line for an idle tick (total === 0)", () => {
    const src = readFileSync(panel, "utf8");
    // total = processed + failed > 0 is the gate.
    expect(
      /totalProcessed\s*\+[\s\S]{0,40}totalFailed\s*>\s*\n?\s*0/.test(src),
    ).toBe(true);
  });

  it("color tiering matches ≥99 / ≥90 / else heuristic from #974/#975", () => {
    const src = readFileSync(panel, "utf8");
    expect(/rate\s*>=\s*99/.test(src)).toBe(true);
    expect(/rate\s*>=\s*90/.test(src)).toBe(true);
    expect(src).toContain("text-destructive");
    expect(src).toContain("text-emerald-600 dark:text-emerald-400");
    expect(src).toContain("text-amber-600 dark:text-amber-400");
  });

  it("title tooltip names settled-at-drain-time explicitly", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("settled at drain time");
  });
});
