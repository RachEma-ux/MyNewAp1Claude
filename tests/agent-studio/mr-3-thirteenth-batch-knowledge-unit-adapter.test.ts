/**
 * MR-3 thirteenth batch — services/rac/ingestion/knowledge-unit-adapter.ts
 * source-scan (PR-V1-74).
 *
 * Phase F thirteenth batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * The file is an object-literal export (`export const
 * knowledgeUnitAdapter: RacIngestionAdapter = { ... }`), so we
 * source-scan rather than try to extract method bodies.
 *
 * Covers:
 *   - `search(input)` calls `getAsDbForWorkspace(input.workspaceId)`
 *     (Category A — RacRetrievalRequest.workspaceId is required).
 *   - `health()` still calls `getAsDb()` — Category B-ish
 *     (workspace-agnostic ASDB availability check; no workspaceId
 *     in scope without changing the RacIngestionAdapter interface).
 *   - The file imports `getAsDbForWorkspace` alongside `getAsDb`.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("MR-3 thirteenth batch source-scan — knowledge-unit-adapter.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/rac/ingestion/knowledge-unit-adapter.ts",
  );
  const src = readFileSync(file, "utf8");
  const stripped = stripComments(src);

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("search() method body migrates to getAsDbForWorkspace(input.workspaceId)", () => {
    // The adapter `search()` and `health()` are object-literal
    // methods so we extract the slice of stripped source between
    // the `async search(` header and the next async-method header.
    const searchStart = stripped.search(
      /\basync\s+search\s*\(\s*input\s*:/,
    );
    expect(searchStart).toBeGreaterThan(-1);
    const afterSearch = stripped.slice(searchStart);
    const nextMethod = afterSearch.search(
      /\n\s*async\s+\w+\s*\(/,
    );
    const searchBody =
      nextMethod > 0 ? afterSearch.slice(0, nextMethod) : afterSearch;
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(searchBody),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(searchBody)).toBe(false);
  });

  it("health() is Category B-ish — still calls getAsDb()", () => {
    const healthStart = stripped.search(/\basync\s+health\s*\(/);
    expect(healthStart).toBeGreaterThan(-1);
    const afterHealth = stripped.slice(healthStart);
    const nextMethod = afterHealth.search(/\n\s*async\s+\w+\s*\(/);
    const healthBody =
      nextMethod > 0 ? afterHealth.slice(0, nextMethod) : afterHealth;
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(healthBody)).toBe(true);
    expect(/getAsDbForWorkspace/.test(healthBody)).toBe(false);
  });
});
