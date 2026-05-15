/**
 * Institutional Memory node projector — Phase 25 §T-G.10.
 *
 * Pure functions that convert SoT rows into projected graph nodes per
 * the closed-taxonomy mapping in `contracts.ts` (#994).
 *
 * The eventual lens-runner reads SoT rows from the source table named
 * in `INSTITUTIONAL_MEMORY_SOURCE_MAPPING[type].sourceTable`, then
 * passes each row through `projectInstitutionalMemoryNode` to get a
 * stable `ProjectedInstitutionalMemoryNode` shape.
 *
 * Failure modes are returned as `null` (not thrown) so the bulk
 * `projectInstitutionalMemoryNodes` can skip unprojectable rows and
 * accumulate them in a typed reason counter.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure functions. No DB I/O. No graph mutation.
 *   - Inputs are `Record<string, unknown>` so callers don't have to
 *     bring their SoT row types into this module.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 */

import {
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
  type InstitutionalMemoryNodeType,
} from "./contracts.js";

export interface ProjectedInstitutionalMemoryNode {
  readonly typeKey: InstitutionalMemoryNodeType;
  /** Stringified row id. SoT rows use numeric or uuid ids; the
   *  projection normalizes to string for graph-projection use. */
  readonly id: string;
  readonly label: string;
}

export const INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS = [
  "node_type_not_mapped_to_source_table",
  "row_missing_id_column",
  "row_missing_label_column",
  "row_id_not_stringifiable",
] as const;

export type InstitutionalMemoryProjectionSkipReason =
  (typeof INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS)[number];

// ============================================================================
// Per-skip-reason operator-facing metadata (T-G.32)
// ============================================================================

export interface InstitutionalMemoryProjectionSkipReasonMetadata {
  /** Display label for operator dashboards / projection-skip drill-downs. */
  readonly label: string;
  /** Short description of what the skip indicates. */
  readonly description: string;
  /** Closed-taxonomy classification:
   *  - `taxonomy_gap`: the institutional-memory node type isn't mapped to a
   *    SoT table yet (extend `INSTITUTIONAL_MEMORY_SOURCE_MAPPING`).
   *  - `source_row_defect`: the SoT row is missing or malformed
   *    (data-quality investigation).
   *  - `source_schema_drift`: the SoT row's id column changed shape (id
   *    became an object/array, suggesting an upstream schema change). */
  readonly classification:
    | "taxonomy_gap"
    | "source_row_defect"
    | "source_schema_drift";
  /** Operator-facing remediation hint. */
  readonly remediation: string;
}

export const INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA: Readonly<
  Record<
    InstitutionalMemoryProjectionSkipReason,
    InstitutionalMemoryProjectionSkipReasonMetadata
  >
> = {
  node_type_not_mapped_to_source_table: {
    label: "Node Type Unmapped",
    description:
      "The institutional-memory node type has no source-of-truth table mapped in INSTITUTIONAL_MEMORY_SOURCE_MAPPING — projection has nothing to read from.",
    classification: "taxonomy_gap",
    remediation:
      "Extend INSTITUTIONAL_MEMORY_SOURCE_MAPPING to bind this node type to a SoT table + idColumn + labelColumn.",
  },
  row_missing_id_column: {
    label: "Missing ID Column",
    description:
      "The SoT row is missing its configured id column value (undefined/null) — likely a half-built insert or a schema mismatch.",
    classification: "source_row_defect",
    remediation:
      "Investigate the source table — either the row was partially-inserted or the idColumn mapping is wrong for this table.",
  },
  row_missing_label_column: {
    label: "Missing Label Column",
    description:
      "The SoT row is missing its configured label column value (undefined/null) — usually a half-built insert.",
    classification: "source_row_defect",
    remediation:
      "Backfill the missing label column value or update INSTITUTIONAL_MEMORY_SOURCE_MAPPING.labelColumn to point at a column that's always populated.",
  },
  row_id_not_stringifiable: {
    label: "ID Not Stringifiable",
    description:
      "The SoT row's id column value is an object or array — likely a schema drift event where the column shape changed.",
    classification: "source_schema_drift",
    remediation:
      "Investigate the source table's id column — it should be number/bigint/string/uuid. If the column changed shape, update the mapping or restore the original column.",
  },
};

export function getInstitutionalMemoryProjectionSkipReasonMetadata(
  reason: InstitutionalMemoryProjectionSkipReason,
): InstitutionalMemoryProjectionSkipReasonMetadata {
  return INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA[reason];
}

/**
 * Returns the projected node OR `null` if the row cannot be projected.
 * Use `projectInstitutionalMemoryNodeWithReason` for diagnostics.
 */
export function projectInstitutionalMemoryNode(
  nodeType: InstitutionalMemoryNodeType,
  row: Record<string, unknown>,
): ProjectedInstitutionalMemoryNode | null {
  const result = projectInstitutionalMemoryNodeWithReason(nodeType, row);
  return result.ok ? result.node : null;
}

export type ProjectInstitutionalMemoryNodeOutcome =
  | { readonly ok: true; readonly node: ProjectedInstitutionalMemoryNode }
  | {
      readonly ok: false;
      readonly reason: InstitutionalMemoryProjectionSkipReason;
    };

export function projectInstitutionalMemoryNodeWithReason(
  nodeType: InstitutionalMemoryNodeType,
  row: Record<string, unknown>,
): ProjectInstitutionalMemoryNodeOutcome {
  const mapping = INSTITUTIONAL_MEMORY_SOURCE_MAPPING[nodeType];
  if (
    mapping.sourceTable === null ||
    mapping.idColumn === null ||
    mapping.labelColumn === null
  ) {
    return { ok: false, reason: "node_type_not_mapped_to_source_table" };
  }
  const rawId = row[mapping.idColumn];
  if (rawId === undefined || rawId === null) {
    return { ok: false, reason: "row_missing_id_column" };
  }
  // SoT ids: number | bigint | string | uuid. Coerce-to-string;
  // refuse on objects / arrays / unstringifiable.
  let id: string;
  if (typeof rawId === "string") {
    id = rawId;
  } else if (typeof rawId === "number" || typeof rawId === "bigint") {
    id = String(rawId);
  } else {
    return { ok: false, reason: "row_id_not_stringifiable" };
  }
  const rawLabel = row[mapping.labelColumn];
  if (rawLabel === undefined || rawLabel === null) {
    return { ok: false, reason: "row_missing_label_column" };
  }
  const label = String(rawLabel);
  return {
    ok: true,
    node: { typeKey: nodeType, id, label },
  };
}

export interface ProjectInstitutionalMemoryNodesResult {
  readonly nodes: ReadonlyArray<ProjectedInstitutionalMemoryNode>;
  readonly skippedByReason: Readonly<
    Record<InstitutionalMemoryProjectionSkipReason, number>
  >;
}

/**
 * Bulk projection. Skipped rows are accumulated into the
 * `skippedByReason` counter for operator dashboards / lens-runner
 * logging.
 */
export function projectInstitutionalMemoryNodes(
  nodeType: InstitutionalMemoryNodeType,
  rows: ReadonlyArray<Record<string, unknown>>,
): ProjectInstitutionalMemoryNodesResult {
  const nodes: ProjectedInstitutionalMemoryNode[] = [];
  const skippedByReason: Record<
    InstitutionalMemoryProjectionSkipReason,
    number
  > = {
    node_type_not_mapped_to_source_table: 0,
    row_missing_id_column: 0,
    row_missing_label_column: 0,
    row_id_not_stringifiable: 0,
  };
  for (const row of rows) {
    const outcome = projectInstitutionalMemoryNodeWithReason(nodeType, row);
    if (outcome.ok) {
      nodes.push(outcome.node);
    } else {
      skippedByReason[outcome.reason]++;
    }
  }
  return { nodes, skippedByReason };
}

/** Returns true when the node type has a real SoT mapping. */
export function isInstitutionalMemoryMappable(
  nodeType: InstitutionalMemoryNodeType,
): boolean {
  const m = INSTITUTIONAL_MEMORY_SOURCE_MAPPING[nodeType];
  return (
    m.sourceTable !== null && m.idColumn !== null && m.labelColumn !== null
  );
}

// ============================================================================
// Projection-result summary (T-G.22)
// ============================================================================

export interface InstitutionalMemoryProjectionResultSummary {
  readonly totalRows: number;
  readonly projected: number;
  readonly skipped: number;
  readonly skippedByReason: Readonly<
    Record<InstitutionalMemoryProjectionSkipReason, number>
  >;
  /** Projected-out-of-input ratio in [0, 100], 1-decimal precision.
   *  0 when totalRows is 0 (avoids NaN). */
  readonly projectedPercent: number;
}

/**
 * Aggregates a `ProjectInstitutionalMemoryNodesResult` into an
 * operator-dashboard-ready summary. Useful for "X of Y rows projected,
 * Z by reason" gauges in the lens-runner's logging output.
 *
 * Pure function. Does NOT mutate the input.
 */
export function summarizeInstitutionalMemoryProjectionResult(
  result: ProjectInstitutionalMemoryNodesResult,
): InstitutionalMemoryProjectionResultSummary {
  const projected = result.nodes.length;
  let skipped = 0;
  for (const r of INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS) {
    skipped += result.skippedByReason[r];
  }
  const totalRows = projected + skipped;
  const projectedPercent =
    totalRows === 0 ? 0 : Math.round((projected / totalRows) * 1000) / 10;
  return {
    totalRows,
    projected,
    skipped,
    skippedByReason: result.skippedByReason,
    projectedPercent,
  };
}
