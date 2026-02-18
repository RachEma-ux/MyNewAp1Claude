import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { EntryType } from "@shared/catalog-taxonomy";
import { getStaticCatalogEntries } from "@shared/static-catalog";

interface UseCatalogEntriesFilter {
  entryType?: EntryType;
  category?: string;
}

export function useCatalogEntries(filter?: UseCatalogEntriesFilter) {
  const { data: dbEntries = [], isLoading, isError, refetch } = trpc.catalogManage.list.useQuery(
    filter?.entryType || filter?.category
      ? {
          ...(filter.entryType && { entryType: filter.entryType }),
          ...(filter.category && { category: filter.category }),
        }
      : {}
  );

  // Fall back to static catalog when DB is empty or unavailable
  const entries = useMemo(() => {
    if (dbEntries.length > 0) return dbEntries;
    if (isLoading) return [];

    // DB returned empty or errored — use static fallback
    const staticEntries = getStaticCatalogEntries();
    if (filter?.entryType) {
      return staticEntries.filter((e) => e.entryType === filter.entryType);
    }
    if (filter?.category) {
      return staticEntries.filter((e) => e.category === filter.category);
    }
    return staticEntries;
  }, [dbEntries, isLoading, isError, filter?.entryType, filter?.category]);

  return { entries, isLoading, refetch };
}
