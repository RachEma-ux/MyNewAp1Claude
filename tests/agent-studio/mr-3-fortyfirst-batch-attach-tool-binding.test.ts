/**
 * MR-3 forty-first batch — repository.ts::attachToolBinding Path-B
 * consumer Cat B→A.
 * PR-V1-111.
 *
 * Same Path B consumer shape as #861 updateDraft. attachToolBinding
 * already takes `input.draftId` directly, so the resolver call
 * doesn't need a pre-lookup. INSERT routes via getAsDbForWorkspace.
 * Falls back to bootstrap when the draft has no binding.
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

describe("MR-3 forty-first batch — repository.ts::attachToolBinding Path B consumer", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("attachToolBinding calls resolveWorkspaceIdForDraft on input.draftId", () => {
    const body = extractFunctionBody(src, "attachToolBinding");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /resolveWorkspaceIdForDraft\s*\(\s*lookupConn\s*,\s*input\.draftId\s*,?\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("attachToolBinding routes the INSERT via getAsDbForWorkspace(workspaceId) with bootstrap fallback", () => {
    const body = extractFunctionBody(src, "attachToolBinding");
    expect(
      /workspaceId\s*!=\s*null\s*\?\s*\(\s*getAsDbForWorkspace\s*\(\s*workspaceId\s*\)\s*\?\?\s*lookupConn\s*\)\s*:\s*lookupConn/.test(
        body,
      ),
    ).toBe(true);
    // The INSERT is on the routed `conn` variable, not bare `db()`.
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsDraftToolBindings\s*\)/.test(body),
    ).toBe(true);
  });

  it("attachToolBinding dynamic-imports both the Path B primitive AND getAsDbForWorkspace", () => {
    const body = extractFunctionBody(src, "attachToolBinding");
    expect(
      /await\s+import\s*\(\s*["']\.\/services\/region\/draft-workspace-resolver["']\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /await\s+import\s*\(\s*["']\.\/db\/connection["']\s*\)/.test(body),
    ).toBe(true);
  });
});
