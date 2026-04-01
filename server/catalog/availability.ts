/**
 * BACKWARD COMPATIBILITY SHIM
 * Canonical code now lives in server/ai-types/availability.ts
 */
export {
  checkCatalogAvailability,
  isCatalogEntryAvailableForAppUse,
  CATALOG_AVAILABILITY_FILTERS,
  type CatalogAvailabilityInput,
  type CatalogAvailabilityResult,
} from "../ai-types/availability";
