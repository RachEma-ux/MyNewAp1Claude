/**
 * Graph-agent explain — slowest step gauge — PR-V1-231.
 *
 * The Why-This-Answer header shows total duration and step
 * count. For perf investigations the immediate follow-up is
 * "which step ate the most time" — and the answer is already in
 * the steps array. Adds an inline "Slowest: #i kind (Xms)"
 * gauge in the header.
 *
 * Skipped when every step has null durationMs (engine ran
 * without a timing adapter).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-231 — graph-agent explain slowest step", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/GraphAgentExplainPanel.tsx",
  );

  it("renders gauge with testid + max-by-durationMs reduction", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="graph-agent-explain-slowest-step"');
    expect(/let\s+slowest\s*=\s*explanation\.steps\[0\]/.test(src)).toBe(true);
    expect(/sMs\s*>\s*cMs/.test(src)).toBe(true);
  });

  it("treats null durationMs as -1 so all-null is detected via slowest.durationMs == null", () => {
    const src = readFileSync(panel, "utf8");
    expect(/s\.durationMs\s*\?\?\s*-1/.test(src)).toBe(true);
    expect(/slowest\.durationMs\s*==\s*null/.test(src)).toBe(true);
  });

  it("returns null when there are zero steps (no slowest to compute)", () => {
    const src = readFileSync(panel, "utf8");
    expect(/explanation\.steps\.length\s*===\s*0\s*\)\s*return\s+null/.test(src)).toBe(
      true,
    );
  });

  it("reuses the existing formatDuration helper", () => {
    const src = readFileSync(panel, "utf8");
    expect(/formatDuration\(slowest\.durationMs\)/.test(src)).toBe(true);
  });
});
