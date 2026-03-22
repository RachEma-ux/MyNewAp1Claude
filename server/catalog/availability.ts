/**
 * Catalog Availability Authority — single source of truth for app-usage availability.
 *
 * An asset is "available for app use" if and only if:
 *   status === "active"  AND  reviewState === "approved"
 *
 * This module is consumed by:
 *   - catalogManage.available endpoint (backend)
 *   - Any runtime code that needs to gate on availability
 *
 * It is NOT the same as execution readiness (see execution.ts for agent runtime checks
 * which also require published bundles, callable config, etc.).
 */

export interface CatalogAvailabilityInput {
  status: string | null;
  reviewState: string | null;
}

export interface CatalogAvailabilityResult {
  available: boolean;
  reasons: string[];
}

/**
 * Authoritative check: is this catalog entry available for app usage?
 *
 * Returns { available, reasons } — reasons list all blocking conditions.
 */
export function checkCatalogAvailability(entry: CatalogAvailabilityInput): CatalogAvailabilityResult {
  const reasons: string[] = [];

  if (entry.status !== "active") {
    reasons.push(
      entry.status === "draft"
        ? "Entry is still in draft — activate it first"
        : entry.status === "deprecated"
          ? "Entry has been deprecated"
          : entry.status === "disabled"
            ? "Entry is disabled"
            : `Entry status "${entry.status ?? "unknown"}" is not active`
    );
  }

  if (entry.reviewState !== "approved") {
    reasons.push(
      entry.reviewState === "needs_review"
        ? "Entry is pending review — approve it first"
        : entry.reviewState === "rejected"
          ? "Entry has been rejected"
          : `Entry review state "${entry.reviewState ?? "unknown"}" is not approved`
    );
  }

  return {
    available: reasons.length === 0,
    reasons,
  };
}

/**
 * Quick boolean check — is this entry available for app usage?
 */
export function isCatalogEntryAvailableForAppUse(entry: CatalogAvailabilityInput): boolean {
  return entry.status === "active" && entry.reviewState === "approved";
}

/**
 * The DB filter values that define availability.
 * Use this when building queries to pre-filter at the DB level.
 */
export const CATALOG_AVAILABILITY_FILTERS = {
  status: "active" as const,
  reviewState: "approved" as const,
};
