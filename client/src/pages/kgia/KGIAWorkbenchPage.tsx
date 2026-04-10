import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Eye, FileSearch, Clock, AlertTriangle, History } from "lucide-react";
import { toast } from "sonner";

interface WorkbenchProps {
  workspaceId: number;
  activeSessionId: number | null;
  onSessionCreated: (id: number) => void;
  onRunComplete: (result: any) => void;
  onQueryPlanReady: (plan: any) => void;
}

export default function KGIAWorkbenchPage({
  workspaceId,
  activeSessionId,
  onSessionCreated,
  onRunComplete,
  onQueryPlanReady,
}: WorkbenchProps) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<string>("auto");

  const sourcesQuery = trpc.modules.kgia.sources.list.useQuery({ workspaceId });

  // Run history
  const runsQuery = trpc.modules.kgia.runs.list.useQuery(
    { workspaceId, sessionId: activeSessionId ?? undefined, limit: 50 },
    { refetchInterval: 5000 }
  );

  // Selected run details
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const runDetailQuery = trpc.modules.kgia.runs.get.useQuery(
    { id: selectedRunId!, workspaceId },
    { enabled: !!selectedRunId }
  );

  const createSession = trpc.modules.kgia.sessions.create.useMutation();
  const executeRun = trpc.modules.kgia.runs.execute.useMutation();

  const handleSubmit = async () => {
    if (!question.trim()) return;

    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const session = await createSession.mutateAsync({
          workspaceId,
          title: question.slice(0, 100),
        });
        sessionId = session.id;
        onSessionCreated(sessionId);
      }

      const result = await executeRun.mutateAsync({
        workspaceId,
        sessionId,
        question: question.trim(),
        mode: mode !== "auto" ? mode as any : undefined,
      });

      if ("envelope" in result) {
        setSelectedRunId(result.runId);
        onRunComplete(result);
        onQueryPlanReady(null);
        toast.success("Query completed");
      } else {
        toast.error(result.error);
      }

      runsQuery.refetch();
      setQuestion("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const isLoading = createSession.isPending || executeRun.isPending;
  const runData = runDetailQuery.data;
  const runs = runsQuery.data ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* ── Query Composer ── */}
      <div className="p-4 border-b border-border space-y-3 shrink-0">
        <div className="flex gap-2">
          <Input
            placeholder="Ask a question about your knowledge graph..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={handleSubmit} disabled={isLoading || !question.trim()} size="sm">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="w-40 h-7 text-xs">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="direct_query">Direct Query</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
              <SelectItem value="graph_rag">Graph RAG</SelectItem>
              <SelectItem value="memory">Memory</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {sourcesQuery.data?.length ?? 0} source{(sourcesQuery.data?.length ?? 0) !== 1 ? "s" : ""} available
          </span>
        </div>
      </div>

      {/* ── Answer Display ── */}
      <div className="flex-1 overflow-auto p-4">
        {runData ? (
          <div className="space-y-4 max-w-3xl mx-auto">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Answer</CardTitle>
                  <div className="flex items-center gap-2">
                    {runData.run.selectedMode && (
                      <Badge variant="outline" className="text-[10px]">
                        {runData.run.selectedMode.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {runData.run.confidence !== null && (
                      <Badge variant="secondary" className="text-[10px]">
                        {(runData.run.confidence * 100).toFixed(0)}% confidence
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{runData.run.answer ?? "No answer generated"}</p>
              </CardContent>
            </Card>

            <Tabs defaultValue="evidence" className="w-full">
              <TabsList className="h-8">
                <TabsTrigger value="evidence" className="text-xs h-6">
                  <Eye className="w-3 h-3 mr-1" /> Evidence ({runData.evidenceNodes?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="provenance" className="text-xs h-6">
                  <FileSearch className="w-3 h-3 mr-1" /> Provenance
                </TabsTrigger>
                <TabsTrigger value="temporal" className="text-xs h-6">
                  <Clock className="w-3 h-3 mr-1" /> Temporal
                </TabsTrigger>
                <TabsTrigger value="gaps" className="text-xs h-6">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Gaps
                </TabsTrigger>
              </TabsList>

              <TabsContent value="evidence" className="mt-2">
                {runData.evidenceNodes && runData.evidenceNodes.length > 0 ? (
                  <div className="space-y-1">
                    {runData.evidenceNodes.slice(0, 50).map((node: any) => (
                      <div key={node.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-muted/30">
                        <Badge variant="outline" className="text-[9px] shrink-0">{node.nodeType}</Badge>
                        <span className="truncate">{node.label}</span>
                        {node.confidence !== null && (
                          <span className="text-muted-foreground ml-auto shrink-0">{(node.confidence * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-4 text-center">No evidence nodes</div>
                )}
              </TabsContent>

              <TabsContent value="provenance" className="mt-2">
                {runData.answer?.provenanceRefs ? (
                  <div className="space-y-1">
                    {(runData.answer.provenanceRefs as any[]).map((ref: any, i: number) => (
                      <div key={i} className="text-xs py-1 px-2 rounded bg-muted/30">
                        [{ref.sourceType}] {ref.sourceRef} — {ref.operationRef}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-4 text-center">No provenance data</div>
                )}
              </TabsContent>

              <TabsContent value="temporal" className="mt-2">
                {runData.answer?.temporalValidity ? (
                  <div className="text-xs space-y-1 px-2">
                    {(runData.answer.temporalValidity as any).asOf && (
                      <div>As of: {(runData.answer.temporalValidity as any).asOf}</div>
                    )}
                    {(runData.answer.temporalValidity as any).temporalWarning && (
                      <div className="text-yellow-500">{(runData.answer.temporalValidity as any).temporalWarning}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-4 text-center">No temporal data</div>
                )}
              </TabsContent>

              <TabsContent value="gaps" className="mt-2">
                {runData.answer?.missingKnowledge && (runData.answer.missingKnowledge as any[]).length > 0 ? (
                  <div className="space-y-1">
                    {(runData.answer.missingKnowledge as any[]).map((gap: any, i: number) => (
                      <div key={i} className="text-xs text-yellow-500 py-1 px-2 rounded bg-yellow-500/5">
                        {typeof gap === "string" ? gap : JSON.stringify(gap)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-4 text-center">No knowledge gaps detected</div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Ask a question to get started
          </div>
        )}
      </div>

      {/* ── Run History (bottom) ── */}
      <div className="border-t border-border shrink-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Run History</span>
          <span className="text-[10px] text-muted-foreground ml-auto">{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="max-h-40 overflow-auto">
          {runs.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">No runs yet</div>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`cursor-pointer border-b border-border/50 transition-colors ${
                      selectedRunId === run.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <td className="px-4 py-1.5 truncate max-w-[40%]">{run.question}</td>
                    <td className="px-2 py-1.5">
                      <Badge
                        variant={run.status === "completed" ? "default" : run.status === "error" ? "destructive" : "secondary"}
                        className="text-[9px] h-4 px-1"
                      >
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 text-[10px]">
                      {run.selectedMode?.replace(/_/g, " ") ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-[10px]">
                      {run.confidence !== null ? `${(run.confidence * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-[10px]">
                      {run.durationMs ? `${run.durationMs}ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
