/**
 * MR-3 forty-sixth batch — repository.ts::publishRelease +
 * createSimulationRun Path-B consumers Cat B→A.
 * PR-V1-116.
 *
 * Both functions take `input.agentId`, so they reuse the existing
 * `resolveAgentRoutedConn` helper (#865).
 *
 * publishRelease is the second agentId-scoped consumer (alongside
 * #866's createVersion) where multiple writes share a single routed
 * conn — INSERT into agsAgentReleases + UPDATE on agsAgents. Without
 * the shared conn, Phase-2 multi-region could split the writes
 * across regions and lose atomicity.
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

describe("MR-3 forty-sixth batch — publishRelease + createSimulationRun Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it.each(["publishRelease", "createSimulationRun"])(
    "%s routes via resolveAgentRoutedConn(lookupConn, input.agentId)",
    (fnName) => {
      const body = extractFunctionBody(src, fnName);
      expect(body.length).toBeGreaterThan(0);
      expect(
        /resolveAgentRoutedConn\s*\(\s*lookupConn\s*,\s*input\.agentId\s*\)/.test(
          body,
        ),
      ).toBe(true);
    },
  );

  it("publishRelease INSERT (agsAgentReleases) uses the routed conn", () => {
    const body = extractFunctionBody(src, "publishRelease");
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsAgentReleases\s*\)/.test(body),
    ).toBe(true);
  });

  it("publishRelease UPDATE (agsAgents) uses the routed conn", () => {
    const body = extractFunctionBody(src, "publishRelease");
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsAgents\s*\)/.test(body),
    ).toBe(true);
  });

  it("publishRelease resolves the routed conn exactly once (atomicity)", () => {
    const body = extractFunctionBody(src, "publishRelease");
    const matches = body.match(/resolveAgentRoutedConn\s*\(/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("createSimulationRun INSERT (agsSimulationRuns) uses the routed conn", () => {
    const body = extractFunctionBody(src, "createSimulationRun");
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsSimulationRuns\s*\)/.test(body),
    ).toBe(true);
  });
});
