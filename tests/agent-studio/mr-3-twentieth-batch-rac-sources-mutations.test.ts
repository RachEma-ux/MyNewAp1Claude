/**
 * MR-3 twentieth batch — rac/sources/store.ts mutation
 * split-handle Cat B→A migrations: updateProfile + updateSource
 * + deleteSource. PR-V1-88.
 *
 * Same split-handle pattern as #831 (markPackStale), extended to
 * three mutations in rac/sources/store.ts that take id-only inputs
 * (profileId / sourceId).
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

describe("MR-3 twentieth batch — rac/sources/store.ts mutation split-handles", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/rac/sources/store.ts",
  );
  const src = readFileSync(file, "utf8");

  const MUTATIONS = [
    "updateProfile",
    "updateSource",
    "deleteSource",
  ] as const;

  for (const fn of MUTATIONS) {
    it(`${fn} uses two DB handles — lookup via getAsDb, mutation via getAsDbForWorkspace`, () => {
      const body = extractFunctionBody(src, fn);
      expect(body.length).toBeGreaterThan(0);
      expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
      expect(
        /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId\s*\)/.test(body),
      ).toBe(true);
    });

    it(`${fn} SELECT-by-id precedes the getAsDbForWorkspace call (ordering invariant)`, () => {
      const body = extractFunctionBody(src, fn);
      const selectIdx = body.search(
        /\.select\(\s*\{\s*workspaceId:[\s\S]{0,200}\.from\s*\(/,
      );
      const routedIdx = body.search(
        /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId/,
      );
      expect(selectIdx).toBeGreaterThan(-1);
      expect(routedIdx).toBeGreaterThan(-1);
      expect(selectIdx).toBeLessThan(routedIdx);
    });
  }
});

describe("MR-3 twentieth batch — #823 Cat B list amended", () => {
  const file = resolve(
    __dirname,
    "../../tests/agent-studio/mr-3-eleventh-batch-rac-sources-store.test.ts",
  );
  const src = readFileSync(file, "utf8");

  it("the #823 CATEGORY_B array no longer contains updateProfile / updateSource / deleteSource", () => {
    const arrayMatch = src.match(
      /CATEGORY_B\s*:\s*ReadonlyArray<string>\s*=\s*\[([\s\S]*?)\]\s*;/,
    );
    expect(arrayMatch).toBeTruthy();
    const arrayBody = arrayMatch?.[1] ?? "";
    expect(/updateProfile/.test(arrayBody)).toBe(false);
    expect(/updateSource/.test(arrayBody)).toBe(false);
    expect(/deleteSource/.test(arrayBody)).toBe(false);
  });
});
