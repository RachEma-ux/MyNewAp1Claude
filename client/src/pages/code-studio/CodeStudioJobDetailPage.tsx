import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Play, XCircle, RotateCcw, FileCode2, Workflow,
  ArrowLeft, Circle, CheckCircle2, AlertCircle, Terminal,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const TERMINAL_STATUSES = ["completed", "failed", "cancelled", "archived"];

const STEP_STATUS_ICON: Record<string, { icon: any; color: string }> = {
  pending: { icon: Circle, color: "text-zinc-500" },
  in_progress: { icon: Loader2, color: "text-blue-500" },
  completed: { icon: CheckCircle2, color: "text-green-500" },
  failed: { icon: AlertCircle, color: "text-red-500" },
};

const STATUS_COLORS: Record<string, string> = {
  draft: "text-zinc-500 border-zinc-500/30",
  queued: "text-blue-500 border-blue-500/30",
  preparing_workspace: "text-cyan-500 border-cyan-500/30",
  starting_session: "text-cyan-500 border-cyan-500/30",
  planning: "text-indigo-500 border-indigo-500/30",
  awaiting_approval: "text-amber-500 border-amber-500/30",
  building: "text-violet-500 border-violet-500/30",
  reviewing: "text-orange-500 border-orange-500/30",
  testing: "text-teal-500 border-teal-500/30",
  governance_check: "text-purple-500 border-purple-500/30",
  completed: "text-green-500 border-green-500/30",
  failed: "text-red-500 border-red-500/30",
  cancelled: "text-zinc-400 border-zinc-400/30",
  archived: "text-zinc-300 border-zinc-300/30",
};

export default function CodeStudioJobDetailPage() {
  const [location, navigate] = useLocation();
  const idMatch = location.match(/\/code-studio\/jobs\/(\d+)/);
  const jobId = idMatch ? Number(idMatch[1]) : 0;

  const jobQuery = trpc.codeStudio.jobs.getById.useQuery({ id: jobId }, { enabled: !!jobId });
  const job = jobQuery.data;

  const isTerminal = job && TERMINAL_STATUSES.includes(job.status);

  // Poll every 3s while job is actively executing
  useEffect(() => {
    if (!jobId || isTerminal) return;
    const interval = setInterval(() => { jobQuery.refetch(); }, 3000);
    return () => clearInterval(interval);
  }, [jobId, isTerminal]);

  // Runtime health (poll less frequently)
  const healthQuery = trpc.codeStudio.health.status.useQuery(undefined, {
    refetchInterval: isTerminal ? false : 10000,
  });

  const startMutation = trpc.codeStudio.jobs.start.useMutation({
    onSuccess: () => { toast.success("Job started"); jobQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMutation = trpc.codeStudio.jobs.cancel.useMutation({
    onSuccess: () => { toast.success("Job cancelled"); jobQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const retryMutation = trpc.codeStudio.jobs.retry.useMutation({
    onSuccess: () => { toast.success("Job requeued"); jobQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (jobQuery.isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!job) {
    return <div className="p-4 text-sm text-muted-foreground">Job not found.</div>;
  }

  const activeStep = (job.steps || []).find((s: any) => s.status === "in_progress");
  const ocHealthy = healthQuery.data?.opencode?.healthy ?? false;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => navigate("/code-studio/jobs")} title="Back to Jobs">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <h1 className="text-sm font-semibold flex items-center gap-2">
              <Workflow className="h-4 w-4 text-violet-500" /> Job #{job.id}: {job.title}
            </h1>
          </div>
          {job.objective && <p className="text-[10px] text-muted-foreground mt-0.5 ml-8">{job.objective}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[9px] ${STATUS_COLORS[job.status] || ""}`}>
            {job.status?.replace(/_/g, " ")}
          </Badge>
          {job.status === "draft" && (
            <Button size="sm" className="text-xs h-7" onClick={() => startMutation.mutate({ id: jobId })}
              disabled={startMutation.isPending}>
              <Play className="h-3 w-3 mr-1" /> Start
            </Button>
          )}
          {!TERMINAL_STATUSES.includes(job.status) && job.status !== "draft" && (
            <Button size="sm" variant="destructive" className="text-xs h-7" onClick={() => cancelMutation.mutate({ id: jobId })}
              disabled={cancelMutation.isPending}>
              <XCircle className="h-3 w-3 mr-1" /> Cancel
            </Button>
          )}
          {job.status === "failed" && (
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => retryMutation.mutate({ id: jobId })}
              disabled={retryMutation.isPending}>
              <RotateCcw className="h-3 w-3 mr-1" /> Retry
            </Button>
          )}
        </div>
      </div>

      {/* Execution status bar */}
      {!isTerminal && job.status !== "draft" && (
        <div className="flex items-center gap-3 px-3 py-2 rounded border border-blue-500/20 bg-blue-500/5 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />
          <span className="text-blue-400">
            {activeStep
              ? `Running: ${activeStep.stepName?.replace(/_/g, " ")} (${activeStep.agentRole})`
              : `Status: ${job.status?.replace(/_/g, " ")}`}
          </span>
          <span className="ml-auto flex items-center gap-1 text-[9px]">
            <span className={`h-1.5 w-1.5 rounded-full ${ocHealthy ? "bg-green-500" : "bg-red-500"}`} />
            OpenCode {ocHealthy ? "online" : "offline"}
          </span>
        </div>
      )}

      {/* Error message */}
      {job.status === "failed" && job.errorMessage && (
        <div className="flex items-start gap-2 px-3 py-2 rounded border border-red-500/20 bg-red-500/5 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{job.errorMessage}</span>
        </div>
      )}

      <Tabs defaultValue="steps">
        <TabsList className="h-7">
          <TabsTrigger value="steps" className="text-[10px] h-6">Steps</TabsTrigger>
          <TabsTrigger value="sessions" className="text-[10px] h-6">Sessions</TabsTrigger>
          <TabsTrigger value="diffs" className="text-[10px] h-6">Diffs</TabsTrigger>
          <TabsTrigger value="workspace" className="text-[10px] h-6">Workspace</TabsTrigger>
          <TabsTrigger value="details" className="text-[10px] h-6">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="steps" className="mt-3">
          {job.steps?.length === 0 && <p className="text-xs text-muted-foreground">No steps yet. Start the job to initialize the workflow.</p>}
          <div className="space-y-1.5">
            {(job.steps || []).map((s: any) => {
              const statusInfo = STEP_STATUS_ICON[s.status] || STEP_STATUS_ICON.pending;
              const Icon = statusInfo.icon;
              const isActive = s.status === "in_progress";
              return (
                <div key={s.id} className={`flex items-center justify-between py-1.5 px-3 rounded border text-xs ${isActive ? "border-blue-500/30 bg-blue-500/5" : ""}`}>
                  <div className="flex items-center gap-2">
                    <Icon className={`h-3.5 w-3.5 ${statusInfo.color} ${isActive ? "animate-spin" : ""}`} />
                    <span className="font-mono text-[10px] text-muted-foreground">{s.stepOrder}.</span>
                    <span className={`font-medium ${isActive ? "text-blue-400" : ""}`}>{s.stepName?.replace(/_/g, " ")}</span>
                    {s.agentRole && <Badge variant="secondary" className="text-[8px] px-1">{s.agentRole}</Badge>}
                  </div>
                  <Badge variant="outline" className={`text-[9px] capitalize ${isActive ? "border-blue-500/30 text-blue-400" : ""}`}>{s.status}</Badge>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="mt-3">
          {(!job.sessions || job.sessions.length === 0) && (
            <p className="text-xs text-muted-foreground">No sessions yet. Sessions are created when the job starts executing.</p>
          )}
          <div className="space-y-2">
            {(job.sessions || []).map((s: any) => (
              <Card key={s.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 text-teal-500" />
                      <span className="font-mono">#{s.id}</span>
                      {s.agentRole && <Badge variant="secondary" className="text-[9px]">{s.agentRole}</Badge>}
                      {s.model && <span className="text-muted-foreground">{s.model}</span>}
                    </div>
                    <Badge variant="outline" className="text-[9px] capitalize">{s.status}</Badge>
                  </div>
                  {s.opencodeSessionId && (
                    <div className="mt-1 text-[9px] text-muted-foreground font-mono truncate">
                      OC: {s.opencodeSessionId}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="diffs" className="mt-3">
          {(job.diffs || []).length === 0 && <p className="text-xs text-muted-foreground">No diffs yet.</p>}
          <div className="space-y-2">
            {(job.diffs || []).map((d: any) => (
              <Card key={d.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-mono">{d.filePath}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px]">
                      <Badge variant="outline" className="text-[9px]">{d.diffType}</Badge>
                      {d.linesAdded > 0 && <span className="text-green-500">+{d.linesAdded}</span>}
                      {d.linesRemoved > 0 && <span className="text-red-500">-{d.linesRemoved}</span>}
                    </div>
                  </div>
                  {d.diffContent && (
                    <pre className="mt-2 text-[10px] bg-muted/50 p-2 rounded overflow-x-auto max-h-40 font-mono">{d.diffContent}</pre>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="workspace" className="mt-3">
          {job.workspace ? (
            <Card>
              <CardContent className="p-3 space-y-1 text-xs">
                <div><span className="text-muted-foreground">Path:</span> <span className="font-mono">{job.workspace.workspacePath}</span></div>
                <div><span className="text-muted-foreground">Branch:</span> <span className="font-mono">{job.workspace.branchName}</span></div>
                <div><span className="text-muted-foreground">Baseline:</span> <span className="font-mono">{job.workspace.baselineSha || "—"}</span></div>
                <div><span className="text-muted-foreground">Final:</span> <span className="font-mono">{job.workspace.finalSha || "—"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className="text-[9px] ml-1">{job.workspace.status}</Badge></div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-xs text-muted-foreground">No workspace created yet.</p>
          )}
        </TabsContent>

        <TabsContent value="details" className="mt-3">
          <Card>
            <CardContent className="p-3 space-y-1 text-xs">
              <div><span className="text-muted-foreground">ID:</span> {job.id}</div>
              <div><span className="text-muted-foreground">Status:</span> <span className={STATUS_COLORS[job.status]?.split(" ")[0] || ""}>{job.status}</span></div>
              <div><span className="text-muted-foreground">Priority:</span> {job.priority || "normal"}</div>
              <div><span className="text-muted-foreground">Source Module:</span> {job.sourceModule || "—"}</div>
              <div><span className="text-muted-foreground">Created:</span> {job.createdAt ? new Date(job.createdAt).toLocaleString() : "—"}</div>
              <div><span className="text-muted-foreground">Completed:</span> {job.completedAt ? new Date(job.completedAt).toLocaleString() : "—"}</div>
              {job.errorMessage && (
                <div className="text-red-400 mt-2 p-2 rounded border border-red-500/20 bg-red-500/5">
                  <span className="text-muted-foreground">Error:</span> {job.errorMessage}
                </div>
              )}
              <div className="mt-2 pt-2 border-t">
                <span className="text-muted-foreground">OpenCode Runtime:</span>{" "}
                <span className={`inline-flex items-center gap-1 ${ocHealthy ? "text-green-500" : "text-red-400"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${ocHealthy ? "bg-green-500" : "bg-red-500"}`} />
                  {ocHealthy ? "Online" : "Offline"}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
