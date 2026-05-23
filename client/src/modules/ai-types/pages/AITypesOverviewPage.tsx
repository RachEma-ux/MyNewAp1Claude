/**
 * AI Types Overview — Module landing page
 *
 * Shows summary cards for all 5 entry types, health metrics,
 * quick links to taxonomy/relationships/validation, and recent activity.
 *
 * Consumes: trpc.aiTypes.orchestration.overview (single aggregated query)
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
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const typeCards = [
  { key: "provider", label: "Providers", icon: Cloud, color: "text-blue-400", route: "/ai-types/providers" },
  { key: "llm", label: "LLMs", icon: Database, color: "text-purple-400", route: "/ai-types/llms" },
  { key: "model", label: "Models", icon: Package, color: "text-emerald-400", route: "/ai-types/models" },
  { key: "agent", label: "Agents", icon: Bot, color: "text-orange-400", route: "/ai-types/agents" },
  { key: "bot", label: "Bots", icon: MessageSquare, color: "text-pink-400", route: "/ai-types/bots" },
];

const quickLinks = [
  { label: "Taxonomy", icon: Layers, description: "Browse classification tree", route: "/ai-types/taxonomy" },
  { label: "Relationships", icon: GitBranch, description: "Cross-type dependency graph", route: "/ai-types/relationships" },
  { label: "Validation", icon: ShieldCheck, description: "Completeness checks", route: "/ai-types/validation" },
];

export default function AITypesOverviewPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.aiTypes.orchestration.overview.useQuery();

  const backfillMut = trpc.aiTypes.migration.backfillDomainTables.useMutation({
    onSuccess: (result) => {
      const created =
        result.modelsCreated +
        result.llmsCreated +
        result.providersLinked +
        result.agentsLinked;
      toast.success(
        created > 0
          ? `Backfill complete — ${result.modelsCreated} models, ${result.llmsCreated} llms, ${result.providersLinked} providers linked`
          : result.scanned > 0
            ? `Backfill scanned ${result.scanned} unlinked entries but created none (partial-shape rows)`
            : "Backfill ran — everything was already linked",
      );
      void utils.aiTypes.orchestration.overview.invalidate();
    },
    onError: (err) => {
      toast.error(`Backfill failed: ${err.message}`);
    },
  });

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
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto text-zinc-600" />
              ) : (
                <div className="text-2xl font-bold text-zinc-100">{data?.typeCounts[key] || 0}</div>
              )}
              <div className="text-xs text-zinc-500">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health + Relationships summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {data?.healthSummary && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Health Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-emerald-400">{data.healthSummary.healthPercent}%</span>
                <div className="flex gap-2 text-xs">
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                    {data.healthSummary.healthy} healthy
                  </Badge>
                  <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                    {data.healthSummary.warnings} warnings
                  </Badge>
                  <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                    {data.healthSummary.errors} errors
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {data?.relationshipSummary && (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-purple-400" />
                Relationships
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-purple-400">{data.relationshipSummary.totalEdges}</span>
                <span className="text-xs text-zinc-500">edges across {data.healthSummary.total} entries</span>
              </div>
              {data.relationshipSummary.byTypePair && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Object.entries(data.relationshipSummary.byTypePair).map(([pair, count]) => (
                    <Badge key={pair} variant="outline" className="text-[10px] text-zinc-400 border-zinc-700">
                      {pair}: {count as number}
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

      {/* Admin actions — domain-table backfill. The fn is idempotent
          per its server-side doc-comment, so this button is safe to
          press repeatedly. Boot also invokes the same migration on
          dev-server start; this surface is for after-the-fact
          operator-triggered re-runs (e.g. when new catalog_entries
          rows have been inserted since boot). */}
      <Card
        className="bg-zinc-900/50 border-zinc-800 mt-6"
        data-testid="ai-types-overview-admin-actions"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-amber-400" />
            Admin actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => backfillMut.mutate()}
              disabled={backfillMut.isPending}
              data-testid="ai-types-backfill-button"
            >
              {backfillMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Backfilling…
                </>
              ) : (
                "Backfill domain tables"
              )}
            </Button>
            <p className="text-xs text-zinc-500 flex-1">
              Re-runs the catalog → domain backfill. Creates{" "}
              <code>ai_type_models</code> / <code>ai_type_llms</code>{" "}
              rows from <code>catalog_entries</code> that lack a
              source link. Idempotent — already-linked entries are
              skipped.
            </p>
          </div>

          {backfillMut.data && (
            <div
              className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs"
              data-testid="ai-types-backfill-result"
            >
              <Badge
                variant="outline"
                className="bg-zinc-800/50 text-zinc-300 border-zinc-700 justify-between"
              >
                <span>scanned</span>
                <span className="font-mono">{backfillMut.data.scanned}</span>
              </Badge>
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 justify-between"
              >
                <span>models created</span>
                <span className="font-mono">{backfillMut.data.modelsCreated}</span>
              </Badge>
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 justify-between"
              >
                <span>llms created</span>
                <span className="font-mono">{backfillMut.data.llmsCreated}</span>
              </Badge>
              <Badge
                variant="outline"
                className="bg-blue-500/10 text-blue-300 border-blue-500/30 justify-between"
              >
                <span>providers linked</span>
                <span className="font-mono">{backfillMut.data.providersLinked}</span>
              </Badge>
              <Badge
                variant="outline"
                className="bg-blue-500/10 text-blue-300 border-blue-500/30 justify-between"
              >
                <span>agents linked</span>
                <span className="font-mono">{backfillMut.data.agentsLinked}</span>
              </Badge>
              <Badge
                variant="outline"
                className="bg-zinc-800/50 text-zinc-400 border-zinc-700 justify-between"
              >
                <span>skipped</span>
                <span className="font-mono">{backfillMut.data.skipped}</span>
              </Badge>
              {backfillMut.data.errors.length > 0 && (
                <Badge
                  variant="outline"
                  className="bg-red-500/10 text-red-300 border-red-500/30 justify-between col-span-full"
                >
                  <span>errors</span>
                  <span className="font-mono">
                    {backfillMut.data.errors.length}
                  </span>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
