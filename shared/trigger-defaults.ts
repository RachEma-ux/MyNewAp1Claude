/**
 * Category-based defaults for Trigger creation
 * Based on the Trigger Creation Protocol
 */

export type TriggerCategory = 
  | "time" 
  | "event" 
  | "data" 
  | "user" 
  | "system" 
  | "integration";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type TriggerSideEffect = 
  | "workflow_state_write"
  | "telemetry_emit"
  | "policy_eval"
  | "signature_verification";

// Forbidden side-effects for triggers (HARD FAIL if present)
export const FORBIDDEN_TRIGGER_SIDE_EFFECTS = [
  "database_write",
  "database_read_write",
  "file_write",
  "file_read_write",
  "external_send",
  "external_api_call",
  "secrets_mutation"
] as const;

export interface TriggerCategoryDefaults {
  defaultRisk: RiskLevel;
  defaultSideEffects: TriggerSideEffect[];
  notes: string[];
  mandatoryGates: string[];
  requiresAuth: boolean;
  requiresRateLimit: boolean;
  requiresDeduplication: boolean;
}

export const TRIGGER_CATEGORY_DEFAULTS: Record<TriggerCategory, TriggerCategoryDefaults> = {
  time: {
    defaultRisk: "low",
    defaultSideEffects: ["workflow_state_write"],
    notes: ["Schedules, cron, timers - predictable and safe"],
    mandatoryGates: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T9", "T10", "T11", "T12", "T13"],
    requiresAuth: false,
    requiresRateLimit: false,
    requiresDeduplication: false
  },
  event: {
    defaultRisk: "high",
    defaultSideEffects: ["workflow_state_write", "telemetry_emit"],
    notes: ["Webhook, message bus - requires authentication and deduplication"],
    mandatoryGates: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13"],
    requiresAuth: true,
    requiresRateLimit: true,
    requiresDeduplication: true
  },
  data: {
    defaultRisk: "high",
    defaultSideEffects: ["workflow_state_write", "telemetry_emit"],
    notes: ["Database or file arrival - data integrity risk"],
    mandatoryGates: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13"],
    requiresAuth: true,
    requiresRateLimit: true,
    requiresDeduplication: true
  },
  user: {
    defaultRisk: "medium",
    defaultSideEffects: ["workflow_state_write"],
    notes: ["Manual / UI start - user-initiated, lower risk"],
    mandatoryGates: ["T1", "T2", "T3", "T4", "T5", "T7", "T9", "T10", "T12", "T13"],
    requiresAuth: false,
    requiresRateLimit: true,
    requiresDeduplication: false
  },
  system: {
    defaultRisk: "critical",
    defaultSideEffects: ["workflow_state_write", "policy_eval"],
    notes: ["Platform-internal signals - highest security requirements"],
    mandatoryGates: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T14"],
    requiresAuth: true,
    requiresRateLimit: true,
    requiresDeduplication: true
  },
  integration: {
    defaultRisk: "high",
    defaultSideEffects: ["workflow_state_write", "telemetry_emit"],
    notes: ["Third-party inbound events - requires strict validation"],
    mandatoryGates: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13"],
    requiresAuth: true,
    requiresRateLimit: true,
    requiresDeduplication: true
  }
};

export function getTriggerCategoryDefaults(category: TriggerCategory): TriggerCategoryDefaults {
  return TRIGGER_CATEGORY_DEFAULTS[category];
}

// Alias for backward compatibility
export const TRIGGER_DEFAULTS = TRIGGER_CATEGORY_DEFAULTS;

// Validation helper
export function validateTriggerSideEffects(sideEffects: string[]): { valid: boolean; violations: string[] } {
  const violations = sideEffects.filter(effect => 
    FORBIDDEN_TRIGGER_SIDE_EFFECTS.includes(effect as any)
  );
  
  return {
    valid: violations.length === 0,
    violations
  };
}
