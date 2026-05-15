/**
 * MR-3 fifty-seventh batch — repository.ts agsDraftSubagents
 * mutations Path-B consumers Cat B→A via new
 * `resolveSubagentRoutedConn` helper.
 * PR-V1-127.
 *
 * 3 mutations migrated:
 *   - saveSubagent (UPDATE: subagentId, INSERT: draftId)
 *   - removeSubagent (subagentId)
 *   - replaceSubagents (draftId)
 *
 * Fifteenth sister helper: resolveSubagentRoutedConn.
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

describe("MR-3 fifty-seventh batch — Subagent mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveSubagentRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveSubagentRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveSubagentRoutedConn does subagentId→draftId lookup on agsDraftSubagents then chains into resolveDraftRoutedConn", () => {
    const body = extractFunctionBody(src, "resolveSubagentRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsDraftSubagents/.test(body)).toBe(true);
    expect(/resolveDraftRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("saveSubagent UPDATE branch routes via resolveSubagentRoutedConn", () => {
    const body = extractFunctionBody(src, "saveSubagent");
    expect(
      /resolveSubagentRoutedConn\s*\(\s*lookupConn\s*,\s*input\.subagentId\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("saveSubagent INSERT branch routes via resolveDraftRoutedConn(input.draftId)", () => {
    const body = extractFunctionBody(src, "saveSubagent");
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*input\.draftId\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });

  it("removeSubagent routes via resolveSubagentRoutedConn(subagentId)", () => {
    const body = extractFunctionBody(src, "removeSubagent");
    expect(
      /resolveSubagentRoutedConn\s*\(\s*lookupConn\s*,\s*subagentId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\.delete\s*\(\s*agsDraftSubagents\s*\)/.test(body),
    ).toBe(true);
  });

  it("replaceSubagents routes via resolveDraftRoutedConn(draftId)", () => {
    const body = extractFunctionBody(src, "replaceSubagents");
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*draftId\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\s*\.delete\s*\(\s*agsDraftSubagents\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.insert\s*\(\s*agsDraftSubagents\s*\)/.test(body),
    ).toBe(true);
  });
});
