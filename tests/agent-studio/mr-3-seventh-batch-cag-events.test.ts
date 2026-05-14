/**
 * MR-3 seventh batch — services/cag/events.ts source-scan
 * (PR-V1-68).
 *
 * Phase F seventh batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Covers:
 *   - `appendPackEvent(input)` calls `getAsDbForWorkspace(input.workspaceId)`
 *     (Category A — input.workspaceId is required).
 *   - `listEventsByPack(workspaceId, packId, limit)` calls
 *     `getAsDbForWorkspace(workspaceId)` (Category A — workspaceId is the
 *     first parameter).
 *   - The file imports `getAsDbForWorkspace` alongside `getAsDb` from
 *     db/connection.
 *   - `listPackEvents(agentDraftId, limit)` still calls `getAsDb()`
 *     — it takes only `agentDraftId` (Category B; would need
 *     workspaceId plumbed through callers via a separate sub-arc).
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

describe("MR-3 seventh batch source-scan — services/cag/events.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/cag/events.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("appendPackEvent calls getAsDbForWorkspace(input.workspaceId) and not getAsDb()", () => {
    const body = extractFunctionBody(src, "appendPackEvent");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  it("listEventsByPack calls getAsDbForWorkspace(workspaceId) and not getAsDb()", () => {
    const body = extractFunctionBody(src, "listEventsByPack");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  it("listPackEvents is Category B (agentDraftId-scoped) — still calls getAsDb()", () => {
    const body = extractFunctionBody(src, "listPackEvents");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(/getAsDbForWorkspace/.test(body)).toBe(false);
  });
});
