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
import { Loader2, CheckCircle2, XCircle, Rocket, Send, Archive, AlertCircle, GitBranch } from "lucide-react";
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

  // Inline "create version" — so users don't have to navigate away
  // to the top-bar Version button when they land on the Publish page
  // with zero versions and find the Publish button disabled.
  const createVersionMut = trpc.agentStudio.versions.create.useMutation({
    onSuccess: (v: any) => {
      toast.success(`Version v${v?.versionNumber ?? ""} created`);
      utils.agentStudio.versions.list.invalidate({ agentId });
      // Auto-select the freshly created version so the Publish
      // button becomes enabled without a second click.
      if (v?.id) setVersionId(v.id);
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
            {(versionsQuery.data?.length ?? 0) === 0 ? (
              // No versions exist → don't show an empty dropdown that
              // leaves the user guessing. Show an inline CTA that
              // snapshots the current draft and auto-selects it.
              <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-2 space-y-2">
                <div className="flex items-start gap-2 text-[11px] text-yellow-300">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    This agent has no versions yet. Publishing requires a
                    snapshot of the current draft.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs w-full"
                  disabled={createVersionMut.isPending}
                  onClick={() => {
                    const label = window.prompt(
                      "Version label (e.g. v1.0 or initial snapshot):",
                      "initial snapshot"
                    );
                    if (!label) return;
                    createVersionMut.mutate({ agentId, label });
                  }}
                >
                  {createVersionMut.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <GitBranch className="h-3 w-3 mr-1" />
                  )}
                  Snapshot current draft as new version
                </Button>
              </div>
            ) : (
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
            )}
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

          {/* Disabled-reason hint — explains why the Publish button
              is greyed out so users don't click and get nothing. */}
          {(() => {
            const reasons: string[] = [];
            if (!versionId) reasons.push("select or create a version above");
            if (!preflight.publishReady) reasons.push("readiness checklist is not green");
            if (reasons.length > 0) {
              return (
                <div className="flex items-start gap-2 text-[10px] text-muted-foreground rounded border border-dashed border-border/60 px-2 py-1.5">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    Publish is disabled — to enable it, {reasons.join(" and ")}.
                  </span>
                </div>
              );
            }
            return null;
          })()}
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
              title={
                !versionId
                  ? "Select or create a version first"
                  : !preflight.publishReady
                  ? "Readiness checklist is not green"
                  : "Publish this version to the target environment"
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
