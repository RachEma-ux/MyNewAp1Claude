/**
 * MR-3 thirty-third batch — vault/repository-asdb.ts::AsdbVaultRepository.createNote
 * vault→workspace split-handle Cat B→A.
 * PR-V1-102.
 *
 * createNote performs three sequential writes — INSERT into
 * agsVaultNotes, INSERT into agsVaultNoteVersions, UPDATE on
 * agsVaultNotes.currentVersionId. All three share the same routed
 * handle resolved once at the top of the function via a single
 * vault.workspaceId lookup. Mirrors the #852 addMember shape; the
 * single handle preserves atomicity (no cross-region writes within
 * the function).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("MR-3 thirty-third batch — AsdbVaultRepository.createNote split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/repository-asdb.ts",
  );
  const src = readFileSync(file, "utf8");

  it("createNote SELECTs vault.workspaceId once at the top of the function", () => {
    const fnMatch = src.match(
      /async\s+createNote\s*\([\s\S]*?\n\s{2}\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    expect(
      /\.select\(\s*\{\s*workspaceId:\s*agsVaults\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(/getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/.test(body)).toBe(true);
  });

  it("createNote SELECT precedes the agsVaultNotes INSERT", () => {
    const fnMatch = src.match(
      /async\s+createNote\s*\([\s\S]*?\n\s{2}\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    const selectIdx = body.search(
      /\.select\(\s*\{\s*workspaceId:\s*agsVaults\.workspaceId\s*\}/,
    );
    const insertIdx = body.search(/\.insert\s*\(\s*agsVaultNotes\s*\)/);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(insertIdx);
  });

  it("createNote routes all three writes through the single resolved conn", () => {
    const fnMatch = src.match(
      /async\s+createNote\s*\([\s\S]*?\n\s{2}\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    // The function should declare `conn` once and use it for all
    // three writes (insert notes, insert versions, update notes).
    expect(/const\s+conn\s*=\s*workspaceId\s*!=\s*null/.test(body)).toBe(true);
    expect(/conn\s*\n\s*\.insert\s*\(\s*agsVaultNotes\s*\)/.test(body)).toBe(
      true,
    );
    expect(
      /conn\s*\n\s*\.insert\s*\(\s*agsVaultNoteVersions\s*\)/.test(body),
    ).toBe(true);
    expect(/conn\s*\n\s*\.update\s*\(\s*agsVaultNotes\s*\)/.test(body)).toBe(
      true,
    );
  });

  it("createNote falls back to bootstrap lookupConn when workspaceId is null/missing", () => {
    const fnMatch = src.match(
      /async\s+createNote\s*\([\s\S]*?\n\s{2}\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    expect(
      /workspaceId\s*!=\s*null\s*\?\s*getAsDbForWorkspace\s*\(\s*workspaceId\s*\)\s*:\s*lookupConn/.test(
        body,
      ),
    ).toBe(true);
  });
});
