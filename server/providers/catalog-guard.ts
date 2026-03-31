/**
 * Catalog Guard — Reusable utility for checking provider approval in the AI Types Catalog.
 *
 * Answers: "Is this provider ID approved in the catalog?"
 * Uses a short-lived in-memory cache (1 minute TTL) to avoid repeated DB queries.
 */

import { getCatalogEntries } from "../db/catalog";

let _approvedCache: Set<number> | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/** Return the set of provider IDs that are active + approved in the catalog */
export async function getApprovedProviderIds(): Promise<Set<number>> {
  if (_approvedCache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return _approvedCache;
  }
  const entries = await getCatalogEntries({
    entryType: "provider",
    status: "active",
    reviewState: "approved",
  });
  _approvedCache = new Set(
    entries.filter((e) => e.providerId != null).map((e) => e.providerId!),
  );
  _cacheTime = Date.now();
  return _approvedCache;
}

/** Invalidate the cached set (call after catalog changes) */
export function invalidateApprovedCache() {
  _approvedCache = null;
}
