/**
 * Bases per-row expand-to-detail — β-slice (T-F.92 / T-F.2-β).
 *
 * Adds the first per-row affordance after the α-shell list: a
 * "View details" / "Hide details" toggle on each base row that
 * opens an inline detail row rendering the base's filters / sort /
 * columns / metadata from already-fetched `SavedViewRow` data.
 *
 * No new tRPC query — the detail uses data already loaded by
 * `listVisibleSavedViews` from α. Mirrors the Quality Lens θ
 * audit-trail expansion shape (lesson 56's mutual-exclusion
 * pattern via single `expandedBaseId: number | null`) without the
 * gated tRPC layer.
 *
 * Source-scan integrity test locks state shape, toggle wiring,
 * 4-section detail body (metadata / filters / sort / columns),
 * empty-state copy for each, and the colSpan + new action column.
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

describe("Bases per-row expand β-slice (T-F.92 / T-F.2-β)", () => {
  it("panel holds expandedBaseId state at the panel level", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[expandedBaseId,\s*setExpandedBaseId\]\s*=\s*useState<number\s*\|\s*null>/,
    );
  });

  it("View details / Hide details toggle wired with single-row mutual exclusion", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid=\{`bases-row-toggle-\$\{b\.id\}`\}/);
    expect(src).toMatch(
      /onClick=\{\(\)\s*=>\s*setExpandedBaseId\(isExpanded\s*\?\s*null\s*:\s*b\.id\)/,
    );
    expect(src).toMatch(/isExpanded\s*\?\s*"Hide details"\s*:\s*"View details"/);
  });

  it("expansion row uses Fragment wrapping + 6-col colSpan to span the new 6-column header", () => {
    const src = readPanel();
    expect(src).toMatch(/Fragment\s+key=\{b\.id\}/);
    expect(src).toMatch(
      /isExpanded\s*\?\s*\([\s\S]{0,400}colSpan=\{6\}/,
    );
    expect(src).toMatch(/data-testid=\{`bases-row-detail-\$\{b\.id\}`\}/);
  });

  it("table header gains a trailing empty action column for the toggle", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<thead>[\s\S]{0,600}<th[^>]*>id<\/th>[\s\S]{0,200}<th[^>]*>name<\/th>[\s\S]{0,200}<th[^>]*>visibility<\/th>[\s\S]{0,200}<th[^>]*>version<\/th>[\s\S]{0,200}<th[^>]*>updated<\/th>[\s\S]{0,200}<th[^>]*><\/th>/,
    );
  });

  it("BaseRowDetail renders 4 sections with testids: metadata / filters / sort / columns", () => {
    const src = readPanel();
    expect(src).toMatch(/function\s+BaseRowDetail/);
    expect(src).toMatch(/data-testid=\{`bases-row-detail-body-\$\{base\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`bases-row-detail-meta-\$\{base\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`bases-row-detail-filters-\$\{base\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`bases-row-detail-sort-\$\{base\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`bases-row-detail-columns-\$\{base\.id\}`\}/);
  });

  it("each section has an empty-state branch with its own testid", () => {
    const src = readPanel();
    expect(src).toMatch(/bases-row-detail-filters-empty-/);
    expect(src).toMatch(/bases-row-detail-sort-empty-/);
    expect(src).toMatch(/bases-row-detail-columns-empty-/);
  });

  it("filters + sort sections use JSON.stringify formatting for opaque data", () => {
    const src = readPanel();
    // The shape: when the dict has keys, render as a <pre> with
    // JSON.stringify(value, null, 2). Empty dicts fall through to
    // the empty-state branch.
    expect(src).toMatch(
      /Object\.keys\(base\.filters\)\.length\s*>\s*0[\s\S]{0,400}JSON\.stringify\(base\.filters,\s*null,\s*2\)/,
    );
    expect(src).toMatch(
      /Object\.keys\(base\.sort\)\.length\s*>\s*0[\s\S]{0,400}JSON\.stringify\(base\.sort,\s*null,\s*2\)/,
    );
  });

  it("β slice itself introduces NO new tRPC query (detail uses already-fetched row data); ceiling relaxed post-ζ to admit legitimately-new queries", () => {
    const src = readPanel();
    // β's contract: row-detail uses already-fetched `SavedViewRow`
    // data — NO new query at the β slice. Later slices (ζ) add their
    // own queries; this ceiling is "panel as a whole" (vaults + bases
    // + ζ preview = 3 useQuery() call sites, plus 1 `typeof
    // X.useQuery` *type* reference inside the BasePreview prop type
    // = 4 textual `.useQuery` matches), not a hard β invariant. The
    // point of the assertion is to catch a future slice that
    // needlessly re-fetches a row's detail data, not to forbid all
    // new useQuery references.
    const queryMatches = src.match(/\.useQuery\b/g);
    expect(queryMatches).not.toBeNull();
    expect(queryMatches!.length).toBeLessThanOrEqual(4);
  });
});
