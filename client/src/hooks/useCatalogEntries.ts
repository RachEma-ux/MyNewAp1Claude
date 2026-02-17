import { trpc } from "@/lib/trpc";
import type { EntryType } from "@shared/catalog-taxonomy";

interface UseCatalogEntriesFilter {
  entryType?: EntryType;
  category?: string;
}

export function useCatalogEntries(filter?: UseCatalogEntriesFilter) {
  const { data: entries = [], isLoading, refetch } = trpc.catalogManage.list.useQuery(
    filter?.entryType || filter?.category
      ? {
          ...(filter.entryType && { entryType: filter.entryType }),
          ...(filter.category && { category: filter.category }),
        }
      : {}
  );

  return { entries, isLoading, refetch };
}
