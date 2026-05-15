/**
 * Security / DevSecOps Graph Lens contracts — Phase 25 §T-G.3.
 *
 * Roadmap §"Phase 25 — V1.5 Expansion" enumerates the
 * Security/DevSecOps Graph Lens with 10 closed-taxonomy node types
 * and one canonical traversal path:
 *
 *   CVE → Package → Component → Service → Environment → Owner → CustomerExposure
 *
 * Operator question: "this CVE landed — what customer-facing services
 * are affected, who owns them, and what's the patch path?"
 *
 * This module pins the closed taxonomy + the canonical path. External
 * data ingestion (NVD CVE feed) is a Phase 25.x follow-up.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure types. No DB I/O. No graph mutation.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - Future ingestion code will read NVD via the shared
 *     `withProviderCredential` Plan v3 D1 surface — no
 *     `process.env.*_API_KEY` reads.
 */

// ============================================================================
// Closed taxonomy — 10 security node types
// ============================================================================

export const SECURITY_GRAPH_NODE_TYPES = [
  "cve",
  "security_finding",
  "component",
  "package",
  "service",
  "environment",
  "owner",
  "customer_exposure",
  "policy",
  "control",
] as const;

export type SecurityGraphNodeType =
  (typeof SECURITY_GRAPH_NODE_TYPES)[number];

export function isSecurityGraphNodeType(s: unknown): s is SecurityGraphNodeType {
  return (
    typeof s === "string" &&
    (SECURITY_GRAPH_NODE_TYPES as readonly string[]).includes(s)
  );
}

// ============================================================================
// Canonical impact path (roadmap §Phase 25)
// ============================================================================

/**
 * The traversal operators run most often: "given a CVE, walk to the
 * customer-facing exposures." Each step is one hop in the graph.
 * Hard-coded as a closed sequence so impact-analysis queries can
 * lock against this shape; future paths (e.g. inverse — "given a
 * customer report, find the CVEs that touched them") are separate
 * registered traversals.
 */
export const SECURITY_GRAPH_CANONICAL_IMPACT_PATH = [
  "cve",
  "package",
  "component",
  "service",
  "environment",
  "owner",
  "customer_exposure",
] as const satisfies ReadonlyArray<SecurityGraphNodeType>;

export type SecurityGraphCanonicalPathStep =
  (typeof SECURITY_GRAPH_CANONICAL_IMPACT_PATH)[number];

// ============================================================================
// Severity taxonomy (mirrors CVSS coarse buckets)
// ============================================================================

export const SECURITY_FINDING_SEVERITIES = [
  "informational",
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type SecurityFindingSeverity =
  (typeof SECURITY_FINDING_SEVERITIES)[number];

export function isSecurityFindingSeverity(
  s: unknown,
): s is SecurityFindingSeverity {
  return (
    typeof s === "string" &&
    (SECURITY_FINDING_SEVERITIES as readonly string[]).includes(s)
  );
}

/**
 * Numeric rank for a severity (0 = informational, 4 = critical). Higher
 * rank = more severe. Use for comparator-style sorting.
 */
export function severityRank(severity: SecurityFindingSeverity): number {
  return SECURITY_FINDING_SEVERITIES.indexOf(severity);
}

/**
 * Comparator returning Array.sort-style ordering: negative when `a` is
 * LESS severe than `b`, positive when MORE severe, 0 when equal. Use
 * directly with `Array.sort(compareSecuritySeverity)` for ascending
 * order, or wrap in `(a, b) => -compareSecuritySeverity(a, b)` for
 * descending.
 */
export function compareSecuritySeverity(
  a: SecurityFindingSeverity,
  b: SecurityFindingSeverity,
): number {
  return severityRank(a) - severityRank(b);
}

/**
 * Returns a new array of items sorted by their severity DESCENDING
 * (critical first). Stable with respect to input order for ties. Does
 * NOT mutate the input.
 */
export function sortBySeverityDesc<T>(
  items: ReadonlyArray<T>,
  getSeverity: (item: T) => SecurityFindingSeverity,
): readonly T[] {
  return [...items].sort(
    (a, b) => -compareSecuritySeverity(getSeverity(a), getSeverity(b)),
  );
}

/**
 * Returns the most-severe item in the input, or `undefined` for an
 * empty array. Ties broken by first occurrence in input order. Does
 * NOT mutate the input.
 */
export function getMostSevereItem<T>(
  items: ReadonlyArray<T>,
  getSeverity: (item: T) => SecurityFindingSeverity,
): T | undefined {
  if (items.length === 0) return undefined;
  let best = items[0];
  let bestRank = severityRank(getSeverity(best));
  for (let i = 1; i < items.length; i++) {
    const itemRank = severityRank(getSeverity(items[i]));
    if (itemRank > bestRank) {
      best = items[i];
      bestRank = itemRank;
    }
  }
  return best;
}

/**
 * Map a numeric CVSS score (0..10) to its coarse severity bucket.
 * Boundary semantics match the NVD published cuts:
 *   - 0.0          → informational
 *   - 0.1..3.9     → low
 *   - 4.0..6.9     → medium
 *   - 7.0..8.9     → high
 *   - 9.0..10.0    → critical
 * Out-of-range inputs (negative or > 10) throw.
 */
export function cvssScoreToSeverity(score: number): SecurityFindingSeverity {
  if (!Number.isFinite(score)) {
    throw new Error(
      `CVSS score must be a finite number; got ${String(score)}`,
    );
  }
  if (score < 0 || score > 10) {
    throw new Error(
      `CVSS score must be in [0, 10]; got ${score}`,
    );
  }
  if (score === 0) return "informational";
  if (score < 4) return "low";
  if (score < 7) return "medium";
  if (score < 9) return "high";
  return "critical";
}

// ============================================================================
// Permission scope — security findings are NOT workspace-public
// ============================================================================

/**
 * Per roadmap §Phase 25 "Permission rules remain enforced", security
 * findings are NOT workspace-public by default. The lens runner MUST
 * post-filter results by the viewer's `security_findings_view`
 * permission. This constant is the canonical permission key the
 * filter step checks.
 */
export const SECURITY_FINDINGS_VIEW_PERMISSION_KEY = "security_findings_view";

/**
 * Boundary marker — security graph queries operate at this permission
 * scope by default. The lens-runner uses this to set the default
 * `requiresPermission` flag on every security-lens query.
 */
export const SECURITY_GRAPH_DEFAULT_PERMISSION_SCOPE = "approver_only" as const;

// ============================================================================
// Canonical impact-path navigation
// ============================================================================

/** Type guard for canonical-path steps. */
export function isCanonicalImpactStep(
  s: unknown,
): s is SecurityGraphCanonicalPathStep {
  return (
    typeof s === "string" &&
    (SECURITY_GRAPH_CANONICAL_IMPACT_PATH as readonly string[]).includes(s)
  );
}

/**
 * Returns the next step in the canonical impact path, or `null` when
 * `currentStep` is the terminal step (`customer_exposure`).
 *
 * Throws when `currentStep` is not a recognized canonical-path step —
 * callers must use `isCanonicalImpactStep` first if the input is
 * untrusted.
 */
export function getNextCanonicalImpactStep(
  currentStep: SecurityGraphCanonicalPathStep,
): SecurityGraphCanonicalPathStep | null {
  const idx = SECURITY_GRAPH_CANONICAL_IMPACT_PATH.indexOf(currentStep);
  if (idx === -1) {
    throw new Error(
      `Unknown canonical impact step: ${String(currentStep)}`,
    );
  }
  if (idx === SECURITY_GRAPH_CANONICAL_IMPACT_PATH.length - 1) {
    return null;
  }
  return SECURITY_GRAPH_CANONICAL_IMPACT_PATH[idx + 1];
}

/**
 * Returns the previous step in the canonical impact path, or `null`
 * when `currentStep` is the origin step (`cve`).
 */
export function getPreviousCanonicalImpactStep(
  currentStep: SecurityGraphCanonicalPathStep,
): SecurityGraphCanonicalPathStep | null {
  const idx = SECURITY_GRAPH_CANONICAL_IMPACT_PATH.indexOf(currentStep);
  if (idx === -1) {
    throw new Error(
      `Unknown canonical impact step: ${String(currentStep)}`,
    );
  }
  if (idx === 0) return null;
  return SECURITY_GRAPH_CANONICAL_IMPACT_PATH[idx - 1];
}

/**
 * Returns the slice of the canonical path FROM `startStep` to the
 * terminal step (inclusive on both ends). Useful for lens UI
 * "remaining steps" indicators.
 */
export function getCanonicalImpactPathFromStep(
  startStep: SecurityGraphCanonicalPathStep,
): ReadonlyArray<SecurityGraphCanonicalPathStep> {
  const idx = SECURITY_GRAPH_CANONICAL_IMPACT_PATH.indexOf(startStep);
  if (idx === -1) {
    throw new Error(
      `Unknown canonical impact step: ${String(startStep)}`,
    );
  }
  return SECURITY_GRAPH_CANONICAL_IMPACT_PATH.slice(idx);
}

/** Validation outcome for {@link validateImpactPathSequence}. */
export type CanonicalImpactPathValidationOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "empty_sequence"
        | "unknown_step"
        | "sequence_not_strictly_advancing"
        | "sequence_skips_steps";
      readonly stepIndex?: number;
    };

/**
 * Validates that a sequence of node-type-keys is a strictly advancing
 * walk through the canonical impact path (no jumps, no reversals, no
 * unknown steps). The walk does NOT have to start at the origin or
 * reach the terminal — partial canonical walks are valid.
 *
 * Examples (valid):
 *   - ["cve", "package", "component"]
 *   - ["service", "environment", "owner", "customer_exposure"]
 *
 * Examples (invalid):
 *   - ["cve", "component"]  → skips "package"
 *   - ["cve", "package", "cve"]  → not strictly advancing
 *   - ["cve", "user"]  → "user" is not in the canonical path
 *
 * Used by impact-analysis query templates to assert the lens-UI's
 * step picker emitted a well-formed traversal.
 */
export function validateImpactPathSequence(
  steps: ReadonlyArray<string>,
): CanonicalImpactPathValidationOutcome {
  if (steps.length === 0) {
    return { ok: false, reason: "empty_sequence" };
  }
  let prevIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    const idx = SECURITY_GRAPH_CANONICAL_IMPACT_PATH.indexOf(
      steps[i] as SecurityGraphCanonicalPathStep,
    );
    if (idx === -1) {
      return { ok: false, reason: "unknown_step", stepIndex: i };
    }
    if (i === 0) {
      prevIdx = idx;
      continue;
    }
    if (idx <= prevIdx) {
      return {
        ok: false,
        reason: "sequence_not_strictly_advancing",
        stepIndex: i,
      };
    }
    if (idx !== prevIdx + 1) {
      return { ok: false, reason: "sequence_skips_steps", stepIndex: i };
    }
    prevIdx = idx;
  }
  return { ok: true };
}
