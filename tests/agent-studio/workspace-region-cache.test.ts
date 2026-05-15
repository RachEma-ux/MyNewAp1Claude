/**
 * Workspace → Region routing cache tests — V2 Phase MR-1 Phase-2.
 * PR-V1-149.
 *
 * The cache is pure in-process state: behavioral tests stub the
 * downstream service calls (listActiveRegions / getPrimaryRegion /
 * listAllWorkspaceRegionPins) via vi.mock and verify:
 *
 *   - Cold cache: every sync reader returns the documented "empty"
 *     fallback (null / [] / isWarm=false).
 *   - Warm cache: readers return the loaded snapshot.
 *   - Pin → region resolution: workspaceId → regionKey → full record.
 *   - Missing-pin fallback: no pin → primary region.
 *   - Inactive/missing region pin: returns null (not a silent fall-back).
 *   - invalidate → cold again.
 *
 * Hard-rule compliance check is in the source-scan portion at the
 * bottom — no env reads / credential-resolver / dispatcher /
 * neo4j-driver imports in the cache file.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  RegionRecord,
} from "../../server/agent-studio/services/region/types.js";

vi.mock("../../server/agent-studio/services/region/region-service.js", () => ({
  listActiveRegions: vi.fn(),
  getPrimaryRegion: vi.fn(),
  AsdbUnavailableError: class AsdbUnavailableError extends Error {},
}));

vi.mock(
  "../../server/agent-studio/services/region/workspace-region-pin-service.js",
  () => ({
    listAllWorkspaceRegionPins: vi.fn(),
  }),
);

import {
  listActiveRegions,
  getPrimaryRegion,
} from "../../server/agent-studio/services/region/region-service.js";
import { listAllWorkspaceRegionPins } from "../../server/agent-studio/services/region/workspace-region-pin-service.js";
import {
  warmRegionRoutingCache,
  getCachedRegionKeyForWorkspace,
  getCachedActiveRegions,
  getCachedPrimaryRegion,
  getCachedRegionForWorkspace,
  getRegionRoutingCacheStatus,
  invalidateRegionRoutingCache,
} from "../../server/agent-studio/services/region/workspace-region-cache.js";

const mockedListActiveRegions = vi.mocked(listActiveRegions);
const mockedGetPrimaryRegion = vi.mocked(getPrimaryRegion);
const mockedListAllWorkspaceRegionPins = vi.mocked(
  listAllWorkspaceRegionPins,
);

function makeRegion(over: Partial<RegionRecord> = {}): RegionRecord {
  return {
    id: 1,
    regionKey: "default",
    name: "Default Region",
    postgresUri: "postgresql://localhost:5432/asdb",
    neo4jUri: null,
    credentialBindingId: null,
    isPrimary: true,
    isActive: true,
    settings: null,
    createdAt: new Date("2026-05-15T00:00:00Z"),
    updatedAt: new Date("2026-05-15T00:00:00Z"),
    ...over,
  };
}

describe("MR-1 Phase-2 — workspace-region routing cache", () => {
  beforeEach(() => {
    invalidateRegionRoutingCache();
    mockedListActiveRegions.mockReset();
    mockedGetPrimaryRegion.mockReset();
    mockedListAllWorkspaceRegionPins.mockReset();
  });

  afterEach(() => {
    invalidateRegionRoutingCache();
  });

  it("cold cache: sync readers all return empty/null fallbacks", () => {
    expect(getCachedRegionKeyForWorkspace(42)).toBeNull();
    expect(getCachedActiveRegions()).toEqual([]);
    expect(getCachedPrimaryRegion()).toBeNull();
    expect(getCachedRegionForWorkspace(42)).toBeNull();
    const status = getRegionRoutingCacheStatus();
    expect(status.isWarm).toBe(false);
    expect(status.lastWarmedAt).toBeNull();
    expect(status.activeRegionCount).toBe(0);
    expect(status.pinCount).toBe(0);
    expect(status.primaryRegionKey).toBeNull();
  });

  it("warm cache: readers return the loaded snapshot", async () => {
    const primary = makeRegion({ id: 1, regionKey: "default" });
    const usWest = makeRegion({
      id: 2,
      regionKey: "us-west-1",
      isPrimary: false,
    });
    mockedListActiveRegions.mockResolvedValue([primary, usWest]);
    mockedGetPrimaryRegion.mockResolvedValue(primary);
    mockedListAllWorkspaceRegionPins.mockResolvedValue([
      {
        id: 1,
        workspaceId: 42,
        regionKey: "us-west-1",
        isReplicated: false,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const summary = await warmRegionRoutingCache();
    expect(summary.activeRegionCount).toBe(2);
    expect(summary.pinCount).toBe(1);
    expect(summary.primaryRegionKey).toBe("default");
    expect(getCachedRegionKeyForWorkspace(42)).toBe("us-west-1");
    expect(getCachedRegionKeyForWorkspace(99)).toBeNull();
    expect(getCachedActiveRegions()).toHaveLength(2);
    expect(getCachedPrimaryRegion()?.regionKey).toBe("default");
    expect(getRegionRoutingCacheStatus().isWarm).toBe(true);
  });

  it("pinned workspace resolves to the full region record", async () => {
    const primary = makeRegion({ regionKey: "default" });
    const euWest = makeRegion({
      id: 3,
      regionKey: "eu-west-1",
      isPrimary: false,
    });
    mockedListActiveRegions.mockResolvedValue([primary, euWest]);
    mockedGetPrimaryRegion.mockResolvedValue(primary);
    mockedListAllWorkspaceRegionPins.mockResolvedValue([
      {
        id: 1,
        workspaceId: 7,
        regionKey: "eu-west-1",
        isReplicated: false,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await warmRegionRoutingCache();
    const r = getCachedRegionForWorkspace(7);
    expect(r?.regionKey).toBe("eu-west-1");
    expect(r?.id).toBe(3);
  });

  it("unpinned workspace falls back to the primary region", async () => {
    const primary = makeRegion({ regionKey: "default" });
    mockedListActiveRegions.mockResolvedValue([primary]);
    mockedGetPrimaryRegion.mockResolvedValue(primary);
    mockedListAllWorkspaceRegionPins.mockResolvedValue([]);
    await warmRegionRoutingCache();
    const r = getCachedRegionForWorkspace(42);
    expect(r?.regionKey).toBe("default");
  });

  it("pin to inactive/missing region returns null (caller surfaces config error)", async () => {
    const primary = makeRegion({ regionKey: "default" });
    mockedListActiveRegions.mockResolvedValue([primary]);
    mockedGetPrimaryRegion.mockResolvedValue(primary);
    mockedListAllWorkspaceRegionPins.mockResolvedValue([
      {
        id: 1,
        workspaceId: 42,
        regionKey: "decommissioned-1",
        isReplicated: false,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await warmRegionRoutingCache();
    expect(getCachedRegionForWorkspace(42)).toBeNull();
  });

  it("invalidate drops the cache back to cold", async () => {
    mockedListActiveRegions.mockResolvedValue([makeRegion()]);
    mockedGetPrimaryRegion.mockResolvedValue(makeRegion());
    mockedListAllWorkspaceRegionPins.mockResolvedValue([]);
    await warmRegionRoutingCache();
    expect(getRegionRoutingCacheStatus().isWarm).toBe(true);
    invalidateRegionRoutingCache();
    expect(getRegionRoutingCacheStatus().isWarm).toBe(false);
    expect(getCachedActiveRegions()).toEqual([]);
  });

  it("source-scan: hard-rule compliance + public-api re-export", () => {
    const cacheFile = resolve(
      __dirname,
      "../../server/agent-studio/services/region/workspace-region-cache.ts",
    );
    const barrelFile = resolve(
      __dirname,
      "../../server/agent-studio/services/region/public-api.ts",
    );
    const cacheSrc = readFileSync(cacheFile, "utf8");
    const barrelSrc = readFileSync(barrelFile, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(cacheSrc)).toBe(false);
    expect(/credential-resolver/.test(cacheSrc)).toBe(false);
    expect(/dispatchMcpToolCall/.test(cacheSrc)).toBe(false);
    expect(/neo4j-driver/.test(cacheSrc)).toBe(false);
    expect(barrelSrc).toContain("./workspace-region-cache.js");
    expect(barrelSrc).toContain("warmRegionRoutingCache");
    expect(barrelSrc).toContain("getCachedRegionForWorkspace");
    expect(barrelSrc).toContain("invalidateRegionRoutingCache");
  });
});
