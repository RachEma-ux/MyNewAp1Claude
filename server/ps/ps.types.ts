/**
 * PS Module — Types
 */

export type PsSystemStatus = "draft" | "active" | "archived";

export interface CreateSystemInput {
  workspaceId: number;
  name: string;
  description?: string;
  systemType: string;
  lifecycleType?: string;
  governanceProfile?: string;
}

export interface CreateWizardRunInput {
  workspaceId: number;
  scenarioText: string;
  inputPayload?: Record<string, unknown>;
  resultPayload?: Record<string, unknown>;
  confidence?: number;
  selectedSystemType?: string;
  matrixVersion?: string;
}

// ── Classification Dimensions ─────────────────────────────────────────

export const PS_DOMAINS = [
  "software",
  "infrastructure",
  "business_process",
  "organizational_change",
  "construction",
  "research",
] as const;
export type PsDomain = (typeof PS_DOMAINS)[number];

export const PS_ORG_LEVELS = [
  "team",
  "department",
  "program",
  "portfolio",
  "enterprise",
] as const;
export type PsOrgLevel = (typeof PS_ORG_LEVELS)[number];

export const PS_CRITICALITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type PsCriticality = (typeof PS_CRITICALITIES)[number];

export const PS_DELIVERY_STYLES = [
  "waterfall",
  "agile",
  "hybrid",
  "continuous",
  "phased",
] as const;
export type PsDeliveryStyle = (typeof PS_DELIVERY_STYLES)[number];

export const PS_VALUE_ORIENTATIONS = [
  "cost_reduction",
  "revenue_growth",
  "compliance",
  "innovation",
  "efficiency",
  "customer_experience",
] as const;
export type PsValueOrientation = (typeof PS_VALUE_ORIENTATIONS)[number];

export const PS_LIFECYCLE_FOCUSES = [
  "initiation",
  "planning",
  "execution",
  "monitoring",
  "closure",
  "product",
  "operations",
] as const;
export type PsLifecycleFocus = (typeof PS_LIFECYCLE_FOCUSES)[number];

export interface ClassificationDimensions {
  domain: PsDomain;
  orgLevel: PsOrgLevel;
  criticality: PsCriticality;
  deliveryStyle: PsDeliveryStyle;
  valueOrientation: PsValueOrientation;
  lifecycleFocus: PsLifecycleFocus;
}

// ── Classification Result ─────────────────────────────────────────────

export const PS_SYSTEM_TYPES = [
  "PROJECT_GOVERNANCE",
  "SOFTWARE_DELIVERY",
  "PROGRAM_MANAGEMENT",
  "AGILE_PRODUCT",
  "OPERATIONS_IMPROVEMENT",
] as const;
export type PsSystemType = (typeof PS_SYSTEM_TYPES)[number];

export interface ClassificationInput {
  scenarioText: string;
  dimensions: ClassificationDimensions;
}

export interface ClassificationResult {
  systemType: PsSystemType;
  confidence: number;
  matchedDimensions: string[];
  reasoning: string[];
}

// ── Resource Request (Demand) ────────────────────────────────────────

export const PS_RESOURCE_REQUEST_STATUSES = [
  "draft",
  "open",
  "partially_filled",
  "filled",
  "closed",
] as const;
export type PsResourceRequestStatus = (typeof PS_RESOURCE_REQUEST_STATUSES)[number];

export interface CreateResourceRequestInput {
  workspaceId: number;
  psSystemId: number;
  role: string;
  capabilityTags?: string[];
  quantity?: number;
  seniorityLevel?: string;
  startDate?: Date;
  endDate?: Date;
  allocationPercentage?: number;
}

export interface DemandRoleSpec {
  role: string;
  capabilityTags: string[];
  quantityMin: number;
  quantityMax: number;
  seniorityLevel: string;
}

export interface DemandSummary {
  psSystemId: number;
  totalRequests: number;
  totalQuantity: number;
  byStatus: Record<PsResourceRequestStatus, number>;
  roles: Array<{ role: string; quantity: number; status: string }>;
}

// ── Resource Assignment (Assignment-Facing) ─────────────────────────

export const PS_ASSIGNMENT_STATUSES = [
  "proposed",
  "requested",
  "confirmed",
  "active",
  "rejected",
  "cancelled",
  "completed",
] as const;
export type PsAssignmentStatus = (typeof PS_ASSIGNMENT_STATUSES)[number];

export const PS_ASSIGNEE_REF_TYPES = [
  "person",
  "team",
  "org_unit",
  "external",
  "placeholder",
] as const;
export type PsAssigneeRefType = (typeof PS_ASSIGNEE_REF_TYPES)[number];

export const PS_ASSIGNMENT_SOURCES = [
  "wizard",
  "manual",
  "import",
  "future_hr_sync",
] as const;
export type PsAssignmentSource = (typeof PS_ASSIGNMENT_SOURCES)[number];

export interface CreateResourceAssignmentInput {
  workspaceId: number;
  resourceRequestId: number;
  psSystemId: number;
  assignmentRole: string;
  assigneeRefType: PsAssigneeRefType;
  assigneeRefId?: string;
  assigneeDisplayName?: string;
  allocationPercentage?: number;
  startDate?: Date;
  endDate?: Date;
  status?: PsAssignmentStatus;
  source?: PsAssignmentSource;
  notes?: string;
}

export interface UpdateResourceAssignmentInput {
  workspaceId: number;
  id: number;
  assignmentRole?: string;
  assigneeRefType?: PsAssigneeRefType;
  assigneeRefId?: string;
  assigneeDisplayName?: string;
  allocationPercentage?: number;
  startDate?: Date;
  endDate?: Date;
  notes?: string;
}

export type RequestFulfillmentState = "unfilled" | "partially_filled" | "filled";

export interface RequestFulfillment {
  requestId: number;
  role: string;
  requestedQuantity: number;
  activeAssignmentCount: number;
  totalAssignmentCount: number;
  fulfillmentState: RequestFulfillmentState;
}

export interface AssignmentSummary {
  psSystemId: number;
  totalRequests: number;
  totalAssignments: number;
  unfilledRequests: number;
  partiallyFilledRequests: number;
  filledRequests: number;
  byAssignmentStatus: Record<PsAssignmentStatus, number>;
  lastAssignmentDate: string | null;
}

// ── Matrix Classification Engine ─────────────────────────────────────

export const PS_MATRIX_VERSION_STATUSES = ["draft", "active", "archived"] as const;
export type PsMatrixVersionStatus = (typeof PS_MATRIX_VERSION_STATUSES)[number];

export interface MatrixEvaluationInput {
  workspaceId: number;
  answers: Record<string, boolean | string | number>;
}

export interface MatrixEvaluationResult {
  selectedScope: string;
  scores: Record<string, number>;
  matchedQuestions: string[];
  matrixVersion: string;
}

export interface LoadedMatrix {
  versionId: number;
  version: string;
  scopes: Array<{ id: number; code: string; label: string; family: string | null }>;
  questions: Array<{ id: number; code: string; label: string; description: string | null }>;
  cells: Array<{ questionId: number; scopeId: number; weight: number }>;
}
