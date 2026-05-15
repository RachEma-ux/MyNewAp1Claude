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
