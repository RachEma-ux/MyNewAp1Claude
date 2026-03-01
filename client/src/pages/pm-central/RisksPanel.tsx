import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { AlertTriangle, ShieldCheck, Lock, Activity, Loader2 } from "lucide-react";

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-500/10 text-green-600 border-green-500/30",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  critical: "bg-red-500/10 text-red-600 border-red-500/30",
};

export default function RisksPanel() {
  const [, setLocation] = useLocation();
  const projectsQuery = trpc.modules.pmt.shell.projects.list.useQuery();
  const allProjects = projectsQuery.data ?? [];

  // Group projects by risk level
  const byRisk = {
    critical: allProjects.filter((p: any) => p.riskLevel === "critical"),
    high: allProjects.filter((p: any) => p.riskLevel === "high"),
    medium: allProjects.filter((p: any) => p.riskLevel === "medium"),
    low: allProjects.filter((p: any) => !p.riskLevel || p.riskLevel === "low"),
  };

  // Identify frozen / control hold projects
  const frozenProjects = allProjects.filter((p: any) => p.status === "control_hold");
  const rejectedProjects = allProjects.filter((p: any) => p.status === "rejected");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Risk Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Project risk overview — risk levels, gate failures, freezes, and compliance status
        </p>
      </div>

      {projectsQuery.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      )}

      {/* Risk summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {(["critical", "high", "medium", "low"] as const).map((level) => (
          <Card key={level} className={byRisk[level].length > 0 && level !== "low" ? "border-orange-500/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium capitalize">{level} Risk</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${
                level === "critical" ? "text-red-500" :
                level === "high" ? "text-orange-500" :
                level === "medium" ? "text-yellow-500" :
                "text-green-500"
              }`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{byRisk[level].length}</div>
              <p className="text-xs text-muted-foreground mt-1">projects</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Frozen / control hold section */}
      {frozenProjects.length > 0 && (
        <Card className="border-red-500/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-500">
              <Lock className="h-4 w-4" />
              Projects on Control Hold ({frozenProjects.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {frozenProjects.map((project: any) => (
              <div key={project.id} className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20 hover:border-red-500/50 cursor-pointer transition-colors" onClick={() => setLocation(`/pm-central/p/${project.id}/gates`)}>
                <div>
                  <p className="font-medium">{project.name}</p>
                  <p className="text-sm text-muted-foreground">
                    G3 compliance failure — execution frozen
                  </p>
                </div>
                <Badge variant="destructive">Frozen</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Rejected projects */}
      {rejectedProjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Rejected Projects ({rejectedProjects.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rejectedProjects.map((project: any) => (
              <div key={project.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors" onClick={() => setLocation(`/pm-central/p/${project.id}/overview`)}>
                <div>
                  <p className="font-medium">{project.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Failed G0 intake gate
                  </p>
                </div>
                <Badge variant="secondary">Rejected</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Risk heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Risk Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No projects to display. Create projects in PM Shell to see risk distribution.
            </p>
          ) : (
            <div className="space-y-2">
              {(["critical", "high", "medium", "low"] as const).map((level) => (
                <div key={level} className="flex items-center gap-3">
                  <span className="text-sm font-medium capitalize w-16">{level}</span>
                  <div className="flex-1 flex gap-1 flex-wrap">
                    {byRisk[level].map((p: any) => (
                      <div
                        key={p.id}
                        className={`px-2 py-1 text-xs rounded border cursor-pointer hover:opacity-80 transition-opacity ${RISK_COLORS[level]}`}
                        title={p.name}
                        onClick={() => setLocation(`/pm-central/p/${p.id}/risks`)}
                      >
                        {p.name.length > 20 ? p.name.slice(0, 20) + "..." : p.name}
                      </div>
                    ))}
                    {byRisk[level].length === 0 && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gate compliance overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Gate Compliance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4 text-center">
            {["G0 Intake", "G1 Planning", "G2 Change", "G3 Compliance", "G4 Closure"].map((gate) => (
              <div key={gate} className="space-y-1">
                <div className="text-sm font-medium">{gate}</div>
                <div className="text-2xl font-bold text-muted-foreground">—</div>
                <div className="text-xs text-muted-foreground">pass rate</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Gate pass rates will populate as projects move through the lifecycle.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
