/**
 * Semantic Enrichment evidence collector — T-D.3.3 + row-id-aware
 * follow-up (2026-05-18).
 *
 * Reads source-knowledge-units backing each candidate so the proposer
 * can cite them in its rationale. Source-of-truth: `ags_knowledge_units`
 * (the existing KB table), workspace-scoped.
 *
 * Match strategy by `targetKind` (the discriminator added in
 * T-D.3.δ-followup α):
 *   - `"node"` (default) — text-match the node id against
 *     `content_text` (KB projection embeds node ids as foreign
 *     references).
 *   - `"node_property"` — same as `"node"` (the id IS the node id;
 *     the stale property's name is hinted to the proposer separately).
 *   - `"entity"` — look up the entity's `canonical_label` from
 *     `ags_graph_entities`, then text-match THAT against `content_text`.
 *     Closes the β MVP caveat: entity row ids aren't text-matchable,
 *     but their labels are.
 *   - `"edge"` — look up the edge's `(source_node_id, target_node_id)`
 *     from `ags_graph_edges`, then text-match EITHER node id against
 *     `content_text`. Closes the γ MVP caveat: edge row ids aren't
 *     text-matchable, but the endpoint node ids that an edge connects
 *     ARE.
 *
 * In all paths:
 *   - Filter by `workspaceId` (hard scope).
 *   - Cap at `maxCitations` (default 5; absolute cap 25).
 *   - `contentText` slice up to 240 chars for the excerpt.
 *
 * `noteVersionId`:
 *   - We use the knowledge unit `id` because each KU's `contentHash`
 *     locks the snapshot — there is no separate version table in
 *     this codebase. The `noteId` field of the citation is identical
 *     to `noteVersionId` until a versioning split lands.
 *
 * Hard rules:
 *   - Read-only. Never mutates.
 *   - No openrouter / process.env imports — the read path uses
 *     existing KB tables.
 *   - The `noteVersionReader` option is the test seam: when supplied,
 *     it overrides the live ASDB read so unit tests don't need a DB.
 *   - Indirection lookups (entity label, edge endpoints) hit
 *     `ags_graph_entities` and `ags_graph_edges` directly — both are
 *     workspace-scoped at the row level so cross-tenant leak is
 *     impossible.
 */

import { and, eq, or, sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsKnowledgeUnits } from "../../../../drizzle/tables/agent-studio.js";
import {
  agsGraphEdges,
  agsGraphEntities,
  agsGraphNodes,
} from "../../../../drizzle/tables/agent-studio-graph.js";
import type { SemanticEnrichmentSourceCitation } from "./contracts.js";
import type { SemanticEnrichmentCandidateTargetKind } from "./semantic-enrichment-agent.js";

const DEFAULT_MAX_CITATIONS = 5;
const ABSOLUTE_MAX_CITATIONS = 25;
const EXCERPT_CHAR_BUDGET = 240;

export interface EvidenceCollectionInput {
  readonly workspaceId: number;
  readonly targetTypeKey: string;
  readonly targetId: number;
  /**
   * Discriminator that selects the row-id-aware match strategy.
   * Optional for back-compat: omitted → treated as `"node"` (the
   * original T-D.3.3 behavior). Callers in `semantic-enrichment-agent`
   * pass through `candidate.targetKind` so each candidate variant gets
   * the right match path.
   */
  readonly targetKind?: SemanticEnrichmentCandidateTargetKind;
  /**
   * Only consulted when `targetKind === "node_property"`. The stale
   * property's key — embedded later in the proposer prompt so the
   * LLM knows WHICH property to refresh. Doesn't change citation
   * selection (the property is on the node identified by `targetId`).
   */
  readonly propertyKey?: string;
  readonly maxCitations?: number;
}

export interface SemanticEnrichmentEvidenceCollector {
  collect(
    input: EvidenceCollectionInput,
  ): Promise<ReadonlyArray<SemanticEnrichmentSourceCitation>>;
}

/**
 * Read function injected as the test seam. Production wires this to
 * the live `agsKnowledgeUnits` read; tests inject an in-memory stub.
 */
export type NoteVersionReader = (
  input: EvidenceCollectionInput,
) => Promise<ReadonlyArray<SemanticEnrichmentSourceCitation>>;

export interface CreateSemanticEnrichmentEvidenceCollectorOptions {
  /**
   * Test seam — when supplied, the collector skips the live ASDB read
   * and delegates entirely to this reader. Production code calls the
   * factory without this option.
   */
  readonly noteVersionReader?: NoteVersionReader | unknown;
  /**
   * Drizzle ASDB instance override; defaults to `getAsDb()`. Same
   * pattern as semantic-enrichment-store.
   */
  readonly db?: unknown;
}

type AsDb = NonNullable<ReturnType<typeof getAsDb>>;

function isFunction(v: unknown): v is NoteVersionReader {
  return typeof v === "function";
}

function clampMaxCitations(requested: number | undefined): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return DEFAULT_MAX_CITATIONS;
  }
  if (requested <= 0) return DEFAULT_MAX_CITATIONS;
  if (requested > ABSOLUTE_MAX_CITATIONS) return ABSOLUTE_MAX_CITATIONS;
  return Math.floor(requested);
}

function buildExcerpt(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= EXCERPT_CHAR_BUDGET) return trimmed;
  return trimmed.slice(0, EXCERPT_CHAR_BUDGET).trimEnd() + "…";
}

async function liveAsdbReader(
  options: CreateSemanticEnrichmentEvidenceCollectorOptions,
  input: EvidenceCollectionInput,
): Promise<ReadonlyArray<SemanticEnrichmentSourceCitation>> {
  const db = ((options.db as AsDb | null) ?? (getAsDb() as AsDb | null));
  if (!db) {
    // Honest no-evidence path: the proposer can still emit a
    // proposal but it will fall below the source-citation threshold
    // and the agent runtime drops it.
    return [];
  }
  const limit = clampMaxCitations(input.maxCitations);
  const needles = await resolveNeedles(db, input);
  if (needles.length === 0) {
    // Indirection lookup found nothing (e.g., entity row not in
    // workspace, edge row missing) — no honest match path.
    return [];
  }
  const rows = await db
    .select({
      id: agsKnowledgeUnits.id,
      contentText: agsKnowledgeUnits.contentText,
    })
    .from(agsKnowledgeUnits)
    .where(
      and(
        eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
        or(
          ...needles.map(
            (n) => sql`${agsKnowledgeUnits.contentText} ILIKE ${`%${n}%`}`,
          ),
        ),
      ),
    )
    .limit(limit);
  return rows.map((row) => ({
    noteId: row.id,
    noteVersionId: row.id,
    excerpt: buildExcerpt(row.contentText),
  }));
}

/**
 * Resolve the ILIKE needles for a given candidate. The set of needles
 * is keyed off `targetKind`:
 *
 *   - `"node"` / `"node_property"` / undefined → `[String(targetId)]`
 *   - `"entity"` → `[canonical_label]` (one lookup against `ags_graph_entities`)
 *   - `"edge"` → `[String(sourceNodeId), String(targetNodeId)]` (one lookup against `ags_graph_edges`)
 *
 * Empty array signals "indirection found no row" — the caller returns
 * `[]` citations rather than running an unscoped query.
 */
async function resolveNeedles(
  db: AsDb,
  input: EvidenceCollectionInput,
): Promise<string[]> {
  const kind = input.targetKind ?? "node";
  if (kind === "entity") {
    const rows = await db
      .select({ canonicalLabel: agsGraphEntities.canonicalLabel })
      .from(agsGraphEntities)
      .where(
        and(
          eq(agsGraphEntities.id, input.targetId),
          eq(agsGraphEntities.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row || !row.canonicalLabel) return [];
    return [row.canonicalLabel];
  }
  if (kind === "edge") {
    // Edges don't carry `workspaceId` directly — scope via inner-join
    // on either endpoint node. Either endpoint matching the
    // candidate's workspace is sufficient (edges across workspaces
    // shouldn't exist in this schema, but we defend at the read).
    const rows = await db
      .select({
        sourceNodeId: agsGraphEdges.sourceNodeId,
        targetNodeId: agsGraphEdges.targetNodeId,
      })
      .from(agsGraphEdges)
      .innerJoin(
        agsGraphNodes,
        and(
          eq(agsGraphNodes.id, agsGraphEdges.sourceNodeId),
          eq(agsGraphNodes.workspaceId, input.workspaceId),
        ),
      )
      .where(eq(agsGraphEdges.id, input.targetId))
      .limit(1);
    const row = rows[0];
    if (!row) return [];
    return [String(row.sourceNodeId), String(row.targetNodeId)];
  }
  // "node" or "node_property" → text-match the node id directly.
  return [String(input.targetId)];
}

export function createSemanticEnrichmentEvidenceCollector(
  options: CreateSemanticEnrichmentEvidenceCollectorOptions = {},
): SemanticEnrichmentEvidenceCollector {
  return {
    async collect(input) {
      if (isFunction(options.noteVersionReader)) {
        const out = await options.noteVersionReader(input);
        const limit = clampMaxCitations(input.maxCitations);
        return out.slice(0, limit);
      }
      return liveAsdbReader(options, input);
    },
  };
}
