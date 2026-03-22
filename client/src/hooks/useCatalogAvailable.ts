/**
 * Catalog Availability Hooks — App-usage selectors sourced from Catalog.
 *
 * These hooks consume the `catalogManage.available` endpoint, which returns
 * ONLY Catalog-authoritative available assets (status=active, reviewState=approved).
 *
 * They do NOT query raw source-domain tables directly.
 *
 * Usage:
 *   const { options, isLoading } = useCatalogAvailableLLMs();
 *   const { options, isLoading } = useCatalogAvailableAgents({ search: "code" });
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { CatalogSelectorOption, CatalogSelectorKind } from "@shared/catalog-selector-types";

interface CatalogAvailableFilter {
  search?: string;
  tags?: string[];
  limit?: number;
}

/** Map a backend availability response into CatalogSelectorOption[] */
function mapToSelectorOptions(
  data: any[] | undefined,
  kind: CatalogSelectorKind
): CatalogSelectorOption[] {
  if (!data) return [];
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
  const queryInput = useMemo(
    () => ({
      entryType: entryType as any,
      ...(filter?.search && { search: filter.search }),
      ...(filter?.tags?.length && { tags: filter.tags }),
      ...(filter?.limit && { limit: filter.limit }),
    }),
    [entryType, filter?.search, filter?.tags, filter?.limit]
  );

  const { data, isLoading, isError, refetch } =
    trpc.catalogManage.available.useQuery(queryInput);

  const options = useMemo(
    () => mapToSelectorOptions(data, entryType),
    [data, entryType]
  );

  return { options, raw: data ?? [], isLoading, isError, refetch };
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
