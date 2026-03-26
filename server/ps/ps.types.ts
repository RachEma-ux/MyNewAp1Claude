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
