/**
 * MR-3 tenth batch — services/mcp/* source-scan (PR-V1-71).
 *
 * Phase F tenth batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Covers two MCP service files, each with a single `getAsDb()` call
 * site that has workspaceId available — both migrate cleanly:
 *
 *   - `tool-knowledge-sync.ts::syncToolKnowledge(input)`
 *     → getAsDbForWorkspace(input.workspaceId)
 *     (SyncToolKnowledgeInput.workspaceId required.)
 *
 *   - `auto-sync-resolver.ts::defaultAutoSyncResolver(serverId)`
 *     → getAsDbForWorkspace(fallbackWorkspaceId)
 *     (fallbackWorkspaceId is env-derived via readWorkspaceFallback()
 *      and validated non-null before the DB call.)
 *
 * Both files DROP the bare `getAsDb` import — neither retains a
 * Category B getAsDb() call site so the import becomes pure
 * getAsDbForWorkspace.
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

describe("MR-3 tenth batch source-scan — services/mcp/tool-knowledge-sync.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/mcp/tool-knowledge-sync.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("no longer imports bare getAsDb (file is 100% migrated)", () => {
    const stripped = stripComments(src);
    expect(
      /import\s*\{[^}]*\bgetAsDb\b(?![A-Za-z])[^}]*\}\s*from/.test(stripped),
    ).toBe(false);
  });

  it("syncToolKnowledge calls getAsDbForWorkspace(input.workspaceId)", () => {
    const body = extractFunctionBody(src, "syncToolKnowledge");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });
});

describe("MR-3 tenth batch source-scan — services/mcp/auto-sync-resolver.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/mcp/auto-sync-resolver.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("no longer imports bare getAsDb (file is 100% migrated)", () => {
    const stripped = stripComments(src);
    expect(
      /import\s*\{[^}]*\bgetAsDb\b(?![A-Za-z])[^}]*\}\s*from/.test(stripped),
    ).toBe(false);
  });

  it("defaultAutoSyncResolver calls getAsDbForWorkspace(fallbackWorkspaceId)", () => {
    // defaultAutoSyncResolver is an `export const` arrow — body
    // extraction by `function` keyword is fragile here, so we
    // assert against the comment-stripped file body.
    const stripped = stripComments(src);
    expect(
      /getAsDbForWorkspace\s*\(\s*fallbackWorkspaceId\s*\)/.test(stripped),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(stripped)).toBe(false);
  });
});
