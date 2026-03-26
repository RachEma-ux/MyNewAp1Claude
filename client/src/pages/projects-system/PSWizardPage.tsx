/**
 * PS Wizard — Dual-mode classification wizard
 *
 * Matrix Mode (when active matrix version exists):
 *   Step 1: Scenario — describe the project scenario
 *   Step 2: Questions — dynamically loaded from matrix DB
 *   Step 3: Recommendation — matrix engine result with score breakdown
 *   Step 4: Review — confirm and persist wizard run
 *
 * Legacy Mode (fallback when no matrix version):
 *   Step 1: Scenario — describe the project scenario
 *   Step 2: Dimensions — select 6 classification dimensions
 *   Step 3: Recommendation — rule-based classifier result
 *   Step 4: Review — confirm and persist wizard run
 */
import { useState, useMemo } from "react";
import { ModuleWizardShell, type WizardStep } from "@/components/wizard/ModuleWizardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "lucide-react";

// ── Dimension options (legacy mode) ──────────────────────────────────

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

// ── System type display mapping ───────────────────────────────────────

const SYSTEM_TYPE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  PROJECT_GOVERNANCE: {
    label: "Project Governance",
    color: "bg-red-500/10 text-red-600 border-red-500/30",
    description: "Structured governance with formal controls, stage gates, and compliance tracking",
  },
  SOFTWARE_DELIVERY: {
    label: "Software Delivery",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    description: "End-to-end software development lifecycle with CI/CD and release management",
  },
  SOFTWARE_LIFECYCLE: {
    label: "Software Lifecycle",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    description: "Full software development lifecycle management",
  },
  PROGRAM_MANAGEMENT: {
    label: "Program Management",
    color: "bg-purple-500/10 text-purple-600 border-purple-500/30",
    description: "Multi-project coordination with cross-cutting governance and resource allocation",
  },
  AGILE_PRODUCT: {
    label: "Agile Product",
    color: "bg-green-500/10 text-green-600 border-green-500/30",
    description: "Iterative product development with sprints, backlogs, and continuous delivery",
  },
  OPERATIONS_IMPROVEMENT: {
    label: "Operations Improvement",
    color: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    description: "Process optimization focused on efficiency, cost reduction, and operational excellence",
  },
};

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

interface MatrixResult {
  selectedScope: string;
  scores: Record<string, number>;
  matchedQuestions: string[];
  matrixVersion: string;
}

// ── Confidence bar ────────────────────────────────────────────────────

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? "bg-green-500" : pct >= 65 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Confidence</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Score bar (for matrix mode) ──────────────────────────────────────

function ScoreBar({ label, score, maxScore, isTop }: { label: string; score: number; maxScore: number; isTop: boolean }) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className={isTop ? "font-semibold" : "text-muted-foreground"}>
          {SYSTEM_TYPE_LABELS[label]?.label || label}
        </span>
        <span className={isTop ? "font-semibold" : "text-muted-foreground"}>{score}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isTop ? "bg-indigo-500" : "bg-muted-foreground/30"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── DimensionSelector (legacy mode) ──────────────────────────────────

function DimensionSelector({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
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

  // Legacy mode state
  const [dimensions, setDimensions] = useState<Dimensions>({
    domain: "",
    orgLevel: "",
    criticality: "",
    deliveryStyle: "",
    valueOrientation: "",
    lifecycleFocus: "",
  });
  const [legacyClassification, setLegacyClassification] = useState<LegacyClassificationResult | null>(null);

  // Matrix mode state
  const [matrixAnswers, setMatrixAnswers] = useState<Record<string, boolean>>({});
  const [matrixResult, setMatrixResult] = useState<MatrixResult | null>(null);

  // Shared state
  const [isClassifying, setIsClassifying] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [generatedDemand, setGeneratedDemand] = useState<Array<{ role: string; quantity: number }>>([]);

  const utils = trpc.useUtils();

  // ── Check if matrix mode is available ──────────────────────────────
  const activeQuestionsQuery = trpc.ps.matrix.getActiveQuestions.useQuery(
    { workspaceId },
    { staleTime: 60_000 },
  );

  const isMatrixMode = activeQuestionsQuery.data?.available === true;
  const matrixQuestions = activeQuestionsQuery.data?.questions || [];
  const matrixScopes = activeQuestionsQuery.data?.scopes || [];
  const matrixVersionLabel = activeQuestionsQuery.data?.version || null;

  // ── Steps (adapt labels based on mode) ─────────────────────────────
  const STEPS: WizardStep[] = useMemo(() => [
    { id: "scenario", label: "Scenario", description: "Describe the project scenario and objectives" },
    {
      id: "questions",
      label: isMatrixMode ? "Questions" : "Dimensions",
      description: isMatrixMode
        ? "Answer matrix-based classification questions"
        : "Select classification dimensions",
    },
    { id: "recommendation", label: "Recommendation", description: "Review the system recommendation" },
    { id: "review", label: "Review", description: "Confirm and persist" },
  ], [isMatrixMode]);

  // ── Legacy classification query ────────────────────────────────────
  const classifyQuery = trpc.ps.classifyScenario.useQuery(
    {
      workspaceId,
      scenarioText,
      dimensions: dimensions as any,
    },
    {
      enabled: false,
      retry: false,
    },
  );

  // ── Matrix evaluation query ────────────────────────────────────────
  const matrixEvalQuery = trpc.ps.matrix.evaluate.useQuery(
    {
      workspaceId,
      answers: matrixAnswers,
    },
    {
      enabled: false,
      retry: false,
    },
  );

  // ── Mutations ──────────────────────────────────────────────────────
  const createSystemMut = trpc.ps.systems.create.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const generateDemandMut = trpc.ps.demand.generateForSystem.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const createRunMut = trpc.ps.wizardRuns.create.useMutation({
    onError: (e) => toast.error(e.message),
  });

  // ── Dimension completeness check (legacy mode) ─────────────────────
  const allDimensionsFilled =
    dimensions.domain !== "" &&
    dimensions.orgLevel !== "" &&
    dimensions.criticality !== "" &&
    dimensions.deliveryStyle !== "" &&
    dimensions.valueOrientation !== "" &&
    dimensions.lifecycleFocus !== "";

  const filledCount = Object.values(dimensions).filter((v) => v !== "").length;

  // ── Matrix answers count ───────────────────────────────────────────
  const answeredCount = Object.values(matrixAnswers).filter(Boolean).length;
  const hasAnyAnswer = answeredCount > 0;

  // ── Effective result (matrix or legacy) ────────────────────────────
  const effectiveSystemType = isMatrixMode
    ? matrixResult?.selectedScope || ""
    : legacyClassification?.systemType || "";

  const hasResult = isMatrixMode ? matrixResult !== null : legacyClassification !== null;

  // ── Step validity ──────────────────────────────────────────────────
  const stepsWithValidity = STEPS.map((s, i) => ({
    ...s,
    isValid:
      i === 0
        ? scenarioText.trim().length > 0 && systemName.trim().length > 0
        : i === 1
        ? isMatrixMode ? true : allDimensionsFilled
        : i === 2
        ? hasResult
        : i === 3
        ? isPublished
        : false,
  }));

  // ── Handle step change ─────────────────────────────────────────────
  const handleStepChange = async (step: number) => {
    if (step === 2 && !hasResult) {
      await runClassification();
    }
    setCurrentStep(step);
  };

  // ── Classification logic ───────────────────────────────────────────
  const runClassification = async () => {
    setIsClassifying(true);

    try {
      if (isMatrixMode) {
        const result = await matrixEvalQuery.refetch();
        if (result.data) {
          setMatrixResult(result.data);
        }
      } else {
        if (!allDimensionsFilled) {
          toast.error("Please fill all dimensions first");
          setIsClassifying(false);
          return;
        }
        const result = await classifyQuery.refetch();
        if (result.data) {
          setLegacyClassification(result.data);
        }
      }
    } catch (err: any) {
      toast.error("Classification failed: " + (err?.message || "Unknown error"));
    } finally {
      setIsClassifying(false);
    }
  };

  const handleReclassify = async () => {
    if (isMatrixMode) {
      setMatrixResult(null);
    } else {
      setLegacyClassification(null);
    }
    await runClassification();
  };

  // ── Publish handler ────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!hasResult) return;

    try {
      const systemType = effectiveSystemType;

      // 1. Create the PS system
      const system = await createSystemMut.mutateAsync({
        workspaceId,
        name: systemName.trim(),
        description: scenarioText.trim(),
        systemType,
        lifecycleType: isMatrixMode ? undefined : dimensions.lifecycleFocus || undefined,
        governanceProfile: isMatrixMode ? undefined : dimensions.criticality || undefined,
      });

      // 2. Generate demand for the system
      const demand = await generateDemandMut.mutateAsync({
        workspaceId,
        psSystemId: system.id,
      });

      if (Array.isArray(demand) && demand.length > 0) {
        setGeneratedDemand(demand.map((d: any) => ({ role: d.role, quantity: d.quantity ?? 1 })));
      }

      // 3. Persist the wizard run
      await createRunMut.mutateAsync({
        workspaceId,
        scenarioText: scenarioText.trim(),
        inputPayload: isMatrixMode
          ? { answers: matrixAnswers, mode: "matrix" }
          : { dimensions, mode: "legacy" },
        resultPayload: isMatrixMode
          ? (matrixResult as any)
          : (legacyClassification as any),
        confidence: isMatrixMode ? undefined : Math.round((legacyClassification?.confidence || 0) * 100),
        selectedSystemType: systemType,
        matrixVersion: isMatrixMode ? matrixResult?.matrixVersion : undefined,
      });

      utils.ps.systems.list.invalidate();
      utils.ps.demand.list.invalidate();

      setIsPublished(true);
      toast.success(`System created with ${demand.length} resource requests`);
    } catch {
      // Error shown by mutation onError
    }
  };

  const isSaving = createSystemMut.isPending || generateDemandMut.isPending || createRunMut.isPending;

  // ── Dimension label helper (legacy) ────────────────────────────────
  const dimLabel = (key: keyof Dimensions) => {
    const allOpts: Record<string, readonly { value: string; label: string }[]> = {
      domain: DOMAIN_OPTIONS,
      orgLevel: ORG_LEVEL_OPTIONS,
      criticality: CRITICALITY_OPTIONS,
      deliveryStyle: DELIVERY_STYLE_OPTIONS,
      valueOrientation: VALUE_ORIENTATION_OPTIONS,
      lifecycleFocus: LIFECYCLE_FOCUS_OPTIONS,
    };
    const val = dimensions[key];
    return allOpts[key]?.find((o) => o.value === val)?.label || val || "—";
  };

  // ── Matrix score helpers ───────────────────────────────────────────
  const maxScore = matrixResult
    ? Math.max(...Object.values(matrixResult.scores), 1)
    : 1;

  const sortedScores = matrixResult
    ? Object.entries(matrixResult.scores)
        .sort(([, a], [, b]) => b - a)
    : [];

  // ── Step content ───────────────────────────────────────────────────
  const renderStep = () => {
    switch (currentStep) {
      // ── Step 0: Scenario ──────────────────────────────────────────
      case 0:
        return (
          <div className="space-y-4">
            {/* Mode indicator */}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={isMatrixMode
                ? "text-indigo-600 border-indigo-500/30"
                : "text-amber-600 border-amber-500/30"
              }>
                {isMatrixMode ? (
                  <><Database className="w-3 h-3 mr-1" /> Matrix Mode (v{matrixVersionLabel})</>
                ) : (
                  <><Brain className="w-3 h-3 mr-1" /> Legacy Mode</>
                )}
              </Badge>
              {activeQuestionsQuery.isLoading && (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              )}
            </div>

            <div>
              <Label>System Name</Label>
              <Input
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder="E.g.: Platform Migration System"
                className="mt-1"
                maxLength={255}
              />
              <p className="text-xs text-muted-foreground mt-1">
                A short name for the project system being defined.
              </p>
            </div>
            <div>
              <Label>Scenario Description</Label>
              <textarea
                value={scenarioText}
                onChange={(e) => setScenarioText(e.target.value)}
                placeholder="Describe the project scenario, objectives, and context..."
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[140px] resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {scenarioText.length}/5000 characters
              </p>
            </div>
          </div>
        );

      // ── Step 1: Questions (matrix) or Dimensions (legacy) ─────────
      case 1:
        if (isMatrixMode) {
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">
                  {answeredCount}/{matrixQuestions.length} answered
                </Badge>
                <Badge variant="outline" className="text-indigo-600 border-indigo-500/30">
                  <Database className="w-3 h-3 mr-1" /> Matrix v{matrixVersionLabel}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                Select all questions that apply to your project scenario. The matrix engine will compute
                the best matching scope based on weighted scores.
              </p>

              <div className="space-y-2">
                {matrixQuestions.map((q) => (
                  <Card key={q.code} className="cursor-pointer hover:border-indigo-500/30 transition-colors">
                    <CardContent className="pt-3 pb-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          checked={!!matrixAnswers[q.code]}
                          onCheckedChange={(checked) => {
                            setMatrixAnswers((prev) => ({
                              ...prev,
                              [q.code]: !!checked,
                            }));
                            // Reset result when answers change
                            setMatrixResult(null);
                          }}
                          className="mt-0.5"
                        />
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{q.label}</p>
                          {q.description && (
                            <p className="text-xs text-muted-foreground">{q.description}</p>
                          )}
                        </div>
                      </label>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {matrixQuestions.length === 0 && (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No questions defined in the active matrix. Contact your administrator.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          );
        }

        // Legacy mode: dimension selectors
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">{filledCount}/6 dimensions</Badge>
              {allDimensionsFilled && (
                <Badge variant="outline" className="text-green-600 border-green-500/30">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                </Badge>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <DimensionSelector
                label="Domain"
                value={dimensions.domain}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, domain: v as DomainValue }));
                  setLegacyClassification(null);
                }}
                options={DOMAIN_OPTIONS}
              />
              <DimensionSelector
                label="Organizational Level"
                value={dimensions.orgLevel}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, orgLevel: v as OrgLevelValue }));
                  setLegacyClassification(null);
                }}
                options={ORG_LEVEL_OPTIONS}
              />
              <DimensionSelector
                label="Criticality"
                value={dimensions.criticality}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, criticality: v as CriticalityValue }));
                  setLegacyClassification(null);
                }}
                options={CRITICALITY_OPTIONS}
              />
              <DimensionSelector
                label="Delivery Style"
                value={dimensions.deliveryStyle}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, deliveryStyle: v as DeliveryStyleValue }));
                  setLegacyClassification(null);
                }}
                options={DELIVERY_STYLE_OPTIONS}
              />
              <DimensionSelector
                label="Value Orientation"
                value={dimensions.valueOrientation}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, valueOrientation: v as ValueOrientationValue }));
                  setLegacyClassification(null);
                }}
                options={VALUE_ORIENTATION_OPTIONS}
              />
              <DimensionSelector
                label="Lifecycle Focus"
                value={dimensions.lifecycleFocus}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, lifecycleFocus: v as LifecycleFocusValue }));
                  setLegacyClassification(null);
                }}
                options={LIFECYCLE_FOCUS_OPTIONS}
              />
            </div>
          </div>
        );

      // ── Step 2: Recommendation ─────────────────────────────────────
      case 2:
        return (
          <div className="space-y-4">
            {isClassifying ? (
              <Card>
                <CardContent className="pt-6 flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-sm text-muted-foreground">
                    {isMatrixMode ? "Evaluating matrix..." : "Classifying scenario..."}
                  </p>
                </CardContent>
              </Card>
            ) : hasResult ? (
              <>
                {/* System Type / Scope Result */}
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-semibold">
                        {isMatrixMode ? "Selected Scope" : "Recommended System Type"}
                      </h3>
                      {isMatrixMode && (
                        <Badge variant="outline" className="text-xs text-indigo-600 border-indigo-500/30">
                          <Database className="w-3 h-3 mr-0.5" /> Matrix
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`text-sm px-3 py-1 ${SYSTEM_TYPE_LABELS[effectiveSystemType]?.color || "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"}`}
                      >
                        {SYSTEM_TYPE_LABELS[effectiveSystemType]?.label || effectiveSystemType}
                      </Badge>
                    </div>
                    {SYSTEM_TYPE_LABELS[effectiveSystemType]?.description && (
                      <p className="text-sm text-muted-foreground">
                        {SYSTEM_TYPE_LABELS[effectiveSystemType].description}
                      </p>
                    )}
                    {!isMatrixMode && legacyClassification && (
                      <ConfidenceBar confidence={legacyClassification.confidence} />
                    )}
                  </CardContent>
                </Card>

                {/* Matrix mode: Score breakdown */}
                {isMatrixMode && matrixResult && (
                  <Card>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-500" />
                        <h4 className="text-sm font-medium">Score Ranking</h4>
                      </div>
                      <div className="space-y-2">
                        {sortedScores.map(([code, score], idx) => (
                          <ScoreBar
                            key={code}
                            label={code}
                            score={score}
                            maxScore={maxScore}
                            isTop={idx === 0}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Matrix mode: Matched questions */}
                {isMatrixMode && matrixResult && matrixResult.matchedQuestions.length > 0 && (
                  <Card>
                    <CardContent className="pt-4 space-y-2">
                      <h4 className="text-sm font-medium">Contributing Questions ({matrixResult.matchedQuestions.length})</h4>
                      <div className="space-y-1">
                        {matrixResult.matchedQuestions.map((qCode) => {
                          const q = matrixQuestions.find((mq) => mq.code === qCode);
                          return (
                            <div key={qCode} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                              <span className="text-muted-foreground">{q?.label || qCode}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Legacy mode: Matched Dimensions + Reasoning */}
                {!isMatrixMode && legacyClassification && (
                  <>
                    <Card>
                      <CardContent className="pt-4 space-y-2">
                        <h4 className="text-sm font-medium">Matched Dimensions</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {legacyClassification.matchedDimensions.map((dim) => (
                            <Badge key={dim} variant="outline" className="text-xs">
                              {dim}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <Brain className="w-4 h-4 text-indigo-500" />
                          <h4 className="text-sm font-medium">Reasoning</h4>
                        </div>
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
                  </>
                )}

                {/* Matrix version info */}
                {isMatrixMode && matrixResult && (
                  <div className="text-xs text-muted-foreground">
                    Matrix version: {matrixResult.matrixVersion}
                  </div>
                )}

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
                    {isMatrixMode
                      ? "Click below to evaluate your answers against the matrix."
                      : allDimensionsFilled
                        ? "Click below to classify the scenario."
                        : "Go back to Step 2 and fill all 6 dimensions first."}
                  </p>
                  {(isMatrixMode || allDimensionsFilled) && (
                    <Button size="sm" onClick={handleReclassify}>
                      <Brain className="w-4 h-4 mr-1" />
                      {isMatrixMode ? "Evaluate Matrix" : "Classify Now"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        );

      // ── Step 3: Review ─────────────────────────────────────────────
      case 3:
        return (
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
                      PS system "<span className="font-medium text-foreground">{systemName}</span>" has been created
                      and {generatedDemand.length} resource requests generated.
                    </p>
                  </CardContent>
                </Card>

                {generatedDemand.length > 0 && (
                  <Card>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-semibold">Demand Generated</h3>
                        <Badge variant="secondary">{generatedDemand.length} roles requested</Badge>
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

                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-amber-500" />
                      <h3 className="font-semibold">Assignment Readiness</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Demand requests</span>
                        <Badge variant="secondary" className="text-xs">
                          <ClipboardList className="w-3 h-3 mr-1" />
                          {generatedDemand.length} created
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Assignments</span>
                        <Badge className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                          0 — not yet created
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Fulfillment</span>
                        <Badge className="text-xs bg-red-500/10 text-red-600 border-red-500/30">
                          Unfilled
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      Navigate to the PS Systems list to create assignments against these demand requests.
                    </p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <CardContent className="pt-4 space-y-2 text-sm">
                    <h4 className="font-medium mb-2">Summary</h4>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">System Name</span>
                      <span className="font-medium">{systemName || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scenario</span>
                      <span className="font-medium max-w-[60%] text-right truncate">
                        {scenarioText.slice(0, 80)}{scenarioText.length > 80 ? "..." : ""}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Classification Mode</span>
                      <Badge variant="outline" className="text-xs">
                        {isMatrixMode ? "Matrix" : "Legacy"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {isMatrixMode ? "Selected Scope" : "System Type"}
                      </span>
                      <Badge className={SYSTEM_TYPE_LABELS[effectiveSystemType]?.color || "bg-indigo-500/10 text-indigo-600 border-indigo-500/30"}>
                        {SYSTEM_TYPE_LABELS[effectiveSystemType]?.label || effectiveSystemType || "—"}
                      </Badge>
                    </div>
                    {!isMatrixMode && legacyClassification && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Confidence</span>
                        <span className="font-medium">{Math.round(legacyClassification.confidence * 100)}%</span>
                      </div>
                    )}
                    {isMatrixMode && matrixResult && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Matrix Version</span>
                          <span className="font-medium">{matrixResult.matrixVersion}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Questions Answered</span>
                          <span className="font-medium">{matrixResult.matchedQuestions.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Top Score</span>
                          <span className="font-medium">
                            {matrixResult.scores[matrixResult.selectedScope] || 0}
                          </span>
                        </div>
                      </>
                    )}
                    {!isMatrixMode && legacyClassification && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rules Matched</span>
                        <span className="font-medium">{legacyClassification.reasoning.length}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Legacy mode: selected dimensions */}
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

                {/* Matrix mode: answered questions */}
                {isMatrixMode && matrixResult && (
                  <Card>
                    <CardContent className="pt-4 space-y-2 text-sm">
                      <h4 className="font-medium mb-2">Answered Questions</h4>
                      {matrixResult.matchedQuestions.map((qCode) => {
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

      default:
        return null;
    }
  };

  // ── Preview Panel ──────────────────────────────────────────────────
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
        <Badge variant="outline" className="text-xs">
          {isMatrixMode ? `Matrix v${matrixVersionLabel}` : "Legacy"}
        </Badge>
      </div>

      {isMatrixMode ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Questions ({answeredCount}/{matrixQuestions.length})
          </p>
        </div>
      ) : (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Dimensions ({filledCount}/6)
          </p>
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
          <Badge className={`text-xs ${SYSTEM_TYPE_LABELS[effectiveSystemType]?.color || "bg-indigo-500/10 text-indigo-600"}`}>
            {SYSTEM_TYPE_LABELS[effectiveSystemType]?.label || effectiveSystemType}
          </Badge>
          {!isMatrixMode && legacyClassification && (
            <div className="mt-2">
              <ConfidenceBar confidence={legacyClassification.confidence} />
            </div>
          )}
          {isMatrixMode && matrixResult && (
            <div className="mt-1 text-xs text-muted-foreground">
              Score: {matrixResult.scores[matrixResult.selectedScope] || 0}
            </div>
          )}
        </div>
      )}

      {generatedDemand.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Demand Generated
          </p>
          <p className="text-sm font-medium text-green-600">
            {generatedDemand.length} roles, {generatedDemand.reduce((s, d) => s + d.quantity, 0)} headcount
          </p>
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
              <> | {SYSTEM_TYPE_LABELS[effectiveSystemType]?.label || effectiveSystemType}
                {!isMatrixMode && legacyClassification && (
                  <> ({Math.round(legacyClassification.confidence * 100)}%)</>
                )}
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
