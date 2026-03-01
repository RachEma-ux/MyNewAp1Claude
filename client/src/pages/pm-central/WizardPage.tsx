/**
 * WizardPage — PMI-Compliant Multi-Step Project Creation Wizard
 *
 * Route: /pm-central/p/:id/wizard/:step?
 * Two-phase stepper: Phase A (Initiating → G0) and Phase B (Planning → G1)
 * Left stepper panel + main form + bottom navigation
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Check, Circle, Lock, ChevronRight, ChevronLeft, Save,
  Loader2, Send, AlertTriangle, FileText, Users, Shield,
  Target, ClipboardList, Calendar, DollarSign, Award,
  UserCheck, MessageSquare, ShieldAlert, ShoppingCart,
  Handshake, Milestone, Wand2, Package, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import {
  INITIATING_STEPS, PLANNING_STEPS, ALL_WIZARD_STEPS,
  type WizardStepConfig, type WizardData,
} from "@shared/pm-wizard-config";
import { getMethodPack, type MethodPack, DEFAULT_PACK, LEAN_SUB_PACKS } from "@shared/pm-method-packs";
import { ALL_METHODS, METHOD_CATEGORIES, getMethodsByCategory, getMethodById, getCategoryById } from "@shared/pm-methods-catalog";

// ── Step icon map ──

const STEP_ICONS: Record<string, React.ReactNode> = {
  "method-confirmation": <Package className="h-4 w-4" />,
  "start": <FileText className="h-4 w-4" />,
  "business-case": <Target className="h-4 w-4" />,
  "scope-deliverables": <ClipboardList className="h-4 w-4" />,
  "stakeholders": <Users className="h-4 w-4" />,
  "authority": <Shield className="h-4 w-4" />,
  "risks-milestones": <AlertTriangle className="h-4 w-4" />,
  "charter-review": <Send className="h-4 w-4" />,
  "planning-setup": <ClipboardList className="h-4 w-4" />,
  "scope-plan": <Target className="h-4 w-4" />,
  "schedule-plan": <Calendar className="h-4 w-4" />,
  "cost-plan": <DollarSign className="h-4 w-4" />,
  "quality-plan": <Award className="h-4 w-4" />,
  "resources-plan": <UserCheck className="h-4 w-4" />,
  "communications-plan": <MessageSquare className="h-4 w-4" />,
  "risk-plan": <ShieldAlert className="h-4 w-4" />,
  "procurement-plan": <ShoppingCart className="h-4 w-4" />,
  "engagement-plan": <Handshake className="h-4 w-4" />,
  "pmp-review": <Send className="h-4 w-4" />,
};

/** Resolve the current method pack from wizard data */
function useMethodPack(wizardData: WizardData | null): MethodPack {
  return wizardData?.methodPackId ? getMethodPack(wizardData.methodPackId) : DEFAULT_PACK;
}

// ── Main page ──

export default function WizardPage() {
  const [, params] = useRoute("/pm-central/p/:id/wizard/:step");
  const [, params2] = useRoute("/pm-central/p/:id/wizard");
  const [, setLocation] = useLocation();

  const projectId = parseInt(params?.id || params2?.id || "0", 10);
  const stepParam = params?.step || "start";

  const wizardQuery = trpc.modules.pmt.shell.wizard.get.useQuery(
    { projectId },
    { enabled: projectId > 0 },
  );

  const saveMutation = trpc.modules.pmt.shell.wizard.save.useMutation();
  const submitG0 = trpc.modules.pmt.shell.wizard.submitG0.useMutation();
  const submitG1 = trpc.modules.pmt.shell.wizard.submitG1.useMutation();

  const [wizardData, setWizardData] = useState<WizardData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load wizard data from server
  useEffect(() => {
    if (wizardQuery.data?.wizard && !dirty) {
      setWizardData(wizardQuery.data.wizard);
    }
  }, [wizardQuery.data, dirty]);

  const currentStep = useMemo(() => {
    return ALL_WIZARD_STEPS.find((s) => s.id === stepParam) || ALL_WIZARD_STEPS[0];
  }, [stepParam]);

  const currentStepIndex = ALL_WIZARD_STEPS.findIndex((s) => s.id === stepParam);
  const completedSteps = wizardData?.completedSteps || [];
  const methodPack = useMethodPack(wizardData);

  const isPhaseA = currentStep.phase === "initiating";
  const activeSteps = isPhaseA ? INITIATING_STEPS : PLANNING_STEPS;

  // Navigation
  const goToStep = useCallback((stepId: string) => {
    // Auto-save before navigation
    if (dirty && wizardData && projectId > 0) {
      saveMutation.mutate({
        projectId,
        data: wizardData as any,
        currentStep: stepId,
      });
      setDirty(false);
    }
    setLocation(`/pm-central/p/${projectId}/wizard/${stepId}`);
  }, [dirty, wizardData, projectId, setLocation, saveMutation]);

  const goNext = () => {
    const idx = ALL_WIZARD_STEPS.findIndex((s) => s.id === stepParam);
    if (idx < ALL_WIZARD_STEPS.length - 1) {
      goToStep(ALL_WIZARD_STEPS[idx + 1].id);
    }
  };

  const goPrev = () => {
    const idx = ALL_WIZARD_STEPS.findIndex((s) => s.id === stepParam);
    if (idx > 0) {
      goToStep(ALL_WIZARD_STEPS[idx - 1].id);
    }
  };

  const handleSave = () => {
    if (!wizardData || projectId <= 0) return;
    saveMutation.mutate({
      projectId,
      data: wizardData as any,
      currentStep: stepParam,
    }, {
      onSuccess: () => {
        setDirty(false);
        wizardQuery.refetch();
      },
    });
  };

  const handleSubmitG0 = () => {
    submitG0.mutate({ projectId }, {
      onSuccess: () => {
        wizardQuery.refetch();
      },
    });
  };

  const handleSubmitG1 = () => {
    submitG1.mutate({ projectId }, {
      onSuccess: () => {
        wizardQuery.refetch();
      },
    });
  };

  // Update a wizard field
  const updateField = (field: string, value: unknown) => {
    if (!wizardData) return;
    setWizardData({ ...wizardData, [field]: value } as WizardData);
    setDirty(true);
  };

  if (!projectId || isNaN(projectId)) {
    return <div className="text-muted-foreground text-center py-20">Invalid project ID</div>;
  }

  if (wizardQuery.isLoading || !wizardData) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -mx-6 -mt-6">
      {/* Left stepper panel — collapsible */}
      <div className={`border-r bg-muted/30 flex flex-col transition-all duration-200 ${sidebarOpen ? "w-72" : "w-12"}`}>
        {/* Collapse toggle */}
        <div className={`flex items-center border-b ${sidebarOpen ? "justify-end px-2 py-1.5" : "justify-center py-1.5"}`}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        </div>

        {sidebarOpen ? (
          <>
            {/* Phase tabs */}
            <div className="flex border-b">
              <button
                className={`flex-1 py-2.5 text-xs font-medium text-center ${isPhaseA ? "bg-background border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => goToStep("start")}
              >
                Phase A: Initiating
              </button>
              <button
                className={`flex-1 py-2.5 text-xs font-medium text-center ${!isPhaseA ? "bg-background border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => goToStep("planning-setup")}
              >
                Phase B: Planning
              </button>
            </div>

            {/* Steps list */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {activeSteps.map((step) => {
                  const isActive = step.id === stepParam;
                  const isComplete = completedSteps.includes(step.id);
                  const isLocked = step.conditional && !(wizardData as any)[step.conditional];

                  return (
                    <button
                      key={step.id}
                      onClick={() => !isLocked && goToStep(step.id)}
                      disabled={!!isLocked}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : isComplete
                          ? "text-foreground hover:bg-muted"
                          : isLocked
                          ? "text-muted-foreground/50 cursor-not-allowed"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {/* Status icon */}
                      <span className="shrink-0">
                        {isLocked ? (
                          <Lock className="h-3.5 w-3.5" />
                        ) : isComplete ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : isActive ? (
                          <Circle className="h-3.5 w-3.5 fill-primary text-primary" />
                        ) : (
                          <Circle className="h-3.5 w-3.5" />
                        )}
                      </span>

                      {/* Step icon + label */}
                      <span className="shrink-0 opacity-60">{STEP_ICONS[step.id]}</span>
                      <span className="truncate">{step.shortLabel}</span>

                      {/* Gate badge */}
                      {step.isGateStep && (
                        <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0">
                          {step.gateId}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Project status */}
            <div className="border-t p-3">
              <div className="text-xs text-muted-foreground">
                Status: <Badge variant="outline" className="text-[10px] ml-1">{wizardQuery.data?.projectStatus || "draft_shell"}</Badge>
              </div>
            </div>
          </>
        ) : (
          /* Collapsed: icon-only step indicators */
          <ScrollArea className="flex-1">
            <div className="py-2 space-y-1 flex flex-col items-center">
              {activeSteps.map((step) => {
                const isActive = step.id === stepParam;
                const isComplete = completedSteps.includes(step.id);
                const isLocked = step.conditional && !(wizardData as any)[step.conditional];

                return (
                  <button
                    key={step.id}
                    onClick={() => !isLocked && goToStep(step.id)}
                    disabled={!!isLocked}
                    title={step.shortLabel}
                    className={`p-1.5 rounded-md transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : isComplete
                        ? "text-green-500 hover:bg-muted"
                        : isLocked
                        ? "text-muted-foreground/30 cursor-not-allowed"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {isComplete ? (
                      <Check className="h-4 w-4" />
                    ) : isLocked ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <span className="opacity-80">{STEP_ICONS[step.id] || <Circle className="h-4 w-4" />}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Main form area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Step header */}
        <div className="border-b px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{currentStep.label}</h2>
              <p className="text-sm text-muted-foreground">{currentStep.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {dirty && (
                <Badge variant="secondary" className="text-xs">Unsaved</Badge>
              )}
              <Button variant="outline" size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </div>

        {/* Form content */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            <div className="max-w-3xl mx-auto pb-4">
              <StepForm
                step={currentStep}
                data={wizardData}
                updateField={updateField}
                onSubmitG0={handleSubmitG0}
                onSubmitG1={handleSubmitG1}
                isSubmittingG0={submitG0.isPending}
                isSubmittingG1={submitG1.isPending}
                submitG0Error={submitG0.error?.message}
                submitG1Error={submitG1.error?.message}
                submitG0Success={submitG0.isSuccess}
                submitG1Success={submitG1.isSuccess}
                methodPack={methodPack}
              />
            </div>
          </div>
        </ScrollArea>

        {/* Bottom navigation */}
        <div className="border-t px-6 py-3 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={currentStepIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Step {currentStepIndex + 1} of {ALL_WIZARD_STEPS.length}
          </span>
          <Button
            size="sm"
            onClick={goNext}
            disabled={currentStepIndex === ALL_WIZARD_STEPS.length - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Step Form Dispatcher ──

interface StepFormProps {
  step: WizardStepConfig;
  data: WizardData;
  updateField: (field: string, value: unknown) => void;
  onSubmitG0: () => void;
  onSubmitG1: () => void;
  isSubmittingG0: boolean;
  isSubmittingG1: boolean;
  submitG0Error?: string;
  submitG1Error?: string;
  submitG0Success: boolean;
  submitG1Success: boolean;
  methodPack: MethodPack;
}

function StepForm(props: StepFormProps) {
  switch (props.step.id) {
    case "method-confirmation": return <MethodConfirmationForm {...props} />;
    case "start": return <StartForm {...props} />;
    case "business-case": return <BusinessCaseForm {...props} />;
    case "scope-deliverables": return <ScopeForm {...props} />;
    case "stakeholders": return <StakeholdersForm {...props} />;
    case "authority": return <AuthorityForm {...props} />;
    case "risks-milestones": return <RisksMilestonesForm {...props} />;
    case "charter-review": return <CharterReviewForm {...props} />;
    case "planning-setup": return <PlanningSetupForm {...props} />;
    case "scope-plan": return <ScopePlanForm {...props} />;
    case "schedule-plan": return <SchedulePlanForm {...props} />;
    case "cost-plan": return <CostPlanForm {...props} />;
    case "quality-plan": return <QualityPlanForm {...props} />;
    case "resources-plan": return <ResourcesPlanForm {...props} />;
    case "communications-plan": return <CommunicationsPlanForm {...props} />;
    case "risk-plan": return <RiskPlanForm {...props} />;
    case "procurement-plan": return <ProcurementPlanForm {...props} />;
    case "engagement-plan": return <EngagementPlanForm {...props} />;
    case "pmp-review": return <PmpReviewForm {...props} />;
    default: return <div className="text-muted-foreground">Unknown step: {props.step.id}</div>;
  }
}

// ── Reusable field wrapper ──

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ── Array field helpers ──

function StringListField({
  label, required, value, onChange, placeholder,
}: {
  label: string; required?: boolean; value: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <Field label={label} required={required}>
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => {
                const next = [...value];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="flex-1"
            />
            <Button variant="ghost" size="sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              &times;
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            placeholder={placeholder || "Add item..."}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                onChange([...value, draft.trim()]);
                setDraft("");
              }
            }}
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (draft.trim()) {
                onChange([...value, draft.trim()]);
                setDraft("");
              }
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </Field>
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE A FORMS — Initiating
// ═══════════════════════════════════════════════════════════════

/** Lean sub-mode picker descriptions */
const LEAN_MODE_CARDS = [
  {
    packId: "lean-kanban",
    label: "A) Lightweight Kanban Execution",
    description: "Lean flow with minimal overhead. WIP limits, pull-based delivery, service-level expectations.",
    icon: "kanban",
  },
  {
    packId: "lean-value-stream",
    label: "B) True Value-Stream Management",
    description: "Enterprise Lean. Value stream mapping, bottleneck detection, capacity modeling.",
    icon: "stream",
  },
  {
    packId: "lean-small-project",
    label: "C) Small Project Governance Tier",
    description: "Reduced bureaucratic load. Budget cap ($20k), duration limit (30d), simplified planning.",
    icon: "light",
  },
] as const;

const LEAN_PACK_IDS = new Set(LEAN_SUB_PACKS.map((p) => p.id));

function MethodConfirmationForm({ data, updateField }: StepFormProps) {
  const [, setLocation] = useLocation();
  const isLeanParent = data.methodPackId === "lean-pm";
  const isLeanSubMode = LEAN_PACK_IDS.has(data.methodPackId);
  const currentMethod = data.methodPackId ? getMethodById(isLeanSubMode ? "lean-pm" : data.methodPackId) : null;
  const pack = data.methodPackId ? getMethodPack(data.methodPackId) : null;

  // Lean parent selected → show sub-mode selector
  if (isLeanParent) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Lean Project Management — Select Sub-Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Lean offers 3 operational modes. Each configures a different governance level, workflow, and artifact set.
            </p>
            <div className="grid gap-3">
              {LEAN_MODE_CARDS.map((card) => {
                const subPack = getMethodPack(card.packId);
                return (
                  <button
                    key={card.packId}
                    onClick={() => updateField("methodPackId", card.packId)}
                    className="text-left p-4 rounded-lg border transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">{card.label}</span>
                      <Badge variant="default" className="text-[10px]">Lean</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{card.description}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {subPack.workflow.taskStates.map((state, i) => (
                        <span key={state}>
                          <Badge variant="secondary" className="text-[10px]">{state.replace(/_/g, " ")}</Badge>
                          {i < subPack.workflow.taskStates.length - 1 && <span className="text-muted-foreground mx-0.5 text-[10px]">&rarr;</span>}
                        </span>
                      ))}
                    </div>
                    {subPack.constraints && (
                      <div className="flex gap-2 mt-2">
                        {subPack.constraints.maxDurationDays && (
                          <Badge variant="outline" className="text-[10px]">&le; {subPack.constraints.maxDurationDays}d</Badge>
                        )}
                        {subPack.constraints.maxBudgetAmount && (
                          <Badge variant="outline" className="text-[10px]">&le; ${subPack.constraints.maxBudgetAmount.toLocaleString()}</Badge>
                        )}
                        {subPack.constraints.allowedRiskTiers && (
                          <Badge variant="outline" className="text-[10px]">Risk: {subPack.constraints.allowedRiskTiers.join("/")}</Badge>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="ghost" size="sm" onClick={() => updateField("methodPackId", "")}>
            Clear Selection
          </Button>
        </div>
      </div>
    );
  }

  // Lean sub-mode or non-Lean method selected — show pack detail
  if (pack && currentMethod && data.methodPackId) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                {isLeanSubMode ? pack.methodName : currentMethod.name}
              </CardTitle>
              <div className="flex gap-1">
                {isLeanSubMode && <Badge variant="default" className="text-[10px]">Lean</Badge>}
                <Badge variant="outline" className="text-xs">{pack.deliveryApproach}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isLeanSubMode
                ? `${currentMethod.description.split(".")[0]}. Mode: ${pack.leanMode?.replace(/_/g, " ")}.`
                : currentMethod.description}
            </p>

            {pack.constraints && (
              <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded text-xs">
                <p className="font-medium mb-1">Governance Constraints</p>
                <div className="flex gap-3 text-muted-foreground">
                  {pack.constraints.maxDurationDays && <span>Max duration: <span className="text-foreground">{pack.constraints.maxDurationDays} days</span></span>}
                  {pack.constraints.maxBudgetAmount && <span>Max budget: <span className="text-foreground">${pack.constraints.maxBudgetAmount.toLocaleString()}</span></span>}
                  {pack.constraints.allowedRiskTiers && <span>Risk tiers: <span className="text-foreground">{pack.constraints.allowedRiskTiers.join(", ")}</span></span>}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-medium mb-1">Workflow</p>
              <div className="flex items-center gap-1 flex-wrap">
                {pack.workflow.taskStates.map((state, i) => (
                  <span key={state}>
                    <Badge variant={state === pack.workflow.defaultState ? "default" : "secondary"} className="text-[10px]">
                      {state.replace(/_/g, " ")}
                    </Badge>
                    {i < pack.workflow.taskStates.length - 1 && <span className="text-muted-foreground mx-0.5">&rarr;</span>}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-1">Ceremonies</p>
              <div className="space-y-1">
                {pack.ceremonies.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <span>{c.name}</span>
                    <Badge variant="outline" className="text-[10px]">{c.cadence}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-1">Metrics</p>
              <div className="flex flex-wrap gap-1">
                {pack.metrics.filter(m => m.enabled).map((m) => (
                  <Badge key={m.name} variant="secondary" className="text-[10px]">{m.name}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-1">Required Artifacts</p>
              <div className="flex flex-wrap gap-1">
                {pack.requiredArtifacts.map((a) => (
                  <Badge key={a} variant="outline" className="text-[10px]">{a.replace(/_/g, " ")}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-1">Planning Adaptations</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Scope: <span className="text-foreground">{pack.planningAdaptations.scopeLabel}</span></div>
                <div>Schedule: <span className="text-foreground">{pack.planningAdaptations.scheduleLabel}</span></div>
                {pack.planningAdaptations.sprintCadenceDefault && (
                  <div>Sprint Cadence: <span className="text-foreground">{pack.planningAdaptations.sprintCadenceDefault} days</span></div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          {isLeanSubMode && (
            <Button variant="outline" size="sm" onClick={() => updateField("methodPackId", "lean-pm")}>
              <Package className="h-3.5 w-3.5 mr-1" />
              Change Lean Mode
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setLocation("/pm-central/methodes")}>
            <Wand2 className="h-3.5 w-3.5 mr-1" />
            Change Method
          </Button>
          <Button variant="ghost" size="sm" onClick={() => updateField("methodPackId", "")}>
            Clear Selection
          </Button>
        </div>
      </div>
    );
  }

  // No method selected — inline picker
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select a Methodology</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Choose a project methodology to configure workflow, ceremonies, and planning approach.
            Methods with a pack badge have full operational integration.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {METHOD_CATEGORIES.slice(0, 3).map((cat) => {
              const methods = getMethodsByCategory(cat.id);
              return methods.map((m) => {
                // Lean-pm has sub-modes: route to sub-mode picker instead of direct pack attach
                const handleClick = () => {
                  if (m.hasSubModes) {
                    updateField("methodPackId", m.id); // "lean-pm" triggers sub-mode selector
                  } else {
                    updateField("methodPackId", m.id);
                  }
                };
                return (
                  <button
                    key={m.id}
                    onClick={handleClick}
                    className={`text-left p-3 rounded-lg border transition-colors hover:border-primary/50 ${
                      data.methodPackId === m.id ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{m.name}</span>
                      <div className="flex gap-1">
                        {m.hasSubModes && (
                          <Badge variant="secondary" className="text-[10px]">A/B/C</Badge>
                        )}
                        {m.hasMethodPack && (
                          <Badge variant="default" className="text-[10px]">Pack</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>
                    <Badge variant="outline" className="text-[10px] mt-2">{m.deliveryApproach}</Badge>
                  </button>
                );
              });
            })}
          </div>
          <div className="mt-3 text-center">
            <Button variant="link" size="sm" onClick={() => setLocation("/pm-central/methodes")}>
              Browse all {ALL_METHODS.length} methods
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StartForm({ data, updateField }: StepFormProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Project Identity</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Field label="Project Name" required>
          <Input value={data.name} onChange={(e) => updateField("name", e.target.value)} placeholder="e.g., Platform Migration Q3" />
        </Field>
        <Field label="Sponsor" required>
          <Input value={data.sponsor} onChange={(e) => updateField("sponsor", e.target.value)} placeholder="Executive sponsor name" />
        </Field>
        <Field label="Project Manager" required>
          <Input value={data.projectManager} onChange={(e) => updateField("projectManager", e.target.value)} placeholder="PM name" />
        </Field>
        <Field label="Delivery Approach" required>
          <Select value={data.deliveryApproach} onValueChange={(v) => updateField("deliveryApproach", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="predictive">Predictive (Waterfall)</SelectItem>
              <SelectItem value="agile">Agile</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Project Objective" required>
          <Textarea value={data.objective} onChange={(e) => updateField("objective", e.target.value)} placeholder="High-level objective statement..." rows={3} />
        </Field>
      </CardContent>
    </Card>
  );
}

function BusinessCaseForm({ data, updateField }: StepFormProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Business Case & Value</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Field label="Business Case" required>
          <Textarea value={data.businessCase} onChange={(e) => updateField("businessCase", e.target.value)} placeholder="Why is this project needed? What business value does it deliver?" rows={4} />
        </Field>
        <Field label="Problem / Opportunity Statement" required>
          <Textarea value={data.problemStatement} onChange={(e) => updateField("problemStatement", e.target.value)} placeholder="What problem does this solve or what opportunity does it capture?" rows={3} />
        </Field>
        <Field label="Expected Value" required>
          <Textarea value={data.expectedValue} onChange={(e) => updateField("expectedValue", e.target.value)} placeholder="Quantifiable benefits — ROI, cost savings, revenue, efficiency..." rows={3} />
        </Field>
        <Field label="Constraints">
          <Textarea value={data.constraints} onChange={(e) => updateField("constraints", e.target.value)} placeholder="Budget limits, time constraints, regulatory requirements..." rows={2} />
        </Field>
        <Field label="Assumptions">
          <Textarea value={data.assumptions} onChange={(e) => updateField("assumptions", e.target.value)} placeholder="Key assumptions underlying the business case..." rows={2} />
        </Field>
      </CardContent>
    </Card>
  );
}

function ScopeForm({ data, updateField }: StepFormProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Scope & Deliverables</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <StringListField label="In Scope" required value={data.inScope} onChange={(v) => updateField("inScope", v)} placeholder="Add an in-scope item..." />
          <StringListField label="Out of Scope" value={data.outOfScope} onChange={(v) => updateField("outOfScope", v)} placeholder="Add an out-of-scope item..." />
          <StringListField label="Deliverables" required value={data.deliverables} onChange={(v) => updateField("deliverables", v)} placeholder="Add a deliverable..." />
          <Field label="Acceptance Definition">
            <Textarea value={data.acceptanceDefinition} onChange={(e) => updateField("acceptanceDefinition", e.target.value)} placeholder="How will deliverables be accepted?" rows={2} />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

function StakeholdersForm({ data, updateField }: StepFormProps) {
  const stakeholders = data.stakeholders || [];

  const addStakeholder = () => {
    updateField("stakeholders", [
      ...stakeholders,
      { name: "", role: "", influence: "medium", interest: "medium", engagementLevel: "neutral", type: "internal", communicationPreference: "" },
    ]);
  };

  const updateStakeholder = (idx: number, field: string, value: string) => {
    const next = [...stakeholders];
    (next[idx] as any)[field] = value;
    updateField("stakeholders", next);
  };

  const removeStakeholder = (idx: number) => {
    updateField("stakeholders", stakeholders.filter((_, i) => i !== idx));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Stakeholders</CardTitle>
          <Button variant="outline" size="sm" onClick={addStakeholder}>+ Add Stakeholder</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {stakeholders.length === 0 && (
          <p className="text-sm text-muted-foreground">No stakeholders added yet. Click "Add Stakeholder" to begin.</p>
        )}
        {stakeholders.map((sh, i) => (
          <Card key={i} className="p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" required>
                <Input value={sh.name} onChange={(e) => updateStakeholder(i, "name", e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Role" required>
                <Input value={sh.role} onChange={(e) => updateStakeholder(i, "role", e.target.value)} placeholder="Role / title" />
              </Field>
              <Field label="Influence">
                <Select value={sh.influence} onValueChange={(v) => updateStakeholder(i, "influence", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Interest">
                <Select value={sh.interest} onValueChange={(v) => updateStakeholder(i, "interest", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Engagement Level">
                <Select value={sh.engagementLevel} onValueChange={(v) => updateStakeholder(i, "engagementLevel", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unaware">Unaware</SelectItem>
                    <SelectItem value="resistant">Resistant</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="supportive">Supportive</SelectItem>
                    <SelectItem value="leading">Leading</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Type">
                <Select value={sh.type} onValueChange={(v) => updateStakeholder(i, "type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeStakeholder(i)}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}

function AuthorityForm({ data, updateField }: StepFormProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Roles, Authority & Governance</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Field label="PM Authority Confirmed" required>
          <div className="flex items-center gap-3 mt-1">
            <Button
              variant={data.pmConfirmed ? "default" : "outline"}
              size="sm"
              onClick={() => updateField("pmConfirmed", true)}
            >
              Yes — Confirmed
            </Button>
            <Button
              variant={!data.pmConfirmed ? "destructive" : "outline"}
              size="sm"
              onClick={() => updateField("pmConfirmed", false)}
            >
              Not Yet
            </Button>
          </div>
        </Field>
        <Field label="Decision Model" required>
          <Input value={data.decisionModel} onChange={(e) => updateField("decisionModel", e.target.value)} placeholder="e.g., RACI, Majority vote, Sponsor decides..." />
        </Field>
        <Field label="Risk Tier" required>
          <Select value={data.riskTier} onValueChange={(v) => updateField("riskTier", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Data Tier">
          <Select value={data.dataTier} onValueChange={(v) => updateField("dataTier", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="confidential">Confidential</SelectItem>
              <SelectItem value="restricted">Restricted</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <StringListField label="Compliance Tags" value={data.complianceTags} onChange={(v) => updateField("complianceTags", v)} placeholder="e.g., GDPR, SOC2, HIPAA..." />
      </CardContent>
    </Card>
  );
}

function RisksMilestonesForm({ data, updateField }: StepFormProps) {
  const risks = data.initialRisks || [];
  const milestones = data.milestones || [];

  const addRisk = () => {
    updateField("initialRisks", [
      ...risks,
      { title: "", probability: "medium", impact: "medium", owner: "", mitigation: "" },
    ]);
  };

  const updateRisk = (idx: number, field: string, value: string) => {
    const next = [...risks];
    (next[idx] as any)[field] = value;
    updateField("initialRisks", next);
  };

  const addMilestone = () => {
    updateField("milestones", [...milestones, { title: "", targetDate: "" }]);
  };

  const updateMilestone = (idx: number, field: string, value: string) => {
    const next = [...milestones];
    (next[idx] as any)[field] = value;
    updateField("milestones", next);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Initial Risks (Top 5)</CardTitle>
            <Button variant="outline" size="sm" onClick={addRisk}>+ Add Risk</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {risks.map((r, i) => (
            <Card key={i} className="p-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Risk Title" required>
                  <Input value={r.title} onChange={(e) => updateRisk(i, "title", e.target.value)} />
                </Field>
                <Field label="Owner">
                  <Input value={r.owner} onChange={(e) => updateRisk(i, "owner", e.target.value)} />
                </Field>
                <Field label="Probability">
                  <Select value={r.probability} onValueChange={(v) => updateRisk(i, "probability", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="very_low">Very Low</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="very_high">Very High</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Impact">
                  <Select value={r.impact} onValueChange={(v) => updateRisk(i, "impact", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="very_low">Very Low</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="very_high">Very High</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Mitigation Strategy">
                <Textarea value={r.mitigation} onChange={(e) => updateRisk(i, "mitigation", e.target.value)} rows={2} />
              </Field>
              <div className="mt-2 flex justify-end">
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateField("initialRisks", risks.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">High-Level Milestones</CardTitle>
            <Button variant="outline" size="sm" onClick={addMilestone}>+ Add Milestone</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {milestones.map((m, i) => (
            <div key={i} className="flex items-end gap-3">
              <Field label="Title">
                <Input value={m.title} onChange={(e) => updateMilestone(i, "title", e.target.value)} />
              </Field>
              <Field label="Target Date">
                <Input type="date" value={m.targetDate} onChange={(e) => updateMilestone(i, "targetDate", e.target.value)} />
              </Field>
              <Button variant="ghost" size="sm" onClick={() => updateField("milestones", milestones.filter((_, j) => j !== i))}>
                &times;
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function CharterReviewForm({ data, onSubmitG0, isSubmittingG0, submitG0Error, submitG0Success }: StepFormProps) {
  const readinessChecks = [
    { label: "Sponsor assigned", ok: !!data.sponsor },
    { label: "PM assigned", ok: !!data.projectManager },
    { label: "Business case defined", ok: !!data.businessCase },
    { label: "Scope defined (in-scope + deliverables)", ok: data.inScope.length > 0 && data.deliverables.length > 0 },
    { label: "Stakeholders identified", ok: data.stakeholders.length > 0 },
    { label: "PM authority confirmed", ok: data.pmConfirmed },
    { label: "Risk tier classified", ok: !!data.riskTier },
    { label: "Decision model defined", ok: !!data.decisionModel },
    { label: "Initial risks identified", ok: data.initialRisks.length > 0 },
  ];

  const allReady = readinessChecks.every((c) => c.ok);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">G0 Readiness Checklist</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {readinessChecks.map((check, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {check.ok ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                )}
                <span className={check.ok ? "" : "text-muted-foreground"}>{check.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Charter Summary</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="font-medium">Project:</span> {data.name || "—"}</div>
          <div><span className="font-medium">Sponsor:</span> {data.sponsor || "—"}</div>
          <div><span className="font-medium">PM:</span> {data.projectManager || "—"}</div>
          <div><span className="font-medium">Approach:</span> {data.deliveryApproach}</div>
          <div><span className="font-medium">Risk Tier:</span> {data.riskTier}</div>
          <div><span className="font-medium">Deliverables:</span> {data.deliverables.join(", ") || "—"}</div>
          <div><span className="font-medium">Stakeholders:</span> {data.stakeholders.length} identified</div>
          <div><span className="font-medium">Risks:</span> {data.initialRisks.length} identified</div>
        </CardContent>
      </Card>

      {submitG0Error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {submitG0Error}
        </div>
      )}

      {submitG0Success ? (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md text-sm text-green-600">
          Charter submitted for G0 review. The project has moved to intake_review.
        </div>
      ) : (
        <Button
          className="w-full"
          onClick={onSubmitG0}
          disabled={!allReady || isSubmittingG0}
        >
          {isSubmittingG0 ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Submit Charter for G0 Review
        </Button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE B FORMS — Planning
// ═══════════════════════════════════════════════════════════════

function PlanningSetupForm({ data, updateField }: StepFormProps) {
  const pack = getMethodPack(data.methodPackId);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Planning Setup</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {data.methodPackId && (
          <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
            Pre-configured by <span className="font-medium text-foreground">{pack.methodName}</span> method pack.
            Planning mode set to <Badge variant="outline" className="text-[10px] ml-1">{pack.deliveryApproach}</Badge>
          </div>
        )}
        <Field label="Planning Mode" required>
          <Select value={data.planningMode} onValueChange={(v) => updateField("planningMode", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="predictive">Predictive (Waterfall)</SelectItem>
              <SelectItem value="agile">Agile</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="space-y-3">
          <p className="text-sm font-medium">Optional Modules</p>
          {[
            { field: "procurementEnabled", label: "Procurement Plan", desc: "Vendors, contracts, procurement risks" },
            { field: "worklogEnabled", label: "Work Log / Timesheets", desc: "Time tracking per task" },
            { field: "evmEnabled", label: "Earned Value Management", desc: "EVM metrics (CPI, SPI, EAC)" },
          ].map(({ field, label, desc }) => (
            <div key={field} className="flex items-center gap-3">
              <Button
                variant={(data as any)[field] ? "default" : "outline"}
                size="sm"
                onClick={() => updateField(field, !(data as any)[field])}
              >
                {(data as any)[field] ? "Enabled" : "Disabled"}
              </Button>
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ScopePlanForm({ data, updateField }: StepFormProps) {
  const pack = getMethodPack(data.methodPackId);
  const wbsNodes = data.wbsNodes || [];

  const addWbsNode = () => {
    const id = `wbs-${Date.now()}`;
    updateField("wbsNodes", [...wbsNodes, { id, title: "", parentId: null }]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">{pack.planningAdaptations.scopeLabel}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{pack.planningAdaptations.scopeDescription}</p>
          <Field label="Scope Statement" required>
            <Textarea value={data.scopeStatement} onChange={(e) => updateField("scopeStatement", e.target.value)} placeholder="Detailed project scope description..." rows={4} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{pack.planningAdaptations.wbsRequired ? "WBS Nodes" : "Backlog Items"}</CardTitle>
            <Button variant="outline" size="sm" onClick={addWbsNode}>+ Add {pack.planningAdaptations.wbsRequired ? "Node" : "Item"}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {wbsNodes.map((node, i) => (
            <div key={node.id} className="flex items-center gap-2">
              <Input
                value={node.title}
                onChange={(e) => {
                  const next = [...wbsNodes];
                  next[i] = { ...next[i], title: e.target.value };
                  updateField("wbsNodes", next);
                }}
                placeholder={pack.planningAdaptations.wbsRequired ? "WBS node title..." : "Backlog item title..."}
                className="flex-1"
              />
              <Button variant="ghost" size="sm" onClick={() => updateField("wbsNodes", wbsNodes.filter((_, j) => j !== i))}>
                &times;
              </Button>
            </div>
          ))}
          {wbsNodes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {pack.planningAdaptations.wbsRequired
                ? "No WBS nodes yet. Add nodes to build the work breakdown structure."
                : "No backlog items yet. Add items to build the product backlog."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SchedulePlanForm({ data, updateField }: StepFormProps) {
  const pack = getMethodPack(data.methodPackId);
  const tasks = data.scheduleTasks || [];

  const addTask = () => {
    const id = `task-${Date.now()}`;
    updateField("scheduleTasks", [...tasks, { id, title: "", wbsNodeId: "", startDate: "", endDate: "", dependencies: [], isMilestone: false }]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{pack.planningAdaptations.scheduleLabel}</CardTitle>
          <Button variant="outline" size="sm" onClick={addTask}>+ Add Task</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map((t, i) => (
          <Card key={t.id} className="p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title" required>
                <Input value={t.title} onChange={(e) => {
                  const next = [...tasks]; next[i] = { ...next[i], title: e.target.value };
                  updateField("scheduleTasks", next);
                }} />
              </Field>
              <Field label="WBS Node">
                <Input value={t.wbsNodeId} onChange={(e) => {
                  const next = [...tasks]; next[i] = { ...next[i], wbsNodeId: e.target.value };
                  updateField("scheduleTasks", next);
                }} placeholder="WBS node ID" />
              </Field>
              <Field label="Start Date">
                <Input type="date" value={t.startDate} onChange={(e) => {
                  const next = [...tasks]; next[i] = { ...next[i], startDate: e.target.value };
                  updateField("scheduleTasks", next);
                }} />
              </Field>
              <Field label="End Date">
                <Input type="date" value={t.endDate} onChange={(e) => {
                  const next = [...tasks]; next[i] = { ...next[i], endDate: e.target.value };
                  updateField("scheduleTasks", next);
                }} />
              </Field>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button
                variant={t.isMilestone ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const next = [...tasks]; next[i] = { ...next[i], isMilestone: !next[i].isMilestone };
                  updateField("scheduleTasks", next);
                }}
              >
                <Milestone className="h-3 w-3 mr-1" />
                {t.isMilestone ? "Milestone" : "Task"}
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateField("scheduleTasks", tasks.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {pack.planningAdaptations.ganttRequired ? "No schedule tasks yet." : "Define sprint cadence and release targets."}
          </p>
        )}
        {!pack.planningAdaptations.ganttRequired && pack.planningAdaptations.sprintCadenceDefault && (
          <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
            Default sprint cadence: <span className="font-medium text-foreground">{pack.planningAdaptations.sprintCadenceDefault} days</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CostPlanForm({ data, updateField }: StepFormProps) {
  const items = data.budgetItems || [];

  const addItem = () => {
    updateField("budgetItems", [...items, { name: "", wbsNodeId: "", category: "", planned: 0, notes: "" }]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Budget Items</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}>+ Add Item</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, i) => (
          <Card key={i} className="p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" required>
                <Input value={item.name} onChange={(e) => {
                  const next = [...items]; next[i] = { ...next[i], name: e.target.value };
                  updateField("budgetItems", next);
                }} />
              </Field>
              <Field label="Category">
                <Input value={item.category} onChange={(e) => {
                  const next = [...items]; next[i] = { ...next[i], category: e.target.value };
                  updateField("budgetItems", next);
                }} placeholder="labor, materials, etc." />
              </Field>
              <Field label="Planned Cost">
                <Input type="number" value={item.planned} onChange={(e) => {
                  const next = [...items]; next[i] = { ...next[i], planned: Number(e.target.value) };
                  updateField("budgetItems", next);
                }} />
              </Field>
              <Field label="Notes">
                <Input value={item.notes} onChange={(e) => {
                  const next = [...items]; next[i] = { ...next[i], notes: e.target.value };
                  updateField("budgetItems", next);
                }} />
              </Field>
            </div>
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateField("budgetItems", items.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No budget items yet.</p>}
        {items.length > 0 && (
          <div className="text-sm font-medium pt-2 border-t">
            Total Planned: ${items.reduce((sum, it) => sum + (it.planned || 0), 0).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QualityPlanForm({ data, updateField }: StepFormProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Quality Plan</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Field label="Quality Standards" required>
          <Textarea value={data.qualityStandards} onChange={(e) => updateField("qualityStandards", e.target.value)} placeholder="Quality standards, metrics, and targets..." rows={3} />
        </Field>
        <Field label="Acceptance Criteria" required>
          <Textarea value={data.acceptanceCriteria} onChange={(e) => updateField("acceptanceCriteria", e.target.value)} placeholder="How will deliverables be accepted?" rows={3} />
        </Field>
        <Field label="Definition of Done">
          <Textarea value={data.definitionOfDone} onChange={(e) => updateField("definitionOfDone", e.target.value)} placeholder="When is a work item considered done?" rows={2} />
        </Field>
        <Field label="Review Workflow">
          <Textarea value={data.reviewWorkflow} onChange={(e) => updateField("reviewWorkflow", e.target.value)} placeholder="QA review process, sign-off chain..." rows={2} />
        </Field>
      </CardContent>
    </Card>
  );
}

function ResourcesPlanForm({ data, updateField }: StepFormProps) {
  const members = data.teamMembers || [];

  const addMember = () => {
    updateField("teamMembers", [
      ...members,
      { name: "", role: "", type: "human", raciR: [], raciA: [], raciC: [], raciI: [] },
    ]);
  };

  const updateMember = (idx: number, field: string, value: unknown) => {
    const next = [...members];
    (next[idx] as any)[field] = value;
    updateField("teamMembers", next);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Team Members & RACI</CardTitle>
          <Button variant="outline" size="sm" onClick={addMember}>+ Add Member</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.map((m, i) => (
          <Card key={i} className="p-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Name" required>
                <Input value={m.name} onChange={(e) => updateMember(i, "name", e.target.value)} />
              </Field>
              <Field label="Role">
                <Input value={m.role} onChange={(e) => updateMember(i, "role", e.target.value)} />
              </Field>
              <Field label="Type">
                <Select value={m.type} onValueChange={(v) => updateMember(i, "type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="human">Human</SelectItem>
                    <SelectItem value="ai_agent">AI Agent</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateField("teamMembers", members.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
        {members.length === 0 && <p className="text-sm text-muted-foreground">No team members yet.</p>}
      </CardContent>
    </Card>
  );
}

function CommunicationsPlanForm({ data, updateField }: StepFormProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Communications Plan</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Field label="Reporting Cadence" required>
          <Input value={data.reportingCadence} onChange={(e) => updateField("reportingCadence", e.target.value)} placeholder="e.g., Weekly status report every Friday" />
        </Field>
        <Field label="Stakeholder Update Frequency">
          <Input value={data.stakeholderUpdateFrequency} onChange={(e) => updateField("stakeholderUpdateFrequency", e.target.value)} placeholder="e.g., Bi-weekly steering committee" />
        </Field>
        <StringListField label="Channels" value={data.channels} onChange={(v) => updateField("channels", v)} placeholder="e.g., Slack #project, email, meetings..." />
        <Field label="Escalation Path" required>
          <Textarea value={data.escalationPath} onChange={(e) => updateField("escalationPath", e.target.value)} placeholder="Level 1: PM → Level 2: Sponsor → Level 3: PMO..." rows={3} />
        </Field>
      </CardContent>
    </Card>
  );
}

function RiskPlanForm({ data, updateField }: StepFormProps) {
  const risks = data.riskRegister || [];

  const addRisk = () => {
    const id = `risk-${Date.now()}`;
    updateField("riskRegister", [
      ...risks,
      { id, title: "", description: "", probability: "medium", impact: "medium", score: 0, owner: "", mitigation: "", contingency: "", status: "open" },
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Risk Register</CardTitle>
          <Button variant="outline" size="sm" onClick={addRisk}>+ Add Risk</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {risks.map((r, i) => (
          <Card key={r.id} className="p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title" required>
                <Input value={r.title} onChange={(e) => {
                  const next = [...risks]; next[i] = { ...next[i], title: e.target.value };
                  updateField("riskRegister", next);
                }} />
              </Field>
              <Field label="Owner">
                <Input value={r.owner} onChange={(e) => {
                  const next = [...risks]; next[i] = { ...next[i], owner: e.target.value };
                  updateField("riskRegister", next);
                }} />
              </Field>
              <Field label="Probability">
                <Select value={r.probability} onValueChange={(v) => {
                  const next = [...risks]; next[i] = { ...next[i], probability: v };
                  updateField("riskRegister", next);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="very_low">Very Low</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="very_high">Very High</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Impact">
                <Select value={r.impact} onValueChange={(v) => {
                  const next = [...risks]; next[i] = { ...next[i], impact: v };
                  updateField("riskRegister", next);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="very_low">Very Low</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="very_high">Very High</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={r.description} onChange={(e) => {
                const next = [...risks]; next[i] = { ...next[i], description: e.target.value };
                updateField("riskRegister", next);
              }} rows={2} />
            </Field>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Field label="Mitigation">
                <Textarea value={r.mitigation} onChange={(e) => {
                  const next = [...risks]; next[i] = { ...next[i], mitigation: e.target.value };
                  updateField("riskRegister", next);
                }} rows={2} />
              </Field>
              <Field label="Contingency">
                <Textarea value={r.contingency} onChange={(e) => {
                  const next = [...risks]; next[i] = { ...next[i], contingency: e.target.value };
                  updateField("riskRegister", next);
                }} rows={2} />
              </Field>
            </div>
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateField("riskRegister", risks.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
        {risks.length === 0 && <p className="text-sm text-muted-foreground">No risks in register yet.</p>}
      </CardContent>
    </Card>
  );
}

function ProcurementPlanForm({ data, updateField }: StepFormProps) {
  const vendors = data.vendors || [];

  const addVendor = () => {
    updateField("vendors", [...vendors, { name: "", contract: "", deliverables: "", risks: "" }]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Procurement Plan</CardTitle>
          <Button variant="outline" size="sm" onClick={addVendor}>+ Add Vendor</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!data.procurementEnabled && (
          <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground">
            Procurement module is disabled. Enable it in Planning Setup to add vendors.
          </div>
        )}
        {data.procurementEnabled && vendors.map((v, i) => (
          <Card key={i} className="p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vendor Name">
                <Input value={v.name} onChange={(e) => {
                  const next = [...vendors]; next[i] = { ...next[i], name: e.target.value };
                  updateField("vendors", next);
                }} />
              </Field>
              <Field label="Contract Type">
                <Input value={v.contract} onChange={(e) => {
                  const next = [...vendors]; next[i] = { ...next[i], contract: e.target.value };
                  updateField("vendors", next);
                }} placeholder="Fixed-price, T&M, etc." />
              </Field>
              <Field label="Deliverables">
                <Input value={v.deliverables} onChange={(e) => {
                  const next = [...vendors]; next[i] = { ...next[i], deliverables: e.target.value };
                  updateField("vendors", next);
                }} />
              </Field>
              <Field label="Risks">
                <Input value={v.risks} onChange={(e) => {
                  const next = [...vendors]; next[i] = { ...next[i], risks: e.target.value };
                  updateField("vendors", next);
                }} />
              </Field>
            </div>
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateField("vendors", vendors.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
        {data.procurementEnabled && vendors.length === 0 && <p className="text-sm text-muted-foreground">No vendors yet.</p>}
      </CardContent>
    </Card>
  );
}

function EngagementPlanForm({ data, updateField }: StepFormProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Stakeholder Engagement Plan</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Field label="Engagement Strategy" required>
          <Textarea value={data.engagementStrategy} onChange={(e) => updateField("engagementStrategy", e.target.value)} placeholder="How will stakeholders be engaged throughout the project?" rows={4} />
        </Field>
        <Field label="Communication Mapping">
          <Textarea value={data.communicationMapping} onChange={(e) => updateField("communicationMapping", e.target.value)} placeholder="Map stakeholders to communication channels and frequency..." rows={3} />
        </Field>
        <Field label="Change Readiness">
          <Textarea value={data.changeReadiness} onChange={(e) => updateField("changeReadiness", e.target.value)} placeholder="Assessment of organizational change readiness..." rows={3} />
        </Field>
      </CardContent>
    </Card>
  );
}

function PmpReviewForm({ data, onSubmitG1, isSubmittingG1, submitG1Error, submitG1Success }: StepFormProps) {
  const pack = getMethodPack(data.methodPackId);
  const artifactChecks = [
    { label: `Scope baseline (${pack.planningAdaptations.scopeLabel})`, ok: !!data.scopeStatement && (pack.planningAdaptations.wbsRequired ? data.wbsNodes.length > 0 : true) },
    { label: `Schedule baseline (${pack.planningAdaptations.scheduleLabel})`, ok: pack.planningAdaptations.ganttRequired ? data.scheduleTasks.length > 0 : true },
    { label: "Cost baseline (budget items)", ok: data.budgetItems.length > 0 },
    { label: "Quality plan", ok: !!data.qualityStandards && !!data.acceptanceCriteria },
    { label: "Resource plan (team members)", ok: data.teamMembers.length > 0 },
    { label: "Communications plan", ok: !!data.reportingCadence && !!data.escalationPath },
    { label: "Risk register", ok: data.riskRegister.length > 0 },
    { label: "Stakeholder engagement plan", ok: !!data.engagementStrategy },
  ];

  if (data.procurementEnabled) {
    artifactChecks.push({ label: "Procurement plan", ok: data.vendors.length > 0 });
  }

  const allReady = artifactChecks.every((c) => c.ok);
  const totalBudget = data.budgetItems.reduce((sum, it) => sum + (it.planned || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">G1 Artifact Checklist</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {artifactChecks.map((check, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {check.ok ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                )}
                <span className={check.ok ? "" : "text-muted-foreground"}>{check.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">PMP Summary</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="font-medium">WBS Nodes:</span> {data.wbsNodes.length}</div>
          <div><span className="font-medium">Schedule Tasks:</span> {data.scheduleTasks.length}</div>
          <div><span className="font-medium">Total Budget:</span> ${totalBudget.toLocaleString()}</div>
          <div><span className="font-medium">Team Members:</span> {data.teamMembers.length}</div>
          <div><span className="font-medium">Risk Register:</span> {data.riskRegister.length} risks</div>
          <div><span className="font-medium">Planning Mode:</span> {data.planningMode}</div>
        </CardContent>
      </Card>

      {data.methodPackId && (
        <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
          Method: <span className="font-medium text-foreground">{pack.methodName}</span> — validation adapted per method pack requirements.
        </div>
      )}

      {submitG1Error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {submitG1Error}
        </div>
      )}

      {submitG1Success ? (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md text-sm text-green-600">
          PMP submitted for G1 authorization. The project has moved to plan_gate_pending.
        </div>
      ) : (
        <Button
          className="w-full"
          onClick={onSubmitG1}
          disabled={!allReady || isSubmittingG1}
        >
          {isSubmittingG1 ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Submit PMP for G1 Authorization
        </Button>
      )}
    </div>
  );
}
