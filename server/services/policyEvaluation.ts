/**
 * MVP Rule-Based Policy Scoring (not OPA)
 *
 * This service implements a lightweight, deterministic rule-based policy
 * evaluation engine. It scores agents against governance policies using
 * local rules — no external OPA server is required.
 *
 * ## Canonical Policy Schema
 *
 * CanonicalPolicy defines the standard shape for all policy documents:
 *   - policy_id:        Unique identifier for the policy
 *   - version:          Semver string (e.g. "1.0.0")
 *   - scope:            What entity the policy applies to ("agent" | "model" | "workspace")
 *   - conditions:       The rule constraints (uses the existing PolicyRule shape)
 *   - effect:           "allow" or "deny" — what happens when conditions match
 *   - priority:         Numeric priority; lower = evaluated first
 *   - failure_behavior: What to do if the rule can't be evaluated ("fail_open" | "fail_closed")
 *
 * PolicyDecision is the structured output of every evaluation:
 *   - decision:   "allow" or "deny"
 *   - policy_id:  Which policy produced this decision
 *   - rule_id:    Which rule within the policy triggered
 *   - reason:     Human-readable explanation
 *   - timestamp:  When the decision was made
 *
 * ## Conflict Resolution
 *
 * When multiple policies apply, explicit "deny" always overrides "allow"
 * (deny-wins). See resolveConflicts().
 */

// ---------------------------------------------------------------------------
// Existing interfaces (backward-compatible)
// ---------------------------------------------------------------------------

export interface PolicyRule {
  maxBudget?: number;
  maxTokensPerRequest?: number;
  allowedActions?: string[];
  deniedActions?: string[];
  allowedRoles?: string[];
  deniedRoles?: string[];
  requireApproval?: boolean;
  maxConcurrentExecutions?: number;
  allowDocumentAccess?: boolean;
  allowToolAccess?: boolean;
}

export interface PolicyEvaluationResult {
  compliant: boolean;
  violations: string[];
  warnings: string[];
  score: number; // 0-100
  /** Structured decision produced alongside the legacy result. */
  decision?: PolicyDecision;
}

export interface Agent {
  id: number;
  name: string;
  roleClass: string;
  temperature: string;
  hasDocumentAccess: boolean;
  hasToolAccess: boolean;
  allowedTools?: string[];
  systemPrompt: string;
}

// ---------------------------------------------------------------------------
// Canonical policy schema
// ---------------------------------------------------------------------------

/** Standard policy document shape. */
export interface CanonicalPolicy {
  /** Unique identifier for this policy. */
  policy_id: string;
  /** Semver version string (e.g. "1.0.0"). */
  version: string;
  /** What entity type this policy governs. */
  scope: "agent" | "model" | "workspace";
  /** Rule conditions — uses the existing PolicyRule shape. */
  conditions: PolicyRule;
  /** Effect when conditions match: allow the action or deny it. */
  effect: "allow" | "deny";
  /** Evaluation priority; lower numbers are evaluated first. */
  priority: number;
  /** Behavior when the rule cannot be evaluated. */
  failure_behavior: "fail_open" | "fail_closed";
}

/** Structured output of a single policy evaluation. */
export interface PolicyDecision {
  /** Final decision. */
  decision: "allow" | "deny";
  /** ID of the policy that produced this decision. */
  policy_id: string;
  /** ID of the specific rule that triggered. */
  rule_id: string;
  /** Human-readable explanation. */
  reason: string;
  /** When the decision was made. */
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Core evaluation (backward-compatible)
// ---------------------------------------------------------------------------

/**
 * Evaluate an agent against policy rules.
 *
 * Returns the legacy PolicyEvaluationResult (compliant, violations, score)
 * with an additional `decision` field containing a PolicyDecision.
 */
export function evaluateAgentCompliance(agent: Agent, rules: PolicyRule): PolicyEvaluationResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // Check budget limits
  if (rules.maxBudget !== undefined) {
    if (agent.temperature && parseFloat(agent.temperature) > 1.5) {
      violations.push(`Agent temperature (${agent.temperature}) exceeds policy limit for budget control`);
      score -= 20;
    }
  }

  // Check token limits
  if (rules.maxTokensPerRequest !== undefined) {
    if (agent.systemPrompt.length > rules.maxTokensPerRequest * 4) {
      violations.push(`Agent system prompt exceeds policy token limit (${rules.maxTokensPerRequest} tokens)`);
      score -= 15;
    }
  }

  // Check allowed actions
  if (rules.allowedActions && rules.allowedActions.length > 0) {
    const allowedRoleClasses = ["assistant", "analyst", "support", "reviewer"];
    if (!rules.allowedActions.includes(agent.roleClass) && !allowedRoleClasses.includes(agent.roleClass)) {
      violations.push(`Agent role class "${agent.roleClass}" is not in allowed actions list`);
      score -= 25;
    }
  }

  // Check denied actions
  if (rules.deniedActions && rules.deniedActions.length > 0) {
    if (rules.deniedActions.includes(agent.roleClass)) {
      violations.push(`Agent role class "${agent.roleClass}" is in denied actions list`);
      score -= 30;
    }
  }

  // Check allowed roles
  if (rules.allowedRoles && rules.allowedRoles.length > 0) {
    if (!rules.allowedRoles.includes(agent.roleClass)) {
      violations.push(`Agent role "${agent.roleClass}" is not in allowed roles list`);
      score -= 25;
    }
  }

  // Check denied roles
  if (rules.deniedRoles && rules.deniedRoles.length > 0) {
    if (rules.deniedRoles.includes(agent.roleClass)) {
      violations.push(`Agent role "${agent.roleClass}" is in denied roles list`);
      score -= 30;
    }
  }

  // Check document access
  if (rules.allowDocumentAccess === false && agent.hasDocumentAccess) {
    violations.push("Agent has document access but policy denies it");
    score -= 20;
  }

  // Check tool access
  if (rules.allowToolAccess === false && agent.hasToolAccess) {
    violations.push("Agent has tool access but policy denies it");
    score -= 20;
  }

  // Check allowed tools
  if (rules.allowedActions && agent.allowedTools && agent.allowedTools.length > 0) {
    const unauthorizedTools = agent.allowedTools.filter(
      (tool) => !rules.allowedActions!.includes(tool)
    );
    if (unauthorizedTools.length > 0) {
      warnings.push(`Agent has access to unauthorized tools: ${unauthorizedTools.join(", ")}`);
      score -= 10;
    }
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  const compliant = violations.length === 0;

  // Build structured PolicyDecision alongside legacy result
  const decision: PolicyDecision = {
    decision: compliant ? "allow" : "deny",
    policy_id: "default",
    rule_id: compliant ? "all_passed" : "violation",
    reason: compliant
      ? "Agent passes all policy checks"
      : violations.join("; "),
    timestamp: new Date(),
  };

  return {
    compliant,
    violations,
    warnings,
    score,
    decision,
  };
}

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

/**
 * Resolve conflicts when multiple PolicyDecisions apply.
 *
 * Rule: explicit deny always overrides allow (deny-wins).
 * Among denies, the one with the earliest timestamp wins.
 * If all decisions allow, the result is allow.
 */
export function resolveConflicts(decisions: PolicyDecision[]): PolicyDecision {
  if (decisions.length === 0) {
    return {
      decision: "deny",
      policy_id: "none",
      rule_id: "no_policies",
      reason: "No policies evaluated — default deny",
      timestamp: new Date(),
    };
  }

  const denies = decisions.filter((d) => d.decision === "deny");
  if (denies.length > 0) {
    // Pick the first deny (earliest timestamp)
    denies.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return denies[0];
  }

  // All allow — return the first
  return decisions[0];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract rules from policy content.
 */
export function extractPolicyRules(policyContent: any): PolicyRule {
  if (!policyContent || typeof policyContent !== "object") {
    return {};
  }

  // Support both flat and nested rule structures
  const rules = policyContent.rules || policyContent;

  return {
    maxBudget: rules.maxBudget,
    maxTokensPerRequest: rules.maxTokensPerRequest,
    allowedActions: rules.allowedActions,
    deniedActions: rules.deniedActions,
    allowedRoles: rules.allowedRoles,
    deniedRoles: rules.deniedRoles,
    requireApproval: rules.requireApproval,
    maxConcurrentExecutions: rules.maxConcurrentExecutions,
    allowDocumentAccess: rules.allowDocumentAccess,
    allowToolAccess: rules.allowToolAccess,
  };
}

/**
 * Get policy compliance score description.
 */
export function getComplianceScoreDescription(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Poor";
  return "Critical";
}
