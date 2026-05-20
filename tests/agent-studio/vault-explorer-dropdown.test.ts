/**
 * Source-scan integrity test for the Vault Explorer dropdown selector.
 *
 * Replaces the previous list-of-buttons UX. Operators pick a vault
 * from a `<select>`; the note list, FS-sync affordance, and inline
 * new-note form hang off the selected vault below the dropdown.
 *
 * Guards against regressions where:
 *   - The dropdown disappears or loses its test id
 *   - Vault options stop being rendered as `<option>` rows
 *   - The selected-vault block stops rendering below the dropdown
 *   - Pre-existing affordances (new-note button + form, FS-sync,
 *     NoteList) get accidentally severed during a future refactor
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Vault Explorer dropdown selector", () => {
  const src = read(
    "client/src/modules/agent-studio/components/graph-workspace/VaultExplorer.tsx",
  );

  describe("dropdown shape", () => {
    it("renders a <select> with data-testid='vault-explorer-vault-select'", () => {
      expect(/data-testid="vault-explorer-vault-select"/.test(src)).toBe(true);
      expect(/<select[\s\S]+?vault-explorer-vault-select/.test(src)).toBe(
        true,
      );
    });

    it("includes a disabled placeholder option", () => {
      expect(
        /<option\s+value=""\s+disabled>[\s\S]*?pick a vault[\s\S]*?<\/option>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("emits one <option> per vault with a stable per-id test hook", () => {
      expect(
        /\.map\(\(vault\)\s*=>\s*\([\s\S]+?<option[\s\S]+?value=\{vault\.id\}[\s\S]+?data-testid=\{`vault-explorer-vault-option-\$\{vault\.id\}`\}/.test(
          src,
        ),
      ).toBe(true);
    });

    it("binds value to selectedVaultId (empty-string fallback for no selection)", () => {
      expect(/value=\{selectedVaultId\s*\?\?\s*""\}/.test(src)).toBe(true);
    });

    it("parses the selection via Number.parseInt then calls onSelectVault", () => {
      expect(/Number\.parseInt\(\s*v\s*,\s*10\s*\)/.test(src)).toBe(true);
      expect(/onSelectVault\(id\)/.test(src)).toBe(true);
    });
  });

  describe("selected-vault block (sits below the dropdown)", () => {
    it("renders only when selectedVaultId is a positive number", () => {
      expect(
        /typeof\s+selectedVaultId\s*===\s*"number"\s*&&\s*selectedVaultId\s*>\s*0/.test(
          src,
        ),
      ).toBe(true);
    });

    it("wraps the affordances in a data-testid='vault-explorer-selected-vault' container", () => {
      expect(/data-testid="vault-explorer-selected-vault"/.test(src)).toBe(
        true,
      );
    });

    it("preserves the new-note button + form data-testids", () => {
      expect(/data-testid="vault-explorer-new-note-btn"/.test(src)).toBe(true);
      expect(/data-testid="vault-explorer-new-note-form"/.test(src)).toBe(
        true,
      );
      expect(/data-testid="vault-explorer-new-note-submit"/.test(src)).toBe(
        true,
      );
    });

    it("renders NoteList for the selected vault", () => {
      expect(/<NoteList[\s\S]+?notes=\{notesQuery\.data\s*\?\?\s*\[\]\}/.test(src)).toBe(
        true,
      );
    });

    it("renders FsSyncSettingsAffordance using selectedVaultId (not the closure vault.id)", () => {
      expect(
        /<FsSyncSettingsAffordance\s+vaultId=\{selectedVaultId\}/.test(src),
      ).toBe(true);
    });
  });

  describe("preserved invariants from the prior list UX", () => {
    it("listMyVaults + listNotes queries unchanged", () => {
      expect(/trpc\.agentStudio\.vault\.listMyVaults\.useQuery/.test(src)).toBe(
        true,
      );
      expect(/trpc\.agentStudio\.vault\.listNotes\.useQuery/.test(src)).toBe(
        true,
      );
    });

    it("createNote mutation still wired", () => {
      expect(/trpc\.agentStudio\.vault\.createNote\.useMutation/.test(src)).toBe(
        true,
      );
    });

    it("createVault mutation still wired", () => {
      expect(/trpc\.agentStudio\.vault\.createVault\.useMutation/.test(src)).toBe(
        true,
      );
    });

    it("header-level '+ New note' button preserved (from PR #1676)", () => {
      expect(
        /data-testid="vault-explorer-header-new-note-btn"/.test(src),
      ).toBe(true);
    });

    it("removes the per-vault <button> list (data-testid prefix vault-explorer-vault-)", () => {
      // Per-id button render pattern from the prior UX shouldn't survive.
      expect(/data-testid=\{`vault-explorer-vault-\$\{vault\.id\}`\}/.test(src)).toBe(
        false,
      );
    });
  });
});
