/**
 * MR-3 eighth batch — services/cag/store.ts source-scan
 * (PR-V1-69).
 *
 * Phase F eighth batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Covers:
 *   - 3 Category A functions migrate to `getAsDbForWorkspace`:
 *     `createPack(input)`           → getAsDbForWorkspace(input.workspaceId)
 *     `getPackById(workspaceId, …)` → getAsDbForWorkspace(workspaceId)
 *     `listPacksForAgent(workspaceId, …)` → getAsDbForWorkspace(workspaceId)
 *   - 5 Category B functions still call `getAsDb()`:
 *     `getLatestPack(agentDraftId)` — agentDraftId-scoped
 *     `listPacks(agentDraftId)`     — agentDraftId-scoped
 *     `markPackStale(packId, …)`    — packId-scoped (workspaceId
 *                                     read from the loaded row)
 *     `markPackUsed(packId)`        — packId-scoped
 *     `recordPackTokenActual(packId, …)` — packId-scoped
 *   - Import-shape check.
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

describe("MR-3 eighth batch source-scan — services/cag/store.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/cag/store.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  describe("Category A — workspaceId in scope, migrated", () => {
    const CATEGORY_A: ReadonlyArray<{ fn: string; pattern: RegExp }> = [
      {
        fn: "createPack",
        pattern: /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/,
      },
      {
        fn: "getPackById",
        pattern: /getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/,
      },
      {
        fn: "listPacksForAgent",
        pattern: /getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/,
      },
    ];

    for (const { fn, pattern } of CATEGORY_A) {
      it(`${fn} calls getAsDbForWorkspace(...) and not getAsDb()`, () => {
        const body = extractFunctionBody(src, fn);
        expect(body.length).toBeGreaterThan(0);
        expect(pattern.test(body)).toBe(true);
        expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
      });
    }
  });

  describe("Category B — still on getAsDb() pending caller plumbing", () => {
    // NOTE: `markPackStale` was Cat B at the time of #820 and was
    // promoted to Cat A in #831 (eighteenth batch) via the
    // discovering-helper / split-handle pattern. The same
    // split-handle pattern was extended to UPDATE-only helpers in
    // #838 (nineteenth batch): `markPackUsed` and
    // `recordPackTokenActual` are now Cat A too. Only the read-
    // only `getLatestPack` + `listPacks` siblings remain Cat B
    // (intentional — no UPDATE/DELETE means no routing benefit
    // from a split-handle round-trip).
    const CATEGORY_B: ReadonlyArray<string> = [
      "getLatestPack",
      "listPacks",
    ];

    for (const fn of CATEGORY_B) {
      it(`${fn} is Category B and still calls getAsDb()`, () => {
        const body = extractFunctionBody(src, fn);
        expect(body.length).toBeGreaterThan(0);
        expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
        expect(/getAsDbForWorkspace/.test(body)).toBe(false);
      });
    }
  });
});
