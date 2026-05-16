/**
 * Runtime lens — ASDB read-seam adapter (T-F.60).
 *
 * Implements `RuntimeLensReadFn` (T-F.59 contract) against
 * `agsRuntimeRuns` + `agsAgents` via Drizzle. The pure builder
 * (`buildRuntimeLensSnapshot`) lives in `runtime-lens-runner.ts`;
 * this file is the DB-touching half intentionally separated from
 * the runner so the runner source-scan can assert
 * "no Drizzle/db imports here".
 *
 * Workspace scoping
 *   `getAsDbForWorkspace(workspaceId)` returns the region-routed
 *   ASDB connection (MR-3 cross-region work). The runner contract
 *   requires workspace-scoped reads; this adapter relies on the
 *   region-routing layer to enforce that, and additionally filters
 *   reads to the most-recent rows ordered by `createdAt desc`.
 *
 *   `agsRuntimeRuns` does not carry a `workspaceId` column directly
 *   (agents are scoped by ownership / visibility, not workspace
 *   membership). Per-workspace isolation is therefore database-level
 *   (different region → different ASDB). When tooling later requires
 *   strict workspace fences on shared-cluster setups, the adapter
 *   gains a JOIN against `agsAgentProviderBindings` to enforce
 *   `workspaceId === viewer.workspaceId`; that's deferred to a
 *   follow-up slice (the contract already passes `workspaceId` so
 *   the surface won't change).
 *
 * Truncation detection
 *   Selects `limit + 1` rows. If the result exceeds `limit`, the
 *   extra row is dropped and `truncated=true` is returned. This
 *   mirrors the canonical Drizzle pattern in the codebase.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - Source-scan tested.
 */

import { desc, inArray, lt } from "drizzle-orm";

import {
  agsAgents,
  agsRuntimeRuns,
} from "../../../../../drizzle/tables/agent-studio.js";
import { getAsDbForWorkspace } from "../../../db/connection.js";
import type {
  RuntimeLensAgentRow,
  RuntimeLensReadFn,
  RuntimeLensReadParams,
  RuntimeLensReadResult,
  RuntimeLensRunRow,
} from "./runtime-lens-runner.js";

const EMPTY_RESULT: RuntimeLensReadResult = {
  runs: [],
  agentsById: new Map(),
  truncated: false,
};

export interface CreateRuntimeLensAsdbReaderOptions {
  /** Test seam — override the connection lookup. */
  readonly getDbForWorkspace?: typeof getAsDbForWorkspace;
}

/**
 * Build a `RuntimeLensReadFn` backed by the workspace-routed ASDB.
 * Fail-soft when the connection lookup returns null (matches the
 * retention-sweep contract — an unreachable ASDB returns an empty
 * snapshot rather than throwing the lens render).
 */
export function createRuntimeLensAsdbReader(
  options: CreateRuntimeLensAsdbReaderOptions = {},
): RuntimeLensReadFn {
  const getDbForWorkspace = options.getDbForWorkspace ?? getAsDbForWorkspace;
  return async (params: RuntimeLensReadParams): Promise<RuntimeLensReadResult> => {
    const db = getDbForWorkspace(params.workspaceId);
    if (!db) return EMPTY_RESULT;

    const fetchSize = params.limit + 1;

    const runWhere = params.before
      ? lt(agsRuntimeRuns.createdAt, params.before)
      : undefined;

    type RunSelectShape = {
      id: number;
      agentId: number;
      status: string;
      parentRunId: number | null;
      resumedFromRunId: number | null;
      compactedFromRunId: number | null;
      triggeredBy: number | null;
      summary: string | null;
      durationMs: number | null;
      errorReason: string | null;
      createdAt: Date;
    };

    const rawRuns: RunSelectShape[] = (await (runWhere
      ? db
          .select({
            id: agsRuntimeRuns.id,
            agentId: agsRuntimeRuns.agentId,
            status: agsRuntimeRuns.status,
            parentRunId: agsRuntimeRuns.parentRunId,
            resumedFromRunId: agsRuntimeRuns.resumedFromRunId,
            compactedFromRunId: agsRuntimeRuns.compactedFromRunId,
            triggeredBy: agsRuntimeRuns.triggeredBy,
            summary: agsRuntimeRuns.summary,
            durationMs: agsRuntimeRuns.durationMs,
            errorReason: agsRuntimeRuns.errorReason,
            createdAt: agsRuntimeRuns.createdAt,
          })
          .from(agsRuntimeRuns)
          .where(runWhere)
          .orderBy(desc(agsRuntimeRuns.createdAt))
          .limit(fetchSize)
      : db
          .select({
            id: agsRuntimeRuns.id,
            agentId: agsRuntimeRuns.agentId,
            status: agsRuntimeRuns.status,
            parentRunId: agsRuntimeRuns.parentRunId,
            resumedFromRunId: agsRuntimeRuns.resumedFromRunId,
            compactedFromRunId: agsRuntimeRuns.compactedFromRunId,
            triggeredBy: agsRuntimeRuns.triggeredBy,
            summary: agsRuntimeRuns.summary,
            durationMs: agsRuntimeRuns.durationMs,
            errorReason: agsRuntimeRuns.errorReason,
            createdAt: agsRuntimeRuns.createdAt,
          })
          .from(agsRuntimeRuns)
          .orderBy(desc(agsRuntimeRuns.createdAt))
          .limit(fetchSize))) as RunSelectShape[];

    const truncated = rawRuns.length > params.limit;
    const cappedRows = truncated ? rawRuns.slice(0, params.limit) : rawRuns;

    const runs: RuntimeLensRunRow[] = cappedRows.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      status: r.status,
      parentRunId: r.parentRunId,
      resumedFromRunId: r.resumedFromRunId,
      compactedFromRunId: r.compactedFromRunId,
      triggeredBy: r.triggeredBy,
      summary: r.summary,
      durationMs: r.durationMs,
      errorReason: r.errorReason,
      createdAt: r.createdAt,
    }));

    const uniqueAgentIds = Array.from(new Set(runs.map((r) => r.agentId)));
    const agentsById = new Map<number, RuntimeLensAgentRow>();
    if (uniqueAgentIds.length > 0) {
      const agentRows = (await db
        .select({
          id: agsAgents.id,
          ownerId: agsAgents.ownerId,
          visibility: agsAgents.visibility,
        })
        .from(agsAgents)
        .where(inArray(agsAgents.id, uniqueAgentIds))) as Array<{
        id: number;
        ownerId: number | null;
        visibility: string | null;
      }>;
      for (const a of agentRows) {
        agentsById.set(a.id, {
          id: a.id,
          ownerId: a.ownerId,
          visibility: a.visibility,
        });
      }
    }

    return { runs, agentsById, truncated };
  };
}

