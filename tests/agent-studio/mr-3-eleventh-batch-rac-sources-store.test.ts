/**
 * MR-3 eleventh batch — services/rac/sources/store.ts source-scan
 * (PR-V1-72).
 *
 * Phase F eleventh batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Covers:
 *   - 6 Category A functions migrate to `getAsDbForWorkspace`:
 *     `createProfile(input)`                  → input.workspaceId
 *     `createSource(input)`                   → input.workspaceId
 *     `listSourcesForWorkspace(workspaceId,…)` → workspaceId
 *     `upsertPolicy(input)`                   → input.workspaceId
 *     `getWorkspaceEmbeddingDefault(workspaceId)` → workspaceId
 *     `upsertWorkspaceEmbeddingDefault(input)` → input.workspaceId
 *   - 8 Category B functions still call `getAsDb()`:
 *     getProfile, listProfilesForDraft, updateProfile, getSource,
 *     listSourcesForProfile, updateSource, deleteSource,
 *     getPolicyForProfile
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

function extractFunctionBody(src: string, fnName: string): string {
  const decl = new RegExp(
    `\\n\\s*export\\s+(?:async\\s+)?function\\s+${fnName}\\s*[<(]`,
  );
  const declMatch = src.match(decl);
  if (!declMatch || declMatch.index === undefined) return "";
  const start = declMatch.index;
  const declEnd = start + declMatch[0].length;
  const afterDecl = src.slice(declEnd);
  const nextMatch = afterDecl.match(
    /\n\s*export\s+(?:async\s+)?function\s+\w+\s*[<(]/,
  );
  const end =
    nextMatch && nextMatch.index !== undefined
      ? declEnd + nextMatch.index
      : src.length;
  return stripComments(src.slice(start, end));
}

describe("MR-3 eleventh batch source-scan — services/rac/sources/store.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/rac/sources/store.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  describe("Category A — workspaceId in scope, migrated", () => {
    const CATEGORY_A: ReadonlyArray<{ fn: string; pattern: RegExp }> = [
      {
        fn: "createProfile",
        pattern: /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/,
      },
      {
        fn: "createSource",
        pattern: /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/,
      },
      {
        fn: "listSourcesForWorkspace",
        pattern: /getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/,
      },
      {
        fn: "upsertPolicy",
        pattern: /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/,
      },
      {
        fn: "getWorkspaceEmbeddingDefault",
        pattern: /getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/,
      },
      {
        fn: "upsertWorkspaceEmbeddingDefault",
        pattern: /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/,
      },
    ];

    for (const { fn, pattern } of CATEGORY_A) {
      it(`${fn} calls getAsDbForWorkspace(...) and not getAsDb()`, () => {
        const body = extractFunctionBody(src, fn);
        expect(body.length).toBeGreaterThan(0);
        expect(pattern.test(body)).toBe(true);
        expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
      });
    }
  });

  describe("Category B — still on getAsDb() pending caller plumbing", () => {
    const CATEGORY_B: ReadonlyArray<string> = [
      "getProfile",
      "listProfilesForDraft",
      "updateProfile",
      "getSource",
      "listSourcesForProfile",
      "updateSource",
      "deleteSource",
      "getPolicyForProfile",
    ];

    for (const fn of CATEGORY_B) {
      it(`${fn} is Category B and still calls getAsDb()`, () => {
        const body = extractFunctionBody(src, fn);
        expect(body.length).toBeGreaterThan(0);
        expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
        expect(/getAsDbForWorkspace/.test(body)).toBe(false);
      });
    }
  });
});
