/**
 * MR-3 thirty-second batch — vault/repository-asdb.ts::AsdbVaultRepository.addMember
 * vault→workspace split-handle Cat B→A.
 * PR-V1-101.
 *
 * `agsVaultMembers` does not carry workspaceId; the parent
 * `agsVaults.workspaceId` does. Mirrors the #844 createCanvas
 * pattern: discovery SELECT pulls vault.workspaceId, INSERT routes
 * via getAsDbForWorkspace. Falls back to the bootstrap handle when
 * the vault row is missing OR workspaceId IS NULL (legacy rows) so
 * the FK constraint on the INSERT surfaces the missing-vault error.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("MR-3 thirty-second batch — AsdbVaultRepository.addMember split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/repository-asdb.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb", () => {
    expect(
      /import\s*\{\s*getAsDb,\s*getAsDbForWorkspace\s*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("addMember SELECTs vault.workspaceId then routes via getAsDbForWorkspace", () => {
    // Slice the class method body by name.
    const fnMatch = src.match(
      /async\s+addMember\s*\([\s\S]*?\n\s{2}\}\n/,
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

  it("addMember discovery SELECT precedes the INSERT into agsVaultMembers", () => {
    const fnMatch = src.match(
      /async\s+addMember\s*\([\s\S]*?\n\s{2}\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    const selectIdx = body.search(
      /\.select\(\s*\{\s*workspaceId:\s*agsVaults\.workspaceId\s*\}/,
    );
    const insertIdx = body.search(/\.insert\s*\(\s*agsVaultMembers\s*\)/);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(insertIdx);
  });

  it("addMember falls back to bootstrap lookupConn when workspaceId is null/missing", () => {
    const fnMatch = src.match(
      /async\s+addMember\s*\([\s\S]*?\n\s{2}\}\n/,
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
