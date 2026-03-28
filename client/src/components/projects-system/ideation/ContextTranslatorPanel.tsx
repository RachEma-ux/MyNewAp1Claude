/**
 * PS Ideation — Context Translator Panel
 *
 * Accepts raw user text, sends it to the Project Context Translator,
 * and displays structured output with apply-to-fields functionality.
 *
 * Shows: The Problem, The Opportunity, External Drivers, Internal Drivers,
 * Trigger, Project Context Result, What If? Question, ideation workflow draft,
 * and clarification questions when needed.
 */
import { useState, useCallback } from "react";
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
} from "lucide-react";
import type { TranslateResponse } from "@shared/ps-context-translator-types";

interface Props {
  ideationId: number;
  disabled?: boolean;
  onApplied?: () => void;
}

export function ContextTranslatorPanel({ ideationId, disabled, onApplied }: Props) {
  const [rawText, setRawText] = useState("");
  const [result, setResult] = useState<TranslateResponse | null>(null);
  const [showResult, setShowResult] = useState(false);
  const utils = trpc.useUtils();

  // Service runtime health (catalog → service resolution)
  const { data: runtime, isFetching: isHealthChecking, dataUpdatedAt } =
    trpc.ps.ideation.contextTranslator.resolveRuntime.useQuery(
      undefined,
      { staleTime: 30_000, refetchInterval: 60_000 },
    );

  const serviceAvailable = runtime?.health?.available === true;
  const serviceStatus = runtime?.health?.status ?? "unknown";
  const isBuiltIn = serviceStatus === "built-in";

  const handleRefreshHealth = useCallback(() => {
    utils.ps.ideation.contextTranslator.resolveRuntime.invalidate();
  }, [utils]);

  const translateMut = trpc.ps.ideation.contextTranslator.translate.useMutation({
    onSuccess: (data) => {
      setResult(data as TranslateResponse);
      setShowResult(true);
      if (data.decisionGate.status === "CONTINUE") {
        toast.success("Analysis complete — review results below");
      } else {
        toast.info("Clarification needed — see questions below");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const applyMut = trpc.ps.ideation.contextTranslator.applyToIdeation.useMutation({
    onSuccess: () => {
      toast.success("Translator output applied to ideation fields");
      utils.ps.ideation.steps.get.invalidate({ ideationId });
      utils.ps.ideation.getById.invalidate({ id: ideationId });
      onApplied?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleTranslate = () => {
    if (!rawText.trim() || rawText.trim().length < 10) {
      toast.error("Please enter at least 10 characters of project description");
      return;
    }
    translateMut.mutate({ ideationId, rawText: rawText.trim() });
  };

  const handleApply = () => {
    if (!result) return;
    applyMut.mutate({ ideationId, translatorResult: result });
  };

  const isContinue = result?.decisionGate.status === "CONTINUE";
  const isClarification = result?.decisionGate.status === "CLARIFICATION_NEEDED";

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
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer border ${
                      isHealthChecking
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        : serviceAvailable
                          ? isBuiltIn
                            ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                            : "bg-green-500/10 text-green-600 border-green-500/30"
                          : "bg-red-500/10 text-red-500 border-red-500/30"
                    }`}
                  >
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                      isHealthChecking
                        ? "bg-amber-500 animate-pulse"
                        : serviceAvailable
                          ? isBuiltIn ? "bg-blue-500" : "bg-green-500"
                          : "bg-red-500"
                    }`} />
                    {isHealthChecking
                      ? "Checking..."
                      : serviceAvailable
                        ? isBuiltIn ? "Built-in" : "Online"
                        : "Offline"}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[240px]">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {isHealthChecking
                        ? "Checking service status..."
                        : serviceAvailable
                          ? isBuiltIn
                            ? "Built-in LLM Translator"
                            : "Python Service Online"
                          : "Service Offline"}
                    </p>
                    {runtime?.target && (
                      <p className="text-[10px] opacity-70">
                        Catalog: {runtime.target.catalogEntryName || runtime.target.displayName || "resolved"}
                      </p>
                    )}
                    {dataUpdatedAt > 0 && (
                      <p className="text-[10px] opacity-70">
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
          {runtime && !serviceAvailable && (
            <div className="flex items-start gap-2 p-2 rounded bg-red-500/5 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div className="text-xs text-red-600">
                <span className="font-medium">All translation backends unavailable</span>
                {runtime.health?.error && <span className="block text-red-500/80 mt-0.5">{runtime.health.error}</span>}
                <span className="block text-red-500/70 mt-0.5">Configure an LLM provider or start the Python service to enable translation.</span>
              </div>
            </div>
          )}
          {runtime && serviceAvailable && isBuiltIn && (
            <div className="flex items-center gap-2 p-2 rounded bg-blue-500/5 border border-blue-500/20">
              <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-xs text-blue-600">
                Using built-in translator — Python service offline
              </span>
            </div>
          )}
          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={
              runtime && !serviceAvailable
                ? "Translation is currently unavailable — configure an LLM provider or start the Python service first."
                : "Describe your project idea, situation, or scenario in detail. Include any context about what's driving the need, what problems exist, what opportunities you see..."
            }
            rows={6}
            disabled={disabled || translateMut.isPending || (runtime != null && !serviceAvailable)}
            className={`text-sm ${runtime && !serviceAvailable ? "opacity-50" : ""}`}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{rawText.length}/10000</span>
            <Button
              onClick={handleTranslate}
              disabled={disabled || translateMut.isPending || rawText.trim().length < 10 || (runtime != null && !serviceAvailable)}
              size="sm"
            >
              {translateMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1" />
              )}
              {translateMut.isPending
                ? "Analyzing..."
                : runtime && !serviceAvailable
                  ? "Service Unavailable"
                  : isBuiltIn
                    ? "Translate (Built-in)"
                    : "Translate Context"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {showResult && result && (
        <>
          {/* Decision Gate */}
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center gap-2">
                {isContinue ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-medium text-green-600">Analysis Complete</span>
                    <Badge variant="outline" className="ml-auto text-xs bg-green-500/10 text-green-600 border-green-500/30">
                      CONTINUE
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
              {result.decisionGate.reason && (
                <p className="text-xs text-muted-foreground mt-1">{result.decisionGate.reason}</p>
              )}
            </CardContent>
          </Card>

          {/* Clarification Questions */}
          {isClarification && result.clarificationQuestions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-amber-600">
                  <HelpCircle className="w-4 h-4" />
                  Clarification Questions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.clarificationQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-amber-500 font-medium shrink-0">{i + 1}.</span>
                    <span>{q}</span>
                  </div>
                ))}
                {result.missingInformation.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Missing Information:</p>
                    {result.missingInformation.map((m, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
                        <span>{m}</span>
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
                      {result.problem.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{result.problem.statement || "Not identified"}</p>
                </CardContent>
              </Card>

              {/* The Opportunity */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Target className="w-4 h-4 text-green-500" />
                    The Opportunity
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {result.opportunity.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{result.opportunity.statement || "Not identified"}</p>
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
                      {result.coreSignals.externalDrivers.length > 0 ? (
                        result.coreSignals.externalDrivers.map((d, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{d}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">None identified</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Internal Drivers</p>
                    <div className="flex flex-wrap gap-1">
                      {result.coreSignals.internalDrivers.length > 0 ? (
                        result.coreSignals.internalDrivers.map((d, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{d}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">None identified</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Trigger</p>
                    <p className="text-sm">{result.coreSignals.trigger || "Not identified"}</p>
                  </div>

                  {result.projectContextResult && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Project Context Result</p>
                      <p className="text-sm">{result.projectContextResult}</p>
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
                    <p className="text-sm italic">{result.whatIfQuestion}</p>
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
                  {result.framingNotes.extracted.length > 0 && (
                    <div>
                      <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30 mb-1">
                        Extracted
                      </Badge>
                      <ul className="text-xs space-y-0.5 ml-2">
                        {result.framingNotes.extracted.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    </div>
                  )}
                  {result.framingNotes.inferred.length > 0 && (
                    <div>
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 mb-1">
                        Inferred
                      </Badge>
                      <ul className="text-xs space-y-0.5 ml-2">
                        {result.framingNotes.inferred.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    </div>
                  )}
                  {result.framingNotes.proposed.length > 0 && (
                    <div>
                      <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/30 mb-1">
                        Proposed
                      </Badge>
                      <ul className="text-xs space-y-0.5 ml-2">
                        {result.framingNotes.proposed.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* PS Wizard Scenario Package Preview */}
              {result.psWizardScenarioPackage.scenarioTitle && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-indigo-500" />
                      PS Wizard Scenario Package
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div><span className="font-medium text-muted-foreground">Title:</span> {result.psWizardScenarioPackage.scenarioTitle}</div>
                    <div><span className="font-medium text-muted-foreground">Summary:</span> {result.psWizardScenarioPackage.scenarioSummary}</div>
                    <div><span className="font-medium text-muted-foreground">Business Need:</span> {result.psWizardScenarioPackage.businessNeed}</div>
                    <div><span className="font-medium text-muted-foreground">Primary Problem:</span> {result.psWizardScenarioPackage.primaryProblem}</div>
                    <div><span className="font-medium text-muted-foreground">Opportunity:</span> {result.psWizardScenarioPackage.opportunityStatement}</div>
                    <div><span className="font-medium text-muted-foreground">Urgency Driver:</span> {result.psWizardScenarioPackage.urgencyDriver}</div>
                    <div><span className="font-medium text-muted-foreground">Recommended Direction:</span> {result.psWizardScenarioPackage.recommendedDirection}</div>
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

/**
 * Collapsible Ideation Workflow Draft section.
 */
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
              <p>{draft.contextOfProject}</p>
            </div>
          )}
          {draft.ideaGeneration.length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Ideas Generated</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                {draft.ideaGeneration.map((idea, i) => <li key={i}>{idea}</li>)}
              </ol>
            </div>
          )}
          {draft.initialScreening.promisingIdeas.length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Promising Ideas</p>
              <ul className="list-disc ml-4 space-y-0.5">
                {draft.initialScreening.promisingIdeas.map((idea, i) => <li key={i}>{idea}</li>)}
              </ul>
            </div>
          )}
          {draft.conceptSelection.selectedIdea && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Selected Concept</p>
              <p className="font-medium">{draft.conceptSelection.selectedIdea}</p>
              <p className="text-muted-foreground mt-0.5">{draft.conceptSelection.rationale}</p>
            </div>
          )}
          {draft.quickFeasibilityChecks.feasibilityRating && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Feasibility</p>
              <Badge variant="outline">{draft.quickFeasibilityChecks.feasibilityRating}</Badge>
              {draft.quickFeasibilityChecks.keyFindings.length > 0 && (
                <ul className="list-disc ml-4 mt-1 space-y-0.5">
                  {draft.quickFeasibilityChecks.keyFindings.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
