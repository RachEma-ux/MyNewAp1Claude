/**
 * PS Wizard — Shell (IBM Carbon pattern)
 *
 * Fragment pattern: returns <>sidebar + content</> — parent page provides
 * the flex wrapper cloned from PmCentralSidebarLayout.
 *
 * Owns: step + all wizard state. Renders sidebar (left) + step content (right).
 * Converted from custom bg-black theme to app design system (shadcn/Tailwind).
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

import { PSWizardSidebar, type WizardStep } from "./PSWizardSidebar";

// ── Types ────────────────────────────────────────────────────────────

type ContextState = {
  businessUnit: string;
  region: string;
  strategicImportance: string;
  existingSituation: string;
};

type AnswerMap = Record<string, string>;

type Recommendation = {
  matrixVersionId: number;
  matrixVersion: string;
  selectedScope: string | null;
  selectedScopeCode: string | null;
  top3: Array<{ scopeId: number; scopeCode: string; scopeLabel: string; score: number }>;
  confidence: string;
  winnerMargin: number;
  explainability: {
    positiveContributors: string[];
    negativeContributors: string[];
  };
};

type KpiTargets = {
  expectedCostSavings: string;
  expectedTimeReductionPercent: string;
  expectedRevenueImpact: string;
  expectedDeliveryTimelineWeeks: string;
  primarySuccessMetric: string;
};

// ── Confidence Gate ──────────────────────────────────────────────────

const CONFIDENCE_GATE = {
  HIGH_THRESHOLD: 15,
  MEDIUM_THRESHOLD: 8,
} as const;

type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

function getConfidenceLevel(winnerMargin: number): ConfidenceLevel {
  if (winnerMargin >= CONFIDENCE_GATE.HIGH_THRESHOLD) return "HIGH";
  if (winnerMargin >= CONFIDENCE_GATE.MEDIUM_THRESHOLD) return "MEDIUM";
  return "LOW";
}

const STEP_LABELS = [
  "Intake", "Analysis", "Questions", "Scoring", "Explainability",
  "Recommendation", "Accept", "Create", "Validation", "PM Central", "Feedback",
] as const;

function deriveProjectName(text: string): string {
  const trimmed = text.trim();
  const firstSentence = trimmed.split(/[.!?\n]/)[0]?.trim() || trimmed;
  if (firstSentence.length <= 80) return firstSentence;
  const cut = firstSentence.slice(0, 80);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
}

// ── Mobile hook ──────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── Confidence badge ─────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const cls =
    level === "HIGH" ? "bg-green-600 text-white"
    : level === "MEDIUM" ? "bg-yellow-600 text-white"
    : "bg-red-600 text-white";
  return <Badge className={cls}>{level}</Badge>;
}

// ── Main Shell ───────────────────────────────────────────────────────

export function PSWizardShell() {
  const [step, setStep] = useState<WizardStep>(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // ── Input state ────────────────────────────────────────────────────
  const [scenario, setScenario] = useState("");
  const [context, setContext] = useState<ContextState>({
    businessUnit: "", region: "", strategicImportance: "", existingSituation: "",
  });
  const [generatedName, setGeneratedName] = useState("");
  const [answers, setAnswers] = useState<AnswerMap>({});

  // ── Classification result ──────────────────────────────────────────
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  // ── Confidence gate state ──────────────────────────────────────────
  const [lowConfidenceAcknowledged, setLowConfidenceAcknowledged] = useState(false);

  // ── KPI targets ────────────────────────────────────────────────────
  const [kpiTargets, setKpiTargets] = useState<KpiTargets>({
    expectedCostSavings: "", expectedTimeReductionPercent: "",
    expectedRevenueImpact: "", expectedDeliveryTimelineWeeks: "",
    primarySuccessMetric: "",
  });

  // ── Text analysis state ────────────────────────────────────────────
  const [textSignals, setTextSignals] = useState<Array<{
    questionCode: string;
    suggestedAnswer: "Yes" | "No" | null;
    matchedKeywords: string[];
    confidence: "strong" | "weak" | "none";
  }>>([]);
  const [analysisRan, setAnalysisRan] = useState(false);

  // ── Post-creation state ────────────────────────────────────────────
  const [createdProjectId, setCreatedProjectId] = useState<number | null>(null);
  const [createError, setCreateError] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackOutcome, setFeedbackOutcome] = useState<string>("");

  // ── API hooks ──────────────────────────────────────────────────────
  const { data: matrixData } = trpc.ps.matrix.getActiveQuestions.useQuery(undefined);
  const classifyMutation = trpc.ps.classifyScenario.useMutation();
  const analyzeTextMut = trpc.ps.analyzeText.useMutation();
  const utils = trpc.useUtils();
  const createProjectMut = trpc.ps.projects.create.useMutation();
  const submitMut = trpc.ps.lifecycle.submit.useMutation();
  const sendToPMMut = trpc.ps.lifecycle.sendToPM.useMutation();
  const feedbackMut = trpc.ps.feedback.create.useMutation();
  const { data: createdProject, refetch: refetchProject } = trpc.ps.projects.get.useQuery(
    { id: createdProjectId! },
    { enabled: createdProjectId !== null },
  );

  const [, navigate] = useLocation();

  const questions = matrixData?.available ? matrixData.questions : [];
  const dimensions = matrixData?.available ? matrixData.dimensions : [];
  const confidenceLevel: ConfidenceLevel | null = recommendation
    ? getConfidenceLevel(recommendation.winnerMargin) : null;

  // ── Step navigation ────────────────────────────────────────────────

  const canGoNext =
    (step === 1 && scenario.trim().length > 0) ||
    (step === 2 && generatedName.trim().length > 0) ||
    step === 3 ||
    (step >= 4 && step <= 6 && recommendation !== null) ||
    (step === 7 && recommendation !== null && canCreateProject()) ||
    (step === 8 && createdProjectId !== null) ||
    (step === 9 && createdProject !== null) ||
    step === 10 ||
    false;

  function canCreateProject(): boolean {
    if (!recommendation) return false;
    const level = getConfidenceLevel(recommendation.winnerMargin);
    if (level === "HIGH" || level === "MEDIUM") return true;
    return overrideReason.trim().length > 0 && lowConfidenceAcknowledged;
  }

  function nextStep() {
    if (!canGoNext) return;
    if (step === 1) {
      if (!generatedName) setGeneratedName(deriveProjectName(scenario));
      if (questions.length > 0) {
        analyzeTextMut.mutate(
          { scenario, context, questionCodes: questions.map((q) => q.code) },
          {
            onSuccess: (result) => {
              setTextSignals(result.signals);
              setAnalysisRan(true);
              if (Object.keys(result.suggestedAnswers).length > 0) {
                setAnswers((prev) => {
                  const merged = { ...prev };
                  for (const [code, val] of Object.entries(result.suggestedAnswers)) {
                    if (!merged[code]) merged[code] = val;
                  }
                  return merged;
                });
              }
            },
          },
        );
      }
      setStep(2);
      return;
    }
    if (step === 3) { handleRunClassification(); return; }
    if (step === 7) { handleCreateProject(); return; }
    if (step < 11) setStep((s) => (s + 1) as WizardStep);
  }

  function prevStep() {
    if (step <= 1 || step > 8) return;
    setStep((s) => (s - 1) as WizardStep);
  }

  // ── Classification ─────────────────────────────────────────────────

  async function handleRunClassification() {
    setCreateError("");
    try {
      const result = await classifyMutation.mutateAsync({ scenario, context, answers });
      setRecommendation(result);
      setLowConfidenceAcknowledged(false);
      setStep(4);
    } catch (err: any) {
      setCreateError(err?.message || "Classification failed");
    }
  }

  // ── Project creation ───────────────────────────────────────────────

  async function handleCreateProject() {
    if (!recommendation) {
      setCreateError("No recommendation available — go back and classify first.");
      return;
    }
    const level = getConfidenceLevel(recommendation.winnerMargin);
    if (level === "LOW" && !overrideReason.trim()) {
      setCreateError("Low-confidence classification requires an override reason before creating.");
      return;
    }
    if (level === "LOW" && !lowConfidenceAcknowledged) {
      setCreateError("Please acknowledge the low-confidence decision before creating.");
      return;
    }
    setCreateError("");
    try {
      const projectName = generatedName.trim() || recommendation.selectedScope || "Untitled Project";
      const project = await createProjectMut.mutateAsync({
        name: projectName, scenario, context, answers,
        selectedScopeCode: recommendation.selectedScopeCode ?? "CUSTOM",
        selectedScopeLabel: recommendation.selectedScope ?? "Custom",
        topScopes: recommendation.top3.map((t) => ({
          scopeCode: t.scopeCode, scopeLabel: t.scopeLabel, score: t.score,
        })),
        confidence: recommendation.confidence,
        winnerMargin: recommendation.winnerMargin,
        explainability: recommendation.explainability,
        matrixVersionId: recommendation.matrixVersionId,
        matrixVersion: recommendation.matrixVersion,
        overrideReason: overrideReason.trim() || "",
        confidenceGateResult: level,
        kpiTargets,
      });
      setCreatedProjectId(project.id);
      await utils.ps.projects.list.invalidate();
      setStep(8);
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create PS project");
    }
  }

  async function handleSubmitForValidation() {
    if (!createdProjectId) return;
    try {
      await submitMut.mutateAsync({ projectId: createdProjectId });
      await refetchProject();
    } catch (err: any) {
      setCreateError(err?.message || "Validation transition failed");
    }
  }

  async function handleSendToPM() {
    if (!createdProjectId) return;
    try {
      await sendToPMMut.mutateAsync({ projectId: createdProjectId });
      await refetchProject();
    } catch (err: any) {
      setCreateError(err?.message || "PM handoff failed");
    }
  }

  async function handleSubmitFeedback() {
    if (!createdProjectId || !feedbackOutcome) return;
    try {
      await feedbackMut.mutateAsync({
        psProjectId: createdProjectId,
        outcome: feedbackOutcome as "success" | "partial" | "failed" | "cancelled",
        notes: feedbackNotes || undefined,
      });
      navigate("/ps/list");
    } catch (err: any) {
      setCreateError(err?.message || "Feedback submission failed");
    }
  }

  const isPostCreation = step >= 8;
  const isClassifying = classifyMutation.isPending;
  const isCreating = createProjectMut.isPending;

  // ── Content resolver ───────────────────────────────────────────────

  function renderStepContent() {
    switch (step) {
      case 1: return <StepIntake scenario={scenario} setScenario={setScenario} context={context} setContext={setContext} />;
      case 2: return (
        <StepAnalysis
          scenario={scenario} generatedName={generatedName} setGeneratedName={setGeneratedName}
          context={context} questions={questions} dimensions={dimensions}
          analysisRan={analysisRan} textSignals={textSignals}
          analyzeTextPending={analyzeTextMut.isPending}
        />
      );
      case 3: return (
        <StepQuestions
          questions={questions} answers={answers} setAnswers={setAnswers}
          isClassifying={isClassifying} error={createError}
        />
      );
      case 4: return (
        <StepScoring
          recommendation={recommendation} confidenceLevel={confidenceLevel}
          isClassifying={isClassifying}
        />
      );
      case 5: return <StepExplainability recommendation={recommendation} />;
      case 6: return (
        <StepRecommendation
          recommendation={recommendation} confidenceLevel={confidenceLevel}
          overrideReason={overrideReason} setOverrideReason={setOverrideReason}
          lowConfidenceAcknowledged={lowConfidenceAcknowledged}
          setLowConfidenceAcknowledged={setLowConfidenceAcknowledged}
        />
      );
      case 7: return (
        <StepAccept
          generatedName={generatedName} scenario={scenario} context={context}
          recommendation={recommendation} confidenceLevel={confidenceLevel}
          answers={answers} overrideReason={overrideReason}
          kpiTargets={kpiTargets} setKpiTargets={setKpiTargets}
          error={createError}
          lowConfidenceAcknowledged={lowConfidenceAcknowledged}
        />
      );
      case 8: return (
        <StepCreate
          createdProjectId={createdProjectId} isCreating={isCreating}
          confidenceLevel={confidenceLevel} overrideReason={overrideReason}
          error={createError}
        />
      );
      case 9: return (
        <StepValidation
          createdProject={createdProject} onSubmit={handleSubmitForValidation}
          isPending={submitMut.isPending} error={createError}
        />
      );
      case 10: return (
        <StepPMCentral
          createdProject={createdProject} onSendToPM={handleSendToPM}
          isPending={sendToPMMut.isPending} error={createError}
        />
      );
      case 11: return (
        <StepFeedback
          feedbackOutcome={feedbackOutcome} setFeedbackOutcome={setFeedbackOutcome}
          feedbackNotes={feedbackNotes} setFeedbackNotes={setFeedbackNotes}
          onSubmit={handleSubmitFeedback} onSkip={() => navigate("/ps/list")}
          isPending={feedbackMut.isPending} error={createError}
        />
      );
      default: return null;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <PSWizardSidebar
        currentStep={step}
        onStepSelect={setStep}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />

      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">PS Wizard</h1>
            <Badge variant="outline" className="text-xs">
              {step}. {STEP_LABELS[step - 1]}
            </Badge>
          </div>
          <Badge variant="outline" className="text-indigo-600 border-indigo-500/30">
            11-Step Flow
          </Badge>
        </div>

        {/* Progress indicator — linear flow visual cue */}
        <div className="flex items-center gap-1 px-4 py-1.5 border-b shrink-0 bg-muted/30">
          {STEP_LABELS.map((label, i) => {
            const num = (i + 1) as WizardStep;
            const completed = num < step;
            const active = num === step;
            return (
              <div key={num} className="flex items-center gap-1 flex-1 min-w-0">
                <button
                  onClick={() => { if (num <= step) setStep(num); }}
                  disabled={num > step}
                  title={`${num}. ${label}`}
                  className={cn(
                    "h-1.5 w-full rounded-full transition-all",
                    completed ? "bg-green-500"
                      : active ? "bg-blue-500"
                        : "bg-muted-foreground/20",
                    num <= step ? "cursor-pointer hover:opacity-80" : "cursor-default",
                  )}
                />
              </div>
            );
          })}
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {renderStepContent()}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between px-4 py-2 border-t shrink-0">
          <span className="text-xs text-muted-foreground">
            Step {step} of 11 — {STEP_LABELS[step - 1]}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={prevStep}
              disabled={step === 1 || isPostCreation}
            >
              Back
            </Button>
            {step < 11 && (
              <Button
                size="sm"
                onClick={nextStep}
                disabled={!canGoNext || isClassifying || isCreating}
              >
                {step === 3 ? "Classify" : step === 7 ? "Accept & Create" : "Next"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// =====================================================================
// Step Components (inline — same as original, converted to design system)
// =====================================================================

// ── Step 1: Intake ───────────────────────────────────────────────────

function StepIntake({
  scenario, setScenario, context, setContext,
}: {
  scenario: string; setScenario: (v: string) => void;
  context: ContextState; setContext: (v: ContextState) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">1. Intake</h2>
        <p className="text-sm text-muted-foreground mt-1">Describe the project scenario and set organizational context</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Project Scenario</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={scenario} onChange={(e) => setScenario(e.target.value)}
            placeholder="Describe the project scenario..." rows={6}
          />
          <p className="text-xs text-muted-foreground">{scenario.length}/5000 characters</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Organizational Context</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Business Unit</Label>
              <Input value={context.businessUnit} onChange={(e) => setContext({ ...context, businessUnit: e.target.value })} placeholder="Business Unit" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Region</Label>
              <Input value={context.region} onChange={(e) => setContext({ ...context, region: e.target.value })} placeholder="Region" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Strategic Importance</Label>
              <Input value={context.strategicImportance} onChange={(e) => setContext({ ...context, strategicImportance: e.target.value })} placeholder="Strategic Importance" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Existing Situation</Label>
            <Textarea value={context.existingSituation} onChange={(e) => setContext({ ...context, existingSituation: e.target.value })} placeholder="Describe what is existing if any..." rows={4} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Step 2: Analysis ─────────────────────────────────────────────────

function StepAnalysis({
  scenario, generatedName, setGeneratedName, context, questions, dimensions,
  analysisRan, textSignals, analyzeTextPending,
}: {
  scenario: string; generatedName: string; setGeneratedName: (v: string) => void;
  context: ContextState; questions: any[]; dimensions: any[];
  analysisRan: boolean; textSignals: any[]; analyzeTextPending: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">2. Analysis</h2>
        <p className="text-sm text-muted-foreground mt-1">Text analysis, auto-extracted answers, and project naming</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Scenario Summary</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">Analysed ({scenario.length} chars)</p>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm max-h-24 overflow-y-auto">
            {scenario.slice(0, 300)}{scenario.length > 300 ? "..." : ""}
          </div>
          {analyzeTextPending && <p className="text-sm text-blue-500">Analysing scenario text...</p>}
          {analysisRan && textSignals.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Auto-Extracted Answers</p>
              {textSignals.map((sig) => {
                const q = questions.find((qq: any) => qq.code === sig.questionCode);
                return (
                  <div key={sig.questionCode} className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                    <span className="flex-1">{q?.label ?? sig.questionCode}</span>
                    {sig.suggestedAnswer ? (
                      <Badge variant="outline" className={sig.suggestedAnswer === "Yes" ? "text-green-600 border-green-500/30" : "text-red-600 border-red-500/30"}>
                        {sig.suggestedAnswer}
                      </Badge>
                    ) : (
                      <Badge variant="outline">—</Badge>
                    )}
                    <span className={`text-xs ${sig.confidence === "strong" ? "text-green-500" : sig.confidence === "weak" ? "text-yellow-500" : "text-muted-foreground"}`}>
                      {sig.confidence}
                    </span>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">Pre-filled on the Questions step. You can override them.</p>
            </div>
          )}
          {analysisRan && textSignals.filter((s) => s.suggestedAnswer).length === 0 && (
            <p className="text-sm text-muted-foreground">No strong signals detected. Answer questions manually on the next step.</p>
          )}
          {(context.businessUnit || context.region || context.strategicImportance) && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Context Signals</p>
              <ul className="text-sm space-y-0.5 text-muted-foreground">
                {context.businessUnit && <li>Business Unit: {context.businessUnit}</li>}
                {context.region && <li>Region: {context.region}</li>}
                {context.strategicImportance && <li>Strategic Importance: {context.strategicImportance}</li>}
              </ul>
            </div>
          )}
          {dimensions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Classification Dimensions</p>
              <div className="grid gap-2 md:grid-cols-2">
                {dimensions.map((dim: any) => (
                  <div key={dim.id} className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{dim.dimensionLabel}:</span>{" "}
                    <span>{dim.values.length > 0 ? dim.values.map((v: any) => v.valueLabel).join(", ") : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Project Name</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input value={generatedName} onChange={(e) => setGeneratedName(e.target.value)} placeholder="Project name" className="text-lg font-semibold" />
          <p className="text-xs text-muted-foreground">Auto-derived from scenario — edit if needed</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Step 3: Questions ────────────────────────────────────────────────

function StepQuestions({
  questions, answers, setAnswers, isClassifying, error,
}: {
  questions: any[]; answers: AnswerMap; setAnswers: (v: AnswerMap) => void;
  isClassifying: boolean; error: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">3. Questions</h2>
        <p className="text-sm text-muted-foreground mt-1">DB-driven classification questions from active matrix</p>
      </div>
      {questions.length === 0 ? (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              No questions loaded. Ensure an active matrix version exists in PS Control Panel.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {questions.map((q: any) => (
            <Card key={q.id}>
              <CardContent className="pt-4 space-y-3">
                <p className="font-medium text-sm">{q.label}</p>
                <div className="flex gap-2">
                  {["Yes", "No"].map((value) => (
                    <Button
                      key={value} size="sm"
                      variant={answers[q.code] === value ? "default" : "outline"}
                      onClick={() => setAnswers({ ...answers, [q.code]: value })}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {isClassifying && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="pt-4 flex items-center gap-2 text-sm text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" /> Running classification...
          </CardContent>
        </Card>
      )}
      {error && <ErrorBanner message={error} />}
    </div>
  );
}

// ── Step 4: Scoring ──────────────────────────────────────────────────

function StepScoring({
  recommendation, confidenceLevel, isClassifying,
}: {
  recommendation: Recommendation | null; confidenceLevel: ConfidenceLevel | null;
  isClassifying: boolean;
}) {
  if (!recommendation) {
    return <p className="text-sm text-muted-foreground">{isClassifying ? "Running classification..." : "No scores available"}</p>;
  }
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">4. Scoring</h2>
        <p className="text-sm text-muted-foreground mt-1">Matrix evaluation scores per scope</p>
      </div>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Ranked Scopes (Top 3)</p>
          <ol className="list-decimal space-y-2 pl-5">
            {recommendation.top3.map((item, idx) => (
              <li key={item.scopeId}>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">{item.scopeLabel}</span>
                  <span className="text-xs text-muted-foreground">({item.scopeCode})</span>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="h-2 rounded-full bg-muted w-32">
                      <div
                        className={`h-2 rounded-full ${idx === 0 ? "bg-indigo-500" : "bg-muted-foreground/30"}`}
                        style={{ width: `${recommendation.top3[0].score > 0 ? (item.score / recommendation.top3[0].score) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-8 text-right">{item.score}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="grid gap-4 md:grid-cols-2 pt-2">
            <div><p className="text-xs text-muted-foreground">Winner Margin</p><p className="font-semibold text-lg">+{recommendation.winnerMargin}</p></div>
            <div><p className="text-xs text-muted-foreground">Confidence</p><p className="font-semibold text-lg">{recommendation.confidence}</p></div>
          </div>
        </CardContent>
      </Card>
      {confidenceLevel && (
        <Card className={
          confidenceLevel === "HIGH" ? "border-green-500/30 bg-green-500/5"
          : confidenceLevel === "MEDIUM" ? "border-yellow-500/30 bg-yellow-500/5"
          : "border-red-500/30 bg-red-500/5"
        }>
          <CardContent className="pt-4 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Confidence Gate:</span>
              <ConfidenceBadge level={confidenceLevel} />
            </div>
            <p className="text-sm text-muted-foreground">
              {confidenceLevel === "HIGH" && <>Winner margin +{recommendation.winnerMargin} meets high-confidence threshold (≥{CONFIDENCE_GATE.HIGH_THRESHOLD}). Normal flow.</>}
              {confidenceLevel === "MEDIUM" && <>Winner margin +{recommendation.winnerMargin} is moderate ({CONFIDENCE_GATE.MEDIUM_THRESHOLD}–{CONFIDENCE_GATE.HIGH_THRESHOLD - 1}). Review the recommendation carefully.</>}
              {confidenceLevel === "LOW" && <>Winner margin +{recommendation.winnerMargin} is below threshold (&lt;{CONFIDENCE_GATE.MEDIUM_THRESHOLD}). An override reason is required.</>}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Step 5: Explainability ───────────────────────────────────────────

function StepExplainability({ recommendation }: { recommendation: Recommendation | null }) {
  if (!recommendation) return <p className="text-sm text-muted-foreground">No explainability data available</p>;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">5. Explainability</h2>
        <p className="text-sm text-muted-foreground mt-1">Why this scope was selected</p>
      </div>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-green-600">Positive Contributors</p>
            {recommendation.explainability.positiveContributors.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{recommendation.explainability.positiveContributors.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : <p className="text-sm text-muted-foreground mt-1">None detected</p>}
          </div>
          <div>
            <p className="text-sm font-semibold text-red-600">Negative / Missing Contributors</p>
            {recommendation.explainability.negativeContributors.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{recommendation.explainability.negativeContributors.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : <p className="text-sm text-muted-foreground mt-1">No negative signals</p>}
          </div>
          <p className="text-xs text-muted-foreground pt-2">Winner margin: +{recommendation.winnerMargin} | Confidence: {recommendation.confidence}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Step 6: Recommendation ───────────────────────────────────────────

function StepRecommendation({
  recommendation, confidenceLevel, overrideReason, setOverrideReason,
  lowConfidenceAcknowledged, setLowConfidenceAcknowledged,
}: {
  recommendation: Recommendation | null; confidenceLevel: ConfidenceLevel | null;
  overrideReason: string; setOverrideReason: (v: string) => void;
  lowConfidenceAcknowledged: boolean; setLowConfidenceAcknowledged: (v: boolean) => void;
}) {
  if (!recommendation) return <p className="text-sm text-muted-foreground">No recommendation available</p>;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">6. Recommendation</h2>
        <p className="text-sm text-muted-foreground mt-1">Final scope recommendation</p>
      </div>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <p className="text-xs text-muted-foreground">Recommended Scope</p>
          <p className="text-2xl font-bold text-indigo-500">{recommendation.selectedScope}</p>
          <p className="text-xs text-muted-foreground">Code: {recommendation.selectedScopeCode} | Matrix: {recommendation.matrixVersion}</p>
          <div className="space-y-2 pt-2">
            <Label className="text-xs">
              Override Reason
              {confidenceLevel === "LOW" ? <span className="text-red-500 ml-1">(Required — low confidence)</span> : <span className="text-muted-foreground ml-1">(Optional)</span>}
            </Label>
            <Textarea
              value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
              placeholder={confidenceLevel === "LOW" ? "Required: explain why you are proceeding despite low confidence..." : "If you disagree with the recommendation, explain why..."}
              rows={3}
              className={confidenceLevel === "LOW" && !overrideReason.trim() ? "border-red-500/50" : ""}
            />
          </div>
          {confidenceLevel === "LOW" && (
            <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <Checkbox
                checked={lowConfidenceAcknowledged}
                onCheckedChange={(checked) => setLowConfidenceAcknowledged(!!checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-red-600">
                I acknowledge this is a low-confidence classification (winner margin +{recommendation.winnerMargin}) and I am proceeding with an explicit override decision.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Step 7: Accept ───────────────────────────────────────────────────

function StepAccept({
  generatedName, scenario, context, recommendation, confidenceLevel,
  answers, overrideReason, kpiTargets, setKpiTargets, error,
  lowConfidenceAcknowledged,
}: {
  generatedName: string; scenario: string; context: ContextState;
  recommendation: Recommendation | null; confidenceLevel: ConfidenceLevel | null;
  answers: AnswerMap; overrideReason: string;
  kpiTargets: KpiTargets; setKpiTargets: (v: KpiTargets) => void;
  error: string; lowConfidenceAcknowledged: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">7. Accept</h2>
        <p className="text-sm text-muted-foreground mt-1">Review inputs, set KPI targets, and confirm before project creation</p>
      </div>
      <Card>
        <CardContent className="pt-4 space-y-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Project Name</p><p className="font-semibold">{generatedName || "Auto-generated"}</p></div>
          <div><p className="text-xs text-muted-foreground">Scenario</p><p className="text-muted-foreground max-h-20 overflow-y-auto">{scenario.slice(0, 200)}{scenario.length > 200 ? "..." : ""}</p></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Business Unit</p><p>{context.businessUnit || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Region</p><p>{context.region || "—"}</p></div>
          </div>
          <div><p className="text-xs text-muted-foreground">Selected Scope</p><p className="font-semibold text-indigo-500">{recommendation?.selectedScope ?? "—"}</p></div>
          <div className="grid gap-3 md:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Confidence Gate</p>{confidenceLevel ? <ConfidenceBadge level={confidenceLevel} /> : "—"}</div>
            <div><p className="text-xs text-muted-foreground">Matrix Version</p><p>{recommendation?.matrixVersion ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Questions Answered</p><p>{Object.keys(answers).length}</p></div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Decision Trace</p>
            <div className="mt-1 rounded-lg bg-muted/50 px-3 py-2 text-xs font-mono text-muted-foreground">
              scope={recommendation?.selectedScopeCode} | gate={confidenceLevel} | margin=+{recommendation?.winnerMargin} | matrix_v={recommendation?.matrixVersion} | top3=[{recommendation?.top3.map((t) => t.scopeCode).join(", ")}]
            </div>
          </div>
          {overrideReason && <div><p className="text-xs text-muted-foreground">Override Reason</p><p className="text-yellow-600">{overrideReason}</p></div>}
        </CardContent>
      </Card>
      <Card className="border-indigo-500/30 bg-indigo-500/5">
        <CardHeader><CardTitle className="text-sm">KPI Targets (Optional)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1"><Label className="text-xs">Expected Cost Savings</Label><Input value={kpiTargets.expectedCostSavings} onChange={(e) => setKpiTargets({ ...kpiTargets, expectedCostSavings: e.target.value })} placeholder="e.g. $50,000 or 15%" /></div>
            <div className="space-y-1"><Label className="text-xs">Expected Time Reduction %</Label><Input value={kpiTargets.expectedTimeReductionPercent} onChange={(e) => setKpiTargets({ ...kpiTargets, expectedTimeReductionPercent: e.target.value })} placeholder="e.g. 20" /></div>
            <div className="space-y-1"><Label className="text-xs">Expected Revenue Impact</Label><Input value={kpiTargets.expectedRevenueImpact} onChange={(e) => setKpiTargets({ ...kpiTargets, expectedRevenueImpact: e.target.value })} placeholder="e.g. $200,000 ARR" /></div>
            <div className="space-y-1"><Label className="text-xs">Delivery Timeline (weeks)</Label><Input value={kpiTargets.expectedDeliveryTimelineWeeks} onChange={(e) => setKpiTargets({ ...kpiTargets, expectedDeliveryTimelineWeeks: e.target.value })} placeholder="e.g. 12" /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Primary Success Metric</Label><Input value={kpiTargets.primarySuccessMetric} onChange={(e) => setKpiTargets({ ...kpiTargets, primarySuccessMetric: e.target.value })} placeholder="e.g. Reduce incident response time by 30%" /></div>
        </CardContent>
      </Card>
      {confidenceLevel === "LOW" && (!overrideReason.trim() || !lowConfidenceAcknowledged) && (
        <ErrorBanner message="Cannot create: Low-confidence classification requires an override reason and explicit acknowledgment (set in Recommendation step)." />
      )}
      {error && <ErrorBanner message={error} />}
    </div>
  );
}

// ── Step 8: Create ───────────────────────────────────────────────────

function StepCreate({
  createdProjectId, isCreating, confidenceLevel, overrideReason, error,
}: {
  createdProjectId: number | null; isCreating: boolean;
  confidenceLevel: ConfidenceLevel | null; overrideReason: string; error: string;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">8. Create PS Project</h2>
      {createdProjectId ? (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center gap-2 text-green-600 font-semibold"><CheckCircle2 className="w-5 h-5" /> Project created successfully</div>
            <p className="text-sm text-muted-foreground">Project ID: {createdProjectId} | Status: DRAFT</p>
            {confidenceLevel && confidenceLevel !== "HIGH" && (
              <p className="text-xs text-muted-foreground">Created under {confidenceLevel} confidence gate{overrideReason && " with override reason recorded"}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            {isCreating ? <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Creating project...</p> : <p className="text-sm text-muted-foreground">Waiting for creation...</p>}
            {error && <ErrorBanner message={error} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Step 9: Validation ───────────────────────────────────────────────

function StepValidation({
  createdProject, onSubmit, isPending, error,
}: {
  createdProject: any; onSubmit: () => void; isPending: boolean; error: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">9. Validation</h2>
        <p className="text-sm text-muted-foreground mt-1">Submit project for validation review</p>
      </div>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Current Status</p>
            <Badge variant="outline" className="mt-1">{createdProject?.status ?? "DRAFT"}</Badge>
          </div>
          {createdProject?.validationNote && (
            <div><p className="text-xs text-muted-foreground">Validation Note</p><p className="text-sm">{createdProject.validationNote}</p></div>
          )}
          {createdProject?.status === "DRAFT" && (
            <Button onClick={onSubmit} disabled={isPending} size="sm">
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Submitting...</> : "Submit for Validation"}
            </Button>
          )}
          {error && <ErrorBanner message={error} />}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Step 10: PM Central ──────────────────────────────────────────────

function StepPMCentral({
  createdProject, onSendToPM, isPending, error,
}: {
  createdProject: any; onSendToPM: () => void; isPending: boolean; error: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">10. PM Central</h2>
        <p className="text-sm text-muted-foreground mt-1">Handoff to PM Central for execution</p>
      </div>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Project Status</p>
            <p className="font-semibold">{(createdProject?.status ?? "—").toUpperCase()}</p>
          </div>
          {createdProject?.pmProjectId && (
            <div><p className="text-xs text-muted-foreground">PM Project ID</p><p className="font-semibold text-indigo-500">#{createdProject.pmProjectId}</p></div>
          )}
          {createdProject?.status === "DRAFT" && <p className="text-sm text-muted-foreground">Project must be validated before PM handoff.</p>}
          {!createdProject?.pmProjectId && createdProject?.status !== "DRAFT" && (
            <Button onClick={onSendToPM} disabled={isPending} size="sm">
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Sending...</> : "Send to PM Central"}
            </Button>
          )}
          {error && <ErrorBanner message={error} />}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Step 11: Feedback ────────────────────────────────────────────────

function StepFeedback({
  feedbackOutcome, setFeedbackOutcome, feedbackNotes, setFeedbackNotes,
  onSubmit, onSkip, isPending, error,
}: {
  feedbackOutcome: string; setFeedbackOutcome: (v: string) => void;
  feedbackNotes: string; setFeedbackNotes: (v: string) => void;
  onSubmit: () => void; onSkip: () => void; isPending: boolean; error: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">11. Feedback</h2>
        <p className="text-sm text-muted-foreground mt-1">Record execution feedback for this project</p>
      </div>
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Outcome</p>
            <div className="flex gap-2 flex-wrap">
              {["success", "partial", "failed", "cancelled"].map((opt) => (
                <Button key={opt} size="sm" variant={feedbackOutcome === opt ? "default" : "outline"} onClick={() => setFeedbackOutcome(opt)} className="capitalize">
                  {opt}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={feedbackNotes} onChange={(e) => setFeedbackNotes(e.target.value)} placeholder="Any feedback about the project delivery..." rows={4} />
          </div>
          <div className="flex gap-3">
            <Button onClick={onSubmit} disabled={!feedbackOutcome || isPending} size="sm" className="bg-green-600 hover:bg-green-700">
              {isPending ? "Submitting..." : "Submit Feedback & Finish"}
            </Button>
            <Button variant="outline" size="sm" onClick={onSkip}>Skip & Go to List</Button>
          </div>
          {error && <ErrorBanner message={error} />}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Shared error banner ──────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <Card className="border-red-500/30 bg-red-500/5">
      <CardContent className="pt-4 flex items-center gap-2 text-sm text-red-600">
        <AlertTriangle className="w-4 h-4 shrink-0" /> {message}
      </CardContent>
    </Card>
  );
}
