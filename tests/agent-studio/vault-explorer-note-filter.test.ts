/**
 * Source-scan integrity test for the Vault Explorer note-filter
 * search box.
 *
 * Operators can type into a search input above the note list to
 * substring-filter notes by title or slug (case-insensitive). The
 * filter is client-side over the already-fetched `listNotes` result
 * (limit 200). Switching vaults clears the filter.
 *
 * Guards against regressions where:
 *   - The filter input disappears or loses its test id
 *   - The filter stops being applied to the NoteList notes prop
 *   - The clear button (×) gets severed from the input
 *   - The vault-switch reset effect gets removed
 *   - NoteList loses the `emptyMessage` prop wiring
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Vault Explorer note filter", () => {
  const src = read(
    "client/src/modules/agent-studio/components/graph-workspace/VaultExplorer.tsx",
  );

  describe("filter input", () => {
    it("renders an <input type='search'> with a stable test id", () => {
      expect(/data-testid="vault-explorer-note-filter-input"/.test(src)).toBe(
        true,
      );
      expect(
        /<input[\s\S]+?type="search"[\s\S]+?vault-explorer-note-filter-input/.test(
          src,
        ),
      ).toBe(true);
    });

    it("declares a noteFilter state", () => {
      expect(/const\s+\[noteFilter,\s*setNoteFilter\]\s*=\s*useState\(""\)/.test(src)).toBe(
        true,
      );
    });

    it("binds the input value to noteFilter and writes back via setNoteFilter", () => {
      expect(/value=\{noteFilter\}/.test(src)).toBe(true);
      expect(/setNoteFilter\(e\.target\.value\)/.test(src)).toBe(true);
    });

    it("uses placeholder + aria-label so the search box is discoverable", () => {
      expect(/placeholder="Filter notes/.test(src)).toBe(true);
      expect(/aria-label="Filter notes"/.test(src)).toBe(true);
    });

    it("renders an × clear button only when the filter is non-empty", () => {
      expect(/data-testid="vault-explorer-note-filter-clear"/.test(src)).toBe(
        true,
      );
      expect(
        /noteFilter\.length\s*>\s*0\s*&&\s*\([\s\S]+?vault-explorer-note-filter-clear/.test(
          src,
        ),
      ).toBe(true);
      expect(/onClick=\{\(\)\s*=>\s*setNoteFilter\(""\)\}/.test(src)).toBe(true);
    });
  });

  describe("filter application", () => {
    it("computes filteredNotes via useMemo with substring match", () => {
      expect(
        /const\s+filteredNotes\s*=\s*useMemo\(/.test(src),
      ).toBe(true);
      expect(/\.toLowerCase\(\)/.test(src)).toBe(true);
      expect(/title\.includes\(q\)\s*\|\|\s*slug\.includes\(q\)/.test(src)).toBe(
        true,
      );
    });

    it("passes filteredNotes (not raw notesQuery.data) to NoteList", () => {
      expect(/<NoteList[\s\S]+?notes=\{filteredNotes\}/.test(src)).toBe(true);
      // Make sure the OLD wiring was actually removed.
      expect(/<NoteList[\s\S]+?notes=\{notesQuery\.data\s*\?\?\s*\[\]\}/.test(src)).toBe(
        false,
      );
    });

    it("shows a `X of Y notes` count when the filter is non-empty", () => {
      expect(
        /data-testid="vault-explorer-note-filter-count"/.test(src),
      ).toBe(true);
      expect(/\{filteredNotes\.length\}\s+of\s+\{allNotes\.length\}/.test(src)).toBe(
        true,
      );
    });

    it("clears the filter when the operator switches vaults", () => {
      // The tag-chip filter (added later) extended this effect to
      // also clear `setSelectedTags([])`. Assert the text-filter
      // reset specifically; the tag-filter test file owns the
      // assertion for the full effect body.
      expect(
        /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?setNoteFilter\(""\);?[\s\S]*?\},\s*\[selectedVaultId\]\)/.test(
          src,
        ),
      ).toBe(true);
    });
  });

  describe("NoteList empty-state wiring", () => {
    it("NoteList accepts an `emptyMessage` prop", () => {
      expect(/readonly\s+emptyMessage\?:\s*string/.test(src)).toBe(true);
    });

    it("forwards a filter-specific empty message when a filter is active", () => {
      expect(
        /emptyMessage=\{\s*noteFilter\.trim\(\)\.length\s*>\s*0[\s\S]+?No notes match this filter[\s\S]+?No notes in this vault/.test(
          src,
        ),
      ).toBe(true);
    });

    it("the default empty-state copy is unchanged", () => {
      expect(/No notes in this vault\./.test(src)).toBe(true);
    });
  });

  describe("preserved invariants", () => {
    it("dropdown selector still rendered (from PR #1677)", () => {
      expect(/data-testid="vault-explorer-vault-select"/.test(src)).toBe(true);
    });

    it("header '+ New note' button still rendered (from PR #1676)", () => {
      expect(
        /data-testid="vault-explorer-header-new-note-btn"/.test(src),
      ).toBe(true);
    });

    it("FsSyncSettingsAffordance still rendered for the selected vault", () => {
      expect(
        /<FsSyncSettingsAffordance\s+vaultId=\{selectedVaultId\}/.test(src),
      ).toBe(true);
    });

    it("listNotes useQuery still bounded at limit: 200", () => {
      expect(/listNotes\.useQuery\([\s\S]+?limit:\s*200/.test(src)).toBe(true);
    });
  });
});
