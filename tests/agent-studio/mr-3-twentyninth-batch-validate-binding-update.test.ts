/**
 * MR-3 twenty-ninth batch — bindings.ts::validateBindingPolicy
 * already-loaded-binding split-handle.
 * PR-V1-97.
 *
 * `validateBindingPolicy(draftId, role, options)` was Cat B per
 * #847 (draftId-scoped). This batch promotes the UPDATE-on-refresh
 * branch to Cat A by routing via `binding.workspaceId` — the
 * binding row was already SELECT-ed by `getAgentProviderBinding`
 * earlier in the function, so no extra round-trip is needed.
 *
 * The function still calls `getAsDb()` indirectly through
 * `getAgentProviderBinding` (deferred Cat B per #847), so the
 * file's broader Cat B inventory is unchanged. This batch
 * specifically targets the WRITE site that previously took a
 * unrouted handle.
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
    `\\n\\s*export\\s+(?:async\\s+)?function\\s+${fnName}\\s*[<(]`,
  );
  const declMatch = src.match(decl);
  if (!declMatch || declMatch.index === undefined) return "";
  const start = declMatch.index;
  const declEnd = start + declMatch[0].length;
  const afterDecl = src.slice(declEnd);
  const nextMatch = afterDecl.match(
    /\n\s*export\s+(?:async\s+)?function\s+\w+\s*[<(]/,
  );
  const end =
    nextMatch && nextMatch.index !== undefined
      ? declEnd + nextMatch.index
      : src.length;
  return stripComments(src.slice(start, end));
}

describe("MR-3 twenty-ninth batch — validateBindingPolicy UPDATE split-handle", () => {
  const file = resolve(__dirname, "../../server/agent-studio/bindings.ts");
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb", () => {
    expect(
      /import\s*\{\s*getAsDb,\s*getAsDbForWorkspace\s*\}\s*from\s+["']\.\/db\/connection["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("validateBindingPolicy refresh-branch UPDATE routes via getAsDbForWorkspace(binding.workspaceId)", () => {
    const body = extractFunctionBody(src, "validateBindingPolicy");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*binding\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    // The body must NOT call a bare getAsDb() for the UPDATE path —
    // routing must go through the workspace-routed handle. The
    // earlier SELECT through getAgentProviderBinding is fine; we
    // assert the WRITE path specifically.
    const updateBlock = body.match(/if\s*\(\s*refreshTimestamp[\s\S]*?writtenAt\s*=\s*now;[\s\S]*?\}/);
    expect(updateBlock).not.toBeNull();
    if (updateBlock) {
      expect(/getAsDbForWorkspace\s*\(\s*binding\.workspaceId\s*\)/.test(updateBlock[0])).toBe(
        true,
      );
      expect(/\bgetAsDb\b\s*\(\s*\)/.test(updateBlock[0])).toBe(false);
    }
  });

  it("the refresh-branch SELECT-then-UPDATE ordering is preserved (binding fetched before UPDATE)", () => {
    const body = extractFunctionBody(src, "validateBindingPolicy");
    const fetchIdx = body.search(/await\s+getAgentProviderBinding\s*\(/);
    const updateIdx = body.search(/\.update\s*\(\s*agsAgentProviderBindings\s*\)/);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeLessThan(updateIdx);
  });
});
