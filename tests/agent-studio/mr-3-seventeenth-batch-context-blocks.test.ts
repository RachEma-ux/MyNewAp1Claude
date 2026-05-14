/**
 * MR-3 seventeenth batch — services/rac/trace/store.ts
 * writeContextBlocks (Cat B → Cat A via rows[0].workspaceId).
 * PR-V1-78.
 *
 * Phase F seventeenth batch — "discovering-helper" pattern: the
 * function takes an array of rows with `workspaceId` per row, but
 * not as a top-level parameter. The "context blocks share a parent
 * trace" invariant means every row in a single
 * `writeContextBlocks(rows)` call belongs to the same workspace
 * (the parent trace is workspace-scoped). So `rows[0].workspaceId`
 * is the routing key — Phase-1 shim still delegates to
 * `getAsDb()` regardless; Phase-2 will route by region.
 *
 * Cat-B-deferred sibling `listContextBlocks(traceId)` stays on
 * `getAsDb()` (no workspaceId in scope; would need plumbing).
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

describe("MR-3 seventeenth batch source-scan — writeContextBlocks", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/rac/trace/store.ts",
  );
  const src = readFileSync(file, "utf8");

  it("writeContextBlocks routes via rows[0].workspaceId", () => {
    const body = extractFunctionBody(src, "writeContextBlocks");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*rows\[0\]\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  it("the rows.length === 0 early-return precedes the DB call (invariant)", () => {
    // Defensive — the migration relies on rows[0] being safe. The
    // function-body pattern is: `if (rows.length === 0) return;`
    // BEFORE the getAsDbForWorkspace call. This source-scan asserts
    // that ordering survives future edits.
    const body = extractFunctionBody(src, "writeContextBlocks");
    const earlyReturnIdx = body.search(/rows\.length\s*===\s*0/);
    const dbCallIdx = body.search(
      /getAsDbForWorkspace\s*\(\s*rows\[0\]\.workspaceId/,
    );
    expect(earlyReturnIdx).toBeGreaterThan(-1);
    expect(dbCallIdx).toBeGreaterThan(-1);
    expect(earlyReturnIdx).toBeLessThan(dbCallIdx);
  });

  it("listContextBlocks(traceId) stays Cat B on getAsDb() (traceId-scoped)", () => {
    const body = extractFunctionBody(src, "listContextBlocks");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(/getAsDbForWorkspace/.test(body)).toBe(false);
  });
});
