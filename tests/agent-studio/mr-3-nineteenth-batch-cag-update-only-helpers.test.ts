/**
 * MR-3 nineteenth batch — cag/store.ts update-only split-handle
 * Cat B→A migrations: markPackUsed + recordPackTokenActual.
 * PR-V1-87.
 *
 * Extension of the #831 split-handle pattern to UPDATE-only
 * mutations that don't already have a SELECT in the body. Adds a
 * SELECT-by-id round-trip purely to discover the workspaceId so
 * the UPDATE can route via getAsDbForWorkspace.
 *
 * Same Cat C bootstrap exception: the discovery SELECT
 * legitimately uses getAsDb() because workspaceId isn't known
 * yet.
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

describe("MR-3 nineteenth batch — markPackUsed split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/cag/store.ts",
  );
  const src = readFileSync(file, "utf8");

  it("markPackUsed uses two DB handles — SELECT via getAsDb, UPDATE via getAsDbForWorkspace", () => {
    const body = extractFunctionBody(src, "markPackUsed");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId\s*\)/.test(body),
    ).toBe(true);
  });

  it("markPackUsed SELECT-by-id precedes the getAsDbForWorkspace call (ordering invariant)", () => {
    const body = extractFunctionBody(src, "markPackUsed");
    const selectIdx = body.search(
      /\.select\(\s*\{\s*workspaceId:[\s\S]{0,200}\.from\s*\(\s*agsCagCapabilityPacks/,
    );
    const routedIdx = body.search(
      /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId/,
    );
    expect(selectIdx).toBeGreaterThan(-1);
    expect(routedIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(routedIdx);
  });
});

describe("MR-3 nineteenth batch — recordPackTokenActual split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/cag/store.ts",
  );
  const src = readFileSync(file, "utf8");

  it("recordPackTokenActual uses two DB handles — SELECT via getAsDb, UPDATE via getAsDbForWorkspace", () => {
    const body = extractFunctionBody(src, "recordPackTokenActual");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId\s*\)/.test(body),
    ).toBe(true);
  });
});

describe("MR-3 nineteenth batch — #820 Cat B list amended", () => {
  // After this batch, the only remaining Cat B helpers in
  // cag/store.ts are the read-only siblings getLatestPack +
  // listPacks (intentional — no UPDATE/DELETE means no routing
  // benefit from a split-handle). The #820 source-scan test was
  // amended in #831 to drop markPackStale from Cat B; this batch
  // additionally drops markPackUsed + recordPackTokenActual.
  const file = resolve(
    __dirname,
    "../../tests/agent-studio/mr-3-eighth-batch-cag-store.test.ts",
  );
  const src = readFileSync(file, "utf8");

  it("the prior batch test's CATEGORY_B array no longer contains markPackUsed or recordPackTokenActual", () => {
    // Extract just the CATEGORY_B array body so a comment mention
    // of the function name doesn't satisfy the assertion.
    const arrayMatch = src.match(
      /CATEGORY_B\s*:\s*ReadonlyArray<string>\s*=\s*\[([\s\S]*?)\]\s*;/,
    );
    expect(arrayMatch).toBeTruthy();
    const arrayBody = arrayMatch?.[1] ?? "";
    expect(/markPackUsed/.test(arrayBody)).toBe(false);
    expect(/recordPackTokenActual/.test(arrayBody)).toBe(false);
  });
});
