/**
 * Vault Saved Views — view-kind blueprints.
 *
 * Phase 16 §5-§7. Closes the remaining Phase 16 acceptance
 * criteria for the discriminator-shaped view kinds:
 *   - Entity views work.
 *   - Runtime asset views work.
 *   - Projection status views work.
 *
 * Each blueprint registers canonical defaults (columns, filters,
 * sort) for a `viewKind`. The UI uses these as starting points
 * when an operator clicks "new saved view"; the saved-view CRUD
 * service (Phase 16 §1) persists the operator's edits.
 *
 * Blueprints are pure data — they don't write to ASDB. Operators
 * who want vault-scoped overrides ship saved-view rows; this
 * module provides only the "what should a fresh view look like"
 * shape.
 *
 * ADR: docs/architecture/agent-studio-markdown-profile.md
 *
 * T-B.6 (saved-views Lens registry preview) — added `defaultLensKind`
 * so the Phase 24 lens-registry preview pane knows which lens kind
 * is the canonical projection for each view-kind. `null` means
 * "no canonical lens preview" (the view is vault-content-only or
 * spans multiple lens kinds — fall back to the generic table
 * renderer).
 */

import type { GraphLensKind } from "../graph-lens/contracts.js";

export interface ViewKindBlueprint {
  readonly viewKind: string;
  readonly displayName: string;
  readonly description: string;
  readonly defaultColumns: readonly string[];
  readonly defaultFilters: Readonly<Record<string, unknown>>;
  readonly defaultSort: Readonly<Record<string, unknown>>;
  /**
   * Where the view data comes from. Used by the UI to pick the
   * right query and renderer.
   */
  readonly dataSource:
    | "vault_notes"
    | "graph_entities"
    | "runtime_runs"
    | "graph_quality_findings"
    | "graph_projection_jobs";
  /**
   * Canonical Phase 24 lens kind whose preview pane renders this
   * view's data. `null` when the view is vault-content-only (no
   * graph projection) or genuinely cross-cutting. The preview UI
   * uses this to pre-select the lens; operators can override.
   */
  readonly defaultLensKind: GraphLensKind | null;
}

export const VIEW_KIND_BLUEPRINTS: readonly ViewKindBlueprint[] = [
  {
    viewKind: "note_list",
    displayName: "Note List",
    description:
      "Vault notes filtered + sorted as a table. Operators use this for their personal note triage.",
    defaultColumns: ["title", "tags", "folderId", "updatedAt"],
    defaultFilters: {},
    defaultSort: { field: "updatedAt", order: "desc" },
    dataSource: "vault_notes",
    defaultLensKind: null,
  },
  {
    viewKind: "entity_list",
    displayName: "Entity List",
    description:
      "Graph entities (people, projects, concepts) projected from the KG. Operators triage entity quality from here.",
    defaultColumns: ["entityKey", "typeKey", "displayName", "updatedAt"],
    defaultFilters: {},
    defaultSort: { field: "updatedAt", order: "desc" },
    dataSource: "graph_entities",
    defaultLensKind: "institutional_memory",
  },
  {
    viewKind: "runtime_asset_list",
    displayName: "Runtime Assets",
    description:
      "Agent Studio runtime runs (Graph Agent + tool calls). Operators inspect the trace ledger from here.",
    defaultColumns: ["agentKey", "status", "durationMs", "startedAt"],
    defaultFilters: { statusFilter: "any" },
    defaultSort: { field: "startedAt", order: "desc" },
    dataSource: "runtime_runs",
    defaultLensKind: "runtime",
  },
  {
    viewKind: "graph_quality",
    displayName: "Graph Quality",
    description:
      "Outstanding Graph Quality findings (orphan nodes, duplicate candidates, missing properties). Operators triage corrections.",
    defaultColumns: [
      "findingKind",
      "severity",
      "targetEntityKey",
      "createdAt",
    ],
    defaultFilters: { severity: ["high", "critical"] },
    defaultSort: { field: "createdAt", order: "desc" },
    dataSource: "graph_quality_findings",
    defaultLensKind: "governance",
  },
  {
    viewKind: "projection_status",
    displayName: "Projection Status",
    description:
      "Neo4j projection sync jobs + drift events. Operators see the lag + last-success timestamps from here.",
    defaultColumns: ["targetTable", "lastSyncAt", "rowsProjected", "errors"],
    defaultFilters: {},
    defaultSort: { field: "lastSyncAt", order: "desc" },
    dataSource: "graph_projection_jobs",
    defaultLensKind: "governance",
  },
];

/**
 * Returns the blueprint for the named view kind, or `null` when
 * no canonical blueprint exists. Operators can still pass any
 * `viewKind` string into `createSavedView`; this helper just
 * gives the UI a starting shape for the 5 canonical kinds.
 */
export function getViewKindBlueprint(
  viewKind: string,
): ViewKindBlueprint | null {
  return (
    VIEW_KIND_BLUEPRINTS.find((b) => b.viewKind === viewKind) ?? null
  );
}

export function listViewKindBlueprints(): readonly ViewKindBlueprint[] {
  return VIEW_KIND_BLUEPRINTS;
}

/**
 * Returns the canonical Phase 24 lens kind whose preview pane
 * renders this view-kind's data, or `null` when the view is
 * vault-content-only / genuinely cross-cutting. Wraps the
 * blueprint lookup so the Phase 24 lens-registry-preview consumer
 * doesn't have to know about blueprints.
 */
export function getDefaultLensKindForViewKind(
  viewKind: string,
): GraphLensKind | null {
  const blueprint = getViewKindBlueprint(viewKind);
  return blueprint?.defaultLensKind ?? null;
}
