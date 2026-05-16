/**
 * Graph Lens browser — visibility drill-in filter (T-F.73).
 *
 * Source-scan integrity test that locks the 3-button visibility
 * filter wiring (All / Visible only / Hidden only) on
 * `GraphLensBrowserPanel.tsx`. Composes with the typeKey filter
 * shipped at T-F.72 — both narrowers apply to the same
 * `filteredNodes` list.
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

describe("Graph Lens browser — visibility drill-in filter (T-F.73)", () => {
  it("panel holds visibilityFilter state at the panel level with the closed 3-mode union", () => {
    const src = readPanel();
    expect(src).toMatch(/const\s+\[visibilityFilter,\s*setVisibilityFilter\]/);
    expect(src).toMatch(/"all"\s*\|\s*"visible_only"\s*\|\s*"hidden_only"/);
    expect(src).toMatch(/useState[\s\S]{0,200}\("all"\)/);
  });

  it("lens-switch resets the visibility filter back to 'all'", () => {
    const src = readPanel();
    // After T-F.75, the per-filter reset lives in `clearAllFilters`
    // and `selectLens` delegates. Assert the helper body resets
    // visibility regardless of which path selectLens takes.
    expect(src).toMatch(
      /function\s+clearAllFilters[\s\S]{0,400}setVisibilityFilter\("all"\)/,
    );
  });

  it("RenderEnvelopeView receives visibilityFilter + onVisibilityFilterChange props", () => {
    const src = readPanel();
    expect(src).toMatch(/visibilityFilter:\s*"all"\s*\|\s*"visible_only"\s*\|\s*"hidden_only"/);
    expect(src).toMatch(/onVisibilityFilterChange:\s*\(/);
    expect(src).toMatch(/<RenderEnvelopeView[\s\S]{0,500}visibilityFilter=\{visibilityFilter\}/);
  });

  it("3-button group renders with one button per mode + per-mode testid", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-visibility-filter-group"/);
    expect(src).toMatch(/data-testid=\{`graph-lens-visibility-filter-\$\{mode\}`\}/);
    // The 3 mode values appear in the mapped tuple.
    expect(src).toMatch(
      /\["all",\s*"visible_only",\s*"hidden_only"\]\s+as\s+const/,
    );
    // Active mode highlights with bg-muted/50.
    expect(src).toMatch(/isActive[\s\S]{0,200}bg-muted\/50/);
  });

  it("filteredNodes composes BOTH the typeKey filter AND the visibility filter", () => {
    const src = readPanel();
    expect(src).toMatch(
      /typeKeyFilter\s*!=\s*null\s*&&\s*n\.typeKey\s*!==\s*typeKeyFilter/,
    );
    expect(src).toMatch(/visibilityFilter\s*===\s*"visible_only"\s*&&\s*!n\.visible/);
    expect(src).toMatch(/visibilityFilter\s*===\s*"hidden_only"\s*&&\s*n\.visible/);
  });

  it("hasAnyFilter is the OR of both axes — drives the nodes-preview header copy", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+hasAnyFilter\s*=[\s\S]{0,200}typeKeyFilter\s*!=\s*null[\s\S]{0,80}visibilityFilter\s*!==\s*"all"/,
    );
    // Header reads "matching filters" when hasAnyFilter is true,
    // otherwise the unfiltered count.
    expect(src).toMatch(
      /hasAnyFilter[\s\S]{0,200}matching filters[\s\S]{0,200}first 15 of \$\{snapshot\.nodes\.length\}/,
    );
  });

  it("empty-state row updates to mention filters (plural — both axes)", () => {
    const src = readPanel();
    expect(src).toContain("No nodes match the active filters.");
  });
});
