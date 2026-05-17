/**
 * Bases β open-into-edit for sort + columns — a.3-narrow slice
 * (T-F.105 / T-F.2-a.3).
 *
 * Third within-Bases NARROW slice; closes the arc. Mirrors the γ
 * filter-edit pattern for the remaining two β-detail sections
 * (Sort + Columns) so operators can edit ALL the saved-view fields
 * directly from the inline detail view, not just `name` (ε) and
 * `filters` (γ).
 *
 * Source-scan integrity test locks: new state slices (sortEdit*,
 * columnsEdit*), helper bodies + multi-way mutual exclusion at N=5
 * row-mutation slices, two new mutations (sortEditMutation,
 * columnsEditMutation), BaseRowDetail prop wiring, per-section
 * Save validators (JSON.parse + shape checks for object vs string-
 * array), inline editor testid namespaces.
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

describe("Bases sort + columns editors a.3-slice (T-F.105 / T-F.2-a.3)", () => {
  it("panel holds new sort + columns edit state slices", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[sortEditBaseId,\s*setSortEditBaseId\]\s*=\s*useState<number\s*\|\s*null>/,
    );
    expect(src).toMatch(
      /const\s+\[sortEditDraft,\s*setSortEditDraft\]\s*=\s*useState<string>/,
    );
    expect(src).toMatch(
      /const\s+\[sortEditError,\s*setSortEditError\]\s*=\s*useState<string\s*\|\s*null>/,
    );
    expect(src).toMatch(
      /const\s+\[columnsEditBaseId,\s*setColumnsEditBaseId\]\s*=\s*useState<number\s*\|\s*null>/,
    );
    expect(src).toMatch(
      /const\s+\[columnsEditDraft,\s*setColumnsEditDraft\]\s*=\s*useState<string>/,
    );
    expect(src).toMatch(
      /const\s+\[columnsEditError,\s*setColumnsEditError\]\s*=\s*useState<string\s*\|\s*null>/,
    );
  });

  it("openSortEditor + openColumnsEditor call closeAllRowEdits + set their own slices", () => {
    // T-F.116 refactor: the 4-other-slice cross-clear in each
    // open*() helper is now centralised in closeAllRowEdits(). The
    // multi-way mutual exclusion invariant lives on through that
    // single helper.
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openSortEditor[\s\S]{0,400}closeAllRowEdits\(\)[\s\S]{0,300}setSortEditBaseId\(baseId\)[\s\S]{0,150}setSortEditDraft\(currentJson\)/,
    );
    expect(src).toMatch(
      /function\s+openColumnsEditor[\s\S]{0,400}closeAllRowEdits\(\)[\s\S]{0,300}setColumnsEditBaseId\(baseId\)[\s\S]{0,150}setColumnsEditDraft\(currentJson\)/,
    );
  });

  it("closeAllRowEdits clears ALL 5 mutation slices in one place (refactor invariant)", () => {
    // T-F.116: the cross-clear of sort + columns slices is now in
    // closeAllRowEdits() rather than inlined in each existing
    // open*() helper. Test the contract via the helper presence
    // for all 5 mutation slices.
    const src = readPanel();
    expect(src).toMatch(
      /function\s+closeAllRowEdits[\s\S]{0,1200}setRenameBaseId\(null\)[\s\S]{0,800}setConfirmDeleteBaseId\(null\)[\s\S]{0,800}setFilterEditBaseId\(null\)[\s\S]{0,800}setSortEditBaseId\(null\)[\s\S]{0,800}setColumnsEditBaseId\(null\)/,
    );
    // All 3 existing open* helpers now call closeAllRowEdits:
    expect(src).toMatch(
      /function\s+openRenameEditor[\s\S]{0,400}closeAllRowEdits\(\)/,
    );
    expect(src).toMatch(
      /function\s+openDeleteConfirm[\s\S]{0,400}closeAllRowEdits\(\)/,
    );
    expect(src).toMatch(
      /function\s+openFilterEditor[\s\S]{0,400}closeAllRowEdits\(\)/,
    );
  });

  it("sortEditMutation + columnsEditMutation wired via updateSavedView with onSuccess + onError + invalidate", () => {
    const src = readPanel();
    expect(src).toMatch(
      /sortEditMutation\s*=\s*[\s\S]{0,300}updateSavedView\.useMutation/,
    );
    expect(src).toMatch(
      /sortEditMutation[\s\S]{0,500}onSuccess[\s\S]{0,500}closeSortEditor\(\)/,
    );
    expect(src).toMatch(
      /sortEditMutation[\s\S]{0,800}utils\.agentStudio\.vault\.listVisibleSavedViews\.invalidate/,
    );
    expect(src).toMatch(
      /columnsEditMutation\s*=\s*[\s\S]{0,300}updateSavedView\.useMutation/,
    );
    expect(src).toMatch(
      /columnsEditMutation[\s\S]{0,500}onSuccess[\s\S]{0,500}closeColumnsEditor\(\)/,
    );
    expect(src).toMatch(
      /columnsEditMutation[\s\S]{0,800}utils\.agentStudio\.vault\.listVisibleSavedViews\.invalidate/,
    );
  });

  it("Sort Save handler runs JSON.parse → object-shape check → mutation; rejects arrays + null + primitives", () => {
    const src = readPanel();
    expect(src).toMatch(
      /JSON\.parse\(sortEditDraft\)[\s\S]{0,400}catch[\s\S]{0,300}setSortEditError\([\s\S]{0,300}Invalid JSON/,
    );
    expect(src).toMatch(
      /parsed\s*===\s*null\s*\|\|\s*typeof\s+parsed\s*!==\s*"object"\s*\|\|\s*Array\.isArray\(parsed\)[\s\S]{0,400}setSortEditError\([\s\S]{0,400}Sort must be a JSON object/,
    );
    expect(src).toMatch(
      /sortEditMutation\.mutate\(\{[\s\S]{0,300}id:\s*b\.id[\s\S]{0,200}sort:\s*parsed\s+as\s+Record<string,\s*unknown>/,
    );
  });

  it("Columns Save handler runs JSON.parse → string[]-shape check → mutation; rejects non-arrays + non-string members", () => {
    const src = readPanel();
    expect(src).toMatch(
      /JSON\.parse\(columnsEditDraft\)[\s\S]{0,400}catch[\s\S]{0,300}setColumnsEditError\([\s\S]{0,300}Invalid JSON/,
    );
    expect(src).toMatch(
      /!Array\.isArray\(parsed\)\s*\|\|\s*!parsed\.every\(\(c\)\s*=>\s*typeof\s+c\s*===\s*"string"\)[\s\S]{0,400}setColumnsEditError\([\s\S]{0,400}Columns must be a JSON array of strings/,
    );
    expect(src).toMatch(
      /columnsEditMutation\.mutate\(\{[\s\S]{0,300}id:\s*b\.id[\s\S]{0,200}columns:\s*parsed\s+as\s+string\[\]/,
    );
  });

  it("Edit sort/columns buttons gated on !isOpen + have per-row testids", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{!sortEdit\.isOpen\s*\?\s*\([\s\S]{0,500}data-testid=\{`bases-row-detail-sort-edit-\$\{base\.id\}`\}[\s\S]{0,300}onClick=\{sortEdit\.onOpen\}/,
    );
    expect(src).toMatch(/Edit sort…/);
    expect(src).toMatch(
      /\{!columnsEdit\.isOpen\s*\?\s*\([\s\S]{0,500}data-testid=\{`bases-row-detail-columns-edit-\$\{base\.id\}`\}[\s\S]{0,300}onClick=\{columnsEdit\.onOpen\}/,
    );
    expect(src).toMatch(/Edit columns…/);
  });

  it("Sort + Columns editors each have textarea + Save + Cancel + error testids", () => {
    const src = readPanel();
    for (const name of ["sort", "columns"]) {
      expect(src).toMatch(
        new RegExp(`data-testid=\\{\`bases-row-detail-${name}-editor-\\$\\{base\\.id\\}\`\\}`),
      );
      expect(src).toMatch(
        new RegExp(`data-testid=\\{\`bases-row-detail-${name}-textarea-\\$\\{base\\.id\\}\`\\}`),
      );
      expect(src).toMatch(
        new RegExp(`data-testid=\\{\`bases-row-detail-${name}-save-\\$\\{base\\.id\\}\`\\}`),
      );
      expect(src).toMatch(
        new RegExp(`data-testid=\\{\`bases-row-detail-${name}-cancel-\\$\\{base\\.id\\}\`\\}`),
      );
      expect(src).toMatch(
        new RegExp(`data-testid=\\{\`bases-row-detail-${name}-error-\\$\\{base\\.id\\}\`\\}`),
      );
    }
  });

  it("openSortEditor draft pre-populates with JSON.stringify(b.sort ?? {}), openColumnsEditor with b.columns ?? []", () => {
    const src = readPanel();
    // The actual call is multi-line so allow whitespace + an optional
    // trailing comma between the JSON.stringify close and the
    // openSortEditor close.
    expect(src).toMatch(
      /openSortEditor\([\s\S]{0,200}b\.id,[\s\S]{0,200}JSON\.stringify\(b\.sort\s*\?\?\s*\{\},\s*null,\s*2\)/,
    );
    expect(src).toMatch(
      /openColumnsEditor\([\s\S]{0,200}b\.id,[\s\S]{0,200}JSON\.stringify\(b\.columns\s*\?\?\s*\[\],\s*null,\s*2\)/,
    );
  });
});
