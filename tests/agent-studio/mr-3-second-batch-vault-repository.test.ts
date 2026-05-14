/**
 * MR-3 second batch — vault/repository-asdb.ts source-scan
 * (PR-V1-46).
 *
 * Phase F second batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Covers:
 *   - `createVault` calls `getAsDbForWorkspace(input.workspaceId)`,
 *     NOT `getAsDb()`.
 *   - The file imports `getAsDbForWorkspace` from db/connection.
 *   - All other repository methods still call `getAsDb()` (they're
 *     in inventory Category B — awaiting per-method plumbing of
 *     workspaceId).
 *   - The Phase-1 shim's widened signature accepts undefined (the
 *     VaultCreateInput.workspaceId is optional).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  getAsDb,
  getAsDbForWorkspace,
  resetAsDb,
} from "../../server/agent-studio/db/connection.js";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

function extractMethodBody(src: string, methodName: string): string {
  // Find the start of `\n  async methodName(`. Walk PAST the full
  // decl match (not just +1 char — the decl's `\s+` may swallow a
  // blank line, leaving multiple newlines in scope). Then find the
  // start of the NEXT `\n  async ` after the open paren and slice.
  const decl = new RegExp(`\\n\\s+async\\s+${methodName}\\s*\\(`);
  const declMatch = src.match(decl);
  if (!declMatch || declMatch.index === undefined) return "";
  const start = declMatch.index;
  const declEnd = start + declMatch[0].length;
  const afterDecl = src.slice(declEnd);
  const nextMatch = afterDecl.match(/\n\s+async\s+\w+\s*\(/);
  const end =
    nextMatch && nextMatch.index !== undefined
      ? declEnd + nextMatch.index
      : src.length;
  return stripComments(src.slice(start, end));
}

describe("Phase-1 shim accepts undefined workspaceId (widened signature)", () => {
  it("getAsDbForWorkspace(undefined) returns the same instance as getAsDb()", () => {
    resetAsDb();
    const a = getAsDbForWorkspace(undefined);
    const b = getAsDb();
    expect(a).toBe(b);
  });

  it("getAsDbForWorkspace(null) returns the same instance", () => {
    const a = getAsDbForWorkspace(null);
    const b = getAsDb();
    expect(a).toBe(b);
  });
});

describe("MR-3 second batch source-scan — vault/repository-asdb.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/repository-asdb.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("createVault calls getAsDbForWorkspace(input.workspaceId)", () => {
    const body = extractMethodBody(src, "createVault");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  it.each([
    "addMember",
    "listVaultsForUser",
    "createNote",
    "getNoteById",
    "getNoteVersion",
    "updateNote",
    "listNotesInVault",
    "deleteNote",
  ])(
    "%s is Category B (awaiting plumbing) — still calls getAsDb()",
    (methodName) => {
      const body = extractMethodBody(src, methodName);
      expect(body.length).toBeGreaterThan(0);
      expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
      expect(/getAsDbForWorkspace/.test(body)).toBe(false);
    },
  );
});
