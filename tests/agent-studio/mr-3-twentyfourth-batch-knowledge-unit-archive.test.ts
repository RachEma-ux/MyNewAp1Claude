/**
 * MR-3 twenty-fourth batch — ingestion/knowledge-unit-service.ts
 * `archiveUnit` split-handle Cat B→A migration.
 * PR-V1-92.
 *
 * Same pattern as #831 / #838 / #839 / #840 / #841 / #842. Soft-fail
 * on vanished unitIds is preserved via a `lookup.length === 0` early
 * return (archival is idempotent — no point throwing if the unit row
 * is already gone).
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

describe("MR-3 twenty-fourth batch — archiveUnit split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/ingestion/knowledge-unit-service.ts",
  );
  const src = readFileSync(file, "utf8");

  it("uses two DB handles — SELECT via getAsDb, UPDATE via getAsDbForWorkspace", () => {
    const body = extractFunctionBody(src, "archiveUnit");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId\s*\)/.test(body),
    ).toBe(true);
  });

  it("discovery SELECT precedes the UPDATE", () => {
    const body = extractFunctionBody(src, "archiveUnit");
    const selectIdx = body.search(
      /\.select\(\s*\{\s*workspaceId:[\s\S]{0,200}\.from\s*\(\s*agsKnowledgeUnits/,
    );
    const updateIdx = body.search(/\.update\(\s*agsKnowledgeUnits\s*\)/);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(updateIdx);
  });

  it("soft-returns when the lookup is empty (vanished unitId)", () => {
    const body = extractFunctionBody(src, "archiveUnit");
    expect(/lookup\.length\s*===\s*0/.test(body)).toBe(true);
    expect(/if\s*\(\s*lookup\.length\s*===\s*0\s*\)\s*return\s*;/.test(body)).toBe(
      true,
    );
  });

  it("amends prior #807 fourth-batch Cat B assertion — archiveUnit no longer asserted to NOT call getAsDbForWorkspace", () => {
    const fourth = readFileSync(
      resolve(
        __dirname,
        "../../tests/agent-studio/mr-3-fourth-batch-knowledge-unit-service.test.ts",
      ),
      "utf8",
    );
    expect(/PR-V1-92|twenty-fourth batch/.test(fourth)).toBe(true);
  });
});
