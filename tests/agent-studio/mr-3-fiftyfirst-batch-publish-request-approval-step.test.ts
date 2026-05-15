/**
 * MR-3 fifty-first batch — repository.ts::updatePublishRequestState
 * + decideApprovalStep Path-B consumers Cat B→A via two new
 * helpers: resolvePublishRequestRoutedConn and
 * resolveApprovalStepRoutedConn.
 * PR-V1-121.
 *
 * agsPublishRequests.agentId is a direct FK; agsApprovalSteps
 * .publishRequestId is a direct FK. The two new helpers compose:
 *   - resolvePublishRequestRoutedConn: publishRequestId →
 *     agentId → resolveAgentRoutedConn.
 *   - resolveApprovalStepRoutedConn: stepId → publishRequestId →
 *     resolvePublishRequestRoutedConn (5-step total to workspaceId).
 *
 * Eighth + ninth sister helpers — completing the publish/approval
 * tier.
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
    `\\n\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${fnName}\\s*[<(]`,
  );
  const declMatch = src.match(decl);
  if (!declMatch || declMatch.index === undefined) return "";
  const start = declMatch.index;
  const declEnd = start + declMatch[0].length;
  const afterDecl = src.slice(declEnd);
  const nextMatch = afterDecl.match(
    /\n\s*(?:export\s+)?(?:async\s+)?function\s+\w+\s*[<(]/,
  );
  const end =
    nextMatch && nextMatch.index !== undefined
      ? declEnd + nextMatch.index
      : src.length;
  return stripComments(src.slice(start, end));
}

describe("MR-3 fifty-first batch — publishRequest + approvalStep Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolvePublishRequestRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolvePublishRequestRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolvePublishRequestRoutedConn does publishRequestId→agentId lookup", () => {
    const body = extractFunctionBody(src, "resolvePublishRequestRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsPublishRequests/.test(body)).toBe(true);
    expect(/resolveAgentRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("defines a shared resolveApprovalStepRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveApprovalStepRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveApprovalStepRoutedConn does stepId→publishRequestId lookup then chains", () => {
    const body = extractFunctionBody(src, "resolveApprovalStepRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsApprovalSteps/.test(body)).toBe(true);
    expect(/resolvePublishRequestRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("updatePublishRequestState routes via resolvePublishRequestRoutedConn(lookupConn, input.publishRequestId)", () => {
    const body = extractFunctionBody(src, "updatePublishRequestState");
    expect(
      /resolvePublishRequestRoutedConn\s*\(\s*lookupConn\s*,\s*input\.publishRequestId\s*,?\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsPublishRequests\s*\)/.test(body),
    ).toBe(true);
  });

  it("decideApprovalStep routes via resolveApprovalStepRoutedConn(lookupConn, input.stepId)", () => {
    const body = extractFunctionBody(src, "decideApprovalStep");
    expect(
      /resolveApprovalStepRoutedConn\s*\(\s*lookupConn\s*,\s*input\.stepId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsApprovalSteps\s*\)/.test(body),
    ).toBe(true);
  });
});
