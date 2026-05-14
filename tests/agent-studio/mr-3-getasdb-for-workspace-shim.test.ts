/**
 * MR-3 — getAsDbForWorkspace shim + first-batch migration source-scan
 * (PR-V1-43).
 *
 * Covers:
 *   - The shim exists and is exported from `db/connection.ts`.
 *   - Phase-1 contract: returns whatever `getAsDb()` returns; ignores
 *     workspaceId. We verify this by calling the shim with two
 *     different workspaceIds and confirming the returned reference is
 *     identical (same lazy-init cache).
 *   - First-batch migration source-scan:
 *     * `extensions/manifest.ts::installExtension` calls
 *       `getAsDbForWorkspace(input.workspaceId)`.
 *     * `extensions/manifest.ts::listExtensionsByWorkspace` calls
 *       `getAsDbForWorkspace(workspaceId)`.
 *     * Both functions NO LONGER call `getAsDb()` directly.
 *     * The 3 unmigrated functions in the same file (Category B —
 *       awaiting plumbing) STILL call `getAsDb()` directly.
 *     * The file imports `getAsDbForWorkspace` from db/connection.
 *
 * The shim test is structural / cache-identity. It does NOT run a
 * real DB connection.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  getAsDb,
  getAsDbForWorkspace,
  resetAsDb,
} from "../../server/agent-studio/db/connection.js";

describe("getAsDbForWorkspace — phase-1 shim contract", () => {
  it("is exported as a function", () => {
    expect(typeof getAsDbForWorkspace).toBe("function");
  });

  it("delegates to getAsDb() — different workspaceIds return the SAME cached instance", () => {
    // Reset the cache so we observe the first lazy-init.
    resetAsDb();
    const a = getAsDbForWorkspace(1);
    const b = getAsDbForWorkspace(2);
    const c = getAsDb();
    // All three share the same cache. (Either all null if connect
    // failed, or all the same Drizzle instance.)
    expect(a).toBe(b);
    expect(a).toBe(c);
  });
});

function stripComments(src: string): string {
  // Strip // line comments and /* ... */ block comments. Crude but
  // sufficient for the source-scan tests below (which check for
  // call patterns in code, not in commentary).
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

function extractFunctionBody(src: string, fnName: string): string {
  // Find the function declaration, then slice from its position to
  // the next `export async function` or end of file. Strip comments
  // so commentary mentioning a banned call pattern doesn't false-
  // positive the source scan.
  const decl = new RegExp(`export\\s+async\\s+function\\s+${fnName}\\(`);
  const start = src.search(decl);
  if (start === -1) return "";
  const remainder = src.slice(start);
  const nextExport = remainder.search(/\nexport\s+/);
  const body = nextExport === -1 ? remainder : remainder.slice(0, nextExport);
  return stripComments(body);
}

describe("MR-3 first-batch source-scan — extensions/manifest.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/manifest.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("installExtension calls getAsDbForWorkspace(input.workspaceId)", () => {
    const body = extractFunctionBody(src, "installExtension");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  it("listExtensionsByWorkspace calls getAsDbForWorkspace(workspaceId)", () => {
    const body = extractFunctionBody(src, "listExtensionsByWorkspace");
    expect(body.length).toBeGreaterThan(0);
    expect(/getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/.test(body)).toBe(
      true,
    );
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  it.each([
    ["approveExtension"],
    ["setExtensionStatus"],
    ["getExtensionById"],
  ])(
    "%s is Category B (awaiting plumbing) — still calls getAsDb()",
    (fnName) => {
      const body = extractFunctionBody(src, fnName);
      expect(body.length).toBeGreaterThan(0);
      expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
      expect(/getAsDbForWorkspace/.test(body)).toBe(false);
    },
  );
});

describe("MR-3 inventory doc is committed", () => {
  it("the inventory doc exists at the documented path", () => {
    const docPath = resolve(
      __dirname,
      "../../docs/implementation/agent-studio-mr-3-getasdb-inventory.md",
    );
    const doc = readFileSync(docPath, "utf8");
    expect(doc.length).toBeGreaterThan(0);
    expect(doc).toMatch(/getAsDb/);
    expect(doc).toMatch(/Category A/);
    expect(doc).toMatch(/Category B/);
  });
});
