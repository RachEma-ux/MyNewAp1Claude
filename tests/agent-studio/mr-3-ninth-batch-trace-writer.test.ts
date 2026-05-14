/**
 * MR-3 ninth batch — services/runtime/trace-writer.ts source-scan
 * (PR-V1-70).
 *
 * Phase F ninth batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Covers:
 *   - `recordToolCallTrace(input)` calls
 *     `getAsDbForWorkspace(input.workspaceId)` — Category A
 *     (ToolCallTraceInput.workspaceId required).
 *   - `patchRacRuntimeTrace(traceId, patch)` still calls `getAsDb()`
 *     — Category B (traceId-scoped; workspaceId would need to be
 *     plumbed through callers via a separate sub-arc).
 *   - The file imports `getAsDbForWorkspace` alongside `getAsDb`.
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

describe("MR-3 ninth batch source-scan — services/runtime/trace-writer.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/runtime/trace-writer.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("recordToolCallTrace calls getAsDbForWorkspace(input.workspaceId) and not getAsDb()", () => {
    const body = extractFunctionBody(src, "recordToolCallTrace");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  it("patchRacRuntimeTrace is Category B (traceId-scoped) — still calls getAsDb()", () => {
    const body = extractFunctionBody(src, "patchRacRuntimeTrace");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(/getAsDbForWorkspace/.test(body)).toBe(false);
  });
});
