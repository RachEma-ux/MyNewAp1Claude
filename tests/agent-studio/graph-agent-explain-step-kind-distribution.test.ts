/**
 * Graph-agent explain — step-kind distribution — PR-V1-232.
 *
 * The per-step ledger shows each step's `stepKind` row-by-row,
 * but no aggregated shape. A 50-step run that's 90% one kind
 * hints at a loop or fallback chain; a balanced distribution
 * is healthy. Adds an inline distribution line above the ledger
 * showing each distinct kind with its count, sorted desc.
 *
 * Reuses the pin-distribution shape from RegionAdminPanel
 * (#969) — same Map<string, number> + sort-by-count.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-232 — graph-agent explain step-kind distribution", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/GraphAgentExplainPanel.tsx",
  );

  it("renders distribution with testid + Map<string, number> + count++", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      'data-testid="graph-agent-explain-step-kind-distribution"',
    );
    expect(/new\s+Map<string,\s*number>\(\)/.test(src)).toBe(true);
    expect(/byKind\.get\(s\.stepKind\)\s*\?\?\s*0/.test(src)).toBe(true);
  });

  it("sorts by count descending so heaviest kind shows first", () => {
    const src = readFileSync(panel, "utf8");
    // Allow whitespace between the open-paren of .sort( and the
    // arrow function (the panel uses a multi-line call).
    expect(/\.sort\([\s\S]{0,40}b\[1\]\s*-\s*a\[1\]/.test(src)).toBe(true);
  });

  it("render-gated on steps.length > 0", () => {
    const src = readFileSync(panel, "utf8");
    // The gate appears just above the distribution paragraph.
    expect(
      /explanation\.steps\.length\s*>\s*0[\s\S]{0,400}graph-agent-explain-step-kind-distribution/.test(
        src,
      ),
    ).toBe(true);
  });
});
