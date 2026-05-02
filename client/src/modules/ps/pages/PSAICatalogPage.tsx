/**
 * PS AI Catalog — Read-only browse page for AI catalog entries.
 * Cloned from SandboxWFPage AI Catalog section (lines 785–843).
 */
import { useState, useMemo } from "react";
import { Brain, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCatalogEntries } from "@/hooks/useCatalogEntries";
import type { EntryType } from "@shared/catalog-taxonomy";

const ENTRY_TYPE_TABS: { key: "all" | EntryType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "agent", label: "Agent" },
  { key: "model", label: "Model" },
  { key: "llm", label: "LLM" },
  { key: "bot", label: "Bot" },
  { key: "provider", label: "Provider" },
];

export default function PSAICatalogPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | EntryType>("all");

  const { entries, isLoading } = useCatalogEntries(
    typeFilter !== "all" ? { entryType: typeFilter } : undefined,
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e: any) =>
        (e.name || e.displayName || "").toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q) ||
        (e.category || "").toLowerCase().includes(q),
    );
  }, [entries, search]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Brain className="h-4 w-4 text-cyan-500" /> PS AI Catalog
          {filtered.length > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5">
              {filtered.length}
            </Badge>
          )}
        </h2>
      </div>

      {/* Search + type filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search catalog..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex gap-1">
          {ENTRY_TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                typeFilter === tab.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <p className="text-xs">Loading catalog...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <Brain className="h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm mb-1">No AI catalog entries</p>
          <p className="text-xs opacity-60">
            {search ? "Try a different search term" : "No entries available in the catalog"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item: any) => (
            <Card key={item.id} className="hover:border-cyan-500/30 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">
                      {item.name || item.displayName}
                    </p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                      {item.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
                      {item.entryType || item.sourceType}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center mt-2">
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
