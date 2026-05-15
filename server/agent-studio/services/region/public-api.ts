/**
 * Region service — public API barrel.
 *
 * V2 Phase MR-1 first slice.
 */

export type {
  RegionRecord,
  RegisterRegionInput,
} from "./types.js";

export {
  RegionNotFoundError,
  RegionRouterUnavailableError,
  CrossRegionAccessDeniedError,
} from "./types.js";

export {
  AsdbUnavailableError,
  registerRegion,
  getRegionByKey,
  getRegionById,
  listActiveRegions,
  getPrimaryRegion,
  requireActiveRegion,
  setRegionChangeHook,
} from "./region-service.js";

export {
  resolveWorkspaceRegion,
  assertSameRegion,
} from "./region-router.js";

// V2 Phase MR-2 (2026-05-13): region-routed connection helper.
export {
  getDbForRegion,
  getDbForWorkspace,
  getNeo4jUriForRegion,
  listWarmRegionPoolKeys,
  type RegionConnectionOptions,
  type GetDbForWorkspaceInput,
} from "./connection-helper.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-148): workspace → region pin.
export {
  setWorkspaceRegionPin,
  getWorkspaceRegionPin,
  listAllWorkspaceRegionPins,
  removeWorkspaceRegionPin,
  setPinChangeHook,
  type WorkspaceRegionPinRecord,
  type SetWorkspaceRegionPinInput,
} from "./workspace-region-pin-service.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-149): in-process routing cache.
// PR-V1-183: + `resolveWorkspaceRegionLookup` operator surface.
export {
  warmRegionRoutingCache,
  getCachedRegionKeyForWorkspace,
  getCachedActiveRegions,
  getCachedPrimaryRegion,
  getCachedRegionForWorkspace,
  getRegionRoutingCacheStatus,
  invalidateRegionRoutingCache,
  resolveWorkspaceRegionLookup,
} from "./workspace-region-cache.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-150): shim cutover bridge.
export {
  installRegionRouter,
  uninstallRegionRouter,
} from "./region-routing-bridge.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-151): boot wiring helper.
export {
  maybeInstallRegionRouting,
  type InstallRegionRoutingResult,
} from "./install-region-routing.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-155): region cache re-warm cron.
export {
  DEFAULT_REGION_CACHE_REWARM_CRON_EXPR,
  tickRegionCacheRewarmCron,
  getRegionCacheRewarmCronStatus,
  ensureRegionCacheRewarmCronStarted,
  type RegionCacheRewarmCronInput,
  type RegionCacheRewarmCronResult,
  type RegionCacheRewarmCronStatus,
} from "./region-cache-rewarm-cron.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-156): admin tRPC router.
export { regionAdminRouter } from "./region-admin-router.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-158): cross-region guard.
export {
  guardCrossRegionAccess,
  getProcessRegionKey,
  type CrossRegionGuardContext,
} from "./cross-region-guard.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-159): tRPC middleware factory.
export {
  createCrossRegionMiddleware,
  type CreateCrossRegionMiddlewareOptions,
} from "./cross-region-trpc-middleware.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-160): cross-process pubsub.
// PR-V1-185: + force-reconnect symmetric with approval-bus.
export {
  notifyRegionCacheInvalidation,
  subscribeRegionCacheInvalidations,
  unsubscribeRegionCacheInvalidations,
  maybeSubscribeRegionCachePubsub,
  getRegionCachePubsubStatus,
  forceReconnectRegionCachePubsubSubscriber,
  type RegionCachePubsubStatus,
  type ForceReconnectRegionCachePubsubResult,
} from "./region-cache-pubsub.js";
