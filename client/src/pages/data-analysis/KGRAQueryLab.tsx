/**
 * KGRA Query Lab — Chat interface for the Knowledge Graph Reasoning Agent.
 * Cloned from GraphRAGQueryLab (OmniRAG pattern).
 * All calls go server-side via tRPC → adapter → KGRA Python API.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Send, BrainCircuit, ServerOff, ChevronDown, ChevronUp,
  ShieldCheck, Eye, FileSearch, BarChart3, Clock, AlertTriangle, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────

type TabMode = "chat" | "bundle";

const MODES = [
  { value: "", label: "Auto", desc: "Let KGRA choose" },
  { value: "direct_query", label: "Direct Query", desc: "Cypher/SPARQL graph lookup" },
  { value: "path_reasoning", label: "Path Reasoning", desc: "Multi-hop traversal" },
  { value: "graphrag_local", label: "GraphRAG Local", desc: "Entity neighborhood" },
  { value: "graphrag_global", label: "GraphRAG Global", desc: "Corpus-wide summaries" },
  { value: "drift", label: "DRIFT", desc: "Dynamic iterative follow-up" },
  { value: "basic_rag", label: "Basic RAG", desc: "Vector similarity" },
] as const;

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  metadata?: any;
  timestamp: string;
}

// ── Component ──────────────────────────────────────────────���─────

export function KGRAQueryLab() {
  const [tab, setTab] = useState<TabMode>("chat");

  // ── Chat state ──
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  // ── Bundle state ──
  const [bundleName, setBundleName] = useState("");
  const [bundleText, setBundleText] = useState("");
  const [bundleResult, setBundleResult] = useState<any>(null);

  // ── Queries ──
  const healthQuery = trpc.kgraAgent.health.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const healthy = healthQuery.data?.healthy ?? false;
  const healthStatus = healthQuery.data?.status ?? "unknown";

  const runMut = trpc.kgraAgent.run.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: "agent",
        content: data.answer,
        metadata: data,
        timestamp: new Date().toISOString(),
      }]);
      setLastResult(data);
      if (data.error) toast.warning(`Partial result: ${data.error.message}`);
      else toast.success(`Answered (${(data.confidence * 100).toFixed(0)}% confidence)`);
    },
    onError: (e) => {
      setMessages(prev => [...prev, {
        role: "agent",
        content: `Error: ${e.message}`,
        timestamp: new Date().toISOString(),
      }]);
      toast.error(e.message);
    },
  });

  const bundleMut = trpc.kgraAgent.evaluateBundle.useMutation({
    onSuccess: (data) => {
      setBundleResult(data);
      toast.success("Bundle evaluated");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Handlers ──
  function handleSend() {
    if (!question.trim()) return;

    setMessages(prev => [...prev, {
      role: "user",
      content: question.trim(),
      timestamp: new Date().toISOString(),
    }]);

    runMut.mutate({
      query: question.trim(),
      mode: mode || undefined,
    });

    setQuestion("");
  }

  function handleBundleSubmit() {
    if (!bundleText.trim()) {
      toast.error("Paste document content");
      return;
    }

    // Split by --- or === separators, or treat as single doc
    const sections = bundleText.split(/\n---+\n|\n===+\n/).filter(s => s.trim());
    const documents = sections.map((s, i) => ({
      name: `document_${i + 1}`,
      content: s.trim(),
    }));

    bundleMut.mutate({
      documents,
      bundle_name: bundleName || undefined,
    });
  }

  // ── Render ──
  return (
    <div className="space-y-4 mt-4">
      {/* Header + health */}
      <div className="flex items-center gap-2 flex-wrap">
        <BrainCircuit className="w-5 h-5 text-primary" />
        <span className="text-sm font-semibold">KGRA — Knowledge Graph Reasoning Agent</span>
        <div className="flex items-center gap-1.5 ml-2 text-xs">
          <span className={cn("h-2 w-2 rounded-full", healthy ? "bg-emerald-500" : "bg-red-500")} />
          <span className="text-muted-foreground">
            {healthy ? `Online (${healthQuery.data?.version})` : healthStatus === "offline" ? "Offline — start KGRA on port 8000" : healthStatus}
          </span>
          {healthQuery.data?.latencyMs && (
            <span className="text-muted-foreground/60 text-[10px]">{healthQuery.data.latencyMs}ms</span>
          )}
        </div>
      </div>

      {/* Offline banner */}
      {!healthy && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <ServerOff className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">KGRA Service Not Running</span>
              <p className="text-xs text-muted-foreground mt-1">
                Start the KGRA Python service: <code className="bg-muted px-1 rounded">cd kgra && uvicorn kgra.src.api.app:app --port 8000</code>
              </p>
              {healthQuery.data?.error && (
                <p className="text-xs text-amber-500 mt-1">{healthQuery.data.error}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab switch */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabMode)}>
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="bundle">Bundle Evaluation</TabsTrigger>
        </TabsList>

        {/* ── Chat Tab ── */}
        <TabsContent value="chat" className="mt-3 space-y-3">
          {/* Messages */}
          <Card className="min-h-[300px] max-h-[500px] flex flex-col">
            <ScrollArea className="flex-1 p-4">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  Ask KGRA a question about your knowledge graph
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                      )}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        {msg.metadata && msg.role === "agent" && (
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50 flex-wrap">
                            <Badge variant="outline" className="text-[9px]">{msg.metadata.mode}</Badge>
                            <Badge variant={msg.metadata.confidence >= 0.7 ? "default" : "secondary"} className="text-[9px]">
                              {(msg.metadata.confidence * 100).toFixed(0)}%
                            </Badge>
                            {msg.metadata.governance?.verdict && (
                              <Badge variant={msg.metadata.governance.verdict === "allow" ? "default" : "destructive"} className="text-[9px]">
                                {msg.metadata.governance.verdict}
                              </Badge>
                            )}
                            {msg.metadata.cost_estimate && (
                              <span className="text-[9px] text-muted-foreground">
                                {msg.metadata.cost_estimate.llm_tokens} tok
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {runMut.isPending && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reasoning...
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </Card>

          {/* Input */}
          <div className="flex gap-2">
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="w-44 h-9 text-xs">
                <SelectValue placeholder="Auto" />
              </SelectTrigger>
              <SelectContent>
                {MODES.map(m => (
                  <SelectItem key={m.value} value={m.value || "auto"}>
                    {m.label} — {m.desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Ask KGRA a question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={runMut.isPending || !healthy}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={runMut.isPending || !healthy || !question.trim()}>
              {runMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>

          {/* Detail panel */}
          {lastResult && (
            <Card>
              <CardHeader className="pb-1 pt-2 px-4 cursor-pointer" onClick={() => setDetailsExpanded(!detailsExpanded)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs text-muted-foreground">Last Run Details</CardTitle>
                  {detailsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </CardHeader>
              {detailsExpanded && (
                <CardContent className="px-4 pb-3 space-y-3 text-xs">
                  {/* Evidence */}
                  <Section icon={Eye} label={`Evidence (${lastResult.observed_facts?.length ?? 0} facts)`}>
                    {lastResult.observed_facts?.map((f: any, i: number) => (
                      <div key={i} className="py-0.5 text-muted-foreground">{f.label || f.id}</div>
                    ))}
                    {(!lastResult.observed_facts || lastResult.observed_facts.length === 0) && (
                      <div className="text-muted-foreground">No evidence collected</div>
                    )}
                  </Section>

                  {/* Provenance */}
                  <Section icon={FileSearch} label={`Provenance (${lastResult.provenance?.length ?? 0})`}>
                    {lastResult.provenance?.map((p: any, i: number) => (
                      <div key={i} className="py-0.5 text-muted-foreground">[{p.source_type}] {p.source_ref}</div>
                    ))}
                  </Section>

                  {/* Governance */}
                  <Section icon={ShieldCheck} label="Governance">
                    <Badge variant={lastResult.governance?.verdict === "allow" ? "default" : "destructive"} className="text-[9px]">
                      {lastResult.governance?.verdict}
                    </Badge>
                    {lastResult.governance?.reasons?.map((r: string, i: number) => (
                      <div key={i} className="text-muted-foreground">{r}</div>
                    ))}
                  </Section>

                  {/* Analytical */}
                  <Section icon={BarChart3} label="Analytical">
                    <div className="grid grid-cols-2 gap-2">
                      <div>Reasoning strength: <strong>{((lastResult.analytical?.reasoning_strength ?? 0) * 100).toFixed(0)}%</strong></div>
                      <div>Vulnerability: <strong>{((lastResult.analytical?.vulnerability ?? 0) * 100).toFixed(0)}%</strong></div>
                    </div>
                  </Section>

                  {/* Cost */}
                  <Section icon={Clock} label="Cost">
                    <div className="flex gap-3 text-muted-foreground">
                      <span>{lastResult.cost_estimate?.llm_tokens} LLM tok</span>
                      <span>{lastResult.cost_estimate?.graph_reads} graph reads</span>
                      <span>{lastResult.cost_estimate?.vector_queries} vector</span>
                      <span>{lastResult.cost_estimate?.mcp_calls} MCP</span>
                    </div>
                  </Section>

                  {/* IDs */}
                  <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                    run: {lastResult.run_id?.slice(0, 8)} | request: {lastResult.request_id?.slice(0, 8)} | mode: {lastResult.mode}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </TabsContent>

        {/* ── Bundle Evaluation Tab ── */}
        <TabsContent value="bundle" className="mt-3 space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" /> Knowledge Bundle Evaluation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Input
                  placeholder="Bundle name (optional)"
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Textarea
                  placeholder={"Paste document content here.\nSeparate multiple documents with --- on its own line.\n\n--- separates documents ---"}
                  value={bundleText}
                  onChange={(e) => setBundleText(e.target.value)}
                  rows={10}
                  className="text-sm font-mono"
                />
              </div>
              <Button onClick={handleBundleSubmit} disabled={bundleMut.isPending || !healthy || !bundleText.trim()}>
                {bundleMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <BrainCircuit className="w-4 h-4 mr-1" />}
                Evaluate Bundle
              </Button>
            </CardContent>
          </Card>

          {bundleResult && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm">Evaluation Report</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-3">
                {/* Scores */}
                <div className="grid grid-cols-2 gap-3">
                  <ScoreCard label="Strategic Coherence" score={bundleResult.learning?.evaluated_bundle?.coherence_score ?? 0} max={10} />
                  <ScoreCard label="Implementation Readiness" score={bundleResult.learning?.evaluated_bundle?.readiness_score ?? 0} max={10} />
                </div>

                {/* Stats */}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Decisions resolved: {bundleResult.learning?.evaluated_bundle?.resolved_decisions_count ?? 0}</span>
                  <span>Contract mappings: {bundleResult.learning?.evaluated_bundle?.contract_mappings_count ?? 0}</span>
                </div>

                {/* Answer */}
                <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded p-3">
                  {bundleResult.answer}
                </div>

                {/* Confidence */}
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{bundleResult.mode}</Badge>
                  <Badge variant={bundleResult.confidence >= 0.7 ? "default" : "secondary"}>
                    {(bundleResult.confidence * 100).toFixed(0)}% confidence
                  </Badge>
                  {bundleResult.learning?.knowledge_graph_updated && (
                    <Badge variant="default" className="bg-green-600 text-[9px]">Learning graph updated</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────��────────

function Section({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1 font-medium text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="pl-4">{children}</div>
    </div>
  );
}

function ScoreCard({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = (score / max) * 100;
  return (
    <Card>
      <CardContent className="pt-3 pb-2.5 px-4">
        <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500")} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-bold">{score}/{max}</span>
        </div>
      </CardContent>
    </Card>
  );
}
