/**
 * Graph Lens browser — Clear-all-filters one-click reset (T-F.75).
 *
 * Saturation-completion close per precedent (k) — mirrors T-I.68's
 * Clear-all-filters button on the failure-state events card.
 * After the 3-axis drill-in arc (typeKey + visibility + search),
 * this slice adds:
 *   - a panel-level `clearAllFilters()` helper that resets all
 *     three setters back-to-back;
 *   - a top-level "Clear all filters" affordance gated on
 *     `hasAnyFilter`;
 *   - the same button inline in the empty-state row when filters
 *     narrow to zero matches.
 *
 * selectLens(lensId) routes through `clearAllFilters` so the lens-
 * switch reset stays in lockstep with manual clears.
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

describe("Graph Lens browser — Clear-all-filters reset (T-F.75)", () => {
  it("panel exposes a clearAllFilters helper that resets all three drill-in setters", () => {
    const src = readPanel();
    expect(src).toMatch(/function\s+clearAllFilters\(\)/);
    const helperStart = src.indexOf("function clearAllFilters()");
    expect(helperStart).toBeGreaterThan(0);
    const helperEnd = src.indexOf("}", helperStart);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helper = src.slice(helperStart, helperEnd + 1);
    expect(helper).toContain("setTypeKeyFilter(null)");
    expect(helper).toContain('setVisibilityFilter("all")');
    expect(helper).toContain('setSearchQuery("")');
  });

  it("selectLens routes through clearAllFilters (lens-switch reset stays in lockstep)", () => {
    const src = readPanel();
    expect(src).toMatch(/function\s+selectLens\([\s\S]{0,200}clearAllFilters\(\)/);
  });

  it("RenderEnvelopeView receives onClearAllFilters prop and forwards it from the panel", () => {
    const src = readPanel();
    expect(src).toMatch(/onClearAllFilters:\s*\(\)\s*=>\s*void/);
    expect(src).toMatch(
      /<RenderEnvelopeView[\s\S]{0,800}onClearAllFilters=\{clearAllFilters\}/,
    );
  });

  it("top-level Clear-all-filters button renders only when hasAnyFilter is true", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-clear-all-filters"/);
    // Button is wrapped in a `hasAnyFilter ? … : null` gate.
    expect(src).toMatch(
      /hasAnyFilter\s*\?[\s\S]{0,400}data-testid="graph-lens-clear-all-filters"/,
    );
    // Click handler routes through the panel-supplied helper.
    expect(src).toMatch(
      /data-testid="graph-lens-clear-all-filters"[\s\S]{0,400}onClick=\{onClearAllFilters\}/,
    );
  });

  it("empty-state row includes an inline Clear-all-filters affordance", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-lens-empty-state-clear-all"/);
    expect(src).toMatch(
      /data-testid="graph-lens-empty-state-clear-all"[\s\S]{0,400}onClick=\{onClearAllFilters\}/,
    );
    // The inline button sits inside the existing
    // graph-lens-render-nodes-empty-after-filter cell so the
    // visual association with the empty-state row is preserved.
    const emptyRowStart = src.indexOf("graph-lens-render-nodes-empty-after-filter");
    const innerCtaIdx = src.indexOf("graph-lens-empty-state-clear-all");
    expect(innerCtaIdx).toBeGreaterThan(emptyRowStart);
  });
});
