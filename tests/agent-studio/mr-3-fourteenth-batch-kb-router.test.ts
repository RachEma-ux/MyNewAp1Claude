/**
 * MR-3 fourteenth batch — api/kb-router.ts source-scan
 * (PR-V1-75).
 *
 * Phase F fourteenth batch — first Category D (tRPC router) batch
 * per `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * The kb-router uses a private `asdb()` helper to centralize the
 * ASDB lookup + ASDB-unavailable TRPCError. This batch widens the
 * helper to `asdb(workspaceId: number)` so every procedure routes
 * through `getAsDbForWorkspace(workspaceId)` (Phase-1 shim still
 * delegates to `getAsDb()`; Phase-2 routes by region).
 *
 * Every procedure already takes `input.workspaceId` via
 * `workspaceRefSchema` — no caller-shape changes; each `const db =
 * asdb()` callsite becomes `const db = asdb(input.workspaceId)`.
 *
 * Covers:
 *   - Import drops bare `getAsDb`; adds `getAsDbForWorkspace`.
 *   - Helper signature: `asdb(workspaceId: number)`.
 *   - Helper body calls `getAsDbForWorkspace(workspaceId)`.
 *   - No `asdb()` (zero-arg) call sites remain.
 *   - At least 6 `asdb(input.workspaceId)` call sites exist.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("MR-3 fourteenth batch source-scan — api/kb-router.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/api/kb-router.ts",
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
    expect(helperStart).toBeGreaterThan(-1);
    const afterHelper = stripped.slice(helperStart);
    const nextDecl = afterHelper.search(/\n(export|async function|const\s+\w+\s*=)/);
    const helperBody =
      nextDecl > 0 ? afterHelper.slice(0, nextDecl) : afterHelper;
    expect(
      /getAsDbForWorkspace\s*\(\s*workspaceId\s*\)/.test(helperBody),
    ).toBe(true);
  });

  it("no zero-arg asdb() call sites remain", () => {
    // Match `asdb()` only when NOT followed by an arg (rule out
    // helper signature line via the stripped slice excluding the
    // declaration).
    const declMatch = stripped.match(/function\s+asdb\s*\(\s*workspaceId\s*:\s*number\s*\)\s*\{[\s\S]*?\n\}/);
    const decl = declMatch?.[0] ?? "";
    const bodyOnly = stripped.replace(decl, "");
    expect(/\basdb\s*\(\s*\)/.test(bodyOnly)).toBe(false);
  });

  it("≥6 asdb(input.workspaceId) call sites are present", () => {
    const calls = stripped.match(
      /\basdb\s*\(\s*input\.workspaceId\s*\)/g,
    );
    expect(calls?.length ?? 0).toBeGreaterThanOrEqual(6);
  });
});
