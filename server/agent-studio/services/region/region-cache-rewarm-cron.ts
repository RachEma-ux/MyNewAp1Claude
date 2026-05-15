/**
 * Region cache re-warm cron — V2 Phase MR-1 Phase-2 seventh slice.
 * PR-V1-155.
 *
 * Defensive cron that periodically re-warms the routing cache so
 * pin / region changes on other replicas (or any source of cache
 * drift) eventually become visible. Wraps `warmRegionRoutingCache`
 * via the existing retention-cron factory pattern (Step 3.21..3.23
 * approval-lifecycle / Step 3.25 graph-health-alert / Step 3.3..
 * retention crons all use this factory).
 *
 * Why an interval > 0 even with the invalidation hooks in place
 * (#903/#904):
 *   - In-process hooks invalidate the *local* cache only.
 *     Multi-replica deployments need cross-process coherency. Until
 *     a pub-sub channel ships (SOU §5 deferred), the cron is the
 *     only mechanism for non-writer replicas to pick up changes.
 *   - Even single-replica deployments benefit: catches the
 *     edge case where a hook closure threw (logged + swallowed
 *     in firePinChanged / fireRegionChanged) and the cache stayed
 *     stale until the next process restart.
 *
 * Default cadence: every 10 minutes. Configurable via
 * `AGS_REGION_CACHE_REWARM_CRON_EXPR`. Disabled via
 * `AGS_REGION_CACHE_REWARM_CRON_DISABLED=on`.
 *
 * Hard-rule compliance:
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `neo4j-driver`
 *     imports.
 *   - Single-region operators leave `AGS_REGION_ROUTING` unset; the
 *     cron still runs but the cache is never warmed (cold-cache
 *     fallback path). No DB writes, no Neo4j calls.
 */

import {
  makeRetentionCron,
  type RetentionCronEnsureState,
  type RetentionCronStatus,
  type TickRetentionCronOptions,
  type TickRetentionCronResult,
} from "../retention/make-retention-cron.js";
import { warmRegionRoutingCache } from "./workspace-region-cache.js";

export interface RegionCacheRewarmCronInput {
  readonly scope?: string;
  /** Test seam — override the warmer used by the sweep. */
  readonly runWarm?: typeof warmRegionRoutingCache;
}

export interface RegionCacheRewarmCronResult {
  readonly scope: string;
  readonly warmedAt: string;
  readonly activeRegionCount: number;
  readonly pinCount: number;
  readonly primaryRegionKey: string | null;
}

const cron = makeRetentionCron<
  RegionCacheRewarmCronInput,
  RegionCacheRewarmCronResult
>({
  logPrefix: "ags-region-cache-rewarm-cron",
  envPrefix: "AGS_REGION_CACHE_REWARM",
  defaultCronExpr: "*/10 * * * *",
  defaultRetentionDays: null,
  buildSweepInput: ({ sweepInput }) => sweepInput ?? {},
  runSweep: async (input) => {
    const scope = input.scope ?? "default";
    const runWarm = input.runWarm ?? warmRegionRoutingCache;
    const summary = await runWarm();
    return {
      scope,
      warmedAt: summary.lastWarmedAt.toISOString(),
      activeRegionCount: summary.activeRegionCount,
      pinCount: summary.pinCount,
      primaryRegionKey: summary.primaryRegionKey,
    };
  },
  formatSweepLogTail: (r) =>
    `scope=${r.scope} regions=${r.activeRegionCount} pins=${r.pinCount} primary=${r.primaryRegionKey ?? "(none)"}`,
  formatStartupLogTail: () => "scope=default",
});

export const DEFAULT_REGION_CACHE_REWARM_CRON_EXPR = cron.DEFAULT_CRON_EXPR;

export type TickRegionCacheRewarmCronOptions = TickRetentionCronOptions<
  RegionCacheRewarmCronInput,
  RegionCacheRewarmCronResult
>;
export type TickRegionCacheRewarmCronResult =
  TickRetentionCronResult<RegionCacheRewarmCronResult>;
export type RegionCacheRewarmCronEnsureState =
  RetentionCronEnsureState<RegionCacheRewarmCronResult>;
export type RegionCacheRewarmCronStatus =
  RetentionCronStatus<RegionCacheRewarmCronResult>;

export const tickRegionCacheRewarmCron = cron.tick;
export const getRegionCacheRewarmCronStatus = cron.getStatus;
export const ensureRegionCacheRewarmCronStarted = cron.ensureStarted;
export const _resetRegionCacheRewarmCronForTests = cron.resetForTests;
