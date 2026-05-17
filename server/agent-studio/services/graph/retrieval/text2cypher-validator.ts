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
] as const;
export type AllowedProcedureNamespace =
  (typeof ALLOWED_PROCEDURE_NAMESPACES)[number];

// ============================================================================
// Per-allowed-namespace operator-facing metadata (T-G.38)
// ============================================================================

export type AllowedProcedureNamespaceProviderBucket =
  | "neo4j"
  | "apoc"
  | "gds";

export interface AllowedProcedureNamespaceMetadata {
  /** Display label rendered in the query-builder's namespace picker. */
  readonly label: string;
  /** Short operator-facing description of what procedures under this
   *  namespace do and when to reach for them. */
  readonly description: string;
  /** Closed-taxonomy provider bucket — drives namespace grouping in
   *  the picker (Neo4j core vs. APOC library vs. GDS algorithms). */
  readonly providerBucket: AllowedProcedureNamespaceProviderBucket;
  /** Whether procedures under this namespace expect a projected graph
   *  cataloged via `gds.graph.project` before they will run (true for
   *  every `gds.*` entry; false for db.schema / apoc.*). */
  readonly expectsGraphProjection: boolean;
}

export const ALLOWED_PROCEDURE_NAMESPACE_METADATA: Readonly<
  Record<AllowedProcedureNamespace, AllowedProcedureNamespaceMetadata>
> = {
  "db.schema.": {
    label: "db.schema.*",
    description:
      "Neo4j core schema introspection — list labels, relationship types, properties, and constraints.",
    providerBucket: "neo4j",
    expectsGraphProjection: false,
  },
  "apoc.path.": {
    label: "apoc.path.*",
    description:
      "APOC path-expansion procedures — bounded BFS/DFS traversals with relationship-type / direction filters.",
    providerBucket: "apoc",
    expectsGraphProjection: false,
  },
  "apoc.coll.": {
    label: "apoc.coll.*",
    description:
      "APOC collection helpers — list manipulation, set operations, sorting, deduplication.",
    providerBucket: "apoc",
    expectsGraphProjection: false,
  },
  "gds.shortestPath": {
    label: "gds.shortestPath.*",
    description:
      "GDS shortest-path algorithms (Dijkstra / A* / Yens) over a projected graph.",
    providerBucket: "gds",
    expectsGraphProjection: true,
  },
  "gds.betweenness": {
    label: "gds.betweenness.*",
    description:
      "GDS betweenness-centrality algorithm — ranks nodes by how many shortest paths pass through them.",
    providerBucket: "gds",
    expectsGraphProjection: true,
  },
  "gds.degree": {
    label: "gds.degree.*",
    description:
      "GDS degree-centrality algorithm — ranks nodes by direct relationship count.",
    providerBucket: "gds",
    expectsGraphProjection: true,
  },
  "gds.pageRank": {
    label: "gds.pageRank.*",
    description:
      "GDS PageRank algorithm — ranks nodes by iterative random-walk steady-state probability.",
    providerBucket: "gds",
    expectsGraphProjection: true,
  },
};

export function getAllowedProcedureNamespaceMetadata(
  ns: AllowedProcedureNamespace,
): AllowedProcedureNamespaceMetadata {
  return ALLOWED_PROCEDURE_NAMESPACE_METADATA[ns];
}

/**
 * Closed-taxonomy validation failure reasons. Promoted to a typed
 * tuple so the per-reason metadata table (T-G.37) can lockstep against
 * it.
 *
 * GR-5 (2026-05-17): extended with `multi_statement` + `unbounded_query`
 * to close GraphRAG / Retrieval item 29 acceptance criteria.
 */
export const TEXT2CYPHER_VALIDATION_FAILURE_REASONS = [
  "empty_query",
  "forbidden_token",
  "forbidden_procedure",
  "disallowed_procedure",
  "multi_statement",
  "unbounded_query",
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
  multi_statement: {
    label: "Multi-Statement Query",
    description:
      "The query contains more than one Cypher statement (statement-separator semicolons detected). Multi-statement queries open an injection vector; submit one statement at a time.",
    category: "security",
    isHardSecurityViolation: true,
  },
  unbounded_query: {
    label: "Unbounded Query",
    description:
      "The query is a MATCH/RETURN without a LIMIT clause, which can drive the planner to materialize the whole graph. Add a LIMIT (e.g., LIMIT 200) or use a template that includes one.",
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
  | { ok: false; reason: "empty_query" }
  | { ok: false; reason: "multi_statement"; statementCount: number }
  | { ok: false; reason: "unbounded_query"; detail: string };

export interface ValidateCypherReadOnlyOptions {
  /**
   * When true (default), MATCH/RETURN queries that don't include a
   * LIMIT clause are rejected as `unbounded_query`. Set to false for
   * registered template bodies — those have their own maxResults
   * binding via the template registry.
   */
  readonly requireLimit?: boolean;
}

/**
 * Validates a Cypher query for read-only safety.
 *
 * Returns `ok: true` only when:
 *   - Non-empty
 *   - Single statement (semicolon-separator detection — block multi-statement injection)
 *   - No FORBIDDEN_TOKENS found as whole words
 *   - No FORBIDDEN_PROCEDURE_PATTERNS matched
 *   - Any `CALL` invocations are in ALLOWED_PROCEDURE_NAMESPACES
 *   - When `requireLimit` is true (default), the query carries a LIMIT
 *     clause OR is a CALL-only / WITH-only / RETURN-constant-only query
 *     that doesn't materialize unbounded results.
 *
 * GR-5 (2026-05-17): added `multi_statement` + `unbounded_query` checks
 * to close GraphRAG / Retrieval item 29.
 */
export function validateCypherReadOnly(
  cypher: string,
  options: ValidateCypherReadOnlyOptions = {},
): ValidationOutcome {
  const requireLimit = options.requireLimit ?? true;
  const trimmed = cypher.trim();
  if (!trimmed) return { ok: false, reason: "empty_query" };

  // Normalize: strip line/inline comments before further checks.
  const stripped = trimmed
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // Multi-statement detection — count non-trailing semicolons. Cypher
  // allows a single trailing `;` per statement; multiple statements are
  // a known injection vector and Neo4j 5.x only supports them via
  // multi-statement query mode which we never enable. Strip string
  // literals first so a semicolon inside a string doesn't trip the
  // counter.
  const stringStripped = stripped
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  const statements = stringStripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (statements.length > 1) {
    return { ok: false, reason: "multi_statement", statementCount: statements.length };
  }

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

  // Unbounded-query check. We require LIMIT on MATCH-based queries.
  // CALL-only / RETURN-constant / WITH-only queries are exempt — they
  // either bound themselves or return a single row.
  if (requireLimit) {
    const hasMatch = /\bMATCH\b/i.test(stripped);
    const hasLimit = /\bLIMIT\s+\d+\b/i.test(stripped);
    if (hasMatch && !hasLimit) {
      return {
        ok: false,
        reason: "unbounded_query",
        detail: "MATCH query without LIMIT clause",
      };
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
