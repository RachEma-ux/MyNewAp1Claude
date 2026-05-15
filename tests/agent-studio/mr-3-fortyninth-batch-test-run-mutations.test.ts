/**
 * MR-3 forty-ninth batch — repository.ts::updateTestRun +
 * recordTestResult Path-B consumers Cat B→A via new
 * `resolveTestRunRoutedConn` helper.
 * PR-V1-119.
 *
 * agsTestRuns.agentId is a direct FK — single SELECT, then chain
 * into resolveAgentRoutedConn. Sixth sister helper in the resolver
 * family.
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

describe("MR-3 forty-ninth batch — testRun mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveTestRunRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveTestRunRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveTestRunRoutedConn does runId→agentId lookup then chains into resolveAgentRoutedConn", () => {
    const body = extractFunctionBody(src, "resolveTestRunRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsTestRuns/.test(body)).toBe(true);
    expect(/resolveAgentRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("updateTestRun routes via resolveTestRunRoutedConn(lookupConn, runId)", () => {
    const body = extractFunctionBody(src, "updateTestRun");
    expect(
      /resolveTestRunRoutedConn\s*\(\s*lookupConn\s*,\s*runId\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.update\s*\(\s*agsTestRuns\s*\)/.test(body),
    ).toBe(true);
  });

  it("recordTestResult routes via resolveTestRunRoutedConn(lookupConn, input.runId)", () => {
    const body = extractFunctionBody(src, "recordTestResult");
    expect(
      /resolveTestRunRoutedConn\s*\(\s*lookupConn\s*,\s*input\.runId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsTestRunResults\s*\)/.test(body),
    ).toBe(true);
  });
});
