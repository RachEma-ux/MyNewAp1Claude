/**
 * MR-3 twenty-seventh batch — workspace-default-bindings.ts.
 * PR-V1-95.
 *
 * All four functions take `workspaceId` directly on the input (the
 * file's entire purpose is workspace-scoped bindings — no Cat B
 * ambiguity). Phase-1 shim delegates to `getAsDb()`; Phase-2 will
 * route by region without caller changes. After this batch the file
 * is 100% Cat A (no bare `getAsDb()` call sites; the import is
 * dropped).
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

describe("MR-3 twenty-seventh batch — workspace-default-bindings.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/workspace-default-bindings.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace from db/connection (no bare getAsDb)", () => {
    expect(
      /import\s*\{\s*getAsDbForWorkspace\s*\}\s*from\s+["']\.\/db\/connection["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("no bare getAsDb identifier appears as a function-call after the import line", () => {
    const stripped = stripComments(src);
    // Tolerate the literal in the import line via regex; everywhere
    // else, only `getAsDbForWorkspace(...)` should appear.
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(stripped)).toBe(false);
  });

  it.each([
    ["resolveWorkspaceDefaultBinding", "input.workspaceId"],
    ["upsertWorkspaceDefaultBinding", "input.workspaceId"],
    ["deleteWorkspaceDefaultBinding", "input.workspaceId"],
    ["listWorkspaceDefaultBindings", "workspaceId"],
  ])("%s calls getAsDbForWorkspace(%s)", (fnName, arg) => {
    const body = extractFunctionBody(src, fnName);
    expect(body.length).toBeGreaterThan(0);
    const escaped = arg.replace(/\./g, "\\.");
    expect(
      new RegExp(
        `getAsDbForWorkspace\\s*\\(\\s*${escaped}\\s*\\)`,
      ).test(body),
    ).toBe(true);
  });
});
