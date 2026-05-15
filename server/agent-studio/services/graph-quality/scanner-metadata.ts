/**
 * Canonical metadata for every registered graph-quality scanner.
 *
 * Phase 23 §1. Operator-facing introspection surface that runs
 * parallel to `QUALITY_SCANNER_REGISTRY` in `public-api.ts`. Each
 * registered scanner exposes the same structural fields here so the
 * operator dashboard (and future help text) can render a stable
 * description of what each scan does without re-reading scanner
 * source files.
 *
 * Lockstep invariants (enforced by `scanner-metadata.test.ts`):
 *   - Every `QUALITY_SCANNER_REGISTRY` entry has a metadata row keyed
 *     by `scanKind`.
 *   - Every metadata row's `scanKind` matches a registered scanner.
 *   - Every metadata row's `proposalKind` matches the
 *     `FINDING_CLASS_TO_PROPOSAL_KIND` table OR the documented
 *     `review_<class>` fallback.
 *
 * Hard-rule compliance:
 *   - Pure data. No DB I/O. No graph mutation. No `neo4j-driver` /
 *     dispatcher / openrouter imports.
 */

export type QualityScannerCategory =
  | "provenance"
  | "structure"
  | "freshness"
  | "deduplication"
  | "topology";

export interface QualityScannerMetadata {
  readonly scanKind: string;
  readonly category: QualityScannerCategory;
  readonly defaultSeverity: "low" | "medium" | "high" | "critical";
  readonly summary: string;
  readonly proposalKind: string;
}

export const QUALITY_SCANNER_METADATA: Readonly<
  Record<string, QualityScannerMetadata>
> = {
  orphan_node: {
    scanKind: "orphan_node",
    category: "topology",
    defaultSeverity: "medium",
    summary:
      "Detects nodes with zero incoming AND zero outgoing edges — usually a partial ingest or a stale projection.",
    proposalKind: "link_or_archive_orphan_node",
  },
  duplicate_entity: {
    scanKind: "duplicate_entity",
    category: "deduplication",
    defaultSeverity: "high",
    summary:
      "Detects nodes that share canonicalized labels within the same typeKey — merge candidates for entity resolution.",
    proposalKind: "merge_duplicate_entities",
  },
  stale_node: {
    scanKind: "stale_node",
    category: "freshness",
    defaultSeverity: "low",
    summary:
      "Detects nodes whose sourceVersionId is older than the latest pinned version for the same sourceId — re-promote candidates.",
    proposalKind: "re_promote_with_source_version",
  },
  self_loop: {
    scanKind: "self_loop",
    category: "structure",
    defaultSeverity: "low",
    summary:
      "Detects edges where source and target node identities match — usually a bad ingest unless intentionally self-referential.",
    proposalKind: "review_self_loop",
  },
  missing_provenance: {
    scanKind: "missing_provenance",
    category: "provenance",
    defaultSeverity: "high",
    summary:
      "Detects nodes that have no sourceId set at all — fully unprovenanced rows that violate Phase 11 rollback.",
    proposalKind: "backfill_or_delete_unprovenanced_node",
  },
  dangling_edge_endpoint: {
    scanKind: "dangling_edge_endpoint",
    category: "structure",
    defaultSeverity: "high",
    summary:
      "Detects edges whose source or target node is missing from the projection sample — broken reference candidates.",
    proposalKind: "backfill_node_or_delete_dangling_edge",
  },
  parallel_edges: {
    scanKind: "parallel_edges",
    category: "deduplication",
    defaultSeverity: "low",
    summary:
      "Detects multiple edges with identical typeKey + source + target — projection duplicates safe to merge.",
    proposalKind: "deduplicate_parallel_edges",
  },
  excessive_fanout: {
    scanKind: "excessive_fanout",
    category: "topology",
    defaultSeverity: "medium",
    summary:
      "Detects nodes with degree above a configurable threshold (super-nodes) — entity-resolution candidates and query-cost risks.",
    proposalKind: "review_super_node_for_entity_resolution",
  },
  isolated_subgraph: {
    scanKind: "isolated_subgraph",
    category: "topology",
    defaultSeverity: "low",
    summary:
      "Detects connected components below a configurable size threshold — possibly orphaned subgraphs from incomplete migrations.",
    proposalKind: "review_isolated_subgraph_for_stale_or_orphan",
  },
  missing_source_version: {
    scanKind: "missing_source_version",
    category: "provenance",
    defaultSeverity: "medium",
    summary:
      "Detects nodes with sourceId set but sourceVersionId empty — half-built projection state breaking version-pinning.",
    proposalKind: "backfill_source_version_or_reproject_node",
  },
};

export function getScannerMetadata(
  scanKind: string,
): QualityScannerMetadata | undefined {
  return QUALITY_SCANNER_METADATA[scanKind];
}

export function listScannerMetadata(): readonly QualityScannerMetadata[] {
  return Object.values(QUALITY_SCANNER_METADATA);
}

// ============================================================================
// Finding-list aggregation (T-D.8)
// ============================================================================

export const QUALITY_FINDING_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type QualityFindingSeverity = (typeof QUALITY_FINDING_SEVERITIES)[number];

export interface QualityFindingListSummary {
  readonly total: number;
  /** Counts per closed-taxonomy `findingClass` (== scanKind). Sparse
   *  in the failure mode where a finding row carries a non-registered
   *  scanKind (stale ingest); those are counted separately. */
  readonly byScanKind: Readonly<Record<string, number>>;
  /** Counts per severity. Stable-shape — every QUALITY_FINDING_
   *  SEVERITIES key keyed at 0+. */
  readonly bySeverity: Readonly<Record<QualityFindingSeverity, number>>;
  /** Counts per scanner category (provenance / structure / freshness
   *  / deduplication / topology). Stable-shape across the closed
   *  category taxonomy. */
  readonly byCategory: Readonly<Record<QualityScannerCategory, number>>;
  /** Findings whose `findingClass` doesn't match any registered
   *  scanner (stale ingest). Surfaces drift between scanner registry
   *  and persisted findings. */
  readonly unknownScanKindCount: number;
}

/**
 * Aggregates a list of quality findings into a stable-shape operator
 * summary. Bridges between the persisted finding rows (in
 * `ags_graph_quality_findings`) and the operator dashboard's "X by
 * severity / Y by category / Z unknown" headline.
 *
 * Generic accessor signature — no coupling to a specific row shape.
 * Unknown scanKind values are counted separately (registry drift
 * signal) rather than thrown.
 *
 * Pure function. Does NOT mutate the input.
 */
/**
 * Numeric rank for a quality finding severity (0 = low, 3 = critical).
 * Higher rank = more severe. Use for comparator-style sorting.
 */
export function qualitySeverityRank(severity: QualityFindingSeverity): number {
  return QUALITY_FINDING_SEVERITIES.indexOf(severity);
}

/**
 * Array.sort-style comparator. Negative when `a` LESS severe than `b`,
 * positive when MORE severe, 0 when equal. Use directly for ascending,
 * wrap in `(a, b) => -compareQualitySeverity(a, b)` for descending.
 */
export function compareQualitySeverity(
  a: QualityFindingSeverity,
  b: QualityFindingSeverity,
): number {
  return qualitySeverityRank(a) - qualitySeverityRank(b);
}

/**
 * Returns a new array sorted by quality-finding severity DESCENDING
 * (critical first). Stable for ties (first-occurrence wins). Does NOT
 * mutate the input.
 */
export function sortQualityFindingsBySeverityDesc<T>(
  items: ReadonlyArray<T>,
  getSeverity: (item: T) => QualityFindingSeverity,
): readonly T[] {
  return [...items].sort(
    (a, b) => -compareQualitySeverity(getSeverity(a), getSeverity(b)),
  );
}

/**
 * Returns the most-severe quality finding, or `undefined` for an empty
 * array. Ties broken by first occurrence in input order. Does NOT
 * mutate the input.
 */
export function getMostSevereQualityFinding<T>(
  items: ReadonlyArray<T>,
  getSeverity: (item: T) => QualityFindingSeverity,
): T | undefined {
  if (items.length === 0) return undefined;
  let best = items[0];
  let bestRank = qualitySeverityRank(getSeverity(best));
  for (let i = 1; i < items.length; i++) {
    const r = qualitySeverityRank(getSeverity(items[i]));
    if (r > bestRank) {
      best = items[i];
      bestRank = r;
    }
  }
  return best;
}

export function summarizeQualityFindings<T>(
  findings: ReadonlyArray<T>,
  getScanKind: (item: T) => string,
  getSeverity: (item: T) => QualityFindingSeverity,
): QualityFindingListSummary {
  const byScanKind: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const s of QUALITY_FINDING_SEVERITIES) bySeverity[s] = 0;
  const byCategory: Record<string, number> = {
    provenance: 0,
    structure: 0,
    freshness: 0,
    deduplication: 0,
    topology: 0,
  };
  let unknownScanKindCount = 0;
  for (const f of findings) {
    const scanKind = getScanKind(f);
    byScanKind[scanKind] = (byScanKind[scanKind] ?? 0) + 1;
    const sev = getSeverity(f);
    bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
    const meta = QUALITY_SCANNER_METADATA[scanKind];
    if (meta) byCategory[meta.category] += 1;
    else unknownScanKindCount += 1;
  }
  return {
    total: findings.length,
    byScanKind,
    bySeverity: bySeverity as Readonly<
      Record<QualityFindingSeverity, number>
    >,
    byCategory: byCategory as Readonly<
      Record<QualityScannerCategory, number>
    >,
    unknownScanKindCount,
  };
}

