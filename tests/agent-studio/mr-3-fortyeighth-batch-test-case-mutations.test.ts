/**
 * MR-3 forty-eighth batch — repository.ts::saveTestCase +
 * removeTestCase Path-B consumers Cat B→A via new
 * `resolveCaseRoutedConn` helper.
 * PR-V1-118.
 *
 * `saveTestCase` dispatches on input.caseId:
 *   - UPDATE branch → resolveCaseRoutedConn (caseId→suiteId→
 *     agentId→draft→workspaceId, 4-step chain).
 *   - INSERT branch → resolveSuiteRoutedConn(input.suiteId) (existing
 *     helper from #868).
 *
 * `removeTestCase(caseId)` → resolveCaseRoutedConn.
 *
 * The new caseId resolver is the **fifth sister helper** (after
 * agentId/draftId/bindingId/suiteId). It demonstrates the resolver
 * family naturally chains — each new identifier shape composes a
 * single SELECT on top of the next-deeper resolver.
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

describe("MR-3 forty-eighth batch — saveTestCase + removeTestCase Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveCaseRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveCaseRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveCaseRoutedConn does caseId→suiteId lookup then chains into resolveSuiteRoutedConn", () => {
    const body = extractFunctionBody(src, "resolveCaseRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsTestCases/.test(body)).toBe(true);
    expect(/resolveSuiteRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("saveTestCase UPDATE branch routes via resolveCaseRoutedConn", () => {
    const body = extractFunctionBody(src, "saveTestCase");
    expect(
      /resolveCaseRoutedConn\s*\(\s*lookupConn\s*,\s*input\.caseId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsTestCases\s*\)/.test(body),
    ).toBe(true);
  });

  it("saveTestCase INSERT branch routes via resolveSuiteRoutedConn", () => {
    const body = extractFunctionBody(src, "saveTestCase");
    expect(
      /resolveSuiteRoutedConn\s*\(\s*lookupConn\s*,\s*input\.suiteId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsTestCases\s*\)/.test(body),
    ).toBe(true);
  });

  it("removeTestCase routes via resolveCaseRoutedConn", () => {
    const body = extractFunctionBody(src, "removeTestCase");
    expect(
      /resolveCaseRoutedConn\s*\(\s*lookupConn\s*,\s*caseId\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.delete\s*\(\s*agsTestCases\s*\)/.test(body),
    ).toBe(true);
  });
});
