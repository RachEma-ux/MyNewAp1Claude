/**
 * Semantic Enrichment candidate selector — T-D.3.δ-prep + T-D.3.δ-followup α/β/γ.
 *
 * Surfaces graph entities that the Semantic Enrichment Agent should
 * consider for proposal generation. Coverage today is **4/5 kinds**:
 *
 *   - `description_enrichment` — nodes whose `description` property
 *     is missing OR whose stringified `property_value` is shorter
 *     than `weakDescriptionMaxLength` (default 40 chars including
 *     JSON quoting). Emits `targetKind: "node"`.
 *   - `missing_property_fill` — nodes that have at least one
 *     `agsGraphOntologyPropertyDefinitions[required=true]` row
 *     with no corresponding `agsGraphNodeProperties` row. Returned
 *     once per node; the agent collector enumerates the specific
 *     missing properties at run-time. Emits `targetKind: "node"`.
 *   - `entity_disambiguation` — rows in `ags_graph_entities` whose
 *     `(workspace_id, entity_type, canonical_label)` triple resolves
 *     to MORE THAN ONE active row. Each duplicate gets one candidate
 *     so operators can disambiguate per row. Emits
 *     `targetKind: "entity"`. **MVP caveat:** the existing evidence
 *     collector heuristic `content_text ILIKE '%<targetId>%'` won't
 *     match entity row ids against KB text in any useful way; entity
 *     candidates count as `candidatesSkippedNoCitations` in the agent
 *     run until a future entity-aware collector ships. The signal "N
 *     duplicates detected" is still actionable.
 *   - `relationship_label_repair` — rows in `ags_graph_edges` whose
 *     `type_key` matches the generic-label blacklist
 *     (`GENERIC_EDGE_TYPE_KEYS` below — RELATED_TO, ASSOCIATED_WITH,
 *     LINKED_TO, CONNECTED_TO). Workspace-scoped via JOIN on the
 *     edge's `source_node_id` → `ags_graph_nodes.workspace_id`
 *     (edges don't carry workspaceId directly). Emits
 *     `targetKind: "edge"`. **Same MVP caveat as entity_disambiguation:**
 *     edge row ids aren't text-matchable against KB content, so
 *     candidates land as `candidatesSkippedNoCitations` today.
 *
 * The remaining deferred kind — `stale_fact_refresh` (node-property
 * tuple, source-version divergence) — waits behind T-D.3.δ-followup δ.
 *
 * Why a separate module rather than extending
 * `semantic-enrichment-store.ts`:
 *   - The store owns the enrichment-runs / proposals tables; this
 *     reader hits the graph source-of-truth tables (`ags_graph_*`).
 *     Keeping the responsibilities separate keeps each module's
 *     test surface small.
 *
 * Hard rules:
 *   - No `neo4j-driver` import. Reads ASDB (Postgres) directly.
 *   - No mutation. Read-only.
 *   - Workspace-scoped — required argument so admin operators can't
 *     accidentally surface cross-tenant candidates.
 */

import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphEdges,
  agsGraphEntities,
  agsGraphNodes,
  agsGraphNodeProperties,
  agsGraphOntologyPropertyDefinitions,
} from "../../../../drizzle/tables/agent-studio-graph.js";
import type { SemanticEnrichmentProposalKind } from "./contracts.js";
import type { SemanticEnrichmentCandidate } from "./semantic-enrichment-agent.js";

export const SEMANTIC_ENRICHMENT_CANDIDATES_DEFAULT_LIMIT = 50;
export const SEMANTIC_ENRICHMENT_CANDIDATES_ABSOLUTE_LIMIT = 500;

export const DEFAULT_WEAK_DESCRIPTION_MAX_LENGTH = 40;

/**
 * Edge `type_key` values treated as generic / under-specified. Edges
 * with one of these labels are surfaced for `relationship_label_repair`
 * so the agent can propose a more specific label backed by source
 * evidence. The list is intentionally short — false positives cost
 * operator triage time. Adding a new generic label here is a
 * deliberate widening; lockstep-tested.
 */
export const GENERIC_EDGE_TYPE_KEYS = [
  "RELATED_TO",
  "ASSOCIATED_WITH",
  "LINKED_TO",
  "CONNECTED_TO",
] as const;
export type GenericEdgeTypeKey = (typeof GENERIC_EDGE_TYPE_KEYS)[number];

export interface ListSemanticEnrichmentCandidatesInput {
  readonly workspaceId: number;
  readonly proposalKind: SemanticEnrichmentProposalKind;
  readonly limit?: number;
  /**
   * Override for the "weak description" length threshold (chars).
   * Only consulted for `proposalKind === "description_enrichment"`.
   */
  readonly weakDescriptionMaxLength?: number;
  /**
   * Optional `typeKey` filter — restrict candidates to a single node
   * type (e.g., only `service` or only `data_source`). Useful when an
   * operator wants to focus enrichment on one slice of the graph.
   */
  readonly typeKey?: string;
}

export interface SemanticEnrichmentCandidatesEnvelope {
  readonly proposalKind: SemanticEnrichmentProposalKind;
  readonly candidates: ReadonlyArray<SemanticEnrichmentCandidate>;
  /**
   * `true` when the SQL hit the page limit — there may be more
   * candidates available. Operators can rerun with a larger
   * `limit` or page on `targetId`.
   */
  readonly truncated: boolean;
  /**
   * The threshold actually used for description length. Echoed back
   * so operators can confirm what window the kind ran against.
   */
  readonly weakDescriptionMaxLengthUsed: number | null;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return SEMANTIC_ENRICHMENT_CANDIDATES_DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit < 1) {
    return SEMANTIC_ENRICHMENT_CANDIDATES_DEFAULT_LIMIT;
  }
  return Math.min(Math.trunc(limit), SEMANTIC_ENRICHMENT_CANDIDATES_ABSOLUTE_LIMIT);
}

function normalizeWeakDescriptionMaxLength(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n) || n < 1) {
    return DEFAULT_WEAK_DESCRIPTION_MAX_LENGTH;
  }
  return Math.min(Math.trunc(n), 10_000);
}

export async function listSemanticEnrichmentCandidates(
  input: ListSemanticEnrichmentCandidatesInput,
): Promise<SemanticEnrichmentCandidatesEnvelope> {
  const limit = normalizeLimit(input.limit);

  if (
    input.proposalKind !== "description_enrichment" &&
    input.proposalKind !== "missing_property_fill" &&
    input.proposalKind !== "entity_disambiguation" &&
    input.proposalKind !== "relationship_label_repair"
  ) {
    // α landed the discriminated-union contract; β shipped
    // `entity_disambiguation`; γ ships `relationship_label_repair`
    // below. The single remaining deferred selector waits behind:
    //
    //   - stale_fact_refresh → produces `targetKind: "node_property"`;
    //     SQL: (node, property) tuples where source-version diverges
    //     from latest property update — T-D.3.δ-followup δ
    //
    // The variant interface lives in `semantic-enrichment-agent.ts`. The
    // runner's `SUPPORTED_TRIGGER_PROPOSAL_KINDS` gate keeps the kind
    // out of the agent loop until its selector + agent-side handler land.
    return {
      proposalKind: input.proposalKind,
      candidates: [],
      truncated: false,
      weakDescriptionMaxLengthUsed: null,
    };
  }

  const db = getAsDb();
  if (db === null) {
    return {
      proposalKind: input.proposalKind,
      candidates: [],
      truncated: false,
      weakDescriptionMaxLengthUsed: null,
    };
  }

  if (input.proposalKind === "missing_property_fill") {
    return await listMissingPropertyFillCandidates(input, db, limit);
  }

  if (input.proposalKind === "entity_disambiguation") {
    return await listEntityDisambiguationCandidates(input, db, limit);
  }

  if (input.proposalKind === "relationship_label_repair") {
    return await listRelationshipLabelRepairCandidates(input, db, limit);
  }

  return await listDescriptionEnrichmentCandidates(input, db, limit);
}

async function listDescriptionEnrichmentCandidates(
  input: ListSemanticEnrichmentCandidatesInput,
  db: NonNullable<ReturnType<typeof getAsDb>>,
  limit: number,
): Promise<SemanticEnrichmentCandidatesEnvelope> {
  const threshold = normalizeWeakDescriptionMaxLength(
    input.weakDescriptionMaxLength,
  );

  // LEFT JOIN nodes → properties (keyed by "description") so that
  // rows with no description row at all surface as candidates too.
  const rows = await db
    .select({
      typeKey: agsGraphNodes.typeKey,
      nodeId: agsGraphNodes.id,
      propertyValue: agsGraphNodeProperties.propertyValue,
    })
    .from(agsGraphNodes)
    .leftJoin(
      agsGraphNodeProperties,
      and(
        eq(agsGraphNodeProperties.nodeId, agsGraphNodes.id),
        eq(agsGraphNodeProperties.propertyKey, "description"),
      ),
    )
    .where(
      and(
        eq(agsGraphNodes.workspaceId, input.workspaceId),
        eq(agsGraphNodes.governanceStatus, "active"),
        input.typeKey !== undefined
          ? eq(agsGraphNodes.typeKey, input.typeKey)
          : undefined,
        or(
          isNull(agsGraphNodeProperties.id),
          sql`LENGTH(${agsGraphNodeProperties.propertyValue}::text) < ${threshold}`,
        ),
      ),
    )
    .limit(limit + 1);

  const truncated = rows.length > limit;
  const trimmed = truncated ? rows.slice(0, limit) : rows;

  const candidates: SemanticEnrichmentCandidate[] = trimmed.map((r) => ({
    targetKind: "node" as const,
    targetTypeKey: r.typeKey,
    targetId: r.nodeId,
    proposalKind: "description_enrichment" as const,
  }));

  return {
    proposalKind: "description_enrichment",
    candidates,
    truncated,
    weakDescriptionMaxLengthUsed: threshold,
  };
}

/**
 * `missing_property_fill` candidate set: nodes that have at least
 * one ontology-required property without a corresponding
 * `agsGraphNodeProperties` row.
 *
 * SQL outline (one row per (node, missing required property), then
 * DISTINCT to one row per node):
 *
 *   SELECT DISTINCT n.id, n.type_key
 *   FROM ags_graph_nodes n
 *   JOIN ags_graph_ontology_property_definitions pd
 *     ON pd.type_key = n.type_key AND pd.type_kind = 'node'
 *    AND pd.required = true
 *   LEFT JOIN ags_graph_node_properties p
 *     ON p.node_id = n.id AND p.property_key = pd.property_key
 *   WHERE n.workspace_id = $1
 *     AND n.governance_status = 'active'
 *     AND p.id IS NULL
 *
 * Per-property surfacing (which property is missing) is deliberately
 * NOT carried on the candidate — the agent's collector enumerates
 * those at run-time. Keeps the candidate contract uniform across
 * kinds (one row per node, regardless of how many properties need
 * filling).
 */
async function listMissingPropertyFillCandidates(
  input: ListSemanticEnrichmentCandidatesInput,
  db: NonNullable<ReturnType<typeof getAsDb>>,
  limit: number,
): Promise<SemanticEnrichmentCandidatesEnvelope> {
  const rows = await db
    .selectDistinct({
      typeKey: agsGraphNodes.typeKey,
      nodeId: agsGraphNodes.id,
    })
    .from(agsGraphNodes)
    .innerJoin(
      agsGraphOntologyPropertyDefinitions,
      and(
        eq(agsGraphOntologyPropertyDefinitions.typeKey, agsGraphNodes.typeKey),
        eq(agsGraphOntologyPropertyDefinitions.typeKind, "node"),
        eq(agsGraphOntologyPropertyDefinitions.required, true),
      ),
    )
    .leftJoin(
      agsGraphNodeProperties,
      and(
        eq(agsGraphNodeProperties.nodeId, agsGraphNodes.id),
        eq(
          agsGraphNodeProperties.propertyKey,
          agsGraphOntologyPropertyDefinitions.propertyKey,
        ),
      ),
    )
    .where(
      and(
        eq(agsGraphNodes.workspaceId, input.workspaceId),
        eq(agsGraphNodes.governanceStatus, "active"),
        input.typeKey !== undefined
          ? eq(agsGraphNodes.typeKey, input.typeKey)
          : undefined,
        isNull(agsGraphNodeProperties.id),
      ),
    )
    .limit(limit + 1);

  const truncated = rows.length > limit;
  const trimmed = truncated ? rows.slice(0, limit) : rows;

  const candidates: SemanticEnrichmentCandidate[] = trimmed.map((r) => ({
    targetKind: "node" as const,
    targetTypeKey: r.typeKey,
    targetId: r.nodeId,
    proposalKind: "missing_property_fill" as const,
  }));

  return {
    proposalKind: "missing_property_fill",
    candidates,
    truncated,
    weakDescriptionMaxLengthUsed: null,
  };
}

/**
 * `entity_disambiguation` candidate set — T-D.3.δ-followup β.
 *
 * Selects entity rows that share `(workspace_id, entity_type,
 * canonical_label)` with at least one other ACTIVE row. Each
 * conflicting row is emitted as its own candidate so the agent
 * (eventually — after the entity-aware evidence collector lands)
 * can reason over per-row disambiguating evidence.
 *
 * SQL outline (semantic; see Drizzle below):
 *
 *   SELECT id, entity_type
 *   FROM ags_graph_entities
 *   WHERE workspace_id = $1
 *     AND governance_status = 'active'
 *     AND (entity_type, canonical_label) IN (
 *       SELECT entity_type, canonical_label
 *       FROM ags_graph_entities
 *       WHERE workspace_id = $1 AND governance_status = 'active'
 *       GROUP BY entity_type, canonical_label
 *       HAVING COUNT(*) > 1
 *     )
 *
 * The `typeKey` filter narrows by `entity_type` so operators can
 * focus disambiguation on one entity class (e.g., only `Person`
 * dupes).
 *
 * Workspace handling: `ags_graph_entities.workspace_id` is NULLABLE
 * (per `drizzle/tables/agent-studio-graph.ts:223`). Workspace-scoped
 * runs MUST exclude null-workspace rows to honor the runner's
 * tenant-isolation invariant.
 */
async function listEntityDisambiguationCandidates(
  input: ListSemanticEnrichmentCandidatesInput,
  db: NonNullable<ReturnType<typeof getAsDb>>,
  limit: number,
): Promise<SemanticEnrichmentCandidatesEnvelope> {
  // Inner aggregate: which (entity_type, canonical_label) pairs have
  // more than one active row in this workspace?
  const conflictPairs = db
    .select({
      entityType: agsGraphEntities.entityType,
      canonicalLabel: agsGraphEntities.canonicalLabel,
    })
    .from(agsGraphEntities)
    .where(
      and(
        eq(agsGraphEntities.workspaceId, input.workspaceId),
        eq(agsGraphEntities.governanceStatus, "active"),
        input.typeKey !== undefined
          ? eq(agsGraphEntities.entityType, input.typeKey)
          : undefined,
      ),
    )
    .groupBy(agsGraphEntities.entityType, agsGraphEntities.canonicalLabel)
    .having(gt(sql<number>`count(*)`, sql`1`))
    .as("conflict_pairs");

  // Outer: every active row whose (entity_type, canonical_label) is in
  // the conflict set. Stable order on id keeps cursored re-runs
  // deterministic across paging.
  const rows = await db
    .select({
      id: agsGraphEntities.id,
      entityType: agsGraphEntities.entityType,
    })
    .from(agsGraphEntities)
    .innerJoin(
      conflictPairs,
      and(
        eq(agsGraphEntities.entityType, conflictPairs.entityType),
        eq(agsGraphEntities.canonicalLabel, conflictPairs.canonicalLabel),
      ),
    )
    .where(
      and(
        eq(agsGraphEntities.workspaceId, input.workspaceId),
        eq(agsGraphEntities.governanceStatus, "active"),
        input.typeKey !== undefined
          ? eq(agsGraphEntities.entityType, input.typeKey)
          : undefined,
      ),
    )
    .orderBy(agsGraphEntities.id)
    .limit(limit + 1);

  const truncated = rows.length > limit;
  const trimmed = truncated ? rows.slice(0, limit) : rows;

  const candidates: SemanticEnrichmentCandidate[] = trimmed.map((r) => ({
    targetKind: "entity" as const,
    targetTypeKey: r.entityType,
    targetId: r.id,
    proposalKind: "entity_disambiguation" as const,
  }));

  return {
    proposalKind: "entity_disambiguation",
    candidates,
    truncated,
    weakDescriptionMaxLengthUsed: null,
  };
}

/**
 * `relationship_label_repair` candidate set — T-D.3.δ-followup γ.
 *
 * Selects active edges whose `type_key` is on the generic-label
 * blacklist (`GENERIC_EDGE_TYPE_KEYS`). Workspace scoping is enforced
 * via an inner-join on the edge's `source_node_id` →
 * `ags_graph_nodes.workspace_id` (edges don't carry workspaceId
 * directly — see `drizzle/tables/agent-studio-graph.ts:153`).
 *
 * SQL outline:
 *
 *   SELECT e.id, e.type_key
 *   FROM ags_graph_edges e
 *   INNER JOIN ags_graph_nodes n
 *     ON n.id = e.source_node_id
 *    AND n.workspace_id = $1
 *   WHERE e.governance_status = 'active'
 *     AND e.type_key IN (...GENERIC_EDGE_TYPE_KEYS)
 *     [AND e.type_key = $typeKey]
 *   ORDER BY e.id
 *   LIMIT $N + 1
 *
 * The optional `typeKey` filter further narrows to a single generic
 * label (operator opts in to "only repair RELATED_TO this run").
 *
 * Stable ordering on `e.id` keeps paged re-runs deterministic.
 */
async function listRelationshipLabelRepairCandidates(
  input: ListSemanticEnrichmentCandidatesInput,
  db: NonNullable<ReturnType<typeof getAsDb>>,
  limit: number,
): Promise<SemanticEnrichmentCandidatesEnvelope> {
  // If operator passed a `typeKey` not in the blacklist, the SQL would
  // return zero rows. Short-circuit so the envelope's reason is
  // clearer than "empty join result".
  if (
    input.typeKey !== undefined &&
    !(GENERIC_EDGE_TYPE_KEYS as ReadonlyArray<string>).includes(input.typeKey)
  ) {
    return {
      proposalKind: "relationship_label_repair",
      candidates: [],
      truncated: false,
      weakDescriptionMaxLengthUsed: null,
    };
  }

  const rows = await db
    .select({
      id: agsGraphEdges.id,
      typeKey: agsGraphEdges.typeKey,
    })
    .from(agsGraphEdges)
    .innerJoin(
      agsGraphNodes,
      and(
        eq(agsGraphNodes.id, agsGraphEdges.sourceNodeId),
        eq(agsGraphNodes.workspaceId, input.workspaceId),
      ),
    )
    .where(
      and(
        eq(agsGraphEdges.governanceStatus, "active"),
        input.typeKey !== undefined
          ? eq(agsGraphEdges.typeKey, input.typeKey)
          : inArray(
              agsGraphEdges.typeKey,
              GENERIC_EDGE_TYPE_KEYS as unknown as string[],
            ),
      ),
    )
    .orderBy(agsGraphEdges.id)
    .limit(limit + 1);

  const truncated = rows.length > limit;
  const trimmed = truncated ? rows.slice(0, limit) : rows;

  const candidates: SemanticEnrichmentCandidate[] = trimmed.map((r) => ({
    targetKind: "edge" as const,
    targetTypeKey: r.typeKey,
    targetId: r.id,
    proposalKind: "relationship_label_repair" as const,
  }));

  return {
    proposalKind: "relationship_label_repair",
    candidates,
    truncated,
    weakDescriptionMaxLengthUsed: null,
  };
}
