import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  FolderKanban, CheckSquare, AlertTriangle, ShieldCheck,
  Clock, ArrowRight, Loader2, Activity,
} from "lucide-react";

const STATE_LABELS: Record<string, string> = {
  draft_shell: "Draft", intake_review: "Intake Review", planning: "Planning",
  plan_gate_pending: "G1 Pending", authorized: "Authorized", executing: "Executing",
  control_hold: "Control Hold", change_pending: "Change Pending", closing: "Closing",
  close_gate_pending: "G4 Pending", closed: "Closed", rejected: "Rejected", archived: "Archived",
};

export default function OverviewPanel({ projectId }: { projectId: number }) {
  const [, setLocation] = useLocation();
  const projectQuery = trpc.modules.pmt.shell.projects.get.useQuery({ id: projectId });
  const summaryQuery = trpc.modules.pmt.shell.tools.sidebarSummary.get.useQuery({ projectId });
  const tasksQuery = trpc.modules.pmt.shell.tasks.list.useQuery({ projectId });

  const project = projectQuery.data;
  const s = summaryQuery.data;
  const allTasks = tasksQuery.data ?? [];
  const doneTasks = allTasks.filter((t: any) => t.status === "done").length;
  const totalTasks = allTasks.length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  if (projectQuery.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!project) return <div className="text-muted-foreground text-center py-20">Project not found</div>;

  const base = `/pm-central/project/${projectId}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
        {project.description && <p className="text-muted-foreground mt-1">{project.description}</p>}
      </div>

      {/* Status + dates */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="text-xs">{STATE_LABELS[project.status] || project.status}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Risk Level</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-lg font-bold capitalize">{project.riskLevel || "low"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Start Date</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm">{project.startDate ? new Date(project.startDate).toLocaleDateString() : "Not set"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Target Date</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm">{project.targetDate ? new Date(project.targetDate).toLocaleDateString() : "Not set"}</span>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Task Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm mb-2">
            <span>{doneTasks} / {totalTasks} tasks complete</span>
            <span className="font-bold">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:border-primary/50" onClick={() => setLocation(`${base}/tasks`)}>
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckSquare className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-lg font-bold">{totalTasks}</div>
              <div className="text-xs text-muted-foreground">Tasks</div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50" onClick={() => setLocation(`${base}/risks`)}>
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <div>
              <div className="text-lg font-bold">{s?.highRisksCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">High Risks</div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50" onClick={() => setLocation(`${base}/issues`)}>
          <CardContent className="pt-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-lg font-bold">{s?.openIssuesCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Open Issues</div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50" onClick={() => setLocation(`${base}/gates`)}>
          <CardContent className="pt-4 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-lg font-bold">{s?.approvalsPendingCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Pending Gates</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
