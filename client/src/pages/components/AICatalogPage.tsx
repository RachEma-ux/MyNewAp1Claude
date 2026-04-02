/**
 * AI Catalog — App Component demo page
 *
 * Demonstrates the AI Catalog Import pattern (cloned from SandboxWF):
 * - Empty state with centered CTA
 * - "Import AI Types" button → picker modal
 * - Imported items as cards with remove button
 * - Modal with search, type tabs, per-item import/imported badges
 */
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
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
import { Brain, Download, Search, Trash2, Loader2 } from "lucide-react";
import { ENTRY_TYPES, ENTRY_TYPE_DEFS } from "@shared/catalog-taxonomy";

// ── Mock catalog entries for the demo (all 5 entity types) ────────────
const MOCK_CATALOG = [
  { id: 1, name: "OpenAI", entryType: "provider", description: "Cloud API provider for GPT models", category: "Cloud API", tags: ["openai", "cloud"] },
  { id: 2, name: "Anthropic", entryType: "provider", description: "Cloud API provider for Claude models", category: "Cloud API", tags: ["anthropic", "cloud"] },
  { id: 3, name: "GPT-4o", entryType: "llm", description: "OpenAI multimodal model", category: "General", tags: ["openai", "multimodal"] },
  { id: 4, name: "Claude 3.5 Sonnet", entryType: "llm", description: "Anthropic reasoning model", category: "General", tags: ["anthropic", "reasoning"] },
  { id: 5, name: "GPT-4o-2024-11-20", entryType: "model", description: "Specific GPT-4o trained snapshot", category: "Base LLM", tags: ["openai", "multimodal"] },
  { id: 6, name: "Llama 3.1 70B Q4", entryType: "model", description: "Meta open-weight model, 4-bit quantized", category: "Quantized", tags: ["meta", "gguf"] },
  { id: 7, name: "Research Agent", entryType: "agent", description: "Autonomous web research agent", category: "Research", tags: ["search", "summarize"] },
  { id: 8, name: "Data Analyst Agent", entryType: "agent", description: "SQL generation and chart agent", category: "Analytics", tags: ["sql", "charts"] },
  { id: 9, name: "Code Review Bot", entryType: "bot", description: "Automated PR reviewer", category: "DevOps", tags: ["github", "review"] },
  { id: 10, name: "Support Q&A Bot", entryType: "bot", description: "FAQ bot for internal support", category: "Support", tags: ["faq", "helpdesk"] },
];

type MockEntry = (typeof MOCK_CATALOG)[number];
type ImportedItem = MockEntry & { importId: number };

export default function AICatalogPage() {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState("all");
  const [imports, setImports] = useState<ImportedItem[]>([]);
  let nextId = imports.length + 1;

  const handleImport = (entry: MockEntry) => {
    if (imports.some((i) => i.id === entry.id)) return;
    setImports([...imports, { ...entry, importId: nextId++ }]);
  };

  const handleRemove = (id: number) => {
    setImports(imports.filter((i) => i.id !== id));
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-lg font-semibold mb-2">AI Catalog Import Pattern</h1>

      {/* ── ASCII diagram ─────────────────────────────────── */}
      <pre className="text-xs text-muted-foreground whitespace-pre font-mono bg-muted/30 rounded-lg p-4">{`EMPTY STATE:                    WITH IMPORTS:
┌──────────────────────────┐   ┌──────────────────────────┐
│ ● AI Catalog    [Import] │   │ ● AI Catalog (3) [Import]│
├──────────────────────────┤   ├──────────────────────────┤
│                          │   │ ┌─────┐ ┌─────┐ ┌─────┐ │
│     🧠  (icon)           │   │ │Name │ │Name │ │Name │ │
│  No AI assets imported   │   │ │desc │ │desc │ │desc │ │
│  Import agents, LLMs...  │   │ │tags🗑│ │tags🗑│ │tags🗑│ │
│     [Import AI Types]    │   │ └─────┘ └─────┘ └─────┘ │
│                          │   │                          │
└──────────────────────────┘   └──────────────────────────┘

PICKER MODAL:
┌────────────────────────────┐
│ 🧠 Import AI Types     [×] │
├────────────────────────────┤
│ 🔍 Search catalog...       │
│ [All][Prov][LLM][Mod][Agt][Bot]│
├────────────────────────────┤
│ ┌────────────────────────┐ │
│ │ GPT-4o        llm [Imp]│ │
│ │ OpenAI multimodal...   │ │
│ └────────────────────────┘ │
│ ┌────────────────────────┐ │
│ │ Research Agent agt [✓] │ │
│ │ Autonomous web...      │ │
│ └────────────────────────┘ │
└────────────────────────────┘`}</pre>

      <p className="text-xs text-muted-foreground">
        Pattern from <code>SandboxWFPage.tsx</code> AI Catalog section.
        Header with count badge + Import button. Empty state CTA. Card grid with type badges, tags, and remove. Modal picker with search + type tabs.
      </p>

      {/* ── Live demo ─────────────────────────────────────── */}
      <div className="border rounded-lg">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Brain className="h-4 w-4 text-cyan-500" /> AI Catalog
              {imports.length > 0 && (
                <Badge variant="secondary" className="text-[9px] px-1.5">
                  {imports.length}
                </Badge>
              )}
            </h2>
            <Button size="sm" className="h-7 text-xs px-3" onClick={() => setShowPicker(true)}>
              <Download className="h-3 w-3 mr-1" /> Import AI Types
            </Button>
          </div>

          {/* Empty state or imported cards */}
          {imports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Brain className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm mb-1">No AI assets imported</p>
              <p className="text-xs opacity-60 mb-3">
                Import agents, LLMs, and bots from the AI Types Catalog
              </p>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowPicker(true)}>
                <Download className="h-3 w-3 mr-1" /> Import AI Types
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {imports.map((item) => (
                <Card key={item.id} className="hover:border-cyan-500/30 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                          {item.description}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize shrink-0 ml-2">
                        {item.entryType}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex flex-wrap gap-1">
                        {item.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[8px] px-1 py-0">{tag}</Badge>
                        ))}
                        {item.category && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0">{item.category}</Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemove(item.id)}
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
        </div>
      </div>

      {/* Picker modal */}
      <DemoPickerModal
        open={showPicker}
        onOpenChange={setShowPicker}
        importedIds={imports.map((i) => i.id)}
        search={pickerSearch}
        onSearchChange={setPickerSearch}
        tab={pickerTab}
        onTabChange={setPickerTab}
        onImport={handleImport}
      />

      {/* ── Source Code ──────────────────────────────────────── */}
      <h2 className="text-sm font-semibold mt-6 mb-2">Source Code</h2>
      <pre className="text-[10px] leading-relaxed text-muted-foreground whitespace-pre overflow-x-auto font-mono bg-muted/30 rounded-lg p-4">{`/**
 * AI Catalog Import Pattern
 *
 * Cloned from SandboxWFPage.tsx AI Catalog section.
 *
 * PATTERN RULES:
 * - Header: title with Brain icon + count Badge + "Import AI Types" Button
 * - Empty state: centered Brain icon (opacity-20), message, CTA button
 * - Card grid: 1/2/3 cols responsive
 *   - Each card: name (xs semibold), description (10px muted, line-clamp-2)
 *   - Top-right: entryType Badge (outline, 9px, capitalize)
 *   - Bottom: tags + category as Badges (8px) | Trash2 remove button
 *   - Hover: border-cyan-500/30
 *
 * - Picker Modal (Dialog):
 *   - DialogTitle: Brain icon + "Import AI Types"
 *   - Search Input: h-8, pl-8, Search icon overlay
 *   - Tab buttons: derived dynamically from ENTRY_TYPES (Provider / LLM / Model / Agent / Bot)
 *     variant="default" for active, "outline" for inactive
 *     h-6, text-[10px], px-2
 *   - Entry list in ScrollArea (max-h-[45vh]):
 *     - Card per entry with name, description, entryType badge
 *     - "Imported" Badge (secondary) if already imported
 *     - "Import" Button (outline, h-6) if not imported
 *     - Tags row at bottom
 *
 * DATA MODEL (DB table — e.g. prm_catalog_imports):
 *   id             SERIAL PRIMARY KEY
 *   catalog_entry_id INTEGER NOT NULL   -- FK to main catalog
 *   entry_type     VARCHAR(20) NOT NULL -- agent|llm|bot|model|provider
 *   name           VARCHAR(255) NOT NULL
 *   description    TEXT DEFAULT ''
 *   category       VARCHAR(50) DEFAULT ''
 *   tags           JSON DEFAULT '[]'
 *   config         JSON DEFAULT '{}'
 *   status         VARCHAR(20) DEFAULT 'active'  -- soft-delete via 'removed'
 *   created_at     TIMESTAMP DEFAULT now()
 *
 * tRPC ROUTER (3 endpoints):
 *   list    — SELECT WHERE status='active' ORDER BY id
 *   import  — INSERT (with duplicate check on catalog_entry_id + status='active')
 *   remove  — UPDATE SET status='removed' WHERE id=$1
 *
 * FRONTEND HOOKS:
 *   const importsQuery = trpc.<module>.catalogImports.list.useQuery();
 *   const importMutation = trpc.<module>.catalogImports.import.useMutation({
 *     onSuccess: () => utils.<module>.catalogImports.list.invalidate()
 *   });
 *   const removeMutation = trpc.<module>.catalogImports.remove.useMutation({
 *     onSuccess: () => utils.<module>.catalogImports.list.invalidate()
 *   });
 *
 * PICKER MODAL uses useCatalogEntries() hook to fetch from main AI catalog.
 */

// ── Imports ─────────────────────────────────────────────
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Brain, Download, Search, Trash2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCatalogEntries } from "@/hooks/useCatalogEntries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ── Component ───────────────────────────────────────────
export default function AICatalogPage() {
  const utils = trpc.useUtils();
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState("all");

  // Replace <module> with your tRPC namespace (e.g. prm, sandboxWf)
  const importsQuery = trpc.<module>.catalogImports.list.useQuery();
  const catalogImports = importsQuery.data ?? [];

  const importMutation = trpc.<module>.catalogImports.import.useMutation({
    onSuccess: (data) => {
      utils.<module>.catalogImports.list.invalidate();
      toast.success(\`Imported "\${data?.name}" into module\`);
    },
  });

  const removeMutation = trpc.<module>.catalogImports.remove.useMutation({
    onSuccess: () => utils.<module>.catalogImports.list.invalidate(),
  });

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Brain className="h-4 w-4 text-cyan-500" /> AI Catalog
          {catalogImports.length > 0 && (
            <Badge variant="secondary"
              className="text-[9px] px-1.5">
              {catalogImports.length}
            </Badge>
          )}
        </h2>
        <Button size="sm" className="h-7 text-xs px-3"
          onClick={() => setShowPicker(true)}>
          <Download className="h-3 w-3 mr-1" />
          Import AI Types
        </Button>
      </div>

      {/* Empty state */}
      {catalogImports.length === 0 ? (
        <div className="flex flex-col items-center
          justify-center h-40 text-muted-foreground">
          <Brain className="h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm mb-1">No AI assets imported</p>
          <p className="text-xs opacity-60 mb-3">
            Import agents, LLMs, and bots from the AI Types Catalog
          </p>
          <Button variant="outline" size="sm"
            className="h-7 text-xs"
            onClick={() => setShowPicker(true)}>
            <Download className="h-3 w-3 mr-1" />
            Import AI Types
          </Button>
        </div>

      ) : (
        /* Imported cards grid */
        <div className="grid grid-cols-1 md:grid-cols-2
          lg:grid-cols-3 gap-3">
          {catalogImports.map((item) => (
            <Card key={item.id}
              className="hover:border-cyan-500/30
                transition-colors">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">
                      {item.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground
                      line-clamp-2 mt-0.5">
                      {item.description}
                    </p>
                  </div>
                  <Badge variant="outline"
                    className="text-[9px] px-1 py-0 capitalize
                      shrink-0 ml-2">
                    {item.entryType}
                  </Badge>
                </div>
                <div className="flex items-center
                  justify-between mt-2">
                  <div className="flex flex-wrap gap-1">
                    {(item.tags || []).slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline"
                        className="text-[8px] px-1 py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm"
                    className="h-6 w-6 p-0
                      text-muted-foreground
                      hover:text-destructive"
                    onClick={() =>
                      removeMutation.mutate({ id: item.id })}
                    title="Remove import">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Picker Modal */}
      <CatalogPickerModal
        open={showPicker}
        onOpenChange={setShowPicker}
        importedIds={catalogImports.map((i) => i.catalogEntryId)}
        search={pickerSearch}
        onSearchChange={setPickerSearch}
        tab={pickerTab}
        onTabChange={setPickerTab}
        onImport={(entry) => {
          importMutation.mutate({
            catalogEntryId: entry.id,
            entryType: entry.entryType || "agent",
            name: entry.displayName || entry.name,
            description: entry.description ?? "",
            category: entry.category ?? "",
            tags: entry.tags || [],
            config: entry.config || {},
          });
        }}
        isImporting={importMutation.isPending}
      />
    </div>
  );
}

// ── Catalog Picker Modal ────────────────────────────────
function CatalogPickerModal({ open, onOpenChange,
  importedIds, search, onSearchChange,
  tab, onTabChange, onImport, isImporting }) {

  const { entries, isLoading } = useCatalogEntries();

  const filtered = useMemo(() => {
    let result = entries;
    if (tab !== "all")
      result = result.filter((e) => e.entryType === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        (e.name || e.displayName || "")
          .toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q));
    }
    return result;
  }, [entries, tab, search]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh]">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-500" />
            Import AI Types
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2
            -translate-y-1/2 h-3.5 w-3.5
            text-muted-foreground" />
          <Input className="h-8 text-xs pl-8"
            placeholder="Search catalog entries..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)} />
        </div>

        {/* Type tabs */}
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <Button key={t.key}
              variant={tab === t.key ? "default" : "outline"}
              size="sm" className="h-6 text-[10px] px-2"
              onClick={() => onTabChange(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>

        {/* Entry list */}
        <ScrollArea className="max-h-[45vh]">
          <div className="space-y-2 pr-2">
            {filtered.map((entry) => {
              const done = importedIds.includes(entry.id);
              return (
                <Card key={entry.id}
                  className="hover:border-cyan-500/30">
                  <CardContent className="p-3">
                    <div className="flex items-start
                      justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">
                          {entry.displayName || entry.name}
                        </p>
                        <p className="text-[10px]
                          text-muted-foreground
                          line-clamp-2 mt-0.5">
                          {entry.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5
                        shrink-0 ml-2">
                        <Badge variant="outline"
                          className="text-[9px] px-1 py-0
                            capitalize">
                          {entry.entryType}
                        </Badge>
                        {done ? (
                          <Badge variant="secondary"
                            className="text-[9px] px-1.5">
                            Imported
                          </Badge>
                        ) : (
                          <Button variant="outline" size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => onImport(entry)}
                            disabled={isImporting}>
                            <Download className="h-3 w-3 mr-1" />
                            Import
                          </Button>
                        )}
                      </div>
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
}`}</pre>
    </div>
  );
}

// ── Demo Picker Modal (uses mock data, not tRPC) ────────────────────────

function DemoPickerModal({
  open,
  onOpenChange,
  importedIds,
  search,
  onSearchChange,
  tab,
  onTabChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importedIds: number[];
  search: string;
  onSearchChange: (s: string) => void;
  tab: string;
  onTabChange: (t: string) => void;
  onImport: (entry: MockEntry) => void;
}) {
  const filtered = useMemo(() => {
    let result = MOCK_CATALOG;
    if (tab !== "all") result = result.filter((e) => e.entryType === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [tab, search]);

  const TABS = useMemo(() => {
    const typesInData = new Set(MOCK_CATALOG.map((e) => e.entryType));
    const allTypes = ENTRY_TYPES.filter((t) => typesInData.has(t));
    return [
      { key: "all", label: "All" },
      ...allTypes.map((t) => ({
        key: t,
        label: ENTRY_TYPE_DEFS[t]?.label || t,
      })),
    ];
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh]">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-500" /> Import AI Types
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search catalog entries..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

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

        <ScrollArea className="max-h-[45vh]">
          <div className="space-y-2 pr-2">
            {filtered.map((entry) => {
              const isImported = importedIds.includes(entry.id);
              return (
                <Card key={entry.id} className="hover:border-cyan-500/30 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{entry.name}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                          {entry.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
                          {entry.entryType}
                        </Badge>
                        {isImported ? (
                          <Badge variant="secondary" className="text-[9px] px-1.5">Imported</Badge>
                        ) : (
                          <Button
                            variant="outline" size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => onImport(entry)}
                          >
                            <Download className="h-3 w-3 mr-1" /> Import
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {entry.category && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0">{entry.category}</Badge>
                      )}
                      {entry.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[8px] px-1 py-0">{tag}</Badge>
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
