import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  Search,
  Loader2,
  Server,
  Brain,
  Package,
  Workflow,
  Bot,
  RefreshCw,
  LayoutGrid,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import {
  ENTRY_TYPES,
  ENTRY_TYPE_DEFS,
  type EntryType,
  getCategoriesForType,
  CAPABILITIES,
} from "@shared/catalog-taxonomy";

// ============================================================================
// Constants
// ============================================================================

const TYPE_ICONS: Record<EntryType, LucideIcon> = {
  provider: Server,
  llm: Brain,
  model: Package,
  agent: Workflow,
  bot: Bot,
};

const TYPE_COLORS: Record<EntryType, string> = {
  provider: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  llm: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  model: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
  agent: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  bot: "bg-pink-600/20 text-pink-400 border-pink-600/30",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-600/20 text-green-400 border-green-600/30",
  draft: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  deprecated: "bg-red-600/20 text-red-400 border-red-600/30",
  disabled: "bg-gray-600/20 text-gray-400 border-gray-600/30",
};

// ============================================================================
// Component
// ============================================================================

export default function LLMCataloguePage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeType, setActiveType] = useState<EntryType | "all">("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);


  // Primary data source: catalog entries
  const { data: entries = [], isLoading, refetch } = trpc.catalogManage.list.useQuery(
    activeType === "all" ? {} : { entryType: activeType }
  );

  // Sync from PROVIDERS registry (providers + models)
  const syncMutation = trpc.catalogManage.syncRegistry.useMutation({
    onSuccess: (result) => {
      refetch();
      if (result.providersCreated > 0 || result.modelsCreated > 0) {
        console.log(`[Catalog] Synced ${result.providersCreated} providers, ${result.modelsCreated} models`);
      }
    },
  });

  // Auto-sync on mount
  useEffect(() => {
    syncMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Computed data ----

  // Count per type (from unfiltered list)
  const { data: allEntries = [] } = trpc.catalogManage.list.useQuery({});
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allEntries.length };
    for (const t of ENTRY_TYPES) counts[t] = 0;
    for (const e of allEntries) {
      if (counts[e.entryType] !== undefined) counts[e.entryType]++;
    }
    return counts;
  }, [allEntries]);

  // Category chips for current type
  const categoryChips = useMemo(() => {
    if (activeType === "all") return [];
    const catMap = getCategoriesForType(activeType);
    return Object.entries(catMap).map(([key, def]) => ({
      key,
      label: def.label,
      count: entries.filter((e) => e.category === key).length,
    }));
  }, [activeType, entries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (activeCategory) {
      result = result.filter((e) => e.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.displayName ?? "").toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, activeCategory, searchQuery]);

  // Reset category when type changes
  useEffect(() => {
    setActiveCategory(null);
  }, [activeType]);

  // ---- Render ----

  return (
    <div className="container mx-auto py-8 max-w-6xl px-4">
      {/* Navigation */}
      <div className="flex gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/llm")}>
          <ChevronLeft className="h-4 w-4 mr-1" />Back to LLM
        </Button>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catalogue</h1>
          <p className="text-muted-foreground mt-1">
            Unified view of all catalog entries — providers, LLMs, models, agents &amp; bots
          </p>
        </div>
        <Button onClick={() => navigate("/llm/catalogue/manage")}>
          <LayoutGrid className="h-4 w-4 mr-1" />Manage
        </Button>
      </div>

      {/* Sync + Architectural Stack Banner */}
      <div className="flex justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          Sync
        </Button>
      </div>

      {/* Architectural Stack Banner */}
      <Card className="mb-6 border-dashed">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground flex-wrap">
            {ENTRY_TYPES.map((t, i) => {
              const Icon = TYPE_ICONS[t];
              const def = ENTRY_TYPE_DEFS[t];
              return (
                <span key={t} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight className="h-3 w-3 mx-1 text-muted-foreground/50" />}
                  <Icon className="h-3.5 w-3.5" />
                  <span className="font-medium">{def.label}</span>
                  <span className="text-xs opacity-60">({def.abstractionLevel})</span>
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid gap-2 grid-cols-5 mb-6">
        {ENTRY_TYPES.map((t) => {
          const Icon = TYPE_ICONS[t];
          const def = ENTRY_TYPE_DEFS[t];
          const count = typeCounts[t] ?? 0;
          return (
            <Card
              key={t}
              className={`cursor-pointer transition-colors hover:bg-accent/50 ${activeType === t ? "ring-1 ring-primary" : ""}`}
              onClick={() => setActiveType(activeType === t ? "all" : t)}
            >
              <CardContent className="py-2 px-3 text-center">
                <Icon className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
                <p className="text-lg font-bold leading-tight">{count}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{def.label}s</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Type Tabs */}
      <Tabs
        value={activeType}
        onValueChange={(v) => setActiveType(v as EntryType | "all")}
        className="mb-4"
      >
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0">
          <TabsTrigger value="all" className="data-[state=active]:bg-accent">
            All <Badge variant="secondary" className="ml-1 text-xs px-1.5">{typeCounts.all}</Badge>
          </TabsTrigger>
          {ENTRY_TYPES.map((t) => {
            const Icon = TYPE_ICONS[t];
            const def = ENTRY_TYPE_DEFS[t];
            return (
              <TabsTrigger key={t} value={t} className="data-[state=active]:bg-accent">
                <Icon className="h-3.5 w-3.5 mr-1" />
                {def.label}
                <Badge variant="secondary" className="ml-1 text-xs px-1.5">{typeCounts[t] ?? 0}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Category Filter Chips */}
      {categoryChips.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <Badge
            variant={activeCategory === null ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setActiveCategory(null)}
          >
            All
          </Badge>
          {categoryChips.map((chip) => (
            <Badge
              key={chip.key}
              variant={activeCategory === chip.key ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setActiveCategory(activeCategory === chip.key ? null : chip.key)}
            >
              {chip.label} ({chip.count})
            </Badge>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder={`Search ${activeType === "all" ? "all entries" : ENTRY_TYPE_DEFS[activeType].label + "s"}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Separator className="mb-6" />

      {/* Entry Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredEntries.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEntries.map((entry) => {
            const entryType = entry.entryType as EntryType;
            const Icon = TYPE_ICONS[entryType] ?? Package;
            const colorClass = TYPE_COLORS[entryType] ?? TYPE_COLORS.model;
            const statusClass = STATUS_COLORS[entry.status] ?? STATUS_COLORS.draft;
            const def = ENTRY_TYPE_DEFS[entryType];
            const categories = getCategoriesForType(entryType);
            const categoryLabel = entry.category ? categories[entry.category]?.label : null;
            const caps = (entry.capabilities as string[] | null) ?? [];

            return (
              <Card
                key={entry.id}
                className="hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/llm/catalogue/manage`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{entry.displayName || entry.name}</CardTitle>
                    <Badge className={`text-xs ${colorClass}`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {def?.label ?? entryType}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs line-clamp-2">
                    {entry.description || def?.coreQuestion || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-1.5 flex-wrap">
                    {/* Status badge */}
                    <Badge className={`text-xs ${statusClass}`}>{entry.status}</Badge>

                    {/* Category badge */}
                    {categoryLabel && (
                      <Badge variant="secondary" className="text-xs">{categoryLabel}</Badge>
                    )}

                    {/* Scope */}
                    <Badge variant="outline" className="text-xs">{entry.scope}</Badge>

                    {/* Provider link indicator */}
                    {entry.providerId && (
                      <Badge variant="outline" className="text-xs">
                        <Server className="h-3 w-3 mr-0.5" />linked
                      </Badge>
                    )}

                    {/* Tags (first 2) */}
                    {(entry.tags as string[] | null)?.slice(0, 2).map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                    ))}

                    {/* Capabilities (first 3) */}
                    {caps.slice(0, 3).map((cap) => (
                      <Badge key={cap} variant="secondary" className="text-xs">
                        {CAPABILITIES[cap]?.label ?? cap}
                      </Badge>
                    ))}
                    {caps.length > 3 && (
                      <Badge variant="outline" className="text-xs">+{caps.length - 3}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">
              {searchQuery || activeCategory
                ? "No entries match your filters."
                : "No catalog entries yet."}
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate("/llm/catalogue/manage")}>
              Add entries in Manage
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
