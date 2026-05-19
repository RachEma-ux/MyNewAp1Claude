/**
 * T-B.3 follow-on — bases-service MR-1 region routing.
 *
 * `createBase` and `listBases` previously always used `getAsDb()`
 * (the bootstrap handle) even when the workspaceId was explicitly
 * in scope (input or filter). This PR routes them through
 * `getAsDbForWorkspace` when ws is non-null; falls back to
 * bootstrap when routing returns null or ws is null/undefined.
 *
 * Source-scan only — the behavioral path is exercised by the
 * existing bases-service integration tests + the region-routing
 * tests on `getAsDbForWorkspace` itself.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const SERVICE = join(
  resolve(__dirname, "../.."),
  "server/agent-studio/services/bases/bases-service.ts",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("T-B.3 — bases-service region routing", () => {
  const src = read(SERVICE);

  it("imports getAsDbForWorkspace alongside getAsDb", () => {
    expect(src).toMatch(
      /import\s*\{\s*getAsDb,\s*getAsDbForWorkspace\s*\}\s*from\s*["']\.\.\/\.\.\/db\/connection\.js["']/,
    );
  });

  it("createBase routes through getAsDbForWorkspace when input.workspaceId is set", () => {
    expect(src).toMatch(
      /export async function createBase[\s\S]*?const ws = input\.workspaceId;[\s\S]*?ws\s*!=\s*null\s*\?\s*\(getAsDbForWorkspace\(ws\)\s*\?\?\s*getAsDb\(\)\)\s*:\s*getAsDb\(\)/,
    );
  });

  it("listBases routes through getAsDbForWorkspace when filter.workspaceId is set", () => {
    expect(src).toMatch(
      /export async function listBases[\s\S]*?const ws = filter\.workspaceId;[\s\S]*?ws\s*!=\s*null\s*\?\s*\(getAsDbForWorkspace\(ws\)\s*\?\?\s*getAsDb\(\)\)\s*:\s*getAsDb\(\)/,
    );
  });

  it("documents the T-B.3 routing intent in comments", () => {
    const tb3Matches = src.match(/T-B\.3/g);
    expect(tb3Matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("falls back to bootstrap handle on cold-cache (?? getAsDb()) in both call sites", () => {
    const fallbacks = src.match(/getAsDbForWorkspace\(ws\)\s*\?\?\s*getAsDb\(\)/g);
    expect(fallbacks?.length ?? 0).toBe(2);
  });
});
