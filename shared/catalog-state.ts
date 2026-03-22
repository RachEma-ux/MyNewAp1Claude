/**
 * Unified Catalog State — consistent exposure across domains.
 *
 * Provides a single helper to derive the Catalog lifecycle state
 * from a catalog entry's status, reviewState, and tags.
 *
 * This helper is consumed by enriched list endpoints (listEnriched)
 * to expose a uniform `catalogState` field across all AI Type domains.
 *
 * Does NOT conflict with LLM version-based enrichment — LLMs can
 * use this alongside their version model.
 */

export interface CatalogStateResult {
  /** Entry has been created as a candidate */
  isCandidate: boolean;
  /** Entry review has been approved */
  isApproved: boolean;
  /** Entry has a published bundle (has "published" tag) */
  isPublished: boolean;
  /** Entry is active in the Catalog */
  isActive: boolean;
  /** Entry is available for app usage (active + approved) */
  isAvailableForAppUse: boolean;
  /** Human-readable summary label */
  label: "not_imported" | "candidate" | "approved" | "published" | "active" | "available" | "rejected" | "deprecated" | "disabled";
}

export interface CatalogStateInput {
  status: string | null;
  reviewState: string | null;
  tags: string[] | null;
}

/**
 * Derive unified catalog state from a catalog entry.
 *
 * Returns a consistent state object that UI components can use
 * without domain-specific logic.
 */
export function getCatalogState(entry: CatalogStateInput | null): CatalogStateResult {
  if (!entry) {
    return {
      isCandidate: false,
      isApproved: false,
      isPublished: false,
      isActive: false,
      isAvailableForAppUse: false,
      label: "not_imported",
    };
  }

  const tags = entry.tags ?? [];
  const isCandidate = tags.includes("candidate");
  const isApproved = entry.reviewState === "approved";
  const isPublished = tags.includes("published");
  const isActive = entry.status === "active";
  const isAvailableForAppUse = isActive && isApproved;

  // Derive label: most specific state wins
  let label: CatalogStateResult["label"];
  if (entry.reviewState === "rejected") {
    label = "rejected";
  } else if (entry.status === "deprecated") {
    label = "deprecated";
  } else if (entry.status === "disabled") {
    label = "disabled";
  } else if (isAvailableForAppUse && isPublished) {
    label = "available";
  } else if (isActive) {
    label = "active";
  } else if (isPublished) {
    label = "published";
  } else if (isApproved) {
    label = "approved";
  } else if (isCandidate) {
    label = "candidate";
  } else {
    label = "not_imported";
  }

  return {
    isCandidate,
    isApproved,
    isPublished,
    isActive,
    isAvailableForAppUse,
    label,
  };
}

/**
 * Derive catalogState for a domain entity that may or may not have a catalog entry.
 *
 * Used by listEnriched endpoints: they pass the matched catalog entry (or null).
 */
export function getCatalogStateForDomainEntity(
  catalogEntry: CatalogStateInput | null
): CatalogStateResult {
  return getCatalogState(catalogEntry);
}
