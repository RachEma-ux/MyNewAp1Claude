import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, CheckCircle2, Clock, Play, SkipForward } from "lucide-react";
import { toast } from "sonner";

export default function PSMRunPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const runId = Number(params.id);
  const [stepNotes, setStepNotes] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState("");

  const runQuery = trpc.psm.workflow.getRun.useQuery({ id: runId }, { enabled: !!runId });
  const run = runQuery.data;

  const saveStepMutation = trpc.psm.workflow.saveStep.useMutation({
    onSuccess: () => { toast.success("Step saved"); runQuery.refetch(); },
    onError: () => toast.error("Failed to save step"),
  });

  const completeRunMutation = trpc.psm.workflow.completeRun.useMutation({
    onSuccess: () => { toast.success("Workflow completed!"); runQuery.refetch(); },
    onError: () => toast.error("Failed to complete"),
  });

  const resumeRunMutation = trpc.psm.workflow.resumeRun.useMutation({
    onSuccess: () => { toast.success("Run resumed"); runQuery.refetch(); },
  });

  if (runQuery.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (!run) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">Run not found.</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/psm/cases")}>
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Cases
        </Button>
      </div>
    );
  }

  const steps = run.steps ?? [];
  const isCompleted = run.status === "completed";
  const isActive = run.status === "active";

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Button size="sm" variant="ghost" className="text-xs" onClick={() => navigate(`/psm/cases/${run.caseId}`)}>
        <ArrowLeft className="h-3 w-3 mr-1" /> Case #{run.caseId}
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold">
            Workflow Run #{run.id}
          </h1>
          {run.method && <p className="text-sm text-muted-foreground mt-0.5">{(run.method as any).name}</p>}
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant="outline" className="text-[10px] capitalize">{run.status}</Badge>
            {run.currentStep && (
              <Badge variant="outline" className="text-[10px]">Step {run.currentStep}</Badge>
            )}
          </div>
        </div>
        {run.status === "paused" && (
          <Button size="sm" className="text-xs" onClick={() => resumeRunMutation.mutate({ id: runId })}>
            <Play className="h-3 w-3 mr-1" /> Resume
          </Button>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold">Workflow Steps</h3>
        {steps.length === 0 && (
          <p className="text-xs text-muted-foreground py-4">No steps defined for this workflow.</p>
        )}
        {steps.map((step: any) => {
          const isCurrent = step.stepNumber === run.currentStep && isActive;
          const isDone = step.status === "completed" || step.status === "skipped";
          return (
            <Card key={step.id} className={isCurrent ? "border-teal-500/50" : ""}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Badge
                    className={`text-[10px] h-5 w-5 flex items-center justify-center rounded-full p-0 ${isDone ? "bg-green-600" : isCurrent ? "bg-teal-500" : ""}`}
                  >
                    {isDone ? <CheckCircle2 className="h-3 w-3" /> : step.stepNumber}
                  </Badge>
                  <p className="text-xs font-semibold flex-1">{step.title || `Step ${step.stepNumber}`}</p>
                  <Badge variant="outline" className="text-[9px] capitalize">{step.status}</Badge>
                  {step.durationMinutes && (
                    <Badge variant="outline" className="text-[9px] flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" /> {step.durationMinutes}m
                    </Badge>
                  )}
                </div>

                {step.description && (
                  <p className="text-[10px] text-muted-foreground mt-1">{step.description}</p>
                )}

                {/* Output display for completed steps */}
                {isDone && step.notes && (
                  <div className="mt-2 p-2 bg-muted/50 rounded text-[10px]">
                    <p className="font-medium mb-0.5">Notes:</p>
                    <p className="whitespace-pre-wrap">{step.notes}</p>
                  </div>
                )}

                {/* Input for current step */}
                {isCurrent && !isDone && (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      className="text-xs h-16 resize-none"
                      placeholder="Enter your notes/output for this step..."
                      value={stepNotes[step.stepNumber] || ""}
                      onChange={(e) => setStepNotes((prev) => ({ ...prev, [step.stepNumber]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="text-xs"
                        disabled={saveStepMutation.isPending}
                        onClick={() =>
                          saveStepMutation.mutate({
                            runId,
                            stepNumber: step.stepNumber,
                            notes: stepNotes[step.stepNumber] || "",
                            status: "completed",
                          })
                        }
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Complete Step
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={saveStepMutation.isPending}
                        onClick={() =>
                          saveStepMutation.mutate({
                            runId,
                            stepNumber: step.stepNumber,
                            status: "skipped",
                          })
                        }
                      >
                        <SkipForward className="h-3 w-3 mr-1" /> Skip
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Complete Run */}
      {isActive && steps.every((s: any) => s.status === "completed" || s.status === "skipped") && steps.length > 0 && (
        <Card className="border-green-500/30">
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-semibold text-green-500">All steps completed! Finish this workflow run.</p>
            <Textarea
              className="text-xs h-16 resize-none"
              placeholder="Summary of results..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <Button
              size="sm"
              className="text-xs"
              disabled={completeRunMutation.isPending}
              onClick={() => completeRunMutation.mutate({ runId, summary: summary || undefined })}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" /> Complete Workflow
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary for completed runs */}
      {isCompleted && run.summary && (
        <Card className="border-green-500/20">
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-green-500 mb-1">Completed</p>
            <p className="text-xs whitespace-pre-wrap">{run.summary}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
