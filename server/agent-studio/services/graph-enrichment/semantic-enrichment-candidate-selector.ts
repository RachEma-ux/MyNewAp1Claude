/**
 * Semantic Enrichment candidate selector — T-D.3.δ-prep.
 *
 * Surfaces nodes that the Semantic Enrichment Agent should consider
 * for proposal generation. Today it covers the
 * `description_enrichment` kind only — the SQL: nodes whose
 * `description` property is missing OR whose stringified
 * `property_value` is shorter than `weakDescriptionMaxLength`
 * (default 40 chars including JSON quoting).
 *
 * Other proposal kinds (`missing_property_fill`,
 * `stale_fact_refresh`, `entity_disambiguation`,
 * `relationship_label_repair`) return an empty list with a TODO
 * marker. Each requires its own selection signal (e.g.,
 * source-version diff for `stale_fact_refresh`) — those are added
 * in follow-up slices alongside their respective scanners.
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

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphNodes,
  agsGraphNodeProperties,
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

  if (input.proposalKind !== "description_enrichment") {
    // TODO(T-D.3.δ-followup): plumb selectors for the other 4
    // proposal kinds. Each needs its own scanner:
    //   - missing_property_fill → required-but-null property scanner
    //   - stale_fact_refresh → source-version newer than fact scanner
    //   - entity_disambiguation → duplicate canonical_label scanner
    //   - relationship_label_repair → generic-edge-label scanner
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
