/**
 * Autonomous Remediation Engine
 * 
 * Automatically fixes safe policy violations without human intervention
 * Operates within blast radius limits and requires approval for high-risk changes
 */

import { getDb } from "../db";
import { evaluatePolicy } from "./opa-engine";
import { DriftReport } from "./drift-detector";
import { eq } from "drizzle-orm";
import { agents } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";

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

// Helper functions
function extractNumberFromMessage(message: string, keyword: string): number {
  const match = message.match(new RegExp(`${keyword}[:\\s]*(\\d+)`));
  return match ? parseInt(match[1]) : 0;
}

function extractCapabilityFromMessage(message: string): string {
  const match = message.match(/capability[:\\s]*['"]([^'"]+)['"]/);
  return match ? match[1] : "";
}
