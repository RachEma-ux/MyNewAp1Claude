/**
 * PSValidationQueueTab — Admin Validation Queue
 *
 * Shows PS projects pending governance review. Admin can:
 *   - Approve (SUBMITTED → VALIDATED)
 *   - Reject (SUBMITTED → REJECTED) with required reason
 *   - Override Scope with required reason
 *   - Send to PM Central (VALIDATED → SENT_TO_PM)
 *
 * Displays: scenario, context, top scopes, explainability, confidence.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  Loader2,
  Send,
  Shield,
  FileText,
  Target,
  ThumbsUp,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ── Status badge ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-500/10 text-gray-500 border-gray-500/30" },
  DRAFT: { label: "Draft", className: "bg-gray-500/10 text-gray-500 border-gray-500/30" },
  SUBMITTED: { label: "Submitted", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  VALIDATED: { label: "Approved", className: "bg-green-500/10 text-green-600 border-green-500/30" },
  REJECTED: { label: "Rejected", className: "bg-red-500/10 text-red-600 border-red-500/30" },
  SENT_TO_PM: { label: "Sent to PM", className: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return <Badge className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>;
}

function ConfidenceBadge({ confidence }: { confidence: string | null }) {
  if (!confidence) return null;
  const lower = confidence.toLowerCase();
  const cls =
    lower === "high"
      ? "bg-green-500/10 text-green-600 border-green-500/30"
      : lower === "medium"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
        : "bg-red-500/10 text-red-600 border-red-500/30";
  return (
    <Badge className={`text-xs ${cls}`}>
      <Shield className="w-3 h-3 mr-1" />
      {confidence}
    </Badge>
  );
}

// ── Expanded project detail ─────────────────────────────────────────

function ProjectDetail({ project }: { project: any }) {
  const topScopes = (project.topScopesJson ?? []) as Array<{
    scopeCode: string;
    scopeLabel: string;
    score: number;
  }>;

  const explainability = (project.explainabilityJson ?? {
    positiveContributors: [],
    negativeContributors: [],
  }) as { positiveContributors: string[]; negativeContributors: string[] };

  const context = (project.contextJson ?? {}) as Record<string, string>;
  const contextEntries = Object.entries(context).filter(([, v]) => v);

  return (
    <div className="space-y-3 pt-2">
      {/* Scenario */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
          <FileText className="w-3 h-3" /> Scenario
        </h4>
        <p className="text-sm bg-muted/50 rounded p-2">{project.scenario || "—"}</p>
      </div>

      {/* Context */}
      {contextEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Context</h4>
          <div className="grid grid-cols-2 gap-1.5 text-sm">
            {contextEntries.map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="text-muted-foreground capitalize text-xs">
                  {key.replace(/([A-Z])/g, " $1").trim()}:
                </span>
                <span className="font-medium text-xs">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Scopes */}
      {topScopes.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
            <Target className="w-3 h-3" /> Top Scopes
          </h4>
          <div className="space-y-1">
            {topScopes.map((s, i) => (
              <div
                key={s.scopeCode}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground w-4 text-right text-xs">
                    #{i + 1}
                  </span>
                  <span>{s.scopeLabel}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {s.scopeCode}
                  </Badge>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    i === 0
                      ? "text-green-600 border-green-500/30"
                      : "text-muted-foreground"
                  }`}
                >
                  {s.score}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Explainability */}
      {(explainability.positiveContributors?.length > 0 ||
        explainability.negativeContributors?.length > 0) && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
            <ThumbsUp className="w-3 h-3" /> Explainability
          </h4>
          {explainability.positiveContributors?.length > 0 && (
            <div className="mb-1.5">
              <span className="text-[10px] text-green-600 font-medium">
                Positive signals:
              </span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {explainability.positiveContributors.map((c, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-[10px] text-green-600 border-green-500/30"
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {explainability.negativeContributors?.length > 0 && (
            <div>
              <span className="text-[10px] text-amber-600 font-medium">
                Competing signals:
              </span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {explainability.negativeContributors.map((c, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-[10px] text-amber-600 border-amber-500/30"
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Validation note (if exists) */}
      {project.validationNote && (
        <div className="text-sm rounded border border-muted p-2 bg-muted/30">
          <span className="text-xs text-muted-foreground">Validation note: </span>
          {project.validationNote}
        </div>
      )}
    </div>
  );
}

// ── Action buttons for a project row ────────────────────────────────

function ProjectActions({
  project,
  onActionComplete,
}: {
  project: any;
  onActionComplete: () => void;
}) {
  const [actionMode, setActionMode] = useState<
    "none" | "reject" | "override" | "sendToPM"
  >("none");
  const [note, setNote] = useState("");
  const [newScopeCode, setNewScopeCode] = useState("");
  const [workspaceId, setWorkspaceId] = useState("1");

  const approveMut = trpc.ps.governance.approve.useMutation({
    onSuccess: () => {
      toast.success("Project approved");
      onActionComplete();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMut = trpc.ps.governance.reject.useMutation({
    onSuccess: () => {
      toast.success("Project rejected");
      setActionMode("none");
      setNote("");
      onActionComplete();
    },
    onError: (e) => toast.error(e.message),
  });

  const overrideMut = trpc.ps.governance.overrideScope.useMutation({
    onSuccess: () => {
      toast.success("Scope overridden");
      setActionMode("none");
      setNote("");
      setNewScopeCode("");
      onActionComplete();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendToPMMut = trpc.ps.pmBridge.sendToPM.useMutation({
    onSuccess: () => {
      toast.success("Project sent to PM Central");
      setActionMode("none");
      onActionComplete();
    },
    onError: (e) => toast.error(e.message),
  });

  const isSubmitted = project.status === "SUBMITTED";
  const isValidated = project.status === "VALIDATED";
  const isSent = project.status === "SENT_TO_PM";
  const isRejected = project.status === "REJECTED";
  const isPending = approveMut.isPending || rejectMut.isPending || overrideMut.isPending || sendToPMMut.isPending;

  return (
    <div className="space-y-2">
      {/* Primary actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {isSubmitted && (
          <>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={isPending}
              onClick={() =>
                approveMut.mutate({ id: project.id, note: null })
              }
            >
              {approveMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => setActionMode("reject")}
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              Reject
            </Button>
          </>
        )}

        {!isSent && !isRejected && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => setActionMode("override")}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
            Override Scope
          </Button>
        )}

        {isValidated && (
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            disabled={isPending}
            onClick={() => setActionMode("sendToPM")}
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            Send to PM
          </Button>
        )}
      </div>

      {/* Reject form */}
      {actionMode === "reject" && (
        <div className="flex items-start gap-2 p-2 rounded border border-red-500/20 bg-red-500/5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Rejection reason (required)..."
            className="flex-1 text-sm rounded border border-border bg-background p-2 min-h-[60px] resize-y"
            autoFocus
          />
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant="destructive"
              disabled={!note.trim() || isPending}
              onClick={() =>
                rejectMut.mutate({ id: project.id, note: note.trim() })
              }
            >
              {rejectMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setActionMode("none");
                setNote("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Override scope form */}
      {actionMode === "override" && (
        <div className="space-y-2 p-2 rounded border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Current scope:{" "}
              <Badge variant="outline" className="text-[10px]">
                {project.selectedScopeCode}
              </Badge>
            </span>
          </div>
          <input
            value={newScopeCode}
            onChange={(e) => setNewScopeCode(e.target.value)}
            placeholder="New scope code (e.g. AGILE_PRODUCT)"
            className="w-full text-sm rounded border border-border bg-background p-2"
            autoFocus
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Override reason (required)..."
            className="w-full text-sm rounded border border-border bg-background p-2 min-h-[50px] resize-y"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={
                !newScopeCode.trim() || !note.trim() || isPending
              }
              onClick={() =>
                overrideMut.mutate({
                  id: project.id,
                  newScopeCode: newScopeCode.trim(),
                  reason: note.trim(),
                })
              }
            >
              {overrideMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
              )}
              Override
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setActionMode("none");
                setNote("");
                setNewScopeCode("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Send to PM confirmation */}
      {actionMode === "sendToPM" && (
        <div className="space-y-2 p-2 rounded border border-indigo-500/20 bg-indigo-500/5">
          <p className="text-sm">
            This will create a PM Central project and lock the PS classification.
          </p>
          <input
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            placeholder="Workspace ID"
            className="w-full text-sm rounded border border-border bg-background p-2"
            type="number"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={!workspaceId || isPending}
              onClick={() =>
                sendToPMMut.mutate({
                  psProjectId: project.id,
                  workspaceId: Number(workspaceId),
                })
              }
            >
              {sendToPMMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1" />
              )}
              Confirm Send
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActionMode("none")}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Project Row (expandable) ────────────────────────────────────────

function ProjectRow({
  project,
  onActionComplete,
}: {
  project: any;
  onActionComplete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-4 pb-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-sm truncate">{project.name}</h3>
              <StatusBadge status={project.status} />
              <ConfidenceBadge confidence={project.confidence} />
              <Badge variant="outline" className="text-[10px]">
                {project.selectedScopeCode}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>#{project.id}</span>
              {project.createdAt && (
                <span>
                  {new Date(project.createdAt).toLocaleDateString()}{" "}
                  {new Date(project.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              {project.pmProjectId && (
                <Badge
                  variant="outline"
                  className="text-[10px] text-indigo-600 border-indigo-500/30"
                >
                  PM #{project.pmProjectId}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-7 w-7 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <>
            <ProjectDetail project={project} />
            <div className="pt-2 border-t">
              <ProjectActions
                project={project}
                onActionComplete={onActionComplete}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Tab Component ──────────────────────────────────────────────

export function PSValidationQueueTab() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  );

  const {
    data: projects,
    isLoading,
    refetch,
  } = trpc.ps.governance.queue.useQuery(
    statusFilter ? { status: statusFilter } : {},
  );

  const filters = [
    { value: undefined, label: "All" },
    { value: "SUBMITTED", label: "Pending" },
    { value: "VALIDATED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
    { value: "SENT_TO_PM", label: "Sent to PM" },
  ];

  const counts = projects
    ? {
        total: projects.length,
        submitted: projects.filter((p) => p.status === "SUBMITTED").length,
        validated: projects.filter((p) => p.status === "VALIDATED").length,
        rejected: projects.filter((p) => p.status === "REJECTED").length,
        sentToPM: projects.filter((p) => p.status === "SENT_TO_PM").length,
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-500" />
          Validation Queue
        </h2>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {counts && (
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          <div className="rounded border p-2">
            <div className="font-medium text-lg">{counts.total}</div>
            <div className="text-muted-foreground">Total</div>
          </div>
          <div className="rounded border border-blue-500/20 bg-blue-500/5 p-2">
            <div className="font-medium text-lg text-blue-600">
              {counts.submitted}
            </div>
            <div className="text-muted-foreground">Pending</div>
          </div>
          <div className="rounded border border-green-500/20 bg-green-500/5 p-2">
            <div className="font-medium text-lg text-green-600">
              {counts.validated}
            </div>
            <div className="text-muted-foreground">Approved</div>
          </div>
          <div className="rounded border border-red-500/20 bg-red-500/5 p-2">
            <div className="font-medium text-lg text-red-600">
              {counts.rejected}
            </div>
            <div className="text-muted-foreground">Rejected</div>
          </div>
          <div className="rounded border border-indigo-500/20 bg-indigo-500/5 p-2">
            <div className="font-medium text-lg text-indigo-600">
              {counts.sentToPM}
            </div>
            <div className="text-muted-foreground">Sent to PM</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Filter:</span>
        {filters.map((f) => (
          <Button
            key={f.label}
            size="sm"
            variant={statusFilter === f.value ? "default" : "outline"}
            onClick={() => setStatusFilter(f.value)}
            className="text-xs"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !projects || projects.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col items-center text-muted-foreground">
              <AlertTriangle className="w-8 h-8 mb-2" />
              <p className="text-sm">
                {statusFilter
                  ? `No ${statusFilter.toLowerCase()} projects found.`
                  : "No PS projects in the queue yet."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              onActionComplete={() => refetch()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
