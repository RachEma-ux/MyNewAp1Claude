import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  FolderOpen, ShieldCheck, Activity, ArrowRight, Plus,
  Clock, AlertTriangle, CheckCircle2, Loader2,
} from "lucide-react";

// State machine stage ordering for pipeline visualization
const PIPELINE_STAGES = [
  { key: "draft_shell", label: "Draft", short: "DFT" },
  { key: "intake_review", label: "Intake", short: "INT" },
  { key: "planning", label: "Planning", short: "PLN" },
  { key: "authorized", label: "Authorized", short: "AUT" },
  { key: "executing", label: "Executing", short: "EXE" },
  { key: "closing", label: "Closing", short: "CLS" },
  { key: "closed", label: "Closed", short: "END" },
];

const STATE_CATEGORY: Record<string, string> = {
  draft_shell: "draft",
  intake_review: "planning",
  planning: "planning",
  plan_gate_pending: "planning",
  authorized: "executing",
  executing: "executing",
  control_hold: "executing",
  change_pending: "executing",
  closing: "closing",
  close_gate_pending: "closing",
  closed: "closed",
  rejected: "closed",
  archived: "closed",
};

export default function DashboardPanel() {
  const [, setLocation] = useLocation();
  const projectsQuery = trpc.modules.pmt.shell.projects.list.useQuery();
  const allProjects = projectsQuery.data ?? [];

  // Group by category
  const draftCount = allProjects.filter((p: any) => STATE_CATEGORY[p.status] === "draft").length;
  const planningCount = allProjects.filter((p: any) => STATE_CATEGORY[p.status] === "planning").length;
  const executingCount = allProjects.filter((p: any) => STATE_CATEGORY[p.status] === "executing").length;
  const closedCount = allProjects.filter((p: any) => STATE_CATEGORY[p.status] === "closed").length;

  // Identify projects needing attention
  const pendingGates = allProjects.filter((p: any) =>
    ["intake_review", "plan_gate_pending", "close_gate_pending"].includes(p.status)
  );
  const controlHolds = allProjects.filter((p: any) => p.status === "control_hold");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects Home</h1>
          <p className="text-muted-foreground mt-1">
            Portfolio overview — lifecycle status, governance gates, and activity
          </p>
        </div>
        <Button onClick={() => setLocation("/pm-central/shell/new")}>
          <Plus className="h-4 w-4 mr-1" />
          New Project
        </Button>
      </div>

      {projectsQuery.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          No projects yet
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation("/pm-central/shell")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{draftCount}</div>
            <p className="text-xs text-muted-foreground mt-1">In PM Shell</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation("/pm-central/plans")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planning</CardTitle>
            <Clock className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{planningCount}</div>
            <p className="text-xs text-muted-foreground mt-1">In planning + gates</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation("/pm-central/execution")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Executing</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{executingCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Active work</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation("/pm-central/reports")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{closedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Completed + archived</p>
          </CardContent>
        </Card>
      </div>

      {/* Lifecycle pipeline visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lifecycle Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {PIPELINE_STAGES.map((stage, i) => {
              const count = allProjects.filter((p: any) => p.status === stage.key).length;
              return (
                <div key={stage.key} className="flex items-center">
                  <div className={`flex flex-col items-center min-w-[80px] px-3 py-2 rounded-lg border text-center ${
                    count > 0 ? "border-primary/50 bg-primary/5" : "border-muted"
                  }`}>
                    <span className="text-xs text-muted-foreground">{stage.label}</span>
                    <span className="text-lg font-bold">{count}</span>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground mx-1 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* All projects list */}
      {allProjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {allProjects.map((project: any) => {
              const cat = STATE_CATEGORY[project.status] || "draft";
              const stateColor = cat === "executing" ? "text-emerald-500" : cat === "planning" ? "text-indigo-500" : cat === "closed" ? "text-muted-foreground" : "text-blue-500";
              return (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 cursor-pointer transition-colors"
                  onClick={() => setLocation(`/pm-central/p/${project.id}/overview`)}
                >
                  <div>
                    <p className="font-medium">{project.name}</p>
                    {project.description && <p className="text-xs text-muted-foreground mt-0.5">{project.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={stateColor}>
                      {(project.status || "draft").replace(/_/g, " ")}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Gate requests needing attention */}
      {pendingGates.length > 0 && (
        <Card className="border-yellow-500/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-yellow-500" />
              Gates Pending Review ({pendingGates.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingGates.map((project: any) => {
              const gateLabel = project.status === "intake_review" ? "G0 Intake" :
                project.status === "plan_gate_pending" ? "G1 Planning" :
                "G4 Closure";
              return (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 hover:border-yellow-500/50 cursor-pointer transition-colors"
                  onClick={() => setLocation(`/pm-central/p/${project.id}/gates`)}
                >
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Awaiting {gateLabel} gate evaluation
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                      {gateLabel}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-yellow-500" />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Control holds */}
      {controlHolds.length > 0 && (
        <Card className="border-red-500/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-4 w-4" />
              Control Holds ({controlHolds.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {controlHolds.map((project: any) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20 hover:border-red-500/50 cursor-pointer transition-colors"
                onClick={() => setLocation(`/pm-central/p/${project.id}/gates`)}
              >
                <div>
                  <p className="font-medium">{project.name}</p>
                  <p className="text-sm text-red-400">G3 compliance failure — frozen</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Frozen</Badge>
                  <ArrowRight className="h-4 w-4 text-red-500" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent activity / getting started */}
      {allProjects.length === 0 && !projectsQuery.isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground">
              Welcome to PM Central. Projects follow a governed lifecycle with 5 quality gates:
            </p>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              {["G0 Intake", "G1 Planning", "G2 Change", "G3 Compliance", "G4 Closure"].map(
                (gate, i, arr) => (
                  <div key={gate} className="flex items-center gap-2">
                    <Badge variant="outline">{gate}</Badge>
                    {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
                  </div>
                )
              )}
            </div>
            <Button className="mt-2" onClick={() => setLocation("/pm-central/shell/new")}>
              <Plus className="h-4 w-4 mr-1" />
              Create First Project
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
