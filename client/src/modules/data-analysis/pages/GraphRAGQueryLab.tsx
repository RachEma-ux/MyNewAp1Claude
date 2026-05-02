/**
 * GraphRAG Query Lab — Phase-1 OmniRAG integration (Option C)
 *
 * Adds a GraphRAG / OmniRAG mode switch at the top of the Query Lab.
 * GraphRAG remains the default. OmniRAG is opt-in and labeled
 * "Advanced / External". When OmniRAG is selected and unavailable,
 * the mode is disabled with a clear offline message — it does NOT
 * silently switch back to GraphRAG.
 *
 * The frontend depends ONLY on the canonical OmniRagQueryResult shape
 * defined in 00_canonical_implementation_brief.md. The adapter at
 * server/data-analysis/omnirag-adapter.ts hides all OmniRAG-native
 * payload differences.
 *
 * Phase-1 scope: only this file is changed. All 8 other GraphRAG
 * tabs remain untouched. Indexing stays on the current worker path.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Send,
  FlaskConical,
  Zap,
  ServerOff,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WorkerOfflineBanner } from "./GraphRAGWorkerBanner";

// ── Types ────────────────────────────────────────────────────────────────

type QueryMode = "graphrag" | "omnirag";

/** Canonical internal result shape from the OmniRAG adapter. The
 *  frontend NEVER depends on OmniRAG-native payloads — only this. */
interface OmniRagQueryResult {
  success: boolean;
  status: "completed" | "failed" | "running" | "offline" | "fallback";
  answer: string;
  context: Record<string, unknown>;
  confidence: number | null;
  traceId: string | null;
  pipelineName: string | null;
  runId: string | null;
  error: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────

const METHODS = [
  { value: "basic", label: "Basic", description: "Keyword-based search" },
  {
    value: "local",
    label: "Local",
    description: "Entity-focused neighborhood search",
  },
  {
    value: "global",
    label: "Global",
    description: "Community-level summarization",
  },
  {
    value: "drift",
    label: "DRIFT",
    description: "Dynamic reasoning with iterative follow-up",
  },
] as const;

// ── Component ────────────────────────────────────────────────────────────

interface Props {
  workerOnline?: boolean;
}

export function GraphRAGQueryLab({ workerOnline = false }: Props) {
  // ── Shared state ───────────────────────────────────────────────────
  const [mode, setMode] = useState<QueryMode>("graphrag");
  const [question, setQuestion] = useState("");

  // ── GraphRAG state ─────────────────────────────────────────────────
  const [moduleSlug, setModuleSlug] = useState("");
  const [datasetKey, setDatasetKey] = useState("");
  const [method, setMethod] = useState<string>("local");
  const [graphResult, setGraphResult] = useState<{
    answer: string;
    status: string;
    error?: string;
  } | null>(null);

  // ── OmniRAG state ─────────────────────────────────────────────────
  const [omniPipeline, setOmniPipeline] = useState<string>("");
  const [omniResult, setOmniResult] = useState<OmniRagQueryResult | null>(
    null
  );
  const [traceExpanded, setTraceExpanded] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────
  const { data: sources } =
    trpc.dataAnalysis.graphRag.listSources.useQuery();

  // OmniRAG health — only fetched when in OmniRAG mode
  const omniHealthQuery = trpc.dataAnalysis.graphRag.omniragHealth.useQuery(
    undefined,
    {
      enabled: mode === "omnirag",
      refetchInterval: 15_000,
    }
  );

  const omniPipelinesQuery =
    trpc.dataAnalysis.graphRag.omniragPipelines.useQuery(undefined, {
      enabled: mode === "omnirag" && (omniHealthQuery.data as any)?.healthy,
    });

  const omniEnabled = (omniHealthQuery.data as any)?.enabled ?? false;
  const omniHealthy = (omniHealthQuery.data as any)?.healthy ?? false;
  const omniLastSuccess = (omniHealthQuery.data as any)?.lastSuccessAt ?? null;
  const omniPipelines = (omniPipelinesQuery.data as any)?.pipelines ?? [];

  // ── Mutations ──────────────────────────────────────────────────────
  const graphQueryMut = trpc.dataAnalysis.graphRag.query.useMutation({
    onSuccess: (data) => {
      setGraphResult({
        answer: data.answer,
        status: data.status,
        error: data.error,
      });
      if (data.status === "completed") toast.success("Query completed");
      else toast.error(`Query failed: ${data.error}`);
    },
    onError: (e) => {
      toast.error(e.message);
      setGraphResult({ answer: "", status: "failed", error: e.message });
    },
  });

  const omniQueryMut = trpc.dataAnalysis.graphRag.omniragQuery.useMutation({
    onSuccess: (data: any) => {
      setOmniResult(data as OmniRagQueryResult);
      if (data.status === "completed") toast.success("OmniRAG query completed");
      else if (data.status === "offline")
        toast.error("OmniRAG is offline");
      else toast.error(`OmniRAG query failed: ${data.error}`);
    },
    onError: (e) => {
      toast.error(e.message);
      setOmniResult({
        success: false,
        status: "failed",
        answer: "",
        context: {},
        confidence: null,
        traceId: null,
        pipelineName: null,
        runId: null,
        error: e.message,
      });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────
  function handleSourceSelect(sourceId: string) {
    const src = sources?.find((s) => String(s.id) === sourceId);
    if (src) {
      setModuleSlug(src.moduleSlug);
      setDatasetKey(src.datasetKey);
    }
  }

  function handleSubmit() {
    if (!question.trim()) {
      toast.error("Enter a question");
      return;
    }
    if (mode === "graphrag") {
      if (!moduleSlug || !datasetKey) {
        toast.error("Select a dataset first");
        return;
      }
      setGraphResult(null);
      graphQueryMut.mutate({
        moduleSlug,
        datasetKey,
        method: method as any,
        question: question.trim(),
      });
    } else {
      setOmniResult(null);
      omniQueryMut.mutate({
        question: question.trim(),
        pipeline: omniPipeline || undefined,
      });
    }
  }

  const isPending =
    mode === "graphrag" ? graphQueryMut.isPending : omniQueryMut.isPending;
  const isDisabled =
    mode === "graphrag" ? !workerOnline : !omniHealthy || !omniEnabled;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 mt-4">
      {/* Mode switch */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant={mode === "graphrag" ? "default" : "outline"}
          onClick={() => setMode("graphrag")}
          className="text-xs"
        >
          <FlaskConical className="h-3 w-3 mr-1" />
          GraphRAG
        </Button>
        <Button
          size="sm"
          variant={mode === "omnirag" ? "default" : "outline"}
          onClick={() => setMode("omnirag")}
          className="text-xs"
          title="OmniRAG — advanced external orchestration service"
        >
          <Zap className="h-3 w-3 mr-1" />
          OmniRAG
          <Badge
            variant="outline"
            className="ml-1 text-[9px] px-1 py-0 border-muted-foreground/30"
          >
            Advanced
          </Badge>
        </Button>

        {/* Status indicator */}
        {mode === "omnirag" && (
          <div className="flex items-center gap-1.5 ml-2 text-xs">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                omniHealthy ? "bg-emerald-500" : "bg-red-500"
              )}
            />
            <span className="text-muted-foreground">
              OmniRAG (external) —{" "}
              {!omniEnabled
                ? "not enabled"
                : omniHealthy
                ? "online"
                : "offline"}
            </span>
            {omniLastSuccess && (
              <span className="text-muted-foreground/60 text-[10px]">
                last ok:{" "}
                {new Date(omniLastSuccess).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Offline banners */}
      {mode === "graphrag" && !workerOnline && (
        <WorkerOfflineBanner context="Querying datasets" />
      )}
      {mode === "omnirag" && !omniEnabled && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <ServerOff className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">OmniRAG Not Enabled</span>
              <p className="text-xs text-muted-foreground mt-1">
                Set <code className="bg-muted px-1 rounded">OMNIRAG_ENABLED=true</code> and{" "}
                <code className="bg-muted px-1 rounded">OMNIRAG_URL</code> in the server
                environment, then restart the dev server.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {mode === "omnirag" && omniEnabled && !omniHealthy && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <ServerOff className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">OmniRAG Offline</span>
              <p className="text-xs text-muted-foreground mt-1">
                The OmniRAG service is not reachable. Queries in OmniRAG mode
                are disabled until the service is back online. Switch to
                GraphRAG mode to continue querying via the Python worker.
              </p>
              {(omniHealthQuery.data as any)?.error && (
                <p className="text-xs text-red-400 mt-1">
                  {(omniHealthQuery.data as any).error}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main form card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            {mode === "graphrag" ? (
              <FlaskConical className="w-4 h-4" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Query Lab —{" "}
            {mode === "graphrag" ? "GraphRAG" : "OmniRAG (Advanced)"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode-specific controls */}
          {mode === "graphrag" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Dataset Source</Label>
                <Select onValueChange={handleSourceSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dataset..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sources?.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.displayName} ({s.moduleSlug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Search Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label} — {m.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="text-xs text-muted-foreground">
                  <p>
                    <strong>Module:</strong> {moduleSlug || "—"}
                  </p>
                  <p>
                    <strong>Dataset:</strong> {datasetKey || "—"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Pipeline</Label>
                <Select
                  value={omniPipeline}
                  onValueChange={setOmniPipeline}
                  disabled={!omniHealthy || omniPipelines.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        omniPipelines.length === 0
                          ? "No pipelines available"
                          : "Select pipeline..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Default</SelectItem>
                    {omniPipelines.map((p: any) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}
                        {p.description ? ` — ${p.description}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end text-xs text-muted-foreground">
                <p>
                  OmniRAG queries are routed through the external
                  orchestration service. Results are normalized into the
                  standard Query Lab format.
                </p>
              </div>
            </div>
          )}

          {/* Question input */}
          <div className="flex gap-2">
            <Input
              placeholder={
                isDisabled
                  ? mode === "graphrag"
                    ? "Worker offline — queries disabled"
                    : "OmniRAG unavailable — queries disabled"
                  : `Ask a question${mode === "omnirag" ? " (via OmniRAG)" : ""}...`
              }
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isDisabled && handleSubmit()}
              className="flex-1"
              disabled={isDisabled}
            />
            <Button
              onClick={handleSubmit}
              disabled={isDisabled || isPending || !question.trim()}
              title={isDisabled ? `${mode === "graphrag" ? "Python worker" : "OmniRAG"} is offline` : undefined}
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Method badges (GraphRAG only) */}
          {mode === "graphrag" && (
            <div className="flex gap-2 flex-wrap">
              {METHODS.map((m) => (
                <Badge
                  key={m.value}
                  variant={method === m.value ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setMethod(m.value)}
                >
                  {m.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* GraphRAG result */}
      {mode === "graphrag" && graphResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Result
              <Badge
                variant={
                  graphResult.status === "completed" ? "default" : "destructive"
                }
              >
                {graphResult.status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {graphResult.error ? (
              <p className="text-sm text-destructive">{graphResult.error}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{graphResult.answer}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* OmniRAG result */}
      {mode === "omnirag" && omniResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Result
              <Badge
                variant={
                  omniResult.status === "completed"
                    ? "default"
                    : omniResult.status === "running"
                    ? "secondary"
                    : "destructive"
                }
              >
                {omniResult.status}
              </Badge>
              {omniResult.confidence != null && (
                <Badge variant="outline" className="text-[10px]">
                  confidence: {(omniResult.confidence * 100).toFixed(0)}%
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                via OmniRAG
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {omniResult.error ? (
              <p className="text-sm text-destructive">{omniResult.error}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{omniResult.answer}</p>
              </div>
            )}

            {/* Trace panel — collapsible, per 04_ui_strategy.md */}
            <div className="border rounded-md">
              <button
                onClick={() => setTraceExpanded(!traceExpanded)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Info className="h-3 w-3" />
                  Trace Info
                </span>
                {traceExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {traceExpanded && (
                <div className="px-3 pb-3 text-xs space-y-1 border-t">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    <span className="text-muted-foreground">Service</span>
                    <span>OmniRAG (external)</span>
                    {omniResult.traceId && (
                      <>
                        <span className="text-muted-foreground">Request ID</span>
                        <code className="font-mono text-[10px]">
                          {omniResult.traceId}
                        </code>
                      </>
                    )}
                    {(omniResult.context as any)?._latencyMs != null && (
                      <>
                        <span className="text-muted-foreground">Latency</span>
                        <span>
                          {(omniResult.context as any)._latencyMs}ms
                        </span>
                      </>
                    )}
                    {omniResult.pipelineName && (
                      <>
                        <span className="text-muted-foreground">Pipeline</span>
                        <span>{omniResult.pipelineName}</span>
                      </>
                    )}
                    {omniResult.runId && (
                      <>
                        <span className="text-muted-foreground">Run ID</span>
                        <code className="font-mono text-[10px]">
                          {omniResult.runId}
                        </code>
                      </>
                    )}
                    <span className="text-muted-foreground">Fallback</span>
                    <span>
                      {omniResult.status === "fallback"
                        ? "Yes — fell back to GraphRAG"
                        : "No"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
