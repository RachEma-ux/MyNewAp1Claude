/**
 * Bases type-aware updatedAt datetime-local input — T-F.123
 * (T-F.2-γ-polish ε).
 *
 * Builds on T-F.122 (folderId number input). Replaces the rich-
 * form add/edit value input with `<input type="datetime-local">`
 * when `addField === "updatedAt"`. Operator gets a native
 * date+time picker; addValue stays canonical ISO-8601 internally
 * (what buildConditionFromForm consumes and openEditCondition
 * pre-fills with).
 *
 * Source-scan locks:
 * - ISO ↔ local-time conversion helpers
 * - 3-branch input type (folderId / updatedAt / text)
 * - per-branch value + onChange wiring (updatedAt routes through
 *   the conversion helpers; folderId / others stay plain)
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

describe("Bases type-aware updatedAt input (T-F.123 / T-F.2-γ-polish ε)", () => {
  it("isoToLocalInputValue helper declared with empty / invalid-date fallbacks", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+isoToLocalInputValue\(iso:\s*string\):\s*string[\s\S]{0,500}if\s*\(iso\s*===\s*""\)\s+return\s+""[\s\S]{0,200}Number\.isNaN\(d\.getTime\(\)\)[\s\S]{0,400}padStart\(2,\s*"0"\)/,
    );
  });

  it("localInputValueToIso helper uses Date.toISOString + empty / invalid-date fallbacks", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+localInputValueToIso\(local:\s*string\):\s*string[\s\S]{0,500}if\s*\(local\s*===\s*""\)\s+return\s+""[\s\S]{0,200}Number\.isNaN\(d\.getTime\(\)\)[\s\S]{0,200}d\.toISOString\(\)/,
    );
  });

  it("input type is a 3-branch ternary: folderId → number, updatedAt → datetime-local, else → text", () => {
    const src = readPanel();
    expect(src).toMatch(
      /type=\{[\s\S]{0,200}addField\s*===\s*"folderId"[\s\S]{0,80}"number"[\s\S]{0,200}addField\s*===\s*"updatedAt"[\s\S]{0,80}"datetime-local"[\s\S]{0,80}"text"/,
    );
  });

  it("input value routes through isoToLocalInputValue for updatedAt; plain addValue otherwise", () => {
    const src = readPanel();
    expect(src).toMatch(
      /value=\{\s*addField\s*===\s*"updatedAt"\s*\?\s*isoToLocalInputValue\(addValue\)\s*:\s*addValue\s*\}/,
    );
  });

  it("input onChange routes through localInputValueToIso for updatedAt; plain e.target.value otherwise", () => {
    const src = readPanel();
    expect(src).toMatch(
      /onChange=\{\(e\)\s*=>\s*setAddValue\(\s*addField\s*===\s*"updatedAt"\s*\?\s*localInputValueToIso\(e\.target\.value\)\s*:\s*e\.target\.value,?\s*\)\s*\}/,
    );
  });

  it("openEditCondition pre-fill for updatedAt still uses c.value directly (already ISO; the helpers convert at render-time only)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /case\s+"updatedAt":\s*setAddValue\(c\.value\)/,
    );
  });

  it("folderId number-input invariants preserved from T-F.122 (no regression)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /min=\{addField\s*===\s*"folderId"\s*\?\s*1\s*:\s*undefined\}/,
    );
    expect(src).toMatch(
      /step=\{addField\s*===\s*"folderId"\s*\?\s*1\s*:\s*undefined\}/,
    );
  });
});
