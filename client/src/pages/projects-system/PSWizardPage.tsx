/**
 * PS Wizard — Matrix classification wizard
 *
 * Flow: Scenario → Context → Questions → Recommendation → Create
 *
 * All questions and scopes are DB-driven — zero hard-coded logic.
 * Uses acceptWizardResult atomic endpoint for persist.
 */
import { useState, useMemo, useCallback } from "react";
import { ModuleWizardShell, type WizardStep } from "@/components/wizard/ModuleWizardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  AlertTriangle,
  Target,
  Loader2,
  Brain,
  Users,
  UserCheck,
  ClipboardList,
  BarChart3,
  Database,
  Wand2,
  Sparkles,
} from "lucide-react";

import { PSQuestionRenderer } from "./PSQuestionRenderer";
import { PSExplainabilityPanel } from "./PSExplainabilityPanel";
import { PSConfidenceBadge, PSConfidenceInline } from "./PSConfidenceBadge";
import { PSOverrideDialog } from "./PSOverrideDialog";

// ── Context options ──────────────────────────────────────────────────

const BUSINESS_UNIT_OPTIONS = [
  { value: "engineering", label: "Engineering" },
  { value: "product", label: "Product" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "hr", label: "Human Resources" },
  { value: "marketing", label: "Marketing" },
  { value: "sales", label: "Sales" },
  { value: "it", label: "IT" },
  { value: "legal", label: "Legal" },
  { value: "other", label: "Other" },
] as const;

const REGION_OPTIONS = [
  { value: "global", label: "Global" },
  { value: "emea", label: "EMEA" },
  { value: "apac", label: "APAC" },
  { value: "americas", label: "Americas" },
  { value: "local", label: "Local / Single site" },
] as const;

const STRATEGIC_IMPORTANCE_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical / Must-win" },
] as const;

// ── Types ────────────────────────────────────────────────────────────

interface ContextData {
  businessUnit: string;
  region: string;
  strategicImportance: string;
  existingSituation: string;
}

interface ScopeScore {
  code: string;
  label: string;
  score: number;
  rank: number;
}

interface EnrichedResult {
  selectedScope: string;
  selectedScopeLabel: string;
  top3: ScopeScore[];
  ranking: ScopeScore[];
  scores: Record<string, number>;
  matchedQuestions: string[];
  totalQuestions: number;
  matrixVersion: string;
  explainability: {
    positiveSignals: Array<{ questionCode: string; questionLabel: string; weight: number; scopeCode: string }>;
    negativeSignals: Array<{ questionCode: string; questionLabel: string; weight: number; scopeCode: string }>;
    winnerMargin: number;
    winnerCode: string;
    runnerUpCode: string;
  };
  confidence: {
    overall: number;
    spread: number;
    completeness: number;
    ambiguity: number;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function autoProjectName(scenario: string): string {
  if (!scenario.trim()) return "";
  const firstSentence = scenario.split(/[.!?\n]/)[0]?.trim() || "";
  if (firstSentence.length <= 60) return firstSentence;
  const words = scenario.trim().split(/\s+/).slice(0, 8);
  return words.join(" ") + (scenario.trim().split(/\s+/).length > 8 ? "..." : "");
}

function ScoreBar({ label, score, maxScore, isTop }: { label: string; score: number; maxScore: number; isTop: boolean }) {
  const pctVal = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className={isTop ? "font-semibold" : "text-muted-foreground"}>{label}</span>
        <span className={isTop ? "font-semibold" : "text-muted-foreground"}>{score}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${isTop ? "bg-indigo-500" : "bg-muted-foreground/30"}`} style={{ width: `${pctVal}%` }} />
      </div>
    </div>
  );
}

function ContextSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={`Select ${label.toLowerCase()}...`} /></SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Steps definition ─────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  { id: "scenario", label: "Scenario", description: "Describe the project scenario" },
  { id: "context", label: "Context", description: "Business context and project details" },
  { id: "questions", label: "Questions", description: "Answer classification questions" },
  { id: "recommendation", label: "Recommendation", description: "Review scoring and explainability" },
  { id: "create", label: "Create", description: "Confirm and create the system" },
];

// ── Component ────────────────────────────────────────────────────────

export function PSWizardPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [scenarioText, setScenarioText] = useState("");
  const [systemName, setSystemName] = useState("");
  const [autoNameGenerated, setAutoNameGenerated] = useState(false);

  // Context state
  const [context, setContext] = useState<ContextData>({
    businessUnit: "", region: "", strategicImportance: "", existingSituation: "",
  });

  // Matrix state
  const [matrixAnswers, setMatrixAnswers] = useState<Record<string, boolean | string | number>>({});
  const [enrichedResult, setEnrichedResult] = useState<EnrichedResult | null>(null);
  const [overrideInfo, setOverrideInfo] = useState<{ scopeCode: string; reason: string } | null>(null);

  // Shared state
  const [isClassifying, setIsClassifying] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [generatedDemand, setGeneratedDemand] = useState<Array<{ role: string; quantity: number }>>([]);
  const [acceptResult, setAcceptResult] = useState<{
    wizardRun: { id: number; scenarioText: string; selectedSystemType: string | null };
    system: { id: number; name: string; systemType: string; status: string };
    demandGenerated: Array<{ id: number; role: string; quantity: number | null }>;
    assignmentPlaceholders: Array<{ id: number; assignmentRole: string; status: string }>;
    trace: { wizardRunId: number; systemId: number; demandCount: number; assignmentCount: number; scopeCode: string; templateUsed: string; overrideApplied: boolean };
  } | null>(null);

  const utils = trpc.useUtils();

  // ── Matrix data ───────────────────────────────────────────────────
  const activeQuestionsQuery = trpc.ps.matrix.getActiveQuestions.useQuery(
    undefined,
    { staleTime: 60_000 },
  );

  const matrixQuestions = activeQuestionsQuery.data?.questions || [];
  const matrixDimensions = (activeQuestionsQuery.data as any)?.dimensions || [];
  const matrixScopes = activeQuestionsQuery.data?.scopes || [];
  const matrixVersionLabel = activeQuestionsQuery.data?.version || null;

  // ── Scope label map ───────────────────────────────────────────────
  const scopeLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of matrixScopes) map[s.code] = s.label;
    if (enrichedResult) {
      for (const r of enrichedResult.ranking) map[r.code] = r.label;
    }
    return map;
  }, [matrixScopes, enrichedResult]);

  // ── Queries / Mutations ───────────────────────────────────────────
  const matrixEvalQuery = trpc.ps.matrix.evaluateEnriched.useQuery(
    { answers: matrixAnswers },
    { enabled: false, retry: false },
  );

  const acceptMut = trpc.ps.wizardRuns.accept.useMutation({ onError: (e) => toast.error(e.message) });

  // ── Derived state ─────────────────────────────────────────────────
  const answeredCount = Object.entries(matrixAnswers).filter(
    ([, v]) => v === true || (typeof v === "number" && v > 0),
  ).length;

  const effectiveScope = overrideInfo?.scopeCode || enrichedResult?.selectedScope || "";
  const effectiveScopeLabel = scopeLabels[effectiveScope] || effectiveScope;
  const hasResult = enrichedResult !== null;

  // ── Step validity ─────────────────────────────────────────────────
  const stepsWithValidity = STEPS.map((s, i) => {
    let isValid = false;
    if (i === 0) isValid = scenarioText.trim().length > 0;
    else if (i === 1) isValid = systemName.trim().length > 0;
    else if (i === 2) isValid = true; // can proceed even with no answers
    else if (i === 3) isValid = hasResult;
    else if (i === 4) isValid = isPublished;
    return { ...s, isValid };
  });

  // ── Auto-name on leaving scenario step ────────────────────────────
  const handleAutoName = useCallback(() => {
    if (!autoNameGenerated && !systemName.trim() && scenarioText.trim()) {
      const generated = autoProjectName(scenarioText);
      if (generated) {
        setSystemName(generated);
        setAutoNameGenerated(true);
      }
    }
  }, [scenarioText, systemName, autoNameGenerated]);

  // ── Classification logic ──────────────────────────────────────────
  const runClassification = async () => {
    setIsClassifying(true);
    try {
      const result = await matrixEvalQuery.refetch();
      if (result.data) {
        setEnrichedResult(result.data as any);
        setOverrideInfo(null);
      }
    } catch (err: any) {
      toast.error("Classification failed: " + (err?.message || "Unknown error"));
    } finally {
      setIsClassifying(false);
    }
  };

  const handleReclassify = async () => {
    setEnrichedResult(null);
    await runClassification();
  };

  // ── Step change ───────────────────────────────────────────────────
  const handleStepChange = async (step: number) => {
    if (currentStep === 0 && step > 0) {
      handleAutoName();
    }
    // Auto-classify when entering recommendation step (step 3)
    if (step === 3 && !hasResult) {
      await runClassification();
    }
    setCurrentStep(step);
  };

  // ── Override handler ──────────────────────────────────────────────
  const handleOverride = (scopeCode: string, reason: string) => {
    setOverrideInfo({ scopeCode, reason });
    toast.success(`Overridden to ${scopeLabels[scopeCode] || scopeCode}`);
  };

  // ── Publish (Create) ──────────────────────────────────────────────
  const handlePublish = async () => {
    if (!hasResult || !enrichedResult) return;
    try {
      const result = await acceptMut.mutateAsync({
        scenarioText: scenarioText.trim(),
        projectName: systemName.trim(),
        selectedScopeCode: effectiveScope,
        selectedScopeLabel: effectiveScopeLabel,
        matrixVersion: enrichedResult.matrixVersion,
        answers: matrixAnswers,
        confidence: Math.round(enrichedResult.confidence.overall * 100),
        overrideInfo: overrideInfo
          ? { scopeCode: enrichedResult.selectedScope, reason: overrideInfo.reason }
          : null,
        resultPayload: enrichedResult as any,
      });
      setAcceptResult(result);
      setGeneratedDemand(
        result.demandGenerated.map((d: any) => ({ role: d.role, quantity: d.quantity ?? 1 })),
      );
      utils.ps.systems.list.invalidate();
      setIsPublished(true);
      toast.success(
        `System "${result.system.name}" created — ${result.demandGenerated.length} demand, ${result.assignmentPlaceholders.length} assignments`,
      );
    } catch {
      // Error shown by mutation onError
    }
  };

  const isSaving = acceptMut.isPending;

  // ── Score helpers ─────────────────────────────────────────────────
  const maxScore = enrichedResult ? Math.max(...Object.values(enrichedResult.scores), 1) : 1;

  // ── Step content ──────────────────────────────────────────────────
  const renderStep = () => {
    switch (currentStep) {
      // ── Step 0: Scenario ──────────────────────────────────────────
      case 0:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-indigo-600 border-indigo-500/30">
                <Database className="w-3 h-3 mr-1" /> Matrix v{matrixVersionLabel}
              </Badge>
              {activeQuestionsQuery.isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>

            <div>
              <Label>Scenario Description</Label>
              <Textarea
                value={scenarioText}
                onChange={(e) => { setScenarioText(e.target.value); setAutoNameGenerated(false); }}
                placeholder="Describe the project scenario, objectives, and context..."
                className="mt-1 min-h-[160px] resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">{scenarioText.length}/5000 characters</p>
            </div>
          </div>
        );

      // ── Step 1: Context ───────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Wand2 className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-medium">Project Context</h3>
            </div>

            {/* Project name — auto-generated, editable */}
            <div>
              <Label>Project Name</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={systemName}
                  onChange={(e) => setSystemName(e.target.value)}
                  placeholder="E.g.: Platform Migration System"
                  maxLength={255}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const generated = autoProjectName(scenarioText);
                    if (generated) { setSystemName(generated); toast.success("Name generated from scenario"); }
                  }}
                  disabled={!scenarioText.trim()}
                  title="Auto-generate from scenario"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Auto-generated from your scenario. Edit as needed.</p>
            </div>

            {/* Context selectors */}
            <div className="grid md:grid-cols-2 gap-4">
              <ContextSelect
                label="Business Unit"
                value={context.businessUnit}
                onChange={(v) => setContext((c) => ({ ...c, businessUnit: v }))}
                options={BUSINESS_UNIT_OPTIONS}
              />
              <ContextSelect
                label="Region"
                value={context.region}
                onChange={(v) => setContext((c) => ({ ...c, region: v }))}
                options={REGION_OPTIONS}
              />
              <ContextSelect
                label="Strategic Importance"
                value={context.strategicImportance}
                onChange={(v) => setContext((c) => ({ ...c, strategicImportance: v }))}
                options={STRATEGIC_IMPORTANCE_OPTIONS}
              />
            </div>

            {/* Existing situation */}
            <div>
              <Label>Existing Situation</Label>
              <Textarea
                value={context.existingSituation}
                onChange={(e) => setContext((c) => ({ ...c, existingSituation: e.target.value }))}
                placeholder="Describe what exists today — current systems, processes, pain points..."
                className="mt-1 min-h-[100px] resize-none"
              />
            </div>

            {/* Dimension info from DB */}
            {matrixDimensions.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Available Dimensions ({matrixDimensions.length})</Label>
                <div className="mt-1 space-y-1">
                  {matrixDimensions.map((dim: any) => (
                    <div key={dim.id} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">{dim.dimensionKey}</span>
                      <span>{dim.dimensionLabel}</span>
                      {dim.values.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">{dim.values.length} values</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      // ── Step 2: Questions ─────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-indigo-600 border-indigo-500/30">
                <Database className="w-3 h-3 mr-1" /> Matrix v{matrixVersionLabel}
              </Badge>
              <Badge variant="secondary" className="text-xs">{answeredCount}/{matrixQuestions.length} answered</Badge>
            </div>

            <PSQuestionRenderer
              questions={matrixQuestions}
              dimensions={matrixDimensions}
              answers={matrixAnswers}
              onAnswerChange={(code, value) => {
                setMatrixAnswers((prev) => ({ ...prev, [code]: value }));
                setEnrichedResult(null);
                setOverrideInfo(null);
              }}
            />
          </div>
        );

      // ── Step 3: Recommendation ────────────────────────────────────
      case 3:
        return (
          <div className="space-y-4">
            {isClassifying ? (
              <Card>
                <CardContent className="pt-6 flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-sm text-muted-foreground">Evaluating matrix...</p>
                </CardContent>
              </Card>
            ) : enrichedResult ? (
              <>
                {/* Selected Scope */}
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-semibold">Selected Scope</h3>
                      </div>
                      <PSOverrideDialog
                        ranking={enrichedResult.ranking}
                        currentScope={effectiveScope}
                        onOverride={handleOverride}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="text-sm px-3 py-1 bg-indigo-500/10 text-indigo-600 border-indigo-500/30">
                        {effectiveScopeLabel}
                      </Badge>
                      {overrideInfo && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/30">
                          Overridden
                        </Badge>
                      )}
                    </div>
                    {overrideInfo && (
                      <p className="text-xs text-muted-foreground">
                        Original: {enrichedResult.selectedScopeLabel} — Override reason: {overrideInfo.reason}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Confidence Badge */}
                <PSConfidenceBadge report={enrichedResult.confidence} />

                {/* Score Ranking */}
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-indigo-500" />
                      <h4 className="text-sm font-medium">Score Ranking</h4>
                    </div>
                    <div className="space-y-2">
                      {enrichedResult.ranking.map((r) => (
                        <ScoreBar
                          key={r.code}
                          label={r.label}
                          score={r.score}
                          maxScore={maxScore}
                          isTop={r.code === effectiveScope}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Explainability */}
                <PSExplainabilityPanel
                  report={enrichedResult.explainability}
                  scopeLabels={scopeLabels}
                />

                {/* Matrix info */}
                <div className="text-xs text-muted-foreground">
                  Matrix version: {enrichedResult.matrixVersion} | {enrichedResult.matchedQuestions.length}/{enrichedResult.totalQuestions} questions matched
                </div>

                <Button variant="outline" size="sm" onClick={handleReclassify}>
                  Re-classify
                </Button>
              </>
            ) : (
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="w-5 h-5" />
                    <p className="text-sm font-medium">No classification yet</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Click below to evaluate your answers against the matrix.
                  </p>
                  <Button size="sm" onClick={handleReclassify}>
                    <Brain className="w-4 h-4 mr-1" /> Evaluate Matrix
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        );

      // ── Step 4: Create ────────────────────────────────────────────
      case 4:
        return renderCreateStep();

      default:
        return null;
    }
  };

  // ── Create step ───────────────────────────────────────────────────
  const renderCreateStep = () => (
    <div className="space-y-3">
      {isPublished ? (
        <>
          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="font-semibold">System Created</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {acceptResult ? (
                  <>PS system "<span className="font-medium text-foreground">{acceptResult.system.name}</span>" provisioned via scope template. {acceptResult.trace.demandCount} demand requests and {acceptResult.trace.assignmentCount} assignment placeholders created.</>
                ) : (
                  <>PS system "<span className="font-medium text-foreground">{systemName}</span>" created.</>
                )}
              </p>
              {acceptResult && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="outline" className="text-xs">Scope: {acceptResult.trace.scopeCode}</Badge>
                  <Badge variant="outline" className="text-xs">Template: {acceptResult.trace.templateUsed}</Badge>
                  {acceptResult.trace.overrideApplied && <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/30">Override applied</Badge>}
                </div>
              )}
            </CardContent>
          </Card>
          {generatedDemand.length > 0 && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-500" />
                  <h3 className="font-semibold">Demand Generated</h3>
                  <Badge variant="secondary">{generatedDemand.length} roles</Badge>
                </div>
                <div className="space-y-1.5">
                  {generatedDemand.map((d, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{d.role}</span>
                      <Badge variant="outline" className="text-xs">{d.quantity}x</Badge>
                    </div>
                  ))}
                </div>
                <div className="pt-1 border-t">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total headcount</span>
                    <span>{generatedDemand.reduce((s, d) => s + d.quantity, 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {acceptResult && (
            <>
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-semibold">Assignments</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Demand requests</span>
                      <Badge variant="secondary" className="text-xs"><ClipboardList className="w-3 h-3 mr-1" />{acceptResult.trace.demandCount} created</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Assignment placeholders</span>
                      <Badge variant="secondary" className="text-xs"><UserCheck className="w-3 h-3 mr-1" />{acceptResult.trace.assignmentCount} created</Badge>
                    </div>
                    {acceptResult.assignmentPlaceholders.length > 0 && (
                      <div className="space-y-1 pt-1 border-t">
                        {acceptResult.assignmentPlaceholders.map((a, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{a.assignmentRole}</span>
                            <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground pt-1">Navigate to PS Systems to assign people.</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 space-y-2 text-xs text-muted-foreground">
                  <h4 className="font-medium text-foreground text-sm">Trace</h4>
                  <div className="flex justify-between"><span>Wizard Run</span><span className="font-mono">#{acceptResult.trace.wizardRunId}</span></div>
                  <div className="flex justify-between"><span>System ID</span><span className="font-mono">#{acceptResult.trace.systemId}</span></div>
                  <div className="flex justify-between"><span>Scope</span><span className="font-mono">{acceptResult.trace.scopeCode}</span></div>
                  <div className="flex justify-between"><span>Template</span><span className="font-mono">{acceptResult.trace.templateUsed}</span></div>
                  <div className="flex justify-between"><span>Override</span><span>{acceptResult.trace.overrideApplied ? "Yes" : "No"}</span></div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      ) : (
        <>
          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <h4 className="font-medium mb-2">Summary</h4>
              <div className="flex justify-between"><span className="text-muted-foreground">Project Name</span><span className="font-medium">{systemName || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Scenario</span><span className="font-medium max-w-[60%] text-right truncate">{scenarioText.slice(0, 80)}{scenarioText.length > 80 ? "..." : ""}</span></div>
              {context.businessUnit && <div className="flex justify-between"><span className="text-muted-foreground">Business Unit</span><Badge variant="outline" className="text-xs">{BUSINESS_UNIT_OPTIONS.find((o) => o.value === context.businessUnit)?.label || context.businessUnit}</Badge></div>}
              {context.region && <div className="flex justify-between"><span className="text-muted-foreground">Region</span><Badge variant="outline" className="text-xs">{REGION_OPTIONS.find((o) => o.value === context.region)?.label || context.region}</Badge></div>}
              {context.strategicImportance && <div className="flex justify-between"><span className="text-muted-foreground">Strategic Importance</span><Badge variant="outline" className="text-xs">{STRATEGIC_IMPORTANCE_OPTIONS.find((o) => o.value === context.strategicImportance)?.label || context.strategicImportance}</Badge></div>}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Selected Scope</span>
                <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30">{effectiveScopeLabel || "—"}</Badge>
              </div>
              {overrideInfo && (
                <div className="flex justify-between"><span className="text-muted-foreground">Override</span><Badge variant="outline" className="text-xs text-amber-600">Yes — {overrideInfo.reason.slice(0, 40)}</Badge></div>
              )}
              {enrichedResult && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span><PSConfidenceInline overall={enrichedResult.confidence.overall} /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Matrix Version</span><span className="font-medium">{enrichedResult.matrixVersion}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Questions Matched</span><span className="font-medium">{enrichedResult.matchedQuestions.length}/{enrichedResult.totalQuestions}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Winner Margin</span><span className="font-medium">+{enrichedResult.explainability.winnerMargin}</span></div>
                </>
              )}
            </CardContent>
          </Card>

          {enrichedResult && (
            <Card>
              <CardContent className="pt-4 space-y-2 text-sm">
                <h4 className="font-medium mb-2">Answered Questions</h4>
                {enrichedResult.matchedQuestions.map((qCode) => {
                  const q = matrixQuestions.find((mq) => mq.code === qCode);
                  return (
                    <div key={qCode} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                      <span className="text-muted-foreground">{q?.label || qCode}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );

  // ── Preview Panel ─────────────────────────────────────────────────
  const previewPanel = (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Project</p>
        <p className="text-sm font-medium">{systemName || "Not named yet"}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Scenario</p>
        <p className="text-sm">{scenarioText ? scenarioText.slice(0, 120) + (scenarioText.length > 120 ? "..." : "") : "Not entered yet"}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Matrix</p>
        <Badge variant="outline" className="text-xs">v{matrixVersionLabel}</Badge>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Questions ({answeredCount}/{matrixQuestions.length})</p>
      </div>
      {hasResult && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Selected Scope</p>
          <Badge className="text-xs bg-indigo-500/10 text-indigo-600">{effectiveScopeLabel}</Badge>
          {enrichedResult && (
            <div className="mt-2"><PSConfidenceInline overall={enrichedResult.confidence.overall} /></div>
          )}
          {overrideInfo && (
            <div className="mt-1"><Badge variant="outline" className="text-[10px] text-amber-600">Overridden</Badge></div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-[calc(100vh-8rem)]">
      <ModuleWizardShell
        title="Projects System Wizard"
        accentColor="text-indigo-500"
        steps={stepsWithValidity}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        previewPanel={previewPanel}
        summaryBar={
          <span>
            Step {currentStep + 1} of {STEPS.length} — {STEPS[currentStep]?.label}
            {hasResult && enrichedResult && (
              <> | {effectiveScopeLabel} ({Math.round(enrichedResult.confidence.overall * 100)}%)</>
            )}
          </span>
        }
        isFinalStep={currentStep === STEPS.length - 1}
        canPublish={hasResult && !isPublished}
        onPublish={handlePublish}
        isSaving={isSaving}
      >
        {renderStep()}
      </ModuleWizardShell>
    </div>
  );
}

export default PSWizardPage;
