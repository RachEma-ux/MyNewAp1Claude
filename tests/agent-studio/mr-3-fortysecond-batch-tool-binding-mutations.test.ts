/**
 * MR-3 forty-second batch — repository.ts tool-binding mutations
 * (updateToolBinding + removeToolBinding) Path-B consumers Cat B→A.
 * PR-V1-112.
 *
 * Both mutations take `bindingId` only. Introduces a shared
 * `resolveBindingRoutedConn` helper that:
 *   1. SELECTs draftId from agsDraftToolBindings where id = bindingId
 *   2. Calls Path B's resolveWorkspaceIdForDraft(draftId)
 *   3. Routes through getAsDbForWorkspace(workspaceId)
 *   4. Falls back to lookupConn on any null in the chain
 *
 * Same shape can be reused for getToolBindingById's read path if we
 * later decide to route reads.
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
  // Note: these are top-level (not async fn) for the inner helpers,
  // but we slice the body by the function header for the exported
  // functions plus the two internal helpers.
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

describe("MR-3 forty-second batch — tool-binding mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveBindingRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveBindingRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveBindingRoutedConn looks up draftId from agsDraftToolBindings then calls Path B", () => {
    const body = extractFunctionBody(src, "resolveBindingRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/resolveToolBindingDraftId\s*\(/.test(body)).toBe(true);
    expect(/resolveWorkspaceIdForDraft\s*\(/.test(body)).toBe(true);
    expect(/getAsDbForWorkspace\s*\(/.test(body)).toBe(true);
  });

  it.each(["updateToolBinding", "removeToolBinding"])(
    "%s routes via resolveBindingRoutedConn",
    (fnName) => {
      const body = extractFunctionBody(src, fnName);
      expect(body.length).toBeGreaterThan(0);
      expect(
        /resolveBindingRoutedConn\s*\(\s*lookupConn\s*,\s*bindingId\s*\)/.test(
          body,
        ),
      ).toBe(true);
    },
  );

  it("updateToolBinding UPDATE uses the routed conn", () => {
    const body = extractFunctionBody(src, "updateToolBinding");
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsDraftToolBindings\s*\)/.test(body),
    ).toBe(true);
  });

  it("removeToolBinding DELETE uses the routed conn", () => {
    const body = extractFunctionBody(src, "removeToolBinding");
    expect(
      /conn\.delete\s*\(\s*agsDraftToolBindings\s*\)/.test(body),
    ).toBe(true);
  });
});
