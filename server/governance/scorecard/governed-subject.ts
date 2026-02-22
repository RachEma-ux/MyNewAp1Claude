/**
 * GovernedSubject — Governance Bible CGT v2
 *
 * Role: GSCE (Governance, Security & Compliance Expert)
 * Phase: 1 — Contract Definition
 *
 * Defines the contract for any entity that undergoes governance scoring.
 * Every catalog entry, provider, LLM, model, agent, or bot that passes
 * through the lifecycle pipeline must conform to this interface.
 *
 * Validation rules:
 *   - type is REQUIRED and must be a known SubjectType
 *   - id is REQUIRED
 *   - name is REQUIRED (non-empty)
 *   - tags must include a lifecycle tag at register+ stages
 *   - config must not contain hardcoded secrets
 *
 * If validation fails → subject cannot enter the scorecard pipeline.
 */

// ============================================================================
// Types
// ============================================================================

/** Known governed subject types — each maps to a type pack */
export const SUBJECT_TYPES = [
  "provider",
  "llm",
  "model",
  "agent",
  "bot",
] as const;

export type SubjectType = (typeof SUBJECT_TYPES)[number];

/**
 * GovernedSubject — the canonical input contract for the scorecard engine.
 *
 * Any entity entering the governance pipeline MUST be expressible as a
 * GovernedSubject. Missing or invalid fields cause immediate FAIL.
 */
export interface GovernedSubject {
  /** Unique numeric identifier */
  id: number;
  /** Human-readable name (must be non-empty) */
  name: string;
  /** Subject type — determines which type pack is loaded */
  type: SubjectType;
  /** Lifecycle tags (e.g. ["candidate"], ["registered"], ["validated"]) */
  tags: string[];
  /** Optional human-readable description */
  description?: string;
  /** Optional configuration blob — scanned for secrets */
  config?: Record<string, any>;
  /** Optional metadata (version, author, etc.) */
  metadata?: Record<string, any>;
}

// ============================================================================
// Validation
// ============================================================================

export interface SubjectValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a GovernedSubject before scorecard evaluation.
 *
 * Enforcement: FAIL if any error is present.
 * Deny-by-default: unknown types are rejected.
 */
export function validateSubject(subject: unknown): SubjectValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!subject || typeof subject !== "object") {
    return { valid: false, errors: ["Subject is null or not an object"], warnings };
  }

  const s = subject as Record<string, any>;

  // Required: id
  if (s.id == null || typeof s.id !== "number") {
    errors.push("Missing or invalid 'id' (must be a number)");
  }

  // Required: name
  if (!s.name || typeof s.name !== "string" || s.name.trim().length === 0) {
    errors.push("Missing or empty 'name'");
  }

  // Required: type (must be known)
  if (!s.type || typeof s.type !== "string") {
    errors.push("Missing 'type'");
  } else if (!SUBJECT_TYPES.includes(s.type as SubjectType)) {
    errors.push(`Unknown subject type '${s.type}'. Must be one of: ${SUBJECT_TYPES.join(", ")}`);
  }

  // Required: tags (must be array)
  if (!Array.isArray(s.tags)) {
    errors.push("Missing or invalid 'tags' (must be an array)");
  }

  // Warning: no description
  if (!s.description) {
    warnings.push("Subject has no description — will fail DOC-002 at publish");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a value is a valid SubjectType.
 */
export function isValidSubjectType(type: string): type is SubjectType {
  return SUBJECT_TYPES.includes(type as SubjectType);
}
