/**
 * CAG lens — ASDB read-seam adapter (T-F.65).
 *
 * Implements `CagLensReadFn` against `agsCagCapabilityPacks` via
 * Drizzle through `getAsDbForWorkspace`. The pure builder lives in
 * `cag-lens-runner.ts`; this file is the DB-touching half.
 *
 * `agsCagCapabilityPacks` carries a real `workspaceId` column —
 * unlike `agsRuntimeRuns` / `agsPublishRequests` — so the adapter
 * can apply BOTH region routing (database-level) AND a column-level
 * `workspaceId === viewer.workspaceId` filter as a defense-in-depth
 * fence. Future shared-cluster setups won't accidentally leak
 * across workspaces even if region routing is misconfigured.
 *
 * Truncation detection: `limit + 1`; if exceeded, drop the extra
 * row and forward `truncated=true`.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - Source-scan tested.
 */

import { and, desc, eq, lt } from "drizzle-orm";

import { agsCagCapabilityPacks } from "../../../../../drizzle/tables/agent-studio.js";
import { getAsDbForWorkspace } from "../../../db/connection.js";
import type {
  CagLensPackRow,
  CagLensReadFn,
  CagLensReadParams,
  CagLensReadResult,
} from "./cag-lens-runner.js";

const EMPTY_RESULT: CagLensReadResult = { packs: [], truncated: false };

export interface CreateCagLensAsdbReaderOptions {
  readonly getDbForWorkspace?: typeof getAsDbForWorkspace;
}

export function createCagLensAsdbReader(
  options: CreateCagLensAsdbReaderOptions = {},
): CagLensReadFn {
  const getDbForWorkspace = options.getDbForWorkspace ?? getAsDbForWorkspace;
  return async (params: CagLensReadParams): Promise<CagLensReadResult> => {
    const db = getDbForWorkspace(params.workspaceId);
    if (!db) return EMPTY_RESULT;

    const fetchSize = params.limit + 1;
    const filters = [eq(agsCagCapabilityPacks.workspaceId, params.workspaceId)];
    if (params.before) {
      filters.push(lt(agsCagCapabilityPacks.createdAt, params.before));
    }
    const whereClause = filters.length === 1 ? filters[0] : and(...filters);

    type SelectShape = {
      id: number;
      workspaceId: number;
      agentId: number;
      packType: string;
      packVersion: number;
      status: string;
      tokenEstimate: number | null;
      compileResult: string | null;
      governanceVerdict: string | null;
      useCount: number;
      createdAt: Date;
    };

    const raw = (await db
      .select({
        id: agsCagCapabilityPacks.id,
        workspaceId: agsCagCapabilityPacks.workspaceId,
        agentId: agsCagCapabilityPacks.agentId,
        packType: agsCagCapabilityPacks.packType,
        packVersion: agsCagCapabilityPacks.packVersion,
        status: agsCagCapabilityPacks.status,
        tokenEstimate: agsCagCapabilityPacks.tokenEstimate,
        compileResult: agsCagCapabilityPacks.compileResult,
        governanceVerdict: agsCagCapabilityPacks.governanceVerdict,
        useCount: agsCagCapabilityPacks.useCount,
        createdAt: agsCagCapabilityPacks.createdAt,
      })
      .from(agsCagCapabilityPacks)
      .where(whereClause)
      .orderBy(desc(agsCagCapabilityPacks.createdAt))
      .limit(fetchSize)) as SelectShape[];

    const truncated = raw.length > params.limit;
    const cappedRows = truncated ? raw.slice(0, params.limit) : raw;

    const packs: CagLensPackRow[] = cappedRows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      agentId: r.agentId,
      packType: r.packType,
      packVersion: r.packVersion,
      status: r.status,
      tokenEstimate: r.tokenEstimate,
      compileResult: r.compileResult,
      governanceVerdict: r.governanceVerdict,
      useCount: r.useCount,
      createdAt: r.createdAt,
    }));

    return { packs, truncated };
  };
}
