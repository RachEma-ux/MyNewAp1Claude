import { useRoute, useLocation } from "wouter";
import { Cloud, Database, Package, Bot, MessageSquare, Layers, Search, ChevronRight, Shield, Zap, Tag, Clock, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { useCatalogEntries } from "@/hooks/useCatalogEntries";
import type { EntryType } from "@shared/catalog-taxonomy";
import { useState } from "react";

const typesMeta: Record<string, { label: string; entryType: EntryType; icon: React.ReactNode; description: string }> = {
  providers: { label: "Providers", entryType: "provider", icon: <Cloud className="h-5 w-5" />, description: "LLM API providers (OpenAI, Anthropic, Google, Ollama...)" },
  llms: { label: "LLMs", entryType: "llm", icon: <Database className="h-5 w-5" />, description: "Large Language Models registered in the catalog" },
  models: { label: "Models", entryType: "model", icon: <Package className="h-5 w-5" />, description: "Specific model versions and configurations" },
  agents: { label: "Agents", entryType: "agent", icon: <Bot className="h-5 w-5" />, description: "AI agents with cognitive loops, tools, and governance" },
  bots: { label: "Bots", entryType: "bot", icon: <MessageSquare className="h-5 w-5" />, description: "Conversational bots and assistants" },
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  draft: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  deprecated: "bg-red-500/15 text-red-400 border-red-500/30",
  disabled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const statusIcons: Record<string, React.ReactNode> = {
  active: <CheckCircle2 className="h-3 w-3" />,
  draft: <Clock className="h-3 w-3" />,
  deprecated: <AlertCircle className="h-3 w-3" />,
  disabled: <XCircle className="h-3 w-3" />,
};

export default function AITypesPage() {
  const [, params] = useRoute("/ai-types/:type");
  const [, navigate] = useLocation();
  const type = params?.type || "agents";
  const meta = typesMeta[type] || typesMeta.agents;
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { entries, isLoading } = useCatalogEntries({ entryType: meta.entryType });

  const filtered = entries.filter((e: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.name?.toLowerCase().includes(q) ||
      e.displayName?.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q) ||
      e.category?.toLowerCase().includes(q) ||
      (e.tags || []).some((t: string) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-6 p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
          {meta.icon}
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI Types — {meta.label}</h1>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1 overflow-x-auto">
        {Object.entries(typesMeta).map(([key, m]) => (
          <button
            key={key}
            onClick={() => navigate(`/ai-types/${key}`)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              key === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={`Search ${meta.label.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-muted/40 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            {meta.icon}
          </div>
          <p className="text-muted-foreground text-sm">
            {search ? `No ${meta.label.toLowerCase()} matching "${search}"` : `No ${meta.label.toLowerCase()} registered yet`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{filtered.length} {meta.label.toLowerCase()} registered</p>

          {filtered.map((entry: any) => {
            const isExpanded = expandedId === entry.id;
            const config = entry.config || {};
            const tags = entry.tags || [];
            const capabilities = entry.capabilities || [];

            return (
              <div
                key={entry.id}
                className="border border-border rounded-xl bg-card overflow-hidden"
              >
                {/* Entry header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 shrink-0">
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{entry.displayName || entry.name}</span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusColors[entry.status] || statusColors.draft}`}>
                        {statusIcons[entry.status]}
                        {entry.status}
                      </span>
                      {entry.category && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {entry.category}
                        </span>
                      )}
                      {entry.subCategory && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          {entry.subCategory}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.description || entry.name}</p>
                  </div>
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4 bg-muted/10">
                    {/* Identity */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Catalog ID</span>
                        <p className="font-mono text-foreground mt-0.5">{entry.name}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Entry Type</span>
                        <p className="text-foreground mt-0.5 capitalize">{entry.entryType}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Scope</span>
                        <p className="text-foreground mt-0.5 capitalize">{entry.scope || "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Origin</span>
                        <p className="text-foreground mt-0.5 capitalize">{entry.origin || "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Review State</span>
                        <p className="text-foreground mt-0.5 capitalize">{entry.reviewState || "—"}</p>
                      </div>
                      {config.version && (
                        <div>
                          <span className="text-muted-foreground">Version</span>
                          <p className="text-foreground mt-0.5">{config.version}</p>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {entry.description && (
                      <div>
                        <span className="text-xs text-muted-foreground">Description</span>
                        <p className="text-sm text-foreground mt-1">{entry.description}</p>
                      </div>
                    )}

                    {/* Capabilities */}
                    {capabilities.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> Capabilities</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {capabilities.map((cap: string) => (
                            <span key={cap} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {cap.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tags */}
                    {tags.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Tag className="h-3 w-3" /> Tags</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {tags.map((tag: string) => (
                            <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-500/10 text-zinc-300 border border-zinc-500/20">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Enforcement Overlay (for agents) */}
                    {config.enforcementOverlay && (
                      <div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> Enforcement Overlay</span>
                        <div className="mt-1.5 space-y-1">
                          {config.enforcementOverlay.requireHumanReview && (
                            <p className="text-[11px] text-yellow-400">Requires human review for all outputs</p>
                          )}
                          {config.enforcementOverlay.deny?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {config.enforcementOverlay.deny.map((d: string) => (
                                <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20">
                                  {d}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Taxonomy Classification (for agents) */}
                    {config.taxonomyClassification && (
                      <div>
                        <span className="text-xs text-muted-foreground">Taxonomy Classification (9-Axis)</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                          {Object.entries(config.taxonomyClassification).map(([axis, value]) => (
                            <div key={axis} className="flex items-center gap-2 text-[11px]">
                              <span className="text-muted-foreground capitalize">{axis.replace(/_/g, " ")}:</span>
                              <span className="text-foreground font-mono">
                                {Array.isArray(value) ? (value as string[]).join(", ") : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cognitive Loop (for agents) */}
                    {config.cognitiveLoop && (
                      <div>
                        <span className="text-xs text-muted-foreground">Cognitive Loop</span>
                        <div className="grid grid-cols-2 gap-2 mt-1.5">
                          {Object.entries(config.cognitiveLoop).map(([phase, desc]) => (
                            <div key={phase} className="text-[11px]">
                              <span className="text-primary font-medium capitalize">{phase}</span>
                              <p className="text-muted-foreground mt-0.5">{String(desc)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Artifact Types (for agents) */}
                    {config.artifactTypes?.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground">Artifact Types</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {config.artifactTypes.map((at: string) => (
                            <span key={at} className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {at.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="flex gap-4 text-[10px] text-muted-foreground pt-2 border-t border-border/50">
                      {entry.createdAt && <span>Created: {new Date(entry.createdAt).toLocaleDateString()}</span>}
                      {entry.updatedAt && <span>Updated: {new Date(entry.updatedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
