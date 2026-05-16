/**
 * Text2Cypher validator — read-only guardrails.
 *
 * Phase 12.5. Rejects forbidden tokens before any LLM-generated Cypher
 * reaches the GraphRepository.
 *
 * ADR: docs/architecture/agent-studio-text2cypher-query-guardrails.md
 *
 * Source-scan test: tests/agent-studio/text2cypher-mutation-blocked.test.ts
 */

/**
 * Tokens that may NEVER appear in user-generated / LLM-generated Cypher.
 * Mutations route through Phase 11.5 graph change proposals.
 */
export const FORBIDDEN_TOKENS = [
  "CREATE",
  "MERGE",
  "SET",
  "DELETE",
  "DETACH",
  "REMOVE",
  "DROP",
  "LOAD CSV",
];

/**
 * Procedure call patterns blocked.
 */
export const FORBIDDEN_PROCEDURE_PATTERNS = [
  /\bCALL\s+apoc\.create\b/i,
  /\bCALL\s+apoc\.merge\b/i,
  /\bCALL\s+apoc\.refactor\b/i,
];

/**
 * Allowlisted procedure namespaces (read-only).
 */
export const ALLOWED_PROCEDURE_NAMESPACES = [
  "db.schema.",
  "apoc.path.",
  "apoc.coll.",
  "gds.shortestPath",
  "gds.betweenness",
  "gds.degree",
  "gds.pageRank",
];

/**
 * Closed-taxonomy validation failure reasons. Promoted to a typed
 * tuple so the per-reason metadata table (T-G.37) can lockstep against
 * it.
 */
export const TEXT2CYPHER_VALIDATION_FAILURE_REASONS = [
  "empty_query",
  "forbidden_token",
  "forbidden_procedure",
  "disallowed_procedure",
] as const;
export type Text2CypherValidationFailureReason =
  (typeof TEXT2CYPHER_VALIDATION_FAILURE_REASONS)[number];

// ============================================================================
// Per-failure-reason operator-facing metadata (T-G.37)
// ============================================================================

export type Text2CypherValidationFailureCategory =
  | "structural"
  | "security"
  | "policy";

export interface Text2CypherValidationFailureReasonMetadata {
  /** Display label rendered in the query-builder validation toast. */
  readonly label: string;
  /** Short operator-facing description of why this query was rejected
   *  and what the operator should do next. */
  readonly description: string;
  /** Closed-taxonomy category: `structural` (empty / malformed input),
   *  `security` (would mutate the graph), or `policy` (read-only but
   *  outside the allowlist). */
  readonly category: Text2CypherValidationFailureCategory;
  /** Whether this is a hard security violation that MUST never reach
   *  the executor (true for forbidden_token + forbidden_procedure;
   *  false for structural / policy failures which can be retried with
   *  a corrected query). */
  readonly isHardSecurityViolation: boolean;
}

export const TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA: Readonly<
  Record<
    Text2CypherValidationFailureReason,
    Text2CypherValidationFailureReasonMetadata
  >
> = {
  empty_query: {
    label: "Empty Query",
    description:
      "The submitted Cypher was empty after trimming. The operator should type a non-empty query.",
    category: "structural",
    isHardSecurityViolation: false,
  },
  forbidden_token: {
    label: "Forbidden Token",
    description:
      "The query contains a write keyword (CREATE / MERGE / SET / DELETE / DETACH / REMOVE / DROP / LOAD CSV). Mutations route through Phase 11.5 graph change proposals.",
    category: "security",
    isHardSecurityViolation: true,
  },
  forbidden_procedure: {
    label: "Forbidden Procedure",
    description:
      "The query calls a mutating APOC procedure (apoc.create / apoc.merge / apoc.refactor). Mutations route through Phase 11.5 graph change proposals.",
    category: "security",
    isHardSecurityViolation: true,
  },
  disallowed_procedure: {
    label: "Disallowed Procedure",
    description:
      "The query calls a procedure outside the read-only allowlist. Use a procedure under db.schema / apoc.path / apoc.coll / gds.shortestPath / gds.betweenness / gds.degree / gds.pageRank.",
    category: "policy",
    isHardSecurityViolation: false,
  },
};

export function getText2CypherValidationFailureReasonMetadata(
  reason: Text2CypherValidationFailureReason,
): Text2CypherValidationFailureReasonMetadata {
  return TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA[reason];
}

export type ValidationOutcome =
  | { ok: true }
  | { ok: false; reason: "forbidden_token"; token: string }
  | { ok: false; reason: "forbidden_procedure"; match: string }
  | { ok: false; reason: "disallowed_procedure"; procedure: string }
  | { ok: false; reason: "empty_query" };

/**
 * Validates a Cypher query for read-only safety.
 *
 * Returns `ok: true` only when:
 *   - Non-empty
 *   - No FORBIDDEN_TOKENS found as whole words
 *   - No FORBIDDEN_PROCEDURE_PATTERNS matched
 *   - Any `CALL` invocations are in ALLOWED_PROCEDURE_NAMESPACES
 */
export function validateCypherReadOnly(cypher: string): ValidationOutcome {
  const trimmed = cypher.trim();
  if (!trimmed) return { ok: false, reason: "empty_query" };

  // Normalize: uppercase + strip line/inline comments for token check
  const stripped = trimmed
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const upper = stripped.toUpperCase();

  // Check forbidden procedure patterns FIRST so `CALL apoc.create.node`
  // is classified as `forbidden_procedure` rather than `forbidden_token`
  // (which would match on the CREATE substring inside `apoc.create`).
  for (const re of FORBIDDEN_PROCEDURE_PATTERNS) {
    const m = stripped.match(re);
    if (m) return { ok: false, reason: "forbidden_procedure", match: m[0] };
  }

  for (const token of FORBIDDEN_TOKENS) {
    const re = new RegExp(`\\b${token.replace(/\s+/g, "\\s+")}\\b`);
    if (re.test(upper)) {
      return { ok: false, reason: "forbidden_token", token };
    }
  }

  // Check CALL invocations are in allowlist.
  const callRe = /\bCALL\s+([a-zA-Z][a-zA-Z0-9._]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(stripped)) !== null) {
    const procedure = match[1] ?? "";
    const allowed = ALLOWED_PROCEDURE_NAMESPACES.some((ns) => procedure.startsWith(ns));
    if (!allowed) {
      return { ok: false, reason: "disallowed_procedure", procedure };
    }
  }

  return { ok: true };
}

/**
 * Validates + records the attempt. Phase 12.5 wires this through the
 * `ags_text2cypher_runs` audit table.
 */
export interface Text2CypherValidationRecord {
  readonly userQuery: string;
  readonly generatedCypher: string;
  readonly outcome: ValidationOutcome;
}
