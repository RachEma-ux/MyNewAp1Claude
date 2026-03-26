/**
 * PS Wizard — Real classification wizard with dimension-based system recommendation
 *
 * Step 1: Scenario — describe the project scenario
 * Step 2: Dimensions — select 6 classification dimensions
 * Step 3: System Recommendation — backend classifier result
 * Step 4: Review — confirm and persist wizard run
 */
import { useState } from "react";
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
} from "lucide-react";

// ── Dimension options ─────────────────────────────────────────────────

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

interface ClassificationResult {
  systemType: string;
  confidence: number;
  matchedDimensions: string[];
  reasoning: string[];
}

// ── Steps ─────────────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  { id: "scenario", label: "Scenario", description: "Describe the project scenario and objectives" },
  { id: "dimensions", label: "Dimensions", description: "Select classification dimensions" },
  { id: "recommendation", label: "Recommendation", description: "Review the system recommendation" },
  { id: "review", label: "Review", description: "Confirm and persist" },
];

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

// ── DimensionSelector ─────────────────────────────────────────────────

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
  const [dimensions, setDimensions] = useState<Dimensions>({
    domain: "",
    orgLevel: "",
    criticality: "",
    deliveryStyle: "",
    valueOrientation: "",
    lifecycleFocus: "",
  });
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [generatedDemand, setGeneratedDemand] = useState<Array<{ role: string; quantity: number }>>([]);

  const utils = trpc.useUtils();

  // Classification query — manual trigger via refetch
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

  // System creation mutation (auto-generates demand)
  const createSystemMut = trpc.ps.systems.create.useMutation({
    onError: (e) => toast.error(e.message),
  });

  // Wizard run creation mutation
  const createRunMut = trpc.ps.wizardRuns.create.useMutation({
    onSuccess: () => {
      toast.success("System created with demand generated");
      setIsPublished(true);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Dimension completeness check ─────────────────────────────────
  const allDimensionsFilled =
    dimensions.domain !== "" &&
    dimensions.orgLevel !== "" &&
    dimensions.criticality !== "" &&
    dimensions.deliveryStyle !== "" &&
    dimensions.valueOrientation !== "" &&
    dimensions.lifecycleFocus !== "";

  const filledCount = Object.values(dimensions).filter((v) => v !== "").length;

  // ── Step validity ────────────────────────────────────────────────
  const stepsWithValidity = STEPS.map((s, i) => ({
    ...s,
    isValid:
      i === 0
        ? scenarioText.trim().length > 0
        : i === 1
        ? allDimensionsFilled
        : i === 2
        ? classification !== null
        : i === 3
        ? isPublished
        : false,
  }));

  // ── Handle step change — trigger classification when entering step 2→3
  const handleStepChange = async (step: number) => {
    if (step === 2 && allDimensionsFilled && !classification) {
      setIsClassifying(true);
      try {
        const result = await classifyQuery.refetch();
        if (result.data) {
          setClassification(result.data);
        }
      } catch (err: any) {
        toast.error("Classification failed: " + (err?.message || "Unknown error"));
      } finally {
        setIsClassifying(false);
      }
    }
    setCurrentStep(step);
  };

  // ── Re-classify (if user goes back and changes dimensions) ──────
  const handleReclassify = async () => {
    if (!allDimensionsFilled) {
      toast.error("Please fill all dimensions first");
      return;
    }
    setIsClassifying(true);
    setClassification(null);
    try {
      const result = await classifyQuery.refetch();
      if (result.data) {
        setClassification(result.data);
      }
    } catch (err: any) {
      toast.error("Classification failed: " + (err?.message || "Unknown error"));
    } finally {
      setIsClassifying(false);
    }
  };

  // ── Publish handler ─────────────────────────────────────────────
  const handlePublish = async () => {
    if (!classification) return;

    try {
      // 1. Create the PS system (auto-generates demand on backend)
      const systemResult = await createSystemMut.mutateAsync({
        workspaceId,
        name: scenarioText.trim().slice(0, 80),
        description: scenarioText.trim(),
        systemType: classification.systemType,
      });

      // Capture generated demand from the system creation response
      const demand = (systemResult as any)?._generatedDemand;
      if (Array.isArray(demand) && demand.length > 0) {
        setGeneratedDemand(demand.map((d: any) => ({ role: d.role, quantity: d.quantity ?? 1 })));
      }

      // 2. Persist the wizard run
      createRunMut.mutate({
        workspaceId,
        scenarioText: scenarioText.trim(),
        inputPayload: { dimensions },
        resultPayload: classification as any,
        confidence: Math.round(classification.confidence * 100),
        selectedSystemType: classification.systemType,
      });
    } catch {
      // Error already shown by mutation onError
    }
  };

  // ── Dimension label helper ──────────────────────────────────────
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

  // ── Step content ────────────────────────────────────────────────
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div>
              <Label>Scenario Description</Label>
              <textarea
                value={scenarioText}
                onChange={(e) => setScenarioText(e.target.value)}
                placeholder="Describe the project scenario, objectives, and context. E.g.: 'We need to build a new customer-facing mobile application using agile methodology with a distributed team...'"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[140px] resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {scenarioText.length}/5000 characters
              </p>
            </div>
          </div>
        );

      case 1:
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
                  setClassification(null);
                }}
                options={DOMAIN_OPTIONS}
              />
              <DimensionSelector
                label="Organizational Level"
                value={dimensions.orgLevel}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, orgLevel: v as OrgLevelValue }));
                  setClassification(null);
                }}
                options={ORG_LEVEL_OPTIONS}
              />
              <DimensionSelector
                label="Criticality"
                value={dimensions.criticality}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, criticality: v as CriticalityValue }));
                  setClassification(null);
                }}
                options={CRITICALITY_OPTIONS}
              />
              <DimensionSelector
                label="Delivery Style"
                value={dimensions.deliveryStyle}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, deliveryStyle: v as DeliveryStyleValue }));
                  setClassification(null);
                }}
                options={DELIVERY_STYLE_OPTIONS}
              />
              <DimensionSelector
                label="Value Orientation"
                value={dimensions.valueOrientation}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, valueOrientation: v as ValueOrientationValue }));
                  setClassification(null);
                }}
                options={VALUE_ORIENTATION_OPTIONS}
              />
              <DimensionSelector
                label="Lifecycle Focus"
                value={dimensions.lifecycleFocus}
                onChange={(v) => {
                  setDimensions((d) => ({ ...d, lifecycleFocus: v as LifecycleFocusValue }));
                  setClassification(null);
                }}
                options={LIFECYCLE_FOCUS_OPTIONS}
              />
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
            ) : classification ? (
              <>
                {/* System Type Result */}
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-semibold">Recommended System Type</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`text-sm px-3 py-1 ${SYSTEM_TYPE_LABELS[classification.systemType]?.color || ""}`}
                      >
                        {SYSTEM_TYPE_LABELS[classification.systemType]?.label || classification.systemType}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {SYSTEM_TYPE_LABELS[classification.systemType]?.description}
                    </p>
                    <ConfidenceBar confidence={classification.confidence} />
                  </CardContent>
                </Card>

                {/* Matched Dimensions */}
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    <h4 className="text-sm font-medium">Matched Dimensions</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {classification.matchedDimensions.map((dim) => (
                        <Badge key={dim} variant="outline" className="text-xs">
                          {dim}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Reasoning */}
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-indigo-500" />
                      <h4 className="text-sm font-medium">Reasoning</h4>
                    </div>
                    <ul className="space-y-1.5">
                      {classification.reasoning.map((reason, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

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
                    {allDimensionsFilled
                      ? "Click below to classify the scenario."
                      : "Go back to Step 2 and fill all 6 dimensions first."}
                  </p>
                  {allDimensionsFilled && (
                    <Button size="sm" onClick={handleReclassify}>
                      <Brain className="w-4 h-4 mr-1" /> Classify Now
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        );

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
                      The PS system and classification have been persisted.
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
              </>
            ) : (
              <>
                <Card>
                  <CardContent className="pt-4 space-y-2 text-sm">
                    <h4 className="font-medium mb-2">Summary</h4>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scenario</span>
                      <span className="font-medium max-w-[60%] text-right truncate">{scenarioText.slice(0, 80)}{scenarioText.length > 80 ? "..." : ""}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">System Type</span>
                      <Badge className={SYSTEM_TYPE_LABELS[classification?.systemType || ""]?.color || ""}>
                        {SYSTEM_TYPE_LABELS[classification?.systemType || ""]?.label || "—"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Confidence</span>
                      <span className="font-medium">{classification ? Math.round(classification.confidence * 100) + "%" : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rules Matched</span>
                      <span className="font-medium">{classification?.reasoning.length || 0}</span>
                    </div>
                  </CardContent>
                </Card>

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
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // ── Preview Panel (live) ────────────────────────────────────────
  const previewPanel = (
    <div className="space-y-4">
      {/* Scenario Preview */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Scenario</p>
        <p className="text-sm">{scenarioText ? scenarioText.slice(0, 120) + (scenarioText.length > 120 ? "..." : "") : "Not entered yet"}</p>
      </div>

      {/* Dimensions Preview */}
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

      {/* Classification Preview */}
      {classification && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Predicted System
          </p>
          <Badge className={`text-xs ${SYSTEM_TYPE_LABELS[classification.systemType]?.color || ""}`}>
            {SYSTEM_TYPE_LABELS[classification.systemType]?.label || classification.systemType}
          </Badge>
          <div className="mt-2">
            <ConfidenceBar confidence={classification.confidence} />
          </div>
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
            {classification && (
              <> | {SYSTEM_TYPE_LABELS[classification.systemType]?.label} ({Math.round(classification.confidence * 100)}%)</>
            )}
          </span>
        }
        isFinalStep={currentStep === STEPS.length - 1}
        canPublish={!!classification && !isPublished}
        onPublish={handlePublish}
        isSaving={createSystemMut.isPending || createRunMut.isPending}
      >
        {renderStep()}
      </ModuleWizardShell>
    </div>
  );
}

export default PSWizardPage;
