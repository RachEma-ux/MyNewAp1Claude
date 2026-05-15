/**
 * Boot wiring helper — V2 Phase MR-1 Phase-2 fourth slice.
 * PR-V1-151.
 *
 * Single function `maybeInstallRegionRouting()` that boot calls
 * once at startup. Mirrors the env-flag-gated pattern used for
 * Step 3.31 (extension lane hooks) and Step 3.27..3.30 (other
 * Phase-2 opt-ins). Default OFF; operators opt in by setting:
 *
 *   AGS_REGION_ROUTING=on
 *
 * Sequence when ON:
 *   1. Warm the routing cache from ASDB (load active regions +
 *      primary + every workspace pin).
 *   2. Install the region router into the MR-3 shim. From this
 *      point on, every `getAsDbForWorkspace(workspaceId)` consults
 *      the cache.
 *
 * Returns a small observability summary so boot can log it. Caller
 * is expected to wrap in try/catch and downgrade on error.
 *
 * Why env-flag-gated rather than automatic:
 *   - Single-region operators don't need the cutover; the bootstrap
 *     `getAsDb()` handle works fine.
 *   - Multi-region operators need to first populate `agsRegions` +
 *     `agsWorkspaceRegionPins` before flipping the flag; otherwise
 *     the cache is cold and the router is a no-op (correct behavior
 *     but wasted boot work).
 *
 * Hard-rule compliance:
 *   - No `process.env.*_API_KEY` reads. The env flag is a boolean
 *     toggle, not a secret.
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `neo4j-driver`
 *     imports.
 *   - Postgres = source of truth. Cache derives from ASDB rows.
 */

import { maybeSubscribeRegionCachePubsub } from "./region-cache-pubsub.js";
import { installRegionRouter } from "./region-routing-bridge.js";
import {
  invalidateRegionRoutingCache,
  warmRegionRoutingCache,
} from "./workspace-region-cache.js";

export interface InstallRegionRoutingResult {
  readonly installed: boolean;
  readonly reason?: string;
  readonly activeRegionCount?: number;
  readonly pinCount?: number;
  readonly primaryRegionKey?: string | null;
  readonly pubsubSubscribed?: boolean;
}

/**
 * Boot-time wiring. Returns `{ installed: false, reason: "..." }`
 * when the env flag is unset (default OFF) or when warming fails;
 * `{ installed: true, ... }` when the router is wired.
 */
export async function maybeInstallRegionRouting(): Promise<InstallRegionRoutingResult> {
  const flag = process.env.AGS_REGION_ROUTING;
  if (flag !== "on") {
    return { installed: false, reason: "env flag unset" };
  }
  let summary;
  try {
    summary = await warmRegionRoutingCache();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { installed: false, reason: `cache warm failed — ${msg}` };
  }
  installRegionRouter();
  // Subscribe to cross-process invalidations (opt-in via
  // AGS_REGION_PUBSUB=on). Subscriber falls back to no-op when the
  // flag is unset — same shape as the routing toggle itself.
  const pubsubSubscribed = maybeSubscribeRegionCachePubsub(() => {
    invalidateRegionRoutingCache();
    void warmRegionRoutingCache().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[ags-region-routing] re-warm after pubsub notification failed — ${msg}`,
      );
    });
  });
  return {
    installed: true,
    activeRegionCount: summary.activeRegionCount,
    pinCount: summary.pinCount,
    primaryRegionKey: summary.primaryRegionKey,
    pubsubSubscribed,
  };
}
