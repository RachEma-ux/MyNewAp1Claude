/**
 * Extensions invocations allow rate — PR-V1-224.
 *
 * Symmetric with publish-executions settled success rate (#974).
 * Every invocation is settled at capability-check time
 * (allowedCount + deniedCount = totalInvocations), so the rate
 * is simply allowed / total with no pending denominator. Same
 * ≥99 emerald / ≥90 amber / else destructive heuristic.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-224 — extensions invocations allow rate", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("renders allow rate with testid + tenths-of-a-percent precision", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="extensions-invocations-allow-rate"');
    expect(src).toContain("allowed / total");
    expect(
      /Math\.round\(\(allowed\s*\/\s*total\)\s*\*\s*1000\)\s*\/\s*10/.test(src),
    ).toBe(true);
  });

  it("null guard suppresses rate when total === 0", () => {
    const src = readFileSync(panel, "utf8");
    expect(/total\s*>\s*0[\s\S]*?:\s*null/.test(src)).toBe(true);
    expect(/rate\s*!==\s*null/.test(src)).toBe(true);
  });

  it("color tiering matches the ≥99 / ≥90 / else heuristic from #974", () => {
    const src = readFileSync(panel, "utf8");
    expect(/rate\s*>=\s*99/.test(src)).toBe(true);
    expect(/rate\s*>=\s*90/.test(src)).toBe(true);
    expect(src).toContain("text-destructive");
    expect(src).toContain("text-emerald-600 dark:text-emerald-400");
    expect(src).toContain("text-amber-600 dark:text-amber-400");
  });

  it("title attribute names settled-at-capability-check explicitly", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "every invocation is settled at capability-check time",
    );
  });
});
