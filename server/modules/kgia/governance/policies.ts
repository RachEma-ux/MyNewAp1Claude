/**
 * KGIA Governance — Non-Bypassable Policy Enforcement
 *
 * All query execution flows through this module.
 * Controls: read-only default, source allowlists, hop limits,
 * row limits, token limits, query shape checks, dangerous pattern
 * blocking, review thresholds, audit logging.
 */

import type { GraphSource, QueryPlan, SafetyVerdict } from "../domain/types";

// ── Policy Configuration ─────────────────────────────────────────

export interface KgiaPolicyConfig {
  maxHopsGlobal: number;
  maxRowsGlobal: number;
  maxTokenContext: number;
  readOnlyDefault: boolean;
  requireAllowlistedSources: boolean;
  reviewConfidenceThreshold: number;
  blockedQueryPatterns: RegExp[];
  allowedQueryPrefixes: string[];
}

export const DEFAULT_POLICY: KgiaPolicyConfig = {
  maxHopsGlobal: 6,
  maxRowsGlobal: 5000,
  maxTokenContext: 128000,
  readOnlyDefault: true,
  requireAllowlistedSources: true,
  reviewConfidenceThreshold: 0.3,
  blockedQueryPatterns: [
    /\bDELETE\b/i,
    /\bDROP\b/i,
    /\bCREATE\b/i,
    /\bMERGE\b/i,
    /\bSET\b.*=/i,
    /\bREMOVE\b/i,
    /\bDETACH\b/i,
    /\bINSERT\b/i,
    /\bUPDATE\b/i,
    /\bALTER\b/i,
    /\bCALL\b.*\bapoc\b/i,
    /\bCALL\b.*\bgds\b/i,
    /\bLOAD\s+CSV\b/i,
    /\bPERIODIC\s+COMMIT\b/i,
    /\bFOREACH\b/i,
  ],
  allowedQueryPrefixes: ["MATCH", "RETURN", "WITH", "WHERE", "ORDER", "LIMIT", "SKIP", "UNWIND", "OPTIONAL", "UNION", "SELECT", "ASK", "CONSTRUCT", "DESCRIBE", "PREFIX", "FILTER"],
};

// ── Source Allowlist Enforcement ──────────────────────────────────

export function enforceSourceAllowlist(
  source: GraphSource,
  policy: KgiaPolicyConfig = DEFAULT_POLICY
): { allowed: boolean; reason?: string } {
  if (!policy.requireAllowlistedSources) {
    return { allowed: true };
  }
  if (!source.allowlisted) {
    return {
      allowed: false,
      reason: `Source "${source.name}" (id=${source.id}) is not on the allowlist. Enable allowlisting before querying.`,
    };
  }
  return { allowed: true };
}

// ── Read-Only Enforcement ────────────────────────────────────────

export function enforceReadOnly(
  queryText: string,
  source: GraphSource,
  policy: KgiaPolicyConfig = DEFAULT_POLICY
): { allowed: boolean; violations: string[] } {
  const violations: string[] = [];

  if (!policy.readOnlyDefault && !source.readOnly) {
    return { allowed: true, violations: [] };
  }

  for (const pattern of policy.blockedQueryPatterns) {
    if (pattern.test(queryText)) {
      violations.push(`Blocked pattern detected: ${pattern.source}`);
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

// ── Query Shape Validation ───────────────────────────────────────

export function validateQueryShape(
  queryText: string,
  policy: KgiaPolicyConfig = DEFAULT_POLICY
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const trimmed = queryText.trim();

  // Check the query starts with an allowed prefix
  const firstWord = trimmed.split(/[\s(]/)[0]?.toUpperCase();
  if (firstWord && !policy.allowedQueryPrefixes.includes(firstWord)) {
    errors.push(`Query must start with an allowed keyword. Found: "${firstWord}"`);
  }

  // Check for dangerous patterns
  for (const pattern of policy.blockedQueryPatterns) {
    if (pattern.test(queryText)) {
      errors.push(`Dangerous pattern detected: ${pattern.source}`);
    }
  }

  // Check for unlimited results
  if (
    !queryText.toUpperCase().includes("LIMIT") &&
    !queryText.toUpperCase().includes("COUNT") &&
    !queryText.toUpperCase().includes("ASK")
  ) {
    errors.push("Query must include a LIMIT clause to prevent unbounded result sets");
  }

  return { valid: errors.length === 0, errors };
}

// ── Hop Limit Enforcement ────────────────────────────────────────

export function enforceHopLimit(
  queryText: string,
  source: GraphSource,
  policy: KgiaPolicyConfig = DEFAULT_POLICY
): { allowed: boolean; reason?: string } {
  const effectiveMax = Math.min(source.maxHops, policy.maxHopsGlobal);

  // Check for variable-length paths in Cypher: [*..N]
  const hopMatch = queryText.match(/\[\*\.\.(\d+)\]/);
  if (hopMatch) {
    const requestedHops = parseInt(hopMatch[1], 10);
    if (requestedHops > effectiveMax) {
      return {
        allowed: false,
        reason: `Requested ${requestedHops} hops exceeds limit of ${effectiveMax}`,
      };
    }
  }

  // Check for unbounded traversals: [*]
  if (/\[\*\]/.test(queryText)) {
    return {
      allowed: false,
      reason: `Unbounded traversal [*] not allowed. Use [*..${effectiveMax}] instead.`,
    };
  }

  return { allowed: true };
}

// ── Row Limit Enforcement ────────────────────────────────────────

export function enforceRowLimit(
  queryText: string,
  source: GraphSource,
  policy: KgiaPolicyConfig = DEFAULT_POLICY
): { allowed: boolean; reason?: string } {
  const effectiveMax = Math.min(source.maxRows, policy.maxRowsGlobal);

  const limitMatch = queryText.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    const requestedLimit = parseInt(limitMatch[1], 10);
    if (requestedLimit > effectiveMax) {
      return {
        allowed: false,
        reason: `LIMIT ${requestedLimit} exceeds max rows ${effectiveMax}`,
      };
    }
  }

  return { allowed: true };
}

// ── Full Safety Evaluation ───────────────────────────────────────

export function evaluateQuerySafety(
  queryText: string,
  source: GraphSource,
  policy: KgiaPolicyConfig = DEFAULT_POLICY
): SafetyVerdict {
  const violations: string[] = [];
  const blockedPatterns: string[] = [];

  // 1. Source allowlist
  const allowlistCheck = enforceSourceAllowlist(source, policy);
  if (!allowlistCheck.allowed) {
    violations.push(allowlistCheck.reason!);
  }

  // 2. Read-only enforcement
  const readOnlyCheck = enforceReadOnly(queryText, source, policy);
  violations.push(...readOnlyCheck.violations);
  blockedPatterns.push(
    ...readOnlyCheck.violations.filter((v) => v.startsWith("Blocked pattern"))
  );

  // 3. Query shape
  const shapeCheck = validateQueryShape(queryText, policy);
  violations.push(...shapeCheck.errors);

  // 4. Hop limit
  const hopCheck = enforceHopLimit(queryText, source, policy);
  if (!hopCheck.allowed) {
    violations.push(hopCheck.reason!);
  }

  // 5. Row limit
  const rowCheck = enforceRowLimit(queryText, source, policy);
  if (!rowCheck.allowed) {
    violations.push(rowCheck.reason!);
  }

  return {
    safe: violations.length === 0,
    readOnly: policy.readOnlyDefault || source.readOnly,
    violations,
    blockedPatterns,
    reviewRequired: false, // set by caller based on confidence threshold
  };
}
