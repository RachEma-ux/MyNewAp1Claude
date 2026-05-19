/**
 * T-B.3 MR-1 caller migration — export-catalog-lookups.ts slice.
 *
 * `listPublishedAgents` previously always used `getAsDb()` (the
 * bootstrap handle) even when `filter.workspaceId` was supplied.
 * That meant published-agent lookups for a workspace in a non-primary
 * region went to the wrong replica. This PR routes through
 * `getAsDbForWorkspace` when a workspaceId is in scope.
 *
 * Verifies (source-scan only — the lookup's full behavior is exercised
 * by the existing export-catalog integration tests + the region-
 * routing tests):
 *
 *   - `buildLiveLookups` imports `getAsDbForWorkspace` alongside `getAsDb`
 *   - `listPublishedAgents` uses `getAsDbForWorkspace(ws)` when ws is
 *     defined; falls back to `getAsDb()` when ws is null/undefined
 *   - Comment documents the T-B.3 routing intent
 *   - No behavior change when ws is null (catalog-wide listing
 *     stays on bootstrap)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO = resolve(__dirname, "../..");
const SRC = join(REPO, "server/agent-studio/services/export-catalog-lookups.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("T-B.3 — export-catalog-lookups region routing", () => {
  const src = read(SRC);

  it("imports getAsDbForWorkspace alongside getAsDb", () => {
    expect(src).toMatch(
      /const\s*\{\s*getAsDb,\s*getAsDbForWorkspace\s*\}\s*=\s*await import\(["']\.\.\/db\/connection["']\)/,
    );
  });

  it("listPublishedAgents routes via getAsDbForWorkspace when ws is provided", () => {
    expect(src).toMatch(
      /ws\s*!=\s*null\s*\?\s*\(getAsDbForWorkspace\(ws\)\s*\?\?\s*getAsDb\(\)\)\s*:\s*getAsDb\(\)/,
    );
  });

  it("documents the T-B.3 routing intent in a comment", () => {
    expect(src).toMatch(/T-B\.3/);
    expect(src).toMatch(/workspace's region|MR-1 routing|workspace's region \(MR-1/);
  });

  it("falls back to bootstrap handle when workspace-routing returns null (no pin / cold cache)", () => {
    // The `?? getAsDb()` fallback ensures cold caches don't kill the
    // lookup; route only when the router resolves.
    expect(src).toMatch(/getAsDbForWorkspace\(ws\)\s*\?\?\s*getAsDb\(\)/);
  });
});
