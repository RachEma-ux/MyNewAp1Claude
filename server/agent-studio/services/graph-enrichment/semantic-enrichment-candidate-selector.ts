/**
 * Semantic Enrichment candidate selector — T-D.3.δ-prep + T-D.3.δ-followup α/β.
 *
 * Surfaces graph entities that the Semantic Enrichment Agent should
 * consider for proposal generation. Coverage today is **3/5 kinds**:
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
 *     `targetKind: "entity"` (target id is the entity row id, not a
 *     node id; `targetTypeKey` echoes the entity's `entity_type`).
 *     **MVP caveat:** the existing evidence collector heuristic
 *     `content_text ILIKE '%<targetId>%'` won't match entity row ids
 *     against KB text in any useful way — entity candidates will
 *     count as `candidatesSkippedNoCitations` in the agent run until
 *     a future entity-aware collector PR lands. The signal "N
 *     duplicates detected" is still actionable for operators even
 *     without per-candidate proposals.
 *
 * The two deferred kinds — `relationship_label_repair` (edge target)
 * and `stale_fact_refresh` (node-property tuple) — wait behind their
 * own selector PRs (T-D.3.δ-followup γ + δ).
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

import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
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
    input.proposalKind !== "entity_disambiguation"
  ) {
    // T-D.3.δ-followup α landed the discriminated-union contract;
    // β ships the `entity_disambiguation` selector below. The two
    // remaining deferred selectors wait behind their own PRs:
    //
    //   - relationship_label_repair → produces `targetKind: "edge"`;
    //     SQL: `ags_graph_edges` rows whose `type_key` hits the
    //     generic-label blacklist (RELATED_TO etc.) — T-D.3.δ-followup γ
    //   - stale_fact_refresh → produces `targetKind: "node_property"`;
    //     SQL: (node, property) tuples where source-version diverges
    //     from latest property update — T-D.3.δ-followup δ
    //
    // Each variant interface lives in `semantic-enrichment-agent.ts`. The
    // runner's `SUPPORTED_TRIGGER_PROPOSAL_KINDS` gate keeps the kinds out
    // of the agent loop until their selector + agent-side handler land.
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
