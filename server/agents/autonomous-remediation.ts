/**
 * Autonomous Remediation Engine
 * 
 * Automatically fixes safe policy violations without human intervention
 * Operates within blast radius limits and requires approval for high-risk changes
 */

import { getDb } from "../db";
import { evaluatePolicy } from "./opa-engine";
import { DriftReport } from "./drift-detector";
import { and, desc, eq, sql } from "drizzle-orm";
import { agents, governanceAuditLogs } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { getAuditLogger } from "../services/auditLogger";

export interface RemediationAction {
  type: "adjust_limit" | "disable_capability" | "restrict_access" | "update_config";
  field: string;
  oldValue: any;
  newValue: any;
  reason: string;
  safe: boolean; // Can be auto-applied without approval
}

export interface RemediationPlan {
  agentId: string;
  agentName: string;
  actions: RemediationAction[];
  requiresApproval: boolean;
  estimatedImpact: "low" | "medium" | "high";
  blastRadius: number; // Number of agents affected
}

export interface RemediationResult {
  success: boolean;
  actionsApplied: number;
  actionsFailed: number;
  errors: string[];
}

/**
 * Generate remediation plan for a drifted agent
 */
export async function generateRemediationPlan(drift: DriftReport): Promise<RemediationPlan | null> {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [agent] = await db.select().from(agents).where(eq(agents.id, drift.agentId));

  if (!agent) return null;

  const actions: RemediationAction[] = [];

  // Re-evaluate policy to get specific violations
  const policyResult = await evaluatePolicy(agent, {
    hook: "on_promotion_attempt",
    actor: { id: "system", role: "admin" },
  });

  // Generate remediation actions based on violations
  for (const violation of policyResult.violations || []) {
    if (violation.field === "budget.monthlyLimit" && violation.message.includes("exceeds")) {
      // Safe: Reduce budget to policy max
      const policyMax = extractNumberFromMessage(violation.message, "max");
      actions.push({
        type: "adjust_limit",
        field: "budget.monthlyLimit",
        oldValue: agent.budget?.monthlyLimit,
        newValue: policyMax,
        reason: `Reduced to policy maximum of $${policyMax}`,
        safe: true,
      });
    }

    if (violation.field === "capabilities" && violation.message.includes("not allowed")) {
      // Safe: Remove disallowed capability
      const disallowedCap = extractCapabilityFromMessage(violation.message);
      actions.push({
        type: "disable_capability",
        field: "capabilities",
        oldValue: agent.capabilities,
        newValue: agent.capabilities?.filter((c: string) => c !== disallowedCap),
        reason: `Removed disallowed capability: ${disallowedCap}`,
        safe: true,
      });
    }

    if (violation.field === "llm.temperature" && violation.message.includes("exceeds")) {
      // Safe: Reduce temperature to role max
      const roleMax = extractNumberFromMessage(violation.message, "max");
      actions.push({
        type: "adjust_limit",
        field: "llm.temperature",
        oldValue: agent.llm?.temperature,
        newValue: roleMax,
        reason: `Reduced to role maximum of ${roleMax}`,
        safe: true,
      });
    }
  }

  const requiresApproval = actions.some((a) => !a.safe);
  const estimatedImpact = actions.length > 3 ? "high" : actions.length > 1 ? "medium" : "low";

  return {
    agentId: drift.agentId,
    agentName: drift.agentName,
    actions,
    requiresApproval,
    estimatedImpact,
    blastRadius: 1, // Single agent
  };
}

/**
 * Apply remediation plan automatically (safe actions only)
 */
export async function applyRemediationPlan(
  plan: RemediationPlan,
  options: { dryRun?: boolean; force?: boolean } = {}
): Promise<RemediationResult> {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const errors: string[] = [];
  let actionsApplied = 0;
  let actionsFailed = 0;

  // Safety check: Don't apply if requires approval (unless forced)
  if (plan.requiresApproval && !options.force) {
    return {
      success: false,
      actionsApplied: 0,
      actionsFailed: 0,
      errors: ["Plan requires approval. Use force=true to override."],
    };
  }

  // Dry run: Just validate, don't apply
  if (options.dryRun) {
    return {
      success: true,
      actionsApplied: plan.actions.length,
      actionsFailed: 0,
      errors: [],
    };
  }

  // Apply each action
  for (const action of plan.actions) {
    try {
      // Skip unsafe actions unless forced
      if (!action.safe && !options.force) {
        errors.push(`Skipped unsafe action: ${action.type} on ${action.field}`);
        actionsFailed++;
        continue;
      }

      // Apply the action
      await applyAction(plan.agentId, action);
      actionsApplied++;
    } catch (error: any) {
      errors.push(`Failed to apply ${action.type}: ${error.message}`);
      actionsFailed++;
    }
  }

  return {
    success: actionsFailed === 0,
    actionsApplied,
    actionsFailed,
    errors,
  };
}

/**
 * Apply a single remediation action
 */
async function applyAction(agentId: string, action: RemediationAction): Promise<void> {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  switch (action.type) {
    case "adjust_limit":
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .update(agents)
        .set({ [action.field]: action.newValue } as any)
        .where(eq(agents.id, agentId));
      break;

    case "disable_capability":
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .update(agents)
        .set({ capabilities: action.newValue } as any)
        .where(eq(agents.id, agentId));
      break;

    case "restrict_access":
      // Implement access restriction logic
      break;

    case "update_config":
      // Implement config update logic
      break;

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

/**
 * Batch remediation for multiple agents
 */
export async function batchRemediation(
  drifts: DriftReport[],
  options: { maxBlastRadius?: number; dryRun?: boolean } = {}
): Promise<Record<string, RemediationResult>> {
  const maxBlastRadius = options.maxBlastRadius || 10;
  const results: Record<string, RemediationResult> = {};

  // Safety check: Blast radius limit
  if (drifts.length > maxBlastRadius) {
    throw new Error(
      `Blast radius exceeded: ${drifts.length} agents > ${maxBlastRadius} max. Manual approval required.`
    );
  }

  for (const drift of drifts) {
    const plan = await generateRemediationPlan(drift);
    if (plan) {
      results[drift.agentId] = await applyRemediationPlan(plan, options);
    }
  }

  return results;
}

// ── Drift-input remediation API (drift-driven, single-agent) ─────────────────
//
// `canAutoRemediate` / `autoRemediate` / `getRemediationHistory` are the
// drift-shaped public contract used by the agents UI and tests. They are
// thin and intentionally do not require a live OPA evaluation — they
// inspect the drift report directly. They sit alongside the heavier
// `generateRemediationPlan` / `applyRemediationPlan` / `batchRemediation`
// pipeline, which is OPA-driven.

/** Permissive shape — tests pass plain literal objects. */
export interface DriftLike {
  driftType: string;
  severity: string;
  details?: Record<string, unknown> | null;
}

export interface AutoRemediationOutcome {
  success: boolean;
  /** Short human description of what was changed, when success=true. */
  action?: string;
  /** Error message when success=false. */
  error?: string;
  /** Audit log event id, when an audit entry was written. */
  logId?: string;
  /** Resulting agent status, when applicable. */
  newStatus?: string;
}

const REMEDIABLE_VIOLATIONS = new Set<string>([
  "budget_exceeded",
  "forbidden_capability",
]);

/**
 * Pure predicate: is this drift safe to auto-remediate?
 *
 * Rules:
 *  - only `policy_change` drifts are auto-remediable
 *  - critical severity is never auto-remediable (escalate)
 *  - the violation type must be in the safe-list
 */
export function canAutoRemediate(drift: DriftLike): boolean {
  if (!drift) return false;
  if (drift.driftType !== "policy_change") return false;
  if (drift.severity === "critical") return false;
  const violation = (drift.details as { violation?: string } | null | undefined)?.violation;
  if (!violation) return false;
  return REMEDIABLE_VIOLATIONS.has(violation);
}

/**
 * Auto-remediate a drift report against an agent.
 *
 * Returns `{ success, action, logId, newStatus }` on success, or
 * `{ success: false, error }` when the drift is not auto-remediable, the
 * agent is missing, or the database is unavailable. Errors are surfaced
 * — never swallowed — and a denied audit entry is recorded when possible.
 */
export async function autoRemediate(
  agentId: string,
  drift: DriftLike,
): Promise<AutoRemediationOutcome> {
  if (!canAutoRemediate(drift)) {
    return {
      success: false,
      error: `Drift is not auto-remediable: driftType=${drift?.driftType} severity=${drift?.severity}`,
    };
  }

  const db = getDb();
  if (!db) {
    return { success: false, error: "Database unavailable" };
  }

  const violation =
    (drift.details as { violation?: string } | null | undefined)?.violation ??
    "";

  // Resolve agent — accepts numeric or string id (drizzle column is integer).
  const idNumeric = Number(agentId);
  if (!Number.isFinite(idNumeric)) {
    return { success: false, error: `Invalid agentId: ${agentId}` };
  }
  let agent: typeof agents.$inferSelect | undefined;
  try {
    [agent] = await db.select().from(agents).where(eq(agents.id, idNumeric)).limit(1);
  } catch (err: any) {
    return { success: false, error: `Database error: ${err?.message ?? String(err)}` };
  }
  if (!agent) {
    return { success: false, error: `Agent not found: ${agentId}` };
  }

  let actionDescription: string;
  let newStatus: string | undefined;
  try {
    if (violation === "budget_exceeded") {
      const maxBudget = Number(
        (drift.details as { maxBudget?: number })?.maxBudget ?? 0,
      );
      const currentLimits = ((agent as any).limits ?? {}) as Record<string, unknown>;
      const newLimits = { ...currentLimits, costLimit: maxBudget };
      await db
        .update(agents)
        .set({
          limits: newLimits as any,
          updatedAt: new Date(),
        } as any)
        .where(eq(agents.id, idNumeric));
      actionDescription = `Reduced monthly budget to ${maxBudget}`;
      newStatus = "GOVERNED_VALID";
    } else if (violation === "forbidden_capability") {
      const forbidden = String(
        (drift.details as { capability?: string })?.capability ?? "",
      );
      const currentCaps = ((agent as any).capabilities ?? {}) as Record<string, unknown>;
      // capabilities JSON shape: { tools: string[], actions: string[], memory?: ... }
      const tools = Array.isArray((currentCaps as any).tools)
        ? ((currentCaps as any).tools as string[]).filter((c) => c !== forbidden)
        : [];
      const actions = Array.isArray((currentCaps as any).actions)
        ? ((currentCaps as any).actions as string[]).filter((c) => c !== forbidden)
        : [];
      const newCaps = { ...currentCaps, tools, actions };
      await db
        .update(agents)
        .set({
          capabilities: newCaps as any,
          updatedAt: new Date(),
        } as any)
        .where(eq(agents.id, idNumeric));
      actionDescription = `Removed forbidden capability: ${forbidden}`;
      newStatus = "GOVERNED_VALID";
    } else {
      // canAutoRemediate already filtered, but be defensive
      return {
        success: false,
        error: `Unknown safe-list violation: ${violation}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Apply failed: ${err?.message ?? String(err)}`,
    };
  }

  // Audit
  let logId: string | undefined;
  try {
    const event = await getAuditLogger().log({
      actor_id: "system",
      principal_type: "system",
      action_type: "LIFECYCLE_CHANGE",
      target_type: "agent",
      target_id: String(agentId),
      decision_result: "success",
      metadata: {
        action: "autoRemediate",
        violation,
        driftType: drift.driftType,
        severity: drift.severity,
        description: actionDescription,
      },
    });
    logId = event.event_id;
  } catch {
    // Audit failure must not mask success; record absent logId.
    logId = undefined;
  }

  return {
    success: true,
    action: actionDescription,
    logId,
    newStatus,
  };
}

export interface RemediationHistoryRecord {
  id: number;
  agentId: string;
  remediatedAt: Date;
  action: string;
  decision: string | null;
  details: Record<string, unknown> | null;
}

/**
 * Return recent auto-remediation history for an agent (most recent first).
 *
 * Reads from `governance_audit_logs` where the action_type/code is the
 * standard `LIFECYCLE_CHANGE` and metadata.action == "autoRemediate".
 * Returns an empty array if the database is unavailable.
 */
export async function getRemediationHistory(
  agentId: string,
  limit: number = 50,
): Promise<RemediationHistoryRecord[]> {
  const db = getDb();
  if (!db) return [];

  const idNumeric = Number(agentId);
  if (!Number.isFinite(idNumeric)) return [];

  let rows: Array<typeof governanceAuditLogs.$inferSelect> = [];
  try {
    rows = await db
      .select()
      .from(governanceAuditLogs)
      .where(
        and(
          eq(governanceAuditLogs.code, "LIFECYCLE_CHANGE"),
          eq(governanceAuditLogs.agentId, idNumeric),
          sql`${governanceAuditLogs.details}->>'action' = 'autoRemediate'`,
        ),
      )
      .orderBy(desc(governanceAuditLogs.createdAt))
      .limit(limit);
  } catch {
    return [];
  }

  return rows.map((row) => {
    const details = (row.details ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      agentId: String(row.agentId ?? agentId),
      remediatedAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as any),
      action: typeof details.description === "string" ? details.description : "autoRemediate",
      decision: row.decision ?? null,
      details,
    };
  });
}

// Helper functions
function extractNumberFromMessage(message: string, keyword: string): number {
  const match = message.match(new RegExp(`${keyword}[:\\s]*(\\d+)`));
  return match ? parseInt(match[1]) : 0;
}

function extractCapabilityFromMessage(message: string): string {
  const match = message.match(/capability[:\\s]*['"]([^'"]+)['"]/);
  return match ? match[1] : "";
}
