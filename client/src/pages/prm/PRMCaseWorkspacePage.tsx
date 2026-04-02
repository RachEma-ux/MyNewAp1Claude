/**
 * PRM Case Workspace Page — Tabbed workspace
 * Tabs: Overview | Diagnosis | Decisions | Actions | Evidence | Verification | Lessons
 */
import { useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { PRMStatusBadge } from "@/components/prm/PRMStatusBadge";
import { PRMSeverityBadge } from "@/components/prm/PRMSeverityBadge";
import { PRMTimelineView } from "@/components/prm/PRMTimelineView";
import { PRMDecisionLog } from "@/components/prm/PRMDecisionLog";
import { PRMActionLedger } from "@/components/prm/PRMActionLedger";
import { PRMEvidencePanel } from "@/components/prm/PRMEvidencePanel";
import { PRMVerificationChecklist } from "@/components/prm/PRMVerificationChecklist";
import { PRMMethodWorkspace } from "@/components/prm/PRMMethodWorkspace";
import { toast } from "sonner";

type Tab = "overview" | "diagnosis" | "decisions" | "actions" | "evidence" | "verification" | "lessons";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "decisions", label: "Decisions" },
  { key: "actions", label: "Actions" },
  { key: "evidence", label: "Evidence" },
  { key: "verification", label: "Verification" },
  { key: "lessons", label: "Lessons" },
];

export default function PRMCaseWorkspacePage() {
  const [, params] = useRoute("/prm/cases/:id");
  const caseId = Number(params?.id);
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { data: caseData, isLoading } = trpc.prm.cases.getById.useQuery(
    { id: caseId },
    { enabled: !!caseId }
  );

  const { data: methodRuns } = trpc.prm.methods.listRuns.useQuery(
    { caseId },
    { enabled: !!caseId && activeTab === "diagnosis" }
  );

  const { data: lessons } = trpc.prm.lessons.list.useQuery(
    { caseId },
    { enabled: !!caseId && activeTab === "lessons" }
  );

  const utils = trpc.useUtils();
  const advanceMutation = trpc.prm.cases.setStatus.useMutation({
    onSuccess: () => {
      utils.prm.cases.getById.invalidate({ id: caseId });
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Case not found.</p>
      </div>
    );
  }

  const STATUS_NEXT: Record<string, string> = {
    draft: "intake",
    intake: "triage",
    triage: "analysis",
    analysis: "decision_pending",
    decision_pending: "in_resolution",
    in_resolution: "resolved",
    resolved: "verification_pending",
  };

  const nextStatus = STATUS_NEXT[caseData.status];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/prm/cases")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold truncate">{caseData.title}</h1>
            <span className="text-xs text-muted-foreground">#{caseData.id}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <PRMStatusBadge status={caseData.status} />
            <PRMSeverityBadge severity={caseData.severity} />
            {caseData.priority && (
              <span className="text-[10px] text-muted-foreground uppercase">{caseData.priority}</span>
            )}
          </div>
        </div>
        {nextStatus && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => advanceMutation.mutate({ id: caseId, status: nextStatus as any })}
            disabled={advanceMutation.isPending}
          >
            Advance to {nextStatus.replace(/_/g, " ")}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b mb-4 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {caseData.description && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-1">Description</h3>
              <p className="text-sm">{caseData.description}</p>
            </div>
          )}
          {caseData.impactStatement && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-1">Impact</h3>
              <p className="text-sm">{caseData.impactStatement}</p>
            </div>
          )}
          {caseData.scope && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-1">Scope</h3>
              <p className="text-sm">{caseData.scope}</p>
            </div>
          )}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">Timeline</h3>
            <PRMTimelineView caseId={caseId} />
          </div>
        </div>
      )}

      {activeTab === "diagnosis" && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Method Runs</h3>
          {methodRuns?.length ? (
            methodRuns.map((run: any) => (
              <div key={run.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium capitalize">
                    {run.methodType.replace(/_/g, " ")}
                  </span>
                  <PRMStatusBadge status={run.status} />
                </div>
                <PRMMethodWorkspace
                  runId={run.id}
                  methodType={run.methodType}
                  initialData={run.workspaceData}
                  status={run.status}
                  caseId={caseId}
                />
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No method runs started yet.</p>
          )}
        </div>
      )}

      {activeTab === "decisions" && <PRMDecisionLog caseId={caseId} />}
      {activeTab === "actions" && <PRMActionLedger caseId={caseId} />}
      {activeTab === "evidence" && <PRMEvidencePanel caseId={caseId} />}
      {activeTab === "verification" && <PRMVerificationChecklist caseId={caseId} />}

      {activeTab === "lessons" && (
        <div className="space-y-3">
          {lessons?.length ? (
            lessons.map((l: any) => (
              <div key={l.id} className="border rounded-lg p-3">
                <h4 className="text-sm font-medium">{l.title}</h4>
                {l.whatHappened && <p className="text-xs text-muted-foreground mt-1">{l.whatHappened}</p>}
                {l.whatChanged && <p className="text-xs mt-1">{l.whatChanged}</p>}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No lessons extracted yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
