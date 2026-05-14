/**
 * MR-3 sixth batch — ingestion/universal-ingestion-service.ts source-scan
 * (PR-V1-50).
 *
 * Phase F sixth batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Both call sites in this file have `workspaceId` in scope (Category A):
 *   - Layer-4 extractor loop in `runIngestion(request, ...)` — uses
 *     `request.workspaceId`.
 *   - `persistArtifact(input)` helper — uses `input.workspaceId`.
 *
 * Both migrate to `getAsDbForWorkspace(workspaceId)`. Because there are
 * NO remaining `getAsDb()` call sites in this file, the import line
 * drops `getAsDb` and only imports `getAsDbForWorkspace`. This is the
 * FIRST ingestion file in MR-3 to be 100% migrated; closes the
 * 4-of-4 ingestion sub-arc (with #798 / #799 / #800 covering the
 * other three).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("MR-3 sixth batch source-scan — ingestion/universal-ingestion-service.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/ingestion/universal-ingestion-service.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = stripComments(src);

  it("imports getAsDbForWorkspace from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("does NOT import getAsDb (this file is 100% migrated)", () => {
    expect(
      /import\s*\{[^}]*\bgetAsDb\b(?![a-zA-Z])[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(false);
  });

  it("has no `getAsDb()` call sites (only `getAsDbForWorkspace(...)`)", () => {
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(code)).toBe(false);
  });

  it("has at least 2 `getAsDbForWorkspace(...)` call sites (layer-4 + persistArtifact)", () => {
    const matches = code.match(/getAsDbForWorkspace\s*\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("layer-4 extractor block routes via getAsDbForWorkspace(request.workspaceId)", () => {
    expect(
      /getAsDbForWorkspace\s*\(\s*request\.workspaceId\s*\)/.test(code),
    ).toBe(true);
  });

  it("persistArtifact routes via getAsDbForWorkspace(input.workspaceId)", () => {
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(code),
    ).toBe(true);
  });
});
