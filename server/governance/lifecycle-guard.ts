/**
 * Lifecycle Guard — Governance Bible CGT v2, Section 6
 *
 * Enforces stage integrity for the Candidate Pipeline:
 *   Submit → Register → Validate → Publish → Catalog
 *
 * Rules:
 *   - No stage skipping
 *   - Each transition requires explicit approval
 *   - Each transition is audit-logged
 *   - Policy compliance checked at each gate
 *   - Automatic promotion is prohibited
 */

import { getAuditLogger } from "../services/auditLogger";
import { type RiskFinding, createFinding, blocksStage } from "./risk-classifier";

// ============================================================================
// Types
// ============================================================================

export const LIFECYCLE_STAGES = [
  "submit",
  "register",
  "validate",
  "publish",
  "catalog",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** Maps pipeline tags to lifecycle stages */
const TAG_TO_STAGE: Record<string, LifecycleStage> = {
  candidate: "submit",
  registered: "register",
  validated: "validate",
  published: "publish",
};

export interface TransitionRequest {
  entryId: number;
  entryName: string;
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  actorId: string;
  actorRole: string;
  riskFindings?: RiskFinding[];
}

export interface TransitionResult {
  allowed: boolean;
  reason: string;
  auditId?: string;
  blockedByFindings?: RiskFinding[];
}

// ============================================================================
// Stage Order
// ============================================================================

function stageIndex(stage: LifecycleStage): number {
  return LIFECYCLE_STAGES.indexOf(stage);
}

// ============================================================================
// Lifecycle Guard
// ============================================================================

/**
 * Validate a lifecycle transition.
 *
 * Enforces:
 *   1. Sequential progression only (no skipping)
 *   2. No backward transitions
 *   3. Risk findings don't block the target stage
 *   4. Audit logging of every attempt
 */
export function validateTransition(req: TransitionRequest): TransitionResult {
  const fromIdx = stageIndex(req.fromStage);
  const toIdx = stageIndex(req.toStage);

  // Rule 1: Cannot skip stages
  if (toIdx - fromIdx !== 1) {
    const reason =
      toIdx <= fromIdx
        ? `Backward transition not allowed: ${req.fromStage} → ${req.toStage}`
        : `Stage skipping prohibited: ${req.fromStage} → ${req.toStage} (must go through ${LIFECYCLE_STAGES[fromIdx + 1]})`;

    logTransition(req, false, reason);
    return { allowed: false, reason };
  }

  // Rule 2: Check risk findings
  if (req.riskFindings && req.riskFindings.length > 0) {
    const blocking = req.riskFindings.filter((f) =>
      blocksStage(f.severity, req.toStage as "register" | "validate" | "publish" | "catalog")
    );

    if (blocking.length > 0) {
      const reason = `${blocking.length} risk finding(s) block transition to ${req.toStage}: ${blocking.map((f) => `[${f.severity.toUpperCase()}] ${f.title}`).join("; ")}`;
      logTransition(req, false, reason);
      return { allowed: false, reason, blockedByFindings: blocking };
    }
  }

  // Transition allowed
  const reason = `Transition approved: ${req.fromStage} → ${req.toStage}`;
  const auditId = logTransition(req, true, reason);
  return { allowed: true, reason, auditId };
}

/**
 * Determine the current lifecycle stage from entry tags
 */
export function getStageFromTags(tags: string[]): LifecycleStage {
  // Check tags in reverse priority (latest stage wins)
  if (tags.includes("published")) return "publish";
  if (tags.includes("validated")) return "validate";
  if (tags.includes("registered")) return "register";
  if (tags.includes("candidate")) return "submit";
  return "submit"; // Default: untagged entries are at submit stage
}

/**
 * Get the tag that corresponds to a lifecycle stage
 */
export function getTagForStage(stage: LifecycleStage): string | null {
  switch (stage) {
    case "submit":
      return "candidate";
    case "register":
      return "registered";
    case "validate":
      return "validated";
    case "publish":
      return "published";
    case "catalog":
      return "published"; // Catalog entries retain published tag
    default:
      return null;
  }
}

/**
 * Get the next stage in the lifecycle
 */
export function getNextStage(current: LifecycleStage): LifecycleStage | null {
  const idx = stageIndex(current);
  if (idx < 0 || idx >= LIFECYCLE_STAGES.length - 1) return null;
  return LIFECYCLE_STAGES[idx + 1];
}

/**
 * Check if a transition from current tags to target stage is valid
 */
export function canTransitionFromTags(
  tags: string[],
  targetStage: LifecycleStage
): { valid: boolean; currentStage: LifecycleStage; reason?: string } {
  const currentStage = getStageFromTags(tags);
  const nextStage = getNextStage(currentStage);

  if (!nextStage) {
    return {
      valid: false,
      currentStage,
      reason: `Entry is at final stage: ${currentStage}`,
    };
  }

  if (targetStage !== nextStage) {
    return {
      valid: false,
      currentStage,
      reason: `Expected transition to ${nextStage}, got ${targetStage}`,
    };
  }

  return { valid: true, currentStage };
}

/**
 * Validate that entry data meets minimum requirements for a stage
 */
export function validateStageRequirements(
  stage: LifecycleStage,
  entry: { name?: string; entryType?: string; description?: string; tags?: string[] }
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  // Submit requirements
  if (!entry.name) {
    findings.push(
      createFinding("incomplete_documentation", "Missing entry name", "Entry must have a name to be submitted", entry.name)
    );
  }
  if (!entry.entryType) {
    findings.push(
      createFinding("incomplete_documentation", "Missing entry type", "Entry must declare its type", entry.name)
    );
  }

  // Register requirements
  if (stageIndex(stage) >= stageIndex("register")) {
    if (!entry.description) {
      findings.push(
        createFinding("incomplete_documentation", "Missing description", "Entry must have a description for registration", entry.name)
      );
    }
  }

  return findings;
}

// ============================================================================
// Audit Logging
// ============================================================================

function logTransition(req: TransitionRequest, allowed: boolean, reason: string): string {
  const audit = getAuditLogger();
  const event = audit.log({
    actor_id: req.actorId,
    action_type: "POLICY_UPDATE" as any,
    target_type: "lifecycle_transition",
    target_id: String(req.entryId),
    decision_result: allowed ? "success" : "denied",
    metadata: {
      fromStage: req.fromStage,
      toStage: req.toStage,
      entryName: req.entryName,
      actorRole: req.actorRole,
      reason,
    },
  });
  return event.event_id;
}
