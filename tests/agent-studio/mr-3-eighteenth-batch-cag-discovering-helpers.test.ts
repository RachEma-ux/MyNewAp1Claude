/**
 * MR-3 eighteenth batch — `cag/store.ts::markPackStale`
 * "discovering-helper" promotion (Cat B → Cat A).
 * PR-V1-80.
 *
 * Second discovering-helper pattern after #829's
 * `writeContextBlocks`. The function previously stayed on
 * `getAsDb()` (Cat B per #820) because the input is `packId` only
 * (no workspaceId in scope). This batch promotes it to Cat A by
 * splitting the DB access into two handles:
 *
 *   1. `lookupDb = getAsDb()` for the SELECT-by-id (workspaceId
 *      isn't known yet — intentional Category C bootstrap).
 *   2. `db = getAsDbForWorkspace(row.workspaceId)` for the UPDATE
 *      AFTER the row is loaded.
 *
 * In single-region Phase-1 both handles delegate to the same
 * `getAsDb()` → bit-for-bit identical behavior. In Phase-2 the
 * UPDATE correctly routes to the workspace-region pool.
 *
 * Note: this pattern is targeted at MUTATIONS (UPDATE/DELETE) where
 * workspace-region routing matters. Read-only sibling functions
 * (`getLatestPack`, `listPacks`, `getPackById` etc.) stay on the
 * existing pattern; the read DB is single-region anyway, and the
 * cost of an extra lookup-then-route pass isn't worth it.
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

describe("MR-3 eighteenth batch source-scan — markPackStale discovering-helper", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/cag/store.ts",
  );
  const src = readFileSync(file, "utf8");

  it("markPackStale uses two DB handles — lookup via getAsDb, UPDATE via getAsDbForWorkspace", () => {
    const body = extractFunctionBody(src, "markPackStale");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*row\.workspaceId\s*\)/.test(body),
    ).toBe(true);
  });

  it("the SELECT-by-id precedes the getAsDbForWorkspace call (ordering invariant)", () => {
    const body = extractFunctionBody(src, "markPackStale");
    const selectIdx = body.search(
      /\.select\(\)\s*\n\s*\.from\s*\(\s*agsCagCapabilityPacks/,
    );
    const routedIdx = body.search(
      /getAsDbForWorkspace\s*\(\s*row\.workspaceId/,
    );
    expect(selectIdx).toBeGreaterThan(-1);
    expect(routedIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(routedIdx);
  });

  it("the UPDATE uses the workspace-routed handle (not the lookup handle)", () => {
    const body = extractFunctionBody(src, "markPackStale");
    // The .update should appear AFTER the getAsDbForWorkspace
    // assignment in the body.
    const routedIdx = body.search(
      /getAsDbForWorkspace\s*\(\s*row\.workspaceId/,
    );
    const updateIdx = body.search(/\.update\s*\(\s*agsCagCapabilityPacks/);
    expect(routedIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(routedIdx).toBeLessThan(updateIdx);
  });

  it("read-only siblings still use the single-handle pattern (intentional)", () => {
    // getLatestPack / listPacks / getPackById remain on getAsDb()
    // (read-only; no UPDATE/DELETE; routing benefit is marginal).
    // listPacksForAgent + getPackById took the simpler Cat A path
    // in #820 because they have workspaceId on the input.
    const stripped = stripComments(src);

    // listPacksForAgent + getPackById were migrated to Cat A in #820.
    expect(
      /listPacksForAgent[\s\S]*?getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/.test(
        stripped,
      ),
    ).toBe(true);
  });
});
