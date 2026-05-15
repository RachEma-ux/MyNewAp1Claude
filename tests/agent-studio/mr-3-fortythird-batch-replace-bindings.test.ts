/**
 * MR-3 forty-third batch — repository.ts draftId-scoped replace*
 * mutations Path-B consumers Cat B→A.
 * PR-V1-113.
 *
 * Promotes replaceToolBindings, replaceKnowledgeBindings,
 * replaceMemoryConfigs, and replaceWorkflowGraph via a shared
 * `resolveDraftRoutedConn(lookupConn, draftId)` helper. All four
 * mutations take `draftId` as their first arg and follow the same
 * DELETE-all + bulk-INSERT shape. Helper:
 *   1. Calls Path B's resolveWorkspaceIdForDraft(lookupConn, draftId)
 *   2. Routes via getAsDbForWorkspace(workspaceId)
 *   3. Falls back to lookupConn on any null in the chain
 *
 * Atomicity invariant: each function resolves ONCE at the top and
 * shares a single `conn` across all writes — no cross-region writes
 * inside one function body.
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

describe("MR-3 forty-third batch — draftId-scoped replace* mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveDraftRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveDraftRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveDraftRoutedConn calls Path B then routes via getAsDbForWorkspace", () => {
    const body = extractFunctionBody(src, "resolveDraftRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    expect(/resolveWorkspaceIdForDraft\s*\(/.test(body)).toBe(true);
    expect(/getAsDbForWorkspace\s*\(/.test(body)).toBe(true);
    // bootstrap-fallback when workspaceId is null
    expect(/workspaceId\s*==\s*null/.test(body)).toBe(true);
  });

  it.each([
    "replaceToolBindings",
    "replaceKnowledgeBindings",
    "replaceMemoryConfigs",
    "replaceWorkflowGraph",
  ])("%s routes via resolveDraftRoutedConn", (fnName) => {
    const body = extractFunctionBody(src, fnName);
    expect(body.length).toBeGreaterThan(0);
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*draftId\s*\)/.test(body),
    ).toBe(true);
  });

  it("replaceToolBindings DELETE + INSERT both use the routed conn", () => {
    const body = extractFunctionBody(src, "replaceToolBindings");
    expect(
      /conn\s*\n?\s*\.delete\s*\(\s*agsDraftToolBindings\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.insert\s*\(\s*agsDraftToolBindings\s*\)/.test(body),
    ).toBe(true);
  });

  it("replaceKnowledgeBindings DELETE + INSERT both use the routed conn", () => {
    const body = extractFunctionBody(src, "replaceKnowledgeBindings");
    expect(
      /conn\s*\n?\s*\.delete\s*\(\s*agsDraftKnowledgeBindings\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.insert\s*\(\s*agsDraftKnowledgeBindings\s*\)/.test(body),
    ).toBe(true);
  });

  it("replaceMemoryConfigs DELETE + INSERT both use the routed conn", () => {
    const body = extractFunctionBody(src, "replaceMemoryConfigs");
    expect(
      /conn\s*\n?\s*\.delete\s*\(\s*agsDraftMemoryConfigs\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.insert\s*\(\s*agsDraftMemoryConfigs\s*\)/.test(body),
    ).toBe(true);
  });

  it("replaceWorkflowGraph DELETEs + INSERTs all share the same routed conn", () => {
    const body = extractFunctionBody(src, "replaceWorkflowGraph");
    expect(
      /conn\s*\n?\s*\.delete\s*\(\s*agsDraftWorkflowNodes\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.delete\s*\(\s*agsDraftWorkflowEdges\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.insert\s*\(\s*agsDraftWorkflowNodes\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\.insert\s*\(\s*agsDraftWorkflowEdges\s*\)/.test(body),
    ).toBe(true);
    // single resolve-once at the top of the function — match should
    // appear exactly once in the body
    const matches = body.match(/resolveDraftRoutedConn\s*\(/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
