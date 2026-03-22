/**
 * AgentRunDetailPanel — Run detail view with DAG timeline, drafts, and audit
 *
 * Sections:
 *   - Run header (project, type, pack, status, timestamps)
 *   - DAG timeline (visual step list with status badges)
 *   - Draft outputs (expandable cards with Commit/Reject buttons)
 *   - Audit trail
 */

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc";
import AgentBadge from "@/components/pm/AgentBadge";
import {
  ArrowLeft, Bot, ChevronDown, ChevronRight, Check, X,
  Clock, FileText, Shield, Activity,
} from "lucide-react";

export default function AgentRunDetailPanel() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/pm-central/agent-engine/run/:id");
  const runId = params?.id ? parseInt(params.id) : 0;

  const runQuery = trpc.modules.pmt.shell.agentEngine.runs.get.useQuery(
    { id: runId },
    { enabled: runId > 0, refetchInterval: 3000 },
  );
  const draftsQuery = trpc.modules.pmt.shell.agentEngine.drafts.list.useQuery(
    { runId },
    { enabled: runId > 0, refetchInterval: 3000 },
  );
  const auditQuery = trpc.modules.pmt.shell.agentEngine.audit.listByRun.useQuery(
    { runId },
    { enabled: runId > 0, refetchInterval: 5000 },
  );

  const commitDraft = trpc.modules.pmt.shell.agentEngine.drafts.commit.useMutation();
  const rejectDraft = trpc.modules.pmt.shell.agentEngine.drafts.reject.useMutation();
  const cancelRun = trpc.modules.pmt.shell.agentEngine.runs.cancel.useMutation();

  const run = runQuery.data;
  const drafts = draftsQuery.data || [];
  const auditEvents = auditQuery.data || [];

  if (!run && runQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Run not found
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Run not found
      </div>
    );
  }

  const dagNodes = (run.planDag || []) as Array<{
    id: string; agent_alias: string; depends_on: string[]; status: string;
  }>;

  async function handleCommit(draftId: number) {
    await commitDraft.mutateAsync({ id: draftId });
    draftsQuery.refetch();
    auditQuery.refetch();
  }

  async function handleReject(draftId: number) {
    await rejectDraft.mutateAsync({ id: draftId });
    draftsQuery.refetch();
    auditQuery.refetch();
  }

  async function handleCancel() {
    await cancelRun.mutateAsync({ id: runId });
    runQuery.refetch();
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2"
          onClick={() => navigate("/pm-central/agent-engine")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Agent Engine
        </Button>

        {/* Run Header */}
        <Card>
          <CardContent className="py-4 px-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Bot className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-lg font-bold">
                    Run #{run.id} — {run.runType.replace(/_/g, " ")}
                  </h1>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Pack: {run.packId.replace(/_/g, " ")} | Project #{run.projectId}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AgentBadge variant={run.status as any} />
                {(run.status === "pending" || run.status === "running") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={cancelRun.isPending}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Created: {new Date(run.createdAt).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Updated: {new Date(run.updatedAt).toLocaleString()}
              </span>
              {run.phase && <span>Phase: {run.phase}</span>}
            </div>
          </CardContent>
        </Card>

        {/* DAG Timeline */}
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Execution Timeline
          </h2>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="space-y-1">
                {dagNodes.map((node, idx) => (
                  <div key={node.id} className="flex items-center gap-3 py-2">
                    {/* Step line indicator */}
                    <div className="flex flex-col items-center w-6">
                      <div className={`w-3 h-3 rounded-full border-2 ${
                        node.status === "completed" ? "bg-green-500 border-green-500"
                          : node.status === "running" ? "bg-blue-500 border-blue-500 animate-pulse"
                          : node.status === "failed" ? "bg-red-500 border-red-500"
                          : node.status === "skipped" ? "bg-muted border-muted-foreground/30"
                          : "bg-background border-muted-foreground/30"
                      }`} />
                      {idx < dagNodes.length - 1 && (
                        <div className={`w-0.5 h-6 ${
                          node.status === "completed" ? "bg-green-500/50" : "bg-muted"
                        }`} />
                      )}
                    </div>

                    {/* Node info */}
                    <div className="flex items-center justify-between flex-1 min-w-0">
                      <div>
                        <div className="text-sm font-medium">
                          {node.agent_alias === "_system"
                            ? node.id.replace(/_/g, " ")
                            : node.agent_alias.replace(/_/g, " ")}
                        </div>
                        {node.depends_on.length > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            depends on: {node.depends_on.join(", ")}
                          </div>
                        )}
                      </div>
                      <AgentBadge variant={node.status as any} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Draft Outputs */}
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Draft Outputs
            <span className="text-xs text-muted-foreground font-normal">({drafts.length})</span>
          </h2>
          {drafts.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                {run.status === "pending" || run.status === "running"
                  ? "Waiting for agents to produce drafts..."
                  : "No drafts produced."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {drafts.map((draft: any) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onCommit={() => handleCommit(draft.id)}
                  onReject={() => handleReject(draft.id)}
                  isCommitting={commitDraft.isPending}
                  isRejecting={rejectDraft.isPending}
                />
              ))}
            </div>
          )}
        </div>

        {/* Audit Trail */}
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Audit Trail
            <span className="text-xs text-muted-foreground font-normal">({auditEvents.length})</span>
          </h2>
          {auditEvents.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No audit events yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-2 px-0">
                <div className="max-h-64 overflow-y-auto">
                  {auditEvents.map((evt: any) => (
                    <div
                      key={evt.id}
                      className="flex items-center gap-3 px-4 py-1.5 text-xs border-b last:border-0"
                    >
                      <span className="text-muted-foreground font-mono w-16 shrink-0">
                        {new Date(evt.createdAt).toLocaleTimeString()}
                      </span>
                      <span className="font-medium w-28 shrink-0 truncate">
                        {evt.agentAlias.replace(/_/g, " ")}
                      </span>
                      <AgentBadge
                        variant={
                          evt.eventType.includes("completed") || evt.eventType.includes("committed")
                            ? "completed"
                            : evt.eventType.includes("failed") || evt.eventType.includes("denied") || evt.eventType.includes("rejected")
                            ? "failed"
                            : evt.eventType.includes("started")
                            ? "running"
                            : "pending"
                        }
                        label={evt.eventType.replace(/_/g, " ")}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

// ── Draft Card ──────────────────────────────────────────────────────────────

function DraftCard({
  draft,
  onCommit,
  onReject,
  isCommitting,
  isRejecting,
}: {
  draft: any;
  onCommit: () => void;
  onReject: () => void;
  isCommitting: boolean;
  isRejecting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = draft.content || {};

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="flex items-center justify-between px-4 py-3">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {draft.artifactType.replace(/_/g, " ")}
              <span className="text-[10px] text-muted-foreground font-normal">
                by {draft.sourceAgentAlias.replace(/_/g, " ")}
              </span>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            <AgentBadge
              variant={
                draft.commitStatus === "committed" ? "committed"
                  : draft.commitStatus === "rejected" ? "rejected"
                  : "pending"
              }
            />
            {draft.commitStatus === "pending" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={onReject}
                  disabled={isRejecting}
                >
                  <X className="h-3 w-3" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={onCommit}
                  disabled={isCommitting}
                >
                  <Check className="h-3 w-3" />
                  Commit
                </Button>
              </>
            )}
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-3 border-t pt-3">
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-64 overflow-y-auto">
              {JSON.stringify(content, null, 2)}
            </pre>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
