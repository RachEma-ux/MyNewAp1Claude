/**
 * IdeaBuilderWizard — 6-step wizard for Idea-to-PMI Project Builder
 *
 * Step 1: Describe idea (textarea)
 * Step 2: Optional constraints (budget, deadline, risk tier)
 * Step 3: Select methodology
 * Step 4: Run agent (DAG progress timeline)
 * Step 5: Review draft artifacts (commit/reject)
 * Step 6: Summary & finalize
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc";
import AgentBadge from "@/components/pm/AgentBadge";
import {
  Lightbulb, Settings2, BookOpen, Play, FileSearch, CheckCircle2,
  ChevronRight, ChevronDown, ChevronLeft, Check, X, Bot,
  Loader2, ArrowRight, Shield, AlertTriangle,
} from "lucide-react";

const STEPS = [
  { id: 1, label: "Describe Idea", icon: <Lightbulb className="h-4 w-4" /> },
  { id: 2, label: "Constraints", icon: <Settings2 className="h-4 w-4" /> },
  { id: 3, label: "Methodology", icon: <BookOpen className="h-4 w-4" /> },
  { id: 4, label: "Generate", icon: <Play className="h-4 w-4" /> },
  { id: 5, label: "Review", icon: <FileSearch className="h-4 w-4" /> },
  { id: 6, label: "Finalize", icon: <CheckCircle2 className="h-4 w-4" /> },
];

export default function IdeaBuilderWizard() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [ideaText, setIdeaText] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [riskTier, setRiskTier] = useState("medium");
  const [methodology, setMethodology] = useState("predictive");
  const [runId, setRunId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("");

  const launchMut = trpc.modules.pmt.shell.ideaBuilder.launch.useMutation();
  const commitMut = trpc.modules.pmt.shell.ideaBuilder.commit.useMutation();
  const commitAllMut = trpc.modules.pmt.shell.ideaBuilder.commitAll.useMutation();
  const rejectMut = trpc.modules.pmt.shell.ideaBuilder.reject.useMutation();

  const statusQuery = trpc.modules.pmt.shell.ideaBuilder.status.useQuery(
    { runId: runId! },
    { enabled: !!runId && (step === 4 || step === 5), refetchInterval: step === 4 ? 2000 : 5000 },
  );

  const draftsQuery = trpc.modules.pmt.shell.ideaBuilder.drafts.useQuery(
    { runId: runId! },
    { enabled: !!runId && step >= 5, refetchInterval: 5000 },
  );

  const run = statusQuery.data;
  const drafts = draftsQuery.data || [];

  // Auto-advance from step 4 to 5 when run completes
  useEffect(() => {
    if (step === 4 && run && (run.status === "completed" || run.status === "failed")) {
      setStep(5);
    }
  }, [step, run]);

  async function handleLaunch() {
    try {
      const result = await launchMut.mutateAsync({
        ideaText,
        ...(budget ? { budgetEnvelope: parseFloat(budget) } : {}),
        ...(deadline ? { deadline } : {}),
        riskTier: riskTier as any,
        methodology: methodology as any,
      });
      setRunId(result.runId);
      setProjectId(result.projectId);
      setProjectName(result.projectName);
      setStep(4);
    } catch (err: any) {
      console.error("Launch failed:", err.message);
    }
  }

  async function handleCommit(draftId: number) {
    await commitMut.mutateAsync({ draftId });
    draftsQuery.refetch();
  }

  async function handleReject(draftId: number) {
    await rejectMut.mutateAsync({ draftId });
    draftsQuery.refetch();
  }

  async function handleCommitAll() {
    if (!runId) return;
    await commitAllMut.mutateAsync({ runId });
    draftsQuery.refetch();
    setStep(6);
  }

  const canProceed = step === 1 ? ideaText.length >= 20
    : step === 2 ? true
    : step === 3 ? !!methodology
    : false;

  const dagNodes = (run?.planDag || []) as Array<{ id: string; agent_alias: string; status: string }>;
  const pendingDrafts = drafts.filter((d: any) => d.commitStatus === "pending");
  const committedDrafts = drafts.filter((d: any) => d.commitStatus === "committed");

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Bot className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Idea-to-PMI Builder</h1>
            <p className="text-sm text-muted-foreground">
              Convert your project idea into complete PMI artifacts
            </p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex flex-wrap items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
                  s.id === step
                    ? "bg-primary text-primary-foreground"
                    : s.id < step
                    ? "bg-green-500/15 text-green-500"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.id < step ? <Check className="h-3 w-3" /> : s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <Card className="overflow-hidden">
          <CardContent className="py-4 px-4 sm:py-6 sm:px-6">
            {/* Step 1: Describe Idea */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    Describe Your Project Idea
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Provide a detailed description. The agent will generate a full set of PMI artifacts from this.
                  </p>
                </div>
                <Textarea
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  placeholder="Describe your project idea in detail. Include the problem to solve, key deliverables, and expected outcomes. The more detail you provide, the better the generated artifacts will be..."
                  className="min-h-[200px] text-sm"
                  maxLength={5000}
                />
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>{ideaText.length} / 5,000 characters</span>
                  <span>{ideaText.length < 20 ? `${20 - ideaText.length} more characters needed` : "Ready"}</span>
                </div>
              </div>
            )}

            {/* Step 2: Constraints */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Settings2 className="h-5 w-5" />
                    Optional Constraints
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Set budget, deadline, and risk tier. All are optional.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Budget Envelope (USD)
                    </label>
                    <Input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="e.g. 500000"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Target Deadline
                    </label>
                    <Input
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Risk Tier
                    </label>
                    <Select value={riskTier} onValueChange={setRiskTier}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Methodology */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Select Methodology
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose the project management methodology.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { value: "predictive", label: "Predictive (PMI)", desc: "Full waterfall PMI approach with gates, baselines, and formal change control" },
                    { value: "agile", label: "Agile", desc: "Iterative delivery with sprints, backlogs, and continuous feedback" },
                    { value: "hybrid", label: "Hybrid", desc: "Combines predictive planning with agile execution" },
                  ].map((m) => (
                    <Card
                      key={m.value}
                      className={`cursor-pointer transition-colors ${
                        methodology === m.value ? "border-primary bg-primary/5" : "hover:border-primary/30"
                      }`}
                      onClick={() => setMethodology(m.value)}
                    >
                      <CardContent className="py-4 px-4">
                        <div className="font-medium text-sm mb-1">{m.label}</div>
                        <div className="text-xs text-muted-foreground">{m.desc}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Safety invariants banner */}
                <Card className="border-yellow-500/30 bg-yellow-500/5">
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <Shield className="h-5 w-5 text-yellow-500 shrink-0" />
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Safety:</span>{" "}
                      The agent generates draft artifacts only. It cannot approve gates, transition states,
                      lock baselines, or write canonical data. All outputs require your explicit commit.
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 4: Generate (DAG Progress) */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Play className="h-5 w-5" />
                    Generating PMI Artifacts
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    The agent is generating 11 PMI artifacts from your idea...
                  </p>
                </div>

                {run && (
                  <div className="flex items-center gap-2 mb-2">
                    <AgentBadge variant={run.status as any} />
                    {projectName && <span className="text-sm text-muted-foreground">Project: {projectName}</span>}
                  </div>
                )}

                <div className="space-y-1">
                  {dagNodes.map((node, idx) => (
                    <div key={node.id} className="flex items-center gap-3 py-1.5">
                      <div className="flex flex-col items-center w-6">
                        <div className={`w-3 h-3 rounded-full border-2 ${
                          node.status === "completed" ? "bg-green-500 border-green-500"
                          : node.status === "running" ? "bg-blue-500 border-blue-500 animate-pulse"
                          : node.status === "failed" ? "bg-red-500 border-red-500"
                          : node.status === "skipped" ? "bg-muted border-muted-foreground/30"
                          : "bg-background border-muted-foreground/30"
                        }`} />
                        {idx < dagNodes.length - 1 && (
                          <div className={`w-0.5 h-5 ${
                            node.status === "completed" ? "bg-green-500/50" : "bg-muted"
                          }`} />
                        )}
                      </div>
                      <div className="flex items-center justify-between flex-1">
                        <span className="text-sm">
                          {node.agent_alias === "_system"
                            ? node.id.replace(/_/g, " ")
                            : node.id.replace(/_/g, " ")}
                        </span>
                        <AgentBadge variant={node.status as any} />
                      </div>
                    </div>
                  ))}
                </div>

                {(!run || run.status === "pending" || run.status === "running") && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                    <span className="text-sm text-muted-foreground">Processing...</span>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Review Drafts */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <FileSearch className="h-5 w-5 shrink-0" />
                      Review Draft Artifacts
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {drafts.length} artifacts generated. Review each and commit or reject.
                    </p>
                  </div>
                  {pendingDrafts.length > 0 && (
                    <Button
                      onClick={handleCommitAll}
                      disabled={commitAllMut.isPending}
                      className="gap-1.5 shrink-0"
                    >
                      <Check className="h-4 w-4" />
                      Commit All ({pendingDrafts.length})
                    </Button>
                  )}
                </div>

                {drafts.length === 0 && run?.status === "failed" && (
                  <Card className="border-red-500/30">
                    <CardContent className="py-4 text-center">
                      <AlertTriangle className="h-6 w-6 text-red-500 mx-auto mb-2" />
                      <p className="text-sm text-red-500">Run failed. Some artifacts may not have been generated.</p>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-2">
                  {drafts.map((draft: any) => (
                    <DraftReviewCard
                      key={draft.id}
                      draft={draft}
                      onCommit={() => handleCommit(draft.id)}
                      onReject={() => handleReject(draft.id)}
                      isCommitting={commitMut.isPending}
                      isRejecting={rejectMut.isPending}
                    />
                  ))}
                </div>

                {pendingDrafts.length === 0 && drafts.length > 0 && (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-3">All drafts have been reviewed.</p>
                    <Button onClick={() => setStep(6)} className="gap-1.5">
                      Continue to Summary <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Step 6: Finalize */}
            {step === 6 && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <h2 className="text-xl font-bold">Project Created</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {projectName && <>Project "{projectName}" has been created with {committedDrafts.length} committed artifact{committedDrafts.length !== 1 ? "s" : ""}.</>}
                  </p>
                </div>

                <Card>
                  <CardContent className="py-4 px-5">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Artifacts:</span>
                        <span className="ml-2 font-medium">{drafts.length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Committed:</span>
                        <span className="ml-2 font-medium text-green-500">{committedDrafts.length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Rejected:</span>
                        <span className="ml-2 font-medium">{drafts.filter((d: any) => d.commitStatus === "rejected").length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Pending:</span>
                        <span className="ml-2 font-medium">{pendingDrafts.length}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-center gap-3 pt-4">
                  {projectId && (
                    <Button onClick={() => navigate(`/pm-central/p/${projectId}/overview`)} className="gap-1.5">
                      Open Project <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep(1);
                      setIdeaText("");
                      setBudget("");
                      setDeadline("");
                      setRiskTier("medium");
                      setMethodology("predictive");
                      setRunId(null);
                      setProjectId(null);
                      setProjectName("");
                    }}
                  >
                    Build Another
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        {step <= 3 && (
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>

            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed}
                className="gap-1.5"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleLaunch}
                disabled={!canProceed || launchMut.isPending}
                className="gap-1.5"
              >
                {launchMut.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Launching...</>
                ) : (
                  <><Play className="h-4 w-4" /> Generate Artifacts</>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// ── Draft Review Card ───────────────────────────────────────────────────────

function DraftReviewCard({
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
  const label = (draft.artifactType as string).replace(/_/g, " ");

  return (
    <Card className="overflow-hidden">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-3">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors min-w-0">
              {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <span className="capitalize truncate">{label}</span>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2 ml-auto">
            <AgentBadge
              variant={
                draft.commitStatus === "committed" ? "committed"
                : draft.commitStatus === "rejected" ? "rejected"
                : "pending"
              }
            />
            {draft.commitStatus === "pending" && (
              <>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onReject} disabled={isRejecting}>
                  <X className="h-3 w-3" /> Reject
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={onCommit} disabled={isCommitting}>
                  <Check className="h-3 w-3" /> Commit
                </Button>
              </>
            )}
          </div>
        </div>
        <CollapsibleContent>
          <div className="px-3 sm:px-4 pb-3 border-t pt-3">
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap break-words">
              {JSON.stringify(content, null, 2)}
            </pre>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
