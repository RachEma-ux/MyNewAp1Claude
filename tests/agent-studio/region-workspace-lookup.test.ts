/**
 * Region admin — workspace-location lookup. PR-V1-183.
 *
 * Source-scan that `resolveWorkspaceRegionLookup` is exported from
 * the cache module, re-exported via the barrel, mounted on the
 * admin router as `lookupWorkspaceRegion`, and wired through a
 * lazy-enabled query in the operator panel.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-183 — region workspace-location lookup", () => {
  const cache = resolve(
    __dirname,
    "../../server/agent-studio/services/region/workspace-region-cache.ts",
  );
  const barrel = resolve(
    __dirname,
    "../../server/agent-studio/services/region/public-api.ts",
  );
  const adminRouter = resolve(
    __dirname,
    "../../server/agent-studio/services/region/region-admin-router.ts",
  );
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
  );

  it("cache module exports resolveWorkspaceRegionLookup with the 6-field result", () => {
    const src = readFileSync(cache, "utf8");
    expect(
      /export\s+function\s+resolveWorkspaceRegionLookup/.test(src),
    ).toBe(true);
    // The closed pinSource taxonomy.
    expect(/"explicit-pin"/.test(src)).toBe(true);
    expect(/"primary-fallback"/.test(src)).toBe(true);
    expect(/"no-active-region"/.test(src)).toBe(true);
    // 6 result fields the UI relies on.
    expect(/workspaceId:\s*workspaceId/.test(src)).toBe(true);
    expect(/regionKey:/.test(src)).toBe(true);
    expect(/pinSource:/.test(src)).toBe(true);
    expect(/pinExists:/.test(src)).toBe(true);
    expect(/cacheIsWarm:/.test(src)).toBe(true);
    expect(/lastWarmedAt:/.test(src)).toBe(true);
  });

  it("cache module surfaces pin→inactive-region misconfiguration as no-active-region+pinExists=true", () => {
    const src = readFileSync(cache, "utf8");
    const body = src.slice(
      src.indexOf("export function resolveWorkspaceRegionLookup"),
    );
    // The misconfiguration branch: pin row exists but region
    // inactive → pinSource="no-active-region", pinExists=true.
    expect(/Pin row exists but the region is inactive/.test(body)).toBe(true);
    // Cold-cache fall-through: pinSource="no-active-region",
    // cacheIsWarm=false.
    expect(/cacheIsWarm:\s*false/.test(body)).toBe(true);
  });

  it("barrel re-exports resolveWorkspaceRegionLookup", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("resolveWorkspaceRegionLookup");
  });

  it("admin router exposes lookupWorkspaceRegion as adminProcedure.query", () => {
    const src = readFileSync(adminRouter, "utf8");
    expect(src).toContain("lookupWorkspaceRegion");
    expect(
      /lookupWorkspaceRegion:\s*adminProcedure[\s\S]{0,400}\.query\(/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /resolveWorkspaceRegionLookup\(input\.workspaceId\)/.test(src),
    ).toBe(true);
  });

  it("UI panel renders a WorkspaceLocationLookupCard with lazy-enabled query + testids", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("WorkspaceLocationLookupCard");
    expect(src).toContain(
      "trpc.agentStudio.region.lookupWorkspaceRegion.useQuery",
    );
    // Lazy enablement.
    expect(/enabled:\s*submittedId\s*!==\s*null/.test(src)).toBe(true);
    expect(src).toContain('data-testid="region-lookup-submit"');
    expect(src).toContain('data-testid="region-lookup-result"');
    // Misconfiguration highlight.
    expect(
      /lookupQ\.data\.pinSource\s*===\s*"no-active-region"\s*\?\s*"text-destructive"/.test(
        src,
      ),
    ).toBe(true);
  });

  it("hard-rule compliance on the touched server-side path", () => {
    const src = readFileSync(cache, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
