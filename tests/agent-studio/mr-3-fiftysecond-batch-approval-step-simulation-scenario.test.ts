/**
 * MR-3 fifty-second batch — repository.ts::createApprovalStep +
 * saveSimulationScenario Path-B consumers Cat B→A.
 * PR-V1-122.
 *
 * createApprovalStep(input.publishRequestId) — routes via existing
 * resolvePublishRequestRoutedConn (#872).
 *
 * saveSimulationScenario dispatches on input.scenarioId:
 *   - UPDATE branch → new resolveSimulationScenarioRoutedConn
 *     (scenarioId→agentId via agsSimulationScenarios → chain into
 *     resolveAgentRoutedConn).
 *   - INSERT branch → resolveAgentRoutedConn(input.agentId).
 *
 * Tenth sister helper: resolveSimulationScenarioRoutedConn.
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

describe("MR-3 fifty-second batch — approvalStep INSERT + simulationScenario Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveSimulationScenarioRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveSimulationScenarioRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveSimulationScenarioRoutedConn does scenarioId→agentId lookup then chains into resolveAgentRoutedConn", () => {
    const body = extractFunctionBody(
      src,
      "resolveSimulationScenarioRoutedConn",
    );
    expect(body.length).toBeGreaterThan(0);
    expect(/agsSimulationScenarios/.test(body)).toBe(true);
    expect(/resolveAgentRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("createApprovalStep routes via resolvePublishRequestRoutedConn(lookupConn, input.publishRequestId)", () => {
    const body = extractFunctionBody(src, "createApprovalStep");
    expect(
      /resolvePublishRequestRoutedConn\s*\(\s*lookupConn\s*,\s*input\.publishRequestId\s*,?\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsApprovalSteps\s*\)/.test(body),
    ).toBe(true);
  });

  it("saveSimulationScenario UPDATE branch routes via resolveSimulationScenarioRoutedConn", () => {
    const body = extractFunctionBody(src, "saveSimulationScenario");
    expect(
      /resolveSimulationScenarioRoutedConn\s*\(\s*lookupConn\s*,\s*input\.scenarioId\s*,?\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsSimulationScenarios\s*\)/.test(body),
    ).toBe(true);
  });

  it("saveSimulationScenario INSERT branch routes via resolveAgentRoutedConn", () => {
    const body = extractFunctionBody(src, "saveSimulationScenario");
    expect(
      /resolveAgentRoutedConn\s*\(\s*lookupConn\s*,\s*input\.agentId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsSimulationScenarios\s*\)/.test(body),
    ).toBe(true);
  });
});
