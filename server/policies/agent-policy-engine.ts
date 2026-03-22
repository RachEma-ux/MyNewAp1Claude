/**
 * Agent Policy Engine — Rule-based policy evaluation for Agents.
 *
 * Checks:
 * - Naming conventions
 * - Role class validation
 * - Model binding
 * - System prompt requirements
 * - Capability and tool restrictions
 * - Temperature bounds
 */

import { BasePolicyEngine, type PolicyViolation } from "./domain-policy-engine";

export interface AgentPolicyInput {
  name: string;
  roleClass: string;
  modelId: string;
  systemPrompt: string;
  temperature?: number;
  capabilities?: {
    tools?: string[];
    actions?: string[];
    memory?: Record<string, any>;
  };
  limits?: {
    rateLimit?: number;
    costLimit?: number;
    executionTimeout?: number;
  };
  hasToolAccess?: boolean;
  allowedTools?: string[];
  mode: "sandbox" | "governed";
}

const AGENT_POLICY_RULES = {
  naming: {
    minLength: 2,
    maxLength: 255,
  },
  roleClasses: {
    allowed: ["assistant", "analyst", "executor", "monitor", "compliance", "analysis", "ideation"],
    governedRestricted: ["executor"], // executor in governed mode needs extra scrutiny
  },
  temperature: {
    min: 0.0,
    max: 2.0,
    governedMax: 1.2,
  },
  systemPrompt: {
    minLength: 10,
    maxLength: 100000,
  },
  tools: {
    maxPerAgent: 50,
    restricted: ["shell_exec", "file_delete", "db_drop"],
  },
  limits: {
    executionTimeout: { min: 1000, max: 600000 },
    costLimit: { min: 0, max: 1000 },
  },
};

export class AgentPolicyEngine extends BasePolicyEngine<AgentPolicyInput> {
  protected domain = "agent";
  protected policyVersion = "1.0.0";
  protected rules = AGENT_POLICY_RULES;

  protected runChecks(
    input: AgentPolicyInput,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ): void {
    // Naming
    this.checkNaming(input.name, violations, {
      minLength: AGENT_POLICY_RULES.naming.minLength,
      maxLength: AGENT_POLICY_RULES.naming.maxLength,
    });

    // Role class
    if (!AGENT_POLICY_RULES.roleClasses.allowed.includes(input.roleClass)) {
      violations.push({
        level: "error",
        rule: "roleClass.notAllowed",
        field: "roleClass",
        message: `Role class "${input.roleClass}" is not in the allowed list`,
        suggestion: `Use one of: ${AGENT_POLICY_RULES.roleClasses.allowed.join(", ")}`,
      });
    }

    // Governed executor warning
    if (
      input.mode === "governed" &&
      AGENT_POLICY_RULES.roleClasses.governedRestricted.includes(input.roleClass)
    ) {
      warnings.push({
        level: "warning",
        rule: "roleClass.governedRestricted",
        field: "roleClass",
        message: `Role class "${input.roleClass}" in governed mode requires additional review`,
        suggestion: "Ensure security team has reviewed executor capabilities",
      });
    }

    // Model binding
    if (!input.modelId) {
      violations.push({
        level: "error",
        rule: "model.required",
        field: "modelId",
        message: "Agent must have a model assigned",
      });
    }

    // System prompt
    if (!input.systemPrompt || input.systemPrompt.trim().length < AGENT_POLICY_RULES.systemPrompt.minLength) {
      violations.push({
        level: "error",
        rule: "systemPrompt.tooShort",
        field: "systemPrompt",
        message: `System prompt must be at least ${AGENT_POLICY_RULES.systemPrompt.minLength} characters`,
      });
    }
    if (input.systemPrompt && input.systemPrompt.length > AGENT_POLICY_RULES.systemPrompt.maxLength) {
      violations.push({
        level: "error",
        rule: "systemPrompt.tooLong",
        field: "systemPrompt",
        message: `System prompt exceeds ${AGENT_POLICY_RULES.systemPrompt.maxLength} characters`,
      });
    }

    // Temperature
    if (input.temperature !== undefined) {
      if (input.temperature < AGENT_POLICY_RULES.temperature.min || input.temperature > AGENT_POLICY_RULES.temperature.max) {
        violations.push({
          level: "error",
          rule: "temperature.range",
          field: "temperature",
          message: `Temperature ${input.temperature} outside allowed range [${AGENT_POLICY_RULES.temperature.min}, ${AGENT_POLICY_RULES.temperature.max}]`,
        });
      }
      if (input.mode === "governed" && input.temperature > AGENT_POLICY_RULES.temperature.governedMax) {
        warnings.push({
          level: "warning",
          rule: "temperature.governedMax",
          field: "temperature",
          message: `Temperature ${input.temperature} exceeds governed mode limit of ${AGENT_POLICY_RULES.temperature.governedMax}`,
        });
      }
    }

    // Tool restrictions
    if (input.hasToolAccess && input.allowedTools) {
      if (input.allowedTools.length > AGENT_POLICY_RULES.tools.maxPerAgent) {
        warnings.push({
          level: "warning",
          rule: "tools.tooMany",
          field: "allowedTools",
          message: `Agent has ${input.allowedTools.length} tools (max recommended: ${AGENT_POLICY_RULES.tools.maxPerAgent})`,
        });
      }

      for (const tool of input.allowedTools) {
        if (AGENT_POLICY_RULES.tools.restricted.includes(tool)) {
          violations.push({
            level: "error",
            rule: "tools.restricted",
            field: "allowedTools",
            message: `Tool "${tool}" is restricted and cannot be assigned to agents`,
          });
        }
      }
    }

    // Execution timeout
    if (input.limits?.executionTimeout !== undefined) {
      const { min, max } = AGENT_POLICY_RULES.limits.executionTimeout;
      if (input.limits.executionTimeout < min || input.limits.executionTimeout > max) {
        violations.push({
          level: "error",
          rule: "limits.executionTimeout",
          field: "limits.executionTimeout",
          message: `Execution timeout ${input.limits.executionTimeout}ms outside range [${min}, ${max}]`,
        });
      }
    }
  }

  static async evaluate(input: AgentPolicyInput) {
    const engine = new AgentPolicyEngine();
    return engine.evaluate(input);
  }
}
