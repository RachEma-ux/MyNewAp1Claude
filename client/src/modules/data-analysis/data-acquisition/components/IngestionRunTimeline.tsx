/**
 * IngestionRunTimeline — per-run vertical timeline of acquisition runs.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "outline",
  pending: "outline",
  failed: "destructive",
  cancelled: "secondary",
  degraded: "destructive",
};

export function IngestionRunTimeline() {
  const runs = trpc.dataAnalysis.dataAcquisition.listRuns.useQuery({});
  if (runs.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const rows = runs.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Acquisition Runs</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No runs yet.
          </p>
        ) : (
          <ol className="relative border-l border-border ml-3 space-y-4">
            {rows.map((r: any) => (
              <li key={r.id} className="ml-4">
                <span className="absolute -left-1.5 mt-2 h-3 w-3 rounded-full bg-primary" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      Run #{r.id} · source {r.sourceId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.runType} · items={r.itemCount} · processed={r.processedCount}
                      {r.errorMessage ? ` · ${r.errorMessage}` : ""}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[r.status] ?? "secondary"}>
                    {r.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
