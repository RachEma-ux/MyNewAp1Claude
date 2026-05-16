/**
 * Bases ownerScope drill-in — γ-slice (T-F.93 / T-F.2-γ).
 *
 * Adds the first drill-in axis on the bases list: ownerScope filter
 * (mine / all) routed server-side through the existing
 * `listVisibleSavedViews` Zod input. Zero new server work — the
 * filter axis was already accepted server-side; γ surfaces it.
 *
 * Mirrors the Quality Lens γ shape (lesson 51 — server-side
 * narrowing when LIMIT cap is in play; bases list has a 50-row cap).
 *
 * Source-scan integrity test locks: closed-taxonomy `as const`
 * tuple sourced from the server's enum, derived `hasOwnerScopeFilter`
 * flag, server-side filter pass-through, header copy adaptations,
 * filter button group testids + active-state styling, Clear button
 * gating, and the empty-state recovery copy when the filter
 * narrows to zero rows.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/BasesPanel.tsx",
    ),
    "utf8",
  );
}

describe("Bases ownerScope drill-in γ-slice (T-F.93 / T-F.2-γ)", () => {
  it("OWNER_SCOPE_VALUES is a closed-taxonomy `as const` tuple matching the server enum", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+OWNER_SCOPE_VALUES\s*=\s*\[\s*"mine",\s*"all"\s*\]\s+as\s+const/,
    );
    expect(src).toMatch(
      /type\s+OwnerScopeFilter\s*=\s*\(typeof\s+OWNER_SCOPE_VALUES\)\[number\]/,
    );
  });

  it("panel state holds ownerScopeFilter with default 'all' (no narrowing)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[ownerScopeFilter,\s*setOwnerScopeFilter\]\s*=\s*useState<OwnerScopeFilter>\("all"\)/,
    );
  });

  it("hasOwnerScopeFilter is derived from the default-comparison and drives gating", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+hasOwnerScopeFilter\s*=\s*ownerScopeFilter\s*!==\s*"all"/,
    );
    expect(src).toMatch(
      /function\s+clearOwnerScopeFilter[\s\S]{0,150}setOwnerScopeFilter\("all"\)/,
    );
  });

  it("filter is passed server-side through listVisibleSavedViews (NOT client-side narrowed)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /listVisibleSavedViews\.useQuery\([\s\S]{0,400}ownerScopeFilter\s*!==\s*"all"[\s\S]{0,200}ownerScope:\s*ownerScopeFilter/,
    );
  });

  it("filter button group has per-value testids + bases-owner-scope-filter-group wrapper", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="bases-owner-scope-filter-group"/);
    expect(src).toMatch(/data-testid=\{`bases-owner-scope-filter-\$\{mode\}`\}/);
    // Active mode renders with bg-muted (mirrors Quality Lens γ
    // active-state pattern).
    expect(src).toMatch(/isActive[\s\S]{0,200}bg-muted\/50/);
  });

  it("Clear-filter button only renders when filter is non-default", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{hasOwnerScopeFilter\s*\?\s*\([\s\S]{0,400}data-testid="bases-clear-owner-scope-filter"/,
    );
  });

  it("header copy adapts to filter + limit-cap state", () => {
    const src = readPanel();
    expect(src).toMatch(
      /reachedLimit[\s\S]{0,400}hasOwnerScopeFilter[\s\S]{0,200}first \$\{BASES_LIST_LIMIT\} matching scope/,
    );
    expect(src).toMatch(
      /reachedLimit[\s\S]{0,400}hasOwnerScopeFilter[\s\S]{0,400}matching scope/,
    );
  });

  it("empty-state copy distinguishes filter-narrowed-empty from genuinely-empty", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{hasOwnerScopeFilter\s*\?\s*\([\s\S]{0,400}No bases match the active scope filter[\s\S]{0,400}data-testid="bases-empty-state-clear-owner-scope"/,
    );
  });
});
