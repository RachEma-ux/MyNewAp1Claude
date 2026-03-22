/**
 * Catalog Intake Types — Shared contract for source-domain selectors.
 *
 * These types power the domain → Catalog import pipeline.
 * Source-domain selectors present deployable entities from their
 * domain tables (NOT from catalog_entries) for import into the Catalog.
 *
 * IMPORTANT: This is the INTAKE family of selectors.
 * The APP-USAGE family lives in catalog-selector-types.ts.
 * The two MUST NOT be merged.
 *
 * Intake flow:
 *   Domain table → isDeployable check → listEnriched → importToCatalog
 */

import type { AITypeKind } from "../server/core/domain-entity";

// Re-export for convenience
export type { AITypeKind };

// ============================================================================
// Enriched Domain Item (backend → frontend for list pages)
// ============================================================================

/**
 * Shape returned by listEnriched endpoints across all domains.
 * Extends the domain entity with catalog state and deployability info.
 */
export interface EnrichedDomainItem {
  id: number;
  kind: AITypeKind;
  name: string;
  displayName?: string | null;
  description?: string | null;
  status: string;

  /** Where this entity sits in the Catalog pipeline */
  catalogState: "not_imported" | "candidate" | "imported" | "published";

  /** Catalog entry ID if imported */
  catalogEntryId: number | null;

  /** Whether entity passes deployability gate */
  isDeployable: boolean;

  /** Human-readable reasons preventing deployment */
  blockingReasons: string[];
}

// ============================================================================
// Import Request / Response (importToCatalog)
// ============================================================================

/** Input shape for importToCatalog mutations */
export interface CatalogImportRequest {
  id: number;
}

/** Response shape from importToCatalog mutations */
export interface CatalogImportResponse {
  success: boolean;
  entry: {
    id: number;
    name: string;
    status: string;
    reviewState: string;
  } | null;
  imported: boolean;
}
