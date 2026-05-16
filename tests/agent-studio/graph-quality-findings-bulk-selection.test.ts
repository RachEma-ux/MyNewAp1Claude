/**
 * Graph Quality Findings bulk-dismiss selection model — ζ.1 slice
 * (T-F.89 / T-F.4-ζ.1).
 *
 * First half of the bulk-dismiss arc: introduces a Set-keyed
 * selection model, a per-row checkbox column (status-gated to
 * `open` findings per lesson 54), a header select-all checkbox that
 * unions/diffs the visible-open slice, and a top-of-table bulk
 * selection bar that appears when the selection is non-empty.
 *
 * No mutation wiring in this slice — that lands in ζ.2 (T-F.90) so
 * the diff stays narrowly reviewable. Source-scan integrity test
 * locks the state shape + the toggle helpers + the per-row testid
 * namespace + the colSpan bump on the expansion rows + mutual
 * independence from the existing per-row editors (trail / dismiss /
 * triage).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphQualityFindingsPanel.tsx",
    ),
    "utf8",
  );
}

describe("Graph Quality Findings bulk selection ζ.1-slice (T-F.89 / T-F.4-ζ.1)", () => {
  it("panel holds selectedFindingIds as a Set<number> at the panel level", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[selectedFindingIds,\s*setSelectedFindingIds\]\s*=\s*useState<Set<number>>/,
    );
    // Lazy initializer to avoid recreating the Set on every render.
    expect(src).toMatch(/useState<Set<number>>\(\s*\(\)\s*=>\s*new\s+Set\(\)/);
  });

  it("toggleFindingSelection + clearSelection helpers manage the selection slice", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+toggleFindingSelection[\s\S]{0,400}new\s+Set\(prev\)[\s\S]{0,200}next\.has\(findingId\)[\s\S]{0,80}next\.delete\(findingId\)[\s\S]{0,80}next\.add\(findingId\)/,
    );
    expect(src).toMatch(
      /function\s+clearSelection[\s\S]{0,150}setSelectedFindingIds\(new\s+Set\(\)\)/,
    );
  });

  it("per-row checkbox renders only when f.status === 'open' (status-gated affordance)", () => {
    const src = readPanel();
    expect(src).toMatch(/const\s+isSelectable\s*=\s*f\.status\s*===\s*"open"/);
    expect(src).toMatch(/const\s+isSelected\s*=\s*selectedFindingIds\.has\(f\.id\)/);
    expect(src).toMatch(
      /\{isSelectable\s*\?\s*\([\s\S]{0,500}data-testid=\{`graph-quality-finding-select-\$\{f\.id\}`\}/,
    );
  });

  it("page-level select-all checkbox unions/diffs the visible open slice", () => {
    const src = readPanel();
    // The selectableFindings derived list filters the visible page to open rows.
    expect(src).toMatch(
      /const\s+selectableFindings\s*=\s*findingsQ\.data\.filter\(\s*\(f\)\s*=>\s*f\.status\s*===\s*"open"/,
    );
    // pageAllSelected drives the header checkbox checked state.
    expect(src).toMatch(
      /const\s+pageAllSelected\s*=[\s\S]{0,300}selectableFindings\.every\([\s\S]{0,80}selectedFindingIds\.has\(f\.id\)/,
    );
    // togglePageAll diffs OR unions based on the current state.
    expect(src).toMatch(
      /function\s+togglePageAll[\s\S]{0,500}if\s*\(pageAllSelected\)[\s\S]{0,300}next\.delete\(f\.id\)[\s\S]{0,300}next\.add\(f\.id\)/,
    );
    // The header checkbox testid + disabled-on-empty + checked binding.
    expect(src).toMatch(/data-testid="graph-quality-bulk-select-all"/);
    expect(src).toMatch(/checked=\{pageAllSelected\}/);
    expect(src).toMatch(/disabled=\{selectableFindings\.length\s*===\s*0\}/);
  });

  it("bulk selection bar renders only when selectedFindingIds.size > 0 with count + Clear-selection", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{selectedFindingIds\.size\s*>\s*0\s*\?\s*\([\s\S]{0,800}data-testid="graph-quality-bulk-selection-bar"/,
    );
    expect(src).toMatch(/data-testid="graph-quality-bulk-selection-count"/);
    expect(src).toMatch(
      /\{selectedFindingIds\.size\}\s*selected/,
    );
    expect(src).toMatch(
      /data-testid="graph-quality-bulk-clear-selection"[\s\S]{0,200}onClick=\{clearSelection\}/,
    );
  });

  it("table header has a leading checkbox column ahead of id/class/severity/status/source", () => {
    const src = readPanel();
    // The bulk-select-all header cell appears before the id header.
    expect(src).toMatch(
      /data-testid="graph-quality-bulk-select-all"[\s\S]{0,400}<th[^>]*>id<\/th>/,
    );
  });

  it("expansion-row colSpan bumped from 6 to 7 to account for the new checkbox column", () => {
    const src = readPanel();
    // All three expansion rows (trail / triage / reason) must use colSpan={7}.
    const sevens = src.match(/colSpan=\{7\}/g);
    expect(sevens).not.toBeNull();
    expect(sevens!.length).toBeGreaterThanOrEqual(3);
    // No stale colSpan={6} should remain.
    expect(src).not.toMatch(/colSpan=\{6\}/);
  });

  it("selection is independent of trail / dismiss / triage editors (no cross-clearing)", () => {
    const src = readPanel();
    // openReasonEditor / openTriageEditor must NOT clear the selection
    // — the operator's selection persists while inspecting or per-row
    // mutating individual rows.
    expect(src).toMatch(
      /function\s+openReasonEditor[\s\S]{0,400}\}/,
    );
    expect(src).not.toMatch(
      /function\s+openReasonEditor[\s\S]{0,400}setSelectedFindingIds/,
    );
    expect(src).not.toMatch(
      /function\s+openTriageEditor[\s\S]{0,400}setSelectedFindingIds/,
    );
  });
});
