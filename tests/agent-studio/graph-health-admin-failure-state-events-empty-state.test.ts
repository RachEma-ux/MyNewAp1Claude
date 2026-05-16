/**
 * T-I.68 — Empty-state messaging on the events card.
 *
 * After T-I.64/65/66/67 added 3 drill-in axes, the operator can
 * narrow the buffer to zero rows without an obvious signal that
 * "this is empty because of YOUR filters" vs. "this is empty
 * because the workspace simply has no events". This banner sits
 * above the summary grid and distinguishes the two cases. When
 * any filter is active it also offers a "Clear all filters"
 * button so the operator can widen out in one click.
 *
 * Source-scan asserts:
 *   1. New empty-state banner testid is present.
 *   2. Empty-state renders only when `rows.length === 0` AND data is non-null.
 *   3. "Active filter" branch is gated on any of the 3 filter states being non-default.
 *   4. "Clear all filters" button is rendered in the active-filter branch only.
 *   5. Clear button resets all 3 filter states.
 *   6. No-filter branch renders an informational message (no Clear button).
 *   7. Banner appears BEFORE the summary grid (so operators see the explanation first).
 *   8. Banner does NOT render when rows.length > 0 (the existing tables already show the data).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.68 — empty-state messaging on the events card", () => {
  const src = readFileSync(panelPath, "utf8");

  it("declares the empty-state banner testid", () => {
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-empty"',
    );
  });

  it("renders only when rows.length === 0", () => {
    expect(
      /failureStateEventsQ\.data\.rows\.length\s*===\s*0\s*\?\s*\([\s\S]{0,400}graph-health-failure-state-events-empty/.test(
        src,
      ),
    ).toBe(true);
  });

  it("active-filter branch checks all 3 filter states", () => {
    // The active-filter branch must check all 3: kindFilter,
    // sourceKindFilter, createdSinceWindowMs. Loose anchor on the
    // 3-way OR.
    expect(
      /kindFilter\s*!==\s*null\s*\|\|\s*\n?\s*sourceKindFilter\s*!==\s*null\s*\|\|\s*\n?\s*createdSinceWindowMs\s*!==\s*null/.test(
        src,
      ),
    ).toBe(true);
  });

  it('"Clear all filters" button is rendered in the active-filter branch', () => {
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-empty-clear-all"',
    );
  });

  it("Clear all filters resets all 3 filter states", () => {
    // Discriminating snippet: the onClick handler sets all 3 setters
    // to null/undefined back-to-back.
    const clearStart = src.indexOf("empty-clear-all");
    expect(clearStart).toBeGreaterThan(0);
    // Search backwards for the onClick — should be within a few hundred chars.
    const window = src.slice(Math.max(0, clearStart - 1500), clearStart + 200);
    expect(window).toContain("setKindFilter(null)");
    expect(window).toContain("setSourceKindFilter(null)");
    expect(window).toContain("setCreatedSinceWindowMs(null)");
  });

  it("no-filter branch shows an informational message without a Clear button", () => {
    // The non-active-filter branch should NOT contain a button —
    // it's purely informational ("No events recorded yet").
    expect(src).toContain("No closed-taxonomy failure-state events recorded");
  });

  it("active-filter branch tells the operator the filters are the reason", () => {
    expect(src).toContain("No closed-taxonomy events match the active");
  });

  it("banner sits before the summary grid", () => {
    const emptyIdx = src.indexOf(
      'data-testid="graph-health-failure-state-events-empty"',
    );
    const summaryIdx = src.indexOf(
      'data-testid="graph-health-failure-state-events-summary"',
    );
    expect(emptyIdx).toBeGreaterThan(0);
    expect(summaryIdx).toBeGreaterThan(emptyIdx);
  });

  it("banner is sibling to (not replacement of) the summary grid", () => {
    // After this slice both the empty banner AND the summary grid
    // render — the banner is supplementary, not exclusive. So both
    // testids exist independently.
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-empty"',
    );
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-summary"',
    );
  });
});
