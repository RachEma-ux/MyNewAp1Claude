/**
 * AI Work Console — Center Workspace Tabs
 *
 * Six tabs: Plan, Live, Diffs, Results, Logs, Audit. Each tab is a
 * self-contained view over the same `activeJob` data fetched once at
 * the shell level via `trpc.orchestrator.getJob` with 2s polling.
 *
 * Tab → data source:
 *   - Plan    → job.result.plan[] (SyscallBatch from the operator)
 *   - Live    → job.status + last-emitted syscall + live progress
 *   - Diffs   → job.executionResult.results[] filtered to fs.* actions
 *   - Results → job.executionResult.summary + per-syscall results
 *   - Logs    → job.executionResult.results[] rendered as chronological log
 *   - Audit   → trpc.orchestrator.getAuditTrail (per-syscall audit rows)
 *
 * Tab logic is adapted from client/src/pages/RunConsolePage.tsx
 * lines 230-358 (Plan/Results/Audit tabs). Live/Diffs/Logs are new
 * views added for the Work Console's enterprise layout, backed by
 * the same orchestrator data shape — no backend changes.
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  FileText,
  Activity,
  GitBranch,
  BarChart3,
  Terminal,
  ShieldCheck,
  Loader2,
  CheckCircle,
} from "lucide-react";

interface Props {
  jobId: string | null;
  job: any | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const FS_ACTIONS = new Set([
  "fs.write",
  "fs.delete",
  "fs.mkdir",
]);

export default function WorkConsoleCenterTabs({
  jobId,
  job,
  activeTab,
  onTabChange,
}: Props) {
  const [, navigate] = useLocation();

  // ── Empty state (no job selected) ──────────────────────────────────
  if (!jobId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <Terminal className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm">No job selected</p>
          <p className="text-xs">
            Describe a task in the left panel and click Run, or pick a recent job.
          </p>
        </div>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────
  if (!job) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const plan = job.result?.plan || [];
  const execResults = job.executionResult?.results || [];
  const execSummary = job.executionResult?.summary;

  const handleTabChange = (v: string) => {
    onTabChange(v);
    // Keep URL in sync — /work-console/:id/<tab>
    navigate(`/work-console/${encodeURIComponent(jobId)}/${v}`);
  };

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 min-h-0 flex flex-col">
        <TabsList className="grid grid-cols-6 mx-3 mt-2 shrink-0">
          <TabsTrigger value="plan" className="text-xs gap-1">
            <FileText className="h-3 w-3" />
            Plan
          </TabsTrigger>
          <TabsTrigger value="live" className="text-xs gap-1">
            <Activity className="h-3 w-3" />
            Live
          </TabsTrigger>
          <TabsTrigger value="diffs" className="text-xs gap-1">
            <GitBranch className="h-3 w-3" />
            Diffs
          </TabsTrigger>
          <TabsTrigger value="results" className="text-xs gap-1">
            <BarChart3 className="h-3 w-3" />
            Results
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs gap-1">
            <Terminal className="h-3 w-3" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs gap-1">
            <ShieldCheck className="h-3 w-3" />
            Audit
          </TabsTrigger>
        </TabsList>

        {/* ── Plan ─────────────────────────────────────────────── */}
        <TabsContent value="plan" className="flex-1 min-h-0 mt-2 px-3 pb-3 overflow-hidden">
          {job.result ? (
            <PlanView job={job} />
          ) : (
            <EmptyPanel
              icon={FileText}
              title={
                job.status === "generating"
                  ? "Generating plan…"
                  : job.status === "pending"
                  ? "Waiting to start…"
                  : "No plan generated"
              }
              description="Once the operator generates a plan, each syscall and its risk will appear here."
            />
          )}
        </TabsContent>

        {/* ── Live ─────────────────────────────────────────────── */}
        <TabsContent value="live" className="flex-1 min-h-0 mt-2 px-3 pb-3 overflow-hidden">
          <LiveView job={job} execResults={execResults} />
        </TabsContent>

        {/* ── Diffs ────────────────────────────────────────────── */}
        <TabsContent value="diffs" className="flex-1 min-h-0 mt-2 px-3 pb-3 overflow-hidden">
          <DiffsView plan={plan} execResults={execResults} />
        </TabsContent>

        {/* ── Results ──────────────────────────────────────────── */}
        <TabsContent value="results" className="flex-1 min-h-0 mt-2 px-3 pb-3 overflow-hidden">
          {job.executionResult ? (
            <ResultsView
              summary={execSummary}
              results={execResults}
              totalDurationMs={job.executionResult.totalDurationMs}
            />
          ) : (
            <EmptyPanel
              icon={BarChart3}
              title={
                job.status === "executing"
                  ? "Executing…"
                  : job.constraints?.autonomyLevel === 0
                  ? "Plan-only mode (L0) — no execution"
                  : "No execution results yet"
              }
              description="Results appear per-syscall once execution starts."
            />
          )}
        </TabsContent>

        {/* ── Logs ─────────────────────────────────────────────── */}
        <TabsContent value="logs" className="flex-1 min-h-0 mt-2 px-3 pb-3 overflow-hidden">
          <LogsView execResults={execResults} />
        </TabsContent>

        {/* ── Audit ────────────────────────────────────────────── */}
        <TabsContent value="audit" className="flex-1 min-h-0 mt-2 px-3 pb-3 overflow-hidden">
          <AuditView jobId={jobId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Plan view ─────────────────────────────────────────────────────────

function PlanView({ job }: { job: any }) {
  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-3 flex-1 min-h-0 flex flex-col space-y-2">
        <div className="bg-muted/50 rounded-md p-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Explanation
          </p>
          <p className="text-xs">{job.result.explain}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px]">
            Risk: {job.result.risk?.level ?? "unknown"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {job.result.plan?.length || 0} syscalls
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {job.result.modelUsed ?? "model:?"}
          </Badge>
          {job.result.providerUsed && (
            <Badge variant="outline" className="text-[10px]">
              {job.result.providerUsed}
            </Badge>
          )}
        </div>
        <Separator />
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-1.5">
            {(job.result.plan || []).map((sc: any, idx: number) => (
              <div key={idx} className="border rounded-md p-2">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {idx}. {sc.action}
                  </code>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px]",
                        sc.riskLevel === "high" && "border-red-500/40 text-red-400",
                        sc.riskLevel === "medium" && "border-amber-500/40 text-amber-400",
                        sc.riskLevel === "low" && "border-emerald-500/40 text-emerald-400"
                      )}
                    >
                      {sc.riskLevel}
                    </Badge>
                    <Badge variant="outline" className="text-[9px]">
                      L{sc.requiredAutonomyLevel}
                    </Badge>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">{sc.description}</p>
                {sc.args && Object.keys(sc.args).length > 0 && (
                  <pre className="text-[10px] mt-1 bg-muted/50 p-1.5 rounded overflow-x-auto max-h-24">
                    {JSON.stringify(sc.args, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── Live view ─────────────────────────────────────────────────────────

function LiveView({ job, execResults }: { job: any; execResults: any[] }) {
  const isActive =
    job.status === "generating" ||
    job.status === "validating" ||
    job.status === "executing" ||
    job.status === "routing";
  const lastResult = execResults[execResults.length - 1];

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-3 flex-1 min-h-0 flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          {isActive ? (
            <Loader2 className="h-4 w-4 animate-spin text-cyan-500" />
          ) : (
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          )}
          <span className="text-xs font-medium capitalize">{job.status}</span>
          {job.operator && (
            <Badge variant="outline" className="text-[10px]">
              {job.operator}
            </Badge>
          )}
          {job.constraints?.autonomyLevel != null && (
            <Badge variant="outline" className="text-[10px]">
              L{job.constraints.autonomyLevel}
            </Badge>
          )}
        </div>

        {lastResult && (
          <div className="border rounded-md p-2 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Most recent syscall
            </p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">
                {lastResult.syscallIndex}. {lastResult.action}
              </code>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px]",
                  lastResult.status === "success" && "border-emerald-500/40 text-emerald-500",
                  lastResult.status === "failed" && "border-red-500/40 text-red-500",
                  lastResult.status === "denied" && "border-amber-500/40 text-amber-500",
                  lastResult.status === "skipped" && "border-slate-500/40 text-slate-500"
                )}
              >
                {lastResult.status} ({lastResult.durationMs}ms)
              </Badge>
            </div>
            {lastResult.error && (
              <p className="text-[10px] text-red-400 mt-1">{lastResult.error}</p>
            )}
          </div>
        )}

        <Separator />
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Execution stream
        </p>
        <ScrollArea className="flex-1 min-h-0">
          {execResults.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic py-4 text-center">
              {isActive ? "Waiting for first syscall…" : "No syscalls executed."}
            </p>
          ) : (
            <div className="space-y-1">
              {execResults.map((r: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-[10px] font-mono border-b py-1"
                >
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] shrink-0",
                      r.status === "success" && "border-emerald-500/40 text-emerald-500",
                      r.status === "failed" && "border-red-500/40 text-red-500",
                      r.status === "denied" && "border-amber-500/40 text-amber-500",
                      r.status === "skipped" && "border-slate-500/40 text-slate-500"
                    )}
                  >
                    {r.status}
                  </Badge>
                  <span className="text-muted-foreground shrink-0">[{r.syscallIndex}]</span>
                  <span className="font-medium">{r.action}</span>
                  <span className="text-muted-foreground shrink-0">{r.durationMs}ms</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── Diffs view ────────────────────────────────────────────────────────

function DiffsView({ plan, execResults }: { plan: any[]; execResults: any[] }) {
  // File impact = any syscall in the PLAN that is a filesystem write
  // action, paired with its execution result (if any). If execResults
  // is not yet populated, we still show the plan's intent.
  const fileImpacts = useMemo(() => {
    return plan
      .map((sc: any, idx: number) => {
        if (!FS_ACTIONS.has(sc.action)) return null;
        const exec = execResults.find((r: any) => r.syscallIndex === idx);
        const path =
          (sc.args?.path as string) ||
          (sc.args?.file as string) ||
          (sc.args?.filename as string) ||
          "(unknown path)";
        const content =
          (sc.args?.content as string) ||
          (sc.args?.body as string) ||
          (sc.args?.diff as string) ||
          null;
        return { idx, action: sc.action, path, content, exec, description: sc.description };
      })
      .filter(Boolean);
  }, [plan, execResults]);

  if (fileImpacts.length === 0) {
    return (
      <EmptyPanel
        icon={GitBranch}
        title="No file changes"
        description="This plan doesn't contain filesystem write syscalls, or diffs aren't tracked for the chosen operator."
      />
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-3 flex-1 min-h-0 flex flex-col">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          File impact — {fileImpacts.length} change{fileImpacts.length === 1 ? "" : "s"}
        </p>
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-2">
            {fileImpacts.map((item: any) => (
              <div key={item.idx} className="border rounded-md p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[11px] font-mono truncate" title={item.path}>
                    {item.path}
                  </code>
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {item.action}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">{item.description}</p>
                {item.exec && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px]",
                      item.exec.status === "success" && "border-emerald-500/40 text-emerald-500",
                      item.exec.status === "failed" && "border-red-500/40 text-red-500",
                      item.exec.status === "denied" && "border-amber-500/40 text-amber-500"
                    )}
                  >
                    {item.exec.status} · {item.exec.durationMs}ms
                  </Badge>
                )}
                {item.content && (
                  <pre className="text-[10px] bg-muted/50 p-1.5 rounded overflow-x-auto max-h-40 whitespace-pre">
                    {typeof item.content === "string" ? item.content : JSON.stringify(item.content, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── Results view ──────────────────────────────────────────────────────

function ResultsView({
  summary,
  results,
  totalDurationMs,
}: {
  summary: any;
  results: any[];
  totalDurationMs: number;
}) {
  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-3 flex-1 min-h-0 flex flex-col space-y-2">
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { label: "Total", value: summary?.total ?? 0, color: "text-foreground" },
            { label: "OK", value: summary?.succeeded ?? 0, color: "text-emerald-500" },
            { label: "Fail", value: summary?.failed ?? 0, color: "text-red-500" },
            { label: "Denied", value: summary?.denied ?? 0, color: "text-amber-500" },
            { label: "Skip", value: summary?.skipped ?? 0, color: "text-slate-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="text-center bg-muted/50 rounded-md p-2"
            >
              <p className={cn("text-lg font-bold", stat.color)}>{stat.value}</p>
              <p className="text-[9px] text-muted-foreground uppercase">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
        <Badge variant="outline" className="text-[10px] w-fit">
          Duration: {totalDurationMs}ms
        </Badge>
        <Separator />
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-1.5">
            {results.map((r: any, idx: number) => (
              <div
                key={idx}
                className={cn(
                  "border rounded-md p-2",
                  r.status === "success" && "border-emerald-500/20",
                  r.status === "denied" && "border-amber-500/20",
                  r.status === "failed" && "border-red-500/20",
                  r.status === "skipped" && "border-slate-500/20"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[11px] font-mono">
                    {r.syscallIndex}. {r.action}
                  </code>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px]",
                      r.status === "success" && "text-emerald-500",
                      r.status === "failed" && "text-red-500",
                      r.status === "denied" && "text-amber-500",
                      r.status === "skipped" && "text-slate-500"
                    )}
                  >
                    {r.status} ({r.durationMs}ms)
                  </Badge>
                </div>
                {r.error && (
                  <p className="text-[10px] text-red-400 mt-1">{r.error}</p>
                )}
                {r.governanceDecision && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Gate: {r.governanceDecision.verdict} — {r.governanceDecision.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── Logs view ─────────────────────────────────────────────────────────

function LogsView({ execResults }: { execResults: any[] }) {
  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-3 flex-1 min-h-0 flex flex-col">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Execution log — {execResults.length} entries
        </p>
        <ScrollArea className="flex-1 min-h-0">
          {execResults.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic py-4 text-center">
              No log entries yet.
            </p>
          ) : (
            <div className="space-y-1 font-mono text-[10px]">
              {execResults.map((r: any, idx: number) => (
                <div key={idx} className="border-b py-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(r.executedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] shrink-0",
                        r.status === "success" && "border-emerald-500/40 text-emerald-500",
                        r.status === "failed" && "border-red-500/40 text-red-500",
                        r.status === "denied" && "border-amber-500/40 text-amber-500",
                        r.status === "skipped" && "border-slate-500/40 text-slate-500"
                      )}
                    >
                      {r.status}
                    </Badge>
                    <span className="font-medium">
                      [{r.syscallIndex}] {r.action}
                    </span>
                    <span className="text-muted-foreground ml-auto shrink-0">
                      {r.durationMs}ms
                    </span>
                  </div>
                  {r.output !== undefined && r.output !== null && (
                    <pre className="mt-1 pl-4 text-muted-foreground max-h-20 overflow-auto">
                      {typeof r.output === "string"
                        ? r.output
                        : JSON.stringify(r.output, null, 2)}
                    </pre>
                  )}
                  {r.error && (
                    <p className="mt-1 pl-4 text-red-400">{r.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── Audit view ────────────────────────────────────────────────────────

function AuditView({ jobId }: { jobId: string }) {
  const auditQuery = trpc.orchestrator.getAuditTrail.useQuery({
    jobId,
    limit: 200,
  });

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-3 flex-1 min-h-0 flex flex-col">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Governance audit trail
        </p>
        <ScrollArea className="flex-1 min-h-0">
          {auditQuery.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : !auditQuery.data || auditQuery.data.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center italic py-4">
              No audit entries.
            </p>
          ) : (
            <div className="space-y-1">
              {auditQuery.data.map((entry: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-[10px] font-mono border-b py-1"
                >
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] shrink-0",
                      entry.verdict === "allow" && "text-emerald-500",
                      entry.verdict === "deny" && "text-red-500",
                      entry.verdict === "escalate" && "text-amber-500"
                    )}
                  >
                    {entry.verdict}
                  </Badge>
                  <span className="text-muted-foreground shrink-0">
                    [{entry.syscallIndex}]
                  </span>
                  <span className="font-medium">{entry.action}</span>
                  <span className="text-muted-foreground truncate flex-1">
                    {entry.reason}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {entry.durationMs}ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ── Empty panel helper ────────────────────────────────────────────────

function EmptyPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Card className="h-full">
      <CardContent className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-1.5 px-6">
          <Icon className="h-8 w-8 mx-auto opacity-30" />
          <p className="text-xs font-medium">{title}</p>
          <p className="text-[10px]">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
