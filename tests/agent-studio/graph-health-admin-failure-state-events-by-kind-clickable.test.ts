/**
 * T-I.65 — Clickable kind cells on the T-I.60 by-kind table.
 *
 * T-I.61 + T-I.64 together let operators see "which kind is loudest"
 * (the rollup) and "filter the stream to one kind" (the dropdown).
 * The natural fusion: clicking a kind in the rollup table sets the
 * T-I.64 filter dropdown to that kind. T-I.65 wires the click handler
 * onto each kind cell, plus visual highlight for the active row and
 * a toggle-off (clicking the already-active kind clears the filter).
 *
 * Source-scan asserts:
 *   1. Each row exposes a per-kind row testid.
 *   2. The Kind cell is a `<button>` (not plain text) for a11y.
 *   3. The button onClick calls setKindFilter — with a toggle that
 *      clears the filter when clicking the already-active kind.
 *   4. The active row gets a visual highlight (bg-muted/50).
 *   5. The button has a per-kind testid for E2E selectors.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.65 — clickable by-kind table rows on the failure-state events card", () => {
  const src = readFileSync(panelPath, "utf8");

  it("each row exposes a per-kind row testid", () => {
    expect(src).toContain(
      "data-testid={`graph-health-failure-state-events-by-kind-row-${kind}`}",
    );
  });

  it("each row exposes a per-kind filter-button testid", () => {
    expect(src).toContain(
      "data-testid={`graph-health-failure-state-events-by-kind-filter-${kind}`}",
    );
  });

  it("Kind cell is a <button> (not plain text)", () => {
    // The button must be inside the by-kind tbody. Anchor the regex
    // on the rollup table testid → button → the row's `kind` var.
    expect(
      /graph-health-failure-state-events-by-kind-table[\s\S]{0,3000}<button[^>]*onClick[\s\S]{0,400}\{kind\}/.test(
        src,
      ),
    ).toBe(true);
  });

  it("button onClick toggles setKindFilter on/off for the active kind", () => {
    // The trailing-comma form `setKindFilter(\n  kindFilter === kind ? null : kind,\n)`
    // doesn't fit a single closing-paren regex, so we check the
    // discriminating snippet directly.
    expect(
      /setKindFilter\(\s*kindFilter\s*===\s*kind\s*\?\s*null\s*:\s*kind/.test(
        src,
      ),
    ).toBe(true);
  });

  it("active row gets a bg-muted highlight (visual filter feedback)", () => {
    expect(
      /kindFilter\s*===\s*kind\s*\?\s*"bg-muted\/50"\s*:\s*""/.test(src),
    ).toBe(true);
  });

  it("renders the underline-on-hover affordance so the button reads as clickable", () => {
    expect(src).toContain("underline decoration-dotted");
  });

  it("clickable cells live inside the existing by-kind table (not a new table)", () => {
    const tableStart = src.indexOf(
      'data-testid="graph-health-failure-state-events-by-kind-table"',
    );
    const buttonTestidIdx = src.indexOf(
      "graph-health-failure-state-events-by-kind-filter-${kind}",
    );
    expect(tableStart).toBeGreaterThan(0);
    expect(buttonTestidIdx).toBeGreaterThan(tableStart);
    // No new <table> open tag should appear between the existing
    // table and the new button (we extended the same table, not added
    // a sibling).
    const between = src.slice(tableStart, buttonTestidIdx);
    expect(between).not.toMatch(/<table\s/);
  });
});
