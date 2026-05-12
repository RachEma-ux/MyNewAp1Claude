/**
 * RAC Runtime Traces — retention sweep service.
 *
 * Phase 22 follow-up #638. The `ags_rac_runtime_traces` table writes
 * one row per RAC retrieval at chat-stream / chat.ts time. The
 * `ags_rac_context_blocks` child table writes one row per included
 * context chunk (typically 5-20 per trace). Both grow fast on a
 * production deployment.
 *
 * Pattern follows the established `*-retention.ts` shape (#621,
 * #625, #629, #633). Cascade-deletes `agsRacContextBlocks` rows
 * for the deleted traces (mirrors the pattern from #637's cascade
 * fix to runtime-runs).
 *
 * Filters on `createdAt`. Union filters for `workspaceId` /
 * `agentId`. Empty-array short-circuits BEFORE the ASDB probe.
 * Fail-soft on ASDB-null.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import {
  agsRacRuntimeTraces,
  agsRacContextBlocks,
} from "../../../drizzle/tables/agent-studio.js";

export interface PruneOldRacRuntimeTracesInput {
  readonly olderThan: Date;
  /** Single workspaceId (eq) or set (inArray). */
  readonly workspaceId?: number | readonly number[];
  /** Single agentId (eq) or set (inArray). */
  readonly agentId?: number | readonly number[];
}

export interface PruneOldRacRuntimeTracesResult {
  readonly deletedTracesCount: number;
  readonly deletedContextBlocksCount: number;
}

export interface PruneOldRacRuntimeTracesOptions {
  readonly getDb?: typeof getAsDb;
}

const ZERO_RESULT: PruneOldRacRuntimeTracesResult = {
  deletedTracesCount: 0,
  deletedContextBlocksCount: 0,
};

export async function pruneOldRacRuntimeTraces(
  input: PruneOldRacRuntimeTracesInput,
  options: PruneOldRacRuntimeTracesOptions = {},
): Promise<PruneOldRacRuntimeTracesResult> {
  if (Array.isArray(input.workspaceId) && input.workspaceId.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.agentId) && input.agentId.length === 0) {
    return ZERO_RESULT;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO_RESULT;

  const filters = [lt(agsRacRuntimeTraces.createdAt, input.olderThan)];

  const wsInput = input.workspaceId;
  if (wsInput !== undefined) {
    if (Array.isArray(wsInput)) {
      filters.push(inArray(agsRacRuntimeTraces.workspaceId, wsInput));
    } else {
      filters.push(eq(agsRacRuntimeTraces.workspaceId, wsInput as number));
    }
  }
  const agentInput = input.agentId;
  if (agentInput !== undefined) {
    if (Array.isArray(agentInput)) {
      filters.push(inArray(agsRacRuntimeTraces.agentId, agentInput));
    } else {
      filters.push(eq(agsRacRuntimeTraces.agentId, agentInput as number));
    }
  }

  // SELECT eligible trace IDs first so we cascade to context-blocks
  // by id rather than by repeating the same filter expression.
  const candidates = await db
    .select({ id: agsRacRuntimeTraces.id })
    .from(agsRacRuntimeTraces)
    .where(and(...filters));

  if (candidates.length === 0) return ZERO_RESULT;

  const traceIds = candidates.map((r) => Number(r.id));

  // Cascade-delete context blocks first (children), then traces (parent).
  const deletedBlocks = await db
    .delete(agsRacContextBlocks)
    .where(inArray(agsRacContextBlocks.traceId, traceIds))
    .returning({ id: agsRacContextBlocks.id });

  const deletedTraces = await db
    .delete(agsRacRuntimeTraces)
    .where(inArray(agsRacRuntimeTraces.id, traceIds))
    .returning({ id: agsRacRuntimeTraces.id });

  return {
    deletedTracesCount: deletedTraces.length,
    deletedContextBlocksCount: deletedBlocks.length,
  };
}
