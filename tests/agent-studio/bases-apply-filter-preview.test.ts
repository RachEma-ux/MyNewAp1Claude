/**
 * Bases apply-filter preview — ζ-slice (T-F.98 / T-F.2-ζ).
 *
 * First "use the base" operator path. Per-row "Use base" button
 * opens an inline preview reading `b.filters.folderId` (the one
 * filter `vault.listNotes` understands today) and rendering matching
 * notes as a table. Honest banner names which JSON keys in `filters`
 * are vs aren't enforced — defers the filter-language ADR to a
 * follow-up arc while still shipping a meaningful "use the base"
 * surface.
 *
 * Preview state is **independent** of detail / rename / delete-
 * confirm slices — operator can preview while inspecting or
 * mutating the row's metadata; read-only inspection is orthogonal
 * to row mutation.
 *
 * Source-scan integrity test locks: state shape, PREVIEW_LIMIT
 * constant, defensive folderId parsing from opaque JSON, unenforced-
 * keys derivation, tRPC query gating + invocation shape, button +
 * toggle behavior, BasePreview component + banner + 5-column notes
 * table + loading/error/empty states.
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

describe("Bases apply-filter preview ζ-slice (T-F.98 / T-F.2-ζ)", () => {
  it("PREVIEW_LIMIT constant is set to 25 (smaller than BASES_LIST_LIMIT — sample, not full list)", () => {
    const src = readPanel();
    expect(src).toMatch(/const\s+PREVIEW_LIMIT\s*=\s*25/);
  });

  it("panel holds previewBaseId state slice", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[previewBaseId,\s*setPreviewBaseId\]\s*=\s*useState<number\s*\|\s*null>/,
    );
  });

  it("preview state is INDEPENDENT — opening preview does NOT clear detail / rename / delete-confirm", () => {
    const src = readPanel();
    // The "Use base" button setState uses setPreviewBaseId directly,
    // NOT a multi-slice openPreview helper that clears others.
    expect(src).toMatch(
      /data-testid=\{`bases-row-preview-\$\{b\.id\}`\}[\s\S]{0,400}onClick=\{\(\)\s*=>\s*setPreviewBaseId\(isPreviewing\s*\?\s*null\s*:\s*b\.id\)/,
    );
    // Confirm no openPreview helper exists.
    expect(src).not.toMatch(/function\s+openPreview/);
    // openRenameEditor / openDeleteConfirm / setExpandedBaseId paths
    // do NOT touch setPreviewBaseId — preview is orthogonal.
    expect(src).not.toMatch(
      /function\s+openRenameEditor[\s\S]{0,600}setPreviewBaseId/,
    );
    expect(src).not.toMatch(
      /function\s+openDeleteConfirm[\s\S]{0,600}setPreviewBaseId/,
    );
  });

  it("folderId is defensively parsed — only accept positive int from opaque JSON", () => {
    const src = readPanel();
    expect(src).toMatch(
      /previewFolderId[\s\S]{0,200}typeof\s+previewBase\.filters\s*===\s*"object"/,
    );
    expect(src).toMatch(
      /typeof\s+\(previewBase\.filters\s+as\s+Record<string,\s*unknown>\)\.folderId\s*===\s*"number"/,
    );
    expect(src).toMatch(/Number\.isInteger/);
  });

  it("unenforced filter keys are derived (Object.keys minus folderId) for the honesty banner", () => {
    const src = readPanel();
    expect(src).toMatch(
      /unenforcedFilterKeys[\s\S]{0,300}Object\.keys\(previewBase\.filters[\s\S]{0,80}\.filter\(\s*\(k\)\s*=>\s*k\s*!==\s*"folderId"/,
    );
  });

  it("previewQuery uses vault.listNotes with conditional folderId spread + gating predicate", () => {
    const src = readPanel();
    expect(src).toMatch(
      /previewQuery\s*=\s*trpc\.agentStudio\.vault\.listNotes\.useQuery/,
    );
    expect(src).toMatch(
      /previewBaseId\s*!==\s*null\s*&&\s*effectiveVaultId\s*!==\s*null[\s\S]{0,400}vaultId:\s*effectiveVaultId[\s\S]{0,300}\.\.\.\(previewFolderId\s*!==\s*undefined\s*\?\s*\{\s*folderId:\s*previewFolderId\s*\}\s*:\s*\{\}\)/,
    );
    expect(src).toMatch(
      /enabled:\s*previewBaseId\s*!==\s*null\s*&&\s*effectiveVaultId\s*!==\s*null/,
    );
  });

  it("Use base button toggles label between 'Use base' and 'Hide preview'", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid=\{`bases-row-preview-\$\{b\.id\}`\}/);
    expect(src).toMatch(
      /isPreviewing\s*\?\s*"Hide preview"\s*:\s*"Use base"/,
    );
  });

  it("preview row uses colSpan 6 + BasePreview component", () => {
    const src = readPanel();
    expect(src).toMatch(
      /isPreviewing\s*\?\s*\([\s\S]{0,400}data-testid=\{`bases-row-preview-row-\$\{b\.id\}`\}/,
    );
    expect(src).toMatch(
      /<BasePreview[\s\S]{0,300}base=\{b\}[\s\S]{0,200}folderId=\{previewFolderId\}[\s\S]{0,200}unenforcedKeys=\{unenforcedFilterKeys\}[\s\S]{0,200}previewQuery=\{previewQuery\}/,
    );
  });

  it("BasePreview banner names the folderId state — enforced vs not-set", () => {
    const src = readPanel();
    expect(src).toMatch(/function\s+BasePreview/);
    expect(src).toMatch(/data-testid=\{`bases-row-preview-banner-\$\{base\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`bases-row-preview-folder-id-\$\{base\.id\}`\}/);
    expect(src).toMatch(
      /data-testid=\{`bases-row-preview-folder-id-empty-\$\{base\.id\}`\}/,
    );
  });

  it("BasePreview banner lists unenforced keys when present + names them as not-yet-enforced", () => {
    const src = readPanel();
    expect(src).toMatch(
      /unenforcedKeys\.length\s*>\s*0[\s\S]{0,400}data-testid=\{`bases-row-preview-unenforced-\$\{base\.id\}`\}[\s\S]{0,400}not yet enforced/,
    );
    expect(src).toMatch(/unenforcedKeys\.join\(", "\)/);
  });

  it("BasePreview notes table has 5-column header (id / title / slug / governance / updated) + per-row testid + 4 state branches", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<thead>[\s\S]{0,800}<th[^>]*>id<\/th>[\s\S]{0,200}<th[^>]*>title<\/th>[\s\S]{0,200}<th[^>]*>slug<\/th>[\s\S]{0,200}<th[^>]*>governance<\/th>[\s\S]{0,200}<th[^>]*>updated<\/th>/,
    );
    expect(src).toMatch(
      /data-testid=\{`bases-row-preview-note-\$\{base\.id\}-\$\{n\.id\}`\}/,
    );
    // Four state branches: loading / error / empty / table
    expect(src).toMatch(/data-testid=\{`bases-row-preview-loading-\$\{base\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`bases-row-preview-error-\$\{base\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`bases-row-preview-empty-\$\{base\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`bases-row-preview-notes-\$\{base\.id\}`\}/);
  });
});
