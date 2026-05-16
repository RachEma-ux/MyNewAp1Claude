/**
 * RAC lens — ASDB read-seam adapter (T-F.67).
 *
 * Implements `RacLensReadFn` against `agsRacRuntimeTraces` via
 * Drizzle. Column-level `workspaceId` filter matches the cag/rag
 * adapter pattern.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No banned imports.
 *   - Source-scan tested.
 */

import { and, desc, eq, lt } from "drizzle-orm";

import { agsRacRuntimeTraces } from "../../../../../drizzle/tables/agent-studio.js";
import { getAsDbForWorkspace } from "../../../db/connection.js";
import type {
  RacLensReadFn,
  RacLensReadParams,
  RacLensReadResult,
  RacLensTraceRow,
} from "./rac-lens-runner.js";

const EMPTY_RESULT: RacLensReadResult = { traces: [], truncated: false };

export interface CreateRacLensAsdbReaderOptions {
  readonly getDbForWorkspace?: typeof getAsDbForWorkspace;
}

export function createRacLensAsdbReader(
  options: CreateRacLensAsdbReaderOptions = {},
): RacLensReadFn {
  const getDbForWorkspace = options.getDbForWorkspace ?? getAsDbForWorkspace;
  return async (params: RacLensReadParams): Promise<RacLensReadResult> => {
    const db = getDbForWorkspace(params.workspaceId);
    if (!db) return EMPTY_RESULT;

    const fetchSize = params.limit + 1;
    const filters = [eq(agsRacRuntimeTraces.workspaceId, params.workspaceId)];
    if (params.before) {
      filters.push(lt(agsRacRuntimeTraces.createdAt, params.before));
    }
    const whereClause = filters.length === 1 ? filters[0] : and(...filters);

    type SelectShape = {
      id: number;
      workspaceId: number;
      agentId: number;
      mode: string;
      plannerMode: string | null;
      retrievalEnabled: boolean;
      cagPackId: number | null;
      chunksReturned: number;
      chunksFiltered: number;
      chunksIncluded: number;
      tokenBudgetUsed: number | null;
      groundednessScore: number | null;
      fallbackReason: string | null;
      createdAt: Date;
    };

    const raw = (await db
      .select({
        id: agsRacRuntimeTraces.id,
        workspaceId: agsRacRuntimeTraces.workspaceId,
        agentId: agsRacRuntimeTraces.agentId,
        mode: agsRacRuntimeTraces.mode,
        plannerMode: agsRacRuntimeTraces.plannerMode,
        retrievalEnabled: agsRacRuntimeTraces.retrievalEnabled,
        cagPackId: agsRacRuntimeTraces.cagPackId,
        chunksReturned: agsRacRuntimeTraces.chunksReturned,
        chunksFiltered: agsRacRuntimeTraces.chunksFiltered,
        chunksIncluded: agsRacRuntimeTraces.chunksIncluded,
        tokenBudgetUsed: agsRacRuntimeTraces.tokenBudgetUsed,
        groundednessScore: agsRacRuntimeTraces.groundednessScore,
        fallbackReason: agsRacRuntimeTraces.fallbackReason,
        createdAt: agsRacRuntimeTraces.createdAt,
      })
      .from(agsRacRuntimeTraces)
      .where(whereClause)
      .orderBy(desc(agsRacRuntimeTraces.createdAt))
      .limit(fetchSize)) as SelectShape[];

    const truncated = raw.length > params.limit;
    const cappedRows = truncated ? raw.slice(0, params.limit) : raw;

    const traces: RacLensTraceRow[] = cappedRows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      agentId: r.agentId,
      mode: r.mode,
      plannerMode: r.plannerMode,
      retrievalEnabled: r.retrievalEnabled,
      cagPackId: r.cagPackId,
      chunksReturned: r.chunksReturned,
      chunksFiltered: r.chunksFiltered,
      chunksIncluded: r.chunksIncluded,
      tokenBudgetUsed: r.tokenBudgetUsed,
      groundednessScore: r.groundednessScore,
      fallbackReason: r.fallbackReason,
      createdAt: r.createdAt,
    }));

    return { traces, truncated };
  };
}
