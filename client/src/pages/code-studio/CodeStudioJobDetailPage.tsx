import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, XCircle, RotateCcw, FileCode2, Workflow } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

export default function CodeStudioJobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params.id);
  const [, navigate] = useLocation();

  const jobQuery = trpc.codeStudio.jobs.getById.useQuery({ id: jobId }, { enabled: !!jobId });
  const job = jobQuery.data;

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

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold flex items-center gap-2">
            <Workflow className="h-4 w-4 text-violet-500" /> Job #{job.id}: {job.title}
          </h1>
          {job.objective && <p className="text-[10px] text-muted-foreground mt-0.5">{job.objective}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px]">{job.status?.replace(/_/g, " ")}</Badge>
          {job.status === "draft" && (
            <Button size="sm" className="text-xs h-7" onClick={() => startMutation.mutate({ id: jobId })}
              disabled={startMutation.isPending}>
              <Play className="h-3 w-3 mr-1" /> Start
            </Button>
          )}
          {!["completed", "failed", "cancelled", "archived"].includes(job.status) && (
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

      <Tabs defaultValue="steps">
        <TabsList className="h-7">
          <TabsTrigger value="steps" className="text-[10px] h-6">Steps</TabsTrigger>
          <TabsTrigger value="diffs" className="text-[10px] h-6">Diffs</TabsTrigger>
          <TabsTrigger value="workspace" className="text-[10px] h-6">Workspace</TabsTrigger>
          <TabsTrigger value="details" className="text-[10px] h-6">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="steps" className="mt-3">
          {job.steps?.length === 0 && <p className="text-xs text-muted-foreground">No steps yet. Start the job to initialize the workflow.</p>}
          <div className="space-y-1.5">
            {(job.steps || []).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between py-1.5 px-3 rounded border text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">{s.stepOrder}.</span>
                  <span className="font-medium">{s.stepName?.replace(/_/g, " ")}</span>
                  {s.agentRole && <Badge variant="secondary" className="text-[8px] px-1">{s.agentRole}</Badge>}
                </div>
                <Badge variant="outline" className="text-[9px] capitalize">{s.status}</Badge>
              </div>
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
              <div><span className="text-muted-foreground">Status:</span> {job.status}</div>
              <div><span className="text-muted-foreground">Priority:</span> {job.priority || "normal"}</div>
              <div><span className="text-muted-foreground">Source Module:</span> {job.sourceModule || "—"}</div>
              <div><span className="text-muted-foreground">Created:</span> {job.createdAt ? new Date(job.createdAt).toLocaleString() : "—"}</div>
              <div><span className="text-muted-foreground">Completed:</span> {job.completedAt ? new Date(job.completedAt).toLocaleString() : "—"}</div>
              {job.errorMessage && <div className="text-red-500"><span className="text-muted-foreground">Error:</span> {job.errorMessage}</div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
