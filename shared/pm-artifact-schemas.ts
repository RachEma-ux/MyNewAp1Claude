/**
 * PM Artifact Schemas — Production-grade type definitions for all PMI artifacts
 *
 * Each schema defines required fields, validation rules, and cross-reference anchors.
 * Used by the Idea-to-PMI Builder Agent and the validation library.
 */

// ── Validation Severity ─────────────────────────────────────────────────────

export type ValidationSeverity = "blocker" | "critical" | "major" | "minor";

export interface ValidationIssue {
  field: string;
  rule: string;
  severity: ValidationSeverity;
  message: string;
  artifactType: string;
  crossRef?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  score: number; // 0-100
  blockerCount: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
}

// ── 1. Scope Statement ──────────────────────────────────────────────────────

export interface ScopeStatement {
  artifactType: "scope_statement";
  projectName: string;
  projectObjective: string;
  problemStatement: string;
  businessJustification: string;
  inScope: string[];
  outOfScope: string[];
  deliverables: Array<{
    id: string;
    name: string;
    description: string;
    acceptanceCriteria: string;
    wbsRef?: string;
  }>;
  constraints: string[];
  assumptions: string[];
  boundaries: string[];
  successCriteria: string[];
  generatedAt: string;
  generatedBy: string;
}

// ── 2. Project Charter ──────────────────────────────────────────────────────

export interface ProjectCharter {
  artifactType: "project_charter";
  projectName: string;
  projectId?: string;
  version: string;
  sponsor: string;
  projectManager: string;
  objective: string;
  businessCase: string;
  problemStatement: string;
  expectedValue: string[];
  inScope: string[];
  outOfScope: string[];
  deliverables: string[];
  constraints: string[];
  assumptions: string[];
  milestones: Array<{
    id: string;
    name: string;
    targetDate: string;
    description: string;
  }>;
  initialRisks: Array<{
    id: string;
    title: string;
    probability: "low" | "medium" | "high";
    impact: "low" | "medium" | "high";
    mitigation: string;
  }>;
  authorityLevel: string;
  decisionModel: string;
  riskTier: "low" | "medium" | "high" | "critical";
  dataTier: string;
  approvalRequirements: string[];
  generatedAt: string;
  generatedBy: string;
}

// ── 3. Stakeholder Register ─────────────────────────────────────────────────

export interface StakeholderEntry {
  id: string;
  name: string;
  role: string;
  organization: string;
  influence: "low" | "medium" | "high";
  interest: "low" | "medium" | "high";
  engagementLevel: "unaware" | "resistant" | "neutral" | "supportive" | "leading";
  communicationPreference: string;
  expectations: string;
  type: "internal" | "external";
}

export interface StakeholderRegister {
  artifactType: "stakeholder_register";
  stakeholders: StakeholderEntry[];
  totalCount: number;
  byInfluence: { high: number; medium: number; low: number };
  byInterest: { high: number; medium: number; low: number };
  generatedAt: string;
  generatedBy: string;
}

// ── 4. WBS (Work Breakdown Structure) ───────────────────────────────────────

export interface WbsNode {
  id: string;
  code: string; // e.g. "1.2.3"
  name: string;
  description: string;
  level: number;
  parentId: string | null;
  children: string[]; // child IDs
  deliverableRef?: string;
  isWorkPackage: boolean;
  estimatedEffortHours?: number;
  assignmentType?: "human" | "ai" | "hybrid";
}

export interface Wbs {
  artifactType: "wbs";
  projectName: string;
  rootNodeId: string;
  nodes: WbsNode[];
  totalNodes: number;
  maxDepth: number;
  workPackageCount: number;
  phases: string[];
  generatedAt: string;
  generatedBy: string;
}

// ── 5. Schedule Baseline ────────────────────────────────────────────────────

export interface ScheduleTask {
  id: string;
  wbsRef: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  dependencies: Array<{
    taskId: string;
    type: "FS" | "FF" | "SS" | "SF"; // Finish-Start, Finish-Finish, etc.
    lag: number;
  }>;
  milestone: boolean;
  assignmentType: "human" | "ai" | "hybrid";
  criticalPath: boolean;
  floatDays: number;
}

export interface ScheduleBaseline {
  artifactType: "schedule_baseline";
  projectName: string;
  startDate: string;
  endDate: string;
  totalDurationDays: number;
  tasks: ScheduleTask[];
  milestones: Array<{ id: string; name: string; date: string }>;
  criticalPathLength: number;
  totalTaskCount: number;
  generatedAt: string;
  generatedBy: string;
}

// ── 6. Cost Baseline ────────────────────────────────────────────────────────

export interface CostLineItem {
  id: string;
  wbsRef: string;
  category: "labor" | "materials" | "equipment" | "services" | "travel" | "contingency" | "overhead";
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  currency: string;
  phase: string;
}

export interface CostBaseline {
  artifactType: "cost_baseline";
  projectName: string;
  currency: string;
  budgetEnvelope: number;
  totalEstimatedCost: number;
  contingencyPercent: number;
  contingencyAmount: number;
  managementReservePercent: number;
  managementReserveAmount: number;
  lineItems: CostLineItem[];
  byCategory: Record<string, number>;
  byPhase: Record<string, number>;
  budgetVariance: number;
  budgetUtilization: number;
  generatedAt: string;
  generatedBy: string;
}

// ── 7. Risk Register ────────────────────────────────────────────────────────

export interface RiskEntry {
  id: string;
  title: string;
  description: string;
  category: "technical" | "schedule" | "cost" | "resource" | "scope" | "quality" | "external" | "organizational";
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  riskScore: number; // probability * impact (1-9 scale)
  owner: string;
  mitigation: string;
  contingency: string;
  trigger: string;
  status: "identified" | "assessed" | "mitigated" | "closed" | "accepted";
  wbsRef?: string;
  responseStrategy: "avoid" | "transfer" | "mitigate" | "accept" | "escalate";
}

export interface RiskRegister {
  artifactType: "risk_register";
  projectName: string;
  riskTier: "low" | "medium" | "high" | "critical";
  risks: RiskEntry[];
  totalRisks: number;
  heatMap: {
    high_high: number;
    high_medium: number;
    high_low: number;
    medium_high: number;
    medium_medium: number;
    medium_low: number;
    low_high: number;
    low_medium: number;
    low_low: number;
  };
  topRisks: string[];
  mitigationCoveragePercent: number;
  generatedAt: string;
  generatedBy: string;
}

// ── 8. Communications Plan ──────────────────────────────────────────────────

export interface CommunicationItem {
  id: string;
  name: string;
  purpose: string;
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "ad_hoc" | "milestone";
  format: "meeting" | "email" | "report" | "dashboard" | "presentation" | "chat";
  audience: string[];
  owner: string;
  stakeholderRef: string[];
  deliverable: string;
  channel: string;
}

export interface CommunicationsPlan {
  artifactType: "communications_plan";
  projectName: string;
  communications: CommunicationItem[];
  escalationPath: Array<{
    level: number;
    role: string;
    responseTime: string;
    criteria: string;
  }>;
  reportingCadence: string;
  totalItems: number;
  generatedAt: string;
  generatedBy: string;
}

// ── 9. Quality Plan ─────────────────────────────────────────────────────────

export interface QualityStandard {
  id: string;
  name: string;
  description: string;
  metric: string;
  target: string;
  measurementMethod: string;
  frequency: string;
  owner: string;
}

export interface QualityPlan {
  artifactType: "quality_plan";
  projectName: string;
  qualityObjective: string;
  standards: QualityStandard[];
  acceptanceCriteria: Array<{
    id: string;
    deliverableRef: string;
    criterion: string;
    verificationMethod: string;
  }>;
  definitionOfDone: string[];
  reviewProcess: {
    type: string;
    frequency: string;
    participants: string[];
    approvalRequired: boolean;
  };
  totalStandards: number;
  totalCriteria: number;
  generatedAt: string;
  generatedBy: string;
}

// ── 10. Change Control Plan ─────────────────────────────────────────────────

export interface ChangeControlPlan {
  artifactType: "change_control_plan";
  projectName: string;
  changeProcess: Array<{
    step: number;
    name: string;
    description: string;
    responsible: string;
    timeframe: string;
  }>;
  changeCategories: Array<{
    category: string;
    approvalAuthority: string;
    impactThreshold: string;
  }>;
  changeBoard: Array<{
    role: string;
    name: string;
    voteWeight: number;
  }>;
  baselineTypes: string[];
  configurationManagement: {
    versioningScheme: string;
    storageLocation: string;
    auditTrail: boolean;
  };
  generatedAt: string;
  generatedBy: string;
}

// ── 11. Gate Readiness Report ───────────────────────────────────────────────

export interface ReadinessCheckItem {
  id: string;
  category: string;
  item: string;
  status: "pass" | "fail" | "warn" | "na";
  evidence: string;
  artifactRef: string;
  severity: ValidationSeverity;
  note: string;
}

export interface GateReadinessReport {
  artifactType: "gate_readiness_report";
  projectName: string;
  gateId: string;
  phase: string;
  checks: ReadinessCheckItem[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    warn: number;
    na: number;
    readinessScore: number;
    ready: boolean;
    blockers: string[];
  };
  crossArtifactConsistency: {
    scopeToWbs: boolean;
    wbsToSchedule: boolean;
    scheduleToCost: boolean;
    riskToWbs: boolean;
    stakeholderToComms: boolean;
    charterToScope: boolean;
  };
  recommendation: "proceed" | "conditional" | "not_ready";
  generatedAt: string;
  generatedBy: string;
}

// ── Idea Builder Input ──────────────────────────────────────────────────────

export interface IdeaBuilderInput {
  ideaText: string;
  budgetEnvelope?: number;
  deadline?: string;
  riskTier?: "low" | "medium" | "high" | "critical";
  methodology?: "predictive" | "agile" | "hybrid";
}

// ── Artifact Type Union ─────────────────────────────────────────────────────

export type PmArtifact =
  | ScopeStatement
  | ProjectCharter
  | StakeholderRegister
  | Wbs
  | ScheduleBaseline
  | CostBaseline
  | RiskRegister
  | CommunicationsPlan
  | QualityPlan
  | ChangeControlPlan
  | GateReadinessReport;

export const ALL_ARTIFACT_TYPES = [
  "scope_statement",
  "project_charter",
  "stakeholder_register",
  "wbs",
  "schedule_baseline",
  "cost_baseline",
  "risk_register",
  "communications_plan",
  "quality_plan",
  "change_control_plan",
  "gate_readiness_report",
] as const;

export type ArtifactTypeName = typeof ALL_ARTIFACT_TYPES[number];

// ── Schema Registry ─────────────────────────────────────────────────────────

export const ARTIFACT_REQUIRED_FIELDS: Record<ArtifactTypeName, string[]> = {
  scope_statement: ["projectName", "projectObjective", "inScope", "deliverables", "constraints", "assumptions"],
  project_charter: ["projectName", "sponsor", "projectManager", "objective", "businessCase", "deliverables", "milestones"],
  stakeholder_register: ["stakeholders"],
  wbs: ["projectName", "rootNodeId", "nodes"],
  schedule_baseline: ["projectName", "startDate", "endDate", "tasks"],
  cost_baseline: ["projectName", "currency", "totalEstimatedCost", "lineItems"],
  risk_register: ["projectName", "riskTier", "risks"],
  communications_plan: ["projectName", "communications", "escalationPath"],
  quality_plan: ["projectName", "qualityObjective", "standards", "acceptanceCriteria", "definitionOfDone"],
  change_control_plan: ["projectName", "changeProcess", "changeCategories"],
  gate_readiness_report: ["projectName", "gateId", "checks", "summary"],
};
