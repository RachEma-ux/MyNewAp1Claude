import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Play, ShieldCheck, AlertTriangle, Pause, Loader2 } from "lucide-react";

const EXECUTION_STATES = ["authorized", "executing", "control_hold"];

export default function ExecutionPanel() {
  const [, setLocation] = useLocation();
  const projectsQuery = trpc.modules.pmt.shell.projects.list.useQuery();
  const projects = (projectsQuery.data ?? []).filter((p: any) =>
    EXECUTION_STATES.includes(p.status)
  );

  const executingCount = projects.filter((p: any) => p.status === "executing").length;
  const holdCount = projects.filter((p: any) => p.status === "control_hold").length;
  const authorizedCount = projects.filter((p: any) => p.status === "authorized").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Execution</h1>
        <p className="text-muted-foreground mt-1">
          Authorized and active projects — track progress, sprints, and G3 compliance
        </p>
      </div>

      {/* Summary counters */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Executing</CardTitle>
            <Play className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{executingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Authorized (Pending Start)</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{authorizedCount}</div>
          </CardContent>
        </Card>
        <Card className={holdCount > 0 ? "border-red-500/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Control Hold</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{holdCount}</div>
          </CardContent>
        </Card>
      </div>

      {projectsQuery.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading projects...
        </div>
      )}

      {!projectsQuery.isLoading && projects.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Play className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Projects in Execution</h3>
            <p className="text-muted-foreground mt-1">
              Projects that pass the G1 planning authorization gate and are started will appear here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Control hold warnings first */}
      {projects
        .filter((p: any) => p.status === "control_hold")
        .map((project: any) => (
          <Card key={project.id} className="border-red-500/50 bg-red-500/5 cursor-pointer hover:border-red-500 transition-colors" onClick={() => setLocation(`/pm-central/p/${project.id}/gates`)}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  {project.name}
                </CardTitle>
                <p className="text-sm text-red-400 mt-1">
                  G3 compliance failure — project frozen until remediation
                </p>
              </div>
              <Badge variant="destructive">Control Hold</Badge>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setLocation(`/pm-central/p/${project.id}/gates`); }}>
                <Pause className="h-4 w-4 mr-1" />
                View Freeze Details
              </Button>
            </CardContent>
          </Card>
        ))}

      {/* Active projects */}
      {projects
        .filter((p: any) => p.status !== "control_hold")
        .map((project: any) => (
          <Card key={project.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation(`/pm-central/p/${project.id}/overview`)}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">{project.name}</CardTitle>
                {project.description && (
                  <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
                )}
              </div>
              <Badge variant={project.status === "authorized" ? "outline" : "default"}>
                {project.status === "authorized" ? "Ready to Start" : "Executing"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Risk</span>
                  <p className="font-medium capitalize">{project.riskLevel || "low"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Start</span>
                  <p className="font-medium">
                    {project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Target</span>
                  <p className="font-medium">
                    {project.targetDate ? new Date(project.targetDate).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">0%</span>
                </div>
                <Progress value={0} className="h-2" />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                G3 Compliant
              </div>
              {project.status === "authorized" && (
                <Button size="sm" className="mt-2" onClick={(e) => { e.stopPropagation(); setLocation(`/pm-central/p/${project.id}/tasks`); }}>
                  <Play className="h-4 w-4 mr-1" />
                  Start Execution
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
