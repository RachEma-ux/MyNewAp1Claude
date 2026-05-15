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
// Per-node-type operator-facing metadata (T-G.24)
// ============================================================================

export interface SecurityGraphNodeTypeMetadata {
  /** Display label for operator UI tabs / lens overlays. */
  readonly label: string;
  /** Short description of what this node type represents. */
  readonly description: string;
}

export const SECURITY_GRAPH_NODE_TYPE_METADATA: Readonly<
  Record<SecurityGraphNodeType, SecurityGraphNodeTypeMetadata>
> = {
  cve: {
    label: "CVE",
    description:
      "Common Vulnerabilities and Exposures entry — the canonical vulnerability identifier.",
  },
  security_finding: {
    label: "Security Finding",
    description:
      "A non-CVE security observation: misconfiguration, weak credential, exposed surface.",
  },
  component: {
    label: "Component",
    description:
      "A logical software / hardware component that may be vulnerable or harden-able.",
  },
  package: {
    label: "Package",
    description:
      "A versioned dependency artifact (npm / pip / OS package) that components depend on.",
  },
  service: {
    label: "Service",
    description:
      "A running service or application — composed of components, exposed to environments.",
  },
  environment: {
    label: "Environment",
    description:
      "A deployment target (production / staging / customer-vault) where services run.",
  },
  owner: {
    label: "Owner",
    description:
      "The person or team responsible for the service in an environment — patch-decision authority.",
  },
  customer_exposure: {
    label: "Customer Exposure",
    description:
      "Customer-facing scope — which customers are exposed if a service is compromised.",
  },
  policy: {
    label: "Policy",
    description:
      "A governance policy — patch SLOs, mandatory upgrades, accepted-risk windows.",
  },
  control: {
    label: "Control",
    description:
      "A mitigation control — WAF rule, network segmentation, runtime sandbox.",
  },
};

export function getSecurityGraphNodeTypeMetadata(
  type: SecurityGraphNodeType,
): SecurityGraphNodeTypeMetadata {
  return SECURITY_GRAPH_NODE_TYPE_METADATA[type];
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

// ============================================================================
// Per-severity operator-facing metadata (T-G.29)
// ============================================================================

export interface SecurityFindingSeverityMetadata {
  /** Display label for operator dashboards. */
  readonly label: string;
  /** Short description of the severity meaning. */
  readonly description: string;
  /** Inclusive CVSS score range (NVD coarse cuts) — null for
   *  `informational` which spans only the explicit 0.0 case. */
  readonly cvssRange: readonly [number, number] | null;
  /** Operator-action expectation. */
  readonly operatorAction:
    | "informational"
    | "monitor"
    | "schedule_patch"
    | "patch_soon"
    | "patch_now";
}

export const SECURITY_FINDING_SEVERITY_METADATA: Readonly<
  Record<SecurityFindingSeverity, SecurityFindingSeverityMetadata>
> = {
  informational: {
    label: "Informational",
    description:
      "CVSS 0.0 — security observation without a measurable severity. Surfaced for context, not action.",
    cvssRange: null,
    operatorAction: "informational",
  },
  low: {
    label: "Low",
    description:
      "CVSS 0.1–3.9 — minor exposure. Patch within the next routine cycle; no urgency.",
    cvssRange: [0.1, 3.9],
    operatorAction: "monitor",
  },
  medium: {
    label: "Medium",
    description:
      "CVSS 4.0–6.9 — meaningful exposure. Patch within the next scheduled window.",
    cvssRange: [4.0, 6.9],
    operatorAction: "schedule_patch",
  },
  high: {
    label: "High",
    description:
      "CVSS 7.0–8.9 — significant exposure. Patch out-of-band within days.",
    cvssRange: [7.0, 8.9],
    operatorAction: "patch_soon",
  },
  critical: {
    label: "Critical",
    description:
      "CVSS 9.0–10.0 — severe exposure. Patch immediately, escalate to on-call.",
    cvssRange: [9.0, 10.0],
    operatorAction: "patch_now",
  },
};

export function getSecurityFindingSeverityMetadata(
  severity: SecurityFindingSeverity,
): SecurityFindingSeverityMetadata {
  return SECURITY_FINDING_SEVERITY_METADATA[severity];
}

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

// ============================================================================
// Finding aggregation (T-G.15)
// ============================================================================

export interface SecurityFindingSummary {
  readonly total: number;
  readonly bySeverity: Readonly<Record<SecurityFindingSeverity, number>>;
  /** Counts of items whose `pathStep` matches each canonical impact
   *  path step. Items with `pathStep` set to a non-canonical value
   *  are silently ignored. */
  readonly byCanonicalPathStep: Readonly<
    Record<SecurityGraphCanonicalPathStep, number>
  >;
  /** Most-severe finding in the input, or `undefined` for empty
   *  input. Ties broken by first occurrence. */
  readonly mostSevereIndex: number | null;
}

/**
 * Aggregates a list of security findings into a stable-shape summary:
 * counts by severity (always 5 keys at 0+), counts by canonical
 * impact path step (always 7 keys at 0+), and the index of the
 * most-severe finding.
 *
 * `getSeverity` and `getPathStep` are accessors so the helper isn't
 * coupled to a specific row shape — the same aggregator works on
 * raw scanner output, query-projected rows, or test fixtures.
 *
 * Pure function. Does NOT mutate the input.
 */
export function summarizeSecurityFindings<T>(
  findings: ReadonlyArray<T>,
  getSeverity: (item: T) => SecurityFindingSeverity,
  getPathStep: (item: T) => string | undefined,
): SecurityFindingSummary {
  const bySeverity: Record<string, number> = {};
  for (const s of SECURITY_FINDING_SEVERITIES) bySeverity[s] = 0;

  const byCanonicalPathStep: Record<string, number> = {};
  for (const p of SECURITY_GRAPH_CANONICAL_IMPACT_PATH) {
    byCanonicalPathStep[p] = 0;
  }

  let mostSevereIndex: number | null = null;
  let mostSevereRank = -1;
  for (let i = 0; i < findings.length; i++) {
    const item = findings[i];
    const sev = getSeverity(item);
    bySeverity[sev] += 1;
    const step = getPathStep(item);
    if (
      step !== undefined &&
      (SECURITY_GRAPH_CANONICAL_IMPACT_PATH as readonly string[]).includes(
        step,
      )
    ) {
      byCanonicalPathStep[step] += 1;
    }
    const rank = severityRank(sev);
    if (rank > mostSevereRank) {
      mostSevereRank = rank;
      mostSevereIndex = i;
    }
  }
  return {
    total: findings.length,
    bySeverity: bySeverity as Readonly<
      Record<SecurityFindingSeverity, number>
    >,
    byCanonicalPathStep: byCanonicalPathStep as Readonly<
      Record<SecurityGraphCanonicalPathStep, number>
    >,
    mostSevereIndex,
  };
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

/**
 * Mirror of {@link getCanonicalImpactPathFromStep} — returns the slice
 * of the canonical path from the origin (`cve`) up to and INCLUDING
 * `endStep`. Useful for "you are HERE" indicators in step pickers.
 */
export function getCanonicalImpactPathToStep(
  endStep: SecurityGraphCanonicalPathStep,
): ReadonlyArray<SecurityGraphCanonicalPathStep> {
  const idx = SECURITY_GRAPH_CANONICAL_IMPACT_PATH.indexOf(endStep);
  if (idx === -1) {
    throw new Error(
      `Unknown canonical impact step: ${String(endStep)}`,
    );
  }
  return SECURITY_GRAPH_CANONICAL_IMPACT_PATH.slice(0, idx + 1);
}

/**
 * Returns the inclusive slice between `startStep` and `endStep`. The
 * caller must pass steps in canonical order (start <= end); reversed
 * inputs throw `Error("startStep must precede endStep ...")` rather
 * than returning a reversed/empty slice.
 */
export function getCanonicalImpactSubPath(
  startStep: SecurityGraphCanonicalPathStep,
  endStep: SecurityGraphCanonicalPathStep,
): ReadonlyArray<SecurityGraphCanonicalPathStep> {
  const startIdx = SECURITY_GRAPH_CANONICAL_IMPACT_PATH.indexOf(startStep);
  const endIdx = SECURITY_GRAPH_CANONICAL_IMPACT_PATH.indexOf(endStep);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `Unknown canonical impact step in sub-path: start=${String(startStep)}, end=${String(endStep)}`,
    );
  }
  if (startIdx > endIdx) {
    throw new Error(
      `startStep must precede endStep in canonical order (got start=${startStep}, end=${endStep})`,
    );
  }
  return SECURITY_GRAPH_CANONICAL_IMPACT_PATH.slice(startIdx, endIdx + 1);
}

/**
 * Returns the signed hop distance from `a` to `b` along the canonical
 * impact path. Positive when `b` is later than `a`, negative when
 * earlier, zero when equal. Returns `null` when either step is not on
 * the canonical path (caller checks for "unknown step" without a try
 * / catch boilerplate).
 */
export function getCanonicalImpactDistance(
  a: string,
  b: string,
): number | null {
  const ai = SECURITY_GRAPH_CANONICAL_IMPACT_PATH.indexOf(
    a as SecurityGraphCanonicalPathStep,
  );
  const bi = SECURITY_GRAPH_CANONICAL_IMPACT_PATH.indexOf(
    b as SecurityGraphCanonicalPathStep,
  );
  if (ai === -1 || bi === -1) return null;
  return bi - ai;
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
// ============================================================================
// Batch impact-path validation summary (T-G.20)
// ============================================================================

const IMPACT_PATH_VALIDATION_REASONS = [
  "empty_sequence",
  "unknown_step",
  "sequence_not_strictly_advancing",
  "sequence_skips_steps",
] as const;

export type ImpactPathValidationReason =
  (typeof IMPACT_PATH_VALIDATION_REASONS)[number];

export interface ImpactPathValidationBatchSummary {
  readonly total: number;
  readonly ok: number;
  readonly failed: number;
  /** Counts per closed-reason taxonomy. Stable-shape — every reason
   *  key present at 0+. */
  readonly failedByReason: Readonly<
    Record<ImpactPathValidationReason, number>
  >;
}

/**
 * Aggregates a batch of `CanonicalImpactPathValidationOutcome` results
 * into a stable-shape summary. Operator-facing "X of Y sequences
 * valid; failures keyed by reason" gauge.
 *
 * Pure function. Does NOT mutate the input.
 */
export function summarizeImpactPathValidationOutcomes(
  outcomes: ReadonlyArray<CanonicalImpactPathValidationOutcome>,
): ImpactPathValidationBatchSummary {
  const failedByReason: Record<string, number> = {};
  for (const r of IMPACT_PATH_VALIDATION_REASONS) failedByReason[r] = 0;
  let ok = 0;
  let failed = 0;
  for (const o of outcomes) {
    if (o.ok) ok += 1;
    else {
      failed += 1;
      failedByReason[o.reason] += 1;
    }
  }
  return {
    total: outcomes.length,
    ok,
    failed,
    failedByReason: failedByReason as Readonly<
      Record<ImpactPathValidationReason, number>
    >,
  };
}

export const IMPACT_PATH_VALIDATION_REASON_KEYS =
  IMPACT_PATH_VALIDATION_REASONS;

// ============================================================================
// Per-validation-reason operator-facing metadata (T-G.34)
// ============================================================================

export interface ImpactPathValidationReasonMetadata {
  /** Display label for operator dashboards / impact-path validation
   *  drill-downs. */
  readonly label: string;
  /** Short description of what the validation failure indicates. */
  readonly description: string;
  /** Closed-taxonomy classification:
   *  - `caller_input_error`: the caller supplied a degenerate sequence
   *    (empty, unknown step) — fix at the call site / picker UI.
   *  - `structural_violation`: the caller supplied a recognisable
   *    sequence but it violates the canonical impact-path ordering
   *    (not strictly advancing / skips intermediate steps). */
  readonly classification: "caller_input_error" | "structural_violation";
  /** Operator-facing remediation hint. */
  readonly remediation: string;
}

export const IMPACT_PATH_VALIDATION_REASON_METADATA: Readonly<
  Record<ImpactPathValidationReason, ImpactPathValidationReasonMetadata>
> = {
  empty_sequence: {
    label: "Empty Sequence",
    description:
      "The caller submitted an empty step sequence — impact-path validation needs at least one step to validate.",
    classification: "caller_input_error",
    remediation:
      "Investigate the call site — the operator likely cleared the impact-path picker without re-submitting. UI should disable submit on empty sequences.",
  },
  unknown_step: {
    label: "Unknown Step",
    description:
      "The sequence contains a step value that isn't in the canonical impact-path taxonomy — likely a stale ingest or schema drift.",
    classification: "caller_input_error",
    remediation:
      "Check the step picker — it should restrict to SECURITY_GRAPH_CANONICAL_IMPACT_PATH values. If the value came from a stored sequence, the canonical path changed shape.",
  },
  sequence_not_strictly_advancing: {
    label: "Not Strictly Advancing",
    description:
      "The sequence revisits or backtracks across canonical impact-path steps — impact analysis only supports forward traversal.",
    classification: "structural_violation",
    remediation:
      "The picker should disallow selecting an earlier or duplicate step. Convert backtracking sequences into a separate reverse-traversal query.",
  },
  sequence_skips_steps: {
    label: "Sequence Skips Steps",
    description:
      "The sequence jumps over intermediate canonical impact-path steps (e.g. cve → service skips package + component) — impact analysis requires consecutive steps.",
    classification: "structural_violation",
    remediation:
      "The picker should auto-fill intermediate steps when the operator picks a non-adjacent step. Or, gate the picker so only adjacent steps are selectable from the current position.",
  },
};

export function getImpactPathValidationReasonMetadata(
  reason: ImpactPathValidationReason,
): ImpactPathValidationReasonMetadata {
  return IMPACT_PATH_VALIDATION_REASON_METADATA[reason];
}

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
