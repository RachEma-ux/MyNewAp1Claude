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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Activity, ShieldQuestion, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader,
  EmptyState,
  ErrorCallout,
  LoadingState,
} from "@/components/agent-studio/ui";

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
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Trace Inspector</h3>
            {/* Phase 5: usage strip in the inspector header */}
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
                <TabsTrigger value="steps">Steps</TabsTrigger>
              </TabsList>
              <TabsContent value="input">
                <pre className="text-[9px] font-mono bg-muted/30 p-2 rounded">
                  {JSON.stringify(detailQuery.data?.run.inputPayload ?? {}, null, 2)}
                </pre>
              </TabsContent>
              <TabsContent value="output">
                <pre className="text-[9px] font-mono bg-muted/30 p-2 rounded">
                  {JSON.stringify(detailQuery.data?.run.outputPayload ?? {}, null, 2)}
                </pre>
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
