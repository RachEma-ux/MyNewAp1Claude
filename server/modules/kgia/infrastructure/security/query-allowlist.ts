/**
 * KGIA Security — Query Allowlist
 *
 * Manages allowlisted query patterns and source access controls.
 * Works with the governance layer to enforce least-privilege graph access.
 */

import type { GraphSource } from "../../domain/types";

/** Allowlisted Cypher query prefixes (read-only operations) */
const CYPHER_ALLOWED_PREFIXES = [
  "MATCH", "OPTIONAL MATCH", "RETURN", "WITH", "WHERE",
  "ORDER BY", "SKIP", "LIMIT", "UNWIND", "CALL db.", "CALL dbms.",
  "EXPLAIN", "PROFILE",
] as const;

/** Blocklisted Cypher patterns (write/destructive operations) */
const CYPHER_BLOCKED_PATTERNS = [
  /\bCREATE\b/i, /\bMERGE\b/i, /\bDELETE\b/i, /\bDETACH\b/i,
  /\bSET\b/i, /\bREMOVE\b/i, /\bDROP\b/i, /\bFOREACH\b/i,
  /\bLOAD\s+CSV\b/i, /\bCALL\s+apoc\b/i, /\bCALL\s+gds\b/i,
  /\bPERIODIC\s+COMMIT\b/i,
];

/** Blocklisted SPARQL patterns */
const SPARQL_BLOCKED_PATTERNS = [
  /\bINSERT\b/i, /\bDELETE\b/i, /\bDROP\b/i, /\bCREATE\b/i,
  /\bCLEAR\b/i, /\bLOAD\b/i, /\bADD\b/i, /\bMOVE\b/i, /\bCOPY\b/i,
];

export interface AllowlistResult {
  allowed: boolean;
  violations: string[];
}

/**
 * Check a query against the allowlist for a given source.
 */
export function checkQueryAllowlist(
  queryText: string,
  source: GraphSource
): AllowlistResult {
  const violations: string[] = [];
  const isSparql = source.type === "sparql" || source.type === "neptune_sparql";
  const blocked = isSparql ? SPARQL_BLOCKED_PATTERNS : CYPHER_BLOCKED_PATTERNS;

  for (const pattern of blocked) {
    if (pattern.test(queryText)) {
      violations.push(`Blocked pattern detected: ${pattern.source}`);
    }
  }

  // Check source is allowlisted (if policy requires it)
  if (!source.allowlisted) {
    violations.push(`Source "${source.name}" is not allowlisted`);
  }

  // Check read-only enforcement
  if (source.readOnly && violations.length > 0) {
    violations.unshift("Source is read-only — write operations are blocked");
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

/**
 * Sanitize a query by stripping known dangerous patterns.
 * Returns null if the query cannot be safely sanitized.
 */
export function sanitizeQuery(queryText: string): string | null {
  let sanitized = queryText;

  // Remove inline comments
  sanitized = sanitized.replace(/\/\/.*$/gm, "");
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, "");

  // Check if anything dangerous remains
  const allBlocked = [...CYPHER_BLOCKED_PATTERNS, ...SPARQL_BLOCKED_PATTERNS];
  for (const pattern of allBlocked) {
    if (pattern.test(sanitized)) return null;
  }

  return sanitized.trim();
}
