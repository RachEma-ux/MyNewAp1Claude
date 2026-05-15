/**
 * MR-3 fiftieth batch — repository.ts::appendSimulationStep +
 * updateSimulationRun Path-B consumers Cat B→A via new
 * `resolveSimulationRunRoutedConn` helper.
 * PR-V1-120.
 *
 * agsSimulationRuns.agentId is a direct FK — single SELECT, then
 * chain into resolveAgentRoutedConn. Seventh sister helper.
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

describe("MR-3 fiftieth batch — simulationRun mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveSimulationRunRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveSimulationRunRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveSimulationRunRoutedConn does runId→agentId lookup then chains into resolveAgentRoutedConn", () => {
    const body = extractFunctionBody(src, "resolveSimulationRunRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsSimulationRuns/.test(body)).toBe(true);
    expect(/resolveAgentRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("appendSimulationStep routes via resolveSimulationRunRoutedConn(lookupConn, input.runId)", () => {
    const body = extractFunctionBody(src, "appendSimulationStep");
    expect(
      /resolveSimulationRunRoutedConn\s*\(\s*lookupConn\s*,\s*input\.runId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsSimulationRunSteps\s*\)/.test(body),
    ).toBe(true);
  });

  it("updateSimulationRun routes via resolveSimulationRunRoutedConn(lookupConn, runId)", () => {
    const body = extractFunctionBody(src, "updateSimulationRun");
    expect(
      /resolveSimulationRunRoutedConn\s*\(\s*lookupConn\s*,\s*runId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsSimulationRuns\s*\)/.test(body),
    ).toBe(true);
  });
});
