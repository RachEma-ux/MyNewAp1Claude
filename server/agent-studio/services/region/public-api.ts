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
  type WorkspaceRegionPinRecord,
  type SetWorkspaceRegionPinInput,
} from "./workspace-region-pin-service.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-149): in-process routing cache.
export {
  warmRegionRoutingCache,
  getCachedRegionKeyForWorkspace,
  getCachedActiveRegions,
  getCachedPrimaryRegion,
  getCachedRegionForWorkspace,
  getRegionRoutingCacheStatus,
  invalidateRegionRoutingCache,
} from "./workspace-region-cache.js";

// V2 Phase MR-1 Phase-2 (2026-05-15, PR-V1-150): shim cutover bridge.
export {
  installRegionRouter,
  uninstallRegionRouter,
} from "./region-routing-bridge.js";
