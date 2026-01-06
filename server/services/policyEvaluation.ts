/**
 * Policy Evaluation Service
 * Evaluates agents against governance policies to determine promotion eligibility
 */

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

/**
 * Evaluate an agent against policy rules
 */
export function evaluateAgentCompliance(agent: Agent, rules: PolicyRule): PolicyEvaluationResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // Check budget limits
  if (rules.maxBudget !== undefined) {
    // In a real implementation, this would check actual usage
    // For now, we'll check if the agent is configured for high-cost operations
    if (agent.temperature && parseFloat(agent.temperature) > 1.5) {
      violations.push(`Agent temperature (${agent.temperature}) exceeds policy limit for budget control`);
      score -= 20;
    }
  }

  // Check token limits
  if (rules.maxTokensPerRequest !== undefined) {
    // Check system prompt length as a proxy for token usage
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

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
    score,
  };
}

/**
 * Extract rules from policy content
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
 * Get policy compliance score description
 */
export function getComplianceScoreDescription(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Poor";
  return "Critical";
}
