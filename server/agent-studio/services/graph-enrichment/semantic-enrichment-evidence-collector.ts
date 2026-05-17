/**
 * Semantic Enrichment evidence collector — T-D.3.3 wire-up.
 *
 * Reads source-knowledge-units backing each candidate target node so
 * the proposer can cite them in its rationale. Reads from the existing
 * `ags_knowledge_units` table — the canonical KB source-of-truth —
 * scoped to the run's `workspaceId`.
 *
 * Heuristic match (MVP):
 *   - Filter by `workspaceId` (hard scope).
 *   - Filter by `content_text ILIKE '%<targetId>%'` — units that
 *     mention the target's identifier are candidate citations.
 *   - Cap at `maxCitations` (default 5).
 *
 * Excerpt:
 *   - `contentText` slice up to 240 chars.
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
 */

import { and, eq, sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsKnowledgeUnits } from "../../../../drizzle/tables/agent-studio.js";
import type { SemanticEnrichmentSourceCitation } from "./contracts.js";

const DEFAULT_MAX_CITATIONS = 5;
const ABSOLUTE_MAX_CITATIONS = 25;
const EXCERPT_CHAR_BUDGET = 240;

export interface EvidenceCollectionInput {
  readonly workspaceId: number;
  readonly targetTypeKey: string;
  readonly targetId: number;
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
  const needle = `%${input.targetId}%`;
  const rows = await db
    .select({
      id: agsKnowledgeUnits.id,
      contentText: agsKnowledgeUnits.contentText,
    })
    .from(agsKnowledgeUnits)
    .where(
      and(
        eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
        sql`${agsKnowledgeUnits.contentText} ILIKE ${needle}`,
      ),
    )
    .limit(limit);
  return rows.map((row) => ({
    noteId: row.id,
    noteVersionId: row.id,
    excerpt: buildExcerpt(row.contentText),
  }));
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
