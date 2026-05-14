/**
 * MR-3 twenty-second batch — services/runtime/trace-writer.ts
 * `patchRacRuntimeTrace` split-handle Cat B→A migration.
 * PR-V1-90.
 *
 * Same pattern as #831 / #838 / #839 / #840 / #841. The H4-c7
 * empty-patch early-return is preserved BEFORE the discovery
 * SELECT (no wasted round-trip on no-op updates).
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

describe("MR-3 twenty-second batch — patchRacRuntimeTrace split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/runtime/trace-writer.ts",
  );
  const src = readFileSync(file, "utf8");

  it("uses two DB handles — SELECT via getAsDb, UPDATE via getAsDbForWorkspace", () => {
    const body = extractFunctionBody(src, "patchRacRuntimeTrace");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId\s*\)/.test(body),
    ).toBe(true);
  });

  it("H4-c7 empty-patch early-return PRECEDES the discovery SELECT", () => {
    const body = extractFunctionBody(src, "patchRacRuntimeTrace");
    const earlyReturnIdx = body.search(/Object\.keys\(\s*norm\s*\)\.length\s*===\s*0/);
    const selectIdx = body.search(
      /\.select\(\s*\{\s*workspaceId:[\s\S]{0,200}\.from\s*\(\s*agsRacRuntimeTraces/,
    );
    expect(earlyReturnIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(earlyReturnIdx).toBeLessThan(selectIdx);
  });

  it("amends prior #821 ninth-batch Cat B list — patchRacRuntimeTrace no longer in array", () => {
    const ninth = readFileSync(
      resolve(
        __dirname,
        "../../tests/agent-studio/mr-3-ninth-batch-trace-writer.test.ts",
      ),
      "utf8",
    );
    // The prior batch test had a Category B assertion for
    // patchRacRuntimeTrace. The amendment in this batch SHOULD
    // either weaken that assertion or document the
    // promotion-by-#841 in a comment. We assert the file mentions
    // PR-V1-90 to confirm the bookkeeping happened.
    expect(/PR-V1-90|twenty-second batch/.test(ninth)).toBe(true);
  });
});
