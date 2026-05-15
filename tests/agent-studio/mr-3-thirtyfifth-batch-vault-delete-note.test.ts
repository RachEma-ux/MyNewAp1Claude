/**
 * MR-3 thirty-fifth batch — vault/repository-asdb.ts::AsdbVaultRepository.deleteNote
 * note→vault→workspace split-handle Cat B→A.
 * PR-V1-104.
 *
 * deleteNote pre-existing SELECT-by-noteId is widened to also pull
 * vault.workspaceId in the same round-trip — no additional latency
 * vs. pre-migration. The soft-delete UPDATE routes via
 * getAsDbForWorkspace. Falls back to bootstrap handle when
 * workspaceId IS NULL.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("MR-3 thirty-fifth batch — AsdbVaultRepository.deleteNote split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/repository-asdb.ts",
  );
  const src = readFileSync(file, "utf8");

  it("deleteNote widens the existing SELECT to also pull vault.workspaceId via JOIN", () => {
    const fnMatch = src.match(/async\s+deleteNote\s*\([\s\S]*?\n\s{2}\}\n/);
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    expect(/workspaceId:\s*agsVaults\.workspaceId/.test(body)).toBe(true);
    expect(
      /\.innerJoin\s*\(\s*agsVaults,\s*eq\s*\(\s*agsVaultNotes\.vaultId,\s*agsVaults\.id\s*\)\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("deleteNote routes the UPDATE via getAsDbForWorkspace(row.workspaceId)", () => {
    const fnMatch = src.match(/async\s+deleteNote\s*\([\s\S]*?\n\s{2}\}\n/);
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    expect(
      /getAsDbForWorkspace\s*\(\s*row\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(
      /row\.workspaceId\s*!=\s*null[\s\S]*?:\s*lookupConn/.test(body),
    ).toBe(true);
  });

  it("deleteNote SELECT precedes the UPDATE", () => {
    const fnMatch = src.match(/async\s+deleteNote\s*\([\s\S]*?\n\s{2}\}\n/);
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    const selectIdx = body.search(/\.innerJoin\s*\(\s*agsVaults,/);
    const updateIdx = body.search(/\.update\s*\(\s*agsVaultNotes\s*\)/);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(updateIdx);
  });
});
