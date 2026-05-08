/**
 * RAC Trace Store — Phase 7.
 *
 * Persists the `RuntimeTraceMetrics` object the P6 orchestrator
 * already emits, plus per-source rendered chunks (`ags_rac_context_blocks`)
 * and a per-message thumbs verdict (`ags_rac_feedback`).
 *
 * Pure I/O. No mapping back to RAC primitives. The chat-stream caller
 * marshalls `RuntimeTraceMetrics` + `RuntimeSourceTrace` into the
 * input shape here.
 *
 * Boundaries (will be enforced by a P5+ symmetric lint to
 * `check-cag-boundary.ts`):
 *   - May import: drizzle tables, getAsDb, this package's types
 *   - May NOT import: mcp/dispatcher, credential-resolver, secrets,
 *     documents/ / vectordb/ / embeddings/
 */

import { createHash } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { getAsDb } from "../../../db/connection";
import {
  agsRacRuntimeTraces,
  agsRacContextBlocks,
  agsRacFeedback,
  type AgsRacContextBlock,
  type AgsRacRuntimeTrace,
  type AgsRacFeedback,
} from "../../../../../drizzle/tables/agent-studio";
import type { RacRetrievalChunk } from "../ingestion";

// ── Input shapes (chat-stream marshalls into these) ─────────────────

export interface WriteTraceInput {
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  sessionId?: number | null;
  messageId?: number | null;
  actorId: number;
  /** ComposerMode at the time of the call. */
  mode: string;
  cagPackId: number | null;
  cagPackVersion: number | null;
  retrievalEnabled: boolean;
  retrievalLatencyMs: number | null;
  chunksReturned: number;
  chunksFiltered: number;
  chunksIncluded: number;
  truncatedByBudget: number;
  tokenBudgetUsed?: number | null;
  tokenBudgetTruncated?: number;
  citationCoverage?: number | null;
  groundednessScore?: number | null;
  fallbackReason: string | null;
  warnings?: string[];
  perSourceLatencyMs?: Record<number, number>;
  /** U5-b.3: per-trace counter of PII-blocked chunks. Defaults to 0. */
  piiBlockedCount?: number;
  /** U5-b.3: per-trace counter of license-blocked chunks. Defaults to 0. */
  licenseBlockedCount?: number;
}

export interface WriteContextBlockInput {
  traceId: number;
  workspaceId: number;
  sourceId: number;
  sourceType: string;
  sourceChunkId: string;
  citation: string | null;
  contentHash: string;
  score: number;
  rank: number;
  sourceLatencyMs: number | null;
  metadata?: Record<string, unknown> | null;
}

export type FeedbackVerdict = "thumbs_up" | "thumbs_down";

export interface RecordFeedbackInput {
  workspaceId: number;
  agentId: number;
  messageId: number;
  traceId?: number | null;
  verdict: FeedbackVerdict;
  note?: string | null;
  createdBy: number;
}

// ── Pure helpers ──────────────────────────────────────────────────

/**
 * Build per-block insert rows from the orchestrator's `sourceTrace`
 * shape. Pure function — no I/O. Caller passes the freshly-written
 * `traceId` plus the workspaceId for the trace.
 */
export function buildContextBlockRows(input: {
  traceId: number;
  workspaceId: number;
  includedChunks: RacRetrievalChunk[];
  chunkSourceMap: Record<string, { sourceId: number; sourceType: string }>;
  perSourceLatencyMs: Record<number, number>;
}): WriteContextBlockInput[] {
  return input.includedChunks.map((chunk, idx) => {
    const meta = input.chunkSourceMap[chunk.sourceChunkId] ?? {
      sourceId: 0,
      sourceType: "unknown",
    };
    return {
      traceId: input.traceId,
      workspaceId: input.workspaceId,
      sourceId: meta.sourceId,
      sourceType: meta.sourceType,
      sourceChunkId: chunk.sourceChunkId,
      citation: chunk.citation || null,
      contentHash: createHash("sha256").update(chunk.content).digest("hex"),
      score: chunk.score,
      rank: idx + 1,
      sourceLatencyMs: input.perSourceLatencyMs[meta.sourceId] ?? null,
      metadata: chunk.metadata ?? null,
    };
  });
}

// ── Mappers ────────────────────────────────────────────────────────

function rowToTrace(row: typeof agsRacRuntimeTraces.$inferSelect): AgsRacRuntimeTrace {
  return row;
}

function rowToBlock(row: typeof agsRacContextBlocks.$inferSelect): AgsRacContextBlock {
  return row;
}

// ── writeTrace ─────────────────────────────────────────────────────

export async function writeTrace(input: WriteTraceInput): Promise<number> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  const perSourceJson: Record<string, number> = {};
  if (input.perSourceLatencyMs) {
    for (const [k, v] of Object.entries(input.perSourceLatencyMs)) {
      perSourceJson[String(k)] = v;
    }
  }
  const [row] = await db
    .insert(agsRacRuntimeTraces)
    .values({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      agentDraftId: input.agentDraftId,
      sessionId: input.sessionId ?? null,
      messageId: input.messageId ?? null,
      actorId: input.actorId,
      mode: input.mode,
      cagPackId: input.cagPackId,
      cagPackVersion: input.cagPackVersion,
      retrievalEnabled: input.retrievalEnabled,
      retrievalLatencyMs: input.retrievalLatencyMs,
      chunksReturned: input.chunksReturned,
      chunksFiltered: input.chunksFiltered,
      chunksIncluded: input.chunksIncluded,
      truncatedByBudget: input.truncatedByBudget,
      tokenBudgetUsed: input.tokenBudgetUsed ?? null,
      tokenBudgetTruncated: input.tokenBudgetTruncated ?? 0,
      citationCoverage: input.citationCoverage ?? null,
      groundednessScore: input.groundednessScore ?? null,
      fallbackReason: input.fallbackReason,
      warningsJson: input.warnings && input.warnings.length > 0 ? input.warnings : null,
      perSourceLatencyJson:
        Object.keys(perSourceJson).length > 0 ? perSourceJson : null,
      piiBlockedCount: input.piiBlockedCount ?? 0,
      licenseBlockedCount: input.licenseBlockedCount ?? 0,
    })
    .returning({ id: agsRacRuntimeTraces.id });
  return row.id;
}

// ── writeContextBlocks ────────────────────────────────────────────

export async function writeContextBlocks(
  rows: WriteContextBlockInput[],
): Promise<void> {
  if (rows.length === 0) return;
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  await db.insert(agsRacContextBlocks).values(
    rows.map((r) => ({
      traceId: r.traceId,
      workspaceId: r.workspaceId,
      sourceId: r.sourceId,
      sourceType: r.sourceType,
      sourceChunkId: r.sourceChunkId,
      citation: r.citation,
      contentHash: r.contentHash,
      score: r.score,
      rank: r.rank,
      sourceLatencyMs: r.sourceLatencyMs,
      metadataJson: r.metadata ?? null,
    })),
  );
}

// ── Score writeback (P8 evaluation) ──────────────────────────────

export interface UpdateTraceScoresInput {
  traceId: number;
  workspaceId: number;
  citationCoverage?: number | null;
  groundednessScore?: number | null;
}

/**
 * Writeback path for the P8 evaluation scorers — populates
 * `citation_coverage` and/or `groundedness_score` on an existing
 * trace row. Workspace-scoped: cross-workspace updates throw.
 */
export async function updateTraceScores(
  input: UpdateTraceScoresInput,
): Promise<AgsRacRuntimeTrace> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  const patch: Record<string, unknown> = {};
  if (input.citationCoverage !== undefined) {
    patch.citationCoverage = input.citationCoverage;
  }
  if (input.groundednessScore !== undefined) {
    patch.groundednessScore = input.groundednessScore;
  }
  if (Object.keys(patch).length === 0) {
    const existing = await getTraceById(input.workspaceId, input.traceId);
    if (!existing) throw new Error(`trace ${input.traceId} not found`);
    return existing;
  }
  const [row] = await db
    .update(agsRacRuntimeTraces)
    .set(patch)
    .where(
      and(
        eq(agsRacRuntimeTraces.id, input.traceId),
        eq(agsRacRuntimeTraces.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  if (!row) throw new Error(`trace ${input.traceId} not found in workspace ${input.workspaceId}`);
  return rowToTrace(row);
}

// ── Reads (router) ────────────────────────────────────────────────

export async function getTraceById(
  workspaceId: number,
  traceId: number,
): Promise<AgsRacRuntimeTrace | null> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  const rows = await db
    .select()
    .from(agsRacRuntimeTraces)
    .where(
      and(
        eq(agsRacRuntimeTraces.id, traceId),
        eq(agsRacRuntimeTraces.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return rows[0] ? rowToTrace(rows[0]) : null;
}

export async function getTraceForMessage(
  workspaceId: number,
  messageId: number,
): Promise<AgsRacRuntimeTrace | null> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  const rows = await db
    .select()
    .from(agsRacRuntimeTraces)
    .where(
      and(
        eq(agsRacRuntimeTraces.workspaceId, workspaceId),
        eq(agsRacRuntimeTraces.messageId, messageId),
      ),
    )
    .orderBy(desc(agsRacRuntimeTraces.createdAt))
    .limit(1);
  return rows[0] ? rowToTrace(rows[0]) : null;
}

export async function listContextBlocks(
  traceId: number,
): Promise<AgsRacContextBlock[]> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  const rows = await db
    .select()
    .from(agsRacContextBlocks)
    .where(eq(agsRacContextBlocks.traceId, traceId))
    .orderBy(agsRacContextBlocks.rank);
  return rows.map(rowToBlock);
}

// ── Feedback (idempotent on messageId via the unique index) ──────

export async function recordFeedback(
  input: RecordFeedbackInput,
): Promise<AgsRacFeedback> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");

  const existing = await db
    .select()
    .from(agsRacFeedback)
    .where(eq(agsRacFeedback.messageId, input.messageId))
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(agsRacFeedback)
      .set({
        verdict: input.verdict,
        note: input.note ?? null,
        traceId: input.traceId ?? existing[0].traceId,
      })
      .where(eq(agsRacFeedback.id, existing[0].id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(agsRacFeedback)
    .values({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      messageId: input.messageId,
      traceId: input.traceId ?? null,
      verdict: input.verdict,
      note: input.note ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function getFeedbackForMessage(
  workspaceId: number,
  messageId: number,
): Promise<AgsRacFeedback | null> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  const rows = await db
    .select()
    .from(agsRacFeedback)
    .where(
      and(
        eq(agsRacFeedback.workspaceId, workspaceId),
        eq(agsRacFeedback.messageId, messageId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
