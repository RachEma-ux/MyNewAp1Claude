import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Database, Layers, FlaskConical, Server } from "lucide-react";

export function GraphRAGOverview() {
  const { data: sources, isLoading: srcLoading } =
    trpc.dataAnalysis.graphRag.listSources.useQuery();
  const { data: syncRuns } =
    trpc.dataAnalysis.graphRag.listSyncRuns.useQuery({});
  const { data: indexRuns } =
    trpc.dataAnalysis.graphRag.listIndexRuns.useQuery({});
  const { data: workerStatus } =
    trpc.dataAnalysis.graphRag.workerStatus.useQuery();

  if (srcLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const completedIndexes = indexRuns?.filter((r) => r.status === "completed").length ?? 0;
  const totalEntities = indexRuns?.reduce((s, r) => s + (r.entityCount ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6 mt-4">
      {/* Worker Status Banner */}
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <Server className="w-5 h-5" />
          <div className="flex-1">
            <p className="text-sm font-medium">GraphRAG Worker</p>
            <p className="text-xs text-muted-foreground">
              {workerStatus?.message ?? "Checking worker status..."}
            </p>
          </div>
          <Badge variant={workerStatus?.healthy ? "default" : "secondary"}>
            {workerStatus?.healthy ? "Online" : "Offline"}
          </Badge>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4" />
              Registered Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{sources?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Module datasets available</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Sync Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{syncRuns?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total data sync operations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Index Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{completedIndexes}</p>
            <p className="text-xs text-muted-foreground">Completed index builds</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              Entities Extracted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalEntities}</p>
            <p className="text-xs text-muted-foreground">Across all indexes</p>
          </CardContent>
        </Card>
      </div>

      {/* Architecture Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Architecture</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            GraphRAG is a shared analytical engine that builds knowledge graphs from module
            datasets. Each module registers a source adapter that exports normalized documents.
          </p>
          <p>
            <strong>Module isolation:</strong> Every dataset, index, and query is scoped to a
            single module. Cross-module queries are rejected.
          </p>
          <p>
            <strong>Query modes:</strong> Basic (keyword), Local (entity-focused), Global
            (community-level), and DRIFT (dynamic reasoning).
          </p>
          <p>
            <strong>Worker:</strong> Indexing and querying are handled by a Python worker
            service using Microsoft's graphrag library.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
