/**
 * Category-based defaults for Action creation
 * Based on the updated Action protocol
 */

export type ActionCategory = 
  | "control" 
  | "logic" 
  | "communication" 
  | "integration" 
  | "data" 
  | "file" 
  | "ai" 
  | "human" 
  | "security" 
  | "observability" 
  | "system" 
  | "custom";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type SideEffect = 
  | "none"
  | "workflow_state_write"
  | "database_read"
  | "database_write"
  | "database_read_write"
  | "file_read"
  | "file_write"
  | "file_read_write"
  | "external_api_call"
  | "external_send"
  | "telemetry_emit"
  | "secrets_access"
  | "token_ops"
  | "policy_eval"
  | "internal_service_call"
  | "runtime_mutation"
  | "model_inference";

export interface CategoryDefaults {
  defaultRisk: RiskLevel;
  defaultSideEffects: SideEffect[];
  notes: string[];
  mandatoryGates: string[];
}

export const CATEGORY_DEFAULTS: Record<ActionCategory, CategoryDefaults> = {
  control: {
    defaultRisk: "medium",
    defaultSideEffects: ["workflow_state_write"],
    notes: ["Affects workflow execution (branching, delays, termination)."],
    mandatoryGates: ["A6", "A10", "A12", "A13"]
  },
  logic: {
    defaultRisk: "low",
    defaultSideEffects: ["none"],
    notes: ["Pure compute/transform; must be side-effect free."],
    mandatoryGates: ["A6", "A12"]
  },
  communication: {
    defaultRisk: "high",
    defaultSideEffects: ["external_send"],
    notes: ["User-facing or irreversible outbound messaging."],
    mandatoryGates: ["A6", "A7", "A10", "A12", "A13"]
  },
  integration: {
    defaultRisk: "high",
    defaultSideEffects: ["external_api_call"],
    notes: ["Outbound service/API calls; egress and vendor dependency risk."],
    mandatoryGates: ["A6", "A7", "A10", "A12", "A13"]
  },
  data: {
    defaultRisk: "high",
    defaultSideEffects: ["database_read_write"],
    notes: ["Data integrity + privacy; may require tenant scoping policies."],
    mandatoryGates: ["A6", "A7", "A10", "A12", "A13"]
  },
  file: {
    defaultRisk: "medium",
    defaultSideEffects: ["file_read_write"],
    notes: ["File/document operations; size and content sensitivity risk."],
    mandatoryGates: ["A6", "A7", "A10", "A12", "A13"]
  },
  ai: {
    defaultRisk: "high",
    defaultSideEffects: ["model_inference", "external_api_call"],
    notes: ["Inference is inherently non-deterministic unless stubbed; may call external providers."],
    mandatoryGates: ["A6", "A7", "A10", "A12", "A13"]
  },
  human: {
    defaultRisk: "medium",
    defaultSideEffects: ["workflow_state_write", "external_send"],
    notes: ["Pauses workflow + notifies humans; potential data exposure to people."],
    mandatoryGates: ["A6", "A7", "A10", "A12", "A13"]
  },
  security: {
    defaultRisk: "critical",
    defaultSideEffects: ["secrets_access", "token_ops", "policy_eval"],
    notes: ["Authorization/tokening/secrets: strongest constraints."],
    mandatoryGates: ["A6", "A7", "A10", "A12", "A13", "A14"]
  },
  observability: {
    defaultRisk: "low",
    defaultSideEffects: ["telemetry_emit"],
    notes: ["Telemetry only; must not mutate business state."],
    mandatoryGates: ["A6"]
  },
  system: {
    defaultRisk: "critical",
    defaultSideEffects: ["internal_service_call", "runtime_mutation"],
    notes: ["Platform-level mutation; strongest constraints."],
    mandatoryGates: ["A6", "A7", "A10", "A12", "A13", "A14"]
  },
  custom: {
    defaultRisk: "high",
    defaultSideEffects: ["external_api_call"],
    notes: ["Unknown by default; treat as high until proven otherwise."],
    mandatoryGates: ["A6", "A7", "A10", "A12", "A13"]
  }
};

export function getCategoryDefaults(category: ActionCategory): CategoryDefaults {
  return CATEGORY_DEFAULTS[category];
}
