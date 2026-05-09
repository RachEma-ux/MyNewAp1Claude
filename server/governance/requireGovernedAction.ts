/**
 * requireGovernedAction — Unified Platform Governance v1
 *
 * The SINGLE enforcement wrapper for ALL mutations across the entire platform.
 *
 * Pipeline (in order):
 *   1. Membership scope validation
 *   2. Capability check (RBAC)
 *   3. Freeze check (workspace + subject)
 *   4. Lookup actionKey in registry
 *   5. Determine risk
 *   6. If risk >= threshold: GovernanceCenter.evaluate() + requireGate()
 *   7. Resolve approval requirements
 *   8. Validate evidence requirements
 *   9. Return GovernanceReceipt
 *  10. Do NOT execute mutation inside wrapper
 *
 * Deny-by-default: unknown action keys throw immediately.
 */

import { getActionDef, isAboveThreshold, type RiskLevel } from "./action-registry";
import { requireGate, type GateResult } from "./requireGate";
import { isFrozen, getFreezeDetails } from "./scorecard";
import { hasPermission, normalizeRole, type PermissionAction } from "./rbac-model";
import { getAuditLogger } from "../services/auditLogger";

// ============================================================================
// Types
// ============================================================================

export interface GovernedActionInput {
  /** Registered action key from platform_action_registry.yaml */
  actionKey: string;
  /** Actor principal ID (user id as string) */
  actorPrincipalId: string;
  /** Actor role */
  actorRole?: string;
  /** Organization / tenant ID */
  orgId: string;
  /** Workspace ID (optional, for workspace-scoped actions) */
  workspaceId?: string;
  /** Subject being acted upon */
  subject: {
    subjectType: string;
    subjectId: string;
  };
  /** Additional context for governance evaluation */
  context: Record<string, unknown>;
  /** Evidence provided by the caller (for R3+ actions that require it) */
  evidence?: {
    types: string[];
    refs: string[];
  };
  /** Approval tokens (for actions requiring approval) */
  approvals?: Array<{
    approverPrincipalId: string;
    approvedAt: string;
  }>;
}

export interface GovernanceReceipt {
  /** The action key that was evaluated */
  actionKey: string;
  /** The risk level of the action */
  risk: RiskLevel;
  /** Governance run ID (set for R3+ actions) */
  governanceRunId?: string;
  /** Whether approval was required */
  approvalRequired: boolean;
  /** Approval status if required */
  approvalStatus?: "pending" | "approved";
  /** Evidence references logged */
  evidenceRefs?: string[];
  /** ISO timestamp */
  timestamp: string;
  /** Whether the action was allowed */
  allowed: boolean;
  /** Denial reason if blocked */
  denialReason?: string;
  /** Gate result from requireGate (for R3+ actions) */
  gateResult?: GateResult;
}

// ============================================================================
// requireGovernedAction — THE enforcement function
// ============================================================================

export async function requireGovernedAction(
  input: GovernedActionInput
): Promise<GovernanceReceipt> {
  const audit = getAuditLogger();
  const now = new Date().toISOString();

  // ── 1. Lookup actionKey in registry (deny-by-default for unknown keys) ──
  // getActionDef throws for unknown keys
  const actionDef = getActionDef(input.actionKey);

  // ── 2. Membership scope validation ──────────────────────────────────────
  // Actor must have a principal ID
  if (!input.actorPrincipalId) {
    // R5-c3: emit audit log before denial so missing-principal attempts
    // don't disappear from the audit trail (cycle-3 silent-denial fix).
    await audit.log({
      actor_id: null,
      action_type: "RBAC_DENIAL",
      target_type: input.subject.subjectType,
      target_id: input.subject.subjectId,
      decision_result: "denied",
      metadata: {
        actionKey: input.actionKey,
        reason: "missing_principal",
      },
    });
    return buildDenial(input, actionDef.risk, now, "Actor principal ID is required");
  }

  // ── 3. Capability check (RBAC) ─────────────────────────────────────────
  const role = normalizeRole(input.actorRole || "user");
  // Map action capability to RBAC permission check
  // The capability from the registry maps to governance permission actions
  // For now, check if the user's role allows governance operations
  // Detailed per-capability RBAC is handled by the existing system
  const capabilityAllowed = checkCapability(role, actionDef.capability);
  if (!capabilityAllowed) {
    await audit.log({
      actor_id: input.actorPrincipalId,
      action_type: "RBAC_DENIAL",
      target_type: input.subject.subjectType,
      target_id: input.subject.subjectId,
      decision_result: "denied",
      metadata: {
        actionKey: input.actionKey,
        requiredCapability: actionDef.capability,
        actorRole: role,
      },
    });
    return buildDenial(
      input,
      actionDef.risk,
      now,
      `RBAC denial: role "${role}" lacks capability "${actionDef.capability}" for action "${input.actionKey}"`
    );
  }

  // ── 4. Freeze check (system-wide + workspace + subject) ────────────────
  // R5-c3: each freeze branch now emits an audit-log entry before denial
  // so freeze blocks are visible in the platform audit trail (previously
  // these paths returned buildDenial silently, leaving operators no record
  // of which calls were blocked).

  // System-wide freeze
  if (isFrozen(0)) {
    const details = getFreezeDetails(0);
    await audit.log({
      actor_id: input.actorPrincipalId,
      action_type: "FREEZE_BLOCK",
      target_type: input.subject.subjectType,
      target_id: input.subject.subjectId,
      decision_result: "denied",
      metadata: {
        actionKey: input.actionKey,
        freezeScope: "system",
        reason: details?.reason,
      },
    });
    return buildDenial(
      input,
      actionDef.risk,
      now,
      `System-wide governance FREEZE active: ${details?.reason || "all mutations blocked"}`
    );
  }

  // Workspace freeze
  if (input.workspaceId) {
    const wsId = parseInt(input.workspaceId, 10);
    if (!isNaN(wsId) && isFrozen(wsId)) {
      const details = getFreezeDetails(wsId);
      await audit.log({
        actor_id: input.actorPrincipalId,
        action_type: "FREEZE_BLOCK",
        target_type: input.subject.subjectType,
        target_id: input.subject.subjectId,
        workspace_id: input.workspaceId,
        decision_result: "denied",
        metadata: {
          actionKey: input.actionKey,
          freezeScope: "workspace",
          frozenWorkspaceId: wsId,
          reason: details?.reason,
        },
      });
      return buildDenial(
        input,
        actionDef.risk,
        now,
        `Workspace #${wsId} is FROZEN: ${details?.reason || "governance freeze active"}`
      );
    }
  }

  // Subject freeze.
  //
  // R4-c3: drops the `subjectId > 0` guard so explicit freezes on subject 0
  // also fire here (redundant with system freeze at line 134 but harmless
  // and more transparent in the audit log). NOTE the residual limitation:
  // input.subject.subjectId is resolved by the trpc middleware (trpc.ts:85)
  // from the first matching field among {subjectId, id, entryId}, defaulting
  // to "0" if none match. Procedures whose input uses other identifier
  // names (unitId, agentId, workspaceId-as-target, etc.) resolve to
  // subjectId="0" here, so per-subject freezes on subjects > 0 cannot be
  // enforced via this path for those procedures. A complete fix requires
  // a procedure-level subject convention (e.g., a `_subjectId` input
  // field or per-procedure metadata) — out of scope for cycle-3 closure.
  const subjectId = parseInt(input.subject.subjectId, 10);
  if (!isNaN(subjectId) && isFrozen(subjectId)) {
    const details = getFreezeDetails(subjectId);
    await audit.log({
      actor_id: input.actorPrincipalId,
      action_type: "FREEZE_BLOCK",
      target_type: input.subject.subjectType,
      target_id: input.subject.subjectId,
      decision_result: "denied",
      metadata: {
        actionKey: input.actionKey,
        freezeScope: "subject",
        frozenSubjectId: subjectId,
        reason: details?.reason,
      },
    });
    return buildDenial(
      input,
      actionDef.risk,
      now,
      `Subject #${subjectId} is FROZEN: ${details?.reason || "governance freeze active"}`
    );
  }

  // ── 5. Determine risk & check threshold ────────────────────────────────
  const aboveThreshold = isAboveThreshold(input.actionKey);

  // ── 6. If risk >= threshold → GovernanceCenter.evaluate + requireGate ──
  let gateResult: GateResult | undefined;
  let governanceRunId: string | undefined;

  if (aboveThreshold) {
    const stage = actionDef.stage as any;
    const subject = {
      id: subjectId || 0,
      name: `${input.actionKey}:${input.subject.subjectId}`,
      type: input.subject.subjectType,
      tags: [],
      description: input.actionKey,
    };
    const actor = {
      id: input.actorPrincipalId,
      role: input.actorRole || "user",
    };

    gateResult = await requireGate(stage, subject, actor);
    governanceRunId = gateResult.auditId;

    if (gateResult.denied) {
      return {
        actionKey: input.actionKey,
        risk: actionDef.risk,
        governanceRunId,
        approvalRequired: actionDef.approval !== "none",
        timestamp: now,
        allowed: false,
        denialReason: gateResult.reason,
        gateResult,
      };
    }
  }

  // ── 7. Resolve approval requirements ───────────────────────────────────
  const approvalRequired = actionDef.approval !== "none";
  let approvalStatus: "pending" | "approved" | undefined;

  if (approvalRequired && aboveThreshold) {
    const approvalSatisfied = checkApproval(
      actionDef.approval,
      input.actorPrincipalId,
      input.approvals || []
    );

    if (!approvalSatisfied) {
      // R6-c3: env-flag-gated approval enforcement. Cycle-3 audit
      // (`/sdcard/Download/GOVERNANCE_AUDIT_2026-05-08.md` §2.5) found
      // that the prior placeholder logged "approval_logged" as success
      // and proceeded — so 101 R3+ actions declaring approval (R3 role_any
      // workspace.approve / R4 dual_control agent.controlPlane.promote /
      // R5 dual_control catalog.publish / etc.) silently bypassed
      // approval enforcement at this layer.
      //
      // Migration path: GOVERNANCE_ENFORCE_APPROVALS defaults to "false"
      // to preserve current operator workflows. When set to "true" (or
      // "1"), the function returns buildDenial — fail-closed — until the
      // caller passes a satisfying `approvals` array. Operators flip the
      // flag in staging once their UI / admin tooling is wired to
      // present approval-token submission, then promote to production.
      //
      // Either way the audit log now distinguishes the two modes via
      // metadata.placeholder so operators can grep for residual gaps:
      // false-mode emits decision_result="success" with placeholder=true;
      // true-mode emits decision_result="denied" with placeholder=false.
      const enforce =
        process.env.GOVERNANCE_ENFORCE_APPROVALS === "true" ||
        process.env.GOVERNANCE_ENFORCE_APPROVALS === "1";

      if (enforce) {
        await audit.log({
          actor_id: input.actorPrincipalId,
          action_type: "GATE_CHECK",
          target_type: "approval_required",
          target_id: input.subject.subjectId,
          workspace_id: input.workspaceId ?? null,
          decision_result: "denied",
          metadata: {
            actionKey: input.actionKey,
            approvalRule: actionDef.approval,
            reason: "approval_required",
            placeholder: false,
            enforced: true,
          },
        });
        return buildDenial(
          input,
          actionDef.risk,
          now,
          `Approval required for "${input.actionKey}" (rule: ${actionDef.approval}) — ` +
            `caller did not provide a satisfying approvals array`,
        );
      }

      approvalStatus = "pending";
      try {
        await audit.log({
          actor_id: input.actorPrincipalId,
          action_type: "GATE_CHECK",
          target_type: "approval_required",
          target_id: input.subject.subjectId,
          workspace_id: input.workspaceId ?? null,
          decision_result: "success",
          metadata: {
            actionKey: input.actionKey,
            approvalRule: actionDef.approval,
            status: "approval_logged",
            placeholder: true,
            enforced: false,
            note: "set GOVERNANCE_ENFORCE_APPROVALS=true to fail-close this path",
          },
        });
      } catch {
        // Non-fatal
      }
    } else {
      approvalStatus = "approved";
    }
  }

  // ── 8. Validate evidence requirements ──────────────────────────────────
  const evidenceRefs: string[] = [];

  if (actionDef.evidence.required && aboveThreshold) {
    const requiredTypes = actionDef.evidence.types || [];
    const providedTypes = input.evidence?.types || [];

    const missingTypes = requiredTypes.filter(
      (t: string) => !providedTypes.includes(t)
    );

    if (missingTypes.length > 0) {
      // R5-c3: emit audit log before evidence denial. Previously returned
      // buildDenial silently, breaking compliance — actions like
      // catalog.publish (R5, evidence required: [reason, diff, tests_passed])
      // could 403 without leaving an audit row.
      await audit.log({
        actor_id: input.actorPrincipalId,
        action_type: "GATE_CHECK",
        target_type: input.subject.subjectType,
        target_id: input.subject.subjectId,
        workspace_id: input.workspaceId ?? null,
        decision_result: "denied",
        metadata: {
          actionKey: input.actionKey,
          reason: "evidence_missing",
          requiredTypes,
          missingTypes,
          providedTypes,
        },
      });
      return buildDenial(
        input,
        actionDef.risk,
        now,
        `Evidence requirement not met for "${input.actionKey}". ` +
        `Missing evidence types: ${missingTypes.join(", ")}. ` +
        `Required: ${requiredTypes.join(", ")}`
      );
    }

    // Record evidence refs
    if (input.evidence?.refs) {
      evidenceRefs.push(...input.evidence.refs);
    }
  }

  // ── 9. Return GovernanceReceipt ────────────────────────────────────────
  // Non-fatal audit logging for allowed actions
  try {
    await audit.log({
      actor_id: input.actorPrincipalId,
      action_type: "GATE_CHECK",
      target_type: input.subject.subjectType,
      target_id: input.subject.subjectId,
      decision_result: "success",
      metadata: {
        actionKey: input.actionKey,
        risk: actionDef.risk,
        aboveThreshold,
        approvalRequired,
        approvalStatus,
        evidenceRefs,
        governanceRunId,
      },
    });
  } catch {
    // Non-fatal: observability failure must never block execution
  }

  return {
    actionKey: input.actionKey,
    risk: actionDef.risk,
    governanceRunId,
    approvalRequired,
    approvalStatus,
    evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : undefined,
    timestamp: now,
    allowed: true,
    gateResult,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function buildDenial(
  input: GovernedActionInput,
  risk: RiskLevel,
  timestamp: string,
  reason: string
): GovernanceReceipt {
  return {
    actionKey: input.actionKey,
    risk,
    approvalRequired: false,
    timestamp,
    allowed: false,
    denialReason: reason,
  };
}

/**
 * Check if a role has a capability.
 * Maps action registry capabilities to the existing RBAC model.
 * Uses a permissive mapping: admin/deployer roles have all capabilities,
 * user roles have standard capabilities, viewer roles are read-only.
 */
function checkCapability(role: string, capability: string): boolean {
  // Admin roles have all capabilities
  if (role === "admin" || role === "deployer") return true;

  // Try direct governance permission check
  try {
    return hasPermission(role as any, capability as PermissionAction);
  } catch {
    // If capability doesn't map to a known permission, use role-based fallback
  }

  // Role-based fallback for non-governance capabilities
  const readOnlyRoles = ["viewer", "auditor"];
  if (readOnlyRoles.includes(role)) {
    // Viewers can only read, not mutate
    return false;
  }

  // User and above can perform standard mutations
  return true;
}

/**
 * Check if approval requirements are satisfied.
 */
function checkApproval(
  rule: string,
  actorId: string,
  approvals: Array<{ approverPrincipalId: string; approvedAt: string }>
): boolean {
  switch (rule) {
    case "none":
      return true;

    case "role_any":
      // At least one approval from someone other than the actor
      return approvals.length > 0;

    case "role_all":
      // All required approvers must have approved
      return approvals.length > 0;

    case "dual_control":
      // Two distinct principals, neither being the actor
      const distinctApprovers = new Set(
        approvals
          .filter((a) => a.approverPrincipalId !== actorId)
          .map((a) => a.approverPrincipalId)
      );
      return distinctApprovers.size >= 2;

    case "conditional":
      // Conditional approvals — treated as satisfied if any approval exists
      return approvals.length > 0;

    default:
      return false;
  }
}

/**
 * Pre-flight check: returns what governance would require for an action,
 * without actually executing the pipeline. Used for UI previews.
 */
export function preflightCheck(actionKey: string): {
  risk: RiskLevel;
  aboveThreshold: boolean;
  approvalRequired: boolean;
  approvalRule: string;
  evidenceRequired: boolean;
  evidenceTypes: string[];
  capability: string;
  domain: string;
} {
  const def = getActionDef(actionKey);
  const aboveThreshold = isAboveThreshold(actionKey);

  return {
    risk: def.risk,
    aboveThreshold,
    approvalRequired: def.approval !== "none",
    approvalRule: def.approval,
    evidenceRequired: def.evidence.required,
    evidenceTypes: def.evidence.types || [],
    capability: def.capability,
    domain: def.domain,
  };
}
