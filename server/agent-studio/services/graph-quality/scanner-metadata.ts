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
