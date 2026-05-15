/**
 * Institutional Memory Lens contracts — Phase 25 §T-G.1.
 *
 * Roadmap §"Phase 25 — V1.5 Expansion" enumerates 13 closed-taxonomy
 * node types for the Institutional Memory Lens. This module pins
 * those types + their mapping to existing Postgres source-of-truth
 * tables. The lens-runner (subsequent slice) reads from the mapped
 * tables and projects into the graph; no new SoT tables are created
 * — institutional memory is a VIEW over what already exists.
 *
 * Closed taxonomy invariant:
 *   - Extending requires editing this constant AND adding an ADR
 *     explaining the new node type's source-table mapping.
 *   - Each type's mapping MUST point to an existing table; new
 *     tables get their own phase / ADR (not a hidden side-effect
 *     of adding a lens node type).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure types. No DB I/O. No graph mutation.
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 */

// ============================================================================
// Closed taxonomy — 13 institutional memory node types
// ============================================================================

export const INSTITUTIONAL_MEMORY_NODE_TYPES = [
  "person",
  "team",
  "project",
  "system",
  "service",
  "decision",
  "policy",
  "workflow",
  "document",
  "outcome",
  "responsibility",
  "timeline_event",
  "governance_record",
] as const;

export type InstitutionalMemoryNodeType =
  (typeof INSTITUTIONAL_MEMORY_NODE_TYPES)[number];

export function isInstitutionalMemoryNodeType(
  s: unknown,
): s is InstitutionalMemoryNodeType {
  return (
    typeof s === "string" &&
    (INSTITUTIONAL_MEMORY_NODE_TYPES as readonly string[]).includes(s)
  );
}

// ============================================================================
// Source-table mapping
// ============================================================================

/**
 * Each institutional memory node type projects FROM an existing
 * Postgres table. The lens-runner uses this map to drive its
 * read paths.
 *
 * The mapping is a triple:
 *   - `sourceTable`: the canonical SoT table name
 *   - `idColumn`: the column that becomes the projected node's id
 *   - `labelColumn`: the column that becomes the human-readable label
 *
 * `idColumn` MUST be a stable identifier on the SoT row. If the row
 * lacks a natural id (e.g. timeline events keyed by composite), the
 * mapping is set to `null` and the lens-runner constructs a
 * composite id; future slices fill in those composites.
 */
export interface InstitutionalMemorySourceMapping {
  readonly sourceTable: string | null;
  readonly idColumn: string | null;
  readonly labelColumn: string | null;
  /** Notes for the future lens-runner author. */
  readonly notes?: string;
}

export const INSTITUTIONAL_MEMORY_SOURCE_MAPPING: Readonly<
  Record<InstitutionalMemoryNodeType, InstitutionalMemorySourceMapping>
> = {
  person: {
    sourceTable: "users",
    idColumn: "id",
    labelColumn: "username",
    notes: "Existing global users table. Projection respects per-workspace visibility.",
  },
  team: {
    // Teams aren't yet first-class — `workspace_members` is the
    // closest proxy. The lens-runner derives a synthetic team per
    // workspace's membership group.
    sourceTable: "workspace_members",
    idColumn: null,
    labelColumn: null,
    notes:
      "Synthesized from workspace_members. Phase 25.1 introduces dedicated ags_teams table.",
  },
  project: {
    sourceTable: "workspaces",
    idColumn: "id",
    labelColumn: "name",
    notes:
      "Workspace == project in MVP. Phase 25.2 may split if multi-project per workspace becomes a feature.",
  },
  system: {
    sourceTable: null,
    idColumn: null,
    labelColumn: null,
    notes:
      "No first-class table yet — represented as tags on workspace docs. Phase 25.2 adds dedicated ags_systems table.",
  },
  service: {
    sourceTable: null,
    idColumn: null,
    labelColumn: null,
    notes:
      "No first-class table yet — depends on T-G.2 code-graph parser landing the Service node type.",
  },
  decision: {
    sourceTable: "ags_approval_steps",
    idColumn: "id",
    labelColumn: "request_kind",
    notes:
      "Approval steps ARE decisions. Outcome (approved/rejected) is on the row.",
  },
  policy: {
    sourceTable: "ags_governance_records",
    idColumn: "id",
    labelColumn: "policy_key",
    notes: "Governance records carry the policy decisions.",
  },
  workflow: {
    sourceTable: "workflows",
    idColumn: "id",
    labelColumn: "name",
    notes: "Existing workflows table; automation graph projects from here.",
  },
  document: {
    sourceTable: "ags_vault_notes",
    idColumn: "id",
    labelColumn: "title",
    notes: "Vault notes are institutional documents.",
  },
  outcome: {
    sourceTable: "ags_runtime_runs",
    idColumn: "id",
    labelColumn: "agent_key",
    notes: "Runtime runs produce outcomes; finalStatus + finalOutput on the row.",
  },
  responsibility: {
    sourceTable: null,
    idColumn: null,
    labelColumn: null,
    notes:
      "No first-class table yet — synthesized from (person, project) edges + role tags. Phase 25.3 may add ags_responsibilities.",
  },
  timeline_event: {
    sourceTable: "ags_runtime_runs",
    idColumn: "id",
    labelColumn: "agent_key",
    notes:
      "Runtime runs are timeline events keyed by createdAt. The lens-runner unions multiple tables (approval_steps, vault_versions, governance_records) into the timeline; the primary mapping here is the largest.",
  },
  governance_record: {
    sourceTable: "ags_governance_records",
    idColumn: "id",
    labelColumn: "policy_key",
    notes:
      "Distinct from `policy` node type — same table, different label/scope. The lens-runner emits TWO nodes per row (one as policy, one as governance_record) when both lenses are active.",
  },
};

// ============================================================================
// Coverage helpers
// ============================================================================

/**
 * Returns the subset of node types that currently have a real
 * SoT-table mapping. The remaining types are stubs awaiting their
 * own SoT table or a T-G.2/T-G.3 dependency.
 */
export function listMappedInstitutionalMemoryNodeTypes(): ReadonlyArray<InstitutionalMemoryNodeType> {
  return INSTITUTIONAL_MEMORY_NODE_TYPES.filter(
    (t) => INSTITUTIONAL_MEMORY_SOURCE_MAPPING[t].sourceTable !== null,
  );
}

/**
 * Returns the subset of node types still awaiting a SoT mapping.
 * Operator dashboard surfaces this count so it's clear how much of
 * the lens is "real" vs "placeholder."
 */
export function listUnmappedInstitutionalMemoryNodeTypes(): ReadonlyArray<InstitutionalMemoryNodeType> {
  return INSTITUTIONAL_MEMORY_NODE_TYPES.filter(
    (t) => INSTITUTIONAL_MEMORY_SOURCE_MAPPING[t].sourceTable === null,
  );
}
