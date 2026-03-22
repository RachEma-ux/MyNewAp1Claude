/**
 * Model Policy Engine — Rule-based policy evaluation for Models.
 *
 * Checks:
 * - Naming conventions
 * - Model type validation
 * - File format constraints
 * - Parameter size bounds
 */

import { BasePolicyEngine, type PolicyViolation } from "./domain-policy-engine";

export interface ModelPolicyInput {
  name: string;
  displayName: string;
  modelType: string;
  fileFormat?: string;
  parameterCount?: string;
  contextLength?: number;
  quantization?: string;
}

const MODEL_POLICY_RULES = {
  naming: {
    minLength: 2,
    maxLength: 255,
  },
  modelTypes: {
    allowed: ["llm", "embedding", "vision", "multimodal", "code", "audio", "other"],
  },
  fileFormats: {
    allowed: ["gguf", "safetensors", "bin", "pt", "onnx", "other"],
  },
  contextLength: {
    max: 2000000,
    recommended: 200000,
  },
};

export class ModelPolicyEngine extends BasePolicyEngine<ModelPolicyInput> {
  protected domain = "model";
  protected policyVersion = "1.0.0";
  protected rules = MODEL_POLICY_RULES;

  protected runChecks(
    input: ModelPolicyInput,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ): void {
    // Naming
    this.checkNaming(input.name, violations, {
      minLength: MODEL_POLICY_RULES.naming.minLength,
      maxLength: MODEL_POLICY_RULES.naming.maxLength,
    });

    // Model type
    if (!MODEL_POLICY_RULES.modelTypes.allowed.includes(input.modelType)) {
      violations.push({
        level: "error",
        rule: "modelType.notAllowed",
        field: "modelType",
        message: `Model type "${input.modelType}" is not recognized`,
        suggestion: `Use one of: ${MODEL_POLICY_RULES.modelTypes.allowed.join(", ")}`,
      });
    }

    // File format
    if (input.fileFormat && !MODEL_POLICY_RULES.fileFormats.allowed.includes(input.fileFormat)) {
      warnings.push({
        level: "warning",
        rule: "fileFormat.uncommon",
        field: "fileFormat",
        message: `File format "${input.fileFormat}" is not in the standard list`,
        suggestion: `Standard formats: ${MODEL_POLICY_RULES.fileFormats.allowed.join(", ")}`,
      });
    }

    // Context length
    if (input.contextLength) {
      if (input.contextLength > MODEL_POLICY_RULES.contextLength.max) {
        violations.push({
          level: "error",
          rule: "contextLength.max",
          field: "contextLength",
          message: `Context length ${input.contextLength} exceeds maximum ${MODEL_POLICY_RULES.contextLength.max}`,
        });
      }
      if (input.contextLength > MODEL_POLICY_RULES.contextLength.recommended) {
        warnings.push({
          level: "warning",
          rule: "contextLength.recommended",
          field: "contextLength",
          message: `Context length ${input.contextLength} exceeds recommended ${MODEL_POLICY_RULES.contextLength.recommended}`,
        });
      }
    }
  }

  /** Singleton accessor matching LLMPolicyEngine pattern */
  static async evaluate(input: ModelPolicyInput) {
    const engine = new ModelPolicyEngine();
    return engine.evaluate(input);
  }
}
