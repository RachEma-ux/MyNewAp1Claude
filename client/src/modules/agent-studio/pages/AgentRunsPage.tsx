/**
 * AI Agent Studio — Runs / Traces Page
 *
 * Run list, filtering, run detail, expandable trace inspector with tabs:
 * input, output, tool payloads, retrieved context, memory events, policy
 * events, audit events.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Activity,
  ShieldQuestion,
  Check,
  X,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader,
  EmptyState,
  ErrorCallout,
  LoadingState,
} from "../components/ui";

export default function AgentRunsPage({
  agentId,
  runId: routeRunId,
}: {
  agentId: number;
  /** When the URL is /agent-studio/:agentId/runs/:runId, this is set */
  runId?: number | null;
}) {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const runsQuery = trpc.agentStudio.runs.list.useQuery({
    agentId,
    limit: 50,
    status: statusFilter || undefined,
  });
  const [selectedRunId, setSelectedRunId] = useState<number | null>(routeRunId ?? null);

  // Sync URL → state when the route changes
  useEffect(() => {
    if (routeRunId != null && routeRunId !== selectedRunId) {
      setSelectedRunId(routeRunId);
    }
  }, [routeRunId]);

  // Sync state → URL when user clicks a row
  const selectRun = (id: number) => {
    setSelectedRunId(id);
    navigate(`/agent-studio/${agentId}/runs/${id}`);
  };

  const detailQuery = trpc.agentStudio.runs.getDetail.useQuery(
    { runId: selectedRunId ?? 0 },
    { enabled: selectedRunId !== null }
  );

  // Phase 12: Pull the runtime config so the Output tab can honor the
  // agent's outputStyle and the trace inspector can show a status line.
  const runtimeConfigQuery = trpc.agentStudio.runtime.get.useQuery(
    { agentId },
    { enabled: agentId > 0 }
  );
  const outputStyle =
    ((runtimeConfigQuery.data as any)?.outputStyle as string | null) ?? "plain";
  const statusLineConfig =
    ((runtimeConfigQuery.data as any)?.statusLineConfig as Record<
      string,
      unknown
    >) ?? {};
  const showModelInStatus = statusLineConfig.showModel !== false;
  const showCostInStatus = statusLineConfig.showCost !== false;
  const showTimeInStatus = statusLineConfig.showTime !== false;
  const customStatusText = (statusLineConfig.customText as string) ?? "";

  // Phase 3: poll for pending permission requests while the run is live.
  // The simulation engine creates rows here when a permission rule says
  // "ask"; the resolver loop blocks the agent until we flip status.
  const isRunLive = detailQuery.data?.run?.status === "running";
  const utils = trpc.useUtils();
  const pendingPermsQuery = trpc.agentStudio.permissions.listPending.useQuery(
    { runtimeRunId: selectedRunId ?? 0 },
    {
      enabled: selectedRunId !== null && isRunLive,
      refetchInterval: 2000, // 2s poll while live
    }
  );
  const decidePermMut = trpc.agentStudio.permissions.decide.useMutation({
    onSuccess: () => {
      utils.agentStudio.permissions.listPending.invalidate();
      utils.agentStudio.runs.getDetail.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const pendingRequests = (pendingPermsQuery.data ?? []).filter(
    (r: any) => r.status === "pending"
  );

  // Phase 6: slash command input + transcript. The transcript is local to
  // the page (not persisted) — it's a scratchpad for the operator to see
  // /help, /cost, etc. results inline without leaving the runs page.
  const [slashInput, setSlashInput] = useState("");
  const [slashTranscript, setSlashTranscript] = useState<
    Array<{ ts: number; ok: boolean; raw: string; message: string }>
  >([]);
  const slashMut = trpc.agentStudio.slashCommands.execute.useMutation({
    onSuccess: (result) => {
      setSlashTranscript((prev) => [
        ...prev,
        {
          ts: Date.now(),
          ok: result.ok,
          raw: slashInput,
          message: result.message,
        },
      ]);
      setSlashInput("");
      // /cancel and /cwd both touch the run/draft — refetch the detail
      utils.agentStudio.runs.getDetail.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  function submitSlashCommand() {
    if (!slashInput.trim() || !selectedRunId) return;
    slashMut.mutate({
      runtimeRunId: selectedRunId,
      rawInput: slashInput.trim(),
    });
  }

  // Phase 11: resume / compact mutations. Resume needs new input from
  // the user via window.prompt; compact takes nothing extra.
  const resumeMut = trpc.agentStudio.runs.resume.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Resumed → new run #${result.newRunId} (${result.preambleChars} chars preamble)`
      );
      utils.agentStudio.runs.list.invalidate();
      selectRun(result.newRunId);
    },
    onError: (e) => toast.error(e.message),
  });
  const compactMut = trpc.agentStudio.runs.compact.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Compacted → new run #${result.newRunId} (${result.preambleChars} chars summary)`
      );
      utils.agentStudio.runs.list.invalidate();
      selectRun(result.newRunId);
    },
    onError: (e) => toast.error(e.message),
  });

  // Phase 8: subagent invocation. Hits the runs sub-router which spawns
  // a child run with parentRunId set, then we navigate to the child.
  const invokeSubagentMut = trpc.agentStudio.runs.invokeSubagent.useMutation({
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error ?? "Subagent invocation failed");
        return;
      }
      toast.success(`Subagent spawned → run #${result.childRunId}`);
      utils.agentStudio.runs.list.invalidate();
      utils.agentStudio.runs.getTree.invalidate();
      if (result.childRunId) selectRun(result.childRunId);
    },
    onError: (e) => toast.error(e.message),
  });
  function handleInvokeSubagent() {
    if (!selectedRunId) return;
    const subagentName = window.prompt("Subagent name to invoke?");
    if (!subagentName) return;
    const subagentInput = window.prompt(
      `Input to pass to subagent "${subagentName}"?`
    );
    if (!subagentInput) return;
    invokeSubagentMut.mutate({
      parentRunId: selectedRunId,
      subagentName,
      input: subagentInput,
    });
  }
  // Tree query — fetched whenever a run is selected so we can show
  // child runs nested under their parent in the trace inspector.
  const treeQuery = trpc.agentStudio.runs.getTree.useQuery(
    { runId: selectedRunId ?? 0 },
    { enabled: selectedRunId !== null }
  );
  function handleResume() {
    if (!selectedRunId) return;
    const newInput = window.prompt(
      "New input to continue with (the prior run's output will be included as context):"
    );
    if (!newInput) return;
    resumeMut.mutate({ sourceRunId: selectedRunId, newInput });
  }
  function handleCompact() {
    if (!selectedRunId) return;
    if (
      !window.confirm(
        "Compact this run? A new run will start with a summary of this one as context."
      )
    )
      return;
    compactMut.mutate({ sourceRunId: selectedRunId });
  }

  if (runsQuery.isLoading) return <LoadingState label="Loading runs…" />;

  const runs = runsQuery.data ?? [];

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Runs / Traces"
        subtitle="Runtime executions, simulation runs, and detailed trace inspection"
        icon={<Activity className="h-4 w-4 text-cyan-500" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Run list */}
      <Card className="lg:col-span-1">
        <CardContent className="p-3">
          <h3 className="text-sm font-semibold flex items-center gap-1 mb-2">
            <Activity className="h-3.5 w-3.5 text-cyan-500" /> Runs
          </h3>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-7 px-2 rounded border bg-background text-[10px] w-full mb-2"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          {runs.length === 0 ? (
            <EmptyState
              compact
              icon={<Activity className="h-6 w-6" />}
              title="No runtime runs"
              description="Simulation runs and live executions appear here."
            />
          ) : (
            <ul className="space-y-1">
              {runs.map((r: any) => (
                <li
                  key={r.id}
                  onClick={() => selectRun(r.id)}
                  className={`text-xs border rounded p-2 cursor-pointer ${
                    selectedRunId === r.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px]">#{r.id}</span>
                    <Badge variant="outline" className="text-[9px]">
                      {r.status}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.environment} · {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                  </div>
                  {/* Phase 5: tokens + cost when usage was captured */}
                  {(r.totalTokens != null || r.costMicrocents != null) && (
                    <div className="text-[9px] text-muted-foreground/80 font-mono mt-0.5">
                      {r.totalTokens != null && `${formatTokens(r.totalTokens)} tok`}
                      {r.totalTokens != null && r.costMicrocents != null && " · "}
                      {r.costMicrocents != null && formatCost(r.costMicrocents)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Trace inspector */}
      <Card className="lg:col-span-2">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="text-sm font-semibold">Trace Inspector</h3>
            <div className="flex items-center gap-2">
              {/* Phase 5: usage strip */}
              {detailQuery.data?.run &&
                (detailQuery.data.run.totalTokens != null ||
                  detailQuery.data.run.costMicrocents != null) && (
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {detailQuery.data.run.inputTokens != null &&
                      `${formatTokens(detailQuery.data.run.inputTokens)} in`}
                    {detailQuery.data.run.outputTokens != null &&
                      ` · ${formatTokens(detailQuery.data.run.outputTokens)} out`}
                    {detailQuery.data.run.totalTokens != null &&
                      ` · ${formatTokens(detailQuery.data.run.totalTokens)} total`}
                    {detailQuery.data.run.costMicrocents != null &&
                      ` · ${formatCost(detailQuery.data.run.costMicrocents)}`}
                  </div>
                )}
              {/* Phase 11: resume / compact — only when run is terminal */}
              {detailQuery.data?.run &&
                (detailQuery.data.run.status === "completed" ||
                  detailQuery.data.run.status === "failed") && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      disabled={resumeMut.isPending}
                      onClick={handleResume}
                      title="Resume — start a new run with this run's history as context"
                    >
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      disabled={compactMut.isPending}
                      onClick={handleCompact}
                      title="Compact — start a new run with a summary of this one as context"
                    >
                      Compact
                    </Button>
                  </>
                )}
              {/* Phase 8: spawn child subagent — available on any run */}
              {detailQuery.data?.run && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  disabled={invokeSubagentMut.isPending}
                  onClick={handleInvokeSubagent}
                  title="Spawn child — invoke a subagent as a child run of this one"
                >
                  Spawn Child
                </Button>
              )}
            </div>
          </div>
          {!selectedRunId ? (
            <EmptyState
              compact
              title="Select a run"
              description="Pick a run on the left to inspect its trace."
            />
          ) : detailQuery.isLoading ? (
            <LoadingState label="Loading trace…" />
          ) : detailQuery.error ? (
            <ErrorCallout
              title={`Run #${selectedRunId}`}
              message={detailQuery.error.message}
            />
          ) : !detailQuery.data ? (
            <EmptyState compact title="Run not found" />
          ) : (
            <>
            {/* Phase 3: Pending permission request banner — only when the
                run is live and has unresolved "ask" requests. */}
            {/* Phase 12: status line — model · cost · time · custom */}
            {(showModelInStatus || showCostInStatus || showTimeInStatus || customStatusText) && (
              <div className="mb-2 px-2 py-1 rounded bg-muted/40 text-[10px] font-mono flex items-center gap-2 text-muted-foreground">
                {showModelInStatus && runtimeConfigQuery.data && (
                  <span>
                    {((runtimeConfigQuery.data as any).providerConfig?.model as string) ?? "(no model)"}
                  </span>
                )}
                {showCostInStatus && detailQuery.data?.run?.costMicrocents != null && (
                  <span>
                    · {formatCost(detailQuery.data.run.costMicrocents)}
                  </span>
                )}
                {showTimeInStatus && detailQuery.data?.run?.durationMs != null && (
                  <span>
                    · {(detailQuery.data.run.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {customStatusText && (
                  <span className="ml-auto opacity-70">{customStatusText}</span>
                )}
              </div>
            )}
            {/* Phase 8: child subagent runs */}
            {treeQuery.data && treeQuery.data.children.length > 0 && (
              <div className="mb-3 rounded border border-blue-500/40 bg-blue-500/5 p-2 space-y-1.5">
                <div className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider">
                  Child runs ({treeQuery.data.children.length})
                </div>
                <ul className="space-y-1">
                  {treeQuery.data.children.map((child: any) => (
                    <li
                      key={child.run.id}
                      className="text-[10px] flex items-center justify-between gap-2 rounded bg-background/60 p-1.5 cursor-pointer hover:bg-background"
                      onClick={() => selectRun(child.run.id)}
                    >
                      <span className="font-mono">↳ #{child.run.id}</span>
                      <Badge variant="outline" className="text-[9px]">
                        {child.run.status}
                      </Badge>
                      <span className="text-muted-foreground/70 truncate flex-1">
                        {child.run.summary ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pendingRequests.length > 0 && (
              <div className="mb-3 rounded border border-yellow-500/40 bg-yellow-500/5 p-2.5 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-yellow-300">
                  <ShieldQuestion className="h-3.5 w-3.5" />
                  Permission required ({pendingRequests.length})
                </div>
                <ul className="space-y-1.5">
                  {pendingRequests.map((r: any) => (
                    <li
                      key={r.id}
                      className="flex items-start justify-between gap-2 rounded bg-background/60 p-1.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-mono">{r.toolName}</div>
                        {r.description && (
                          <div className="text-[10px] text-muted-foreground truncate">
                            {r.description}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] border-emerald-500/40 hover:bg-emerald-500/10"
                          disabled={decidePermMut.isPending}
                          onClick={() =>
                            decidePermMut.mutate({
                              requestId: r.id,
                              allowed: true,
                            })
                          }
                          title="Allow this tool call to proceed"
                        >
                          <Check className="h-3 w-3 mr-1" /> Allow
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] border-red-500/40 hover:bg-red-500/10"
                          disabled={decidePermMut.isPending}
                          onClick={() =>
                            decidePermMut.mutate({
                              requestId: r.id,
                              allowed: false,
                              reason: "Denied by user from runs page",
                            })
                          }
                          title="Deny this tool call"
                        >
                          <X className="h-3 w-3 mr-1" /> Deny
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="text-[9px] text-muted-foreground">
                  The agent loop is blocked until you decide. Auto-times out after 5 minutes.
                </div>
              </div>
            )}
            <Tabs defaultValue="input">
              <TabsList>
                <TabsTrigger value="input">Input</TabsTrigger>
                <TabsTrigger value="output">Output</TabsTrigger>
                <TabsTrigger value="tools">Tools</TabsTrigger>
                <TabsTrigger value="memory">Memory</TabsTrigger>
                <TabsTrigger value="policy">Policy</TabsTrigger>
                <TabsTrigger value="hooks">Hooks</TabsTrigger>
                <TabsTrigger value="steps">Steps</TabsTrigger>
              </TabsList>
              <TabsContent value="input">
                <pre className="text-[9px] font-mono bg-muted/30 p-2 rounded">
                  {JSON.stringify(detailQuery.data?.run.inputPayload ?? {}, null, 2)}
                </pre>
              </TabsContent>
              <TabsContent value="output">
                {/* Phase 12: render based on the agent's outputStyle.
                    plain    → just the responsePreview text
                    markdown → wrapped in a styled prose block (no
                               external markdown lib — just whitespace
                               preservation; full md rendering can be
                               layered later)
                    json     → JSON.stringify of the full payload */}
                {(() => {
                  const payload = (detailQuery.data?.run.outputPayload ??
                    {}) as Record<string, unknown>;
                  const responseText =
                    typeof payload.responsePreview === "string"
                      ? payload.responsePreview
                      : "";
                  if (outputStyle === "json") {
                    return (
                      <pre className="text-[9px] font-mono bg-muted/30 p-2 rounded">
                        {JSON.stringify(payload, null, 2)}
                      </pre>
                    );
                  }
                  if (outputStyle === "markdown") {
                    return (
                      <div className="text-[11px] leading-relaxed bg-muted/30 p-3 rounded whitespace-pre-wrap">
                        {responseText ||
                          "(no responsePreview in outputPayload)"}
                      </div>
                    );
                  }
                  // plain (default)
                  return (
                    <pre className="text-[10px] font-mono bg-muted/30 p-2 rounded whitespace-pre-wrap">
                      {responseText ||
                        JSON.stringify(payload, null, 2)}
                    </pre>
                  );
                })()}
              </TabsContent>
              <TabsContent value="tools">
                {(detailQuery.data?.toolCalls?.length ?? 0) === 0 ? (
                  <p className="text-[10px] text-muted-foreground">No tool calls.</p>
                ) : (
                  <ul className="space-y-1">
                    {detailQuery.data?.toolCalls.map((t: any) => (
                      <li key={t.id} className="border rounded p-1.5 text-[10px]">
                        <div className="flex items-center justify-between">
                          <span className="font-mono">{t.toolKey}</span>
                          <Badge variant="outline" className="text-[9px]">
                            {t.verdict ?? "—"}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground">
                          {t.durationMs ? `${t.durationMs}ms` : ""}
                        </div>
                        <pre className="font-mono text-[9px] opacity-70 mt-1 whitespace-pre-wrap break-all">
                          {JSON.stringify(t.responsePayload, null, 0).slice(0, 120)}
                        </pre>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="memory">
                {(detailQuery.data?.memoryEvents?.length ?? 0) === 0 ? (
                  <p className="text-[10px] text-muted-foreground">No memory events.</p>
                ) : (
                  <ul className="space-y-1">
                    {detailQuery.data?.memoryEvents.map((m: any) => (
                      <li key={m.id} className="border rounded p-1.5 text-[10px]">
                        <div className="flex items-center justify-between">
                          <span>
                            <strong>{m.memoryType}</strong> · {m.operation}
                          </span>
                        </div>
                        <pre className="font-mono text-[9px] opacity-70 mt-1 whitespace-pre-wrap break-all">
                          {JSON.stringify(m.payload, null, 0).slice(0, 120)}
                        </pre>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="policy">
                {(detailQuery.data?.policyEvents?.length ?? 0) === 0 ? (
                  <p className="text-[10px] text-muted-foreground">No policy events.</p>
                ) : (
                  <ul className="space-y-1">
                    {detailQuery.data?.policyEvents.map((p: any) => (
                      <li key={p.id} className="border rounded p-1.5 text-[10px]">
                        <div className="flex items-center justify-between">
                          <span className="font-mono">{p.policyKey}</span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              p.decision === "deny"
                                ? "border-red-500/40 text-red-400"
                                : p.decision === "warn"
                                  ? "border-yellow-500/40 text-yellow-400"
                                  : "border-emerald-500/40 text-emerald-400"
                            }`}
                          >
                            {p.decision}
                          </Badge>
                        </div>
                        {p.reason && <div className="opacity-80 mt-0.5">{p.reason}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="hooks">
                {(detailQuery.data?.hookExecutions?.length ?? 0) === 0 ? (
                  <p className="text-[10px] text-muted-foreground">
                    No hook executions. Add hooks on the Hooks page and run a
                    simulation that triggers the matching event.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {detailQuery.data?.hookExecutions.map((h: any) => (
                      <li key={h.id} className="border rounded p-1.5 text-[10px]">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono">
                            {h.eventName}
                            {h.matcher && (
                              <span className="text-muted-foreground/70">
                                {" "}({h.matcher})
                              </span>
                            )}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              h.timedOut
                                ? "border-red-500/40 text-red-400"
                                : h.error
                                  ? "border-red-500/40 text-red-400"
                                  : h.exitCode === 0
                                    ? "border-emerald-500/40 text-emerald-400"
                                    : "border-yellow-500/40 text-yellow-400"
                            }`}
                          >
                            {h.timedOut
                              ? "timeout"
                              : h.error
                                ? "error"
                                : `exit ${h.exitCode ?? "?"}`}
                          </Badge>
                        </div>
                        <div className="font-mono text-[9px] opacity-70 mt-0.5">
                          {h.command}
                        </div>
                        {h.error && (
                          <div className="text-red-400 mt-0.5">{h.error}</div>
                        )}
                        {h.stdout && (
                          <pre className="font-mono text-[9px] opacity-70 mt-1 whitespace-pre-wrap break-all bg-muted/30 p-1 rounded">
                            {h.stdout.slice(0, 240)}
                          </pre>
                        )}
                        {h.stderr && (
                          <pre className="font-mono text-[9px] text-red-400/80 mt-1 whitespace-pre-wrap break-all">
                            {h.stderr.slice(0, 240)}
                          </pre>
                        )}
                        <div className="text-[9px] text-muted-foreground/70 mt-0.5">
                          {h.durationMs}ms
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="steps">
                {(detailQuery.data?.steps?.length ?? 0) === 0 ? (
                  <p className="text-[10px] text-muted-foreground">No steps.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {detailQuery.data?.steps.map((s: any) => (
                      <li key={s.id} className="border rounded p-1.5 text-[10px]">
                        <div className="flex justify-between">
                          <span className="font-medium">{s.label}</span>
                          <Badge variant="outline" className="text-[9px]">
                            {s.verdict ?? "—"}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
            {/* Phase 6: slash command input — operator UI for /help /cost
                /cancel /cwd /clear /compact. Transcript is local-only. */}
            <div className="mt-3 border-t pt-2 space-y-1.5">
              {slashTranscript.length > 0 && (
                <ul className="space-y-1 max-h-32 overflow-auto">
                  {slashTranscript.map((entry, i) => (
                    <li
                      key={i}
                      className={`text-[10px] font-mono rounded p-1.5 ${
                        entry.ok
                          ? "bg-emerald-500/5 border border-emerald-500/20"
                          : "bg-red-500/5 border border-red-500/20"
                      }`}
                    >
                      <div className="text-muted-foreground">{entry.raw}</div>
                      <div className="whitespace-pre-wrap">{entry.message}</div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Terminal className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
                  <Input
                    placeholder="/help, /cost, /cancel, /cwd <path>…"
                    value={slashInput}
                    onChange={(e) => setSlashInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitSlashCommand();
                      }
                    }}
                    className="h-7 text-[10px] pl-6 font-mono"
                    disabled={slashMut.isPending}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[10px]"
                  disabled={!slashInput.trim() || slashMut.isPending}
                  onClick={submitSlashCommand}
                >
                  {slashMut.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Run"
                  )}
                </Button>
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

// Phase 5: tiny formatters for token counts and microcent costs.

/** "1234" → "1.2k", "1234567" → "1.2M". Plain integer below 1k. */
function formatTokens(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

/** microcents → "$1.23". Sub-cent values show 4 decimals. */
function formatCost(microcents: number): string {
  const dollars = microcents / 1_000_000;
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}
