/**
 * Bases governanceStatus multi-token chips — T-F.124
 * (T-F.2-γ-polish ζ).
 *
 * Replaces the comma-separated text input with chip pills when
 * `addField === "governanceStatus"`. addValue stays canonical
 * comma-separated string (what buildConditionFromForm consumes);
 * chip UI is a presentational layer that splits on read and
 * joins on write. Separate `addValueChipDraft` slice for the
 * currently-typed chip; Enter / comma commits; per-chip × removes.
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

describe("Bases governanceStatus chips (T-F.124 / T-F.2-γ-polish ζ)", () => {
  it("addValueChipDraft state slice initialised to empty string", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[addValueChipDraft,\s*setAddValueChipDraft\][\s\S]{0,150}useState<string>\(""\)/,
    );
  });

  it("parseChipList + chipListToCsv helpers split/trim/filter Boolean / join with comma-space", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+parseChipList\(csv:\s*string\):\s*string\[\][\s\S]{0,300}\.split\(","\)[\s\S]{0,200}\.map\(\(s\)\s*=>\s*s\.trim\(\)\)[\s\S]{0,200}\.filter\(Boolean\)/,
    );
    expect(src).toMatch(
      /function\s+chipListToCsv\(chips:\s*readonly\s+string\[\]\):\s*string[\s\S]{0,200}chips\.join\(",\s*"\)/,
    );
  });

  it("commitChipDraft early-returns when not on governanceStatus / empty draft + de-dupes vs existing", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+commitChipDraft\(\):\s*void[\s\S]{0,200}addField\s*!==\s*"governanceStatus"[\s\S]{0,150}return[\s\S]{0,400}parseChipList\(addValueChipDraft\)[\s\S]{0,300}newChips\.length\s*===\s*0[\s\S]{0,150}return[\s\S]{0,400}parseChipList\(addValue\)[\s\S]{0,400}next\.includes\(c\)/,
    );
  });

  it("removeChipAt filters by index + persists via chipListToCsv → setAddValue", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+removeChipAt\(idx:\s*number\):\s*void[\s\S]{0,400}parseChipList\(addValue\)[\s\S]{0,200}setAddValue\(chipListToCsv\(chips\.filter\(\(_,\s*i\)\s*=>\s*i\s*!==\s*idx\)\)\)/,
    );
  });

  it("resetForm clears addValueChipDraft along with the other 5 form slices", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+resetForm\(\):\s*void[\s\S]{0,500}setAddValueChipDraft\(""\)/,
    );
  });

  it("governanceStatus branch renders chip pills container + per-chip remove + secondary input", () => {
    const src = readPanel();
    expect(src).toMatch(
      /addField\s*===\s*"governanceStatus"\s*\?\s*\([\s\S]{0,500}data-testid=\{`bases-row-detail-filters-add-chips-\$\{baseId\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-add-chip-\$\{baseId\}-\$\{idx\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-add-chip-remove-\$\{baseId\}-\$\{idx\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-add-chip-input-\$\{baseId\}`\}/,
    );
  });

  it("secondary input commits chip on Enter OR comma key + on blur", () => {
    const src = readPanel();
    expect(src).toMatch(
      /onKeyDown=\{\(e\)\s*=>\s*\{[\s\S]{0,400}e\.key\s*===\s*"Enter"\s*\|\|\s*e\.key\s*===\s*","[\s\S]{0,300}e\.preventDefault\(\)[\s\S]{0,150}commitChipDraft\(\)/,
    );
    expect(src).toMatch(/onBlur=\{commitChipDraft\}/);
  });

  it("non-governanceStatus branch unchanged (still routes through the 3-branch type ternary + bases-row-detail-filters-add-value testid)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\)\s*:\s*\([\s\S]{0,2500}data-testid=\{`bases-row-detail-filters-add-value-\$\{baseId\}`\}/,
    );
    expect(src).toMatch(
      /addField\s*===\s*"folderId"[\s\S]{0,80}"number"[\s\S]{0,200}addField\s*===\s*"updatedAt"[\s\S]{0,80}"datetime-local"/,
    );
  });
});
