/**
 * MR-3 twenty-sixth batch — canvas/canvas-service.ts::createCanvasNode
 * and createCanvasEdge split-handle Cat B→A migration via canvas→vault
 * →workspace JOIN.
 * PR-V1-94.
 *
 * Mirrors the #844 pattern but with a deeper resolver. The JOIN is
 * factored into a private `resolveWorkspaceIdForCanvas(lookupDb,
 * canvasId)` helper so both mutations share the same shape. The
 * helper returns null when the canvas row is missing OR the parent
 * vault's workspaceId column is null (legacy rows); the caller
 * falls back to the default lookupDb so the FK constraint on the
 * INSERT surfaces the missing-canvas error.
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

describe("MR-3 twenty-sixth batch — canvas node/edge cross-table split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/canvas-service.ts",
  );
  const src = readFileSync(file, "utf8");

  it("defines a private resolveWorkspaceIdForCanvas helper", () => {
    expect(
      /async\s+function\s+resolveWorkspaceIdForCanvas\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveWorkspaceIdForCanvas JOIN-s agsCanvases × agsVaults on vaultId", () => {
    const stripped = stripComments(src);
    // The helper body should contain both the SELECT for vault.workspaceId
    // and the innerJoin on agsCanvases.vaultId = agsVaults.id.
    expect(
      /\.select\(\s*\{\s*workspaceId:\s*agsVaults\.workspaceId\s*\}\s*\)[\s\S]{0,400}\.innerJoin\(\s*agsVaults,\s*eq\(\s*agsCanvases\.vaultId,\s*agsVaults\.id\s*\)\s*\)/.test(
        stripped,
      ),
    ).toBe(true);
  });

  it.each(["createCanvasNode", "createCanvasEdge"])(
    "%s uses lookupDb + routed handle via resolveWorkspaceIdForCanvas",
    (fnName) => {
      const body = extractFunctionBody(src, fnName);
      expect(body.length).toBeGreaterThan(0);
      expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
      expect(
        /resolveWorkspaceIdForCanvas\s*\(\s*lookupDb,\s*input\.canvasId\s*\)/.test(
          body,
        ),
      ).toBe(true);
      expect(
        /workspaceId\s*!=\s*null\s*\?\s*getAsDbForWorkspace\s*\(\s*workspaceId\s*\)\s*:\s*lookupDb/.test(
          body,
        ),
      ).toBe(true);
    },
  );

  it.each([
    ["createCanvasNode", "agsCanvasNodes"],
    ["createCanvasEdge", "agsCanvasEdges"],
  ])("%s discovery resolver runs before INSERT into %s", (fnName, table) => {
    const body = extractFunctionBody(src, fnName);
    const resolveIdx = body.search(/resolveWorkspaceIdForCanvas\s*\(/);
    const insertIdx = body.search(new RegExp(`\\.insert\\s*\\(\\s*${table}\\s*\\)`));
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(resolveIdx).toBeLessThan(insertIdx);
  });
});
