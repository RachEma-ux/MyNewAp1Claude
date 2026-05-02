/**
 * PRM Control Panel — Analytics, maturity assessment, training, publishing controls
 */
import { trpc } from "@/lib/trpc";
import { Loader2, Settings, Activity, GraduationCap, BarChart3 } from "lucide-react";

export default function PRMControlPanelPage() {
  const { data: health } = trpc.prm.health.useQuery();
  const { data: maturityHistory } = trpc.prm.maturity.getHistory.useQuery(undefined, {
    enabled: !!health?.connected,
  });
  const { data: queueSummary } = trpc.prm.analytics.queueSummary.useQuery(undefined, {
    enabled: !!health?.connected,
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Settings className="h-5 w-5 text-orange-500" />
        PRM Control Panel
      </h1>

      {/* PRMDB Health */}
      <div className="border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          PRMDB Status
        </h3>
        {health ? (
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Connected</span>
              <span className={health.connected ? "text-green-500" : "text-red-500"}>
                {health.connected ? "Yes" : "No"}
              </span>
            </div>
            {health.tableCount !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">PRM Tables</span>
                <span>{health.tableCount}</span>
              </div>
            )}
          </div>
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Queue Summary */}
      <div className="border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Case Queue
        </h3>
        {queueSummary?.length ? (
          <div className="space-y-1.5">
            {queueSummary.map((q: any) => (
              <div key={q.status} className="flex justify-between text-xs">
                <span className="text-muted-foreground capitalize">{q.status?.replace(/_/g, " ")}</span>
                <span className="font-medium">{q.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No open cases in queue.</p>
        )}
      </div>

      {/* Maturity History */}
      <div className="border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <GraduationCap className="h-4 w-4" />
          Maturity Assessments
        </h3>
        {maturityHistory?.length ? (
          <div className="space-y-2">
            {maturityHistory.slice(0, 5).map((run: any) => (
              <div key={run.id} className="border rounded p-2 text-xs">
                <div className="flex justify-between">
                  <span>Level {run.maturityLevel}/5</span>
                  <span className="text-muted-foreground">
                    {new Date(run.runDate).toLocaleDateString()}
                  </span>
                </div>
                {run.gapNotes && (
                  <p className="text-muted-foreground mt-1 truncate">{run.gapNotes}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No assessments run yet.</p>
        )}
      </div>
    </div>
  );
}
