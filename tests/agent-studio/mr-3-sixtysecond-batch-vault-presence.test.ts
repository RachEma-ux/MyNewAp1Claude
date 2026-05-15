/**
 * MR-3 sixty-second batch — vault/presence.ts mutations Path-A
 * discovering-helper migration Cat B→A.
 * PR-V1-132.
 *
 * 3 mutations migrated:
 *   - enterPresence (UPDATE existing OR INSERT new)
 *   - heartbeat (UPDATE)
 *   - leavePresence (DELETE)
 *
 * Introduces a module-local `resolveNoteRoutedConn(lookupDb, noteId)`
 * helper that walks noteId → agsVaultNotes.vaultId →
 * agsVaults.workspaceId via a single two-table JOIN and returns the
 * workspace-routed handle. Falls back to lookupDb on any null in the
 * chain.
 *
 * The list/eviction read-paths (listPresence) intentionally remain
 * on bootstrap as Cat B operator helpers.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 sixty-second batch — vault/presence.ts Path-A migration", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/presence.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDb + getAsDbForWorkspace and agsVaultNotes + agsVaults", () => {
    expect(
      /import\s+\{\s*getAsDb\s*,\s*getAsDbForWorkspace\s*\}\s+from\s+"\.\.\/\.\.\/db\/connection\.js"/.test(
        src,
      ),
    ).toBe(true);
    expect(/agsVaultNotes/.test(src)).toBe(true);
    expect(/agsVaults\b/.test(src)).toBe(true);
  });

  it("defines a module-local resolveNoteRoutedConn helper that does a Notes × Vaults JOIN", () => {
    expect(
      /async\s+function\s+resolveNoteRoutedConn\s*\(/.test(src),
    ).toBe(true);
    const fn = src.slice(src.indexOf("async function resolveNoteRoutedConn"));
    expect(/innerJoin\s*\(\s*agsVaults\s*,/.test(fn)).toBe(true);
    expect(/getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/.test(fn)).toBe(true);
  });

  it.each(["enterPresence", "heartbeat", "leavePresence"])(
    "%s routes via resolveNoteRoutedConn(lookupDb, input.noteId)",
    (fnName) => {
      // Slice the function body starting from the function declaration
      const startIdx = src.indexOf(`export async function ${fnName}`);
      expect(startIdx).toBeGreaterThan(-1);
      const slice = src.slice(startIdx, startIdx + 2000);
      expect(
        /resolveNoteRoutedConn\s*\(\s*lookupDb\s*,\s*input\.noteId\s*\)/.test(
          slice,
        ),
      ).toBe(true);
    },
  );

  it("enterPresence shares the routed db across SELECT + UPDATE + INSERT (atomicity)", () => {
    const startIdx = src.indexOf("export async function enterPresence");
    const endIdx = src.indexOf("export async function heartbeat");
    const slice = src.slice(startIdx, endIdx);
    const matches = slice.match(/resolveNoteRoutedConn\s*\(/g) ?? [];
    expect(matches.length).toBe(1);
    expect(
      /db\s*\n?\s*\.select\s*\(\s*\)\s*\n?\s*\.from\s*\(\s*agsVaultNotePresence\s*\)/.test(
        slice,
      ),
    ).toBe(true);
  });
});
