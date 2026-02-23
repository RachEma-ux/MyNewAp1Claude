import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, ShieldCheck, AlertTriangle, BarChart3 } from "lucide-react";

export default function RiskBaselinesPanel() {
  const { data, isLoading, error } = trpc.hq.riskBaselines.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center py-12">
        Failed to load risk baselines: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Risk Baselines</h1>
        <p className="text-muted-foreground mt-1">
          Governance health and risk classification overview
        </p>
      </div>

      {data?.selfCheck && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Governance Self-Check
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Compliance</p>
                <Badge variant={data.selfCheck.compliant ? "default" : "destructive"} className="mt-1">
                  {data.selfCheck.compliant ? "Compliant" : "Non-Compliant"}
                </Badge>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Score</p>
                <p className="text-lg font-bold mt-1">{data.selfCheck.score}/100</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Total Checks</p>
                <p className="text-lg font-bold mt-1">{data.selfCheck.checkCount}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Passed</p>
                <p className="text-lg font-bold mt-1">{data.selfCheck.passedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Risk Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-destructive/10">
              <p className="text-xs text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold mt-1 text-destructive">{data?.riskBreakdown?.critical ?? 0}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-orange-500/10">
              <p className="text-xs text-muted-foreground">High</p>
              <p className="text-2xl font-bold mt-1 text-orange-500">{data?.riskBreakdown?.high ?? 0}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-yellow-500/10">
              <p className="text-xs text-muted-foreground">Medium</p>
              <p className="text-2xl font-bold mt-1 text-yellow-500">{data?.riskBreakdown?.medium ?? 0}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Low</p>
              <p className="text-2xl font-bold mt-1">{data?.riskBreakdown?.low ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Control Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            <span className="text-2xl font-bold text-foreground">{data?.totalControls ?? 0}</span> active governance controls
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
