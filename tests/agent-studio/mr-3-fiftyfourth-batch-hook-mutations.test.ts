/**
 * MR-3 fifty-fourth batch — repository.ts agsDraftHooks mutations
 * Path-B consumers Cat B→A via new `resolveHookRoutedConn` helper.
 * PR-V1-124.
 *
 * Starts the Phase-0b draft-scoped child-table migration arc.
 *
 *   - saveHook(input) dispatches on input.hookId:
 *       UPDATE branch → resolveHookRoutedConn(hookId)
 *       INSERT branch → resolveDraftRoutedConn(input.draftId)
 *   - removeHook(hookId) → resolveHookRoutedConn
 *   - replaceHooks(draftId, hooks) → resolveDraftRoutedConn
 *
 * Twelfth sister helper: resolveHookRoutedConn.
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

describe("MR-3 fifty-fourth batch — Hook mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveHookRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveHookRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveHookRoutedConn does hookId→draftId lookup on agsDraftHooks then chains into resolveDraftRoutedConn", () => {
    const body = extractFunctionBody(src, "resolveHookRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/agsDraftHooks/.test(body)).toBe(true);
    expect(/resolveDraftRoutedConn\s*\(/.test(body)).toBe(true);
  });

  it("saveHook UPDATE branch routes via resolveHookRoutedConn", () => {
    const body = extractFunctionBody(src, "saveHook");
    expect(
      /resolveHookRoutedConn\s*\(\s*lookupConn\s*,\s*input\.hookId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsDraftHooks\s*\)/.test(body),
    ).toBe(true);
  });

  it("saveHook INSERT branch routes via resolveDraftRoutedConn(input.draftId)", () => {
    const body = extractFunctionBody(src, "saveHook");
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*input\.draftId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsDraftHooks\s*\)/.test(body),
    ).toBe(true);
  });

  it("removeHook routes via resolveHookRoutedConn(lookupConn, hookId)", () => {
    const body = extractFunctionBody(src, "removeHook");
    expect(
      /resolveHookRoutedConn\s*\(\s*lookupConn\s*,\s*hookId\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.delete\s*\(\s*agsDraftHooks\s*\)/.test(body),
    ).toBe(true);
  });

  it("replaceHooks routes via resolveDraftRoutedConn(draftId)", () => {
    const body = extractFunctionBody(src, "replaceHooks");
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*draftId\s*\)/.test(body),
    ).toBe(true);
    // both DELETE-all and bulk-INSERT use the routed conn
    expect(
      /conn\s*\.delete\s*\(\s*agsDraftHooks\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.insert\s*\(\s*agsDraftHooks\s*\)/.test(body),
    ).toBe(true);
  });
});
