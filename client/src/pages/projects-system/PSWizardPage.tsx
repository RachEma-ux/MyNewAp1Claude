/**
 * PS Wizard — Matrix-first classification wizard
 *
 * Runtime flow (matrix mode):
 *   Step 0 — Scenario: describe the project
 *   Step 1 — Context: auto-generate name, review context tags / dimensions
 *   Step 2 — Questions: DB-driven question rendering + answer collection
 *   Step 3 — Recommendation: matrix scoring, confidence, explainability, override
 *   Step 4 — Review & Accept: calls acceptWizardResult → atomic persist
 *            (template resolution → wizard run → system → demand → assignments → override → audit)
 *
 * Legacy fallback (no active matrix): scenario + dimensions → rule-based classify → manual persist.
 * All questions and scopes are DB-driven — zero hard-coded logic.
 */
import { useState, useMemo, useCallback } from "react";
import { ModuleWizardShell, type WizardStep } from "@/components/wizard/ModuleWizardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  FileText,
  HelpCircle,
  Sparkles,
} from "lucide-react";

// ── New components ─────────────────────────────────────────────────────
import { PSQuestionRenderer } from "./PSQuestionRenderer";
import { PSExplainabilityPanel } from "./PSExplainabilityPanel";
import { PSConfidenceBadge, PSConfidenceInline } from "./PSConfidenceBadge";
import { PSOverrideDialog } from "./PSOverrideDialog";

// ── Legacy dimension options ──────────────────────────────────────────

const DOMAIN_OPTIONS = [
  { value: "software", label: "Software" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "business_process", label: "Business Process" },
  { value: "organizational_change", label: "Organizational Change" },
  { value: "construction", label: "Construction" },
  { value: "research", label: "Research" },
] as const;

const ORG_LEVEL_OPTIONS = [
  { value: "team", label: "Team" },
  { value: "department", label: "Department" },
  { value: "program", label: "Program" },
  { value: "portfolio", label: "Portfolio" },
  { value: "enterprise", label: "Enterprise" },
] as const;

const CRITICALITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

const DELIVERY_STYLE_OPTIONS = [
  { value: "waterfall", label: "Waterfall" },
  { value: "agile", label: "Agile" },
  { value: "hybrid", label: "Hybrid" },
  { value: "continuous", label: "Continuous" },
  { value: "phased", label: "Phased" },
] as const;

const VALUE_ORIENTATION_OPTIONS = [
  { value: "cost_reduction", label: "Cost Reduction" },
  { value: "revenue_growth", label: "Revenue Growth" },
  { value: "compliance", label: "Compliance" },
  { value: "innovation", label: "Innovation" },
  { value: "efficiency", label: "Efficiency" },
  { value: "customer_experience", label: "Customer Experience" },
] as const;

const LIFECYCLE_FOCUS_OPTIONS = [
  { value: "initiation", label: "Initiation" },
  { value: "planning", label: "Planning" },
  { value: "execution", label: "Execution" },
  { value: "monitoring", label: "Monitoring" },
  { value: "closure", label: "Closure" },
  { value: "product", label: "Product" },
  { value: "operations", label: "Operations" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────

type DomainValue = (typeof DOMAIN_OPTIONS)[number]["value"];
type OrgLevelValue = (typeof ORG_LEVEL_OPTIONS)[number]["value"];
type CriticalityValue = (typeof CRITICALITY_OPTIONS)[number]["value"];
type DeliveryStyleValue = (typeof DELIVERY_STYLE_OPTIONS)[number]["value"];
type ValueOrientationValue = (typeof VALUE_ORIENTATION_OPTIONS)[number]["value"];
type LifecycleFocusValue = (typeof LIFECYCLE_FOCUS_OPTIONS)[number]["value"];

interface Dimensions {
  domain: DomainValue | "";
  orgLevel: OrgLevelValue | "";
  criticality: CriticalityValue | "";
  deliveryStyle: DeliveryStyleValue | "";
  valueOrientation: ValueOrientationValue | "";
  lifecycleFocus: LifecycleFocusValue | "";
}

interface LegacyClassificationResult {
  systemType: string;
  confidence: number;
  matchedDimensions: string[];
  reasoning: string[];
}

// ── Enriched result (from evaluateEnriched) ───────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────

/** Auto-generate a project name from scenario text (NLP-light: first sentence or first N words) */
function autoProjectName(scenario: string): string {
  if (!scenario.trim()) return "";
  // Try first sentence
  const firstSentence = scenario.split(/[.!?\n]/)[0]?.trim() || "";
  if (firstSentence.length <= 60) return firstSentence;
  // Fallback: first 8 words
  const words = scenario.trim().split(/\s+/).slice(0, 8);
  return words.join(" ") + (scenario.trim().split(/\s+/).length > 8 ? "..." : "");
}

/** Extract key phrases from scenario for context hints */
function extractContextHints(scenario: string): string[] {
  const hints: string[] = [];
  const lower = scenario.toLowerCase();
  if (/\bagile\b/.test(lower)) hints.push("Agile");
  if (/\bwaterfall\b/.test(lower)) hints.push("Waterfall");
  if (/\bmigrat/.test(lower)) hints.push("Migration");
  if (/\bcloud\b/.test(lower)) hints.push("Cloud");
  if (/\bsoftware\b/.test(lower)) hints.push("Software");
  if (/\bcompliance\b/.test(lower)) hints.push("Compliance");
  if (/\binfrastructure\b/.test(lower)) hints.push("Infrastructure");
  if (/\bdevops\b/.test(lower)) hints.push("DevOps");
  if (/\bgovernance\b/.test(lower)) hints.push("Governance");
  if (/\bcost\b/.test(lower)) hints.push("Cost-focused");
  if (/\bprogram\b/.test(lower)) hints.push("Program");
  if (/\bportfolio\b/.test(lower)) hints.push("Portfolio");
  return hints.slice(0, 5);
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pctVal = Math.round(confidence * 100);
  const color = pctVal >= 80 ? "bg-green-500" : pctVal >= 65 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Confidence</span>
        <span className="font-medium">{pctVal}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pctVal}%` }} />
      </div>
    </div>
  );
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

function DimensionSelector({
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

// ── Component ─────────────────────────────────────────────────────────

export function PSWizardPage({ workspaceId }: { workspaceId: number }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [scenarioText, setScenarioText] = useState("");
  const [systemName, setSystemName] = useState("");
  const [autoNameGenerated, setAutoNameGenerated] = useState(false);
  const [contextTags, setContextTags] = useState<string[]>([]);

  // Legacy mode state
  const [dimensions, setDimensions] = useState<Dimensions>({
    domain: "", orgLevel: "", criticality: "", deliveryStyle: "", valueOrientation: "", lifecycleFocus: "",
  });
  const [legacyClassification, setLegacyClassification] = useState<LegacyClassificationResult | null>(null);

  // Matrix mode state
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

  // ── Check if matrix mode is available ─────────────────────────────
  const activeQuestionsQuery = trpc.ps.matrix.getActiveQuestions.useQuery(
    { workspaceId },
    { staleTime: 60_000 },
  );

  const isMatrixMode = activeQuestionsQuery.data?.available === true;
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

  // ── Steps ─────────────────────────────────────────────────────────
  const STEPS: WizardStep[] = useMemo(() => {
    if (isMatrixMode) {
      return [
        { id: "scenario", label: "Scenario", description: "Describe the project scenario" },
        { id: "context", label: "Context", description: "Review context and project name" },
        { id: "questions", label: "Questions", description: "Answer classification questions" },
        { id: "recommendation", label: "Recommendation", description: "Review scoring and explainability" },
        { id: "review", label: "Review", description: "Confirm and persist" },
      ];
    }
    return [
      { id: "scenario", label: "Scenario", description: "Describe the project scenario" },
      { id: "dimensions", label: "Dimensions", description: "Select classification dimensions" },
      { id: "recommendation", label: "Recommendation", description: "Review the recommendation" },
      { id: "review", label: "Review", description: "Confirm and persist" },
    ];
  }, [isMatrixMode]);

  // ── Queries ───────────────────────────────────────────────────────
  const classifyQuery = trpc.ps.classifyScenario.useQuery(
    { workspaceId, scenarioText, dimensions: dimensions as any },
    { enabled: false, retry: false },
  );

  const matrixEvalQuery = trpc.ps.matrix.evaluateEnriched.useQuery(
    { workspaceId, answers: matrixAnswers },
    { enabled: false, retry: false },
  );

  // ── Mutations ─────────────────────────────────────────────────────
  // Matrix mode: single atomic operation (template resolution → wizard run → system → demand → assignments → override)
  const acceptMut = trpc.ps.wizardRuns.accept.useMutation({ onError: (e) => toast.error(e.message) });
  // Legacy mode: 3-step manual flow (kept for backward compat when no active matrix)
  const createSystemMut = trpc.ps.systems.create.useMutation({ onError: (e) => toast.error(e.message) });
  const generateDemandMut = trpc.ps.demand.generateForSystem.useMutation({ onError: (e) => toast.error(e.message) });
  const createRunMut = trpc.ps.wizardRuns.create.useMutation({ onError: (e) => toast.error(e.message) });

  // ── Derived state ─────────────────────────────────────────────────
  const allDimensionsFilled = Object.values(dimensions).every((v) => v !== "");
  const filledCount = Object.values(dimensions).filter((v) => v !== "").length;
  const answeredCount = Object.entries(matrixAnswers).filter(
    ([, v]) => v === true || (typeof v === "number" && v > 0),
  ).length;

  const effectiveScope = overrideInfo?.scopeCode || enrichedResult?.selectedScope || "";
  const effectiveScopeLabel = scopeLabels[effectiveScope] || effectiveScope;
  const effectiveSystemType = isMatrixMode ? effectiveScope : (legacyClassification?.systemType || "");
  const hasResult = isMatrixMode ? enrichedResult !== null : legacyClassification !== null;

  // ── Step validity ─────────────────────────────────────────────────
  const stepsWithValidity = STEPS.map((s, i) => {
    let isValid = false;
    if (isMatrixMode) {
      if (i === 0) isValid = scenarioText.trim().length > 0;
      else if (i === 1) isValid = systemName.trim().length > 0;
      else if (i === 2) isValid = true; // can proceed even with no answers
      else if (i === 3) isValid = hasResult;
      else if (i === 4) isValid = isPublished;
    } else {
      if (i === 0) isValid = scenarioText.trim().length > 0 && systemName.trim().length > 0;
      else if (i === 1) isValid = allDimensionsFilled;
      else if (i === 2) isValid = hasResult;
      else if (i === 3) isValid = isPublished;
    }
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
    // Extract context hints
    if (scenarioText.trim()) {
      setContextTags(extractContextHints(scenarioText));
    }
  }, [scenarioText, systemName, autoNameGenerated]);

  // ── Classification logic ──────────────────────────────────────────
  const runClassification = async () => {
    setIsClassifying(true);
    try {
      if (isMatrixMode) {
        const result = await matrixEvalQuery.refetch();
        if (result.data) {
          setEnrichedResult(result.data as any);
          setOverrideInfo(null); // reset override on re-classify
        }
      } else {
        if (!allDimensionsFilled) {
          toast.error("Please fill all dimensions first");
          setIsClassifying(false);
          return;
        }
        const result = await classifyQuery.refetch();
        if (result.data) setLegacyClassification(result.data);
      }
    } catch (err: any) {
      toast.error("Classification failed: " + (err?.message || "Unknown error"));
    } finally {
      setIsClassifying(false);
    }
  };

  const handleReclassify = async () => {
    if (isMatrixMode) setEnrichedResult(null);
    else setLegacyClassification(null);
    await runClassification();
  };

  // ── Step change ───────────────────────────────────────────────────
  const handleStepChange = async (step: number) => {
    // Auto-name on leaving scenario step (step 0)
    if (currentStep === 0 && step > 0) {
      handleAutoName();
    }
    // Auto-classify when entering recommendation step
    const recStepIdx = isMatrixMode ? 3 : 2;
    if (step === recStepIdx && !hasResult) {
      await runClassification();
    }
    setCurrentStep(step);
  };

  // ── Override handler ──────────────────────────────────────────────
  const handleOverride = (scopeCode: string, reason: string) => {
    setOverrideInfo({ scopeCode, reason });
    toast.success(`Overridden to ${scopeLabels[scopeCode] || scopeCode}`);
  };

  // ── Publish ───────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!hasResult) return;
    try {
      if (isMatrixMode && enrichedResult) {
        // Canonical atomic flow: template resolution → wizard run → system → demand → assignments → override → audit
        const result = await acceptMut.mutateAsync({
          workspaceId,
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
          `System "${result.system.name}" provisioned — ${result.demandGenerated.length} demand, ${result.assignmentPlaceholders.length} assignments`,
        );
      } else {
        // Legacy fallback (no active matrix): 3-step manual flow
        const systemType = effectiveSystemType;
        const system = await createSystemMut.mutateAsync({
          workspaceId,
          name: systemName.trim(),
          description: scenarioText.trim(),
          systemType,
          lifecycleType: dimensions.lifecycleFocus || undefined,
          governanceProfile: dimensions.criticality || undefined,
        });

        const demand = await generateDemandMut.mutateAsync({ workspaceId, psSystemId: system.id });
        if (Array.isArray(demand) && demand.length > 0) {
          setGeneratedDemand(demand.map((d: any) => ({ role: d.role, quantity: d.quantity ?? 1 })));
        }

        await createRunMut.mutateAsync({
          workspaceId,
          scenarioText: scenarioText.trim(),
          inputPayload: { dimensions, mode: "legacy" },
          resultPayload: legacyClassification as any,
          confidence: Math.round((legacyClassification?.confidence || 0) * 100),
          selectedSystemType: systemType,
        });

        utils.ps.systems.list.invalidate();
        utils.ps.demand.list.invalidate();
        setIsPublished(true);
        toast.success(`System created with ${(demand as any[]).length} resource requests`);
      }
    } catch {
      // Error shown by mutation onError
    }
  };

  const isSaving = acceptMut.isPending || createSystemMut.isPending || generateDemandMut.isPending || createRunMut.isPending;

  // ── Legacy dimension label helper ─────────────────────────────────
  const dimLabel = (key: keyof Dimensions) => {
    const allOpts: Record<string, readonly { value: string; label: string }[]> = {
      domain: DOMAIN_OPTIONS, orgLevel: ORG_LEVEL_OPTIONS, criticality: CRITICALITY_OPTIONS,
      deliveryStyle: DELIVERY_STYLE_OPTIONS, valueOrientation: VALUE_ORIENTATION_OPTIONS, lifecycleFocus: LIFECYCLE_FOCUS_OPTIONS,
    };
    return allOpts[key]?.find((o) => o.value === dimensions[key])?.label || dimensions[key] || "—";
  };

  // ── Score helpers ─────────────────────────────────────────────────
  const maxScore = enrichedResult ? Math.max(...Object.values(enrichedResult.scores), 1) : 1;

  // ── Step content ──────────────────────────────────────────────────
  const renderStep = () => {
    // Matrix mode steps: 0=scenario, 1=context, 2=questions, 3=recommendation, 4=review
    // Legacy mode steps: 0=scenario, 1=dimensions, 2=recommendation, 3=review

    if (isMatrixMode) {
      switch (currentStep) {
        // ── Step 0: Scenario Input ──────────────────────────────────
        case 0:
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-indigo-600 border-indigo-500/30">
                  <Database className="w-3 h-3 mr-1" /> Matrix Mode (v{matrixVersionLabel})
                </Badge>
                {activeQuestionsQuery.isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>

              <div>
                <Label>Scenario Description</Label>
                <textarea
                  value={scenarioText}
                  onChange={(e) => { setScenarioText(e.target.value); setAutoNameGenerated(false); }}
                  placeholder="Describe the project scenario, objectives, and context..."
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[160px] resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">{scenarioText.length}/5000 characters</p>
              </div>
            </div>
          );

        // ── Step 1: Context + Auto Name ─────────────────────────────
        case 1:
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Wand2 className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-medium">Context & Project Name</h3>
              </div>

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

              {/* Context hints extracted via NLP-light */}
              {contextTags.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Detected Context</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {contextTags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Scenario preview */}
              <div>
                <Label className="text-xs text-muted-foreground">Scenario Preview</Label>
                <Card className="mt-1">
                  <CardContent className="pt-3 pb-3">
                    <p className="text-sm text-muted-foreground">{scenarioText || "No scenario entered."}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Dimension normalisation: show available dimensions from DB */}
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

        // ── Step 2: Question Rendering + Answer Collection ──────────
        case 2:
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-indigo-600 border-indigo-500/30">
                  <Database className="w-3 h-3 mr-1" /> Matrix v{matrixVersionLabel}
                </Badge>
              </div>

              <PSQuestionRenderer
                questions={matrixQuestions}
                dimensions={matrixDimensions}
                answers={matrixAnswers}
                onAnswerChange={(code, value) => {
                  setMatrixAnswers((prev) => ({ ...prev, [code]: value }));
                  setEnrichedResult(null); // reset on answer change
                  setOverrideInfo(null);
                }}
              />
            </div>
          );

        // ── Step 3: Recommendation (scoring + explainability + confidence)
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
                          <Badge variant="outline" className="text-xs text-indigo-600 border-indigo-500/30">
                            <Database className="w-3 h-3 mr-0.5" /> Matrix
                          </Badge>
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

                  {/* Matrix version info */}
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

        // ── Step 4: Review + Persist ────────────────────────────────
        case 4:
          return renderReviewStep();

        default:
          return null;
      }
    }

    // Legacy mode steps
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-amber-600 border-amber-500/30">
                <Brain className="w-3 h-3 mr-1" /> Legacy Mode
              </Badge>
            </div>
            <div>
              <Label>System Name</Label>
              <Input value={systemName} onChange={(e) => setSystemName(e.target.value)} placeholder="E.g.: Platform Migration System" className="mt-1" maxLength={255} />
            </div>
            <div>
              <Label>Scenario Description</Label>
              <textarea value={scenarioText} onChange={(e) => setScenarioText(e.target.value)} placeholder="Describe the project scenario..." className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[140px] resize-none" />
              <p className="text-xs text-muted-foreground mt-1">{scenarioText.length}/5000 characters</p>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">{filledCount}/6 dimensions</Badge>
              {allDimensionsFilled && <Badge variant="outline" className="text-green-600 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Complete</Badge>}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <DimensionSelector label="Domain" value={dimensions.domain} onChange={(v) => { setDimensions((d) => ({ ...d, domain: v as DomainValue })); setLegacyClassification(null); }} options={DOMAIN_OPTIONS} />
              <DimensionSelector label="Organizational Level" value={dimensions.orgLevel} onChange={(v) => { setDimensions((d) => ({ ...d, orgLevel: v as OrgLevelValue })); setLegacyClassification(null); }} options={ORG_LEVEL_OPTIONS} />
              <DimensionSelector label="Criticality" value={dimensions.criticality} onChange={(v) => { setDimensions((d) => ({ ...d, criticality: v as CriticalityValue })); setLegacyClassification(null); }} options={CRITICALITY_OPTIONS} />
              <DimensionSelector label="Delivery Style" value={dimensions.deliveryStyle} onChange={(v) => { setDimensions((d) => ({ ...d, deliveryStyle: v as DeliveryStyleValue })); setLegacyClassification(null); }} options={DELIVERY_STYLE_OPTIONS} />
              <DimensionSelector label="Value Orientation" value={dimensions.valueOrientation} onChange={(v) => { setDimensions((d) => ({ ...d, valueOrientation: v as ValueOrientationValue })); setLegacyClassification(null); }} options={VALUE_ORIENTATION_OPTIONS} />
              <DimensionSelector label="Lifecycle Focus" value={dimensions.lifecycleFocus} onChange={(v) => { setDimensions((d) => ({ ...d, lifecycleFocus: v as LifecycleFocusValue })); setLegacyClassification(null); }} options={LIFECYCLE_FOCUS_OPTIONS} />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            {isClassifying ? (
              <Card>
                <CardContent className="pt-6 flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-sm text-muted-foreground">Classifying scenario...</p>
                </CardContent>
              </Card>
            ) : legacyClassification ? (
              <>
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-semibold">Recommended System Type</h3>
                    </div>
                    <Badge className="text-sm px-3 py-1">{legacyClassification.systemType}</Badge>
                    <ConfidenceBar confidence={legacyClassification.confidence} />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    <h4 className="text-sm font-medium">Matched Dimensions</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {legacyClassification.matchedDimensions.map((dim) => (
                        <Badge key={dim} variant="outline" className="text-xs">{dim}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center gap-2"><Brain className="w-4 h-4 text-indigo-500" /><h4 className="text-sm font-medium">Reasoning</h4></div>
                    <ul className="space-y-1.5">
                      {legacyClassification.reasoning.map((reason, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
                <Button variant="outline" size="sm" onClick={handleReclassify}>Re-classify</Button>
              </>
            ) : (
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center gap-2 text-amber-600"><AlertTriangle className="w-5 h-5" /><p className="text-sm font-medium">No classification yet</p></div>
                  <p className="text-sm text-muted-foreground">{allDimensionsFilled ? "Click below to classify." : "Go back and fill all 6 dimensions."}</p>
                  {allDimensionsFilled && <Button size="sm" onClick={handleReclassify}><Brain className="w-4 h-4 mr-1" /> Classify Now</Button>}
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 3:
        return renderReviewStep();

      default:
        return null;
    }
  };

  // ── Review step (shared between modes) ────────────────────────────
  const renderReviewStep = () => (
    <div className="space-y-3">
      {isPublished ? (
        <>
          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center gap-2 text-green-600"><CheckCircle2 className="w-5 h-5" /><h3 className="font-semibold">{isMatrixMode ? "Wizard Complete" : "System Created"}</h3></div>
              <p className="text-sm text-muted-foreground">
                {isMatrixMode && acceptResult ? (
                  <>PS system "<span className="font-medium text-foreground">{acceptResult.system.name}</span>" provisioned via scope template. {acceptResult.trace.demandCount} demand requests and {acceptResult.trace.assignmentCount} assignment placeholders created.</>
                ) : (
                  <>PS system "<span className="font-medium text-foreground">{systemName}</span>" created with {generatedDemand.length} resource requests.</>
                )}
              </p>
              {isMatrixMode && acceptResult && (
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
                <div className="flex items-center gap-2"><Users className="w-5 h-5 text-indigo-500" /><h3 className="font-semibold">Demand Generated</h3><Badge variant="secondary">{generatedDemand.length} roles</Badge></div>
                <div className="space-y-1.5">
                  {generatedDemand.map((d, i) => (
                    <div key={i} className="flex justify-between text-sm"><span>{d.role}</span><Badge variant="outline" className="text-xs">{d.quantity}x</Badge></div>
                  ))}
                </div>
                <div className="pt-1 border-t"><div className="flex justify-between text-sm font-medium"><span>Total headcount</span><span>{generatedDemand.reduce((s, d) => s + d.quantity, 0)}</span></div></div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2"><UserCheck className="w-5 h-5 text-indigo-500" /><h3 className="font-semibold">Assignments</h3></div>
              {isMatrixMode && acceptResult ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Demand requests</span><Badge variant="secondary" className="text-xs"><ClipboardList className="w-3 h-3 mr-1" />{acceptResult.trace.demandCount} created</Badge></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Assignment placeholders</span><Badge variant="secondary" className="text-xs"><UserCheck className="w-3 h-3 mr-1" />{acceptResult.trace.assignmentCount} created</Badge></div>
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
                  <p className="text-xs text-muted-foreground pt-1">Placeholders auto-created. Navigate to PS Systems to assign people.</p>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Demand requests</span><Badge variant="secondary" className="text-xs"><ClipboardList className="w-3 h-3 mr-1" />{generatedDemand.length} created</Badge></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Assignments</span><Badge className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">0 — not yet created</Badge></div>
                  <p className="text-xs text-muted-foreground pt-1">Navigate to PS Systems to create assignments.</p>
                </div>
              )}
            </CardContent>
          </Card>
          {isMatrixMode && acceptResult && (
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
          )}
        </>
      ) : (
        <>
          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <h4 className="font-medium mb-2">Summary</h4>
              <div className="flex justify-between"><span className="text-muted-foreground">System Name</span><span className="font-medium">{systemName || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Scenario</span><span className="font-medium max-w-[60%] text-right truncate">{scenarioText.slice(0, 80)}{scenarioText.length > 80 ? "..." : ""}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Mode</span><Badge variant="outline" className="text-xs">{isMatrixMode ? "Matrix" : "Legacy"}</Badge></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isMatrixMode ? "Selected Scope" : "System Type"}</span>
                <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30">{effectiveScopeLabel || effectiveSystemType || "—"}</Badge>
              </div>
              {overrideInfo && (
                <div className="flex justify-between"><span className="text-muted-foreground">Override</span><Badge variant="outline" className="text-xs text-amber-600">Yes — {overrideInfo.reason.slice(0, 40)}</Badge></div>
              )}
              {isMatrixMode && enrichedResult && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span><PSConfidenceInline overall={enrichedResult.confidence.overall} /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Matrix Version</span><span className="font-medium">{enrichedResult.matrixVersion}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Questions Matched</span><span className="font-medium">{enrichedResult.matchedQuestions.length}/{enrichedResult.totalQuestions}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Winner Margin</span><span className="font-medium">+{enrichedResult.explainability.winnerMargin}</span></div>
                </>
              )}
              {!isMatrixMode && legacyClassification && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span><span className="font-medium">{Math.round(legacyClassification.confidence * 100)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Rules Matched</span><span className="font-medium">{legacyClassification.reasoning.length}</span></div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Legacy dimension summary */}
          {!isMatrixMode && (
            <Card>
              <CardContent className="pt-4 space-y-2 text-sm">
                <h4 className="font-medium mb-2">Selected Dimensions</h4>
                {(["domain", "orgLevel", "criticality", "deliveryStyle", "valueOrientation", "lifecycleFocus"] as const).map((key) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                    <Badge variant="outline" className="text-xs">{dimLabel(key)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Matrix answered questions summary */}
          {isMatrixMode && enrichedResult && (
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
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">System</p>
        <p className="text-sm font-medium">{systemName || "Not named yet"}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Scenario</p>
        <p className="text-sm">{scenarioText ? scenarioText.slice(0, 120) + (scenarioText.length > 120 ? "..." : "") : "Not entered yet"}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Mode</p>
        <Badge variant="outline" className="text-xs">{isMatrixMode ? `Matrix v${matrixVersionLabel}` : "Legacy"}</Badge>
      </div>
      {isMatrixMode ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Questions ({answeredCount}/{matrixQuestions.length})</p>
        </div>
      ) : (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Dimensions ({filledCount}/6)</p>
          <div className="space-y-1">
            {(["domain", "orgLevel", "criticality", "deliveryStyle", "valueOrientation", "lifecycleFocus"] as const).map((key) => (
              <div key={key} className="flex justify-between text-xs">
                <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                <span className={dimensions[key] ? "font-medium" : "text-muted-foreground/50"}>{dimLabel(key)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {hasResult && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {isMatrixMode ? "Selected Scope" : "Predicted System"}
          </p>
          <Badge className="text-xs bg-indigo-500/10 text-indigo-600">
            {isMatrixMode ? effectiveScopeLabel : effectiveSystemType}
          </Badge>
          {isMatrixMode && enrichedResult && (
            <div className="mt-2"><PSConfidenceInline overall={enrichedResult.confidence.overall} /></div>
          )}
          {!isMatrixMode && legacyClassification && (
            <div className="mt-2"><ConfidenceBar confidence={legacyClassification.confidence} /></div>
          )}
          {overrideInfo && (
            <div className="mt-1"><Badge variant="outline" className="text-[10px] text-amber-600">Overridden</Badge></div>
          )}
        </div>
      )}
      {contextTags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Context Tags</p>
          <div className="flex flex-wrap gap-1">{contextTags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}</div>
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
            {hasResult && (
              <> | {isMatrixMode ? effectiveScopeLabel : effectiveSystemType}
                {isMatrixMode && enrichedResult && <> ({Math.round(enrichedResult.confidence.overall * 100)}%)</>}
                {!isMatrixMode && legacyClassification && <> ({Math.round(legacyClassification.confidence * 100)}%)</>}
              </>
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
