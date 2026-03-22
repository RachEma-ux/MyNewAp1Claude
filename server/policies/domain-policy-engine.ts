/**
 * Domain Policy Engine — Generic policy evaluation framework.
 *
 * This provides the shared base for per-domain policy engines.
 * The LLM domain already has LLMPolicyEngine (llm-policy-engine.ts).
 * This module provides the equivalent for Model, Bot, Agent, Provider.
 *
 * Architecture:
 *   DomainPolicyEngine.evaluate(input) → PolicyEvaluationResult
 *
 * Each domain extends this by providing:
 *   1. Domain-specific rules
 *   2. Domain-specific check methods
 *   3. A policy input shape
 *
 * The result shape is IDENTICAL to LLMPolicyEngine for consistency.
 */

import { createHash } from "crypto";

// ============================================================================
// Shared Types (re-export from LLM engine for consistency)
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
    domain: string;
  };
}

// ============================================================================
// Base Policy Engine
// ============================================================================

export abstract class BasePolicyEngine<TInput> {
  protected abstract domain: string;
  protected abstract policyVersion: string;
  protected abstract rules: Record<string, any>;

  /**
   * Subclasses implement this to run their domain-specific checks.
   * Push violations/warnings into the provided arrays.
   */
  protected abstract runChecks(
    input: TInput,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ): Promise<void> | void;

  /**
   * Evaluate an entity against policy rules.
   */
  async evaluate(input: TInput): Promise<PolicyEvaluationResult> {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyViolation[] = [];

    await this.runChecks(input, violations, warnings);

    const decision = this.determineDecision(violations, warnings);
    const policyHash = this.computePolicyHash();

    return {
      decision,
      violations: violations.filter((v) => v.level === "error"),
      warnings: [...violations.filter((v) => v.level !== "error"), ...warnings],
      policyHash,
      evaluatedAt: new Date(),
      metadata: {
        policyVersion: this.policyVersion,
        rulesEvaluated: Object.keys(this.rules).length,
        domain: this.domain,
      },
    };
  }

  private determineDecision(
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ): PolicyDecision {
    const errors = violations.filter((v) => v.level === "error");
    if (errors.length > 0) return "deny";
    const warningsOnly = warnings.filter((w) => w.level === "warning");
    if (warningsOnly.length > 0) return "warn";
    return "allow";
  }

  protected computePolicyHash(): string {
    const content = JSON.stringify(this.rules, null, 2);
    return createHash("sha256").update(content).digest("hex");
  }

  /** Check naming convention (shared across domains) */
  protected checkNaming(
    name: string,
    violations: PolicyViolation[],
    opts: { minLength?: number; maxLength?: number; pattern?: RegExp } = {}
  ) {
    const minLen = opts.minLength ?? 2;
    const maxLen = opts.maxLength ?? 255;
    const pattern = opts.pattern ?? /^[a-zA-Z][a-zA-Z0-9 _-]*$/;

    if (!name || name.trim().length === 0) {
      violations.push({
        level: "error",
        rule: "naming.required",
        field: "name",
        message: "Name is required",
      });
      return;
    }

    if (name.length < minLen) {
      violations.push({
        level: "error",
        rule: "naming.minLength",
        field: "name",
        message: `Name must be at least ${minLen} characters`,
      });
    }

    if (name.length > maxLen) {
      violations.push({
        level: "error",
        rule: "naming.maxLength",
        field: "name",
        message: `Name must not exceed ${maxLen} characters`,
      });
    }

    if (!pattern.test(name)) {
      violations.push({
        level: "error",
        rule: "naming.pattern",
        field: "name",
        message: "Name must start with a letter and contain only letters, numbers, spaces, hyphens, or underscores",
        suggestion: "Use alphanumeric characters with hyphens or underscores",
      });
    }
  }
}
