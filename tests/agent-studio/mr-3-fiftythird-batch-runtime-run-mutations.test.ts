/**
 * MR-3 fifty-third batch — repository.ts agsRuntime* family
 * Path-B consumers Cat B→A via new `resolveRuntimeRunRoutedConn`
 * helper.
 * PR-V1-123.
 *
 * 7 mutations in one batch (they share the runId-on-direct-FK
 * shape, except appendRuntimeRun which is the entry-point INSERT
 * with input.agentId):
 *   1. appendRuntimeRun(input.agentId)       — resolveAgentRoutedConn
 *   2. updateRuntimeRun(runId, patch)        — resolveRuntimeRunRoutedConn
 *   3. appendRuntimeRunStep(input.runId)     — resolveRuntimeRunRoutedConn
 *   4. appendRuntimeToolCall(input.runId)    — resolveRuntimeRunRoutedConn
 *   5. appendRuntimeMemoryEvent(input.runId) — resolveRuntimeRunRoutedConn
 *   6. appendRuntimePolicyEvent(input.runId) — resolveRuntimeRunRoutedConn
 *   7. appendRuntimeHookExecution(input.runId) — resolveRuntimeRunRoutedConn
 *
 * Eleventh sister helper. With this batch every repository.ts
 * mutation is Path-B-migrated.
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

describe("MR-3 fifty-third batch — agsRuntime* mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveRuntimeRunRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveRuntimeRunRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveRuntimeRunRoutedConn does runId→agentId lookup on agsRuntimeRuns then chains", () => {
    const body = extractFunctionBody(src, "resolveRuntimeRunRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsRuntimeRuns/.test(body)).toBe(true);
    expect(/resolveAgentRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("appendRuntimeRun routes via resolveAgentRoutedConn(lookupConn, input.agentId)", () => {
    const body = extractFunctionBody(src, "appendRuntimeRun");
    expect(
      /resolveAgentRoutedConn\s*\(\s*lookupConn\s*,\s*input\.agentId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsRuntimeRuns\s*\)/.test(body),
    ).toBe(true);
  });

  it("updateRuntimeRun routes via resolveRuntimeRunRoutedConn(lookupConn, runId)", () => {
    const body = extractFunctionBody(src, "updateRuntimeRun");
    expect(
      /resolveRuntimeRunRoutedConn\s*\(\s*lookupConn\s*,\s*runId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsRuntimeRuns\s*\)/.test(body),
    ).toBe(true);
  });

  const runIdTargets: Array<[string, string]> = [
    ["appendRuntimeRunStep", "agsRuntimeRunSteps"],
    ["appendRuntimeToolCall", "agsRuntimeToolCalls"],
    ["appendRuntimeMemoryEvent", "agsRuntimeMemoryEvents"],
    ["appendRuntimePolicyEvent", "agsRuntimePolicyEvents"],
    ["appendRuntimeHookExecution", "agsRuntimeHookExecutions"],
  ];

  it.each(runIdTargets)(
    "%s routes via resolveRuntimeRunRoutedConn and INSERTs into %s on the routed conn",
    (fnName, tableName) => {
      const body = extractFunctionBody(src, fnName);
      expect(body.length).toBeGreaterThan(0);
      expect(
        /resolveRuntimeRunRoutedConn\s*\(\s*lookupConn\s*,\s*input\.runId\s*\)/.test(
          body,
        ),
      ).toBe(true);
      expect(
        new RegExp(`conn\\s*\\n?\\s*\\.insert\\s*\\(\\s*${tableName}\\s*\\)`).test(
          body,
        ),
      ).toBe(true);
    },
  );
});
