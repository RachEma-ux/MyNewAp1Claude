/**
 * Bases bulk-selection — T-F.117 (T-F.2-ζ.1).
 *
 * Mirrors Quality Lens T-F.89 / Inbox T-F.111 selection-model
 * patterns. Set<number> with O(1) toggle + leading checkbox column
 * + select-all header checkbox + selection-count bar above the
 * table. Independent of row-mutation state (lesson 69 inspection-
 * mutation orthogonality applied to the selection axis — operator
 * can select rows while another row is being renamed / deleted).
 *
 * Bulk-action UX + server bulk-delete endpoint land in T-F.118
 * ζ.2 (separate slice).
 *
 * Source-scan locks the model + helpers + UI wiring + colSpan bumps.
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

describe("Bases bulk-selection ζ.1-slice (T-F.117 / T-F.2-ζ.1)", () => {
  it("selectedBaseIds: Set<number> state slice with lazy initializer", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[selectedBaseIds,\s*setSelectedBaseIds\]\s*=\s*useState<Set<number>>\(\s*\(\)\s*=>\s*new\s+Set\(\)/,
    );
  });

  it("toggleBaseSelection performs immutable add/delete via Set spread", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+toggleBaseSelection\(id:\s*number\):\s*void[\s\S]{0,400}new\s+Set\(prev\)[\s\S]{0,200}next\.has\(id\)[\s\S]{0,100}next\.delete\(id\)[\s\S]{0,100}next\.add\(id\)/,
    );
  });

  it("clearBaseSelection resets to a fresh empty Set", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+clearBaseSelection\(\):\s*void[\s\S]{0,150}setSelectedBaseIds\(new\s+Set\(\)\)/,
    );
  });

  it("pageAllSelected derived from current bases slice", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+pageAllSelected\s*=\s*bases\.length\s*>\s*0\s*&&\s*bases\.every\(\(b\)\s*=>\s*selectedBaseIds\.has\(b\.id\)\)/,
    );
  });

  it("togglePageSelection branches on pageAllSelected (deselect all visible vs select all visible)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+togglePageSelection\(\):\s*void[\s\S]{0,800}if\s*\(pageAllSelected\)\s*\{[\s\S]{0,300}next\.delete\(b\.id\)[\s\S]{0,400}\}\s*else\s*\{[\s\S]{0,300}next\.add\(b\.id\)/,
    );
  });

  it("selection bar gated on size > 0 with count + clear button", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{selectedBaseIds\.size\s*>\s*0\s*\?\s*\([\s\S]{0,1200}data-testid=["']bases-bulk-selection-bar["']/,
    );
    expect(src).toMatch(/data-testid=["']bases-bulk-selection-count["']/);
    expect(src).toMatch(/\{selectedBaseIds\.size\}\s+selected/);
    expect(src).toMatch(/data-testid=["']bases-bulk-selection-clear["']/);
    expect(src).toMatch(/onClick=\{clearBaseSelection\}/);
  });

  it("header checkbox bound to pageAllSelected + togglePageSelection + has testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<input[\s\S]{0,300}type=["']checkbox["'][\s\S]{0,200}checked=\{pageAllSelected\}[\s\S]{0,200}onChange=\{togglePageSelection\}[\s\S]{0,200}data-testid=["']bases-row-select-all["']/,
    );
  });

  it("per-row checkbox bound to has(b.id) + toggleBaseSelection(b.id) + per-row testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<input[\s\S]{0,300}type=["']checkbox["'][\s\S]{0,200}checked=\{selectedBaseIds\.has\(b\.id\)\}[\s\S]{0,200}onChange=\{\(\)\s*=>\s*toggleBaseSelection\(b\.id\)\}[\s\S]{0,200}data-testid=\{`bases-row-select-\$\{b\.id\}`\}/,
    );
  });

  it("table colSpan bumped 6 → 7 for all 5 bases-list expansion rows (share-error / detail / rename / delete / preview)", () => {
    const src = readPanel();
    // 5 occurrences of colSpan={7} should now exist in the bases-list
    // table (was 5 × colSpan={6} pre-T-F.117). The 6th colSpan={6}
    // INSIDE BasePreview's notes table stays — that's a 5-column
    // separate table not affected by the bases-list checkbox column.
    const sevens = src.match(/colSpan=\{7\}/g) ?? [];
    expect(sevens.length).toBe(5);
    const sixes = src.match(/colSpan=\{6\}/g) ?? [];
    expect(sixes.length).toBe(1); // BasePreview's notes table only
  });
});
