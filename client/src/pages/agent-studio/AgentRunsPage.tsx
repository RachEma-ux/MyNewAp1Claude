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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Activity } from "lucide-react";
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
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Trace inspector */}
      <Card className="lg:col-span-2">
        <CardContent className="p-3">
          <h3 className="text-sm font-semibold mb-2">Trace Inspector</h3>
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
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
