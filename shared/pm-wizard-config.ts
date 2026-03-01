/**
 * PM Wizard Configuration — PMI-Compliant Stepper Schema
 *
 * JSON config that drives the entire project creation wizard.
 * Two phases: A (Initiating → G0) and B (Planning → G1).
 *
 * Each step defines:
 *   - id: unique slug (also used in route)
 *   - label: display name
 *   - phase: "initiating" | "planning"
 *   - pmiGroup: PMI process group
 *   - requiredFields: fields that must be filled to complete the step
 *   - artifacts: artifacts produced by this step
 *   - isGateStep: whether this step is a gate review
 *   - gateId: which gate (G0/G1) if applicable
 */

// ── Step definition ─────────────────────────────────────────────────────────

export interface WizardStepConfig {
  id: string;
  label: string;
  shortLabel: string;
  phase: "initiating" | "planning";
  pmiGroup: "initiating" | "planning";
  description: string;
  requiredFields: string[];
  artifacts: string[];
  isGateStep: boolean;
  gateId?: "G0" | "G1";
  conditional?: string; // only shown if this metadata key is truthy
}

// ── Phase A — Initiating (PM Shell → Charter → G0) ─────────────────────────

export const INITIATING_STEPS: WizardStepConfig[] = [
  {
    id: "method-confirmation",
    label: "Method Selection",
    shortLabel: "Method",
    phase: "initiating",
    pmiGroup: "initiating",
    description: "Confirm or select the project methodology",
    requiredFields: [],
    artifacts: [],
    isGateStep: false,
  },
  {
    id: "start",
    label: "Create PM Shell",
    shortLabel: "Start",
    phase: "initiating",
    pmiGroup: "initiating",
    description: "Basic project identity — name, sponsor, PM, delivery approach",
    requiredFields: ["name", "sponsor", "projectManager", "deliveryApproach", "objective"],
    artifacts: [],
    isGateStep: false,
  },
  {
    id: "business-case",
    label: "Business Case & Value",
    shortLabel: "Business Case",
    phase: "initiating",
    pmiGroup: "initiating",
    description: "Define justification, problem/opportunity, expected value, constraints, assumptions",
    requiredFields: ["businessCase", "problemStatement", "expectedValue"],
    artifacts: [],
    isGateStep: false,
  },
  {
    id: "scope-deliverables",
    label: "High-level Scope & Deliverables",
    shortLabel: "Scope",
    phase: "initiating",
    pmiGroup: "initiating",
    description: "Clarify in-scope, out-of-scope, high-level deliverables, acceptance definition",
    requiredFields: ["inScope", "deliverables"],
    artifacts: [],
    isGateStep: false,
  },
  {
    id: "stakeholders",
    label: "Stakeholders",
    shortLabel: "Stakeholders",
    phase: "initiating",
    pmiGroup: "initiating",
    description: "Identify stakeholders — name, role, influence, interest, engagement level",
    requiredFields: ["stakeholders"],
    artifacts: ["stakeholder_register"],
    isGateStep: false,
  },
  {
    id: "authority",
    label: "Roles, Authority & Governance",
    shortLabel: "Authority",
    phase: "initiating",
    pmiGroup: "initiating",
    description: "Confirm PM authority, decision model, data tier, risk tier, compliance tags",
    requiredFields: ["pmConfirmed", "decisionModel", "riskTier"],
    artifacts: [],
    isGateStep: false,
  },
  {
    id: "risks-milestones",
    label: "High-level Risks & Milestones",
    shortLabel: "Risks",
    phase: "initiating",
    pmiGroup: "initiating",
    description: "Top 5 risks (P×I, owner, mitigation) and high-level milestone targets",
    requiredFields: ["initialRisks"],
    artifacts: [],
    isGateStep: false,
  },
  {
    id: "charter-review",
    label: "Charter Review & Approval (G0)",
    shortLabel: "G0 Gate",
    phase: "initiating",
    pmiGroup: "initiating",
    description: "Review compiled charter, submit for sponsor approval. Gate G0 — Initiation.",
    requiredFields: [],
    artifacts: ["project_charter", "stakeholder_register"],
    isGateStep: true,
    gateId: "G0",
  },
];

// ── Phase B — Planning (PMP Assembly → G1) ──────────────────────────────────

export const PLANNING_STEPS: WizardStepConfig[] = [
  {
    id: "planning-setup",
    label: "Planning Setup",
    shortLabel: "Setup",
    phase: "planning",
    pmiGroup: "planning",
    description: "Choose planning mode, enable optional modules (procurement, worklog, EVM)",
    requiredFields: ["planningMode"],
    artifacts: [],
    isGateStep: false,
  },
  {
    id: "scope-plan",
    label: "Scope Plan & WBS",
    shortLabel: "Scope/WBS",
    phase: "planning",
    pmiGroup: "planning",
    description: "Build WBS tree, map deliverables to WBS nodes. Produces scope baseline.",
    requiredFields: ["scopeStatement", "wbsNodes"],
    artifacts: ["scope_baseline"],
    isGateStep: false,
  },
  {
    id: "schedule-plan",
    label: "Schedule Plan",
    shortLabel: "Schedule",
    phase: "planning",
    pmiGroup: "planning",
    description: "Task network, dependencies, milestones, timeline. Produces schedule baseline.",
    requiredFields: ["scheduleTasks"],
    artifacts: ["schedule_baseline"],
    isGateStep: false,
  },
  {
    id: "cost-plan",
    label: "Cost Plan (Budget)",
    shortLabel: "Budget",
    phase: "planning",
    pmiGroup: "planning",
    description: "Budget breakdown by WBS node, cost categories, funding. Produces cost baseline.",
    requiredFields: ["budgetItems"],
    artifacts: ["cost_baseline"],
    isGateStep: false,
  },
  {
    id: "quality-plan",
    label: "Quality Plan",
    shortLabel: "Quality",
    phase: "planning",
    pmiGroup: "planning",
    description: "Quality standards, acceptance criteria, review workflow, Definition of Done",
    requiredFields: ["qualityStandards", "acceptanceCriteria"],
    artifacts: ["quality_plan"],
    isGateStep: false,
  },
  {
    id: "resources-plan",
    label: "Resources & RACI",
    shortLabel: "Resources",
    phase: "planning",
    pmiGroup: "planning",
    description: "Team members, AI agents, roles, RACI matrix, capacity plan",
    requiredFields: ["teamMembers"],
    artifacts: ["resource_plan"],
    isGateStep: false,
  },
  {
    id: "communications-plan",
    label: "Communications Plan",
    shortLabel: "Comms",
    phase: "planning",
    pmiGroup: "planning",
    description: "Status report cadence, stakeholder updates, channels, escalation ladder",
    requiredFields: ["reportingCadence", "escalationPath"],
    artifacts: ["communications_plan"],
    isGateStep: false,
  },
  {
    id: "risk-plan",
    label: "Risk Management Plan",
    shortLabel: "Risk Plan",
    phase: "planning",
    pmiGroup: "planning",
    description: "Full risk register (P×I), heat map, mitigations linked to tasks",
    requiredFields: ["riskRegister"],
    artifacts: ["risk_register", "risk_plan"],
    isGateStep: false,
  },
  {
    id: "procurement-plan",
    label: "Procurement Plan",
    shortLabel: "Procure",
    phase: "planning",
    pmiGroup: "planning",
    description: "Vendors, contracts, deliverables, acceptance, procurement risks",
    requiredFields: [],
    artifacts: ["procurement_plan"],
    isGateStep: false,
    conditional: "procurementEnabled",
  },
  {
    id: "engagement-plan",
    label: "Stakeholder Engagement Plan",
    shortLabel: "Engage",
    phase: "planning",
    pmiGroup: "planning",
    description: "Engagement strategy, communication mapping, change readiness",
    requiredFields: ["engagementStrategy"],
    artifacts: ["engagement_plan"],
    isGateStep: false,
  },
  {
    id: "pmp-review",
    label: "PMP Review & Authorization (G1)",
    shortLabel: "G1 Gate",
    phase: "planning",
    pmiGroup: "planning",
    description: "Review integrated PMP, validate baselines consistency, submit for G1 authorization.",
    requiredFields: [],
    artifacts: ["project_management_plan"],
    isGateStep: true,
    gateId: "G1",
  },
];

// ── Combined steps ──────────────────────────────────────────────────────────

export const ALL_WIZARD_STEPS = [...INITIATING_STEPS, ...PLANNING_STEPS];

// ── Gate submission payload types ───────────────────────────────────────────

export interface G0SubmissionPayload {
  projectId: number;
  gateId: "G0";
  charter: {
    name: string;
    sponsor: string;
    projectManager: string;
    businessCase: string;
    problemStatement: string;
    expectedValue: string;
    objective: string;
    inScope: string[];
    outOfScope: string[];
    deliverables: string[];
    constraints: string;
    assumptions: string;
    riskTier: string;
    dataTier: string;
    decisionModel: string;
    initialRisks: Array<{ title: string; probability: string; impact: string; owner: string; mitigation: string }>;
    milestones: Array<{ title: string; targetDate: string }>;
  };
  stakeholders: Array<{
    name: string;
    role: string;
    influence: string;
    interest: string;
    engagementLevel: string;
    type: string;
  }>;
  readinessChecklist: {
    sponsorAssigned: boolean;
    pmAssigned: boolean;
    mandatoryFieldsComplete: boolean;
    governanceTierClassified: boolean;
    riskClassificationDone: boolean;
    authorityDefined: boolean;
  };
}

export interface G1SubmissionPayload {
  projectId: number;
  gateId: "G1";
  baselines: {
    scopeBaselineHash: string;
    scheduleBaselineHash: string;
    costBaselineHash: string;
  };
  artifactChecklist: {
    scopeBaseline: boolean;
    scheduleBaseline: boolean;
    costBaseline: boolean;
    riskRegister: boolean;
    qualityPlan: boolean;
    communicationsPlan: boolean;
    resourcePlan: boolean;
    engagementPlan: boolean;
    stakeholderRegister: boolean;
  };
  consistencyChecks: {
    wbsScheduleAligned: boolean;
    scheduleBudgetAligned: boolean;
    riskCoverageAdequate: boolean;
    governanceRequirementsMet: boolean;
  };
}

// ── Wizard data model (persisted as project metadata.wizard) ────────────────

export interface WizardData {
  currentStep: string;
  completedSteps: string[];
  phase: "initiating" | "planning" | "executing";
  methodPackId: string; // method pack ID (empty = DEFAULT_PACK)

  // Phase A — Initiating
  // A0: Start
  name: string;
  sponsor: string;
  projectManager: string;
  deliveryApproach: "predictive" | "agile" | "hybrid";
  objective: string;

  // A1: Business Case
  businessCase: string;
  problemStatement: string;
  expectedValue: string;
  constraints: string;
  assumptions: string;

  // A2: Scope
  inScope: string[];
  outOfScope: string[];
  deliverables: string[];
  acceptanceDefinition: string;

  // A3: Stakeholders
  stakeholders: Array<{
    name: string;
    role: string;
    influence: "low" | "medium" | "high";
    interest: "low" | "medium" | "high";
    engagementLevel: "unaware" | "resistant" | "neutral" | "supportive" | "leading";
    type: "internal" | "external";
    communicationPreference: string;
  }>;

  // A4: Authority
  pmConfirmed: boolean;
  decisionModel: string;
  riskTier: "low" | "medium" | "high" | "critical";
  dataTier: "public" | "internal" | "confidential" | "restricted";
  complianceTags: string[];

  // A5: Risks & Milestones
  initialRisks: Array<{
    title: string;
    probability: "very_low" | "low" | "medium" | "high" | "very_high";
    impact: "very_low" | "low" | "medium" | "high" | "very_high";
    owner: string;
    mitigation: string;
  }>;
  milestones: Array<{ title: string; targetDate: string }>;

  // Phase B — Planning
  // B0: Setup
  planningMode: "predictive" | "agile" | "hybrid";
  procurementEnabled: boolean;
  worklogEnabled: boolean;
  evmEnabled: boolean;

  // B1: Scope Plan
  scopeStatement: string;
  wbsNodes: Array<{ id: string; title: string; parentId: string | null; deliverableId?: string }>;

  // B2: Schedule
  scheduleTasks: Array<{
    id: string;
    title: string;
    wbsNodeId: string;
    startDate: string;
    endDate: string;
    dependencies: string[];
    isMilestone: boolean;
  }>;

  // B3: Cost Plan
  budgetItems: Array<{
    name: string;
    wbsNodeId: string;
    category: string;
    planned: number;
    notes: string;
  }>;

  // B4: Quality
  qualityStandards: string;
  acceptanceCriteria: string;
  definitionOfDone: string;
  reviewWorkflow: string;

  // B5: Resources
  teamMembers: Array<{
    name: string;
    role: string;
    type: "human" | "ai_agent";
    raciR: string[];
    raciA: string[];
    raciC: string[];
    raciI: string[];
  }>;

  // B6: Communications
  reportingCadence: string;
  stakeholderUpdateFrequency: string;
  channels: string[];
  escalationPath: string;

  // B7: Risk Plan
  riskRegister: Array<{
    id: string;
    title: string;
    description: string;
    probability: string;
    impact: string;
    score: number;
    owner: string;
    mitigation: string;
    contingency: string;
    status: string;
    linkedTaskId?: string;
  }>;

  // B8: Procurement (conditional)
  vendors: Array<{ name: string; contract: string; deliverables: string; risks: string }>;

  // B9: Engagement
  engagementStrategy: string;
  communicationMapping: string;
  changeReadiness: string;
}

// ── Default wizard data ─────────────────────────────────────────────────────

export function createDefaultWizardData(): WizardData {
  return {
    currentStep: "method-confirmation",
    completedSteps: [],
    phase: "initiating",
    methodPackId: "",
    name: "", sponsor: "", projectManager: "",
    deliveryApproach: "hybrid", objective: "",
    businessCase: "", problemStatement: "", expectedValue: "",
    constraints: "", assumptions: "",
    inScope: [], outOfScope: [], deliverables: [], acceptanceDefinition: "",
    stakeholders: [],
    pmConfirmed: false, decisionModel: "RACI", riskTier: "medium",
    dataTier: "internal", complianceTags: ["GDPR"],
    initialRisks: [], milestones: [],
    planningMode: "hybrid", procurementEnabled: false,
    worklogEnabled: false, evmEnabled: false,
    scopeStatement: "", wbsNodes: [],
    scheduleTasks: [],
    budgetItems: [],
    qualityStandards: "", acceptanceCriteria: "",
    definitionOfDone: "", reviewWorkflow: "Peer Review → QA Sign-off",
    teamMembers: [],
    reportingCadence: "Weekly", stakeholderUpdateFrequency: "Bi-weekly",
    channels: [], escalationPath: "PM → Sponsor → PMO (3-Level)",
    riskRegister: [],
    vendors: [],
    engagementStrategy: "Active Engagement", communicationMapping: "", changeReadiness: "Medium — Needs Preparation",
  };
}
