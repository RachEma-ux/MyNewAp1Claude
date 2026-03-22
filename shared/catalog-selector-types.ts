/**
 * Catalog Selector Types — Shared contract for app-usage selectors.
 *
 * These types power the Catalog-backed reusable selection system.
 * App-facing selectors must source from Catalog-authoritative availability,
 * NOT from raw source-domain tables.
 *
 * Availability rule:
 *   Only catalog entries with status="active" AND reviewState="approved"
 *   are considered available for app usage.
 */

/** The five AI Types managed in the Catalog */
export type CatalogSelectorKind = "llm" | "provider" | "model" | "bot" | "agent";

/**
 * Normalized option shape returned by Catalog availability endpoints.
 * Used by backend → frontend selector pipeline.
 */
export interface CatalogAvailableOption {
  id: number;
  sourceType: CatalogSelectorKind;
  sourceId: number | null;
  name: string;
  displayName: string;
  description?: string | null;
  status: string;
  tags?: string[];
  category?: string | null;
  subCategory?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Client-side selector option shape for rendering in dropdowns.
 * Mapped from CatalogAvailableOption by the client hooks.
 */
export interface CatalogSelectorOption {
  id: number;
  kind: CatalogSelectorKind;
  label: string;
  description?: string | null;
  badge?: string;
  tags?: string[];
  disabled?: boolean;
  metadata?: Record<string, any>;
}
