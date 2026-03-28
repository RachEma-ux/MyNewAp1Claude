/**
 * AI Types Domain → Catalog Projection
 *
 * Maps domain entities to catalog_entries fields.
 * Preserves lifecycle/governance state already on the catalog entry.
 * Writes sourceType + sourceId to link back to domain.
 *
 * BOUNDARY: Internal to AI Types domain.
 */

import type { AIEntryType, CatalogProjectionInput } from "./types";
import {
  createCatalogEntry,
  getCatalogEntryById,
  updateCatalogEntry,
} from "../db";
import { catalogEntries } from "../../drizzle/schema";
import { getDb } from "../db/connection";
import { eq, and } from "drizzle-orm";

// ── Build Catalog Fields From Domain Entity ─────────────────────────────

/**
 * Build the catalog_entries field values from a domain entity.
 * Does NOT write to DB — returns the fields for the caller to use.
 */
export function buildCatalogFields(input: CatalogProjectionInput): Record<string, unknown> {
  return {
    name: input.name,
    displayName: input.displayName ?? input.name,
    description: input.description ?? null,
    entryType: input.entryType,
    sourceType: input.entryType,
    sourceId: input.domainId,
    scope: input.scope ?? "app",
    status: input.status ?? "draft",
    origin: input.origin ?? "admin",
    reviewState: input.reviewState ?? "approved",
    providerId: input.providerId ?? null,
    config: input.config ?? {},
    tags: input.tags ?? [],
    category: input.category ?? null,
    subCategory: input.subCategory ?? null,
    capabilities: input.capabilities ?? null,
    createdBy: input.createdBy ?? 1,
  };
}

// ── Create Catalog Projection ───────────────────────────────────────────

/**
 * Create a new catalog entry as a projection of a domain entity.
 * Sets sourceType and sourceId to link back to the domain table.
 */
export async function projectToCatalog(input: CatalogProjectionInput): Promise<{ id: number }> {
  const fields = buildCatalogFields(input);
  const entry = await createCatalogEntry(fields as any);
  return { id: entry.id };
}

// ── Refresh Catalog Projection ──────────────────────────────────────────

/**
 * Refresh an existing catalog entry from its domain source.
 * Preserves lifecycle/governance fields (status, reviewState, stageReviews, frozen).
 * Only updates identity + type-specific fields.
 */
export async function refreshCatalogProjection(
  catalogEntryId: number,
  input: Omit<CatalogProjectionInput, "domainId"> & { domainId: number }
): Promise<void> {
  const existing = await getCatalogEntryById(catalogEntryId);
  if (!existing) return;

  // Only update domain-sourced fields — preserve governance state
  await updateCatalogEntry(
    catalogEntryId,
    {
      name: input.name,
      displayName: input.displayName ?? input.name,
      description: input.description ?? null,
      providerId: input.providerId ?? existing.providerId,
      config: input.config ?? existing.config,
      capabilities: input.capabilities ?? existing.capabilities,
      sourceType: input.entryType,
      sourceId: input.domainId,
    } as any,
    input.createdBy ?? 1
  );
}

// ── Find Catalog Entry By Source ────────────────────────────────────────

/**
 * Find a catalog entry linked to a specific domain entity.
 */
export async function findCatalogEntryBySource(
  sourceType: AIEntryType,
  sourceId: number
): Promise<{ id: number } | null> {
  const db = getDb();
  if (!db) return null;

  const [entry] = await db
    .select({ id: catalogEntries.id })
    .from(catalogEntries)
    .where(
      and(
        eq(catalogEntries.sourceType, sourceType),
        eq(catalogEntries.sourceId, sourceId)
      )
    )
    .limit(1);

  return entry ?? null;
}

// ── Link Existing Catalog Entry to Domain ───────────────────────────────

/**
 * Set sourceType + sourceId on an existing catalog entry to link it
 * back to a domain entity. Used by the migration/backfill process.
 */
export async function linkCatalogToDomain(
  catalogEntryId: number,
  sourceType: AIEntryType,
  sourceId: number
): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db
    .update(catalogEntries)
    .set({ sourceType, sourceId })
    .where(eq(catalogEntries.id, catalogEntryId));
}
