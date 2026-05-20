/**
 * Source-scan integrity test for the Vault Explorer tag-chip filter.
 *
 * Operators can click tag chips below the note search box to narrow
 * the note list to notes carrying any of the selected tags (OR
 * semantics). Tags are sourced from `agentStudio.vault.listTagsForVault`
 * — extended 2026-05-20 to return per-tag `noteIds` so this filter is
 * a pure client-side set lookup.
 *
 * Guards against regressions where:
 *   - The tag-chip row disappears or loses its test id
 *   - The chip toggle stops being wired to `selectedTags`
 *   - The filter stops being AND-combined with the text filter
 *   - The vault-switch reset effect stops clearing tags
 *   - The server stops returning `noteIds` from listTagsForVault
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Vault Explorer tag-chip filter", () => {
  const clientSrc = read(
    "client/src/modules/agent-studio/components/graph-workspace/VaultExplorer.tsx",
  );
  const serverSrc = read("server/agent-studio/services/vault/router.ts");

  describe("server contract: listTagsForVault returns noteIds per tag", () => {
    it("response builds a `noteIdsByTag` map alongside the count map", () => {
      expect(/const\s+noteIdsByTag\s*=\s*new\s+Map<string,\s*number\[\]>/.test(serverSrc)).toBe(
        true,
      );
    });

    it("emits `noteIds` on every per-tag row (additive on the prior {tag, count} shape)", () => {
      expect(
        /\.map\(\(\[tag,\s*count\]\)\s*=>\s*\(\{[\s\S]+?tag,[\s\S]+?count,[\s\S]+?noteIds:\s*noteIdsByTag\.get\(tag\)/.test(
          serverSrc,
        ),
      ).toBe(true);
    });

    it("noteIds is deduped per note (a note appears at most once per tag)", () => {
      // The per-note loop keeps a `seenForThisNote` Set and only
      // pushes the note id on first occurrence of each tag.
      expect(/seenForThisNote\s*=\s*new\s+Set<string>\(\)/.test(serverSrc)).toBe(true);
      expect(/seenForThisNote\.has\(tag\)/.test(serverSrc)).toBe(true);
      expect(/seenForThisNote\.add\(tag\)/.test(serverSrc)).toBe(true);
    });

    it("preserves the prior occurrence-based `count` semantics", () => {
      // The `counts.set(tag, (counts.get(tag) ?? 0) + 1)` line must
      // still run unconditionally inside the tag loop — the dedupe
      // applies only to noteIds, not counts.
      expect(/counts\.set\(tag,\s*\(counts\.get\(tag\)\s*\?\?\s*0\)\s*\+\s*1\)/.test(serverSrc)).toBe(
        true,
      );
    });
  });

  describe("client: chip row", () => {
    it("subscribes to listTagsForVault gated on selectedVaultId", () => {
      expect(
        /listTagsForVault\.useQuery\(\s*\{\s*vaultId:\s*selectedVaultId\s*\?\?\s*0\s*\}[\s\S]+?enabled:[\s\S]+?selectedVaultId/.test(
          clientSrc,
        ),
      ).toBe(true);
    });

    it("renders a chip container with a stable test id", () => {
      expect(/data-testid="vault-explorer-tag-filter-chips"/.test(clientSrc)).toBe(
        true,
      );
    });

    it("renders one button per tag with `data-testid='vault-explorer-tag-filter-chip-${tag}'`", () => {
      expect(
        /data-testid=\{`vault-explorer-tag-filter-chip-\$\{t\.tag\}`\}/.test(
          clientSrc,
        ),
      ).toBe(true);
    });

    it("caps the chip row at 30 tags (sidebar tidiness)", () => {
      expect(/allTags\.slice\(0,\s*30\)/.test(clientSrc)).toBe(true);
    });

    it("clicking a chip routes through `toggleTag`", () => {
      expect(/onClick=\{\(\)\s*=>\s*toggleTag\(t\.tag\)\}/.test(clientSrc)).toBe(
        true,
      );
      expect(/function\s+toggleTag\(tag:\s*string\)/.test(clientSrc)).toBe(true);
    });

    it("shows a `Clear tags (N)` button only when some are selected", () => {
      expect(/data-testid="vault-explorer-tag-filter-clear"/.test(clientSrc)).toBe(
        true,
      );
      expect(
        /selectedTags\.length\s*>\s*0\s*&&\s*\([\s\S]+?vault-explorer-tag-filter-clear/.test(
          clientSrc,
        ),
      ).toBe(true);
      expect(/onClick=\{\(\)\s*=>\s*setSelectedTags\(\[\]\)\}/.test(clientSrc)).toBe(
        true,
      );
    });

    it("uses data-active for the on/off chip state (selectable from tests)", () => {
      expect(/data-active=\{isOn\s*\?\s*"true"\s*:\s*"false"\}/.test(clientSrc)).toBe(
        true,
      );
    });
  });

  describe("client: filter combination", () => {
    it("declares a selectedTags state", () => {
      expect(
        /const\s+\[selectedTags,\s*setSelectedTags\]\s*=\s*useState<ReadonlyArray<string>>\(\[\]\)/.test(
          clientSrc,
        ),
      ).toBe(true);
    });

    it("builds an allowedNoteIdsByTags Set with OR semantics across selected tags", () => {
      expect(/const\s+allowedNoteIdsByTags\s*=\s*useMemo/.test(clientSrc)).toBe(
        true,
      );
      // OR: for each note id in any selected-tag's noteIds, add to the
      // allow set. Empty selection short-circuits to null (no filter).
      expect(/selectedTags\.length\s*===\s*0[\s\S]+?return\s+null/.test(clientSrc)).toBe(
        true,
      );
      expect(/for\s*\(const\s+id\s+of\s+t\.noteIds\)\s*allow\.add\(id\)/.test(clientSrc)).toBe(
        true,
      );
    });

    it("filteredNotes AND-combines tag membership with the text filter", () => {
      expect(
        /allowedNoteIdsByTags\s*!==\s*null\s*&&\s*!allowedNoteIdsByTags\.has\(n\.id\)/.test(
          clientSrc,
        ),
      ).toBe(true);
    });

    it("count line surfaces when EITHER filter is active", () => {
      expect(
        /noteFilter\.trim\(\)\.length\s*>\s*0\s*\|\|\s*selectedTags\.length\s*>\s*0[\s\S]+?vault-explorer-note-filter-count/.test(
          clientSrc,
        ),
      ).toBe(true);
    });

    it("empty-state message reflects an active tag filter", () => {
      expect(
        /noteFilter\.trim\(\)\.length\s*>\s*0\s*\|\|\s*selectedTags\.length\s*>\s*0[\s\S]+?No notes match this filter/.test(
          clientSrc,
        ),
      ).toBe(true);
    });

    it("vault switch clears BOTH text and tag filters", () => {
      // The reset effect was extended (folder-tree work) to also
      // clear `setExpandedFolderIds`. Assert text + tag resets are
      // both inside the same selectedVaultId-keyed useEffect body,
      // tolerating any extra resets that landed alongside them.
      expect(
        /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?setNoteFilter\(""\);[\s\S]*?setSelectedTags\(\[\]\);[\s\S]*?\},\s*\[selectedVaultId\]\)/.test(
          clientSrc,
        ),
      ).toBe(true);
    });
  });

  describe("preserved invariants", () => {
    it("text filter (PR #1678) still rendered", () => {
      expect(/data-testid="vault-explorer-note-filter-input"/.test(clientSrc)).toBe(
        true,
      );
    });

    it("dropdown selector (PR #1677) still rendered", () => {
      expect(/data-testid="vault-explorer-vault-select"/.test(clientSrc)).toBe(
        true,
      );
    });

    it("header '+ New note' button (PR #1676) still rendered", () => {
      expect(
        /data-testid="vault-explorer-header-new-note-btn"/.test(clientSrc),
      ).toBe(true);
    });
  });
});
