/**
 * MR-3 forty-seventh batch — repository.ts::saveTestSuite +
 * createTestRun Path-B consumers Cat B→A.
 * PR-V1-117.
 *
 * `createTestRun` takes input.agentId → reuses resolveAgentRoutedConn.
 *
 * `saveTestSuite` dispatches on input.suiteId — UPDATE branch routes
 * via a new `resolveSuiteRoutedConn(lookupConn, suiteId)` helper
 * (3-step: suiteId→agentId→draft→workspaceId), INSERT branch routes
 * via resolveAgentRoutedConn(input.agentId).
 *
 * Each branch routes once at top, then performs its single write.
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

describe("MR-3 forty-seventh batch — saveTestSuite + createTestRun Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveSuiteRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveSuiteRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveSuiteRoutedConn does suiteId→agentId lookup then chains into resolveAgentRoutedConn", () => {
    const body = extractFunctionBody(src, "resolveSuiteRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsTestSuites/.test(body)).toBe(true);
    expect(/resolveAgentRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("createTestRun routes via resolveAgentRoutedConn(lookupConn, input.agentId)", () => {
    const body = extractFunctionBody(src, "createTestRun");
    expect(
      /resolveAgentRoutedConn\s*\(\s*lookupConn\s*,\s*input\.agentId\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("createTestRun INSERT (agsTestRuns) uses the routed conn", () => {
    const body = extractFunctionBody(src, "createTestRun");
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsTestRuns\s*\)/.test(body),
    ).toBe(true);
  });

  it("saveTestSuite UPDATE branch routes via resolveSuiteRoutedConn", () => {
    const body = extractFunctionBody(src, "saveTestSuite");
    expect(
      /resolveSuiteRoutedConn\s*\(\s*lookupConn\s*,\s*input\.suiteId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsTestSuites\s*\)/.test(body),
    ).toBe(true);
  });

  it("saveTestSuite INSERT branch routes via resolveAgentRoutedConn", () => {
    const body = extractFunctionBody(src, "saveTestSuite");
    expect(
      /resolveAgentRoutedConn\s*\(\s*lookupConn\s*,\s*input\.agentId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsTestSuites\s*\)/.test(body),
    ).toBe(true);
  });
});
