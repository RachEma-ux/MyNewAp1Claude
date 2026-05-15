/**
 * MR-3 thirty-eighth batch — services/approval/approval-gate.ts::createApprovalRequest
 * Path-B consumer Cat B→A.
 * PR-V1-108.
 *
 * Second Path B consumer (after #858 evaluateApprovalGate). The
 * pending-row INSERT routes via the resolved workspaceId; the
 * dedup-SELECT and the agsRuntimePolicyEvents write stay on the
 * bootstrap handle (the event-row table is intentionally Cat C —
 * cross-workspace observability — and the dedup SELECT only reads
 * row existence).
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

describe("MR-3 thirty-eighth batch — createApprovalRequest Path B consumer", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/approval/approval-gate.ts",
  );
  const src = readFileSync(file, "utf8");

  it("createApprovalRequest uses resolveWorkspaceIdForDraft for the pending-row INSERT", () => {
    const body = extractFunctionBody(src, "createApprovalRequest");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /resolveWorkspaceIdForDraft\s*\(\s*db\s*,\s*input\.agentDraftId\s*,?\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("createApprovalRequest routes the agsPendingPermissionRequests INSERT via insertDb (= routed handle)", () => {
    const body = extractFunctionBody(src, "createApprovalRequest");
    expect(
      /insertDb\s*\n?\s*\.insert\s*\(\s*agsPendingPermissionRequests\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /workspaceId\s*!=\s*null\s*\?\s*getAsDbForWorkspace\s*\(\s*workspaceId\s*\)\s*:\s*db/.test(
        body,
      ),
    ).toBe(true);
  });

  it("createApprovalRequest dedup-SELECT precedes the resolver call (idempotent fast-path)", () => {
    const body = extractFunctionBody(src, "createApprovalRequest");
    const selectIdx = body.search(
      /\.select\s*\(\s*\)\s*\n?\s*\.from\s*\(\s*agsPendingPermissionRequests\s*\)/,
    );
    const resolverIdx = body.search(/resolveWorkspaceIdForDraft\s*\(/);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(resolverIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(resolverIdx);
  });

  it("createApprovalRequest agsRuntimePolicyEvents INSERT stays on bootstrap db (Cat C cross-workspace observability)", () => {
    const body = extractFunctionBody(src, "createApprovalRequest");
    // The event INSERT pattern: `await db.insert(agsRuntimePolicyEvents)` or `db\n.insert(agsRuntimePolicyEvents)`
    expect(
      /db\s*\n?\s*\.insert\s*\(\s*agsRuntimePolicyEvents\s*\)/.test(body),
    ).toBe(true);
    // Should NOT see `insertDb.insert(agsRuntimePolicyEvents)`.
    expect(
      /insertDb\s*\n?\s*\.insert\s*\(\s*agsRuntimePolicyEvents\s*\)/.test(body),
    ).toBe(false);
  });
});
