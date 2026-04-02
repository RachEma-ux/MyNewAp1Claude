import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Workflow, Terminal, ShieldCheck, GitBranch, Code2 } from "lucide-react";
import { useLocation } from "wouter";

export default function CodeStudioDashboardPage() {
  const [, navigate] = useLocation();
  const healthQuery = trpc.codeStudio.health.status.useQuery();
  const summaryQuery = trpc.codeStudio.health.summary.useQuery();

  const health = healthQuery.data;
  const summary = summaryQuery.data;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Code2 className="h-5 w-5 text-violet-500" /> Code Studio
          </h1>
          <p className="text-xs text-muted-foreground">Standalone coding module with OpenCode runtime</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={health?.codedb?.connected ? "default" : "destructive"} className="text-[9px]">
            {health?.codedb?.connected ? `CODEDB (${health.codedb.tableCount} tables)` : "CODEDB Disconnected"}
          </Badge>
          <Badge variant={health?.opencode?.healthy ? "default" : "secondary"} className="text-[9px]">
            {health?.opencode?.healthy ? `OpenCode ${health.opencode.version || ""}` : "OpenCode Offline"}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Workflow className="h-8 w-8 text-violet-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{summary?.totalJobs ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Total Jobs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Workflow className="h-8 w-8 text-blue-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{summary?.activeJobs ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Terminal className="h-8 w-8 text-teal-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{summary?.totalSessions ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-amber-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{summary?.pendingApprovals ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <GitBranch className="h-8 w-8 text-green-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{summary?.repositories ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Repos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button size="sm" className="text-xs" onClick={() => navigate("/code-studio/jobs")}>
          <Workflow className="h-3 w-3 mr-1" /> View Jobs
        </Button>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/code-studio/approvals")}>
          <ShieldCheck className="h-3 w-3 mr-1" /> Approvals
        </Button>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/code-studio/repos")}>
          <GitBranch className="h-3 w-3 mr-1" /> Repositories
        </Button>
      </div>
    </div>
  );
}
