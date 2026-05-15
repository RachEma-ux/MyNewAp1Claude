/**
 * MR-3 forty-fifth batch — repository.ts::createVersion +
 * createPublishRequest Path-B consumers Cat B→A.
 * PR-V1-115.
 *
 * Both functions take `input.agentId` and INSERT into different
 * tables (`agsAgentVersions` and `agsPublishRequests`). Both route
 * via the existing `resolveAgentRoutedConn` helper introduced in
 * #865.
 *
 * createVersion's intra-function SELECT (max versionNumber) and the
 * INSERT share a single routed conn — preserves atomicity (no
 * cross-region writes within one fn).
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

describe("MR-3 forty-fifth batch — createVersion + createPublishRequest Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it.each(["createVersion", "createPublishRequest"])(
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

  it("createVersion's SELECT (max versionNumber) uses the routed conn", () => {
    const body = extractFunctionBody(src, "createVersion");
    expect(
      /conn\s*\n?\s*\.select\s*\(\s*\{\s*max:/.test(body),
    ).toBe(true);
  });

  it("createVersion's INSERT uses the routed conn", () => {
    const body = extractFunctionBody(src, "createVersion");
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsAgentVersions\s*\)/.test(body),
    ).toBe(true);
  });

  it("createVersion resolves the routed conn exactly once", () => {
    const body = extractFunctionBody(src, "createVersion");
    const matches = body.match(/resolveAgentRoutedConn\s*\(/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("createPublishRequest's INSERT uses the routed conn", () => {
    const body = extractFunctionBody(src, "createPublishRequest");
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsPublishRequests\s*\)/.test(body),
    ).toBe(true);
  });
});
