/**
 * Provider Policy Engine — Rule-based policy evaluation for Providers.
 *
 * Checks:
 * - Naming conventions
 * - Provider type validation
 * - Configuration completeness
 * - Security policy tag validation
 * - Lifecycle state coherence
 */

import { BasePolicyEngine, type PolicyViolation } from "./domain-policy-engine";

export interface ProviderPolicyInput {
  name: string;
  type: string;
  enabled: boolean;
  kind: string;
  lifecycleStatus: string;
  capabilities?: string[];
  policyTags?: string[];
  config: Record<string, unknown>;
}

const PROVIDER_POLICY_RULES = {
  naming: {
    minLength: 2,
    maxLength: 255,
  },
  types: {
    allowed: ["local-llamacpp", "local-ollama", "openai", "anthropic", "google", "groq", "custom"],
  },
  kinds: {
    allowed: ["local", "cloud", "hybrid"],
  },
  policyTags: {
    recognized: ["no_egress", "pii_safe", "gpu_required", "hipaa_compliant", "gdpr_compliant"],
    cloudRequired: ["no_egress"], // cloud providers should declare egress policy
  },
  config: {
    requiredForCloud: ["apiKey"],
    requiredForLocal: ["endpoint"],
  },
};

export class ProviderPolicyEngine extends BasePolicyEngine<ProviderPolicyInput> {
  protected domain = "provider";
  protected policyVersion = "1.0.0";
  protected rules = PROVIDER_POLICY_RULES;

  protected runChecks(
    input: ProviderPolicyInput,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ): void {
    // Naming
    this.checkNaming(input.name, violations, {
      minLength: PROVIDER_POLICY_RULES.naming.minLength,
      maxLength: PROVIDER_POLICY_RULES.naming.maxLength,
    });

    // Provider type
    if (!PROVIDER_POLICY_RULES.types.allowed.includes(input.type)) {
      violations.push({
        level: "error",
        rule: "type.notAllowed",
        field: "type",
        message: `Provider type "${input.type}" is not recognized`,
        suggestion: `Use one of: ${PROVIDER_POLICY_RULES.types.allowed.join(", ")}`,
      });
    }

    // Kind
    if (!PROVIDER_POLICY_RULES.kinds.allowed.includes(input.kind)) {
      violations.push({
        level: "error",
        rule: "kind.notAllowed",
        field: "kind",
        message: `Provider kind "${input.kind}" is not recognized`,
        suggestion: `Use one of: ${PROVIDER_POLICY_RULES.kinds.allowed.join(", ")}`,
      });
    }

    // Enabled check
    if (!input.enabled) {
      warnings.push({
        level: "info",
        rule: "enabled.disabled",
        message: "Provider is currently disabled",
      });
    }

    // Cloud provider config checks
    if (input.kind === "cloud") {
      const hasApiKey = input.config && ("apiKey" in input.config);
      if (!hasApiKey) {
        warnings.push({
          level: "warning",
          rule: "config.cloudApiKey",
          field: "config.apiKey",
          message: "Cloud provider should have an API key configured",
          suggestion: "Add apiKey to provider config for cloud authentication",
        });
      }

      // Cloud providers should declare egress policy
      const hasPolicyTags = input.policyTags && input.policyTags.length > 0;
      if (!hasPolicyTags) {
        warnings.push({
          level: "warning",
          rule: "policyTags.cloudMissing",
          field: "policyTags",
          message: "Cloud provider has no policy tags — consider declaring data handling policies",
          suggestion: "Add tags like no_egress, pii_safe, hipaa_compliant as appropriate",
        });
      }
    }

    // Local provider config checks
    if (input.kind === "local") {
      const hasEndpoint = input.config && ("endpoint" in input.config || "baseUrl" in input.config);
      if (!hasEndpoint) {
        warnings.push({
          level: "warning",
          rule: "config.localEndpoint",
          field: "config.endpoint",
          message: "Local provider should have an endpoint configured",
        });
      }
    }

    // Policy tag validation
    if (input.policyTags) {
      for (const tag of input.policyTags) {
        if (!PROVIDER_POLICY_RULES.policyTags.recognized.includes(tag)) {
          warnings.push({
            level: "warning",
            rule: "policyTags.unrecognized",
            field: "policyTags",
            message: `Policy tag "${tag}" is not in the recognized list`,
          });
        }
      }
    }
  }

  static async evaluate(input: ProviderPolicyInput) {
    const engine = new ProviderPolicyEngine();
    return engine.evaluate(input);
  }
}
