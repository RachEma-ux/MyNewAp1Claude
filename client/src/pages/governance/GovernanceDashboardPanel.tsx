import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, Snowflake, Activity, BarChart3 } from "lucide-react";

export default function GovernanceDashboardPanel() {
  const { data: drift, isLoading: driftLoading } = trpc.governance.driftStatus.useQuery();
  const { data: scorecard, isLoading: scorecardLoading } = trpc.governance.scorecardLatest.useQuery();
  const { data: frozen, isLoading: frozenLoading } = trpc.governance.frozenSubjects.useQuery();

  const isLoading = driftLoading || scorecardLoading || frozenLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading governance dashboard...</p>
        </div>
      </div>
    );
  }

  const frozenCount = frozen?.length ?? drift?.frozenCount ?? 0;
  const driftActive = drift?.active ?? false;
  const score = scorecard?.scorecard?.score ?? null;
  const gateStatus = scorecard?.scorecard?.gateStatus?.status ?? "unknown";

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Governance Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Overview of governance health, drift status, and compliance score
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Drift Detection
            </CardDescription>
            <CardTitle className="text-2xl">
              {driftActive ? "Active" : "Inactive"}
            </CardTitle>
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
              <ShieldCheck className="w-4 h-4" />
              Gate Status
            </CardDescription>
            <CardTitle className="text-2xl capitalize">{gateStatus}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={
                gateStatus === "PASS" ? "default" :
                gateStatus === "FAIL" ? "destructive" : "secondary"
              }
            >
              {gateStatus}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {scorecard && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Scorecard Summary</CardTitle>
            <CardDescription>
              Stage: {scorecard.stage ?? "—"} | Run at: {scorecard.timestamp ? new Date(scorecard.timestamp).toLocaleString() : "—"}
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
