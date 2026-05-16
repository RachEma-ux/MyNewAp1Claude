/**
 * Bases preview drill-into-note — a.2-narrow slice
 * (T-F.104 / T-F.2-a.2).
 *
 * Second within-Bases NARROW slice. Per-row "Open" toggle on each
 * preview note row expands an inline content panel rendering the
 * latest version's markdown source via the existing `vault.getNote`
 * tRPC (zero new server work).
 *
 * The drill-in is read-only and inline (not a route navigation) —
 * a full vault-note-view page is out of scope for the NARROW arc;
 * the inline panel gives operators a confidence-check on the note's
 * content without leaving the preview.
 *
 * Source-scan integrity test locks: openPreviewNoteId state slice,
 * gated noteQuery (enabled gates on the same condition), BasePreview
 * prop wiring, Open/Close button per-row testid + label flip, inline
 * content row colSpan 6, NoteContentInline component existence +
 * 4 state branches (loading/error/unavailable/no-version) + content
 * meta + markdown <pre> render.
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

describe("Bases preview drill-into-note a.2-slice (T-F.104 / T-F.2-a.2)", () => {
  it("panel holds openPreviewNoteId state slice", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[openPreviewNoteId,\s*setOpenPreviewNoteId\]\s*=\s*useState<number\s*\|\s*null>/,
    );
  });

  it("openNoteQuery uses vault.getNote with gating predicate on openPreviewNoteId", () => {
    const src = readPanel();
    expect(src).toMatch(
      /openNoteQuery\s*=\s*trpc\.agentStudio\.vault\.getNote\.useQuery\([\s\S]{0,600}openPreviewNoteId\s*!==\s*null[\s\S]{0,300}noteId:\s*openPreviewNoteId/,
    );
    expect(src).toMatch(
      /enabled:\s*openPreviewNoteId\s*!==\s*null/,
    );
  });

  it("BasePreview receives openPreviewNoteId + setOpenPreviewNoteId + openNoteQuery props", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<BasePreview[\s\S]{0,1200}openPreviewNoteId=\{openPreviewNoteId\}[\s\S]{0,300}setOpenPreviewNoteId=\{setOpenPreviewNoteId\}[\s\S]{0,300}openNoteQuery=\{openNoteQuery\}/,
    );
  });

  it("preview notes table gains a trailing empty <th> for the Open action column", () => {
    const src = readPanel();
    // Adds a 6th <th></th> after the 5 data columns. Confirm the
    // notes-table thead now ends in <th></th>.
    expect(src).toMatch(
      /<thead>[\s\S]{0,800}<th[^>]*>id<\/th>[\s\S]{0,200}<th[^>]*>title<\/th>[\s\S]{0,200}<th[^>]*>slug<\/th>[\s\S]{0,200}<th[^>]*>governance<\/th>[\s\S]{0,200}<th[^>]*>updated<\/th>[\s\S]{0,200}<th[^>]*><\/th>/,
    );
  });

  it("Open/Close toggle button per-row with label flip + per-row testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`bases-row-preview-note-open-\$\{base\.id\}-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(/isOpen\s*\?\s*"Close"\s*:\s*"Open"/);
    expect(src).toMatch(
      /onClick=\{\(\)\s*=>\s*setOpenPreviewNoteId\(isOpen\s*\?\s*null\s*:\s*n\.id\)/,
    );
  });

  it("inline content row uses Fragment wrapping + colSpan 6 + NoteContentInline component", () => {
    const src = readPanel();
    expect(src).toMatch(/Fragment\s+key=\{n\.id\}/);
    expect(src).toMatch(
      /data-testid=\{`bases-row-preview-note-content-row-\$\{base\.id\}-\$\{n\.id\}`\}/,
    );
    expect(src).toMatch(/colSpan=\{6\}/);
    expect(src).toMatch(
      /<NoteContentInline[\s\S]{0,300}baseId=\{base\.id\}[\s\S]{0,200}noteId=\{n\.id\}[\s\S]{0,200}noteQuery=\{openNoteQuery\}/,
    );
  });

  it("NoteContentInline component covers 4 state branches + content+meta with per-row testids", () => {
    const src = readPanel();
    expect(src).toMatch(/function\s+NoteContentInline/);
    expect(src).toMatch(/bases-row-preview-note-content-loading-/);
    expect(src).toMatch(/bases-row-preview-note-content-error-/);
    expect(src).toMatch(/bases-row-preview-note-content-unavailable-/);
    expect(src).toMatch(/bases-row-preview-note-content-no-version-/);
    expect(src).toMatch(/bases-row-preview-note-content-md-/);
    expect(src).toMatch(/bases-row-preview-note-content-meta-/);
  });

  it("content meta line shows version + timestamp + author + governance", () => {
    const src = readPanel();
    expect(src).toMatch(/v\{latestVersion\.version\}/);
    expect(src).toMatch(
      /new Date\(latestVersion\.createdAt\)\.toISOString\(\)/,
    );
    expect(src).toMatch(/latestVersion\.authorUserId\s*!==\s*null/);
    expect(src).toMatch(/note\.governanceStatus/);
  });

  it("markdown content is rendered in a scrollable <pre> with whitespace-pre-wrap", () => {
    const src = readPanel();
    // className with whitespace-pre-wrap appears BEFORE the
    // data-testid attribute on the same <pre> element; the regex
    // anchors on the className → testid order.
    expect(src).toMatch(
      /whitespace-pre-wrap[\s\S]{0,400}data-testid=\{`bases-row-preview-note-content-md-\$\{baseId\}-\$\{noteId\}`\}/,
    );
    expect(src).toMatch(/\{latestVersion\.contentMd\}/);
  });
});
