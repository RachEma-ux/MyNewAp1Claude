/**
 * Tool Call Traces — retention sweep service.
 *
 * Phase 22 follow-up #625. The `ags_tool_call_traces` table writes
 * one row per ProposedToolCall dispatch through the MCP chokepoint
 * (validator verdict + approval status + governance verdict +
 * dispatch result + duration). On production this accumulates fast —
 * every chat turn that issues a tool call writes here.
 *
 * Mirrors the pattern from `runtime-runs-retention.ts` (#621) but
 * scoped to this single table (no cascade). Filters on `createdAt`
 * because the table doesn't have an updatedAt column.
 *
 * Defaults preserve `dispatchResult = "error"` and `"blocked"` rows
 * (the forensic-value rows) — operators investigating an incident
 * weeks later want the dispatch errors. The `"ok"` baseline is what
 * the cron typically targets.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import { agsToolCallTraces } from "../../../drizzle/tables/agent-studio.js";

export type ToolCallDispatchResult = "ok" | "error" | "blocked";

/**
 * Default dispatchResults pruned by a sweep. `"ok"` only — error +
 * blocked rows are preserved for forensic value. Operators can pass
 * `["ok", "error", "blocked"]` for aggressive cleanup.
 */
const DEFAULT_DISPATCH_RESULTS: readonly ToolCallDispatchResult[] = ["ok"];

export interface PruneOldToolCallTracesInput {
  readonly olderThan: Date;
  /**
   * Restrict to these dispatchResult values. Default `["ok"]` —
   * preserves error/blocked rows for forensics. Pass a wider set for
   * aggressive cleanup.
   */
  readonly dispatchResults?: readonly ToolCallDispatchResult[];
  /**
   * Restrict to a single workspace (`eq`) or a set (`inArray`).
   * Mirrors the union-filter shape from background_jobs.jobKind.
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly workspaceId?: number | readonly number[];
  /**
   * Restrict to runs of a specific agent (`eq`) or a set (`inArray`).
   * Same empty-array short-circuit semantics as workspaceId.
   */
  readonly agentId?: number | readonly number[];
}

export interface PruneOldToolCallTracesResult {
  readonly deletedCount: number;
}

export interface PruneOldToolCallTracesOptions {
  readonly getDb?: typeof getAsDb;
}

/**
 * Bulk-delete tool-call trace rows older than the cutoff. Fail-soft
 * on ASDB-null (returns `{deletedCount: 0}` rather than throwing).
 */
export async function pruneOldToolCallTraces(
  input: PruneOldToolCallTracesInput,
  options: PruneOldToolCallTracesOptions = {},
): Promise<PruneOldToolCallTracesResult> {
  // Empty-array short-circuits BEFORE the ASDB probe (canonical
  // pattern). Three independent guards because each filter can be
  // an empty array independently of the others.
  if (Array.isArray(input.workspaceId) && input.workspaceId.length === 0) {
    return { deletedCount: 0 };
  }
  if (Array.isArray(input.agentId) && input.agentId.length === 0) {
    return { deletedCount: 0 };
  }
  if (
    Array.isArray(input.dispatchResults) &&
    input.dispatchResults.length === 0
  ) {
    return { deletedCount: 0 };
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { deletedCount: 0 };

  const results = input.dispatchResults ?? DEFAULT_DISPATCH_RESULTS;
  const filters = [
    lt(agsToolCallTraces.createdAt, input.olderThan),
    inArray(
      agsToolCallTraces.dispatchResult,
      results as ToolCallDispatchResult[],
    ),
  ];

  const wsInput = input.workspaceId;
  if (wsInput !== undefined) {
    if (Array.isArray(wsInput)) {
      filters.push(inArray(agsToolCallTraces.workspaceId, wsInput));
    } else {
      filters.push(eq(agsToolCallTraces.workspaceId, wsInput as number));
    }
  }
  const agentInput = input.agentId;
  if (agentInput !== undefined) {
    if (Array.isArray(agentInput)) {
      filters.push(inArray(agsToolCallTraces.agentId, agentInput));
    } else {
      filters.push(eq(agsToolCallTraces.agentId, agentInput as number));
    }
  }

  const deleted = await db
    .delete(agsToolCallTraces)
    .where(and(...filters))
    .returning({ id: agsToolCallTraces.id });

  return { deletedCount: deleted.length };
}
