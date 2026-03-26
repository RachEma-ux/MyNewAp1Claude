/**
 * PS Module — Demand Generation Logic
 *
 * Simple rule-based demand generation. Maps system types to
 * resource request templates. No ML, no YAML, no external config.
 */

import type { PsSystemType, DemandRoleSpec } from "./ps.types";

// ── Demand Rules per System Type ─────────────────────────────────────

const DEMAND_RULES: Record<PsSystemType, DemandRoleSpec[]> = {
  SOFTWARE_DELIVERY: [
    { role: "Backend Engineer", capabilityTags: ["backend", "api", "database"], quantityMin: 2, quantityMax: 4, seniorityLevel: "mid" },
    { role: "Frontend Engineer", capabilityTags: ["frontend", "ui", "react"], quantityMin: 1, quantityMax: 2, seniorityLevel: "mid" },
    { role: "QA Engineer", capabilityTags: ["testing", "qa", "automation"], quantityMin: 1, quantityMax: 1, seniorityLevel: "mid" },
    { role: "Tech Lead", capabilityTags: ["architecture", "leadership", "code-review"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
  ],

  PROGRAM_MANAGEMENT: [
    { role: "Program Manager", capabilityTags: ["program-management", "governance", "stakeholder-mgmt"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
    { role: "Project Manager", capabilityTags: ["project-management", "planning", "reporting"], quantityMin: 2, quantityMax: 3, seniorityLevel: "mid" },
    { role: "Business Analyst", capabilityTags: ["requirements", "analysis", "documentation"], quantityMin: 1, quantityMax: 2, seniorityLevel: "mid" },
  ],

  AGILE_PRODUCT: [
    { role: "Product Owner", capabilityTags: ["product-management", "backlog", "prioritization"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
    { role: "Scrum Master", capabilityTags: ["scrum", "facilitation", "coaching"], quantityMin: 1, quantityMax: 1, seniorityLevel: "mid" },
    { role: "Dev Team Member", capabilityTags: ["development", "agile", "cross-functional"], quantityMin: 3, quantityMax: 7, seniorityLevel: "mid" },
  ],

  PROJECT_GOVERNANCE: [
    { role: "Project Manager", capabilityTags: ["project-management", "governance", "compliance"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
    { role: "PMO Analyst", capabilityTags: ["pmo", "reporting", "standards"], quantityMin: 1, quantityMax: 1, seniorityLevel: "mid" },
    { role: "Risk/Compliance Officer", capabilityTags: ["risk-management", "compliance", "audit"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
  ],

  OPERATIONS_IMPROVEMENT: [
    { role: "Operations Manager", capabilityTags: ["operations", "process-improvement", "lean"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
    { role: "Process Analyst", capabilityTags: ["process-mapping", "analysis", "optimization"], quantityMin: 1, quantityMax: 2, seniorityLevel: "mid" },
    { role: "Change Manager", capabilityTags: ["change-management", "communication", "training"], quantityMin: 1, quantityMax: 1, seniorityLevel: "mid" },
  ],
};

// ── Generate Demand Specifications ───────────────────────────────────

/**
 * Generate resource request specs for a given system type.
 * Returns role specs with quantities set to the midpoint of min/max.
 */
export function generateDemandSpecs(systemType: string): DemandRoleSpec[] {
  const rules = DEMAND_RULES[systemType as PsSystemType];
  if (!rules) return [];
  return rules;
}

/**
 * Pick a concrete quantity from min/max range (uses midpoint, rounded up).
 */
export function resolveQuantity(spec: DemandRoleSpec): number {
  return Math.ceil((spec.quantityMin + spec.quantityMax) / 2);
}
