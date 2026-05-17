/**
 * Bases rich-form add-condition — T-F.120 (T-F.2-γ-polish β).
 *
 * Builds on T-F.119 α (parsed-conditions summary + per-chip Remove)
 * by adding an inline add-condition form below the chip list:
 * field picker → (op picker for updatedAt only) → value input with
 * type-aware placeholder → Add button → append to draft JSON.
 *
 * Source-scan locks the form state + buildConditionFromForm logic
 * (covers all 5 V1 variants + 32-condition cap + parsed-must-exist
 * guard) + UI gating + per-error testid surfaces.
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

describe("Bases rich-form add-condition (T-F.120 / T-F.2-γ-polish β)", () => {
  it("form state slices initialised (field=\"\", op=\"gte\", value=\"\", error=null)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[addField,\s*setAddField\][\s\S]{0,500}useState<\s*[\s\S]{0,200}"folderId"\s*\|\s*"slug"\s*\|\s*"title"\s*\|\s*"governanceStatus"\s*\|\s*"updatedAt"/,
    );
    expect(src).toMatch(
      /const\s+\[addOp,\s*setAddOp\][\s\S]{0,200}useState<"gte"\s*\|\s*"lte">\("gte"\)/,
    );
    expect(src).toMatch(
      /const\s+\[addValue,\s*setAddValue\][\s\S]{0,100}useState<string>\(""\)/,
    );
    expect(src).toMatch(
      /const\s+\[addError,\s*setAddError\][\s\S]{0,150}useState<string\s*\|\s*null>\(null\)/,
    );
  });

  it("buildConditionFromForm covers all 5 V1 variants with per-field validation", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+buildConditionFromForm\(\):\s*FilterCondition\s*\|\s*null[\s\S]{0,1800}case\s+"folderId"[\s\S]{0,400}Number\.isInteger\(n\)[\s\S]{0,400}case\s+"slug"[\s\S]{0,300}case\s+"title"[\s\S]{0,300}case\s+"governanceStatus"[\s\S]{0,500}split\(","\)[\s\S]{0,400}case\s+"updatedAt"[\s\S]{0,400}Date\.parse/,
    );
  });

  it("addCondition guards: parsed-must-exist + 32-condition cap + buildCondition error", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+addCondition\(\):\s*void[\s\S]{0,800}parsed\s*===\s*null[\s\S]{0,300}fix the JSON first[\s\S]{0,300}conditions\.length\s*>=\s*32[\s\S]{0,200}Max 32 conditions[\s\S]{0,400}buildConditionFromForm\(\)/,
    );
    expect(src).toMatch(
      /onChange\(JSON\.stringify\(next,\s*null,\s*2\)\)[\s\S]{0,300}setAddField\(""\)/,
    );
  });

  it("field-picker dropdown lists all 5 V1 variants + placeholder option", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-add-field-\$\{baseId\}`\}/,
    );
    expect(src).toMatch(/<option value="">\+ Add condition…<\/option>/);
    expect(src).toMatch(/<option value="folderId">folderId<\/option>/);
    expect(src).toMatch(/<option value="slug">slug<\/option>/);
    expect(src).toMatch(/<option value="title">title<\/option>/);
    expect(src).toMatch(
      /<option value="governanceStatus">governanceStatus<\/option>/,
    );
    expect(src).toMatch(/<option value="updatedAt">updatedAt<\/option>/);
  });

  it("op-picker rendered ONLY for updatedAt field with gte/lte options", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{addField\s*===\s*"updatedAt"\s*\?\s*\([\s\S]{0,500}data-testid=\{`bases-row-detail-filters-add-op-\$\{baseId\}`\}[\s\S]{0,300}<option value="gte">gte<\/option>[\s\S]{0,200}<option value="lte">lte<\/option>/,
    );
  });

  it("value input rendered when field selected + type-aware placeholders + Add button", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{addField\s*!==\s*""\s*\?\s*\([\s\S]{0,2500}data-testid=\{`bases-row-detail-filters-add-value-\$\{baseId\}`\}/,
    );
    expect(src).toMatch(/data-testid=\{`bases-row-detail-filters-add-submit-\$\{baseId\}`\}/);
    expect(src).toMatch(/positive integer/);
    expect(src).toMatch(/comma-separated/);
    expect(src).toMatch(/ISO-8601/);
  });

  it("add-error surface gated on addError !== null with per-baseId testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /addError\s*!==\s*null[\s\S]{0,300}data-testid=\{`bases-row-detail-filters-add-error-\$\{baseId\}`\}/,
    );
  });

  it("form bar wrapper testid + disabled-when-mutation-pending propagates to field-picker", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-add-\$\{baseId\}`\}/,
    );
    expect(src).toMatch(
      /<select[\s\S]{0,300}value=\{addField\}[\s\S]{0,300}disabled=\{disabled\}/,
    );
  });

  it("empty-conditions branch reframed as inline span (still inside summary wrapper so the add-form renders below it)", () => {
    // T-F.120 reorganised the empty branch: instead of an early
    // return, the empty-state lives inside the same wrapper that
    // holds the add-form. Operator can add the FIRST condition
    // from the empty state.
    const src = readPanel();
    expect(src).toMatch(
      /parsed\.conditions\.length\s*===\s*0\s*\?\s*\([\s\S]{0,400}data-testid=\{`bases-row-detail-filters-summary-empty-\$\{baseId\}`\}[\s\S]{0,400}base matches all notes/,
    );
  });
});
