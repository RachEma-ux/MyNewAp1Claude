/**
 * Graph Lens browser — typeKey drill-in filter (T-F.72).
 *
 * Source-scan integrity test that locks the clickable-typeKey
 * rollup wiring in `GraphLensBrowserPanel.tsx`. Mirrors the kind-
 * filter source-scan pattern from T-I.64 / T-I.65 on the
 * GraphHealthAdminPanel events card.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PANEL_FILE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphLensBrowserPanel.tsx",
);

function readPanel(): string {
  return readFileSync(PANEL_FILE, "utf8");
}

describe("Graph Lens browser — typeKey drill-in filter (T-F.72)", () => {
  it("panel holds typeKeyFilter state at the panel level (resets across lens switches)", () => {
    const src = readPanel();
    expect(src).toMatch(/const\s+\[typeKeyFilter,\s*setTypeKeyFilter\]\s*=\s*useState<string\s*\|\s*null>/);
    // The selectLens helper exists and resets the filter to null.
    expect(src).toMatch(/function\s+selectLens\(/);
    expect(src).toMatch(/selectLens[\s\S]{0,200}setTypeKeyFilter\(null\)/);
  });

  it("RenderEnvelopeView receives typeKeyFilter + onTypeKeyFilterChange props", () => {
    const src = readPanel();
    expect(src).toMatch(/typeKeyFilter:\s*string\s*\|\s*null/);
    expect(src).toMatch(/onTypeKeyFilterChange:\s*\(next:\s*string\s*\|\s*null\)\s*=>\s*void/);
    expect(src).toMatch(/<RenderEnvelopeView[\s\S]{0,200}typeKeyFilter=\{typeKeyFilter\}/);
  });

  it("by-typeKey rollup rows are clickable buttons (per-row testid)", () => {
    const src = readPanel();
    // The button toggles the filter on/off and uses a per-row testid.
    expect(src).toMatch(/data-testid=\{`graph-lens-typekey-filter-\$\{typeKey\}`\}/);
    expect(src).toMatch(/onTypeKeyFilterChange\(isActive\s*\?\s*null\s*:\s*typeKey\)/);
  });

  it("active row is highlighted with bg-muted/50", () => {
    const src = readPanel();
    expect(src).toMatch(/isActive\s*\?\s*"bg-muted\/50"\s*:\s*""/);
  });

  it("Clear chip + filter chip render only when filter is active", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-typekey-filter-chip"/);
    expect(src).toMatch(/data-testid="graph-lens-typekey-filter-clear"/);
    // The Clear button calls onTypeKeyFilterChange(null).
    expect(src).toMatch(/data-testid="graph-lens-typekey-filter-clear"[\s\S]{0,300}onTypeKeyFilterChange\(null\)/);
  });

  it("filteredNodes uses the typeKey filter and feeds the nodes preview", () => {
    const src = readPanel();
    expect(src).toMatch(/const\s+filteredNodes\s*=/);
    // After T-F.73, filteredNodes composes typeKey + visibility
    // filters into a single predicate. The typeKey arm of that
    // predicate is what this test guards — using a non-greedy
    // regex so the composition is allowed.
    expect(src).toMatch(
      /typeKeyFilter\s*!=\s*null\s*&&\s*n\.typeKey\s*!==\s*typeKeyFilter/,
    );
    // The preview slices the FILTERED set, not the raw snapshot.
    expect(src).toMatch(/filteredNodes\.slice\(0,\s*15\)/);
  });

  it("empty-state row renders when filter narrows to zero matches", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-render-nodes-empty-after-filter"/);
    expect(src).toMatch(/filteredNodes\.length\s*===\s*0/);
  });
});
