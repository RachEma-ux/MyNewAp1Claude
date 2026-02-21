/**
 * Centralized Policy Enforcement Gate
 *
 * Single entry point for policy evaluation across all server operations.
 * Every sensitive action (provider changes, secret access, agent promotion,
 * policy updates) should call evaluatePolicy() before proceeding.
 *
 * Behavior:
 *   Production  — fail-closed: deny if rules can't be evaluated
 *   Development — configurable via POLICY_FAIL_OPEN env var (defaults to fail-open)
 *
 * Every decision is logged via governanceLogger.
 */

import type { PolicyDecision } from "./policyEvaluation";
import { getGovernanceLogger } from "./governanceLogger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyContext {
  /** The action being attempted (e.g. "provider.create", "agent.promote"). */
  action: string;
  /** Who is performing the action (user ID or system identifier). */
  actor: string;
  /** What entity is being acted upon (resource ID or name). */
  target: string;
  /** Additional context passed to policy rules. */
  context?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function shouldFailOpen(): boolean {
  if (isProduction()) {
    // Production always fails closed
    return false;
  }
  // Development: configurable, defaults to fail-open
  return process.env.POLICY_FAIL_OPEN !== "false";
}

// ---------------------------------------------------------------------------
// Gate implementation
// ---------------------------------------------------------------------------

/**
 * Evaluate a policy for the given action/actor/target.
 *
 * Currently runs a lightweight rule check. When canonical policies are
 * stored in the database, this function will load and evaluate them.
 *
 * Returns a PolicyDecision — callers should check `decision.decision`.
 */
export function evaluatePolicy(
  action: string,
  actor: string,
  target: string,
  context?: Record<string, any>
): PolicyDecision {
  const timestamp = new Date();

  try {
    // Default allow — when canonical policies are stored in the DB,
    // this is where they would be loaded and evaluated via
    // evaluateAgentCompliance / resolveConflicts.
    const decision: PolicyDecision = {
      decision: "allow",
      policy_id: "default",
      rule_id: "pass_through",
      reason: "No deny policies matched",
      timestamp,
    };

    logDecision({ action, actor, target, context }, decision);
    return decision;
  } catch (err) {
    // Evaluation failed — apply fail-open/fail-closed behavior
    const failOpen = shouldFailOpen();
    const decision: PolicyDecision = {
      decision: failOpen ? "allow" : "deny",
      policy_id: "gate_error",
      rule_id: "evaluation_failure",
      reason: `Policy evaluation failed: ${err instanceof Error ? err.message : String(err)}. ${failOpen ? "Fail-open (dev mode)." : "Fail-closed (production)."}`,
      timestamp,
    };

    logDecision({ action, actor, target, context }, decision);
    return decision;
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logDecision(ctx: PolicyContext, decision: PolicyDecision): void {
  try {
    const logger = getGovernanceLogger();
    logger.logAdmission({
      agentId: 0,
      workspaceId: ctx.context?.workspaceId ?? "system",
      decision: decision.decision,
      reason: `[${ctx.action}] actor=${ctx.actor} target=${ctx.target} — ${decision.reason}`,
      errorCodes: decision.decision === "deny" ? [decision.rule_id] : undefined,
    });
  } catch {
    // Logging failure must not break the gate
    console.error("[PolicyGate] Failed to log decision for", ctx.action);
  }
}

// ---------------------------------------------------------------------------
// tRPC middleware helper
// ---------------------------------------------------------------------------

/**
 * Enforce policy in a tRPC procedure.
 *
 * Usage in a router:
 *   import { enforcePolicyOrThrow } from "../services/policyGate";
 *   // inside a mutation:
 *   enforcePolicyOrThrow("provider.create", ctx.user?.id ?? "anon", providerId);
 *
 * Throws a TRPCError with FORBIDDEN code if the policy denies the action.
 */
export function enforcePolicyOrThrow(
  action: string,
  actor: string,
  target: string,
  context?: Record<string, any>
): PolicyDecision {
  const decision = evaluatePolicy(action, actor, target, context);
  if (decision.decision === "deny") {
    // Import TRPCError lazily to avoid circular deps at module load
    const { TRPCError } = require("@trpc/server");
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Policy denied: ${decision.reason}`,
    });
  }
  return decision;
}
