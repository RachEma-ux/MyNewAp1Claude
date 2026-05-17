/**
 * Bases closeAllRowEdits refactor — T-F.116 (T-F.2-a.4-narrow).
 *
 * Pivoted from the (j₂) clickable-rollup state-lift on RetrofitPage
 * (deferred — needs controlled-tabs refactor, larger scope) to this
 * within-Bases polish slice. Closes the explicit `closeAllRowEdits()`
 * extraction TODO noted in T-F.105 source code (lesson 65 trigger:
 * at N=5 row-mutation slices, the per-helper cross-clear lists grew
 * to 8-10 setStates each).
 *
 * Source-scan locks the helper's contract:
 * - resets all 5 mutation-input slices in one place
 * - does NOT touch expandedBaseId (inspection state per lesson 69)
 * - does NOT touch preview / share error slices (orthogonal)
 * - each open*() helper calls closeAllRowEdits() instead of inlining
 *   the cross-clears
 * - the open*() helpers shrink from 8-10 setStates to 3-4
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

describe("Bases closeAllRowEdits helper (T-F.116 / T-F.2-a.4-narrow)", () => {
  it("closeAllRowEdits declared with the 5-slice reset contract", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+closeAllRowEdits[\s\S]{0,1500}setRenameBaseId\(null\)[\s\S]{0,200}setRenameDraft\(""\)[\s\S]{0,200}setRenameError\(null\)[\s\S]{0,400}setConfirmDeleteBaseId\(null\)[\s\S]{0,200}setDeleteError\(null\)[\s\S]{0,400}setFilterEditBaseId\(null\)[\s\S]{0,200}setFilterEditDraft\(""\)[\s\S]{0,200}setFilterEditError\(null\)[\s\S]{0,400}setSortEditBaseId\(null\)[\s\S]{0,200}setSortEditDraft\(""\)[\s\S]{0,200}setSortEditError\(null\)[\s\S]{0,400}setColumnsEditBaseId\(null\)[\s\S]{0,200}setColumnsEditDraft\(""\)[\s\S]{0,200}setColumnsEditError\(null\)/,
    );
  });

  it("closeAllRowEdits does NOT touch expandedBaseId (inspection-state independence per lesson 69)", () => {
    const src = readPanel();
    const helperMatch = src.match(
      /function\s+closeAllRowEdits\([^)]*\)\s*\{([\s\S]*?)\n\s{0,2}\}/,
    );
    expect(helperMatch).not.toBeNull();
    const body = helperMatch![1];
    expect(body).not.toMatch(/setExpandedBaseId/);
  });

  it("closeAllRowEdits does NOT touch preview / share-error slices (orthogonal-axis independence)", () => {
    const src = readPanel();
    const helperMatch = src.match(
      /function\s+closeAllRowEdits\([^)]*\)\s*\{([\s\S]*?)\n\s{0,2}\}/,
    );
    expect(helperMatch).not.toBeNull();
    const body = helperMatch![1];
    expect(body).not.toMatch(/setPreviewBaseId/);
    expect(body).not.toMatch(/setOpenPreviewNoteId/);
    expect(body).not.toMatch(/setShareError/);
    expect(body).not.toMatch(/setShareErrorBaseId/);
  });

  it("all 5 open* helpers call closeAllRowEdits() instead of inlining cross-clears", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openRenameEditor[\s\S]{0,400}closeAllRowEdits\(\)/,
    );
    expect(src).toMatch(
      /function\s+openDeleteConfirm[\s\S]{0,400}closeAllRowEdits\(\)/,
    );
    expect(src).toMatch(
      /function\s+openFilterEditor[\s\S]{0,400}closeAllRowEdits\(\)/,
    );
    expect(src).toMatch(
      /function\s+openSortEditor[\s\S]{0,400}closeAllRowEdits\(\)/,
    );
    expect(src).toMatch(
      /function\s+openColumnsEditor[\s\S]{0,400}closeAllRowEdits\(\)/,
    );
  });

  it("rename + delete open* helpers ALSO clear expandedBaseId; filter/sort/columns do NOT (nested inside detail)", () => {
    const src = readPanel();
    // Rename + delete clear it (the row's top-level mutation state
    // takes the row out of "expanded detail" mode):
    expect(src).toMatch(
      /function\s+openRenameEditor[\s\S]{0,400}setExpandedBaseId\(null\)/,
    );
    expect(src).toMatch(
      /function\s+openDeleteConfirm[\s\S]{0,400}setExpandedBaseId\(null\)/,
    );
    // Filter/sort/columns editors live INSIDE the detail expansion,
    // so opening one must KEEP expandedBaseId set. Per-helper
    // assertion that setExpandedBaseId is NOT called.
    const filterMatch = src.match(
      /function\s+openFilterEditor\([^)]*\)\s*\{([\s\S]*?)\n\s{0,2}\}/,
    );
    expect(filterMatch).not.toBeNull();
    expect(filterMatch![1]).not.toMatch(/setExpandedBaseId/);
    const sortMatch = src.match(
      /function\s+openSortEditor\([^)]*\)\s*\{([\s\S]*?)\n\s{0,2}\}/,
    );
    expect(sortMatch).not.toBeNull();
    expect(sortMatch![1]).not.toMatch(/setExpandedBaseId/);
    const columnsMatch = src.match(
      /function\s+openColumnsEditor\([^)]*\)\s*\{([\s\S]*?)\n\s{0,2}\}/,
    );
    expect(columnsMatch).not.toBeNull();
    expect(columnsMatch![1]).not.toMatch(/setExpandedBaseId/);
  });
});
