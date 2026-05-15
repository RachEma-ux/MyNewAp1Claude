/**
 * MR-3 sixtieth batch — repository.ts::recordMcpTransition Path-B
 * consumer Cat B→A.
 * PR-V1-130.
 *
 * Reuses the existing resolveMcpServerRoutedConn (#876) — the
 * agsMcpTransitions table has a serverId FK to agsDraftMcpServers,
 * so the same resolver applies.
 *
 * Both the INSERT and the trim DELETE (raw SQL `conn.execute`)
 * share a single routed conn — preserves atomicity.
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

describe("MR-3 sixtieth batch — recordMcpTransition Path B consumer", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("recordMcpTransition routes via resolveMcpServerRoutedConn(lookupConn, serverId)", () => {
    const body = extractFunctionBody(src, "recordMcpTransition");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /resolveMcpServerRoutedConn\s*\(\s*lookupConn\s*,\s*serverId\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("recordMcpTransition INSERT uses the routed conn", () => {
    const body = extractFunctionBody(src, "recordMcpTransition");
    expect(
      /conn\.insert\s*\(\s*agsMcpTransitions\s*\)/.test(body),
    ).toBe(true);
  });

  it("recordMcpTransition trim DELETE uses the routed conn via conn.execute", () => {
    const body = extractFunctionBody(src, "recordMcpTransition");
    expect(
      /conn\.execute\s*\(/.test(body),
    ).toBe(true);
  });

  it("recordMcpTransition resolves the routed conn exactly once (atomicity)", () => {
    const body = extractFunctionBody(src, "recordMcpTransition");
    const matches = body.match(/resolveMcpServerRoutedConn\s*\(/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
