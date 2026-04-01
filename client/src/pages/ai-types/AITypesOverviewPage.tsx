/**
 * AI Types Overview — Module landing page
 *
 * Shows summary cards for all 5 entry types, health metrics,
 * quick links to taxonomy/relationships/validation, and recent activity.
 */
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  Cloud,
  Database,
  Package,
  Bot,
  MessageSquare,
  Layers,
  GitBranch,
  ShieldCheck,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const typeCards = [
  { key: "providers", label: "Providers", icon: Cloud, color: "text-blue-400", route: "/ai-types/providers" },
  { key: "llms", label: "LLMs", icon: Database, color: "text-purple-400", route: "/ai-types/llms" },
  { key: "models", label: "Models", icon: Package, color: "text-emerald-400", route: "/ai-types/models" },
  { key: "agents", label: "Agents", icon: Bot, color: "text-orange-400", route: "/ai-types/agents" },
  { key: "bots", label: "Bots", icon: MessageSquare, color: "text-pink-400", route: "/ai-types/bots" },
];

const quickLinks = [
  { label: "Taxonomy", icon: Layers, description: "Browse classification tree", route: "/ai-types/taxonomy" },
  { label: "Relationships", icon: GitBranch, description: "Cross-type dependency graph", route: "/ai-types/relationships" },
  { label: "Validation", icon: ShieldCheck, description: "Completeness checks", route: "/ai-types/validation" },
];

export default function AITypesOverviewPage() {
  const [, navigate] = useLocation();
  const { data: registryData, isLoading: regLoading } = trpc.aiTypes.registry.bundle.useQuery();
  const { data: validationSummary } = trpc.aiTypes.validation.summary.useQuery();
  const { data: relSummary } = trpc.aiTypes.relationships.summary.useQuery();

  // Count entries by type from registry bundle
  const typeCounts: Record<string, number> = {};
  if (registryData?.entries) {
    for (const entry of registryData.entries) {
      const t = (entry as any).entryType || "unknown";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">AI Types</h1>
        <p className="text-sm text-zinc-500">
          Central authority for all AI catalog entries — providers, LLMs, models, agents, and bots.
        </p>
      </div>

      {/* Entry type cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {typeCards.map(({ key, label, icon: Icon, color, route }) => (
          <Card
            key={key}
            className="bg-zinc-900/50 border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors"
            onClick={() => navigate(route)}
          >
            <CardContent className="pt-4 pb-3 text-center">
              <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
              {regLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto text-zinc-600" />
              ) : (
                <div className="text-2xl font-bold text-zinc-100">{typeCounts[key === "providers" ? "provider" : key === "llms" ? "llm" : key === "models" ? "model" : key === "agents" ? "agent" : "bot"] || 0}</div>
              )}
              <div className="text-xs text-zinc-500">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health + Relationships summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {validationSummary && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Health Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-emerald-400">{validationSummary.healthPercent}%</span>
                <div className="flex gap-2 text-xs">
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                    {validationSummary.healthy} healthy
                  </Badge>
                  <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                    {validationSummary.warnings} warnings
                  </Badge>
                  <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                    {validationSummary.errors} errors
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {relSummary && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-purple-400" />
                Relationships
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-purple-400">{relSummary.totalEdges}</span>
                <span className="text-xs text-zinc-500">edges across {relSummary.totalEntries} entries</span>
              </div>
              {relSummary.byTypePair && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Object.entries(relSummary.byTypePair).map(([pair, count]) => (
                    <Badge key={pair} variant="outline" className="text-[10px] text-zinc-400 border-zinc-700">
                      {pair}: {count}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {quickLinks.map(({ label, icon: Icon, description, route }) => (
          <Card
            key={label}
            className="bg-zinc-900/50 border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors group"
            onClick={() => navigate(route)}
          >
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <Icon className="h-5 w-5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-200">{label}</div>
                <div className="text-xs text-zinc-500">{description}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
