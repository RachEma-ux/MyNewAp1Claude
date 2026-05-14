/**
 * MR-3 fifteenth batch — api/tool-knowledge-router.ts source-scan
 * (PR-V1-76).
 *
 * Second Category D (tRPC router) batch off the MR-3 Phase-1 shim.
 *
 * Same shape as #826 (kb-router): every procedure is
 * workspace-scoped via `workspaceRefSchema`. Widens `asdb()` to
 * `asdb(workspaceId: number)` calling `getAsDbForWorkspace`. Drops
 * bare `getAsDb` import; file is 100% migrated.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("MR-3 fifteenth batch source-scan — api/tool-knowledge-router.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/api/tool-knowledge-router.ts",
  );
  const src = readFileSync(file, "utf8");
  const stripped = stripComments(src);

  it("imports getAsDbForWorkspace from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("no longer imports bare getAsDb (file is 100% migrated)", () => {
    expect(
      /import\s*\{[^}]*\bgetAsDb\b(?![A-Za-z])[^}]*\}\s*from/.test(stripped),
    ).toBe(false);
  });

  it("helper signature is asdb(workspaceId: number)", () => {
    expect(
      /function\s+asdb\s*\(\s*workspaceId\s*:\s*number\s*\)/.test(stripped),
    ).toBe(true);
  });

  it("helper body calls getAsDbForWorkspace(workspaceId)", () => {
    const helperStart = stripped.search(/function\s+asdb\s*\(/);
    const afterHelper = stripped.slice(helperStart);
    const nextDecl = afterHelper.search(/\n(export|async function|const\s+\w+\s*=)/);
    const helperBody =
      nextDecl > 0 ? afterHelper.slice(0, nextDecl) : afterHelper;
    expect(
      /getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/.test(helperBody),
    ).toBe(true);
  });

  it("no zero-arg asdb() call sites remain", () => {
    const declMatch = stripped.match(
      /function\s+asdb\s*\(\s*workspaceId\s*:\s*number\s*\)\s*\{[\s\S]*?\n\}/,
    );
    const bodyOnly = stripped.replace(declMatch?.[0] ?? "", "");
    expect(/\basdb\s*\(\s*\)/.test(bodyOnly)).toBe(false);
  });

  it("≥2 asdb(input.workspaceId) call sites are present", () => {
    const calls = stripped.match(
      /\basdb\s*\(\s*input\.workspaceId\s*\)/g,
    );
    expect(calls?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
