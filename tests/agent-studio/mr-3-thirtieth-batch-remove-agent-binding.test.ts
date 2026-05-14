/**
 * MR-3 thirtieth batch — bindings.ts::removeAgentProviderBinding
 * split-handle Cat B→A.
 * PR-V1-99.
 *
 * The binding row itself carries `workspaceId` (non-null) on
 * `agsAgentProviderBindings`, so the discovery SELECT pulls it up
 * and the DELETE routes via `getAsDbForWorkspace`. If no row
 * exists for `(draftId, role)`, the function returns `false`
 * (idempotent — preserves pre-migration contract).
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

describe("MR-3 thirtieth batch — removeAgentProviderBinding split-handle", () => {
  const file = resolve(__dirname, "../../server/agent-studio/bindings.ts");
  const src = readFileSync(file, "utf8");

  it("uses two DB handles — SELECT via getAsDb, DELETE via getAsDbForWorkspace", () => {
    const body = extractFunctionBody(src, "removeAgentProviderBinding");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId\s*\)/.test(body),
    ).toBe(true);
  });

  it("discovery SELECT precedes the DELETE", () => {
    const body = extractFunctionBody(src, "removeAgentProviderBinding");
    const selectIdx = body.search(
      /\.select\(\s*\{\s*workspaceId:\s*agsAgentProviderBindings\.workspaceId\s*\}/,
    );
    const deleteIdx = body.search(/\.delete\s*\(\s*agsAgentProviderBindings\s*\)/);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(deleteIdx);
  });

  it("returns false on empty lookup (idempotent contract preserved)", () => {
    const body = extractFunctionBody(src, "removeAgentProviderBinding");
    expect(/if\s*\(\s*lookup\.length\s*===\s*0\s*\)\s*return\s+false\s*;/.test(body)).toBe(
      true,
    );
  });
});
