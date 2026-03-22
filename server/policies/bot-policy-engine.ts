/**
 * Bot Policy Engine — Rule-based policy evaluation for Bots.
 *
 * Checks:
 * - Naming conventions
 * - Channel configuration
 * - Binding validation (agent/LLM required)
 * - Rate limit bounds
 * - Behavior config safety
 */

import { BasePolicyEngine, type PolicyViolation } from "./domain-policy-engine";

export interface BotPolicyInput {
  name: string;
  agentId: number | null;
  llmId: number | null;
  channels: string[] | null;
  rateLimit: number | null;
  behaviorConfig: {
    systemPrompt?: string;
    persona?: string;
    responseStyle?: string;
  } | null;
  scope: string;
}

const BOT_POLICY_RULES = {
  naming: {
    minLength: 2,
    maxLength: 255,
  },
  channels: {
    allowed: ["web", "api", "slack", "discord", "teams", "telegram", "email", "sms", "custom"],
    maxPerBot: 10,
  },
  rateLimit: {
    min: 1,
    max: 10000,
    recommendedMax: 1000,
  },
  systemPrompt: {
    maxLength: 50000,
  },
};

export class BotPolicyEngine extends BasePolicyEngine<BotPolicyInput> {
  protected domain = "bot";
  protected policyVersion = "1.0.0";
  protected rules = BOT_POLICY_RULES;

  protected runChecks(
    input: BotPolicyInput,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ): void {
    // Naming
    this.checkNaming(input.name, violations, {
      minLength: BOT_POLICY_RULES.naming.minLength,
      maxLength: BOT_POLICY_RULES.naming.maxLength,
    });

    // Binding: must have agent or LLM
    if (!input.agentId && !input.llmId) {
      violations.push({
        level: "error",
        rule: "binding.required",
        message: "Bot must be bound to at least one agent or LLM",
        suggestion: "Assign an agentId or llmId before deploying",
      });
    }

    // Channels
    if (!input.channels || input.channels.length === 0) {
      violations.push({
        level: "error",
        rule: "channels.required",
        field: "channels",
        message: "Bot must have at least one channel configured",
      });
    } else {
      if (input.channels.length > BOT_POLICY_RULES.channels.maxPerBot) {
        warnings.push({
          level: "warning",
          rule: "channels.tooMany",
          field: "channels",
          message: `Bot has ${input.channels.length} channels (max recommended: ${BOT_POLICY_RULES.channels.maxPerBot})`,
        });
      }

      for (const ch of input.channels) {
        if (!BOT_POLICY_RULES.channels.allowed.includes(ch)) {
          warnings.push({
            level: "warning",
            rule: "channels.unknown",
            field: "channels",
            message: `Channel "${ch}" is not in the standard list`,
          });
        }
      }
    }

    // Rate limit
    if (input.rateLimit !== null && input.rateLimit !== undefined) {
      if (input.rateLimit < BOT_POLICY_RULES.rateLimit.min) {
        violations.push({
          level: "error",
          rule: "rateLimit.tooLow",
          field: "rateLimit",
          message: `Rate limit ${input.rateLimit} is below minimum ${BOT_POLICY_RULES.rateLimit.min}`,
        });
      }
      if (input.rateLimit > BOT_POLICY_RULES.rateLimit.max) {
        violations.push({
          level: "error",
          rule: "rateLimit.tooHigh",
          field: "rateLimit",
          message: `Rate limit ${input.rateLimit} exceeds maximum ${BOT_POLICY_RULES.rateLimit.max}`,
        });
      }
      if (input.rateLimit > BOT_POLICY_RULES.rateLimit.recommendedMax) {
        warnings.push({
          level: "warning",
          rule: "rateLimit.high",
          field: "rateLimit",
          message: `Rate limit ${input.rateLimit} exceeds recommended ${BOT_POLICY_RULES.rateLimit.recommendedMax}`,
        });
      }
    }

    // System prompt length
    if (input.behaviorConfig?.systemPrompt) {
      if (input.behaviorConfig.systemPrompt.length > BOT_POLICY_RULES.systemPrompt.maxLength) {
        violations.push({
          level: "error",
          rule: "systemPrompt.tooLong",
          field: "behaviorConfig.systemPrompt",
          message: `System prompt exceeds ${BOT_POLICY_RULES.systemPrompt.maxLength} characters`,
        });
      }
    }
  }

  static async evaluate(input: BotPolicyInput) {
    const engine = new BotPolicyEngine();
    return engine.evaluate(input);
  }
}
