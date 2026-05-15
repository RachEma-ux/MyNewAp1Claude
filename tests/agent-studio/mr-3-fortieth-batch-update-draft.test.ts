/**
 * MR-3 fortieth batch — repository.ts::updateDraft Path-B consumer
 * Cat B→A.
 * PR-V1-110.
 *
 * First Path B consumer outside services/approval/. The existing
 * `getCurrentDraft(agentId)` call already returns a draft row with
 * `id` — we reuse that draftId to feed Path B's resolver, then
 * route the UPDATE via getAsDbForWorkspace. No extra round-trip vs.
 * pre-migration (the draft lookup was already happening for the
 * sanitization + schema-version stamping logic).
 *
 * Falls back to the bootstrap handle when the draft has no binding
 * (legacy pre-Phase-11 drafts).
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

describe("MR-3 fortieth batch — repository.ts::updateDraft Path B consumer", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("updateDraft calls resolveWorkspaceIdForDraft on the discovered draft.id", () => {
    const body = extractFunctionBody(src, "updateDraft");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /resolveWorkspaceIdForDraft\s*\(\s*lookupConn\s*,\s*draft\.id\s*,?\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("updateDraft routes the UPDATE via getAsDbForWorkspace(workspaceId) with bootstrap fallback", () => {
    const body = extractFunctionBody(src, "updateDraft");
    expect(
      /workspaceId\s*!=\s*null\s*\?\s*\(\s*getAsDbForWorkspace\s*\(\s*workspaceId\s*\)\s*\?\?\s*lookupConn\s*\)\s*:\s*lookupConn/.test(
        body,
      ),
    ).toBe(true);
  });

  it("updateDraft draft-lookup precedes the UPDATE", () => {
    const body = extractFunctionBody(src, "updateDraft");
    const lookupIdx = body.search(/getCurrentDraft\s*\(\s*agentId\s*\)/);
    const updateIdx = body.search(/conn\s*\n?\s*\.update\s*\(\s*agsAgentDrafts\s*\)/);
    expect(lookupIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(lookupIdx).toBeLessThan(updateIdx);
  });

  it("updateDraft dynamic-imports the Path B primitive AND getAsDbForWorkspace (no static imports of either)", () => {
    const body = extractFunctionBody(src, "updateDraft");
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
