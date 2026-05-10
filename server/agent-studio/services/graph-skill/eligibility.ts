/**
 * Graph Skill Pack — eligibility evaluator.
 *
 * Phase 12.5. Picks an eligible Graph Skill Pack for a given retrieval intent
 * + runtime context.
 *
 * ADR: docs/architecture/agent-studio-graph-skill-packs.md §1.3
 */

import type { RuntimeContext } from "../graph/repository/index.js";

export interface SkillPackSummary {
  readonly id: number;
  readonly skillKey: string;
  readonly name: string;
  readonly domain: string | null;
  readonly supportedNodeTypeKeys: string[];
  readonly supportedEdgeTypeKeys: string[];
  readonly riskLevel: "low" | "medium" | "high";
  readonly approvalRequired: boolean;
  readonly active: boolean;
  readonly allowedRoles: string[] | null;
}

export interface EligibilityInput {
  readonly queryDomain?: string;
  readonly involvedNodeTypeKeys?: string[];
  readonly involvedEdgeTypeKeys?: string[];
  readonly runtime: RuntimeContext;
  readonly availablePacks: SkillPackSummary[];
}

export interface EligibilityResult {
  readonly eligible: SkillPackSummary[];
  readonly rejectionReasons: Array<{ packKey: string; reason: string }>;
}

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const eligible: SkillPackSummary[] = [];
  const rejectionReasons: Array<{ packKey: string; reason: string }> = [];

  for (const pack of input.availablePacks) {
    if (!pack.active) {
      rejectionReasons.push({ packKey: pack.skillKey, reason: "inactive" });
      continue;
    }
    if (input.queryDomain && pack.domain && pack.domain !== input.queryDomain) {
      rejectionReasons.push({ packKey: pack.skillKey, reason: "domain_mismatch" });
      continue;
    }
    if (
      input.involvedNodeTypeKeys?.length &&
      pack.supportedNodeTypeKeys.length &&
      !input.involvedNodeTypeKeys.some((k) => pack.supportedNodeTypeKeys.includes(k))
    ) {
      rejectionReasons.push({ packKey: pack.skillKey, reason: "node_type_overlap_empty" });
      continue;
    }
    if (
      input.involvedEdgeTypeKeys?.length &&
      pack.supportedEdgeTypeKeys.length &&
      !input.involvedEdgeTypeKeys.some((k) => pack.supportedEdgeTypeKeys.includes(k))
    ) {
      rejectionReasons.push({ packKey: pack.skillKey, reason: "edge_type_overlap_empty" });
      continue;
    }
    if (pack.allowedRoles?.length && input.runtime.userRole && !pack.allowedRoles.includes(input.runtime.userRole)) {
      rejectionReasons.push({ packKey: pack.skillKey, reason: "role_not_allowed" });
      continue;
    }
    eligible.push(pack);
  }

  // Rank: prefer narrower domain match + lower risk
  eligible.sort((a, b) => {
    const aRiskScore = a.riskLevel === "low" ? 0 : a.riskLevel === "medium" ? 1 : 2;
    const bRiskScore = b.riskLevel === "low" ? 0 : b.riskLevel === "medium" ? 1 : 2;
    if (aRiskScore !== bRiskScore) return aRiskScore - bRiskScore;
    // Narrower (more specific) supportedNodeTypeKeys count last (more general first)
    return a.supportedNodeTypeKeys.length - b.supportedNodeTypeKeys.length;
  });

  return { eligible, rejectionReasons };
}
