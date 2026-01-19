/**
 * LLM Policy Engine - Policy evaluation and admission control
 *
 * This is a basic implementation that simulates OPA policy evaluation.
 * In production, this would integrate with actual Open Policy Agent.
 *
 * Validates LLM configurations against policy rules:
 * - Naming conventions
 * - Role-based restrictions
 * - Model allowlists
 * - Parameter bounds
 * - Environment constraints
 */

import { createHash } from "crypto";

// ============================================================================
// Types
// ============================================================================

export type PolicyDecision = "allow" | "warn" | "deny";

export interface PolicyViolation {
  level: "error" | "warning" | "info";
  rule: string;
  message: string;
  field?: string;
  suggestion?: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  violations: PolicyViolation[];
  warnings: PolicyViolation[];
  policyHash: string;
  evaluatedAt: Date;
  metadata?: {
    policyVersion: string;
    rulesEvaluated: number;
  };
}

export interface LLMPolicyInput {
  identity: {
    name: string;
    role: string;
    ownerTeam?: string;
  };
  configuration: {
    runtime: {
      type: string;
      provider?: string;
      endpoint?: string;
    };
    model: {
      name: string;
      version?: string;
      contextLength?: number;
    };
    parameters?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      streaming?: boolean;
    };
    capabilities?: {
      tools?: string[];
      functions?: string[];
    };
  };
  environment: "sandbox" | "governed" | "production";
}

// ============================================================================
// Policy Rules
// ============================================================================

/**
 * Policy Rules - In production, these would come from OPA bundles
 */
const POLICY_RULES = {
  naming: {
    pattern: /^[a-z][a-z0-9-]*[a-z0-9]$/,
    maxLength: 64,
    minLength: 3,
    reservedPrefixes: ["system-", "admin-", "root-"],
  },

  roles: {
    allowed: ["planner", "executor", "router", "guard", "observer", "embedder"],
    requiresApproval: ["guard"], // Guards need extra approval in production
  },

  models: {
    allowlist: {
      cloud: [
        "claude-sonnet-4-5-20250929",
        "claude-opus-4-5-20251101",
        "gpt-4",
        "gpt-4-turbo",
        "gemini-pro",
      ],
      local: ["llama-3", "mixtral", "phi-3"],
    },
    contextLimits: {
      max: 1000000, // 1M tokens max
      recommended: 200000,
    },
  },

  parameters: {
    temperature: { min: 0.0, max: 2.0, recommended: { min: 0.5, max: 1.0 } },
    maxTokens: { min: 100, max: 100000, recommended: { min: 1000, max: 8192 } },
    topP: { min: 0.0, max: 1.0 },
  },

  environments: {
    sandbox: {
      maxTemperature: 2.0, // Allow experimentation
      requireApproval: false,
    },
    governed: {
      maxTemperature: 1.5,
      requireApproval: false,
    },
    production: {
      maxTemperature: 1.0, // Conservative in prod
      requireApproval: true,
    },
  },
};

// ============================================================================
// Policy Engine
// ============================================================================

export class LLMPolicyEngine {
  /**
   * Evaluate an LLM configuration against policy rules
   */
  static evaluate(input: LLMPolicyInput): PolicyEvaluationResult {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyViolation[] = [];

    // Run all policy checks
    this.checkNaming(input, violations, warnings);
    this.checkRole(input, violations, warnings);
    this.checkModel(input, violations, warnings);
    this.checkParameters(input, violations, warnings);
    this.checkEnvironment(input, violations, warnings);

    // Determine overall decision
    const decision = this.determineDecision(violations, warnings);

    // Compute policy hash (for audit trail)
    const policyHash = this.computePolicyHash();

    return {
      decision,
      violations: violations.filter((v) => v.level === "error"),
      warnings: warnings.filter((w) => w.level === "warning" || w.level === "info"),
      policyHash,
      evaluatedAt: new Date(),
      metadata: {
        policyVersion: "1.0.0",
        rulesEvaluated: 5,
      },
    };
  }

  /**
   * Check naming conventions
   */
  private static checkNaming(
    input: LLMPolicyInput,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ) {
    const { name } = input.identity;

    // Pattern check
    if (!POLICY_RULES.naming.pattern.test(name)) {
      violations.push({
        level: "error",
        rule: "naming.pattern",
        field: "name",
        message: "Name must be lowercase alphanumeric with hyphens (e.g., my-llm-name)",
        suggestion: "Use only lowercase letters, numbers, and hyphens. Must start with a letter.",
      });
    }

    // Length check
    if (name.length < POLICY_RULES.naming.minLength) {
      violations.push({
        level: "error",
        rule: "naming.minLength",
        field: "name",
        message: `Name must be at least ${POLICY_RULES.naming.minLength} characters`,
      });
    }

    if (name.length > POLICY_RULES.naming.maxLength) {
      violations.push({
        level: "error",
        rule: "naming.maxLength",
        field: "name",
        message: `Name must not exceed ${POLICY_RULES.naming.maxLength} characters`,
      });
    }

    // Reserved prefix check
    for (const prefix of POLICY_RULES.naming.reservedPrefixes) {
      if (name.startsWith(prefix)) {
        violations.push({
          level: "error",
          rule: "naming.reservedPrefix",
          field: "name",
          message: `Name cannot start with reserved prefix: ${prefix}`,
          suggestion: "Choose a different name prefix",
        });
      }
    }
  }

  /**
   * Check role constraints
   */
  private static checkRole(
    input: LLMPolicyInput,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ) {
    const { role } = input.identity;

    // Allowed roles check
    if (!POLICY_RULES.roles.allowed.includes(role)) {
      violations.push({
        level: "error",
        rule: "role.notAllowed",
        field: "role",
        message: `Role "${role}" is not in the allowed list`,
        suggestion: `Use one of: ${POLICY_RULES.roles.allowed.join(", ")}`,
      });
    }

    // Production guard role warning
    if (
      input.environment === "production" &&
      POLICY_RULES.roles.requiresApproval.includes(role)
    ) {
      warnings.push({
        level: "warning",
        rule: "role.requiresApproval",
        field: "role",
        message: `Role "${role}" in production requires additional approval`,
        suggestion: "Ensure security team has reviewed this guard configuration",
      });
    }
  }

  /**
   * Check model configuration
   */
  private static checkModel(
    input: LLMPolicyInput,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ) {
    const { model } = input.configuration;
    const { runtime } = input.configuration;

    // Model allowlist check
    const runtimeType = runtime.type === "cloud" ? "cloud" : "local";
    const allowedModels = POLICY_RULES.models.allowlist[runtimeType];

    const isModelAllowed = allowedModels.some((allowed) =>
      model.name.toLowerCase().includes(allowed.toLowerCase())
    );

    if (!isModelAllowed && input.environment !== "sandbox") {
      violations.push({
        level: "error",
        rule: "model.notAllowed",
        field: "model.name",
        message: `Model "${model.name}" is not in the ${runtimeType} allowlist for ${input.environment}`,
        suggestion: `Approved models: ${allowedModels.join(", ")}`,
      });
    }

    // Context length check
    if (model.contextLength) {
      if (model.contextLength > POLICY_RULES.models.contextLimits.max) {
        violations.push({
          level: "error",
          rule: "model.contextLength.max",
          field: "model.contextLength",
          message: `Context length ${model.contextLength} exceeds maximum ${POLICY_RULES.models.contextLimits.max}`,
        });
      }

      if (model.contextLength > POLICY_RULES.models.contextLimits.recommended) {
        warnings.push({
          level: "warning",
          rule: "model.contextLength.recommended",
          field: "model.contextLength",
          message: `Context length ${model.contextLength} exceeds recommended ${POLICY_RULES.models.contextLimits.recommended}`,
          suggestion: "Large context windows may impact performance and cost",
        });
      }
    }
  }

  /**
   * Check inference parameters
   */
  private static checkParameters(
    input: LLMPolicyInput,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ) {
    const { parameters } = input.configuration;

    // Skip if no parameters defined
    if (!parameters) return;

    // Temperature check
    if (parameters.temperature !== undefined) {
      const { min, max, recommended } = POLICY_RULES.parameters.temperature;

      if (parameters.temperature < min || parameters.temperature > max) {
        violations.push({
          level: "error",
          rule: "parameters.temperature.range",
          field: "parameters.temperature",
          message: `Temperature ${parameters.temperature} outside allowed range [${min}, ${max}]`,
        });
      }

      if (
        parameters.temperature < recommended.min ||
        parameters.temperature > recommended.max
      ) {
        warnings.push({
          level: "warning",
          rule: "parameters.temperature.recommended",
          field: "parameters.temperature",
          message: `Temperature ${parameters.temperature} outside recommended range [${recommended.min}, ${recommended.max}]`,
          suggestion: "Extreme values may produce unpredictable results",
        });
      }
    }

    // Max tokens check
    if (parameters.maxTokens !== undefined) {
      const { min, max, recommended } = POLICY_RULES.parameters.maxTokens;

      if (parameters.maxTokens < min || parameters.maxTokens > max) {
        violations.push({
          level: "error",
          rule: "parameters.maxTokens.range",
          field: "parameters.maxTokens",
          message: `Max tokens ${parameters.maxTokens} outside allowed range [${min}, ${max}]`,
        });
      }

      if (
        parameters.maxTokens < recommended.min ||
        parameters.maxTokens > recommended.max
      ) {
        warnings.push({
          level: "info",
          rule: "parameters.maxTokens.recommended",
          field: "parameters.maxTokens",
          message: `Max tokens ${parameters.maxTokens} outside typical range [${recommended.min}, ${recommended.max}]`,
        });
      }
    }

    // Top P check
    if (parameters.topP !== undefined) {
      const { min, max } = POLICY_RULES.parameters.topP;

      if (parameters.topP < min || parameters.topP > max) {
        violations.push({
          level: "error",
          rule: "parameters.topP.range",
          field: "parameters.topP",
          message: `Top P ${parameters.topP} outside allowed range [${min}, ${max}]`,
        });
      }
    }
  }

  /**
   * Check environment-specific constraints
   */
  private static checkEnvironment(
    input: LLMPolicyInput,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ) {
    const envRules = POLICY_RULES.environments[input.environment];

    // Temperature check for environment
    if (
      input.configuration.parameters?.temperature &&
      input.configuration.parameters.temperature > envRules.maxTemperature
    ) {
      violations.push({
        level: "error",
        rule: "environment.maxTemperature",
        field: "parameters.temperature",
        message: `Temperature ${input.configuration.parameters.temperature} exceeds ${input.environment} limit of ${envRules.maxTemperature}`,
        suggestion: `Reduce temperature or deploy to sandbox for experimentation`,
      });
    }

    // Approval requirement
    if (envRules.requireApproval) {
      warnings.push({
        level: "info",
        rule: "environment.requiresApproval",
        message: `Deployment to ${input.environment} requires approval workflow`,
        suggestion: "This configuration will need approval before becoming callable",
      });
    }
  }

  /**
   * Determine overall policy decision
   */
  private static determineDecision(
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ): PolicyDecision {
    const errors = violations.filter((v) => v.level === "error");

    if (errors.length > 0) {
      return "deny";
    }

    const warningsOnly = warnings.filter((w) => w.level === "warning");
    if (warningsOnly.length > 0) {
      return "warn";
    }

    return "allow";
  }

  /**
   * Compute policy hash for audit trail
   */
  private static computePolicyHash(): string {
    const policyContent = JSON.stringify(POLICY_RULES, null, 2);
    return createHash("sha256").update(policyContent).digest("hex");
  }
}
