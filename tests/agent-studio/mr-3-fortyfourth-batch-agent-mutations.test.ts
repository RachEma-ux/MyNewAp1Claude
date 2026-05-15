/**
 * MR-3 forty-fourth batch — repository.ts agentId-scoped mutations
 * Path-B consumers Cat B→A.
 * PR-V1-114.
 *
 * Promotes the three agentId-scoped agsAgents mutations:
 *   - updateAgentLifecycleState
 *   - updateAgentCore
 *   - archiveAgent
 *
 * Introduces a shared `resolveAgentRoutedConn(lookupConn, agentId)`
 * helper that 2-step-resolves: agentId → draftId via agsAgentDrafts,
 * then chains into Path B's `resolveWorkspaceIdForDraft`. Falls back
 * to bootstrap on any null in the chain (no drafts OR no binding).
 *
 * Sister to the `resolveDraftRoutedConn` (#864) and
 * `resolveBindingRoutedConn` (#863) helpers.
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

describe("MR-3 forty-fourth batch — agentId-scoped mutations Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it("defines a shared resolveAgentRoutedConn helper", () => {
    expect(
      /async\s+function\s+resolveAgentRoutedConn\s*\(/.test(src),
    ).toBe(true);
  });

  it("resolveAgentRoutedConn looks up agsAgentDrafts.agentId then chains into Path B", () => {
    const body = extractFunctionBody(src, "resolveAgentRoutedConn");
    expect(body.length).toBeGreaterThan(0);
    // 2-step: first an agsAgentDrafts lookup, then the Path B resolver
    expect(/agsAgentDrafts/.test(body)).toBe(true);
    expect(/resolveWorkspaceIdForDraft\s*\(/.test(body)).toBe(true);
    expect(/getAsDbForWorkspace\s*\(/.test(body)).toBe(true);
  });

  it.each([
    "updateAgentLifecycleState",
    "updateAgentCore",
    "archiveAgent",
  ])("%s routes via resolveAgentRoutedConn", (fnName) => {
    const body = extractFunctionBody(src, fnName);
    expect(body.length).toBeGreaterThan(0);
    expect(
      /resolveAgentRoutedConn\s*\(\s*lookupConn\s*,\s*agentId\s*\)/.test(body),
    ).toBe(true);
  });

  it.each([
    "updateAgentLifecycleState",
    "updateAgentCore",
    "archiveAgent",
  ])("%s UPDATE uses the routed conn", (fnName) => {
    const body = extractFunctionBody(src, fnName);
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsAgents\s*\)/.test(body),
    ).toBe(true);
  });
});
