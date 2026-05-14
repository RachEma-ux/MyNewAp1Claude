/**
 * MR-3 twenty-fifth batch — canvas/canvas-service.ts::createCanvas
 * split-handle Cat B→A migration via vault→workspace resolver lookup.
 * PR-V1-93.
 *
 * The Canvas table doesn't carry workspaceId directly; the lookup
 * goes through the parent vault (agsVaults.workspaceId). When the
 * vault row is missing or its workspaceId column is null (legacy
 * rows), the routed handle falls back to the default ASDB handle —
 * the FK constraint on the INSERT will surface the missing-vault
 * error to the caller.
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

describe("MR-3 twenty-fifth batch — createCanvas vault→workspace split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/canvas-service.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("imports agsVaults to enable the vault→workspace lookup", () => {
    expect(
      /import\s*\{\s*agsVaults\s*\}\s*from\s+["']\.\.\/\.\.\/\.\.\/\.\.\/drizzle\/tables\/agent-studio-vault(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("createCanvas SELECTs vault.workspaceId then routes via getAsDbForWorkspace", () => {
    const body = extractFunctionBody(src, "createCanvas");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(
      /\.select\(\s*\{\s*workspaceId:\s*agsVaults\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(/getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/.test(body)).toBe(true);
  });

  it("createCanvas discovery SELECT precedes the INSERT", () => {
    const body = extractFunctionBody(src, "createCanvas");
    const selectIdx = body.search(
      /\.select\(\s*\{\s*workspaceId:\s*agsVaults\.workspaceId\s*\}/,
    );
    const insertIdx = body.search(/\.insert\s*\(\s*agsCanvases\s*\)/);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(insertIdx);
  });

  it("createCanvas falls back to getAsDb() handle when workspaceId is null/missing", () => {
    const body = extractFunctionBody(src, "createCanvas");
    // The pattern is `workspaceId != null ? getAsDbForWorkspace(workspaceId) : lookupDb`
    expect(
      /workspaceId\s*!=\s*null\s*\?\s*getAsDbForWorkspace\s*\(\s*workspaceId\s*\)\s*:\s*lookupDb/.test(
        body,
      ),
    ).toBe(true);
  });
});
