/**
 * MR-3 thirty-fourth batch — vault/repository-asdb.ts::AsdbVaultRepository.updateNote
 * note→vault→workspace split-handle Cat B→A.
 * PR-V1-103.
 *
 * updateNote performs up to three writes (conflict ledger row,
 * version INSERT, currentVersionId UPDATE). Resolves workspaceId
 * once at the top via a JOIN of agsVaultNotes × agsVaults on
 * vaultId; all writes share the single resolved conn.
 *
 * Falls back to bootstrap handle when note missing OR workspaceId
 * IS NULL.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("MR-3 thirty-fourth batch — AsdbVaultRepository.updateNote split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/repository-asdb.ts",
  );
  const src = readFileSync(file, "utf8");

  it("updateNote SELECTs workspaceId via agsVaultNotes × agsVaults JOIN", () => {
    const fnMatch = src.match(
      /async\s+updateNote\s*\([\s\S]*?\n\s{2}\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    expect(
      /\.select\(\s*\{\s*workspaceId:\s*agsVaults\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /\.innerJoin\s*\(\s*agsVaults,\s*eq\s*\(\s*agsVaultNotes\.vaultId,\s*agsVaults\.id\s*\)\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("updateNote resolves conn once before any write", () => {
    const fnMatch = src.match(
      /async\s+updateNote\s*\([\s\S]*?\n\s{2}\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    const connIdx = body.search(
      /const\s+conn\s*=\s*workspaceId\s*!=\s*null/,
    );
    const firstWriteIdx = body.search(/\.insert\s*\(\s*agsVaultNoteConflicts\s*\)/);
    expect(connIdx).toBeGreaterThan(-1);
    expect(firstWriteIdx).toBeGreaterThan(-1);
    expect(connIdx).toBeLessThan(firstWriteIdx);
  });

  it("updateNote falls back to bootstrap lookupConn when workspaceId is null/missing", () => {
    const fnMatch = src.match(
      /async\s+updateNote\s*\([\s\S]*?\n\s{2}\}\n/,
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
