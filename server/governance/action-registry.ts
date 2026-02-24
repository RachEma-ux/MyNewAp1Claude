/**
 * Platform Action Registry — Unified Governance v1
 *
 * Loads config/governance/platform_action_registry.yaml and provides:
 *   - Strict Zod-validated types for every action
 *   - Fail-fast on invalid or missing config
 *   - getActionDef(key) — returns action definition or throws (deny-by-default)
 *   - getRiskLevel(key) — numeric risk (1–5) for comparison
 *   - isAboveThreshold(key) — true if action risk >= governance_threshold
 */

import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

// ============================================================================
// Zod Schemas
// ============================================================================

export const RiskLevelSchema = z.enum(["R1", "R2", "R3", "R4", "R5"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ApprovalRuleSchema = z.enum([
  "none",
  "role_any",
  "role_all",
  "dual_control",
  "conditional",
]);
export type ApprovalRule = z.infer<typeof ApprovalRuleSchema>;

export const EvidenceTypeSchema = z.enum([
  "diff",
  "reason",
  "sources",
  "plan",
  "tool_intents",
  "payload_hash",
  "probe_results",
  "tests_passed",
  "signed_commit",
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EvidenceRequirementSchema = z.object({
  required: z.boolean(),
  types: z.array(EvidenceTypeSchema).optional(),
});

export const ActionDefSchema = z.object({
  domain: z.string().min(1),
  risk: RiskLevelSchema,
  capability: z.string().min(1),
  stage: z.string().min(1),
  approval: ApprovalRuleSchema,
  evidence: EvidenceRequirementSchema,
});
export type ActionDef = z.infer<typeof ActionDefSchema>;

export const PlatformActionRegistrySchema = z.object({
  version: z.number().int().positive(),
  governance_threshold: RiskLevelSchema,
  actions: z.record(z.string(), ActionDefSchema),
});
export type PlatformActionRegistry = z.infer<typeof PlatformActionRegistrySchema>;

// ============================================================================
// Risk Numeric Mapping
// ============================================================================

const RISK_NUMERIC: Record<RiskLevel, number> = {
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
  R5: 5,
};

// ============================================================================
// Singleton Registry
// ============================================================================

let _registry: PlatformActionRegistry | null = null;

/**
 * Load and validate the platform action registry from YAML.
 * Fail-fast: throws on missing file, invalid YAML, or Zod validation failure.
 */
export function loadActionRegistry(rootDir?: string): PlatformActionRegistry {
  const root = rootDir || path.resolve(__dirname, "../..");
  const filePath = path.join(root, "config/governance/platform_action_registry.yaml");

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `[ActionRegistry] FATAL: platform_action_registry.yaml not found at ${filePath}`
    );
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw);

  const result = PlatformActionRegistrySchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `[ActionRegistry] FATAL: Invalid platform_action_registry.yaml:\n${errors}`
    );
  }

  // Check for version enforcement
  if (result.data.version < 1) {
    throw new Error("[ActionRegistry] FATAL: version must be >= 1");
  }

  // Check for empty actions
  const actionCount = Object.keys(result.data.actions).length;
  if (actionCount === 0) {
    throw new Error("[ActionRegistry] FATAL: actions map is empty");
  }

  _registry = result.data;
  return _registry;
}

/**
 * Get the loaded registry, loading it if not already loaded.
 */
export function getActionRegistry(): PlatformActionRegistry {
  if (!_registry) {
    _registry = loadActionRegistry();
  }
  return _registry;
}

/**
 * Get an action definition by key.
 * DENY-BY-DEFAULT: throws for unknown action keys.
 */
export function getActionDef(actionKey: string): ActionDef {
  const registry = getActionRegistry();
  const def = registry.actions[actionKey];
  if (!def) {
    throw new Error(
      `[ActionRegistry] DENIED: Unknown action key "${actionKey}". ` +
      `All actions must be registered in platform_action_registry.yaml. ` +
      `Deny-by-default policy active.`
    );
  }
  return def;
}

/**
 * Get numeric risk level (1–5) for an action key.
 */
export function getRiskLevel(actionKey: string): number {
  const def = getActionDef(actionKey);
  return RISK_NUMERIC[def.risk];
}

/**
 * Check if an action's risk level meets or exceeds the governance threshold.
 * Actions at or above threshold require GovernanceCenter evaluation.
 */
export function isAboveThreshold(actionKey: string): boolean {
  const registry = getActionRegistry();
  const def = getActionDef(actionKey);
  const threshold = RISK_NUMERIC[registry.governance_threshold];
  const actionRisk = RISK_NUMERIC[def.risk];
  return actionRisk >= threshold;
}

/**
 * Get the governance threshold as a numeric value.
 */
export function getGovernanceThreshold(): number {
  const registry = getActionRegistry();
  return RISK_NUMERIC[registry.governance_threshold];
}

/**
 * Get all registered action keys.
 */
export function getAllActionKeys(): string[] {
  const registry = getActionRegistry();
  return Object.keys(registry.actions);
}

/**
 * Get actions filtered by domain.
 */
export function getActionsByDomain(domain: string): Record<string, ActionDef> {
  const registry = getActionRegistry();
  const result: Record<string, ActionDef> = {};
  for (const [key, def] of Object.entries(registry.actions)) {
    if (def.domain === domain) {
      result[key] = def;
    }
  }
  return result;
}

/**
 * Get actions filtered by risk level.
 */
export function getActionsByRisk(risk: RiskLevel): Record<string, ActionDef> {
  const registry = getActionRegistry();
  const result: Record<string, ActionDef> = {};
  for (const [key, def] of Object.entries(registry.actions)) {
    if (def.risk === risk) {
      result[key] = def;
    }
  }
  return result;
}

/**
 * Reset the loaded registry (for testing).
 */
export function resetActionRegistry(): void {
  _registry = null;
}
