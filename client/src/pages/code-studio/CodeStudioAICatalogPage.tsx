/**
 * Code Studio AI Catalog — Import AI Types into Code Studio (cloned from PSM AI Catalog).
 * Uses codeStudio.catalogImports tRPC router (CODEDB-backed).
 */
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Brain, Download, Search, Trash2, Loader2, ArrowLeft, CheckSquare, Square } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCatalogEntries } from "@/hooks/useCatalogEntries";
import { ENTRY_TYPES, ENTRY_TYPE_DEFS } from "@shared/catalog-taxonomy";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
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

  // Model selection step state
  const [modelSelectionProvider, setModelSelectionProvider] = useState<any>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<number>>(new Set());
  const [importingModels, setImportingModels] = useState(false);

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

  // Models belonging to the selected provider
  const providerModels = useMemo(() => {
    if (!modelSelectionProvider) return [];
    const providerId = modelSelectionProvider.name || modelSelectionProvider.config?.providerId;
    return entries.filter(
      (e: any) => e.entryType === "model" && e.config?.providerId === providerId,
    );
  }, [entries, modelSelectionProvider]);

  const TABS = useMemo(() => {
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

  const handleProviderImportClick = (entry: any) => {
    if (entry.entryType === "provider") {
      // Show model selection step
      setModelSelectionProvider(entry);
      setSelectedModelIds(new Set());
    } else {
      // Non-provider: one-click import
      onImport(entry);
    }
  };

  const toggleModel = (id: number) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllModels = () => {
    const importable = providerModels.filter((m: any) => !importedIds.includes(m.id));
    setSelectedModelIds(new Set(importable.map((m: any) => m.id)));
  };

  const deselectAllModels = () => setSelectedModelIds(new Set());

  const handleImportProviderAndModels = async () => {
    if (!modelSelectionProvider) return;
    setImportingModels(true);
    try {
      // Import the provider first
      if (!importedIds.includes(modelSelectionProvider.id)) {
        onImport(modelSelectionProvider);
        // Small delay to let the mutation settle
        await new Promise((r) => setTimeout(r, 300));
      }
      // Import selected models
      for (const modelId of selectedModelIds) {
        const model = providerModels.find((m: any) => m.id === modelId);
        if (model) {
          onImport(model);
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    } finally {
      setImportingModels(false);
      setModelSelectionProvider(null);
    }
  };

  const handleBack = () => {
    setModelSelectionProvider(null);
    setSelectedModelIds(new Set());
  };

  // Reset model selection when modal closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setModelSelectionProvider(null);
      setSelectedModelIds(new Set());
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh]">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-500" />
            {modelSelectionProvider
              ? `Select Models — ${modelSelectionProvider.displayName || modelSelectionProvider.name}`
              : "Import AI Types"}
          </DialogTitle>
        </DialogHeader>

        {modelSelectionProvider ? (
          /* ── Model Selection Step ── */
          <>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={handleBack}>
                <ArrowLeft className="h-3 w-3 mr-1" /> Back to Catalog
              </Button>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={selectAllModels}>
                  <CheckSquare className="h-3 w-3 mr-1" /> All
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={deselectAllModels}>
                  <Square className="h-3 w-3 mr-1" /> None
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[40vh] pr-1">
              <div className="space-y-1.5">
                {providerModels.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No models found for this provider.
                  </p>
                ) : (
                  providerModels.map((model: any) => {
                    const alreadyImported = importedIds.includes(model.id);
                    const isSelected = selectedModelIds.has(model.id);
                    return (
                      <div
                        key={model.id}
                        className={`flex items-center gap-3 p-2.5 rounded border transition-colors cursor-pointer ${
                          alreadyImported
                            ? "opacity-60 border-muted bg-muted/20"
                            : isSelected
                              ? "border-cyan-500/50 bg-cyan-500/5"
                              : "border-border hover:border-cyan-500/30"
                        }`}
                        onClick={() => !alreadyImported && toggleModel(model.id)}
                      >
                        <Checkbox
                          checked={alreadyImported || isSelected}
                          disabled={alreadyImported}
                          onCheckedChange={() => !alreadyImported && toggleModel(model.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{model.displayName || model.name}</p>
                          {model.config?.contextLength && (
                            <p className="text-[10px] text-muted-foreground">
                              Context: {(model.config.contextLength / 1000).toFixed(0)}K tokens
                            </p>
                          )}
                        </div>
                        {alreadyImported && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 shrink-0">
                            Imported
                          </Badge>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-muted-foreground">
                {selectedModelIds.size} model{selectedModelIds.size !== 1 ? "s" : ""} selected
              </p>
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                onClick={handleImportProviderAndModels}
                disabled={importingModels}
              >
                {importingModels ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Download className="h-3 w-3 mr-1" />
                )}
                Import Provider{selectedModelIds.size > 0 ? ` + ${selectedModelIds.size} Model${selectedModelIds.size !== 1 ? "s" : ""}` : ""}
              </Button>
            </div>
          </>
        ) : (
          /* ── Catalog List (original) ── */
          <>
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
            <div className="flex items-center gap-1 flex-wrap">
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
                                onClick={() => handleProviderImportClick(entry)}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
