/**
 * Bases ζ-preview typed filter enforcement — δ-slice
 * (T-F.102 / T-F.2-filter-δ).
 *
 * Closes the filter-language arc. ζ-preview's "not yet enforced"
 * honesty-banner list shrinks to zero for V1-typed (or legacy-
 * folderId) FilterDocuments because every condition is now
 * narrowed client-side via `applyFilterDocument` after the over-
 * sample fetch.
 *
 * Source-scan integrity test locks: shared/-module import of
 * parseFilterDocument + applyFilterDocument + extractFolderIdConstraint,
 * PREVIEW_FETCH_OVER_SAMPLE constant set to the server's listNotes
 * limit cap, parseFilterDocument-driven previewDoc derivation,
 * folderId extraction via the typed-doc helper (not raw JSON
 * indexing), unenforcedKeys gated on docParsed (empty when parsed),
 * post-narrow slice to PREVIEW_LIMIT, BasePreview prop wiring +
 * banner branches (doc-parsed vs doc-unparsed testids), and the
 * notes-table render shifting from previewQuery.data to
 * previewNotes (the narrowed list).
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

describe("Bases ζ-preview typed filter enforcement δ-slice (T-F.102 / T-F.2-filter-δ)", () => {
  it("panel imports parseFilterDocument + applyFilterDocument + extractFolderIdConstraint from shared/", () => {
    const src = readPanel();
    expect(src).toMatch(
      /import\s+\{[\s\S]{0,300}parseFilterDocument[\s\S]{0,200}applyFilterDocument[\s\S]{0,200}extractFolderIdConstraint[\s\S]{0,300}\}\s+from\s+"@shared\/bases-filter-language"/,
    );
  });

  it("PREVIEW_FETCH_OVER_SAMPLE matches the server's listNotes `limit` cap (200)", () => {
    const src = readPanel();
    expect(src).toMatch(/const\s+PREVIEW_FETCH_OVER_SAMPLE\s*=\s*200/);
  });

  it("previewDoc derived from parseFilterDocument(previewBase.filters)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+previewDoc:\s*FilterDocument\s*\|\s*null\s*=[\s\S]{0,200}previewBase[\s\S]{0,80}parseFilterDocument\(previewBase\.filters\)/,
    );
  });

  it("previewFolderId now extracted via the typed helper (NOT raw JSON property indexing)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+previewFolderId[\s\S]{0,200}extractFolderIdConstraint\(previewDoc\)\s*\?\?\s*undefined/,
    );
    // Confirm the old raw-JSON path is gone.
    expect(src).not.toMatch(
      /typeof\s+\(previewBase\.filters\s+as\s+Record<string,\s*unknown>\)\.folderId\s*===\s*"number"/,
    );
  });

  it("unenforcedFilterKeys is EMPTY when the doc parses; falls back to raw-JSON keys when it doesn't", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+unenforcedFilterKeys[\s\S]{0,300}previewDoc\s*!==\s*null\s*\?\s*\[\][\s\S]{0,400}Object\.keys/,
    );
  });

  it("previewQuery uses PREVIEW_FETCH_OVER_SAMPLE (not PREVIEW_LIMIT) for the server fetch", () => {
    const src = readPanel();
    expect(src).toMatch(
      /previewQuery\s*=\s*trpc\.agentStudio\.vault\.listNotes\.useQuery\([\s\S]{0,800}limit:\s*PREVIEW_FETCH_OVER_SAMPLE/,
    );
  });

  it("previewNotes derived from applyFilterDocument(query.data, previewDoc) sliced to PREVIEW_LIMIT (T-F.103 split the single previewNotes into previewMatchedAll + display slice for row-count metadata; previewNotes is the slice)", () => {
    const src = readPanel();
    // T-F.103 (a.1-narrow) introduced `previewMatchedAll` (full
    // post-narrow set) + `previewNotes = previewMatchedAll.slice(...)`.
    // Both expressions exist in the file; assert both.
    expect(src).toMatch(
      /const\s+previewMatchedAll[\s\S]{0,800}applyFilterDocument\([\s\S]{0,400}previewQuery\.data[\s\S]{0,400}previewDoc/,
    );
    expect(src).toMatch(
      /const\s+previewNotes\s*=\s*previewMatchedAll\.slice\(0,\s*PREVIEW_LIMIT\)/,
    );
  });

  it("BasePreview gains docParsed + conditionCount + previewNotes props", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<BasePreview[\s\S]{0,600}docParsed=\{previewDoc\s*!==\s*null\}[\s\S]{0,300}conditionCount=\{previewDoc\?\.conditions\.length\s*\?\?\s*0\}[\s\S]{0,300}previewNotes=\{previewNotes\}/,
    );
  });

  it("Banner gains doc-parsed AND doc-unparsed branches with distinct testids", () => {
    const src = readPanel();
    expect(src).toMatch(
      /\{docParsed\s*\?\s*\([\s\S]{0,400}data-testid=\{`bases-row-preview-doc-parsed-\$\{base\.id\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-preview-doc-unparsed-\$\{base\.id\}`\}/,
    );
    // The doc-parsed branch names the condition count + the
    // server/client narrowing split.
    expect(src).toMatch(
      /V1 filter document:\s*\{conditionCount\}\s+condition/,
    );
    expect(src).toMatch(/all enforced/);
  });

  it("Notes table renders from previewNotes (post-narrow), NOT previewQuery.data (pre-narrow)", () => {
    const src = readPanel();
    // T-F.104 (a.2-narrow) restructured the per-row render from
    // arrow-returns-JSX `(n) => (...)` into a block body
    // `(n) => { const isOpen = ...; return (...)` so the Open/Close
    // toggle can compute `isOpen` once per row. Loosen the regex to
    // accept either form by anchoring on the map + the per-row testid.
    expect(src).toMatch(
      /\{previewNotes\.map\(\(n\)\s*=>\s*[\s\S]{0,1000}data-testid=\{`bases-row-preview-note-\$\{base\.id\}-\$\{n\.id\}`\}/,
    );
    // Empty-state predicate also uses previewNotes.length.
    expect(src).toMatch(
      /previewNotes\.length\s*===\s*0[\s\S]{0,300}data-testid=\{`bases-row-preview-empty-\$\{base\.id\}`\}/,
    );
  });
});
