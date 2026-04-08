/**
 * AI Agent Studio — Publish / Deploy Page
 *
 * Readiness checklist, blockers, governance verdict, last sim/test summaries,
 * release notes, target environment, approval state, publish/submit/rollback/
 * archive actions.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Rocket, Send, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  VerdictBadge,
} from "@/components/agent-studio/ui";

export default function AgentPublishPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const preflightQuery = trpc.agentStudio.publish.preflight.useQuery({ agentId });
  const versionsQuery = trpc.agentStudio.versions.list.useQuery({ agentId });
  const requestsQuery = trpc.agentStudio.publish.listRequests.useQuery({ agentId });
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const approvalsQuery = trpc.agentStudio.publish.listApprovals.useQuery(
    { publishRequestId: selectedRequestId ?? 0 },
    { enabled: selectedRequestId !== null }
  );

  const decideMut = trpc.agentStudio.publish.decideApproval.useMutation({
    onSuccess: () => {
      toast.success("Decision recorded");
      if (selectedRequestId) {
        utils.agentStudio.publish.listApprovals.invalidate({
          publishRequestId: selectedRequestId,
        });
      }
      utils.agentStudio.publish.listRequests.invalidate({ agentId });
      utils.agentStudio.publish.preflight.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const withdrawMut = trpc.agentStudio.publish.withdrawRequest.useMutation({
    onSuccess: () => {
      toast.success("Request withdrawn");
      utils.agentStudio.publish.listRequests.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [versionId, setVersionId] = useState<number | null>(null);
  const [targetEnv, setTargetEnv] = useState("staging");
  const [releaseNotes, setNotes] = useState("");

  const submitMut = trpc.agentStudio.publish.submitForReview.useMutation({
    onSuccess: () => {
      toast.success("Submitted for review");
      utils.agentStudio.publish.preflight.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const publishMut = trpc.agentStudio.publish.publishVersion.useMutation({
    onSuccess: () => {
      toast.success("Published");
      utils.agentStudio.publish.preflight.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
      // Lifecycle state moves to "published" — refresh home listings
      utils.agentStudio.home.listAgents.invalidate();
      utils.agentStudio.home.getHomeSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const archiveMut = trpc.agentStudio.publish.archive.useMutation({
    onSuccess: () => {
      toast.success("Archived");
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
      // Home listings show lifecycle state — invalidate so archived hides
      utils.agentStudio.home.listAgents.invalidate();
      utils.agentStudio.home.getHomeSummary.invalidate();
      utils.agentStudio.home.getReviewQueue.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (preflightQuery.isLoading) return <LoadingState label="Loading preflight…" />;

  const preflight = preflightQuery.data!;

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Publish / Deploy"
        subtitle="Preflight gate, release package, and review/approval workflow"
        icon={<Rocket className="h-4 w-4" />}
        badges={
          <span className="ml-2">
            <VerdictBadge verdict={preflight.governance.verdict} showIcon />
          </span>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Checklist */}
      <Card className="lg:col-span-1">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Readiness Checklist</h3>
          <ul className="space-y-1.5">
            {preflight.checklist.map((c: any) => (
              <li key={c.key} className="flex items-center gap-2 text-xs">
                {c.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                )}
                <span className={cn(c.ok ? "" : "text-red-300")}>{c.label}</span>
              </li>
            ))}
          </ul>

          <div className="border-t pt-2 mt-2">
            <div className="text-[10px] text-muted-foreground">Readiness score</div>
            <div className="text-2xl font-bold">
              {preflight.readiness.score}
              <span className="text-xs text-muted-foreground">/100</span>
            </div>
          </div>

          <Badge
            className={cn(
              "text-[10px] uppercase border w-full justify-center py-1",
              preflight.publishReady
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
            )}
          >
            {preflight.publishReady ? "Publish Ready" : "Not Ready"}
          </Badge>
        </CardContent>
      </Card>

      {/* Release form */}
      <Card className="lg:col-span-2">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold">Release Package</h3>
          <Field label="Version">
            <select
              value={versionId ?? ""}
              onChange={(e) => setVersionId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="h-8 px-2 rounded border bg-background text-xs w-full"
            >
              <option value="">Select version…</option>
              {versionsQuery.data?.map((v: any) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} — {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target Environment">
            <select
              value={targetEnv}
              onChange={(e) => setTargetEnv(e.target.value)}
              className="h-8 px-2 rounded border bg-background text-xs w-full"
            >
              <option value="sandbox">Sandbox</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </Field>
          <Field label="Release Notes">
            <Textarea
              value={releaseNotes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-[80px]"
            />
          </Field>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                submitMut.mutate({
                  agentId,
                  versionId: versionId ?? undefined,
                  targetEnvironment: targetEnv as any,
                  notes: releaseNotes,
                })
              }
            >
              <Send className="h-3 w-3 mr-1" /> Submit for Review
            </Button>
            <Button
              size="sm"
              disabled={!versionId || !preflight.publishReady || publishMut.isPending}
              onClick={() =>
                publishMut.mutate({
                  agentId,
                  versionId: versionId!,
                  targetEnvironment: targetEnv as any,
                  releaseNotes,
                })
              }
            >
              {publishMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <Rocket className="h-3 w-3 mr-1" /> Publish
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400"
              onClick={() => archiveMut.mutate({ agentId })}
            >
              <Archive className="h-3 w-3 mr-1" /> Archive
            </Button>
          </div>

          {/* Risk card */}
          <div className="border-t pt-2 mt-2 space-y-1">
            <div className="text-[10px] uppercase text-muted-foreground/70 font-semibold">
              Deployment Risk
            </div>
            <p className="text-xs">
              Governance: <Badge variant="outline" className="text-[9px]">{preflight.governance.verdict}</Badge>
              {" · "}
              Risk score: {preflight.governance.riskScore}/100
            </p>
            <p className="text-[10px] text-muted-foreground">
              Latest simulation:{" "}
              {preflight.latestSimulation?.verdict ?? "(none)"}
              {" · "}
              Latest test:{" "}
              {preflight.latestTest
                ? `${preflight.latestTest.passedCount} passed / ${preflight.latestTest.failedCount} failed`
                : "(none)"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Review requests + approval steps */}
      <Card className="lg:col-span-3">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold">Review Requests</h3>
          {(requestsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState
              compact
              icon={<Send className="h-6 w-6" />}
              title="No review requests"
              description='Use "Submit for Review" above to create one.'
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <ul className="space-y-1">
                  {requestsQuery.data?.map((r: any) => (
                    <li
                      key={r.id}
                      className={`border rounded p-2 text-xs cursor-pointer ${
                        selectedRequestId === r.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/30"
                      }`}
                      onClick={() => setSelectedRequestId(r.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span>
                          <strong>#{r.id}</strong> → {r.targetEnvironment}
                        </span>
                        <Badge variant="outline" className="text-[9px]">
                          {r.state}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                      </div>
                      {r.notes && (
                        <div className="text-[10px] mt-0.5">{r.notes}</div>
                      )}
                      {r.state === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] text-red-400 mt-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            withdrawMut.mutate({ publishRequestId: r.id });
                          }}
                        >
                          Withdraw
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                {!selectedRequestId ? (
                  <p className="text-[10px] text-muted-foreground">
                    Select a request to view its approval steps.
                  </p>
                ) : approvalsQuery.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (approvalsQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-[10px] text-muted-foreground">No approval steps.</p>
                ) : (
                  <ul className="space-y-1">
                    {approvalsQuery.data?.map((s: any) => (
                      <li key={s.id} className="border rounded p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span>
                            Step {s.stepOrder} — <strong>{s.approverRole}</strong>
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              s.state === "approved"
                                ? "border-emerald-500/40 text-emerald-400"
                                : s.state === "rejected"
                                  ? "border-red-500/40 text-red-400"
                                  : "border-yellow-500/40 text-yellow-400"
                            }`}
                          >
                            {s.state}
                          </Badge>
                        </div>
                        {s.decisionNote && (
                          <div className="text-[10px] mt-0.5 opacity-80">{s.decisionNote}</div>
                        )}
                        {s.state === "pending" && (
                          <div className="flex items-center gap-1 mt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] text-emerald-400"
                              onClick={() =>
                                decideMut.mutate({
                                  stepId: s.id,
                                  decision: "approved",
                                })
                              }
                              disabled={decideMut.isPending}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-0.5" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] text-red-400"
                              onClick={() => {
                                const note = window.prompt("Rejection note?") ?? undefined;
                                decideMut.mutate({
                                  stepId: s.id,
                                  decision: "rejected",
                                  note,
                                });
                              }}
                              disabled={decideMut.isPending}
                            >
                              <XCircle className="h-3 w-3 mr-0.5" /> Reject
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
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
