/**
 * MR-3 seventy-first batch — services/vault/repository-asdb.ts ::
 * listNotesInVault Path-A read consumer.
 * PR-V1-141.
 *
 * Ninth read-path Path-X promotion. vaultId → agsVaults.workspaceId
 * in a single pre-projection SELECT, then route the SELECT on
 * agsVaultNotes to the home region. Falls back to bootstrap when
 * vault is missing OR vault.workspaceId IS NULL.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 seventy-first batch — listNotesInVault Path-A", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/repository-asdb.ts",
  );
  const src = readFileSync(file, "utf8");

  function methodBody(name: string): string {
    const startIdx = src.indexOf(`async ${name}(`);
    if (startIdx === -1) return "";
    const remainder = src.slice(startIdx);
    const nextMethodIdx = remainder.slice(1).search(/\n\s{2}async\s+\w+\(/);
    const endIdx =
      nextMethodIdx >= 0 ? startIdx + 1 + nextMethodIdx : src.length;
    return src.slice(startIdx, endIdx);
  }

  it("listNotesInVault pre-projects workspaceId from agsVaults then routes the SELECT on agsVaultNotes", () => {
    const body = methodBody("listNotesInVault");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /lookupConn\s*\n?\s*\.select\s*\(\s*\{\s*workspaceId:\s*agsVaults\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*ws\[0\]\.workspaceId\s*\)\s*\?\?\s*lookupConn/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.select\s*\(\s*\{[\s\S]*?id:\s*agsVaultNotes\.id/.test(body),
    ).toBe(true);
  });
});
