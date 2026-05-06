/**
 * Data validation service — D-UI-4.
 *
 * Runs at INGESTION time (not retrieval time) against each unit. The
 * MVP rule set:
 *
 *   - required_fields: contentText is non-empty (D-NKU-3).
 *   - permission_present: permissionContext is set (D-UI-2).
 *   - freshness_present: freshnessState is set (D-UI-2).
 *
 * Returns `status` ∈ {ok, warn, blocked} plus the structured findings.
 * `blocked` units still persist (with `validationStatus="blocked"`) so
 * the audit trail is complete; the retrieval planner skips them.
 *
 * Operators can register additional rules at boot (PII regex, license
 * keywords, schema validation for JSON units, etc.). The validator
 * version string identifies which ruleset ran — when rules change,
 * historic findings remain interpretable.
 */

import type {
  DataValidationFinding,
  DataValidationResult,
  NormalizedKnowledgeUnitInput,
} from "./types";

export const VALIDATOR_VERSION = "v1-mvp";

export type ValidationRule = (
  input: NormalizedKnowledgeUnitInput,
) => DataValidationFinding[];

const customRules: ValidationRule[] = [];

export function registerValidationRule(rule: ValidationRule): void {
  customRules.push(rule);
}

export function clearValidationRules(): void {
  customRules.length = 0;
}

export function validateUnit(
  input: NormalizedKnowledgeUnitInput,
): DataValidationResult {
  const findings: DataValidationFinding[] = [];

  // ── Required fields (D-NKU-3) ──
  if (!input.contentText || input.contentText.trim().length === 0) {
    findings.push({
      rule: "required_fields",
      severity: "block",
      message: "contentText is empty (D-NKU-3 mandatory canonical projection)",
    });
  }
  // ── Permission (D-UI-2) ──
  if (!input.permissionContext) {
    findings.push({
      rule: "permission_present",
      severity: "block",
      message: "permissionContext missing (D-UI-2 mandatory)",
    });
  }
  // ── Freshness (D-UI-2; default-injected by KnowledgeUnitService, but rule
  //     stays in case a caller bypasses the service) ──
  if (
    input.freshnessState !== undefined &&
    !["fresh", "stale", "expired"].includes(input.freshnessState)
  ) {
    findings.push({
      rule: "freshness_present",
      severity: "warn",
      message: `unrecognized freshnessState: ${input.freshnessState}`,
    });
  }

  for (const rule of customRules) {
    findings.push(...rule(input));
  }

  const status =
    findings.some((f) => f.severity === "block")
      ? "blocked"
      : findings.some((f) => f.severity === "warn")
        ? "warn"
        : "ok";

  return {
    status,
    findings,
    validatorVersion: VALIDATOR_VERSION,
  };
}
