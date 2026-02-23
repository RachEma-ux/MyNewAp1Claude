import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Activity, AlertTriangle, Clock } from "lucide-react";

export default function DriftMonitoringPanel() {
  const { data: status, isLoading: statusLoading } = trpc.governance.driftStatus.useQuery();
  const { data: latest, isLoading: latestLoading } = trpc.governance.driftLatest.useQuery();
  const { data: history, isLoading: historyLoading } = trpc.governance.driftHistory.useQuery();

  const isLoading = statusLoading || latestLoading || historyLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const driftActive = status?.active ?? false;
  const frozenCount = status?.frozenCount ?? 0;
  const historyList = Array.isArray(history) ? history : [];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Drift Monitoring</h1>
        <p className="text-muted-foreground mt-2">
          Drift detection status, latest report, and detection history
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Detection Status
            </CardDescription>
            <CardTitle className="text-2xl">{driftActive ? "Active" : "Inactive"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={driftActive ? "default" : "secondary"}>
              {driftActive ? "Monitoring" : "Stopped"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Frozen by Drift
            </CardDescription>
            <CardTitle className="text-2xl">{frozenCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {frozenCount === 0 ? "No drift violations" : "Subjects auto-frozen"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              History
            </CardDescription>
            <CardTitle className="text-2xl">{historyList.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">drift detection runs</p>
          </CardContent>
        </Card>
      </div>

      {latest && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Latest Drift Report</CardTitle>
            <CardDescription>
              {latest.timestamp ? new Date(latest.timestamp).toLocaleString() : "—"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-xs text-muted-foreground">New Violations</p>
                <p className="font-bold">{latest.newViolations?.length ?? 0}</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-xs text-muted-foreground">Resolved</p>
                <p className="font-bold">{latest.resolvedViolations?.length ?? 0}</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-xs text-muted-foreground">Total Checked</p>
                <p className="font-bold">{latest.totalChecked ?? 0}</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-xs text-muted-foreground">Auto-Frozen</p>
                <p className="font-bold">{latest.autoFrozen?.length ?? 0}</p>
              </div>
            </div>

            {latest.newViolations && latest.newViolations.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium mb-2">New Violations</p>
                {latest.newViolations.map((v: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1 text-sm border-b last:border-0">
                    <span>{v.description || v.controlId || `Violation #${i + 1}`}</span>
                    <Badge variant="destructive">{v.severity || "violation"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Detection History ({historyList.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {historyList.length > 0 ? (
            <div className="space-y-2">
              {historyList.map((run: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">
                      {run.newViolations?.length ?? 0} violations found
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.timestamp ? new Date(run.timestamp).toLocaleString() : "—"}
                    </p>
                  </div>
                  <Badge variant={(run.newViolations?.length ?? 0) === 0 ? "default" : "destructive"}>
                    {(run.newViolations?.length ?? 0) === 0 ? "Clean" : "Drift"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No drift detection history</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
