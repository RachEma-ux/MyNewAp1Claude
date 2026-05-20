/**
 * Source-scan integrity test for the prominent "+ New note" button
 * in the Vault Explorer header.
 *
 * Pre-existing: the nested "+ New note" affordance only appeared
 * inside an expanded selected-vault row (operators had to drill in).
 * This PR lifts a sibling button to the header so the affordance is
 * always visible.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Vault Explorer header new-note button", () => {
  const src = read(
    "client/src/modules/agent-studio/components/graph-workspace/VaultExplorer.tsx",
  );

  it("renders a header-level new-note button with its own data-testid", () => {
    expect(
      /data-testid="vault-explorer-header-new-note-btn"/.test(src),
    ).toBe(true);
  });

  it("disables the button when no vault is selected", () => {
    expect(
      /disabled=\{[\s\S]+?selectedVaultId\s*!==\s*"number"[\s\S]+?selectedVaultId\s*<=\s*0[\s\S]+?vaultsQuery\.data[\s\S]+?\.length\s*===\s*0/.test(
        src,
      ),
    ).toBe(true);
  });

  it("renders the disabled tooltip explaining the prerequisite", () => {
    expect(/Select a vault first/.test(src)).toBe(true);
  });

  it("toggles the same showNoteForm state the nested affordance uses", () => {
    expect(
      /vault-explorer-header-new-note-btn[\s\S]+?setShowNoteForm/.test(src),
    ).toBe(true);
  });

  it("relabels the nested vault button from '+ New' to '+ New vault' for clarity", () => {
    expect(/\? "Cancel" : "\+ New vault"/.test(src)).toBe(true);
  });

  it("preserves the existing nested new-note affordance inside the selected-vault row", () => {
    expect(/data-testid="vault-explorer-new-note-btn"/.test(src)).toBe(true);
    expect(/data-testid="vault-explorer-new-note-form"/.test(src)).toBe(true);
  });

  it("preserves the createNote mutation wiring", () => {
    expect(/trpc\.agentStudio\.vault\.createNote\.useMutation/.test(src)).toBe(
      true,
    );
  });

  it("preserves the listMyVaults + listNotes queries", () => {
    expect(/trpc\.agentStudio\.vault\.listMyVaults\.useQuery/.test(src)).toBe(
      true,
    );
    expect(/trpc\.agentStudio\.vault\.listNotes\.useQuery/.test(src)).toBe(
      true,
    );
  });
});
