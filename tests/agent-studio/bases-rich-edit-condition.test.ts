/**
 * Bases rich-form edit-existing-condition — T-F.121 (T-F.2-γ-polish γ).
 *
 * Completes the rich-form trio (α summary + remove, β add, γ edit).
 * Per-chip Edit button pre-fills the form state from the condition;
 * Save calls buildConditionFromForm (shared with Add) but REPLACES
 * the slot at editingIdx; Cancel exits without changes. Mutually
 * exclusive with Add (same form-state slices; switching to Edit
 * locks the field-picker so the slot type can't be corrupted).
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

describe("Bases rich-form edit-condition (T-F.121 / T-F.2-γ-polish γ)", () => {
  it("editingIdx state slice initialised to null", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[editingIdx,\s*setEditingIdx\][\s\S]{0,200}useState<number\s*\|\s*null>\(null\)/,
    );
  });

  it("openEditCondition pre-fills form via full switch over 5 field variants", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+openEditCondition\(idx:\s*number,\s*c:\s*FilterCondition\):\s*void[\s\S]{0,200}setEditingIdx\(idx\)[\s\S]{0,200}setAddField\(c\.field\)[\s\S]{0,2000}case\s+"folderId"[\s\S]{0,300}String\(c\.value\)[\s\S]{0,300}case\s+"slug"[\s\S]{0,200}case\s+"title"[\s\S]{0,300}case\s+"governanceStatus"[\s\S]{0,400}c\.value\.join\(",\s*"\)[\s\S]{0,300}case\s+"updatedAt"[\s\S]{0,300}setAddOp\(c\.op\)/,
    );
  });

  it("saveEditCondition replaces the slot at editingIdx via .map (not .push)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+saveEditCondition\(\):\s*void[\s\S]{0,800}buildConditionFromForm\(\)[\s\S]{0,400}parsed\.conditions\.map\(\(existing,\s*i\)\s*=>\s*i\s*===\s*editingIdx\s*\?\s*c\s*:\s*existing/,
    );
  });

  it("resetForm helper clears editingIdx along with field/value/op/error (shared with Add success)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+resetForm\(\):\s*void[\s\S]{0,500}setAddField\(""\)[\s\S]{0,150}setAddValue\(""\)[\s\S]{0,150}setAddOp\("gte"\)[\s\S]{0,150}setAddError\(null\)[\s\S]{0,150}setEditingIdx\(null\)/,
    );
  });

  it("cancelEditCondition delegates to resetForm (no separate clear logic)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+cancelEditCondition\(\):\s*void[\s\S]{0,150}resetForm\(\)/,
    );
  });

  it("per-chip Edit button with testid + disabled while another edit is open", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-summary-edit-\$\{baseId\}-\$\{idx\}`\}/,
    );
    expect(src).toMatch(
      /disabled=\{disabled\s*\|\|\s*editingIdx\s*!==\s*null\}[\s\S]{0,300}onClick=\{\(\)\s*=>\s*openEditCondition\(idx,\s*c\)/,
    );
  });

  it("Remove button now also disabled while an Edit is open (avoid deletion underneath an active edit)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /disabled=\{disabled\s*\|\|\s*editingIdx\s*!==\s*null\}[\s\S]{0,300}onClick=\{\(\)\s*=>\s*removeConditionAt\(idx\)/,
    );
  });

  it("field-picker disabled + relabeled while editing + placeholder names the editing index", () => {
    const src = readPanel();
    expect(src).toMatch(
      /disabled=\{disabled\s*\|\|\s*editingIdx\s*!==\s*null\}[\s\S]{0,300}data-testid=\{`bases-row-detail-filters-add-field-\$\{baseId\}`\}/,
    );
    expect(src).toMatch(
      /editingIdx\s*!==\s*null[\s\S]{0,200}`Editing condition #\$\{editingIdx\s*\+\s*1\}`/,
    );
  });

  it("form submit-bar branches: Add (editingIdx === null) vs Save+Cancel (editing)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /editingIdx\s*===\s*null\s*\?\s*\([\s\S]{0,800}data-testid=\{`bases-row-detail-filters-add-submit-\$\{baseId\}`\}[\s\S]{0,500}\)\s*:\s*\([\s\S]{0,1200}data-testid=\{`bases-row-detail-filters-edit-save-\$\{baseId\}`\}[\s\S]{0,800}data-testid=\{`bases-row-detail-filters-edit-cancel-\$\{baseId\}`\}/,
    );
  });

  it("addCondition success path delegates to shared resetForm (no inline clear)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+addCondition\(\):\s*void[\s\S]{0,1500}onChange\(JSON\.stringify\(next,\s*null,\s*2\)\);\s*resetForm\(\)/,
    );
  });
});
