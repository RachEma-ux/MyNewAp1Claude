/**
 * MR-3 twelfth batch — services/rac/trace/store.ts source-scan
 * (PR-V1-73).
 *
 * Phase F twelfth batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Covers:
 *   - 6 Category A functions migrate to `getAsDbForWorkspace`:
 *     `writeTrace(input)`            → input.workspaceId
 *     `updateTraceScores(input)`     → input.workspaceId
 *     `getTraceById(workspaceId,…)`  → workspaceId
 *     `getTraceForMessage(workspaceId,…)` → workspaceId
 *     `recordFeedback(input)`        → input.workspaceId
 *     `getFeedbackForMessage(workspaceId,…)` → workspaceId
 *   - 2 Category B functions still on `getAsDb()`:
 *     `writeContextBlocks(rows)`    — array-of-rows shape; row[0]
 *                                     workspaceId derivation deferred
 *     `listContextBlocks(traceId)`  — traceId-scoped
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

describe("MR-3 twelfth batch source-scan — services/rac/trace/store.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/rac/trace/store.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  describe("Category A — workspaceId in scope, migrated", () => {
    const CATEGORY_A: ReadonlyArray<{ fn: string; pattern: RegExp }> = [
      {
        fn: "writeTrace",
        pattern: /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/,
      },
      {
        fn: "updateTraceScores",
        pattern: /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/,
      },
      {
        fn: "getTraceById",
        pattern: /getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/,
      },
      {
        fn: "getTraceForMessage",
        pattern: /getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/,
      },
      {
        fn: "recordFeedback",
        pattern: /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/,
      },
      {
        fn: "getFeedbackForMessage",
        pattern: /getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/,
      },
    ];

    for (const { fn, pattern } of CATEGORY_A) {
      it(`${fn} calls getAsDbForWorkspace(...) and not getAsDb()`, () => {
        const body = extractFunctionBody(src, fn);
        expect(body.length).toBeGreaterThan(0);
        expect(pattern.test(body)).toBe(true);
        expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
      });
    }
  });

  describe("Category B — still on getAsDb() pending caller plumbing", () => {
    const CATEGORY_B: ReadonlyArray<string> = [
      "writeContextBlocks",
      "listContextBlocks",
    ];

    for (const fn of CATEGORY_B) {
      it(`${fn} is Category B and still calls getAsDb()`, () => {
        const body = extractFunctionBody(src, fn);
        expect(body.length).toBeGreaterThan(0);
        expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
        expect(/getAsDbForWorkspace/.test(body)).toBe(false);
      });
    }
  });
});
