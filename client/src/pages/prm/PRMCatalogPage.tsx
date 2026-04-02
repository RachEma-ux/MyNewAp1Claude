/**
 * PRM Catalog Page — Published lessons, templates, standards
 */
import { trpc } from "@/lib/trpc";
import { Loader2, Library } from "lucide-react";

export default function PRMCatalogPage() {
  const { data: items, isLoading } = trpc.prm.catalog.list.useQuery();

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Library className="h-5 w-5 text-orange-500" />
        PRM Catalog
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Published lessons, templates, and standards from resolved cases.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : !items?.length ? (
        <div className="border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No catalog items published yet. Resolve cases and publish lessons to populate the catalog.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item: any) => (
            <div key={item.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-sm font-medium truncate">{item.title}</h3>
                <span className="text-[10px] text-muted-foreground uppercase shrink-0">
                  {item.itemType}
                </span>
              </div>
              {item.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-[10px]">
                <span className={`capitalize ${
                  item.publicationState === "published" ? "text-green-500" : "text-muted-foreground"
                }`}>
                  {item.publicationState}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
