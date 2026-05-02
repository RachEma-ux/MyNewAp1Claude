import { trpc } from "@/lib/trpc";
import { GitBranch, ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const typeColors: Record<string, string> = {
  provider: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  llm: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  model: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  agent: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  bot: "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

const relationLabels: Record<string, string> = {
  uses_provider: "uses provider",
  uses_model: "uses model",
  wraps_agent: "wraps agent",
  source_agent: "source agent",
  provided_by: "provided by",
};

export default function AITypesRelationshipsPage() {
  const { data: graph, isLoading } = trpc.aiTypes.relationships.graph.useQuery();
  const { data: summary } = trpc.aiTypes.relationships.summary.useQuery();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <GitBranch className="h-6 w-6 text-purple-400" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">AI Types Relationships</h1>
          <p className="text-sm text-zinc-500">Cross-type dependency graph — Provider → Model → Agent → Bot</p>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-zinc-100">{summary.totalEntries}</div>
              <div className="text-xs text-zinc-500">Total Entries</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-purple-400">{summary.totalEdges}</div>
              <div className="text-xs text-zinc-500">Relationships</div>
            </CardContent>
          </Card>
          {Object.entries(summary.byTypePair || {}).slice(0, 2).map(([pair, count]) => (
            <Card key={pair} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold text-zinc-200">{count}</div>
                <div className="text-xs text-zinc-500 truncate">{pair}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edge list */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-400">
            Dependency Edges ({graph?.edges.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {graph?.edges.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No relationships detected.</p>
          ) : (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {graph?.edges.map((edge, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-800/50">
                  <Badge variant="outline" className={`text-xs ${typeColors[edge.sourceType] || ""}`}>
                    {edge.sourceType}
                  </Badge>
                  <span className="text-sm text-zinc-200 truncate max-w-[150px]">{edge.sourceName}</span>
                  <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
                  <span className="text-xs text-zinc-500 shrink-0">
                    {relationLabels[edge.relation] || edge.relation}
                  </span>
                  <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
                  <Badge variant="outline" className={`text-xs ${typeColors[edge.targetType] || ""}`}>
                    {edge.targetType}
                  </Badge>
                  <span className="text-sm text-zinc-200 truncate max-w-[150px]">{edge.targetName}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
