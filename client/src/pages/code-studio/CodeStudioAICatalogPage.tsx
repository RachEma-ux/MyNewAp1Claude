/**
 * Code Studio AI Catalog — Import AI Types into Code Studio (cloned from PSM AI Catalog).
 * Uses codeStudio.catalogImports tRPC router (CODEDB-backed).
 */
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Brain, Download, Search, Trash2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCatalogEntries } from "@/hooks/useCatalogEntries";
import { ENTRY_TYPES, ENTRY_TYPE_DEFS } from "@shared/catalog-taxonomy";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CodeStudioAICatalogPage() {
  const utils = trpc.useUtils();
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState("all");

  const importsQuery = trpc.codeStudio.catalogImports.list.useQuery();
  const catalogImports = importsQuery.data ?? [];

  const importMutation = trpc.codeStudio.catalogImports.import.useMutation({
    onSuccess: (data: any) => {
      utils.codeStudio.catalogImports.list.invalidate();
      toast.success(`Imported "${data?.name || "entry"}" into Code Studio`);
    },
    onError: (err) => {
      toast.error(`Import failed: ${err.message}`);
    },
  });

  const removeMutation = trpc.codeStudio.catalogImports.remove.useMutation({
    onSuccess: () => {
      utils.codeStudio.catalogImports.list.invalidate();
    },
  });

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Brain className="h-4 w-4 text-cyan-500" /> AI Catalog
          {catalogImports.length > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5">
              {catalogImports.length}
            </Badge>
          )}
        </h2>
        <Button size="sm" className="h-7 text-xs px-3" onClick={() => setShowPicker(true)}>
          <Download className="h-3 w-3 mr-1" /> Import AI Types
        </Button>
      </div>

      {/* Imported items or empty state */}
      {catalogImports.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <Brain className="h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm mb-1">No AI assets imported</p>
          <p className="text-xs opacity-60 mb-3">
            Import agents, LLMs, and bots from the AI Types Catalog
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowPicker(true)}
          >
            <Download className="h-3 w-3 mr-1" /> Import AI Types
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {catalogImports.map((item: any) => (
            <Card key={item.id} className="hover:border-cyan-500/30 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                      {item.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
                      {item.entryType}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex flex-wrap gap-1">
                    {((item.tags as string[]) || []).slice(0, 2).map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-[8px] px-1 py-0">
                        {tag}
                      </Badge>
                    ))}
                    {item.category && (
                      <Badge variant="outline" className="text-[8px] px-1 py-0">
                        {item.category}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMutation.mutate({ id: item.id })}
                    title="Remove import"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Catalog Picker Modal */}
      <CatalogPickerModal
        open={showPicker}
        onOpenChange={setShowPicker}
        importedIds={catalogImports.map((i: any) => i.catalogEntryId)}
        search={pickerSearch}
        onSearchChange={setPickerSearch}
        tab={pickerTab}
        onTabChange={setPickerTab}
        onImport={(entry: any) => {
          importMutation.mutate({
            catalogEntryId: Number(entry.id),
            entryType: String(entry.entryType || "agent"),
            name: String(entry.displayName || entry.name || "Unknown"),
            description: String(entry.description ?? ""),
            category: String(entry.category ?? ""),
            tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
            config:
              entry.config && typeof entry.config === "object" && !Array.isArray(entry.config)
                ? entry.config
                : {},
          });
        }}
        isImporting={importMutation.isPending}
      />
    </div>
  );
}

// ── Catalog Picker Modal ────────────────────────────────────────────────

function CatalogPickerModal({
  open,
  onOpenChange,
  importedIds,
  search,
  onSearchChange,
  tab,
  onTabChange,
  onImport,
  isImporting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importedIds: number[];
  search: string;
  onSearchChange: (s: string) => void;
  tab: string;
  onTabChange: (t: string) => void;
  onImport: (entry: any) => void;
  isImporting: boolean;
}) {
  const { entries, isLoading } = useCatalogEntries();

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (tab !== "all") {
      result = result.filter((e: any) => e.entryType === tab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e: any) =>
          (e.name || "").toLowerCase().includes(q) ||
          (e.displayName || "").toLowerCase().includes(q) ||
          (e.description || "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [entries, tab, search]);

  const TABS = useMemo(() => {
    // Derive unique entry types from actual catalog entries, fall back to taxonomy
    const typesInCatalog = new Set(entries.map((e: any) => e.entryType));
    const allTypes = typesInCatalog.size > 0
      ? ENTRY_TYPES.filter((t) => typesInCatalog.has(t))
      : [...ENTRY_TYPES];
    return [
      { key: "all", label: "All" },
      ...allTypes.map((t) => ({
        key: t,
        label: ENTRY_TYPE_DEFS[t]?.label || t,
      })),
    ];
  }, [entries]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh]">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-500" /> Import AI Types
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search catalog entries..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <Button
              key={t.key}
              variant={tab === t.key ? "default" : "outline"}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => onTabChange(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {/* Entries */}
        <ScrollArea className="max-h-[45vh]">
          <div className="space-y-2 pr-2">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading catalog...
              </div>
            )}
            {!isLoading && filteredEntries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No catalog entries match this filter.
              </p>
            )}
            {filteredEntries.map((entry: any) => {
              const isImported = importedIds.includes(entry.id);
              return (
                <Card key={entry.id} className="hover:border-cyan-500/30 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">
                          {entry.displayName || entry.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                          {entry.description || "No description"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
                          {entry.entryType}
                        </Badge>
                        {isImported ? (
                          <Badge variant="secondary" className="text-[9px] px-1.5">
                            Imported
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => onImport(entry)}
                            disabled={isImporting}
                          >
                            {isImporting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Download className="h-3 w-3 mr-1" /> Import
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {entry.category && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0">
                          {entry.category}
                        </Badge>
                      )}
                      {((entry.tags as string[]) || []).slice(0, 3).map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-[8px] px-1 py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
