/**
 * OutputPipelinePanel — output runs by pipeline.
 *
 * Lists `data_acquisition_output_runs` grouped by output pipeline
 * (rag, graphrag, analytics, warehouse, alerts, reports, …) so
 * operators can see which downstream destinations have been hit and
 * which have failed/degraded.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  pending: "outline",
  running: "outline",
  failed: "destructive",
  degraded: "destructive",
};

export function OutputPipelinePanel() {
  const outputs = trpc.dataAnalysis.dataAcquisition.listOutputRuns.useQuery({});
  if (outputs.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const rows = outputs.data ?? [];
  const byPipeline = new Map<string, any[]>();
  for (const r of rows) {
    const key = (r as any).outputType ?? (r as any).pipeline ?? "unknown";
    const arr = byPipeline.get(key) ?? [];
    arr.push(r);
    byPipeline.set(key, arr);
  }
  const groups = Array.from(byPipeline.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Output Pipelines</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No output runs yet — RAG / GraphRAG / analytics / warehouse /
            alerts / reports are all hooked but idle.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(([pipeline, runs]) => (
              <div key={pipeline} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm capitalize">
                    {pipeline}
                  </span>
                  <Badge variant="outline">{runs.length}</Badge>
                </div>
                <div className="space-y-1">
                  {runs.map((r: any) => (
                    <div
                      key={r.id}
                      className="border rounded p-2 text-sm flex items-center justify-between"
                    >
                      <span>
                        run #{r.id}
                        {r.itemId ? ` · item #${r.itemId}` : ""}
                      </span>
                      <Badge variant={STATUS_BADGE[r.status] ?? "secondary"}>
                        {r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
