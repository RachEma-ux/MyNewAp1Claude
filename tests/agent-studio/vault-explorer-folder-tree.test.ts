/**
 * Source-scan integrity test for the Vault Explorer folder tree.
 *
 * When no filter (text or tag) is active, the Vault Explorer renders
 * a hierarchical folder → notes tree. Folders come from the new
 * `agentStudio.vault.listFolders` tRPC query; notes carry a
 * `folderId` so each note attaches under its containing folder.
 * Notes with `folderId === null` land at the root level alongside
 * top-level folders. Each folder row is expand/collapse-able; the
 * tree defaults to all-expanded the first time the folder query
 * resolves for a given vault.
 *
 * When a filter IS active, the tree collapses to a flat NoteList of
 * the filter hits (tree structure is noise when searching).
 *
 * Guards against regressions where:
 *   - The tree disappears or loses its container test id
 *   - The folder ↔ notes mapping skips parentFolderId or folderId
 *   - The filter-active path stops rendering NoteList
 *   - The repository/router contract for folders gets severed
 *   - NoteSelectByIdResult loses its folderId leg
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Vault Explorer folder tree", () => {
  const clientSrc = read(
    "client/src/modules/agent-studio/components/graph-workspace/VaultExplorer.tsx",
  );
  const repoSrc = read("server/agent-studio/services/vault/repository.ts");
  const asdbSrc = read("server/agent-studio/services/vault/repository-asdb.ts");
  const routerSrc = read("server/agent-studio/services/vault/router.ts");

  describe("server contract", () => {
    it("NoteSelectByIdResult exposes folderId on every note", () => {
      expect(/folderId:\s*number\s*\|\s*null/.test(repoSrc)).toBe(true);
    });

    it("VaultRepository declares listFoldersInVault", () => {
      expect(
        /listFoldersInVault\(vaultId:\s*number\)\s*:\s*Promise<VaultFolderRow\[\]>/.test(
          repoSrc,
        ),
      ).toBe(true);
    });

    it("VaultFolderRow shape is exported", () => {
      expect(/export\s+interface\s+VaultFolderRow/.test(repoSrc)).toBe(true);
      expect(/parentFolderId:\s*number\s*\|\s*null/.test(repoSrc)).toBe(true);
      expect(/path:\s*string/.test(repoSrc)).toBe(true);
    });

    it("ASDB repo SELECTs folderId on listNotesInVault + getNoteById", () => {
      expect(
        /listNotesInVault[\s\S]+?\.select\(\{[\s\S]+?folderId:\s*agsVaultNotes\.folderId/.test(
          asdbSrc,
        ),
      ).toBe(true);
      expect(
        /getNoteById[\s\S]+?\.select\(\{[\s\S]+?folderId:\s*agsVaultNotes\.folderId/.test(
          asdbSrc,
        ),
      ).toBe(true);
    });

    it("ASDB repo implements listFoldersInVault against agsVaultFolders", () => {
      expect(/async\s+listFoldersInVault/.test(asdbSrc)).toBe(true);
      expect(/agsVaultFolders/.test(asdbSrc)).toBe(true);
      expect(/\.from\(agsVaultFolders\)/.test(asdbSrc)).toBe(true);
    });

    it("router exposes vault.listFolders as a protected query", () => {
      expect(/listFolders:\s*protectedProcedure/.test(routerSrc)).toBe(true);
      expect(
        /listFoldersInVault\(input\.vaultId\)/.test(routerSrc),
      ).toBe(true);
    });
  });

  describe("client: subscription + state", () => {
    it("subscribes to listFolders gated on selectedVaultId", () => {
      expect(
        /listFolders\.useQuery\(\s*\{\s*vaultId:\s*selectedVaultId\s*\?\?\s*0\s*\}[\s\S]+?enabled:[\s\S]+?selectedVaultId/.test(
          clientSrc,
        ),
      ).toBe(true);
    });

    it("declares an expandedFolderIds state of Set<number>", () => {
      expect(
        /const\s+\[expandedFolderIds,\s*setExpandedFolderIds\]\s*=\s*useState<ReadonlySet<number>>/.test(
          clientSrc,
        ),
      ).toBe(true);
    });

    it("seeds expandedFolderIds to ALL folders on first folder-query result per vault", () => {
      expect(
        /setExpandedFolderIds\(new Set\(allFolders\.map\(\(f\)\s*=>\s*f\.id\)\)\)/.test(
          clientSrc,
        ),
      ).toBe(true);
    });

    it("computes an `isFilterActive` flag for the tree-vs-list switch", () => {
      expect(
        /const\s+isFilterActive\s*=\s*\n?\s*noteFilter\.trim\(\)\.length\s*>\s*0\s*\|\|\s*selectedTags\.length\s*>\s*0/.test(
          clientSrc,
        ),
      ).toBe(true);
    });

    it("renders FolderTree when filter is inactive, NoteList when filter is active", () => {
      expect(
        /isFilterActive\s*\?\s*\(\s*<NoteList[\s\S]+?\)\s*:\s*\(\s*<FolderTree/.test(
          clientSrc,
        ),
      ).toBe(true);
    });
  });

  describe("client: FolderTree component", () => {
    it("exists with a stable container test id", () => {
      expect(/data-testid="folder-tree"/.test(clientSrc)).toBe(true);
      expect(/function\s+FolderTree\(/.test(clientSrc)).toBe(true);
    });

    it("builds child-folders index keyed on parentFolderId", () => {
      expect(/childFoldersByParent/.test(clientSrc)).toBe(true);
      expect(/f\.parentFolderId\s*\?\?\s*null/.test(clientSrc)).toBe(true);
    });

    it("builds notes-by-folder index keyed on folderId (null = root)", () => {
      expect(/notesByFolder/.test(clientSrc)).toBe(true);
      expect(/n\.folderId\s*\?\?\s*null/.test(clientSrc)).toBe(true);
    });

    it("each folder row has a `folder-row-${id}` test id with expanded state", () => {
      expect(
        /data-testid=\{`folder-row-\$\{folder\.id\}`\}/.test(clientSrc),
      ).toBe(true);
      expect(
        /data-expanded=\{isOpen\s*\?\s*"true"\s*:\s*"false"\}/.test(clientSrc),
      ).toBe(true);
    });

    it("clicking a folder row routes to onToggleFolder(id)", () => {
      expect(/onClick=\{\(\)\s*=>\s*onToggleFolder\(folder\.id\)\}/.test(clientSrc)).toBe(
        true,
      );
    });

    it("renders descendant ul with `folder-children-${id}` when expanded", () => {
      expect(
        /data-testid=\{`folder-children-\$\{folder\.id\}`\}/.test(clientSrc),
      ).toBe(true);
    });

    it("note rows inside the tree reuse the `note-list-item-${id}` test id", () => {
      // Keeps the prior selectors used by Cmd+P / e2e harnesses
      // valid in both flat-list and tree modes.
      expect(
        /data-testid=\{`note-list-item-\$\{note\.id\}`\}/.test(clientSrc),
      ).toBe(true);
    });

    it("renders empty-state copy when no folders + no notes", () => {
      expect(/data-testid="folder-tree-empty"/.test(clientSrc)).toBe(true);
      expect(/No notes in this vault\./.test(clientSrc)).toBe(true);
    });

    it("renders a loading state while either query is pending", () => {
      expect(/data-testid="folder-tree-loading"/.test(clientSrc)).toBe(true);
    });

    it("renders an error state when either query errors", () => {
      expect(/data-testid="folder-tree-error"/.test(clientSrc)).toBe(true);
    });
  });

  describe("preserved invariants", () => {
    it("text filter (PR #1678) still rendered", () => {
      expect(/data-testid="vault-explorer-note-filter-input"/.test(clientSrc)).toBe(
        true,
      );
    });

    it("tag chip filter (PR #1679) still rendered", () => {
      expect(/data-testid="vault-explorer-tag-filter-chips"/.test(clientSrc)).toBe(
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
