/**
 * MCP Transitions — retention sweep service.
 *
 * Phase 22 follow-up #629. The `ags_mcp_transitions` table appends
 * one row per FSM state transition for every MCP server (connecting
 * → connected → tools_listed, plus error transitions). High-volume
 * on prod when an MCP server flaps. No retention path before this PR.
 *
 * Simplest of the retention primitives so far — table has just
 * `serverId` + transition kind + `ts`. Filter on `ts` + optional
 * serverId union.
 *
 * Pattern: mirrors pruneOldRuntimeRuns (#621) / pruneOldToolCallTraces
 * (#625) — fail-soft on ASDB-null, empty-array short-circuit BEFORE
 * the ASDB probe, returns { deletedCount } via DELETE...RETURNING.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import { agsMcpTransitions } from "../../../drizzle/tables/agent-studio.js";

export interface PruneOldMcpTransitionsInput {
  /** Cutoff — rows with `ts < olderThan` are eligible. */
  readonly olderThan: Date;
  /**
   * Restrict to a single MCP server (`eq`) or a set (`inArray`).
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly serverId?: number | readonly number[];
}

export interface PruneOldMcpTransitionsResult {
  readonly deletedCount: number;
}

export interface PruneOldMcpTransitionsOptions {
  readonly getDb?: typeof getAsDb;
}

export async function pruneOldMcpTransitions(
  input: PruneOldMcpTransitionsInput,
  options: PruneOldMcpTransitionsOptions = {},
): Promise<PruneOldMcpTransitionsResult> {
  if (Array.isArray(input.serverId) && input.serverId.length === 0) {
    return { deletedCount: 0 };
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return { deletedCount: 0 };

  const filters = [lt(agsMcpTransitions.ts, input.olderThan)];
  const serverIdInput = input.serverId;
  if (serverIdInput !== undefined) {
    if (Array.isArray(serverIdInput)) {
      filters.push(inArray(agsMcpTransitions.serverId, serverIdInput));
    } else {
      filters.push(eq(agsMcpTransitions.serverId, serverIdInput as number));
    }
  }

  const deleted = await db
    .delete(agsMcpTransitions)
    .where(and(...filters))
    .returning({ id: agsMcpTransitions.id });

  return { deletedCount: deleted.length };
}
