/**
 * RAC ingestion adapter — `knowledge_unit` source type (Retrofit P4).
 *
 * Reads `agsKnowledgeUnits` directly. MVP retrieval is full-text token
 * scoring against `contentText` — no embedding required, no pgvector
 * dependency. The adapter is the integration point that wires
 * NormalizedKnowledgeUnit (Phase 3) into the existing RAC retrieval
 * planner / executor / filter (P4 of the prior RAC arc).
 *
 * Filters applied at adapter level (D-UI-2 + D-NKU-5):
 *   - `archivedAt IS NULL`            (lifecycle)
 *   - `freshnessState != 'expired'`   (D-UI-2 freshness; expired skipped)
 *   - `validationStatus != 'blocked'` (D-UI-4; blocked units stay in
 *                                      the audit trail but never reach
 *                                      retrieval)
 *   - workspaceId match               (D-UI-2 permission scope; explicit
 *                                      ACL refinement is a follow-up)
 *
 * Returns RacRetrievalChunk with:
 *   - `content`  = unit.contentText
 *   - `score`    = jaccard(query_tokens, unit_tokens) — bounded [0, 1]
 *   - `citation` = derived from sourceLocation (uri+page+selector)
 *   - `metadata` = { unitId, unitType, sourceLocation, permissionContext,
 *                    freshnessState, provenanceId } so downstream
 *                    consumers (Phase 8 ProposedToolCall validator)
 *                    can resolve evidence references.
 *
 * Score is jaccard on lowercased word tokens. This is intentionally
 * deterministic and non-stochastic — Phase 4 of the original RAC arc
 * already runs the embedding / hybrid path for vector_index sources;
 * knowledge_unit retrieval here is the "always-available" fallback per
 * the retrofit prompt (full_text + hybrid eventually; multimodal stub).
 */

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getAsDb, getAsDbForWorkspace } from "../../../db/connection";
import { agsKnowledgeUnits } from "../../../../../drizzle/tables/agent-studio";
import type {
  RacIngestionAdapter,
  RacRetrievalChunk,
  RacRetrievalHealth,
  RacRetrievalRequest,
  RacRetrievalResult,
  RacIndexValidationResult,
} from "./types";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function buildCitation(unit: typeof agsKnowledgeUnits.$inferSelect): string {
  const loc = unit.sourceLocation as
    | {
        uri?: string | null;
        pageNumber?: number | null;
        lineRange?: { start: number; end: number } | null;
        selector?: string | null;
      }
    | null
    | undefined;
  const uri = loc?.uri ?? `unit:${unit.id}`;
  const tail =
    loc?.pageNumber != null
      ? `§p.${loc.pageNumber}`
      : loc?.lineRange != null
        ? `§L${loc.lineRange.start}-${loc.lineRange.end}`
        : loc?.selector
          ? `§${loc.selector}`
          : "";
  return `[ku:${uri}${tail}]`;
}

export const knowledgeUnitAdapter: RacIngestionAdapter = {
  async search(input: RacRetrievalRequest): Promise<RacRetrievalResult> {
    const start = Date.now();
    const warnings: string[] = [];
    const db = getAsDbForWorkspace(input.workspaceId);
    if (!db) {
      return { chunks: [], latencyMs: 0, warnings: ["asdb_unavailable"] };
    }

    const queryTokens = tokenize(input.query);
    if (queryTokens.size === 0) {
      return {
        chunks: [],
        latencyMs: Date.now() - start,
        warnings: ["empty_query_after_tokenization"],
      };
    }

    // Pull a workspace+source-scoped slab of units, apply filters,
    // score in-process. For MVP this is fine: workspaces with very large
    // unit counts will benefit from a real vector index (D-NKU-1
    // sibling chunk table), which is a separate phase.
    const rows = await db
      .select()
      .from(agsKnowledgeUnits)
      .where(
        and(
          eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
          eq(agsKnowledgeUnits.sourceId, input.sourceId),
          isNull(agsKnowledgeUnits.archivedAt),
          ne(agsKnowledgeUnits.freshnessState, "expired"),
          ne(agsKnowledgeUnits.validationStatus, "blocked"),
        ),
      )
      .limit(2000);

    const scored = rows
      .map((unit) => {
        const tokens = tokenize(unit.contentText);
        const score = jaccard(queryTokens, tokens);
        return { unit, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.topK);

    if (rows.length === 2000) {
      warnings.push("partial_result");
    }

    const chunks: RacRetrievalChunk[] = scored.map(({ unit, score }) => {
      // U5-b.3 chunk metadata projection (ADR DD6): the retrieval
      // filter consumes `unitPiiBlockSeverityCount` (number) and
      // `unitLicense` (string | null) to decide PII / license
      // rejections without joining back to the unit table. Adapters
      // that don't surface these signals (graphrag stub) leave them
      // undefined; the filter passes those chunks through.
      const piiBlockCount = Array.isArray(unit.piiFindings)
        ? unit.piiFindings.length
        : 0;
      return {
        content: unit.contentText,
        score,
        citation: buildCitation(unit),
        sourceChunkId: `ku-${unit.id}`,
        metadata: {
          unitId: unit.id,
          unitType: unit.unitType,
          sourceLocation: unit.sourceLocation ?? null,
          permissionContext: unit.permissionContext,
          freshnessState: unit.freshnessState,
          provenanceId: unit.provenanceId,
          unitPiiBlockSeverityCount: piiBlockCount,
          unitLicense: unit.license ?? null,
        },
      };
    });

    return {
      chunks,
      latencyMs: Date.now() - start,
      warnings,
    };
  },

  async health(): Promise<RacRetrievalHealth> {
    const db = getAsDb();
    if (!db) {
      return { status: "unavailable", reason: "asdb_unavailable" };
    }
    return { status: "ok", metrics: {} };
  },

  async validateIndex(): Promise<RacIndexValidationResult> {
    // No external index to validate — knowledge_unit reads the canonical
    // table directly. As long as the table exists, we're consistent.
    return { ok: true };
  },
};
