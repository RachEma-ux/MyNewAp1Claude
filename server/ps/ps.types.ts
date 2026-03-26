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

// ── Enhanced Matrix Engine Result Types ──────────────────────────────

export interface ScopeScore {
  code: string;
  label: string;
  score: number;
  rank: number;
}

export interface ExplainabilitySignal {
  questionCode: string;
  questionLabel: string;
  weight: number;
  /** The scope this signal favours */
  scopeCode: string;
}

export interface ExplainabilityReport {
  /** Questions where the winning scope gained weight */
  positiveSignals: ExplainabilitySignal[];
  /** Questions where a competing scope gained more weight than the winner */
  negativeSignals: ExplainabilitySignal[];
  /** Score difference between #1 and #2 (0 if only one scope) */
  winnerMargin: number;
  winnerCode: string;
  runnerUpCode: string;
}

export interface ConfidenceReport {
  /** Composite confidence 0..1 */
  overall: number;
  /** Normalised score spread (higher = more differentiated) 0..1 */
  spread: number;
  /** Fraction of matrix questions that were answered 0..1 */
  completeness: number;
  /** How close the top 2 scores are (0 = clear winner, 1 = tied) */
  ambiguity: number;
}

export interface EnrichedMatrixResult {
  selectedScope: string;
  selectedScopeLabel: string;
  top3: ScopeScore[];
  ranking: ScopeScore[];
  scores: Record<string, number>;
  matchedQuestions: string[];
  totalQuestions: number;
  matrixVersion: string;
  explainability: ExplainabilityReport;
  confidence: ConfidenceReport;
}

export interface LoadedMatrixDimension {
  id: number;
  dimensionKey: string;
  dimensionLabel: string;
  values: Array<{ id: number; valueKey: string; valueLabel: string }>;
}

export interface LoadedMatrix {
  versionId: number;
  version: string;
  scopes: Array<{ id: number; code: string; label: string; family: string | null }>;
  questions: Array<{ id: number; code: string; label: string; description: string | null }>;
  cells: Array<{ questionId: number; scopeId: number; weight: number }>;
  dimensions: LoadedMatrixDimension[];
}

// ── Matrix Admin Types ─────────────────────────────────────────────────

export interface MatrixOverview {
  activeVersion: { id: number; version: string; label: string; activatedAt: string | null } | null;
  totalVersions: number;
  totalScopes: number;
  totalQuestions: number;
  totalCells: number;
  totalDimensions: number;
  lastImportAt: string | null;
  lastActivationAt: string | null;
}

export interface MatrixValidationError {
  type: "duplicate_scope_code" | "duplicate_question_code" | "missing_cells" | "invalid_weight" | "no_active_scopes" | "no_questions" | "no_cells" | "empty_version";
  message: string;
  details?: Record<string, unknown>;
}

export interface MatrixValidationReport {
  versionId: number;
  isValid: boolean;
  errors: MatrixValidationError[];
  warnings: string[];
  stats: {
    scopeCount: number;
    activeScopeCount: number;
    questionCount: number;
    activeQuestionCount: number;
    cellCount: number;
    expectedCellCount: number;
    coveragePercent: number;
  };
}

// ── Matrix Import Types ────────────────────────────────────────────────

export type MatrixImportSourceType = "json" | "excel" | "manual";
export type MatrixImportStatus = "pending" | "previewed" | "committed" | "failed";

export interface MatrixImportScopeRow {
  code: string;
  label: string;
  description?: string;
  family?: string;
}

export interface MatrixImportQuestionRow {
  code: string;
  label: string;
  description?: string;
  sortOrder?: number;
}

export interface MatrixImportCellRow {
  questionCode: string;
  scopeCode: string;
  weight: number;
}

export interface MatrixImportPayload {
  scopes: MatrixImportScopeRow[];
  questions: MatrixImportQuestionRow[];
  cells: MatrixImportCellRow[];
  dimensions?: MatrixImportDimensionRow[];
  questionPresentations?: MatrixImportQuestionPresentationRow[];
}

export interface MatrixImportPreview {
  importId: number;
  sourceType: MatrixImportSourceType;
  scopesCount: number;
  questionsCount: number;
  cellsCount: number;
  dimensionsCount: number;
  questionPresentationsCount: number;
  warnings: string[];
  errors: string[];
  isValid: boolean;
}

export interface MatrixImportCommitResult {
  importId: number;
  versionId: number;
  scopesCreated: number;
  questionsCreated: number;
  cellsCreated: number;
  dimensionsCreated: number;
  dimensionValuesCreated: number;
  presentationsCreated: number;
}

// ── Scope Matrix Profile Types ──────────────────────────────────────────

export interface ScopeMatrixProfileData {
  pmiValue?: string | null;
  prince2Value?: string | null;
  isoValue?: string | null;
  ipmaValue?: string | null;
  cmmiValue?: string | null;
  aspiceValue?: string | null;
  leanMethodValue?: string | null;
  agileFrameworkValue?: string | null;
  traditionalMethodValue?: string | null;
  agileFrameworksValue?: string | null;
  hybridMethodValue?: string | null;
  caseScenario?: string | null;
  selectedStandards?: string | null;
  selectedFrameworks?: string | null;
  rawRowJson?: Record<string, unknown> | null;
  typeMapJson?: Record<string, string>;
}

export interface CreateScopeMatrixProfileInput extends ScopeMatrixProfileData {
  scopeId: number;
}

// ── Matrix Header Types ──────────────────────────────────────────────────

export const MATRIX_HEADER_TYPES = [
  "Standard",
  "Method",
  "Framework",
  "Standards",
  "Methods",
  "Frameworks",
] as const;
export type MatrixHeaderType = (typeof MATRIX_HEADER_TYPES)[number];

export interface MatrixHeaderDefinition {
  headerKey: string;
  headerLabel: string;
  headerType: MatrixHeaderType | null;
  sortOrder: number;
}

// ── Dimension Types (DB-driven, replaces hard-coded enums) ─────────────

export interface DimensionDefinition {
  id: number;
  dimensionKey: string;
  dimensionLabel: string;
  description: string | null;
  sortOrder: number;
  isActive: number;
  values: DimensionValueDefinition[];
}

export interface DimensionValueDefinition {
  id: number;
  dimensionId: number;
  valueKey: string;
  valueLabel: string;
  description: string | null;
  sortOrder: number;
  isActive: number;
}

export interface CreateDimensionInput {
  versionId: number;
  dimensionKey: string;
  dimensionLabel: string;
  description?: string;
  sortOrder?: number;
}

export interface CreateDimensionValueInput {
  dimensionId: number;
  valueKey: string;
  valueLabel: string;
  description?: string;
  sortOrder?: number;
}

// ── Question Presentation Types ─────────────────────────────────────

export const PRESENTATION_TYPES = [
  "boolean",
  "select",
  "slider",
  "multi_select",
  "text",
] as const;
export type PresentationType = (typeof PRESENTATION_TYPES)[number];

export interface QuestionPresentationData {
  questionId: number;
  presentationType: PresentationType;
  dimensionId?: number | null;
  configJson?: Record<string, unknown> | null;
}

// ── Import Dimension/Presentation Rows ──────────────────────────────

export interface MatrixImportDimensionRow {
  dimensionKey: string;
  dimensionLabel: string;
  description?: string;
  sortOrder?: number;
  values: MatrixImportDimensionValueRow[];
}

export interface MatrixImportDimensionValueRow {
  valueKey: string;
  valueLabel: string;
  description?: string;
  sortOrder?: number;
}

export interface MatrixImportQuestionPresentationRow {
  questionCode: string;
  presentationType: PresentationType;
  dimensionKey?: string;
  configJson?: Record<string, unknown>;
}

export type MatrixImportType = "scope_matrix" | "scoring_matrix";

// ── Wizard Accept (Decision → Operational Output) ──────────────────────

export interface AcceptWizardInput {
  workspaceId: number;
  scenarioText: string;
  projectName: string;
  selectedScopeCode: string;
  selectedScopeLabel: string;
  matrixVersion: string;
  answers: Record<string, boolean | string | number>;
  confidence: number;
  overrideInfo?: { scopeCode: string; reason: string } | null;
  inputPayload?: Record<string, unknown>;
  resultPayload?: Record<string, unknown>;
}

export interface AcceptWizardResult {
  wizardRun: { id: number; scenarioText: string; selectedSystemType: string | null };
  system: { id: number; name: string; systemType: string; status: string };
  demandGenerated: Array<{ id: number; role: string; quantity: number | null }>;
  assignmentPlaceholders: Array<{ id: number; assignmentRole: string; status: string }>;
  trace: {
    wizardRunId: number;
    systemId: number;
    demandCount: number;
    assignmentCount: number;
    scopeCode: string;
    templateUsed: string;
    overrideApplied: boolean;
  };
}

export interface CreateMatrixImportRecordInput {
  workspaceId: number;
  versionId?: number;
  importType: MatrixImportType;
  sourceType: MatrixImportSourceType;
  sourceName: string;
  sheetName: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  warningsJson?: string[];
  rawPayloadJson?: Record<string, unknown>;
}
