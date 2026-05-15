/**
 * MR-3 seventieth batch — services/vault/repository-asdb.ts read
 * paths Path-A migration Cat B-read → A-read.
 * PR-V1-140.
 *
 * Eighth read-path Path-X promotion (after #884-#890).
 *
 * 3 reads migrated, all using the Notes × Vaults JOIN keyed on
 * noteId to pull workspaceId up:
 *   - getNoteById(noteId)
 *   - getNoteVersion(noteId, version)
 *   - getLatestNoteVersion(noteId)
 *
 * The vault repo mutations (createNote, updateNote, deleteNote)
 * already use the same JOIN pattern from prior batches.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 seventieth batch — vault note reads Path-A", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/repository-asdb.ts",
  );
  const src = readFileSync(file, "utf8");

  function methodBody(name: string): string {
    const startIdx = src.indexOf(`async ${name}(`);
    if (startIdx === -1) return "";
    // Bound the slice to a reasonable window (~2000 chars; methods
    // are well under this).
    const remainder = src.slice(startIdx);
    const nextMethodIdx = remainder.slice(1).search(/\n\s{2}async\s+\w+\(/);
    const endIdx =
      nextMethodIdx >= 0 ? startIdx + 1 + nextMethodIdx : src.length;
    return src.slice(startIdx, endIdx);
  }

  it.each([
    "getNoteById",
    "getNoteVersion",
    "getLatestNoteVersion",
  ])("%s does Notes × Vaults JOIN keyed on noteId then routes via getAsDbForWorkspace", (name) => {
    const body = methodBody(name);
    expect(body.length).toBeGreaterThan(0);
    expect(
      /innerJoin\s*\(\s*agsVaults\s*,\s*eq\s*\(\s*agsVaultNotes\.vaultId\s*,\s*agsVaults\.id\s*\)\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*ws\[0\]\.workspaceId\s*\)\s*\?\?\s*lookupConn/.test(
        body,
      ),
    ).toBe(true);
  });
});
