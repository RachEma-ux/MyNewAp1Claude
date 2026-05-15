/**
 * MR-3 thirty-ninth batch — services/approval/approval-gate.ts::decideApprovalRequest
 * Path-B consumer Cat B→A.
 * PR-V1-109.
 *
 * Third Path B consumer. decideApprovalRequest is the trickiest of
 * the three because its input is `approvalRequestId` (not draftId
 * directly). Solution: a short pre-UPDATE SELECT pulls
 * `agentDraftId` from the approval row, then Path B's resolver
 * derives workspaceId from that draftId.
 *
 * If the approval row doesn't exist (draftId is null), or the
 * draft has no binding (resolver returns null), the UPDATE falls
 * back to the bootstrap handle — preserves pre-migration
 * semantics. The post-UPDATE event INSERTs stay on bootstrap (Cat
 * C cross-workspace observability).
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

describe("MR-3 thirty-ninth batch — decideApprovalRequest Path B consumer", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/approval/approval-gate.ts",
  );
  const src = readFileSync(file, "utf8");

  it("decideApprovalRequest pre-UPDATE SELECTs agentDraftId from the approval row", () => {
    const body = extractFunctionBody(src, "decideApprovalRequest");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /\.select\s*\(\s*\{\s*agentDraftId:\s*agsPendingPermissionRequests\.agentDraftId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("decideApprovalRequest calls resolveWorkspaceIdForDraft on the discovered draftId", () => {
    const body = extractFunctionBody(src, "decideApprovalRequest");
    expect(
      /resolveWorkspaceIdForDraft\s*\(\s*db\s*,\s*draftId\s*,?\s*\)/.test(body),
    ).toBe(true);
  });

  it("decideApprovalRequest UPDATE routes via updateDb (the routed handle)", () => {
    const body = extractFunctionBody(src, "decideApprovalRequest");
    expect(
      /updateDb\s*\n?\s*\.update\s*\(\s*agsPendingPermissionRequests\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("decideApprovalRequest discovery SELECT precedes the UPDATE", () => {
    const body = extractFunctionBody(src, "decideApprovalRequest");
    const selectIdx = body.search(
      /\.select\s*\(\s*\{\s*agentDraftId:/,
    );
    const updateIdx = body.search(/updateDb\s*\n?\s*\.update\s*\(\s*agsPendingPermissionRequests\s*\)/);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(updateIdx);
  });
});
