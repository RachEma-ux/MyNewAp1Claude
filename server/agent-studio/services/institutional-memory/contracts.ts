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
// Per-node-type operator-facing metadata (T-G.26)
// ============================================================================

export interface InstitutionalMemoryNodeTypeMetadata {
  /** Display label for operator UI tabs / lens overlays. */
  readonly label: string;
  /** Short description of what this node type represents. */
  readonly description: string;
}

export const INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA: Readonly<
  Record<InstitutionalMemoryNodeType, InstitutionalMemoryNodeTypeMetadata>
> = {
  person: {
    label: "Person",
    description:
      "An individual contributor (user record). Projection respects per-workspace visibility.",
  },
  team: {
    label: "Team",
    description:
      "A group of people working together (currently synthesized from workspace_members).",
  },
  project: {
    label: "Project",
    description:
      "A named initiative or workstream — the unit of planning + tracking.",
  },
  system: {
    label: "System",
    description:
      "A logical system / infrastructure component owned by one or more teams.",
  },
  service: {
    label: "Service",
    description:
      "A deployed service unit composed of code and configuration.",
  },
  decision: {
    label: "Decision",
    description:
      "A recorded organizational decision (ADR or similar) with context and rationale.",
  },
  policy: {
    label: "Policy",
    description:
      "A governance rule that binds operations — approval gates, data handling, etc.",
  },
  workflow: {
    label: "Workflow",
    description:
      "An automation workflow (trigger + action chain) registered in the platform.",
  },
  document: {
    label: "Document",
    description:
      "A knowledge artifact (note / page / file) anchored to the institutional context.",
  },
  outcome: {
    label: "Outcome",
    description:
      "A recorded result — incident postmortem, project closure, success / failure metric.",
  },
  responsibility: {
    label: "Responsibility",
    description:
      "An ownership assignment — which person / team is responsible for which system / service.",
  },
  timeline_event: {
    label: "Timeline Event",
    description:
      "A time-anchored event (runtime run, decision, incident) on the institutional timeline.",
  },
  governance_record: {
    label: "Governance Record",
    description:
      "A formal governance act — approval, audit, exception grant, policy deviation.",
  },
};

export function getInstitutionalMemoryNodeTypeMetadata(
  type: InstitutionalMemoryNodeType,
): InstitutionalMemoryNodeTypeMetadata {
  return INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA[type];
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
    // 2026-05-20: Repointed from `ags_governance_records` (never
    // shipped — no migration in /drizzle/tables) to the real
    // `ags_approval_steps` table. Approval steps carry policy
    // ENFORCEMENT (which policy fired, what outcome) — the runner
    // dedupes by `approver_role` to surface one inst_policy node
    // per distinct policy. A dedicated `ags_policies` table would
    // be the right long-term home; until then the synthesized
    // projection gives operators a real graph view.
    sourceTable: "ags_approval_steps",
    idColumn: "id",
    labelColumn: "approver_role",
    notes:
      "Synthesized from ags_approval_steps — one inst_policy per distinct approver_role.",
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
    // 2026-05-20: Repointed (same reason as `policy` above). Each
    // approval step is itself a governance audit record — who
    // decided what, when, with what note. The lens-runner emits
    // one inst_governance_record per row (alongside the inst_decision
    // emit that already exists; same source, distinct typeKey + label
    // so operators can scope to audit-shape views).
    sourceTable: "ags_approval_steps",
    idColumn: "id",
    labelColumn: "decision_note",
    notes:
      "Distinct from `policy` node type — same source rows, different projection. policy dedupes by approver_role; governance_record keeps one node per row.",
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

// ============================================================================
// Coverage summary (T-G.14)
// ============================================================================

export interface InstitutionalMemoryCoverageSummary {
  readonly total: number;
  readonly mapped: number;
  readonly unmapped: number;
  /** Percentage in [0, 100], 1-decimal precision. */
  readonly coveragePercent: number;
}

/**
 * Returns a stable-shape summary of institutional-memory taxonomy
 * coverage: how many node types have a real SoT mapping vs. are
 * still placeholders. Operator dashboards bind to this for the "X of
 * Y types projecting" health gauge.
 *
 * Pure function. Reads from the canonical
 * `INSTITUTIONAL_MEMORY_SOURCE_MAPPING` only.
 */
export function summarizeInstitutionalMemoryCoverage(): InstitutionalMemoryCoverageSummary {
  const total = INSTITUTIONAL_MEMORY_NODE_TYPES.length;
  const mapped = listMappedInstitutionalMemoryNodeTypes().length;
  const unmapped = total - mapped;
  const coveragePercent =
    total === 0 ? 0 : Math.round((mapped / total) * 1000) / 10;
  return { total, mapped, unmapped, coveragePercent };
}
