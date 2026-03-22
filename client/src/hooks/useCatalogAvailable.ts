/**
 * Catalog Availability Hooks — App-usage selectors sourced from AI Types.
 *
 * These hooks consume `useCatalogEntries` (catalogManage.list + static fallback)
 * so that dropdown selectors always have data — even before governance approval.
 *
 * Client-side filtering by search/tags/limit is applied on top.
 *
 * Usage:
 *   const { options, isLoading } = useCatalogAvailableLLMs();
 *   const { options, isLoading } = useCatalogAvailableAgents({ search: "code" });
 */

import { useMemo } from "react";
import { useCatalogEntries } from "./useCatalogEntries";
import type { CatalogSelectorOption, CatalogSelectorKind } from "@shared/catalog-selector-types";
import type { EntryType } from "@shared/catalog-taxonomy";

interface CatalogAvailableFilter {
  search?: string;
  tags?: string[];
  limit?: number;
}

/** Map catalog entries into CatalogSelectorOption[] */
function mapToSelectorOptions(
  data: any[],
  kind: CatalogSelectorKind
): CatalogSelectorOption[] {
  return data.map((entry) => ({
    id: entry.id,
    kind,
    label: entry.displayName || entry.name,
    description: entry.description ?? null,
    badge: entry.category ?? undefined,
    tags: entry.tags ?? [],
    disabled: false,
    metadata: entry.metadata ?? {},
  }));
}

function useCatalogAvailable(
  entryType: CatalogSelectorKind,
  filter?: CatalogAvailableFilter
) {
  const { entries, isLoading, refetch } = useCatalogEntries({
    entryType: entryType as EntryType,
  });

  const options = useMemo(() => {
    let filtered = entries;

    // Client-side search filter
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      filtered = filtered.filter(
        (e: any) =>
          (e.displayName || e.name || "").toLowerCase().includes(q) ||
          (e.description || "").toLowerCase().includes(q) ||
          (e.category || "").toLowerCase().includes(q)
      );
    }

    // Client-side tag filter
    if (filter?.tags?.length) {
      const tagSet = new Set(filter.tags.map((t) => t.toLowerCase()));
      filtered = filtered.filter((e: any) =>
        (e.tags || []).some((t: string) => tagSet.has(t.toLowerCase()))
      );
    }

    // Limit
    if (filter?.limit && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }

    return mapToSelectorOptions(filtered, entryType);
  }, [entries, entryType, filter?.search, filter?.tags, filter?.limit]);

  return { options, raw: entries, isLoading, isError: false, refetch };
}

/** Catalog-available LLMs for app usage */
export function useCatalogAvailableLLMs(filter?: CatalogAvailableFilter) {
  return useCatalogAvailable("llm", filter);
}

/** Catalog-available Providers for app usage */
export function useCatalogAvailableProviders(filter?: CatalogAvailableFilter) {
  return useCatalogAvailable("provider", filter);
}

/** Catalog-available Models for app usage */
export function useCatalogAvailableModels(filter?: CatalogAvailableFilter) {
  return useCatalogAvailable("model", filter);
}

/** Catalog-available Bots for app usage */
export function useCatalogAvailableBots(filter?: CatalogAvailableFilter) {
  return useCatalogAvailable("bot", filter);
}

/** Catalog-available Agents for app usage */
export function useCatalogAvailableAgents(filter?: CatalogAvailableFilter) {
  return useCatalogAvailable("agent", filter);
}
