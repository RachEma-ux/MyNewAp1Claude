/**
 * MR-3 fourth batch — ingestion/knowledge-unit-service.ts source-scan
 * (PR-V1-48).
 *
 * Phase F fourth batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Covers:
 *   - `insertUnit` calls `getAsDbForWorkspace(input.workspaceId)`,
 *     NOT `getAsDb()`. InsertUnitInput.workspaceId is required (via
 *     NormalizedKnowledgeUnitInput).
 *   - The file imports `getAsDbForWorkspace` from db/connection.
 *   - `archiveUnit` still calls `getAsDb()` — it takes only `unitId`
 *     (Category B; needs workspaceId plumbed through callers).
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

describe("MR-3 fourth batch source-scan — ingestion/knowledge-unit-service.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/ingestion/knowledge-unit-service.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("insertUnit calls getAsDbForWorkspace(input.workspaceId)", () => {
    const body = extractFunctionBody(src, "insertUnit");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  // NOTE: `archiveUnit` was Cat B at the time of #807 (unitId-scoped)
  // and was promoted to Cat A in PR-V1-92 / #843 (twenty-fourth
  // batch) via the split-handle pattern (SELECT via getAsDb() for
  // workspaceId discovery, then UPDATE via
  // getAsDbForWorkspace(lookup[0].workspaceId)). See
  // tests/agent-studio/mr-3-twentyfourth-batch-knowledge-unit-
  // archive.test.ts for the up-to-date two-handle assertions. We
  // weaken the prior assertion to just "archiveUnit still references
  // getAsDb()" (true — for the discovery SELECT).
  it("archiveUnit still references getAsDb() (post-#843 split-handle)", () => {
    const body = extractFunctionBody(src, "archiveUnit");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
  });
});
