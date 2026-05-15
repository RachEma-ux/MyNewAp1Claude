/**
 * MR-3 thirty-seventh batch — services/approval/approval-gate.ts::evaluateApprovalGate
 * Path-B consumer Cat B→A.
 * PR-V1-107.
 *
 * First consumer of the Path B primitive shipped in #857. The
 * lastUsedAt-bump UPDATE in `evaluateApprovalGate` is the routing-
 * worthy site — every permit re-use writes a row. The SELECT
 * (looking up the approval row by draftId + hash) stays on the
 * bootstrap handle (Cat C bootstrap for the resolver itself; same
 * pattern as the split-handle batches).
 *
 * When the draft has no binding (legacy pre-Phase-11 or binding-
 * pending state), `resolveWorkspaceIdForDraft` returns null and
 * the UPDATE falls back to the bootstrap handle — preserves
 * pre-migration semantics for unbound drafts.
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

describe("MR-3 thirty-seventh batch — evaluateApprovalGate Path B consumer", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/approval/approval-gate.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb", () => {
    expect(
      /import\s*\{\s*getAsDb,\s*getAsDbForWorkspace\s*\}\s*from\s+["']\.\.\/\.\.\/db\/connection["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("evaluateApprovalGate uses resolveWorkspaceIdForDraft from the Path B primitive", () => {
    const body = extractFunctionBody(src, "evaluateApprovalGate");
    expect(body.length).toBeGreaterThan(0);
    // Use [\s\S]* to allow multi-line arg lists (the formatter wraps
    // the args across newlines). Tolerate a trailing comma.
    expect(
      /resolveWorkspaceIdForDraft\s*\(\s*db\s*,\s*input\.agentDraftId\s*,?\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("evaluateApprovalGate routes the lastUsedAt UPDATE via getAsDbForWorkspace(workspaceId), fallback to db", () => {
    const body = extractFunctionBody(src, "evaluateApprovalGate");
    expect(
      /workspaceId\s*!=\s*null\s*\?\s*getAsDbForWorkspace\s*\(\s*workspaceId\s*\)\s*:\s*db/.test(
        body,
      ),
    ).toBe(true);
  });

  it("Path B import is dynamic (no static import at file top)", () => {
    // The resolver is dynamically imported inside the function so the
    // approval-gate file stays small at module-load and there's no
    // import cycle with services/region.
    const body = extractFunctionBody(src, "evaluateApprovalGate");
    expect(
      /await\s+import\s*\(\s*["']\.\.\/region\/draft-workspace-resolver["']\s*\)/.test(
        body,
      ),
    ).toBe(true);
    // The static import block should NOT mention draft-workspace-resolver
    // — the file should keep its existing import block intact.
    const importBlock = src.slice(0, src.indexOf("export async function"));
    expect(
      /import\s*\{[^}]*\}\s*from\s+["'][^"']*draft-workspace-resolver["']/.test(
        importBlock,
      ),
    ).toBe(false);
  });
});
