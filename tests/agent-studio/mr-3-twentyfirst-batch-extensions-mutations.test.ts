/**
 * MR-3 twenty-first batch — services/extensions/manifest.ts
 * mutation split-handles (Cat B→A) for approveExtension +
 * setExtensionStatus. PR-V1-89.
 *
 * Same split-handle pattern as #831 / #838 / #839. The 2
 * extension mutations were Cat B per #794 (extensionId-scoped).
 * This batch promotes both to Cat A.
 *
 * `getExtensionById` remains Cat B — it's read-only and the
 * marginal cost of the discovery SELECT outweighs the routing
 * benefit on a single-region read path.
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

describe("MR-3 twenty-first batch — extensions/manifest.ts mutation split-handles", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/manifest.ts",
  );
  const src = readFileSync(file, "utf8");

  const MUTATIONS = ["approveExtension", "setExtensionStatus"] as const;

  for (const fn of MUTATIONS) {
    it(`${fn} uses two DB handles — SELECT via getAsDb, UPDATE via getAsDbForWorkspace`, () => {
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
        /\.select\(\s*\{\s*workspaceId:[\s\S]{0,200}\.from\s*\(\s*agsExtensions/,
      );
      const routedIdx = body.search(
        /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId/,
      );
      expect(selectIdx).toBeGreaterThan(-1);
      expect(routedIdx).toBeGreaterThan(-1);
      expect(selectIdx).toBeLessThan(routedIdx);
    });
  }

  it("getExtensionById remains Cat B (read-only; no split-handle)", () => {
    const body = extractFunctionBody(src, "getExtensionById");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(/getAsDbForWorkspace/.test(body)).toBe(false);
  });
});
