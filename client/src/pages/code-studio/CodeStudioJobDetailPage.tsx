import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Play, XCircle, RotateCcw, FileCode2, Workflow,
  ArrowLeft, Circle, CheckCircle2, AlertCircle, Terminal,
  ClipboardCopy, Download, FileText, ChevronDown, ChevronRight,
  Search, Code2, MessageSquare,
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

const RESULT_KIND_LABELS: Record<string, { label: string; color: string }> = {
  inspection: { label: "Inspection / Analysis", color: "text-blue-400 border-blue-500/30" },
  implementation: { label: "Implementation", color: "text-violet-400 border-violet-500/30" },
  mixed: { label: "Mixed", color: "text-amber-400 border-amber-500/30" },
  failure: { label: "Failed", color: "text-red-400 border-red-500/30" },
};

// ── Session Transcript Viewer ─────────────────────────────────────────────

function SessionTranscript({ sessionId }: { sessionId: number }) {
  const messagesQuery = trpc.codeStudio.sessions.messages.useQuery(
    { sessionId },
    { enabled: !!sessionId }
  );
  const messages = messagesQuery.data ?? [];

  if (messagesQuery.isLoading) {
    return <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading transcript...</div>;
  }
  if (messages.length === 0) {
    return <p className="text-[10px] text-muted-foreground p-2">No messages persisted for this session.</p>;
  }

  return (
    <div className="space-y-1.5 mt-2 max-h-80 overflow-y-auto">
      {messages.map((m: any) => (
        <div key={m.id} className={`px-2.5 py-1.5 rounded text-[10px] ${m.role === "assistant" || m.role === "model" ? "bg-violet-500/5 border border-violet-500/10" : "bg-muted/30 border border-transparent"}`}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <Badge variant="secondary" className="text-[8px] px-1">{m.role}</Badge>
            {m.createdAt && <span className="text-muted-foreground">{new Date(m.createdAt).toLocaleTimeString()}</span>}
          </div>
          <p className="whitespace-pre-wrap break-words leading-relaxed">{m.contentPreview || "(empty)"}</p>
        </div>
      ))}
    </div>
  );
}

// ── Results Tab Content ───────────────────────────────────────────────────

function ResultsTab({ jobId, job }: { jobId: number; job: any }) {
  const resultsQuery = trpc.codeStudio.jobs.results.useQuery(
    { id: jobId },
    { enabled: !!jobId }
  );
  const results = resultsQuery.data;
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  if (resultsQuery.isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }

  if (!results) {
    return <p className="text-xs text-muted-foreground text-center py-8">No results available yet. Results are generated when the job completes.</p>;
  }

  const summary = results.resultSummary as any;
  const kindInfo = summary ? RESULT_KIND_LABELS[summary.resultKind] || RESULT_KIND_LABELS.inspection : null;
  const isInspection = summary?.resultKind === "inspection";

  const toggleStep = (name: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleCopyReport = () => {
    if (results.finalReportMarkdown) {
      navigator.clipboard.writeText(results.finalReportMarkdown);
      toast.success("Report copied to clipboard");
    }
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card>
            <CardContent className="p-2.5 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Kind</p>
              <Badge variant="outline" className={`text-[9px] mt-0.5 ${kindInfo?.color || ""}`}>
                {kindInfo?.label || "Unknown"}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Diffs</p>
              <p className="text-sm font-semibold">{summary.diffCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Sessions</p>
              <p className="text-sm font-semibold">{summary.sessionCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2.5 text-center">
              <p className="text-[9px] text-muted-foreground uppercase">Report</p>
              <p className="text-sm font-semibold">{summary.hasReport ? "Yes" : "No"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Inspection notice — read-only jobs are normal */}
      {isInspection && (
        <div className="flex items-start gap-2 px-3 py-2 rounded border border-blue-500/20 bg-blue-500/5 text-xs text-blue-400">
          <Search className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>This was an inspection/analysis job. No code changes were expected — the report below is the primary output.</span>
        </div>
      )}

      {/* Final Report */}
      {results.finalReportMarkdown ? (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-green-500" /> Final Report
              </h3>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-6 text-[9px] px-1.5" onClick={handleCopyReport}>
                  <ClipboardCopy className="h-3 w-3 mr-0.5" /> Copy
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[9px] px-1.5"
                  onClick={() => handleDownload(results.finalReportMarkdown!, `report-job-${jobId}.md`)}>
                  <Download className="h-3 w-3 mr-0.5" /> MD
                </Button>
                {results.finalReportJson && (
                  <Button variant="ghost" size="sm" className="h-6 text-[9px] px-1.5"
                    onClick={() => handleDownload(results.finalReportJson!, `report-job-${jobId}.json`)}>
                    <Download className="h-3 w-3 mr-0.5" /> JSON
                  </Button>
                )}
              </div>
            </div>
            <div className="text-xs leading-relaxed whitespace-pre-wrap bg-muted/30 p-3 rounded max-h-96 overflow-y-auto font-mono">
              {results.finalReportMarkdown}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">No final report generated yet.</p>
          </CardContent>
        </Card>
      )}

      {/* Step-Level Findings */}
      {results.stepOutputs && results.stepOutputs.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
              <Code2 className="h-3.5 w-3.5 text-indigo-500" /> Findings by Phase
            </h3>
            <div className="space-y-1">
              {results.stepOutputs.map((s: any) => {
                const output = typeof s.output === "object" && s.output?.summary
                  ? s.output.summary
                  : typeof s.output === "string" ? s.output : null;
                const isExpanded = expandedSteps.has(s.stepName);
                const statusInfo = STEP_STATUS_ICON[s.status] || STEP_STATUS_ICON.pending;
                const StepIcon = statusInfo.icon;

                return (
                  <div key={s.stepName} className="border rounded">
                    <button
                      className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs hover:bg-muted/30 transition-colors"
                      onClick={() => toggleStep(s.stepName)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                        <StepIcon className={`h-3 w-3 ${statusInfo.color}`} />
                        <span className="font-medium">{s.stepName?.replace(/_/g, " ")}</span>
                        {s.agentRole && <Badge variant="secondary" className="text-[8px] px-1">{s.agentRole}</Badge>}
                      </div>
                      <Badge variant="outline" className="text-[8px] capitalize">{s.status}</Badge>
                    </button>
                    {isExpanded && output && (
                      <div className="px-3 pb-2 text-[10px] whitespace-pre-wrap text-muted-foreground leading-relaxed border-t bg-muted/10">
                        <p className="pt-2">{output}</p>
                      </div>
                    )}
                    {isExpanded && !output && (
                      <div className="px-3 pb-2 text-[10px] text-muted-foreground border-t bg-muted/10">
                        <p className="pt-2 italic">No output captured for this step.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Artifacts list */}
      {results.artifacts && results.artifacts.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-2">Artifacts</h3>
            <div className="space-y-1">
              {results.artifacts.map((a: any) => (
                <div key={a.id} className="flex items-center gap-2 text-[10px] py-1">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono">{a.name}</span>
                  <Badge variant="secondary" className="text-[8px] px-1">{a.artifactType}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function CodeStudioJobDetailPage() {
  const [location, navigate] = useLocation();
  const idMatch = location.match(/\/code-studio\/jobs\/(\d+)/);
  const jobId = idMatch ? Number(idMatch[1]) : 0;
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("steps");
  const [contentExpanded, setContentExpanded] = useState(false);

  const jobQuery = trpc.codeStudio.jobs.getById.useQuery({ id: jobId }, { enabled: !!jobId });
  const job = jobQuery.data;

  const isTerminal = job && TERMINAL_STATUSES.includes(job.status);

  // Auto-select Results tab when job loads as completed
  useEffect(() => {
    if (isTerminal) setActiveTab("results");
  }, [isTerminal]);

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

  const objectiveIsLong = (job.objective?.length ?? 0) > 200;

  return (
    <div className="p-4 space-y-3">
      {/* ── 1. Header (title only) ── */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => navigate("/code-studio/jobs")} title="Back to Jobs">
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <h1 className="text-sm font-semibold flex items-center gap-2 min-w-0">
          <Workflow className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="truncate">Job #{job.id}: {job.title}</span>
        </h1>
      </div>

      {/* ── 2. Dashboard bar (always visible) ── */}
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded border bg-muted/30 text-xs">
        <Badge variant="outline" className={`text-[9px] ${STATUS_COLORS[job.status] || ""}`}>
          {job.status?.replace(/_/g, " ")}
        </Badge>
        {activeStep && (
          <span className="flex items-center gap-1.5 text-blue-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            {activeStep.stepName?.replace(/_/g, " ")} ({activeStep.agentRole})
          </span>
        )}
        <span className="flex items-center gap-1 text-[9px] ml-auto">
          <span className={`h-1.5 w-1.5 rounded-full ${ocHealthy ? "bg-green-500" : "bg-red-500"}`} />
          OpenCode {ocHealthy ? "online" : "offline"}
        </span>
        <div className="flex items-center gap-1.5">
          {job.status === "draft" && (
            <Button size="sm" className="text-xs h-6 px-2" onClick={() => startMutation.mutate({ id: jobId })}
              disabled={startMutation.isPending}>
              <Play className="h-3 w-3 mr-1" /> Start
            </Button>
          )}
          {!TERMINAL_STATUSES.includes(job.status) && job.status !== "draft" && (
            <Button size="sm" variant="destructive" className="text-xs h-6 px-2" onClick={() => cancelMutation.mutate({ id: jobId })}
              disabled={cancelMutation.isPending}>
              <XCircle className="h-3 w-3 mr-1" /> Cancel
            </Button>
          )}
          {job.status === "failed" && (
            <Button size="sm" variant="outline" className="text-xs h-6 px-2" onClick={() => retryMutation.mutate({ id: jobId })}
              disabled={retryMutation.isPending}>
              <RotateCcw className="h-3 w-3 mr-1" /> Retry
            </Button>
          )}
        </div>
      </div>

      {/* Error message */}
      {job.status === "failed" && job.errorMessage && (
        <div className="flex items-start gap-2 px-3 py-2 rounded border border-red-500/20 bg-red-500/5 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{job.errorMessage}</span>
        </div>
      )}

      {/* ── 3. Job content (collapsible prompt) ── */}
      {job.objective && (
        <Card>
          <CardContent className="p-3">
            <div className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${!contentExpanded && objectiveIsLong ? "line-clamp-4" : ""}`}>
              {job.objective}
            </div>
            {objectiveIsLong && (
              <button
                className="flex items-center gap-1 mt-1.5 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                onClick={() => setContentExpanded(v => !v)}
              >
                {contentExpanded
                  ? <><ChevronDown className="h-3 w-3" /> Show less</>
                  : <><ChevronRight className="h-3 w-3" /> Show full prompt</>}
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 4. Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-7 flex-wrap">
          <TabsTrigger value="results" className="text-[10px] h-6">Results</TabsTrigger>
          <TabsTrigger value="steps" className="text-[10px] h-6">Steps</TabsTrigger>
          <TabsTrigger value="sessions" className="text-[10px] h-6">Sessions</TabsTrigger>
          <TabsTrigger value="diffs" className="text-[10px] h-6">Diffs</TabsTrigger>
          <TabsTrigger value="workspace" className="text-[10px] h-6">Workspace</TabsTrigger>
          <TabsTrigger value="details" className="text-[10px] h-6">Details</TabsTrigger>
        </TabsList>

        {/* ── Results Tab ── */}
        <TabsContent value="results" className="mt-3">
          <ResultsTab jobId={jobId} job={job} />
        </TabsContent>

        {/* ── Steps Tab ── */}
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

        {/* ── Sessions Tab (with transcript viewer) ── */}
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
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] capitalize">{s.status}</Badge>
                      <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1"
                        onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}
                        title="View transcript">
                        <MessageSquare className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {s.opencodeSessionId && (
                    <div className="mt-1 text-[9px] text-muted-foreground font-mono truncate">
                      OC: {s.opencodeSessionId}
                    </div>
                  )}
                  {expandedSession === s.id && (
                    <SessionTranscript sessionId={s.id} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Diffs Tab ── */}
        <TabsContent value="diffs" className="mt-3">
          {(job.diffs || []).length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">No diffs recorded.</p>
              {job.status === "completed" && (
                <p className="text-[10px] text-muted-foreground mt-1">This may be an inspection/analysis job with no code changes. Check the Results tab for the report.</p>
              )}
            </div>
          )}
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

        {/* ── Workspace Tab ── */}
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

        {/* ── Details Tab ── */}
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
