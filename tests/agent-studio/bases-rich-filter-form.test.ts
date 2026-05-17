/**
 * Bases rich-form filter-condition summary — T-F.119 (T-F.2-γ-polish α).
 *
 * α slice: read-only structured visualization of the conditions
 * currently encoded in the filter-edit draft JSON, with per-chip
 * Remove. Full add/edit per-condition form (kind picker + adaptive
 * value inputs) deferred to β/γ follow-ups.
 *
 * Source-scan locks:
 * - new FilterConditionsSummary component with 4-prop signature
 * - defensive JSON.parse → parseFilterDocument fallback chain
 * - 3-branch render: unparseable / empty / non-empty
 * - per-condition describeCondition helper covers all 5 variants
 * - removeConditionAt rewrites JSON via JSON.stringify with 2-space indent
 * - summary rendered ABOVE the JSON textarea (operator sees structured
 *   view first; textarea remains primary edit surface)
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

describe("Bases rich-form filter summary (T-F.119 / T-F.2-γ-polish α)", () => {
  it("FilterConditionsSummary declared with 4-prop signature", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+FilterConditionsSummary\(\{[\s\S]{0,200}baseId,[\s\S]{0,100}draft,[\s\S]{0,100}disabled,[\s\S]{0,100}onChange,[\s\S]{0,500}baseId:\s*number;[\s\S]{0,200}draft:\s*string;[\s\S]{0,200}disabled:\s*boolean;[\s\S]{0,200}onChange:\s*\(next:\s*string\)\s*=>\s*void/,
    );
  });

  it("defensive JSON.parse → parseFilterDocument fallback (null on either failure)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /let\s+parsed:\s*FilterDocument\s*\|\s*null\s*=\s*null;\s*try\s*\{[\s\S]{0,300}parseFilterDocument\(JSON\.parse\(draft\)\)[\s\S]{0,100}\}\s*catch\s*\{[\s\S]{0,100}parsed\s*=\s*null/,
    );
  });

  it("unparseable branch renders fallback testid + edit-the-JSON-directly hint", () => {
    const src = readPanel();
    expect(src).toMatch(
      /parsed\s*===\s*null[\s\S]{0,400}data-testid=\{`bases-row-detail-filters-summary-unavailable-\$\{baseId\}`\}/,
    );
    expect(src).toMatch(
      /Structured view unavailable[\s\S]{0,200}Edit the JSON below directly/,
    );
  });

  it("empty-conditions branch renders match-all-notes hint with its own testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /parsed\.conditions\.length\s*===\s*0[\s\S]{0,400}data-testid=\{`bases-row-detail-filters-summary-empty-\$\{baseId\}`\}/,
    );
    expect(src).toMatch(/base matches all notes/);
  });

  it("describeCondition helper covers all 5 V1 condition variants (full switch)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+describeCondition\(c:\s*FilterCondition\):\s*string\s*\{[\s\S]{0,200}switch\s*\(c\.field\)[\s\S]{0,1500}case\s+"folderId"[\s\S]{0,200}case\s+"slug"[\s\S]{0,200}case\s+"title"[\s\S]{0,200}case\s+"governanceStatus"[\s\S]{0,200}case\s+"updatedAt"/,
    );
  });

  it("non-empty branch renders per-condition chip + Remove button with per-chip testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-summary-\$\{baseId\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-summary-row-\$\{baseId\}-\$\{idx\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-detail-filters-summary-remove-\$\{baseId\}-\$\{idx\}`\}/,
    );
  });

  it("removeConditionAt rewrites draft JSON via JSON.stringify with 2-space indent", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+removeConditionAt\(idx:\s*number\):\s*void[\s\S]{0,500}filter\(\(_,\s*i\)\s*=>\s*i\s*!==\s*idx\)[\s\S]{0,200}onChange\(JSON\.stringify\(next,\s*null,\s*2\)\)/,
    );
  });

  it("summary renders ABOVE the JSON textarea inside the filter-edit panel", () => {
    const src = readPanel();
    const summaryIdx = src.indexOf("<FilterConditionsSummary");
    const textareaIdx = src.indexOf(
      "data-testid={`bases-row-detail-filters-textarea-${base.id}`}",
    );
    expect(summaryIdx).toBeGreaterThan(0);
    expect(textareaIdx).toBeGreaterThan(0);
    expect(summaryIdx).toBeLessThan(textareaIdx);
  });

  it("Remove button disabled when filter-edit mutation is pending", () => {
    const src = readPanel();
    expect(src).toMatch(
      /disabled=\{disabled\}[\s\S]{0,150}onClick=\{\(\)\s*=>\s*removeConditionAt\(idx\)\}/,
    );
  });
});
