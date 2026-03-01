import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, BarChart3, TrendingUp, TrendingDown, Minus, ShieldCheck } from "lucide-react";

export default function ScorecardPanel({ projectId }: { projectId: number }) {
  const gatesQuery = trpc.modules.pmt.shell.gates.list.useQuery({ projectId });
  const projectQuery = trpc.modules.pmt.shell.projects.get.useQuery({ id: projectId });
  const gates = gatesQuery.data ?? [];
  const project = projectQuery.data;

  if (gatesQuery.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // Compute scorecard from gate results
  const passed = gates.filter((g: any) => g.status === "passed").length;
  const failed = gates.filter((g: any) => g.status === "failed").length;
  const total = gates.length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  // Score = 100 - (failed * 20), min 0
  const score = Math.max(0, 100 - (failed * 20));
  const trend = failed > 0 ? "down" : passed > 0 ? "up" : "flat";

  const scoreColor = score >= 80 ? "text-green-500" : score >= 50 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Scorecard Snapshot</h2>
      <p className="text-sm text-muted-foreground">Current governance health score and trend indicators</p>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Governance Score</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${scoreColor}`}>{score}</div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              {trend === "up" ? <TrendingUp className="h-3 w-3 text-green-500" /> :
               trend === "down" ? <TrendingDown className="h-3 w-3 text-red-500" /> :
               <Minus className="h-3 w-3" />}
              <span>{trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable"}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Gate Pass Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{passRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">{passed} passed / {total} evaluated</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Current State</CardTitle></CardHeader>
          <CardContent>
            <Badge variant="outline" className="capitalize text-sm">{(project?.status || "draft_shell").replace(/_/g, " ")}</Badge>
            {project?.status === "control_hold" && <Badge variant="destructive" className="ml-2 text-xs">Frozen</Badge>}
          </CardContent>
        </Card>
      </div>

      {/* Per-gate breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Gate-by-Gate Results</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3">
            {["G0", "G1", "G2", "G3", "G4"].map(gateId => {
              const gateResults = gates.filter((g: any) => g.gateId === gateId);
              const latest = gateResults[0];
              return (
                <div key={gateId} className="text-center space-y-1 p-2 rounded bg-muted/30">
                  <div className="text-sm font-bold">{gateId}</div>
                  {latest ? (
                    <>
                      <Badge variant={latest.status === "passed" ? "default" : latest.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                        {latest.status}
                      </Badge>
                      {latest.evaluatedAt && <div className="text-[10px] text-muted-foreground">{new Date(latest.evaluatedAt).toLocaleDateString()}</div>}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">—</div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Score dimensions */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Score Dimensions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[
            { dimension: "Process Compliance", weight: 30, score: failed === 0 ? 100 : 40 },
            { dimension: "Documentation Completeness", weight: 20, score: total > 0 ? passRate : 50 },
            { dimension: "Risk Management", weight: 20, score: project?.riskLevel === "critical" ? 20 : project?.riskLevel === "high" ? 50 : 80 },
            { dimension: "Timeline Adherence", weight: 15, score: 70 },
            { dimension: "Stakeholder Engagement", weight: 15, score: 60 },
          ].map(d => (
            <div key={d.dimension} className="flex items-center gap-3">
              <span className="text-sm w-48">{d.dimension}</span>
              <div className="flex-1 bg-muted rounded-full h-2">
                <div className={`rounded-full h-2 ${d.score >= 70 ? "bg-green-500" : d.score >= 40 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${d.score}%` }} />
              </div>
              <span className="text-xs font-medium w-10 text-right">{d.score}%</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
