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
