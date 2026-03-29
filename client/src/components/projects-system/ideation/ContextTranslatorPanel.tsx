/**
 * PS Ideation — Context Translator Panel
 *
 * Accepts raw user text, sends it to the Project Context Translator,
 * and displays structured output with apply-to-fields functionality.
 *
 * Shows: The Problem, The Opportunity, External Drivers, Internal Drivers,
 * Trigger, Project Context Result, What If? Question, ideation workflow draft,
 * and clarification questions when needed.
 *
 * Execution states (strict, no auto-fallback):
 *   - "online"           → Python service reachable, primary path available
 *   - "offline"          → Service offline, built-in fallback available as separate action
 *   - "offline-no-llm"   → Service offline, no LLM configured, no usable fallback
 *   - "unavailable"      → Agent not in catalog
 *   - "checking"         → Health check in progress
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  MessageSquareWarning,
  FileText,
  Lightbulb,
  Target,
  Zap,
  HelpCircle,
  ClipboardCheck,
  RefreshCw,
  Info,
} from "lucide-react";
import type { TranslateResponse } from "@shared/ps-context-translator-types";

/**
 * Defensively render any value as a string.
 * LLM responses may return objects (e.g. {signal, confidence}) where plain
 * strings are expected. This prevents "Objects are not valid as a React child".
 */
function safeRender(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(safeRender).join(", ");
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Common LLM object shapes: {signal, confidence}, {idea, ...}, {item, ...}, etc.
    for (const key of ["signal", "idea", "item", "text", "value", "label", "name", "statement", "description", "scenario", "check", "claim", "recommendedApproach"]) {
      if (obj[key] != null) return String(obj[key]);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

interface Props {
  ideationId: number;
  disabled?: boolean;
  onApplied?: () => void;
}

/**
 * Execution modes — strict separation of primary vs fallback:
 *   - "online":           Service reachable, primary path available
 *   - "offline":          Service down, but built-in fallback is available (user must choose explicitly)
 *   - "offline-no-llm":   Service down, no LLM configured, no usable fallback
 *   - "unavailable":      Agent not in catalog
 *   - "checking":         Health check in progress
 */
type ExecutionMode = "online" | "offline" | "offline-no-llm" | "unavailable" | "checking";

export function ContextTranslatorPanel({ ideationId, disabled, onApplied }: Props) {
  const [rawText, setRawText] = useState("");
  const [result, setResult] = useState<(TranslateResponse & { _source?: string; _resolvedLlm?: { displayName?: string; provider?: string; model?: string } | null; _serviceError?: string | null; _serviceUrl?: string | null }) | null>(null);
  const [showResult, setShowResult] = useState(false);
  const utils = trpc.useUtils();

  // Rehydrate raw text from the most recent translator run (persisted in DB)
  const { data: prevRuns } = trpc.ps.ideation.contextTranslator.listRuns.useQuery(
    { ideationId },
    { enabled: !!ideationId, staleTime: Infinity },
  );
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current && prevRuns?.length && !rawText) {
      setRawText(prevRuns[0].rawInput);
      hydratedRef.current = true;
    }
  }, [prevRuns]);

  // Service runtime health (catalog → service resolution)
  const { data: runtime, isFetching: isHealthChecking, dataUpdatedAt } =
    trpc.ps.ideation.contextTranslator.resolveRuntime.useQuery(
      undefined,
      { staleTime: 30_000, refetchInterval: 60_000 },
    );

  // Derive the execution mode — strict: no auto-fallback
  const executionMode: ExecutionMode = (() => {
    if (!runtime || isHealthChecking) return "checking";
    if (!runtime.resolved && !runtime.builtInAvailable) return "unavailable";
    if (runtime.serviceOnline) return "online";
    // Service is offline — check if fallback is possible
    if (runtime.builtInAvailable && (runtime.llmConfigured || runtime.builtInAvailable)) return "offline";
    return "offline-no-llm";
  })();

  // Primary translator: only when service is online
  const canTranslatePrimary = executionMode === "online";
  // Fallback: only when offline and built-in path has LLM
  const canUseFallback = executionMode === "offline";

  const handleRefreshHealth = useCallback(() => {
    utils.ps.ideation.contextTranslator.resolveRuntime.invalidate();
  }, [utils]);

  // Extract the real error from tRPC's appBlocker wrapper
  const extractError = (e: any): string => {
    const tech = e?.data?.appBlocker?.technicalDetails;
    return tech || e.message || "Unknown error";
  };

  // Primary translator mutation — service-backed only, no auto-fallback
  const translateMut = trpc.ps.ideation.contextTranslator.translate.useMutation({
    onSuccess: (data) => {
      setResult(data as any);
      setShowResult(true);
      if (data.decisionGate?.status === "CONTINUE") {
        toast.success("Service analysis complete — review results below");
      } else {
        toast.info("Clarification needed — see questions below");
      }
    },
    onError: (e) => toast.error(extractError(e)),
  });

  // Fallback mutation — built-in LLM path, user-initiated only
  const fallbackMut = trpc.ps.ideation.contextTranslator.translateFallback.useMutation({
    onSuccess: (data) => {
      setResult(data as any);
      setShowResult(true);
      if (data.decisionGate?.status === "CONTINUE") {
        const src = (data as any)._source;
        if (src === "fallback-template") {
          toast.info("Template analysis only — configure LLM for full reasoning");
        } else {
          toast.success("Built-in fallback analysis complete — review results below");
        }
      } else {
        toast.info("Clarification needed — see questions below");
      }
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const applyMut = trpc.ps.ideation.contextTranslator.applyToIdeation.useMutation({
    onSuccess: (data) => {
      toast.success("Translator output applied to ideation fields");
      // Synchronously update the steps cache with server-returned data so
      // tool panels display applied values immediately (no async refetch gap)
      if (data.steps) {
        utils.ps.ideation.steps.get.setData({ ideationId }, data.steps as any);
      }
      utils.ps.ideation.steps.get.invalidate({ ideationId });
      utils.ps.ideation.getById.invalidate({ id: ideationId });
      onApplied?.();
    },
    onError: (e) => toast.error(e.message),
  });

  // Primary: service-backed translator
  const handleTranslate = () => {
    if (!rawText.trim() || rawText.trim().length < 10) {
      toast.error("Please enter at least 10 characters of project description");
      return;
    }
    translateMut.mutate({ ideationId, rawText: rawText.trim() });
  };

  // Secondary: built-in fallback (user must click separate button)
  const handleFallback = () => {
    if (!rawText.trim() || rawText.trim().length < 10) {
      toast.error("Please enter at least 10 characters of project description");
      return;
    }
    fallbackMut.mutate({ ideationId, rawText: rawText.trim() });
  };

  const handleApply = () => {
    if (!result) return;
    applyMut.mutate({ ideationId, translatorResult: result });
  };

  const isAnyMutating = translateMut.isPending || fallbackMut.isPending;
  const isContinue = result?.decisionGate?.status === "CONTINUE";
  const isClarification = result?.decisionGate?.status === "CLARIFICATION_NEEDED";
  const isFallbackResult = result?._source && result._source !== "service";

  // Status pill config
  const statusConfig = getStatusPillConfig(executionMode, isHealthChecking);

  return (
    <div className="space-y-4">
      {/* Input Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Project Context Translator
            {/* Service status pill with tooltip */}
            <div className="ml-auto flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleRefreshHealth}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer border ${statusConfig.pillClass}`}
                  >
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
                    {statusConfig.pillLabel}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[280px]">
                  <div className="space-y-1">
                    <p className="font-medium">{statusConfig.tooltipTitle}</p>
                    <p className="text-[10px] opacity-70">{statusConfig.tooltipDetail}</p>
                    {runtime?.resolvedLlm && (
                      <p className="text-[10px] opacity-70">
                        LLM: {runtime.resolvedLlm.displayName || `${runtime.resolvedLlm.provider}/${runtime.resolvedLlm.model}`}
                      </p>
                    )}
                    {runtime?.serviceUrl && !runtime.serviceOnline && (
                      <p className="text-[10px] opacity-70 font-mono">
                        Service: {runtime.serviceUrl}
                      </p>
                    )}
                    {runtime?.healthError && (
                      <p className="text-[10px] opacity-70">
                        Error: {runtime.healthError}
                      </p>
                    )}
                    {runtime?.target && (
                      <p className="text-[10px] opacity-70">
                        Catalog: {runtime.target.catalogEntryName || runtime.target.displayName || "resolved"}
                      </p>
                    )}
                    {dataUpdatedAt > 0 && (
                      <p className="text-[10px] opacity-50">
                        Checked: {new Date(dataUpdatedAt).toLocaleTimeString()}
                      </p>
                    )}
                    <p className="text-[10px] opacity-50">Click to refresh</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Paste raw project description, idea, or scenario text. The AI translator will analyze it,
            frame The Problem and The Opportunity, extract drivers, and generate a structured ideation package.
          </p>

          {/* Status banners — strict, truthful, no auto-fallback */}
          {executionMode === "unavailable" && (
            <div className="flex items-start gap-2 p-2 rounded bg-red-500/5 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div className="text-xs text-red-600">
                <span className="font-medium">Translator unavailable</span>
                <span className="block text-red-500/80 mt-0.5">
                  {runtime?.error || "Agent not found in catalog. Import the Project Context Translator agent first."}
                </span>
              </div>
            </div>
          )}

          {executionMode === "offline-no-llm" && (
            <div className="flex items-start gap-2 p-2 rounded bg-red-500/5 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div className="text-xs text-red-600">
                <span className="font-medium">Project Context Translator service is offline</span>
                {runtime?.serviceUrl && (
                  <span className="block text-red-500/70 mt-0.5 font-mono text-[10px]">
                    {runtime.serviceUrl}
                  </span>
                )}
                {runtime?.healthError && (
                  <span className="block text-red-500/70 mt-0.5">{runtime.healthError}</span>
                )}
                <span className="block text-red-500/80 mt-1">
                  Primary translator unavailable. No LLM configured for built-in fallback either.
                  Select a Default Reasoning LLM in the Catalog to enable the fallback option.
                </span>
              </div>
            </div>
          )}

          {executionMode === "offline" && (
            <div className="flex items-start gap-2 p-2 rounded bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-600">
                <span className="font-medium">Project Context Translator service is offline</span>
                {runtime?.serviceUrl && (
                  <span className="block text-amber-500/70 mt-0.5 font-mono text-[10px]">
                    {runtime.serviceUrl}
                  </span>
                )}
                {runtime?.healthError && (
                  <span className="block text-amber-500/70 mt-0.5">{runtime.healthError}</span>
                )}
                <span className="block text-amber-500/80 mt-1">
                  Primary translator unavailable. You can use the built-in fallback below as a secondary option.
                  {runtime?.resolvedLlm?.displayName && (
                    <> Fallback LLM: {runtime.resolvedLlm.displayName}.</>
                  )}
                </span>
              </div>
            </div>
          )}

          {executionMode === "online" && (
            <div className="flex items-center gap-2 p-2 rounded bg-green-500/5 border border-green-500/20">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-xs text-green-600">
                Service online{runtime?.resolvedLlm ? ` — ${runtime.resolvedLlm.displayName || `${runtime.resolvedLlm.provider}/${runtime.resolvedLlm.model}`}` : ""}
              </span>
            </div>
          )}

          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={
              executionMode === "unavailable" || executionMode === "offline-no-llm"
                ? "Translation is currently unavailable — see status above."
                : executionMode === "offline"
                ? "Primary translator offline. Enter text and use the built-in fallback button below."
                : "Describe your project idea, situation, or scenario in detail. Include any context about what's driving the need, what problems exist, what opportunities you see..."
            }
            rows={6}
            disabled={disabled || isAnyMutating || (executionMode === "unavailable")}
            className={`text-sm ${executionMode === "unavailable" ? "opacity-50" : ""}`}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{rawText.length}/10000</span>
            <div className="flex items-center gap-2">
              {/* Secondary: Built-in fallback — only shown when service is offline */}
              {canUseFallback && (
                <Button
                  onClick={handleFallback}
                  disabled={disabled || isAnyMutating || rawText.trim().length < 10}
                  size="sm"
                  variant="outline"
                  className="text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                >
                  {fallbackMut.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 mr-1" />
                  )}
                  {fallbackMut.isPending ? "Running fallback..." : "Use built-in fallback"}
                </Button>
              )}
            </div>
          </div>
          {/* Translate Context button — full width below */}
          <div className="flex justify-end">
            <Button
              onClick={handleTranslate}
              disabled={disabled || isAnyMutating || rawText.trim().length < 10 || !canTranslatePrimary}
              size="sm"
            >
              {translateMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1" />
              )}
              {translateMut.isPending ? "Analyzing..." : "Translate Context"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {showResult && result && (
        <>
          {/* Fallback result banner — clearly distinguishes fallback from service output */}
          {isFallbackResult && (
            <Card className="border-amber-500/30">
              <CardContent className="py-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-xs">
                    <span className="font-medium text-amber-600">Built-in fallback result</span>
                    <span className="text-muted-foreground">
                      {" — "}Executed via: {getSourceLabel(result._source!)}
                      {result._resolvedLlm?.displayName && (
                        <> using {result._resolvedLlm.displayName}</>
                      )}
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Decision Gate */}
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center gap-2">
                {isContinue ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-medium text-green-600">
                      {result._source === "fallback-template"
                        ? "Template Analysis"
                        : isFallbackResult
                        ? "Fallback Analysis Complete"
                        : "Analysis Complete"}
                    </span>
                    <Badge variant="outline" className={`ml-auto text-xs ${
                      result._source === "fallback-template"
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        : "bg-green-500/10 text-green-600 border-green-500/30"
                    }`}>
                      {result._source === "fallback-template" ? "LOW CONFIDENCE" : "CONTINUE"}
                    </Badge>
                  </>
                ) : (
                  <>
                    <MessageSquareWarning className="w-5 h-5 text-amber-500" />
                    <span className="text-sm font-medium text-amber-600">Clarification Needed</span>
                    <Badge variant="outline" className="ml-auto text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                      CLARIFICATION_NEEDED
                    </Badge>
                  </>
                )}
              </div>
              {result.decisionGate?.reason && (
                <p className="text-xs text-muted-foreground mt-1">{safeRender(result.decisionGate.reason)}</p>
              )}
            </CardContent>
          </Card>

          {/* Clarification Questions */}
          {isClarification && result.clarificationQuestions?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-amber-600">
                  <HelpCircle className="w-4 h-4" />
                  Clarification Questions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.clarificationQuestions.map((q: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-amber-500 font-medium shrink-0">{i + 1}.</span>
                    <span>{safeRender(q)}</span>
                  </div>
                ))}
                {result.missingInformation?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Missing Information:</p>
                    {result.missingInformation.map((m: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
                        <span>{safeRender(m)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Continue Mode — Full Results */}
          {isContinue && (
            <>
              {/* The Problem */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <XCircle className="w-4 h-4 text-red-500" />
                    The Problem
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {safeRender(result.problem?.status || (result.problem as any)?.classification)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{safeRender(result.problem?.statement) || "Not identified"}</p>
                </CardContent>
              </Card>

              {/* The Opportunity */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Target className="w-4 h-4 text-green-500" />
                    The Opportunity
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {safeRender(result.opportunity?.status || (result.opportunity as any)?.classification)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{safeRender(result.opportunity?.statement) || "Not identified"}</p>
                </CardContent>
              </Card>

              {/* Core Signals */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Zap className="w-4 h-4 text-blue-500" />
                    Project Context Formula
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs font-mono bg-muted/50 rounded px-3 py-2">
                    Project Context = External Drivers + Internal Drivers + Trigger
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">External Drivers</p>
                    <div className="flex flex-wrap gap-1">
                      {result.coreSignals?.externalDrivers?.length > 0 ? (
                        result.coreSignals.externalDrivers.map((d: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {safeRender(d)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">None identified</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Internal Drivers</p>
                    <div className="flex flex-wrap gap-1">
                      {result.coreSignals?.internalDrivers?.length > 0 ? (
                        result.coreSignals.internalDrivers.map((d: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {safeRender(d)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">None identified</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Trigger</p>
                    <p className="text-sm">{safeRender(result.coreSignals?.trigger) || "Not identified"}</p>
                  </div>

                  {result.projectContextResult && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Project Context Result</p>
                      <p className="text-sm">{safeRender(result.projectContextResult)}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* What If? Question */}
              {result.whatIfQuestion && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Lightbulb className="w-4 h-4 text-yellow-500" />
                      Guiding "What If?" Question
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm italic">{safeRender(result.whatIfQuestion)}</p>
                  </CardContent>
                </Card>
              )}

              {/* Ideation Workflow Draft (collapsed) */}
              <IdeationWorkflowDraftSection draft={result.ideationWorkflowDraft} />

              {/* Framing Notes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ClipboardCheck className="w-4 h-4 text-indigo-500" />
                    Framing Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.framingNotes?.extracted?.length > 0 && (
                    <div>
                      <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30 mb-1">
                        Extracted
                      </Badge>
                      <ul className="text-xs space-y-0.5 ml-2">
                        {result.framingNotes.extracted.map((n: any, i: number) => <li key={i}>{safeRender(n)}</li>)}
                      </ul>
                    </div>
                  )}
                  {result.framingNotes?.inferred?.length > 0 && (
                    <div>
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 mb-1">
                        Inferred
                      </Badge>
                      <ul className="text-xs space-y-0.5 ml-2">
                        {result.framingNotes.inferred.map((n: any, i: number) => <li key={i}>{safeRender(n)}</li>)}
                      </ul>
                    </div>
                  )}
                  {result.framingNotes?.proposed?.length > 0 && (
                    <div>
                      <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/30 mb-1">
                        Proposed
                      </Badge>
                      <ul className="text-xs space-y-0.5 ml-2">
                        {result.framingNotes.proposed.map((n: any, i: number) => <li key={i}>{safeRender(n)}</li>)}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* PS Wizard Scenario Package Preview */}
              {result.psWizardScenarioPackage?.scenarioTitle && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-indigo-500" />
                      PS Wizard Scenario Package
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div><span className="font-medium text-muted-foreground">Title:</span> {safeRender(result.psWizardScenarioPackage.scenarioTitle)}</div>
                    <div><span className="font-medium text-muted-foreground">Summary:</span> {safeRender(result.psWizardScenarioPackage.scenarioSummary)}</div>
                    <div><span className="font-medium text-muted-foreground">Business Need:</span> {safeRender(result.psWizardScenarioPackage.businessNeed)}</div>
                    <div><span className="font-medium text-muted-foreground">Primary Problem:</span> {safeRender(result.psWizardScenarioPackage.primaryProblem)}</div>
                    <div><span className="font-medium text-muted-foreground">Opportunity:</span> {safeRender(result.psWizardScenarioPackage.opportunityStatement)}</div>
                    <div><span className="font-medium text-muted-foreground">Urgency Driver:</span> {safeRender(result.psWizardScenarioPackage.urgencyDriver)}</div>
                    <div><span className="font-medium text-muted-foreground">Recommended Direction:</span> {safeRender(result.psWizardScenarioPackage.recommendedDirection)}</div>
                  </CardContent>
                </Card>
              )}

              {/* Apply Button */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleApply}
                  disabled={disabled || applyMut.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {applyMut.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-1" />
                  )}
                  Apply to Ideation Fields
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setResult(null); setShowResult(false); }}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Start Over
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Status Pill Helpers ─────────────────────────────────────────────────────

function getStatusPillConfig(mode: ExecutionMode, isChecking: boolean) {
  if (isChecking || mode === "checking") {
    return {
      pillClass: "bg-amber-500/10 text-amber-600 border-amber-500/30",
      dotClass: "bg-amber-500 animate-pulse",
      pillLabel: "Checking...",
      tooltipTitle: "Checking service status...",
      tooltipDetail: "Resolving catalog agent and service health",
    };
  }
  switch (mode) {
    case "online":
      return {
        pillClass: "bg-green-500/10 text-green-600 border-green-500/30",
        dotClass: "bg-green-500",
        pillLabel: "Online",
        tooltipTitle: "Translator Service Online",
        tooltipDetail: "Primary execution path active. Requests go to the dedicated Python translator service.",
      };
    case "offline":
      return {
        pillClass: "bg-amber-500/10 text-amber-600 border-amber-500/30",
        dotClass: "bg-amber-500",
        pillLabel: "Service Offline",
        tooltipTitle: "Translator Service Offline",
        tooltipDetail: "Primary translator unavailable. Built-in fallback is available as a separate action.",
      };
    case "offline-no-llm":
      return {
        pillClass: "bg-red-500/10 text-red-500 border-red-500/30",
        dotClass: "bg-red-500",
        pillLabel: "Service Offline",
        tooltipTitle: "Translator Service Offline — No Fallback",
        tooltipDetail: "Primary translator offline. No LLM configured for built-in fallback. Configure a Default Reasoning LLM to enable the fallback option.",
      };
    case "unavailable":
    default:
      return {
        pillClass: "bg-red-500/10 text-red-500 border-red-500/30",
        dotClass: "bg-red-500",
        pillLabel: "Unavailable",
        tooltipTitle: "Translator Unavailable",
        tooltipDetail: "Agent not found in catalog or resolution failed.",
      };
  }
}

function getSourceLabel(source: string): string {
  switch (source) {
    case "service": return "Python Service";
    case "built-in-catalog-llm": return "Built-in Agent (Catalog LLM)";
    case "built-in-llm": return "Built-in Agent (Provider Registry)";
    case "fallback-template": return "Template Fallback (No LLM)";
    default: return source;
  }
}

// ── Collapsible Sections ────────────────────────────────────────────────────

function IdeationWorkflowDraftSection({ draft }: { draft: TranslateResponse["ideationWorkflowDraft"] }) {
  const [expanded, setExpanded] = useState(false);

  if (!draft || !draft.contextOfProject) return null;

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-blue-500" />
          Ideation Workflow Draft
          <Badge variant="outline" className="text-[10px] ml-auto">
            {expanded ? "collapse" : "expand"}
          </Badge>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3 text-xs">
          {draft.contextOfProject && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Context</p>
              <p>{safeRender(draft.contextOfProject)}</p>
            </div>
          )}
          {draft.ideaGeneration?.length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Ideas Generated</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                {draft.ideaGeneration.map((idea: any, i: number) => <li key={i}>{safeRender(idea)}</li>)}
              </ol>
            </div>
          )}
          {draft.initialScreening?.promisingIdeas?.length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Promising Ideas</p>
              <ul className="list-disc ml-4 space-y-0.5">
                {draft.initialScreening.promisingIdeas.map((idea: any, i: number) => <li key={i}>{safeRender(idea)}</li>)}
              </ul>
            </div>
          )}
          {(draft.conceptSelection?.selectedIdea || (draft.conceptSelection as any)?.recommendedApproach) && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Selected Concept</p>
              <p className="font-medium">{safeRender(draft.conceptSelection?.selectedIdea || (draft.conceptSelection as any)?.recommendedApproach)}</p>
              <p className="text-muted-foreground mt-0.5">{safeRender(draft.conceptSelection?.rationale)}</p>
            </div>
          )}
          {(draft.quickFeasibilityChecks?.feasibilityRating || (Array.isArray(draft.quickFeasibilityChecks) && draft.quickFeasibilityChecks.length > 0)) && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Feasibility</p>
              {Array.isArray(draft.quickFeasibilityChecks) ? (
                <ul className="list-disc ml-4 space-y-0.5">
                  {(draft.quickFeasibilityChecks as any[]).map((f: any, i: number) => <li key={i}>{safeRender(f)}</li>)}
                </ul>
              ) : (
                <>
                  <Badge variant="outline">{safeRender(draft.quickFeasibilityChecks.feasibilityRating)}</Badge>
                  {draft.quickFeasibilityChecks.keyFindings?.length > 0 && (
                    <ul className="list-disc ml-4 mt-1 space-y-0.5">
                      {draft.quickFeasibilityChecks.keyFindings.map((f: any, i: number) => <li key={i}>{safeRender(f)}</li>)}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
