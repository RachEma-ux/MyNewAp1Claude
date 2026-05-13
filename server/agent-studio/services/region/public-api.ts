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
