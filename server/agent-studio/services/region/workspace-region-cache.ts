/**
 * Workspace → Region routing cache — V2 Phase MR-1 Phase-2 second slice.
 *
 * The MR-3 shim `getAsDbForWorkspace(workspaceId)` is a synchronous
 * function (changing every call site to async would be a heavyweight
 * refactor). To route a workspaceId to its home region in Phase-2,
 * the shim needs a **synchronous** view of:
 *   1. The active region list (from `agsRegions`).
 *   2. The workspace → regionKey pin map (from
 *      `agsWorkspaceRegionPins`).
 *
 * This module owns that view. It is an in-process cache populated
 * asynchronously by `warmRegionRoutingCache()` and read
 * synchronously by `getCachedRegionForWorkspace()`.
 *
 * Wiring (this slice + follow-up):
 *   - This PR: cache + warmer + sync readers + invalidation hooks.
 *   - Next PR: `getAsDbForWorkspace` consults the cache; boot wires
 *     the initial warm + a periodic re-warm.
 *
 * Single-region operational baseline preserved:
 *   - Until `warmRegionRoutingCache()` runs, every reader returns
 *     "empty" — `getCachedRegionKeyForWorkspace` returns null,
 *     `getCachedActiveRegions` returns []. Callers fall back to
 *     legacy behavior (bootstrap `getAsDb()`).
 *   - Single-region operators never need to call the warmer because
 *     the default region is reachable via the bootstrap handle. The
 *     cache is only load-bearing in multi-region deployments.
 *
 * Hard-rule compliance:
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `neo4j-driver`
 *     imports.
 *   - Postgres = source of truth. The cache is a derived view; any
 *     write goes through the service layer + invalidates the cache.
 */

import type { RegionRecord } from "./types.js";
import {
  listActiveRegions,
  getPrimaryRegion,
} from "./region-service.js";
import { listAllWorkspaceRegionPins } from "./workspace-region-pin-service.js";

interface CacheState {
  readonly activeRegions: ReadonlyArray<RegionRecord>;
  readonly primaryRegion: RegionRecord | null;
  readonly workspacePinByWorkspaceId: ReadonlyMap<number, string>;
  readonly lastWarmedAt: Date;
}

let _cache: CacheState | null = null;

/**
 * Async warmer — load active regions + every workspace pin into the
 * in-process cache. Call from boot and from any explicit refresh
 * hook (e.g. an admin endpoint after operator updates a pin).
 *
 * Returns the new cache snapshot for observability (e.g. operator
 * status panel can show "last warmed N seconds ago").
 */
export async function warmRegionRoutingCache(): Promise<{
  readonly activeRegionCount: number;
  readonly pinCount: number;
  readonly primaryRegionKey: string | null;
  readonly lastWarmedAt: Date;
}> {
  const [regions, primary, pins] = await Promise.all([
    listActiveRegions(),
    getPrimaryRegion(),
    listAllWorkspaceRegionPins(),
  ]);
  const pinMap = new Map<number, string>();
  for (const p of pins) {
    pinMap.set(p.workspaceId, p.regionKey);
  }
  const now = new Date();
  _cache = {
    activeRegions: regions,
    primaryRegion: primary,
    workspacePinByWorkspaceId: pinMap,
    lastWarmedAt: now,
  };
  return {
    activeRegionCount: regions.length,
    pinCount: pinMap.size,
    primaryRegionKey: primary?.regionKey ?? null,
    lastWarmedAt: now,
  };
}

/**
 * Sync reader — return the cached pin's regionKey for a workspace.
 * Returns null when:
 *   - The cache has not been warmed yet (single-region operational
 *     baseline; caller falls back to bootstrap).
 *   - The workspace has no pin (caller should resolve to the primary
 *     region via `getCachedPrimaryRegion`).
 */
export function getCachedRegionKeyForWorkspace(
  workspaceId: number,
): string | null {
  if (!_cache) return null;
  return _cache.workspacePinByWorkspaceId.get(workspaceId) ?? null;
}

/**
 * Sync reader — return the cached active regions list. Empty array
 * when cache is not warmed.
 */
export function getCachedActiveRegions(): ReadonlyArray<RegionRecord> {
  return _cache?.activeRegions ?? [];
}

/**
 * Sync reader — return the cached primary region. Null when cache
 * is not warmed or registry has no primary.
 */
export function getCachedPrimaryRegion(): RegionRecord | null {
  return _cache?.primaryRegion ?? null;
}

/**
 * Sync reader — resolve a workspace to its full region record
 * using the cached pin + active region list. Returns null when the
 * cache is cold OR the pin names an inactive/missing region (caller
 * falls back to primary).
 */
export function getCachedRegionForWorkspace(
  workspaceId: number,
): RegionRecord | null {
  if (!_cache) return null;
  const regionKey = _cache.workspacePinByWorkspaceId.get(workspaceId);
  if (!regionKey) return _cache.primaryRegion;
  const region = _cache.activeRegions.find((r) => r.regionKey === regionKey);
  if (region) return region;
  // Pin references a missing/inactive region. Don't silently
  // fall back to the primary — the caller surfaces the configuration
  // error. Returning null preserves the existing `resolveWorkspaceRegion`
  // pure-router semantics.
  return null;
}

/**
 * Observability — the cache snapshot's `lastWarmedAt`, or null when
 * the cache is cold.
 */
export function getRegionRoutingCacheStatus(): {
  readonly isWarm: boolean;
  readonly lastWarmedAt: Date | null;
  readonly activeRegionCount: number;
  readonly pinCount: number;
  readonly primaryRegionKey: string | null;
} {
  if (!_cache) {
    return {
      isWarm: false,
      lastWarmedAt: null,
      activeRegionCount: 0,
      pinCount: 0,
      primaryRegionKey: null,
    };
  }
  return {
    isWarm: true,
    lastWarmedAt: _cache.lastWarmedAt,
    activeRegionCount: _cache.activeRegions.length,
    pinCount: _cache.workspacePinByWorkspaceId.size,
    primaryRegionKey: _cache.primaryRegion?.regionKey ?? null,
  };
}

/**
 * Invalidation hook — drop the cached state. Used after any region
 * registry write OR workspace pin write. The next reader sees a
 * cold cache and falls back to bootstrap; a subsequent
 * `warmRegionRoutingCache()` rebuilds the snapshot.
 *
 * Production callers SHOULD invoke `warmRegionRoutingCache()`
 * immediately after invalidation rather than leaving the cache
 * cold; this two-step shape lets tests inspect the cold-cache
 * fall-through without an actual DB.
 */
export function invalidateRegionRoutingCache(): void {
  _cache = null;
}
