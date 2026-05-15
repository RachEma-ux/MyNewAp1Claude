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

export type InstitutionalMemoryProjectionSkipReason =
  | "node_type_not_mapped_to_source_table"
  | "row_missing_id_column"
  | "row_missing_label_column"
  | "row_id_not_stringifiable";

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
