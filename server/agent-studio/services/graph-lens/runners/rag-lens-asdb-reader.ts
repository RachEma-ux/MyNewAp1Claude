/**
 * RAG lens — ASDB read-seam adapter (T-F.66).
 *
 * Implements `RagLensReadFn` against `agsRacSources` via Drizzle
 * through `getAsDbForWorkspace`. The pure builder lives in
 * `rag-lens-runner.ts`.
 *
 * Column-level workspace fencing: `agsRacSources.workspaceId` is
 * filtered against `params.workspaceId` (matches the cag adapter
 * pattern from T-F.65).
 *
 * Truncation detection: `limit + 1`.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - Source-scan tested.
 */

import { and, desc, eq, lt } from "drizzle-orm";

import { agsRacSources } from "../../../../../drizzle/tables/agent-studio.js";
import { getAsDbForWorkspace } from "../../../db/connection.js";
import type {
  RagLensReadFn,
  RagLensReadParams,
  RagLensReadResult,
  RagLensSourceRow,
} from "./rag-lens-runner.js";

const EMPTY_RESULT: RagLensReadResult = { sources: [], truncated: false };

export interface CreateRagLensAsdbReaderOptions {
  readonly getDbForWorkspace?: typeof getAsDbForWorkspace;
}

export function createRagLensAsdbReader(
  options: CreateRagLensAsdbReaderOptions = {},
): RagLensReadFn {
  const getDbForWorkspace = options.getDbForWorkspace ?? getAsDbForWorkspace;
  return async (params: RagLensReadParams): Promise<RagLensReadResult> => {
    const db = getDbForWorkspace(params.workspaceId);
    if (!db) return EMPTY_RESULT;

    const fetchSize = params.limit + 1;
    const filters = [eq(agsRacSources.workspaceId, params.workspaceId)];
    if (params.before) {
      filters.push(lt(agsRacSources.createdAt, params.before));
    }
    const whereClause = filters.length === 1 ? filters[0] : and(...filters);

    type SelectShape = {
      id: number;
      workspaceId: number;
      profileId: number;
      sourceType: string;
      ownerModule: string;
      externalRefId: string | null;
      displayName: string | null;
      enabled: boolean;
      priority: number;
      embeddingModelRef: string | null;
      embeddingModelDim: number | null;
      createdAt: Date;
    };

    const raw = (await db
      .select({
        id: agsRacSources.id,
        workspaceId: agsRacSources.workspaceId,
        profileId: agsRacSources.profileId,
        sourceType: agsRacSources.sourceType,
        ownerModule: agsRacSources.ownerModule,
        externalRefId: agsRacSources.externalRefId,
        displayName: agsRacSources.displayName,
        enabled: agsRacSources.enabled,
        priority: agsRacSources.priority,
        embeddingModelRef: agsRacSources.embeddingModelRef,
        embeddingModelDim: agsRacSources.embeddingModelDim,
        createdAt: agsRacSources.createdAt,
      })
      .from(agsRacSources)
      .where(whereClause)
      .orderBy(desc(agsRacSources.createdAt))
      .limit(fetchSize)) as SelectShape[];

    const truncated = raw.length > params.limit;
    const cappedRows = truncated ? raw.slice(0, params.limit) : raw;

    const sources: RagLensSourceRow[] = cappedRows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      profileId: r.profileId,
      sourceType: r.sourceType,
      ownerModule: r.ownerModule,
      externalRefId: r.externalRefId,
      displayName: r.displayName,
      enabled: r.enabled,
      priority: r.priority,
      embeddingModelRef: r.embeddingModelRef,
      embeddingModelDim: r.embeddingModelDim,
      createdAt: r.createdAt,
    }));

    return { sources, truncated };
  };
}
