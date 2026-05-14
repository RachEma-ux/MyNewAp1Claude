/**
 * MR-3 twenty-eighth batch — bindings.ts::upsertAgentProviderBinding.
 * PR-V1-96.
 *
 * `upsertAgentProviderBinding(input)` takes `input.workspaceId` (Cat
 * A clean migration). The Phase-1 shim delegates to `getAsDb()` so
 * single-region behavior is bit-for-bit identical; Phase-2 will
 * route by region. The other functions in bindings.ts stay on bare
 * `getAsDb()`: `getAgentProviderBinding(draftId, role)`,
 * `listBindingsForAgent(agentId)`, `removeAgentProviderBinding`,
 * `validateBindingPolicy`, `refreshBindingValidation` — all
 * draftId/agentId-scoped (intentional Cat B; would need a JOIN to
 * agsAgentDrafts→agsAgents.workspaceId for routing benefit).
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

describe("MR-3 twenty-eighth batch — upsertAgentProviderBinding", () => {
  const file = resolve(__dirname, "../../server/agent-studio/bindings.ts");
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{\s*getAsDb,\s*getAsDbForWorkspace\s*\}\s*from\s+["']\.\/db\/connection["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("upsertAgentProviderBinding calls getAsDbForWorkspace(input.workspaceId)", () => {
    const body = extractFunctionBody(src, "upsertAgentProviderBinding");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    // The mutation must NOT call bare getAsDb() — that would be the
    // unmigrated shape.
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  it.each([
    "getAgentProviderBinding",
    "listBindingsForAgent",
    "removeAgentProviderBinding",
  ])(
    "%s stays Cat B (draftId/agentId-scoped) — still calls getAsDb()",
    (fnName) => {
      const body = extractFunctionBody(src, fnName);
      expect(body.length).toBeGreaterThan(0);
      expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
      expect(/getAsDbForWorkspace/.test(body)).toBe(false);
    },
  );
});
