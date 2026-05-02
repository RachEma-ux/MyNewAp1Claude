/**
 * AI Agent Studio — Workflows / Orchestration Page
 *
 * Standalone vs orchestrated mode, role relationships, handoff/retry/approval/
 * fallback rules, execution path summary, initial orchestration canvas.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Workflow } from "lucide-react";
import OrchestrationCanvas from "../components/OrchestrationCanvas";
import { PageHeader, LoadingState } from "../components/ui";

export default function AgentWorkflowsPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const query = trpc.agentStudio.workflows.get.useQuery({ agentId });
  const validateQuery = trpc.agentStudio.workflows.validate.useQuery({ agentId });
  const updateMut = trpc.agentStudio.workflows.update.useMutation({
    onSuccess: () => {
      toast.success("Workflows saved");
      utils.agentStudio.workflows.get.invalidate({ agentId });
      utils.agentStudio.workflows.validate.invalidate({ agentId });
      // Workflow changes affect readiness — keep shell summary fresh
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [mode, setMode] = useState<"standalone" | "orchestrated">("standalone");
  const [handoffRules, setHandoff] = useState("");
  const [retryRules, setRetry] = useState("");
  const [fallbackPath, setFallback] = useState("");
  const [escalation, setEscalation] = useState("");
  const [approvalSteps, setApproval] = useState("");

  useEffect(() => {
    if (query.data) {
      const c = (query.data.config ?? {}) as Record<string, any>;
      setMode((c.mode as any) ?? "standalone");
      setHandoff(c.handoffRules ?? "");
      setRetry(c.retryRules ?? "");
      setFallback(c.fallbackPath ?? "");
      setEscalation(c.escalation ?? "");
      setApproval(c.approvalSteps ?? "");
    }
  }, [query.data]);

  if (query.isLoading) return <LoadingState label="Loading workflows…" />;

  const handleSave = () =>
    updateMut.mutate({
      agentId,
      config: { mode, handoffRules, retryRules, fallbackPath, escalation, approvalSteps },
    });

  const nodes = query.data?.nodes ?? [];
  const edges = query.data?.edges ?? [];

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Workflows"
        subtitle="Mode, handoff/retry/approval/escalation rules, and orchestration graph"
        icon={<Workflow className="h-4 w-4" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Workflow Configuration</h3>

          <Field label="Mode">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="h-8 px-2 rounded border bg-background text-xs w-full"
            >
              <option value="standalone">Standalone</option>
              <option value="orchestrated">Orchestrated</option>
            </select>
          </Field>
          <Field label="Handoff Rules">
            <Textarea value={handoffRules} onChange={(e) => setHandoff(e.target.value)} className="text-xs min-h-[60px]" />
          </Field>
          <Field label="Retry Rules">
            <Textarea value={retryRules} onChange={(e) => setRetry(e.target.value)} className="text-xs min-h-[60px]" />
          </Field>
          <Field label="Approval Steps">
            <Textarea value={approvalSteps} onChange={(e) => setApproval(e.target.value)} className="text-xs min-h-[60px]" />
          </Field>
          <Field label="Fallback Path">
            <Textarea value={fallbackPath} onChange={(e) => setFallback(e.target.value)} className="text-xs min-h-[60px]" />
          </Field>
          <Field label="Failure Escalation">
            <Textarea value={escalation} onChange={(e) => setEscalation(e.target.value)} className="text-xs min-h-[60px]" />
          </Field>
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Save Workflows
          </Button>
        </CardContent>
      </Card>

      {/* Execution path summary + canvas placeholder */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Workflow className="h-4 w-4 text-blue-500" /> Execution Path
          </h3>
          <div className="text-xs space-y-1">
            <div>
              <strong>Mode:</strong> {mode}
            </div>
            <div>
              <strong>Nodes:</strong> {nodes.length}
            </div>
            <div>
              <strong>Edges:</strong> {edges.length}
            </div>
            <div>
              <strong>Validation:</strong>{" "}
              {validateQuery.data?.ok ? (
                <span className="text-emerald-500">OK</span>
              ) : (
                <span className="text-red-500">{validateQuery.data?.errors?.join(", ")}</span>
              )}
            </div>
          </div>
          <OrchestrationCanvas
            nodes={nodes as any}
            edges={edges as any}
            width={520}
            height={300}
          />
          <p className="text-[9px] text-muted-foreground mt-1">
            Read-only visualization. Node creation will move to a graph editor in a future phase.
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase text-muted-foreground/70">{label}</Label>
      {children}
    </div>
  );
}
