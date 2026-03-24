/**
 * WS Wizard — Governance-First Workspace Intake Flow
 *
 * 10-step staged flow across three phases:
 *
 * Manager Phase (Steps 1–7):
 *   1. Identity   — What is this workspace?
 *   2. Purpose    — Why does it exist?
 *   3. Anchor     — What is it organized around?
 *   4. Scope      — What does that anchor specifically mean here?
 *   5. Actors     — Who will participate? (Team from HR + Crew from Catalog)
 *   6. Activities — How will work happen?
 *   7. Needs      — What is needed to succeed?
 *
 * Admin Phase (Step 8):
 *   8. Configuration — How should it be governed and configured?
 *
 * Governance Phase (Steps 9–10):
 *   9.  Review Packet — Is this ready for review?
 *   10. Promotion     — Can it be approved, published, and activated?
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { PageShell } from "@/components/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Save,
  Target,
  Users,
  Bot,
  Briefcase,
  Settings,
  Shield,
  Sparkles,
  Workflow,
  AlertCircle,
  Lock,
  Anchor,
  ScanSearch,
  PackageCheck,
  ArrowUpRight,
  Layers,
  ClipboardCheck,
} from "lucide-react";
import { CatalogAgentSelect, CatalogBotSelect } from "@/components/catalog-selectors";
import { useCatalogAvailableAgents, useCatalogAvailableBots } from "@/hooks/useCatalogAvailable";
import { DirectoryDropdown, type DirectoryEntry } from "@/components/DirectoryDropdown";

// ============================================================================
// Step & Phase Definitions — Governance-First 10-Step Model
// ============================================================================

type WizardStep =
  | "identity"
  | "purpose"
  | "anchor"
  | "scopeDetails"
  | "actors"
  | "activities"
  | "needs"
  | "configuration"
  | "reviewPacket"
  | "promotion";

type WizardPhase = "manager" | "admin" | "governance";

interface StepDef {
  id: WizardStep;
  stepNumber: number;
  label: string;
  phase: WizardPhase;
  question: string;
  governanceHint: string;
}

const STEPS: StepDef[] = [
  // Manager Phase (1–7)
  {
    id: "identity",
    stepNumber: 1,
    label: "Identity",
    phase: "manager",
    question: "Define what this workspace is.",
    governanceHint: "Creates the identifiable object to govern.",
  },
  {
    id: "purpose",
    stepNumber: 2,
    label: "Purpose",
    phase: "manager",
    question: "Define why the workspace exists.",
    governanceHint: "Proves the workspace is not an empty shell.",
  },
  {
    id: "anchor",
    stepNumber: 3,
    label: "Creation Basis / Anchor",
    phase: "manager",
    question: "Define what the workspace is organized around.",
    governanceHint: "Defines structural scope and future policy interpretation.",
  },
  {
    id: "scopeDetails",
    stepNumber: 4,
    label: "Scope Details",
    phase: "manager",
    question: "Capture anchor-specific details.",
    governanceHint: "Makes the structural anchor reviewable and enforceable.",
  },
  {
    id: "actors",
    stepNumber: 5,
    label: "Actors",
    phase: "manager",
    question: "Define who participates.",
    governanceHint: "Defines the participation boundary.",
  },
  {
    id: "activities",
    stepNumber: 6,
    label: "Activities",
    phase: "manager",
    question: "Define how work happens here.",
    governanceHint: "Helps determine configuration and compliance expectations.",
  },
  {
    id: "needs",
    stepNumber: 7,
    label: "Needs",
    phase: "manager",
    question: "Define what users and agents need to succeed.",
    governanceHint: "Handoff between business intent and governed enablement.",
  },
  // Admin Phase (8)
  {
    id: "configuration",
    stepNumber: 8,
    label: "Configuration",
    phase: "admin",
    question: "Translate manager intent into enforceable workspace behavior.",
    governanceHint: "Where the workspace becomes policy-aware and reviewable.",
  },
  // Governance Phase (9–10)
  {
    id: "reviewPacket",
    stepNumber: 9,
    label: "Review Packet",
    phase: "governance",
    question: "Is this ready for review?",
    governanceHint: "Creates the reviewable workspace dossier.",
  },
  {
    id: "promotion",
    stepNumber: 10,
    label: "Promotion",
    phase: "governance",
    question: "Can it be approved, published, and activated?",
    governanceHint: "Lifecycle control — not form filling.",
  },
];

const MANAGER_STEPS = STEPS.filter((s) => s.phase === "manager");
const ADMIN_STEPS = STEPS.filter((s) => s.phase === "admin");
const GOVERNANCE_STEPS = STEPS.filter((s) => s.phase === "governance");

const STEP_ICONS: Record<WizardStep, React.ReactNode> = {
  identity: <Sparkles className="h-4 w-4" />,
  purpose: <Target className="h-4 w-4" />,
  anchor: <Anchor className="h-4 w-4" />,
  scopeDetails: <ScanSearch className="h-4 w-4" />,
  actors: <Users className="h-4 w-4" />,
  activities: <Briefcase className="h-4 w-4" />,
  needs: <Layers className="h-4 w-4" />,
  configuration: <Settings className="h-4 w-4" />,
  reviewPacket: <ClipboardCheck className="h-4 w-4" />,
  promotion: <ArrowUpRight className="h-4 w-4" />,
};

const PHASE_LABELS: Record<WizardPhase, string> = {
  manager: "Manager Phase",
  admin: "Admin Phase",
  governance: "Governance Phase",
};

// ============================================================================
// Anchor Type Options — per governance-first spec
// ============================================================================

const ANCHOR_TYPES = [
  { value: "per_project", label: "Per Project" },
  { value: "per_employee_role", label: "Per Employee Role" },
  { value: "per_hr_position", label: "Per HR Position" },
  { value: "per_company_entity", label: "Per Company Entity" },
  { value: "per_activity", label: "Per Activity" },
  { value: "per_custom_factor", label: "Per Custom Factor" },
  { value: "per_app_module", label: "Per App Module" },
  { value: "per_function", label: "Per Function" },
] as const;

// ============================================================================
// Purpose Type Options — expanded per governance spec
// ============================================================================

const PURPOSE_TYPES = [
  { value: "goal", label: "Goal" },
  { value: "mission", label: "Mission" },
  { value: "project", label: "Project" },
  { value: "team", label: "Team Activity" },
  { value: "research", label: "Research Effort" },
  { value: "operational", label: "Operational Function" },
  { value: "other", label: "Other" },
] as const;

// ============================================================================
// Activity Types — structured options per spec
// ============================================================================

const ACTIVITY_TYPES = [
  "research", "delivery", "monitoring", "support", "analysis",
  "controlled_operations", "development", "review", "planning",
] as const;

const OPERATING_MODES = [
  { value: "collaborative", label: "Collaborative" },
  { value: "autonomous", label: "Autonomous" },
  { value: "supervised", label: "Supervised" },
  { value: "hybrid", label: "Hybrid" },
] as const;

const EXECUTION_STYLES = [
  { value: "manual", label: "Manual" },
  { value: "semi_automated", label: "Semi-Automated" },
  { value: "fully_automated", label: "Fully Automated" },
] as const;

// ============================================================================
// Needs Categories — governance-first structured intake
// ============================================================================

const NEEDS_CATEGORIES = [
  { key: "permissions", label: "Permissions", placeholder: "e.g., Write access to documents" },
  { key: "information", label: "Information", placeholder: "e.g., Access to project specs" },
  { key: "tools", label: "Tools", placeholder: "e.g., Vector DB, Code analyzer" },
  { key: "agents", label: "Agents", placeholder: "e.g., Research assistant, Code reviewer" },
  { key: "resources", label: "Resources", placeholder: "e.g., GPU allocation, Storage" },
  { key: "visibility", label: "Visibility", placeholder: "e.g., Dashboard, Activity feed" },
  { key: "context", label: "Context", placeholder: "e.g., Organization policies, Team structure" },
] as const;

// ============================================================================
// Crew Roles & Types
// ============================================================================

type CrewParticipantType = "agent" | "bot";
type CrewRole = "executor" | "analyst" | "reviewer" | "monitor" | "coordinator" | "advisor";

const CREW_ROLES: { value: CrewRole; label: string }[] = [
  { value: "executor", label: "Executor" },
  { value: "analyst", label: "Analyst" },
  { value: "reviewer", label: "Reviewer" },
  { value: "monitor", label: "Monitor" },
  { value: "coordinator", label: "Coordinator" },
  { value: "advisor", label: "Advisor" },
];

interface CrewEntry {
  participantType: CrewParticipantType;
  participantId: string;
  participantName: string;
  crewRole: CrewRole;
  note: string;
}

// ============================================================================
// Team Member (HR Directory backed)
// ============================================================================

interface TeamMember {
  workerId: number;
  displayName: string;
  role: "owner" | "manager" | "member" | "viewer";
}

// ============================================================================
// WizardData — full governance-first data model
// ============================================================================

interface WizardData {
  // Step 1: Identity
  name: string;
  description: string;
  type: string;
  // Step 2: Purpose
  purposeType: string;
  purposeStatement: string;
  purposeRef: string;
  // Step 3: Anchor
  anchorType: string;
  // Step 4: Scope Details
  anchorRef: string;
  anchorLabel: string;
  anchorMeta: Record<string, string>;
  // Step 5: Actors — Team (HR Directory)
  team: TeamMember[];
  // Step 5: Actors — Crew (AI Catalog)
  crewAgents: CrewEntry[];
  // Step 6: Activities (structured)
  primaryActivityType: string;
  secondaryActivityTypes: string[];
  operatingMode: string;
  executionStyle: string;
  collaborationIntensity: string;
  // Step 7: Needs (structured categories)
  needs: Record<string, string[]>;
  // Step 8: Configuration (admin)
  enabledModules: string[];
  routingProfile: string;
  resourceProfile: string;
  capabilityBundles: string[];
  embeddingModel: string;
  chunkingStrategy: string;
}

// ============================================================================
// Default wizard data factory
// ============================================================================

function createDefaultWizardData(): WizardData {
  return {
    // Step 1: Identity
    name: "",
    description: "",
    type: "team",
    // Step 2: Purpose
    purposeType: "project",
    purposeStatement: "",
    purposeRef: "",
    // Step 3: Anchor
    anchorType: "",
    // Step 4: Scope Details
    anchorRef: "",
    anchorLabel: "",
    anchorMeta: {},
    // Step 5: Actors
    team: [],
    crewAgents: [],
    // Step 6: Activities
    primaryActivityType: "",
    secondaryActivityTypes: [],
    operatingMode: "",
    executionStyle: "",
    collaborationIntensity: "",
    // Step 7: Needs
    needs: {},
    // Step 8: Configuration
    enabledModules: [],
    routingProfile: "AUTO",
    resourceProfile: "",
    capabilityBundles: [],
    embeddingModel: "bge-small-en-v1.5",
    chunkingStrategy: "semantic",
  };
}

// ============================================================================
// Component
// ============================================================================

export default function WSWizardPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // --- Visible steps based on role ---
  const visibleSteps = useMemo<StepDef[]>(() => {
    if (isAdmin) return STEPS;
    return MANAGER_STEPS;
  }, [isAdmin]);

  // --- Wizard state ---
  const [currentStepId, setCurrentStepId] = useState<WizardStep>("identity");
  const [draftId, setDraftId] = useState<number | null>(null);
  const [data, setData] = useState<WizardData>(createDefaultWizardData);

  // --- Crew add-form state ---
  const [newCrewType, setNewCrewType] = useState<CrewParticipantType>("agent");
  const [newCrewId, setNewCrewId] = useState("");
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewRole, setNewCrewRole] = useState<CrewRole>("executor");
  const [newCrewNote, setNewCrewNote] = useState("");

  // --- Needs add-form state (per category) ---
  const [needsInput, setNeedsInput] = useState<Record<string, string>>({});

  // --- Catalog hooks ---
  const { options: agentOptions } = useCatalogAvailableAgents();
  const { options: botOptions } = useCatalogAvailableBots();

  // --- Navigation helpers ---
  const currentStep = STEPS.find((s) => s.id === currentStepId)!;
  const currentIndex = visibleSteps.findIndex((s) => s.id === currentStepId);
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === visibleSteps.length - 1;
  const isManagerFinal = currentStepId === "needs";
  const isAdminFinal = currentStepId === "configuration";

  const goNext = () => {
    if (currentIndex < visibleSteps.length - 1) {
      setCurrentStepId(visibleSteps[currentIndex + 1].id);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentStepId(visibleSteps[currentIndex - 1].id);
    }
  };

  // --- Data helpers ---
  const updateData = (partial: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  };

  const handleCrewSelect = (id: string) => {
    setNewCrewId(id);
    const opts = newCrewType === "agent" ? agentOptions : botOptions;
    const match = opts.find((o) => String(o.id) === id);
    setNewCrewName(match?.label || "");
  };

  const addCrewMember = () => {
    if (!newCrewId) {
      toast.error(`Select ${newCrewType === "agent" ? "an Agent" : "a Bot"} from the catalog`);
      return;
    }
    if (data.crewAgents.some((c) => c.participantId === newCrewId && c.participantType === newCrewType)) {
      toast.error("This participant is already in the crew");
      return;
    }
    updateData({
      crewAgents: [...data.crewAgents, {
        participantType: newCrewType,
        participantId: newCrewId,
        participantName: newCrewName,
        crewRole: newCrewRole,
        note: newCrewNote,
      }],
    });
    setNewCrewId("");
    setNewCrewName("");
    setNewCrewRole("executor");
    setNewCrewNote("");
  };

  const removeCrewMember = (index: number) => {
    updateData({ crewAgents: data.crewAgents.filter((_, i) => i !== index) });
  };

  const addTeamMember = (entry: DirectoryEntry, role: TeamMember["role"]) => {
    if (data.team.some((t) => t.workerId === entry.workerId)) {
      toast.error("This person is already on the team");
      return;
    }
    updateData({
      team: [...data.team, { workerId: entry.workerId, displayName: entry.displayName, role }],
    });
  };

  const removeTeamMember = (index: number) => {
    updateData({ team: data.team.filter((_, i) => i !== index) });
  };

  const addNeedItem = (category: string) => {
    const val = (needsInput[category] || "").trim();
    if (!val) return;
    const current = data.needs[category] || [];
    updateData({ needs: { ...data.needs, [category]: [...current, val] } });
    setNeedsInput((prev) => ({ ...prev, [category]: "" }));
  };

  const removeNeedItem = (category: string, index: number) => {
    const current = data.needs[category] || [];
    updateData({ needs: { ...data.needs, [category]: current.filter((_, i) => i !== index) } });
  };

  // --- Build wizardMeta payload for server ---
  const buildWizardMeta = () => ({
    purposeStatement: data.purposeStatement,
    anchorType: data.anchorType,
    anchorRef: data.anchorRef,
    anchorLabel: data.anchorLabel,
    anchorMeta: data.anchorMeta,
    team: {
      owner: data.team.find((t) => t.role === "owner")
        ? { workerId: data.team.find((t) => t.role === "owner")!.workerId, displayName: data.team.find((t) => t.role === "owner")!.displayName }
        : undefined,
      managers: data.team.filter((t) => t.role === "manager").map((t) => ({ workerId: t.workerId, displayName: t.displayName })),
      members: data.team.filter((t) => t.role === "member").map((t) => ({ workerId: t.workerId, displayName: t.displayName })),
      viewers: data.team.filter((t) => t.role === "viewer").map((t) => ({ workerId: t.workerId, displayName: t.displayName })),
    },
    activities: {
      primaryType: data.primaryActivityType,
      secondaryTypes: data.secondaryActivityTypes,
      operatingMode: data.operatingMode,
      executionStyle: data.executionStyle,
      collaborationIntensity: data.collaborationIntensity,
    },
    needs: data.needs,
    configuration: {
      enabledModules: data.enabledModules,
      routingProfile: data.routingProfile,
      resourceProfile: data.resourceProfile,
      capabilityBundles: data.capabilityBundles,
    },
    lastCompletedStep: currentStep.stepNumber,
    wizardPhase: currentStep.phase,
  });

  const buildCrewPayload = () =>
    data.crewAgents.length > 0
      ? data.crewAgents.map((c) => ({
          participantType: c.participantType as "agent" | "bot",
          participantId: Number(c.participantId) || 0,
          participantName: c.participantName,
          role: c.crewRole,
          note: c.note || undefined,
        }))
      : undefined;

  // --- Mutations ---
  const createMutation = trpc.workspaces.createDraft.useMutation({
    onSuccess: (ws: any) => {
      setDraftId(ws.id);
      toast.success("Draft saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.workspaces.updateDraft.useMutation({
    onSuccess: () => toast.success("Draft saved"),
    onError: (err) => toast.error(err.message),
  });

  const createAndSubmitMutation = trpc.workspaces.createDraft.useMutation({
    onSuccess: (ws: any) => {
      setDraftId(ws.id);
      toast.success("Workspace submitted for review");
      navigate("/ws/list");
    },
    onError: (err) => toast.error(err.message),
  });

  const submitForReviewMutation = trpc.workspaces.submitForReview.useMutation({
    onSuccess: () => {
      toast.success("Workspace submitted for review");
      navigate("/ws/list");
    },
    onError: (err) => toast.error(err.message),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending
    || createAndSubmitMutation.isPending || submitForReviewMutation.isPending;

  // --- Save actions ---
  const saveDraft = () => {
    if (!data.name.trim()) {
      toast.error("Workspace name is required");
      return;
    }
    const wizardMeta = buildWizardMeta();
    if (draftId) {
      updateMutation.mutate({
        id: draftId,
        name: data.name,
        description: data.description,
        type: data.type,
        purposeType: data.purposeType as any,
        purposeRef: data.purposeRef,
        embeddingModel: data.embeddingModel,
        chunkingStrategy: data.chunkingStrategy as any,
        crew: buildCrewPayload(),
        wizardMeta,
      });
    } else {
      createMutation.mutate({
        name: data.name,
        description: data.description,
        type: data.type,
        purposeType: data.purposeType as any,
        purposeRef: data.purposeRef,
        crew: buildCrewPayload(),
        wizardMeta,
      });
    }
  };

  const saveAndSubmitForReview = () => {
    if (!data.name.trim()) {
      toast.error("Workspace name is required");
      return;
    }
    const wizardMeta = buildWizardMeta();
    if (draftId) {
      updateMutation.mutate({
        id: draftId,
        name: data.name,
        description: data.description,
        type: data.type,
        purposeType: data.purposeType as any,
        purposeRef: data.purposeRef,
        embeddingModel: data.embeddingModel,
        chunkingStrategy: data.chunkingStrategy as any,
        crew: buildCrewPayload(),
        wizardMeta,
      }, {
        onSuccess: () => {
          submitForReviewMutation.mutate({ id: draftId! });
        },
      });
    } else {
      createAndSubmitMutation.mutate({
        name: data.name,
        description: data.description,
        type: data.type,
        purposeType: data.purposeType as any,
        purposeRef: data.purposeRef,
        crew: buildCrewPayload(),
        wizardMeta,
        submitForReview: true,
      });
    }
  };

  return (
    <PageShell title="Workspace Wizard" subtitle="Governance-first intake, configuration, review & promotion">
      {/* ================================================================ */}
      {/* TOP HEADER — Always visible: name, status, phase, owner          */}
      {/* ================================================================ */}
      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 mb-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-base font-semibold">
              {data.name || "New Workspace"}
            </h2>
            {data.purposeStatement && (
              <p className="text-xs text-muted-foreground truncate max-w-[300px]">{data.purposeStatement}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">draft</Badge>
          <Badge variant="secondary">{PHASE_LABELS[currentStep.phase]}</Badge>
          {user?.name && (
            <span className="text-xs text-muted-foreground">Owner: {user.name}</span>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* 3-COLUMN LAYOUT: Left Rail | Main Canvas | Right Panel           */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-4">

        {/* ============================================================== */}
        {/* LEFT PHASE RAIL — grouped by phase, shows completion/lock       */}
        {/* ============================================================== */}
        <nav className="space-y-4 hidden lg:block">
          {/* Manager Phase */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 px-1">Manager Phase</p>
            <div className="space-y-0.5">
              {MANAGER_STEPS.map((step) => {
                const isActive = step.id === currentStepId;
                const stepIdx = visibleSteps.findIndex((s) => s.id === step.id);
                const isPast = stepIdx >= 0 && stepIdx < currentIndex;
                const isAccessible = stepIdx >= 0;
                return (
                  <button
                    key={step.id}
                    onClick={() => isAccessible && setCurrentStepId(step.id)}
                    disabled={!isAccessible}
                    className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground font-medium"
                        : isPast
                        ? "text-primary bg-primary/10"
                        : isAccessible
                        ? "text-muted-foreground hover:bg-muted/50"
                        : "text-muted-foreground/40 cursor-not-allowed"
                    }`}
                  >
                    {isPast ? <Check className="h-3 w-3 shrink-0" /> : STEP_ICONS[step.id]}
                    <span className="truncate">{step.stepNumber}. {step.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Admin Phase */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 px-1">Admin Phase</p>
            <div className="space-y-0.5">
              {ADMIN_STEPS.map((step) => {
                const isActive = step.id === currentStepId;
                const stepIdx = visibleSteps.findIndex((s) => s.id === step.id);
                const isPast = stepIdx >= 0 && stepIdx < currentIndex;
                const isLocked = !isAdmin;
                const isAccessible = stepIdx >= 0 && !isLocked;
                return (
                  <button
                    key={step.id}
                    onClick={() => isAccessible && setCurrentStepId(step.id)}
                    disabled={!isAccessible}
                    className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      isLocked
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : isActive
                        ? "bg-primary text-primary-foreground font-medium"
                        : isPast
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {isLocked ? <Lock className="h-3 w-3 shrink-0" /> : isPast ? <Check className="h-3 w-3 shrink-0" /> : STEP_ICONS[step.id]}
                    <span className="truncate">{step.stepNumber}. {step.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Governance Phase */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 px-1">Governance Phase</p>
            <div className="space-y-0.5">
              {GOVERNANCE_STEPS.map((step) => {
                const isActive = step.id === currentStepId;
                const stepIdx = visibleSteps.findIndex((s) => s.id === step.id);
                const isPast = stepIdx >= 0 && stepIdx < currentIndex;
                const isLocked = !isAdmin;
                const isAccessible = stepIdx >= 0 && !isLocked;
                return (
                  <button
                    key={step.id}
                    onClick={() => isAccessible && setCurrentStepId(step.id)}
                    disabled={!isAccessible}
                    className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      isLocked
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : isActive
                        ? "bg-primary text-primary-foreground font-medium"
                        : isPast
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {isLocked ? <Lock className="h-3 w-3 shrink-0" /> : isPast ? <Check className="h-3 w-3 shrink-0" /> : STEP_ICONS[step.id]}
                    <span className="truncate">{step.stepNumber}. {step.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* ============================================================== */}
        {/* MOBILE STEP BAR — horizontal pills (visible on small screens)   */}
        {/* ============================================================== */}
        <div className="lg:hidden flex items-center gap-1 mb-2 overflow-x-auto pb-2 col-span-full">
          {visibleSteps.map((step, i) => {
            const isActive = step.id === currentStepId;
            const isPast = i < currentIndex;
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStepId(step.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isPast
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isPast ? <Check className="h-3 w-3" /> : STEP_ICONS[step.id]}
                {step.stepNumber}
              </button>
            );
          })}
          {!isAdmin && [...ADMIN_STEPS, ...GOVERNANCE_STEPS].map((step) => (
            <span
              key={step.id}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] whitespace-nowrap bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
            >
              <Lock className="h-3 w-3" />{step.stepNumber}
            </span>
          ))}
        </div>

        {/* ============================================================== */}
        {/* MAIN FORM CANVAS                                                */}
        {/* ============================================================== */}
        <div>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {STEP_ICONS[currentStepId]}
                {currentStep.label}
              </CardTitle>
              <CardDescription>{currentStep.question}</CardDescription>
              <p className="text-[11px] text-muted-foreground/70 italic mt-1">
                Governance: {currentStep.governanceHint}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
          {/* ======== Step 1: Identity ======== */}
          {currentStepId === "identity" && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Workspace Name *</label>
                <Input
                  value={data.name}
                  onChange={(e) => updateData({ name: e.target.value })}
                  placeholder="My Workspace"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Textarea
                  value={data.description}
                  onChange={(e) => updateData({ description: e.target.value })}
                  placeholder="What is this workspace about? This should make it easy to review later."
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Workspace Type</label>
                <Select value={data.type} onValueChange={(v) => updateData({ type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="research">Research</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ======== Step 2: Purpose ======== */}
          {currentStepId === "purpose" && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Purpose Type *</label>
                <Select value={data.purposeType} onValueChange={(v) => updateData({ purposeType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PURPOSE_TYPES.map((pt) => (
                      <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Purpose Statement *</label>
                <Textarea
                  value={data.purposeStatement}
                  onChange={(e) => updateData({ purposeStatement: e.target.value })}
                  placeholder="Why does this workspace exist? Describe its reason for being."
                  rows={3}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Purpose is the reason the workspace exists. It is not the same as the structural anchor.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Purpose Reference (optional)</label>
                <Input
                  value={data.purposeRef}
                  onChange={(e) => updateData({ purposeRef: e.target.value })}
                  placeholder="e.g., link to project brief, goal doc, or strategy reference"
                />
              </div>
            </>
          )}

          {/* ======== Step 3: Creation Basis / Anchor ======== */}
          {currentStepId === "anchor" && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Anchor Type *</label>
                <p className="text-xs text-muted-foreground mb-2">
                  What is this workspace organized around? This is different from its purpose.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ANCHOR_TYPES.map((at) => (
                    <button
                      key={at.value}
                      onClick={() => updateData({ anchorType: at.value, anchorRef: "", anchorLabel: "", anchorMeta: {} })}
                      className={`text-left px-3 py-2.5 rounded-md border text-sm transition-colors ${
                        data.anchorType === at.value
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      {at.label}
                    </button>
                  ))}
                </div>
              </div>
              {data.anchorType && (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                  Selected: <strong>{ANCHOR_TYPES.find((a) => a.value === data.anchorType)?.label}</strong>
                  {" "}— scope details will be captured in the next step.
                </div>
              )}
            </>
          )}

          {/* ======== Step 4: Scope Details (dynamic based on anchor) ======== */}
          {currentStepId === "scopeDetails" && (
            <>
              {!data.anchorType ? (
                <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>No anchor type selected. Go back to Step 3 to choose one.</span>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    Provide details for anchor: <strong>{ANCHOR_TYPES.find((a) => a.value === data.anchorType)?.label}</strong>
                  </p>

                  {/* Per Project */}
                  {data.anchorType === "per_project" && (
                    <>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Project Reference *</label>
                        <Input
                          value={data.anchorRef}
                          onChange={(e) => updateData({ anchorRef: e.target.value })}
                          placeholder="Project ID or reference"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Project Name</label>
                        <Input
                          value={data.anchorLabel}
                          onChange={(e) => updateData({ anchorLabel: e.target.value })}
                          placeholder="Human-readable project name"
                        />
                      </div>
                    </>
                  )}

                  {/* Per Employee Role */}
                  {data.anchorType === "per_employee_role" && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">Role Name *</label>
                      <Input
                        value={data.anchorLabel}
                        onChange={(e) => updateData({ anchorLabel: e.target.value })}
                        placeholder="e.g., Senior Analyst, Lead Developer"
                      />
                    </div>
                  )}

                  {/* Per HR Position */}
                  {data.anchorType === "per_hr_position" && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">HR Position *</label>
                      <Input
                        value={data.anchorLabel}
                        onChange={(e) => updateData({ anchorLabel: e.target.value })}
                        placeholder="Position title from HR system"
                      />
                    </div>
                  )}

                  {/* Per Company Entity */}
                  {data.anchorType === "per_company_entity" && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">Entity Name *</label>
                      <Input
                        value={data.anchorLabel}
                        onChange={(e) => updateData({ anchorLabel: e.target.value })}
                        placeholder="e.g., Legal Division, R&D Department"
                      />
                    </div>
                  )}

                  {/* Per Activity */}
                  {data.anchorType === "per_activity" && (
                    <>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Activity Type *</label>
                        <Input
                          value={data.anchorLabel}
                          onChange={(e) => updateData({ anchorLabel: e.target.value })}
                          placeholder="e.g., Compliance Review, Data Analysis"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Operational Area</label>
                        <Input
                          value={data.anchorRef}
                          onChange={(e) => updateData({ anchorRef: e.target.value })}
                          placeholder="e.g., Finance, Engineering"
                        />
                      </div>
                    </>
                  )}

                  {/* Per Custom Factor */}
                  {data.anchorType === "per_custom_factor" && (
                    <>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Custom Label *</label>
                        <Input
                          value={data.anchorLabel}
                          onChange={(e) => updateData({ anchorLabel: e.target.value })}
                          placeholder="Label for this organizing factor"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Custom Value *</label>
                        <Input
                          value={data.anchorRef}
                          onChange={(e) => updateData({ anchorRef: e.target.value })}
                          placeholder="Value or identifier"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Explanation</label>
                        <Textarea
                          value={data.anchorMeta.explanation || ""}
                          onChange={(e) => updateData({ anchorMeta: { ...data.anchorMeta, explanation: e.target.value } })}
                          placeholder="Why is this the right organizing factor?"
                          rows={2}
                        />
                      </div>
                    </>
                  )}

                  {/* Per App Module */}
                  {data.anchorType === "per_app_module" && (
                    <>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Module Name *</label>
                        <Input
                          value={data.anchorLabel}
                          onChange={(e) => updateData({ anchorLabel: e.target.value })}
                          placeholder="e.g., Chat, Documents, Agents"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Module Preset Rationale</label>
                        <Input
                          value={data.anchorRef}
                          onChange={(e) => updateData({ anchorRef: e.target.value })}
                          placeholder="Why this module is the anchor"
                        />
                      </div>
                    </>
                  )}

                  {/* Per Function */}
                  {data.anchorType === "per_function" && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">Function Name *</label>
                      <Input
                        value={data.anchorLabel}
                        onChange={(e) => updateData({ anchorLabel: e.target.value })}
                        placeholder="e.g., Risk Management, Talent Acquisition"
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ======== Step 5: Actors (Team + Crew) ======== */}
          {currentStepId === "actors" && (
            <>
              {/* ---- Team (Human Participants — HR Directory) ---- */}
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Users className="h-4 w-4" /> Team (Human Participants)
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Select team members from the HR Directory. Only active employees are available.
                </p>

                {/* Add team member form */}
                <div className="space-y-3 rounded-md border p-3 mb-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">Select Employee</label>
                    <DirectoryDropdown
                      statusFilter="active"
                      placeholder="Search HR Directory..."
                      onSelect={(entry) => addTeamMember(entry, "member")}
                      className="w-full"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Adds as Member by default. Change role after adding.
                  </p>
                </div>

                {/* Team list */}
                {data.team.length === 0 ? (
                  <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>No team members added yet. Use the HR Directory picker above.</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {data.team.map((member, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50">
                        <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{member.displayName}</span>
                        <Select
                          value={member.role}
                          onValueChange={(v) => {
                            const updated = [...data.team];
                            updated[i] = { ...updated[i], role: v as TeamMember["role"] };
                            updateData({ team: updated });
                          }}
                        >
                          <SelectTrigger className="h-6 w-[100px] text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          className="text-xs text-destructive ml-auto shrink-0"
                          onClick={() => removeTeamMember(i)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Owner warning */}
                {data.team.length > 0 && !data.team.some((t) => t.role === "owner") && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    No owner assigned. Set one team member's role to Owner.
                  </div>
                )}
              </div>

              {/* ---- Crew (AI Participants — Catalog-backed) ---- */}
              <div className="mt-6 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Bot className="h-4 w-4" /> Crew (AI Participants)
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Select AI participants from the governed catalog. Only approved and activated Agents/Bots are available.
                </p>

                {/* Add crew member form */}
                <div className="space-y-3 rounded-md border p-3 mb-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">AI Participant Type</label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={newCrewType === "agent" ? "default" : "outline"}
                        onClick={() => { setNewCrewType("agent"); setNewCrewId(""); setNewCrewName(""); }}
                      >
                        <Workflow className="h-3 w-3 mr-1" /> Agent
                      </Button>
                      <Button
                        size="sm"
                        variant={newCrewType === "bot" ? "default" : "outline"}
                        onClick={() => { setNewCrewType("bot"); setNewCrewId(""); setNewCrewName(""); }}
                      >
                        <Bot className="h-3 w-3 mr-1" /> Bot
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1 block">
                      {newCrewType === "agent" ? "Select Agent" : "Select Bot"}
                    </label>
                    {newCrewType === "agent" ? (
                      <CatalogAgentSelect
                        value={newCrewId}
                        onValueChange={handleCrewSelect}
                        searchable
                      />
                    ) : (
                      <CatalogBotSelect
                        value={newCrewId}
                        onValueChange={handleCrewSelect}
                        searchable
                      />
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1 block">Crew Role</label>
                    <Select value={newCrewRole} onValueChange={(v) => setNewCrewRole(v as CrewRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CREW_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1 block">Mission Note (optional)</label>
                    <Input
                      value={newCrewNote}
                      onChange={(e) => setNewCrewNote(e.target.value)}
                      placeholder="e.g., Handle code review for PRs"
                    />
                  </div>

                  <Button size="sm" onClick={addCrewMember}>
                    Add to Crew
                  </Button>
                </div>

                {/* Crew list */}
                {data.crewAgents.length === 0 ? (
                  <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      No AI participants added yet. Select an Agent or Bot from the catalog above.
                      If none are available, first add and approve them in AI Types / Catalog.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {data.crewAgents.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50">
                        {entry.participantType === "agent" ? (
                          <Workflow className="h-3 w-3 text-muted-foreground shrink-0" />
                        ) : (
                          <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate">{entry.participantName || `#${entry.participantId}`}</span>
                        <Badge variant="outline" className="text-[10px]">{entry.participantType}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{entry.crewRole}</Badge>
                        {entry.note && (
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={entry.note}>
                            {entry.note}
                          </span>
                        )}
                        <button
                          className="text-xs text-destructive ml-auto shrink-0"
                          onClick={() => removeCrewMember(i)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ======== Step 6: Activities (Structured) ======== */}
          {currentStepId === "activities" && (
            <>
              {/* Primary Activity Type */}
              <div>
                <label className="text-sm font-medium mb-1 block">Primary Activity Type *</label>
                <Select value={data.primaryActivityType} onValueChange={(v) => updateData({ primaryActivityType: v })}>
                  <SelectTrigger><SelectValue placeholder="Select primary activity..." /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map((at) => (
                      <SelectItem key={at} value={at}>
                        {at.charAt(0).toUpperCase() + at.slice(1).replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Secondary Activity Types */}
              <div>
                <label className="text-sm font-medium mb-1 block">Secondary Activity Types</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {ACTIVITY_TYPES.filter((at) => at !== data.primaryActivityType).map((at) => {
                    const isSelected = data.secondaryActivityTypes.includes(at);
                    return (
                      <button
                        key={at}
                        onClick={() => {
                          if (isSelected) {
                            updateData({ secondaryActivityTypes: data.secondaryActivityTypes.filter((s) => s !== at) });
                          } else {
                            updateData({ secondaryActivityTypes: [...data.secondaryActivityTypes, at] });
                          }
                        }}
                        className={`px-2 py-1 rounded text-xs transition-colors ${
                          isSelected
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "bg-muted text-muted-foreground border border-transparent hover:bg-muted/80"
                        }`}
                      >
                        {at.charAt(0).toUpperCase() + at.slice(1).replace(/_/g, " ")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Operating Mode */}
              <div>
                <label className="text-sm font-medium mb-1 block">Operating Mode</label>
                <Select value={data.operatingMode} onValueChange={(v) => updateData({ operatingMode: v })}>
                  <SelectTrigger><SelectValue placeholder="Select mode..." /></SelectTrigger>
                  <SelectContent>
                    {OPERATING_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Execution Style */}
              <div>
                <label className="text-sm font-medium mb-1 block">Execution Style</label>
                <Select value={data.executionStyle} onValueChange={(v) => updateData({ executionStyle: v })}>
                  <SelectTrigger><SelectValue placeholder="Select style..." /></SelectTrigger>
                  <SelectContent>
                    {EXECUTION_STYLES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Collaboration Intensity */}
              <div>
                <label className="text-sm font-medium mb-1 block">Collaboration / Automation Emphasis</label>
                <Select value={data.collaborationIntensity} onValueChange={(v) => updateData({ collaborationIntensity: v })}>
                  <SelectTrigger><SelectValue placeholder="Select emphasis..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low — mostly independent</SelectItem>
                    <SelectItem value="medium">Medium — regular collaboration</SelectItem>
                    <SelectItem value="high">High — tight collaboration</SelectItem>
                    <SelectItem value="automation_heavy">Automation-heavy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ======== Step 7: Needs (Structured Categories) ======== */}
          {currentStepId === "needs" && (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                Declare what users and agents need to succeed. This is the final manager intent step — admin will later translate these into governed configuration.
              </p>
              {NEEDS_CATEGORIES.map((cat) => {
                const items = data.needs[cat.key] || [];
                const inputVal = needsInput[cat.key] || "";
                return (
                  <div key={cat.key} className="space-y-1.5">
                    <label className="text-sm font-medium block">{cat.label}</label>
                    <div className="flex gap-2">
                      <Input
                        value={inputVal}
                        onChange={(e) => setNeedsInput((prev) => ({ ...prev, [cat.key]: e.target.value }))}
                        placeholder={cat.placeholder}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addNeedItem(cat.key); }
                        }}
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addNeedItem(cat.key)}
                      >
                        Add
                      </Button>
                    </div>
                    {items.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {items.map((item, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs"
                          >
                            {item}
                            <button
                              className="text-destructive hover:text-destructive/80 ml-0.5"
                              onClick={() => removeNeedItem(cat.key, i)}
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* ======== Step 8: Configuration (Admin) ======== */}
          {currentStepId === "configuration" && isAdmin && (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Embedding Model</label>
                <Select value={data.embeddingModel} onValueChange={(v) => setData({ ...data, embeddingModel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bge-small-en-v1.5">BGE Small EN v1.5</SelectItem>
                    <SelectItem value="bge-base-en-v1.5">BGE Base EN v1.5</SelectItem>
                    <SelectItem value="all-MiniLM-L6-v2">All-MiniLM-L6-v2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Chunking Strategy</label>
                <Select value={data.chunkingStrategy} onValueChange={(v) => setData({ ...data, chunkingStrategy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semantic">Semantic</SelectItem>
                    <SelectItem value="fixed">Fixed Size</SelectItem>
                    <SelectItem value="recursive">Recursive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ======== Step 9: Review Packet (Governance) ======== */}
          {currentStepId === "reviewPacket" && isAdmin && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Name:</span> {data.name || "—"}</div>
                <div><span className="text-muted-foreground">Type:</span> {data.type}</div>
                <div><span className="text-muted-foreground">Purpose:</span> {data.purposeType}</div>
                <div><span className="text-muted-foreground">Ref:</span> {data.purposeRef || "—"}</div>
              </div>
              {data.description && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Description:</span> {data.description}
                </div>
              )}
              {data.crewAgents.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground block mb-1">Crew:</span>
                  <div className="space-y-1 ml-2">
                    {data.crewAgents.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        {a.participantType === "agent" ? <Workflow className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                        <span>{a.participantName || `#${a.participantId}`}</span>
                        <Badge variant="outline" className="text-[10px]">{a.participantType}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{a.crewRole}</Badge>
                        {a.note && <span className="text-muted-foreground">— {a.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.activities.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Activities:</span>{" "}
                  {data.activities.join(", ")}
                </div>
              )}
              {data.needs.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Needs:</span>{" "}
                  {data.needs.join(", ")}
                </div>
              )}
            </div>
          )}
        </CardContent>
          </Card>

          {/* Footer Actions — [ Previous ] [ Save as Draft ] [ Next / Submit ] */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={goPrev} disabled={isFirst}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button variant="outline" onClick={saveDraft} disabled={isSaving}>
              <Save className="h-4 w-4 mr-1" /> {isSaving ? "Saving..." : "Save as Draft"}
            </Button>
            {isAdminFinal && isAdmin ? (
              <Button onClick={saveAndSubmitForReview} disabled={isSaving}>
                <Shield className="h-4 w-4 mr-1" /> Save as Ready for Review
              </Button>
            ) : isLast ? (
              <span />
            ) : (
              <Button onClick={goNext}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* RIGHT COMPLIANCE PANEL — live readiness view (Phase 5)          */}
        {/* ============================================================== */}
        <aside className="hidden lg:block space-y-3">
          <div className="rounded-lg border bg-card p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Readiness
            </h3>
            {/* Draft readiness checks */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                {data.name ? <Check className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                <span className={data.name ? "text-muted-foreground" : ""}>Identity complete</span>
              </div>
              <div className="flex items-center gap-1.5">
                {data.purposeType && data.purposeStatement ? <Check className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                <span className={data.purposeType && data.purposeStatement ? "text-muted-foreground" : ""}>Purpose complete</span>
              </div>
              <div className="flex items-center gap-1.5">
                {data.anchorType ? <Check className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                <span className={data.anchorType ? "text-muted-foreground" : ""}>Anchor complete</span>
              </div>
              <div className="flex items-center gap-1.5">
                {data.team.some((t) => t.role === "owner") ? <Check className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                <span className={data.team.some((t) => t.role === "owner") ? "text-muted-foreground" : ""}>Owner assigned</span>
              </div>
              <div className="flex items-center gap-1.5">
                {data.team.length > 0 || data.crewAgents.length > 0 ? <Check className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                <span className={data.team.length > 0 || data.crewAgents.length > 0 ? "text-muted-foreground" : ""}>Team/Crew valid</span>
              </div>
              <div className="flex items-center gap-1.5">
                {data.primaryActivityType ? <Check className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                <span className={data.primaryActivityType ? "text-muted-foreground" : ""}>Activities defined</span>
              </div>
              <div className="flex items-center gap-1.5">
                {Object.values(data.needs).some((arr) => arr.length > 0) ? <Check className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                <span className={Object.values(data.needs).some((arr) => arr.length > 0) ? "text-muted-foreground" : ""}>Needs declared</span>
              </div>
            </div>

            {/* Review readiness — admin */}
            {isAdmin && (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">
                  Review Readiness
                </h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    {data.enabledModules.length > 0 ? <Check className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-amber-500" />}
                    <span className={data.enabledModules.length > 0 ? "text-muted-foreground" : ""}>Configuration complete</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Current step info */}
          <div className="rounded-lg border bg-card p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Current Step
            </h3>
            <p className="text-xs">{currentStep.stepNumber}. {currentStep.label}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{currentStep.question}</p>
          </div>
        </aside>

      </div>{/* end 3-column grid */}
    </PageShell>
  );
}
