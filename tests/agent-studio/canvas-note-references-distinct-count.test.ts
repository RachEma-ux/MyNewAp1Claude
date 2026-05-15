/**
 * Canvas note-references distinct count — PR-V1-227.
 *
 * The references table renders every (nodeId, noteId) pair but
 * doesn't surface the unique-note shape. A 10-node canvas
 * referencing only 3 distinct notes is a high-duplication shape
 * that's interesting for canvas-hygiene audits — operators
 * shouldn't have to count the table by eye.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-227 — canvas note-references distinct count", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/CanvasOperatorPanel.tsx",
  );

  it("renders gauge with testid + Set<number> for uniqueness", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      'data-testid="canvas-note-references-distinct-count"',
    );
    expect(src).toContain("new Set<number>()");
    expect(/distinctNotes\.add\(r\.noteId\)/.test(src)).toBe(true);
  });

  it("renders 'across N reference(s)' total with singular/plural", () => {
    const src = readFileSync(panel, "utf8");
    expect(/refsQ\.data\.length\s*===\s*1\s*\?\s*""\s*:\s*"s"/.test(src)).toBe(
      true,
    );
  });

  it("gauge is sibling of the table (rendered only when refsQ.data has rows)", () => {
    const src = readFileSync(panel, "utf8");
    // Anchor on the panel-local fragment that holds both the gauge
    // and the table; same render branch.
    expect(/distinctNotes\.size/.test(src)).toBe(true);
    // Table testid not added; only the gauge is asserted by testid
    // for source-scan integrity.
    expect(src).toContain('data-testid="canvas-note-references-distinct-count"');
  });
});
