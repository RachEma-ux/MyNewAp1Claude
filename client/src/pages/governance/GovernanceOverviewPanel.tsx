import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, ShieldCheck, Snowflake, Activity, BarChart3, Gauge } from "lucide-react";

export default function GovernanceOverviewPanel() {
  const { data: selfCheck, isLoading: scLoading } = trpc.governance.selfCheck.useQuery();
  const { data: drift, isLoading: driftLoading } = trpc.governance.driftStatus.useQuery();
  const { data: scorecard, isLoading: scorecardLoading } = trpc.governance.scorecardLatest.useQuery();
  const { data: metrics, isLoading: metricsLoading } = trpc.governance.metrics.useQuery();

  const isLoading = scLoading || driftLoading || scorecardLoading || metricsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const frozenCount = drift?.frozenCount ?? 0;
  const driftActive = drift?.active ?? false;
  const score = scorecard?.scorecard?.score ?? null;
  const gateStatus = scorecard?.scorecard?.gateStatus?.status ?? "unknown";
  const compliant = selfCheck?.compliant ?? false;
  const metricsJson = metrics?.json as Record<string, any> | undefined;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Governance Overview</h1>
        <p className="text-muted-foreground mt-2">
          Governance health, compliance score, drift status, and enforcement metrics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Compliance
            </CardDescription>
            <CardTitle className="text-2xl">
              {compliant ? "Compliant" : "Non-Compliant"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={compliant ? "default" : "destructive"}>
              {compliant ? "PASS" : "FAIL"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Latest Score
            </CardDescription>
            <CardTitle className="text-2xl">
              {score != null ? `${score}/100` : "N/A"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {score != null ? (
              <Badge variant={score >= 80 ? "default" : score >= 50 ? "outline" : "destructive"}>
                {score >= 80 ? "Healthy" : score >= 50 ? "Warning" : "Critical"}
              </Badge>
            ) : (
              <p className="text-xs text-muted-foreground">No scorecard run yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Drift Detection
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
              <Snowflake className="w-4 h-4" />
              Frozen Subjects
            </CardDescription>
            <CardTitle className="text-2xl">{frozenCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {frozenCount === 0 ? "No subjects frozen" : "Transitions blocked"}
            </p>
          </CardContent>
        </Card>
      </div>

      {metricsJson && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="w-5 h-5" />
              Governance Metrics
            </CardTitle>
            <CardDescription>Engine telemetry and counters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(metricsJson).map(([key, value]) => (
                <div key={key} className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground font-mono">{key}</p>
                  <p className="text-lg font-bold mt-1">
                    {typeof value === "number" ? value.toLocaleString() : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {scorecard && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Scorecard Summary</CardTitle>
            <CardDescription>
              Stage: {scorecard.stage ?? "—"} | Gate: {gateStatus} | Run: {scorecard.timestamp ? new Date(scorecard.timestamp).toLocaleString() : "—"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scorecard.scorecard?.controls ? (
              <div className="space-y-2">
                {scorecard.scorecard.controls.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b last:border-0">
                    <span className="text-sm">{c.name || c.id}</span>
                    <Badge variant={c.passed ? "default" : "destructive"}>
                      {c.passed ? "PASS" : "FAIL"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No control details available</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
