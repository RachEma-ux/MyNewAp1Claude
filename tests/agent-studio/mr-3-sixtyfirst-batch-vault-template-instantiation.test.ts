/**
 * MR-3 sixty-first batch — vault/template-instantiations.ts ::
 * recordTemplateInstantiation Path-A discovering-helper migration
 * Cat B→A.
 * PR-V1-131.
 *
 * Pure ledger-write — agsVaultTemplateInstantiations has no
 * workspaceId column directly, but the noteId points at agsVaultNotes
 * whose vaultId → agsVaults carries workspaceId. Two-table JOIN
 * (Notes × Vaults) walks the chain in one round-trip, then the INSERT
 * routes via getAsDbForWorkspace. Falls back to bootstrap when the
 * note's vault is missing OR vault.workspaceId IS NULL.
 *
 * The reads (listInstantiationsByTemplate / listInstantiationsByNote
 * / countDistinctDigestsForTemplate) remain on bootstrap as
 * intentional Cat B (read-only operator helpers).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 sixty-first batch — recordTemplateInstantiation Path-A migration", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/template-instantiations.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports both getAsDb and getAsDbForWorkspace from db/connection", () => {
    expect(
      /import\s+\{\s*getAsDb\s*,\s*getAsDbForWorkspace\s*\}\s+from\s+"\.\.\/\.\.\/db\/connection\.js"/.test(
        src,
      ),
    ).toBe(true);
  });

  it("imports agsVaultNotes and agsVaults for the JOIN", () => {
    expect(/agsVaultNotes/.test(src)).toBe(true);
    expect(/agsVaults\b/.test(src)).toBe(true);
  });

  it("recordTemplateInstantiation does a Notes × Vaults JOIN keyed on input.noteId", () => {
    const fn = src.slice(src.indexOf("recordTemplateInstantiation"));
    expect(/innerJoin\s*\(\s*agsVaults\s*,/.test(fn)).toBe(true);
    expect(
      /eq\s*\(\s*agsVaultNotes\.vaultId\s*,\s*agsVaults\.id\s*\)/.test(fn),
    ).toBe(true);
    expect(
      /eq\s*\(\s*agsVaultNotes\.id\s*,\s*input\.noteId\s*\)/.test(fn),
    ).toBe(true);
  });

  it("recordTemplateInstantiation routes the INSERT via getAsDbForWorkspace(workspaceId) with bootstrap fallback", () => {
    const fn = src.slice(src.indexOf("recordTemplateInstantiation"));
    expect(
      /workspaceId\s*!=\s*null\s*\?\s*\(\s*getAsDbForWorkspace\s*\(\s*workspaceId\s*\)\s*\?\?\s*lookupDb\s*\)\s*:\s*lookupDb/.test(
        fn,
      ),
    ).toBe(true);
    expect(
      /db\s*\n?\s*\.insert\s*\(\s*agsVaultTemplateInstantiations\s*\)/.test(fn),
    ).toBe(true);
  });
});
