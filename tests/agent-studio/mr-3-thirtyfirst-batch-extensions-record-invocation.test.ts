/**
 * MR-3 thirty-first batch — extensions/runtime.ts::recordInvocation
 * split-handle Cat B→A via extension→workspace lookup.
 * PR-V1-100.
 *
 * `agsExtensionInvocations` doesn't carry workspaceId directly, but
 * the parent `agsExtensions` row does (non-null). Discovery SELECT
 * pulls it up via the test-seam-wrapped `getDb`, then the INSERT
 * routes via `getAsDbForWorkspace`. Soft-return on empty lookup
 * preserves observability-path semantics (a missing extension row
 * does not throw — pre-existing behavior).
 *
 * Test-seam contract preserved: tests passing `getDb: () => null`
 * still no-op (the bootstrap lookup returns null and we soft-return).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("MR-3 thirty-first batch — recordInvocation split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/runtime.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb", () => {
    expect(
      /import\s*\{\s*getAsDb,\s*getAsDbForWorkspace\s*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("recordInvocation uses two DB handles — SELECT via getDb (seam), INSERT via getAsDbForWorkspace", () => {
    // The recordInvocation function is internal (not exported); slice
    // its body by name.
    const fnMatch = src.match(
      /\nasync\s+function\s+recordInvocation\s*\([\s\S]*?\n\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    expect(/lookupDb\s*=\s*getDb\s*\(\s*\)/.test(body)).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId\s*\)/.test(body),
    ).toBe(true);
  });

  it("recordInvocation discovery SELECT precedes the INSERT into agsExtensionInvocations", () => {
    const fnMatch = src.match(
      /\nasync\s+function\s+recordInvocation\s*\([\s\S]*?\n\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    const selectIdx = body.search(
      /\.select\(\s*\{\s*workspaceId:\s*agsExtensions\.workspaceId\s*\}/,
    );
    const insertIdx = body.search(/\.insert\s*\(\s*agsExtensionInvocations\s*\)/);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(insertIdx);
  });

  it("recordInvocation soft-returns on empty lookup (observability semantics preserved)", () => {
    const fnMatch = src.match(
      /\nasync\s+function\s+recordInvocation\s*\([\s\S]*?\n\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    expect(
      /if\s*\(\s*lookup\.length\s*===\s*0\s*\)\s*return\s*;/.test(body),
    ).toBe(true);
  });

  it("recordInvocation test seam (getDb option) still gates the bootstrap (passes `() => null` still no-ops)", () => {
    const fnMatch = src.match(
      /\nasync\s+function\s+recordInvocation\s*\([\s\S]*?\n\}\n/,
    );
    expect(fnMatch).not.toBeNull();
    const body = stripComments(fnMatch![0]);
    // The `if (!lookupDb) return` early-return must remain so
    // existing tests using `getDb: () => null` still no-op.
    expect(/if\s*\(\s*!lookupDb\s*\)\s*return\s*;/.test(body)).toBe(true);
  });
});
