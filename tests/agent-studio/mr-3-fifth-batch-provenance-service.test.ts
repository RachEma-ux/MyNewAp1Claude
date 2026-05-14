/**
 * MR-3 fifth batch — ingestion/provenance-service.ts source-scan
 * (PR-V1-49).
 *
 * Phase F fifth batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Covers:
 *   - `recordProvenance` calls `getAsDbForWorkspace(input.workspaceId)`,
 *     NOT `getAsDb()`. RecordProvenanceInput.workspaceId is required.
 *   - The file imports `getAsDbForWorkspace` from db/connection.
 *   - `getProvenance` still calls `getAsDb()` — it takes only
 *     `provenanceId` (Category B; needs workspaceId plumbed through
 *     callers).
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

describe("MR-3 fifth batch source-scan — ingestion/provenance-service.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/ingestion/provenance-service.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("recordProvenance calls getAsDbForWorkspace(input.workspaceId)", () => {
    const body = extractFunctionBody(src, "recordProvenance");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  it("getProvenance is Category B (provenanceId-scoped, no workspaceId plumbing) — still calls getAsDb()", () => {
    const body = extractFunctionBody(src, "getProvenance");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(/getAsDbForWorkspace/.test(body)).toBe(false);
  });
});
