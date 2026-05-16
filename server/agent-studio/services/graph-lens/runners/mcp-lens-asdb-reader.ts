/**
 * MCP lens — ASDB read-seam adapter (T-F.64).
 *
 * Implements `McpLensReadFn` against `agsRuntimeToolCalls` via
 * Drizzle through `getAsDbForWorkspace`. The pure builder lives in
 * `mcp-lens-runner.ts`; this file is the DB-touching half.
 *
 * Truncation detection: `limit + 1`; if exceeded, drop the extra row
 * and forward `truncated=true`.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - Source-scan tested.
 */

import { desc, lt } from "drizzle-orm";

import { agsRuntimeToolCalls } from "../../../../../drizzle/tables/agent-studio.js";
import { getAsDbForWorkspace } from "../../../db/connection.js";
import type {
  McpLensReadFn,
  McpLensReadParams,
  McpLensReadResult,
  McpLensToolCallRow,
} from "./mcp-lens-runner.js";

const EMPTY_RESULT: McpLensReadResult = {
  toolCalls: [],
  truncated: false,
};

export interface CreateMcpLensAsdbReaderOptions {
  readonly getDbForWorkspace?: typeof getAsDbForWorkspace;
}

export function createMcpLensAsdbReader(
  options: CreateMcpLensAsdbReaderOptions = {},
): McpLensReadFn {
  const getDbForWorkspace = options.getDbForWorkspace ?? getAsDbForWorkspace;
  return async (params: McpLensReadParams): Promise<McpLensReadResult> => {
    const db = getDbForWorkspace(params.workspaceId);
    if (!db) return EMPTY_RESULT;

    const fetchSize = params.limit + 1;
    const whereClause = params.before
      ? lt(agsRuntimeToolCalls.createdAt, params.before)
      : undefined;

    type SelectShape = {
      id: number;
      runId: number;
      toolKey: string;
      verdict: string | null;
      durationMs: number | null;
      createdAt: Date;
    };

    const raw: SelectShape[] = (await (whereClause
      ? db
          .select({
            id: agsRuntimeToolCalls.id,
            runId: agsRuntimeToolCalls.runId,
            toolKey: agsRuntimeToolCalls.toolKey,
            verdict: agsRuntimeToolCalls.verdict,
            durationMs: agsRuntimeToolCalls.durationMs,
            createdAt: agsRuntimeToolCalls.createdAt,
          })
          .from(agsRuntimeToolCalls)
          .where(whereClause)
          .orderBy(desc(agsRuntimeToolCalls.createdAt))
          .limit(fetchSize)
      : db
          .select({
            id: agsRuntimeToolCalls.id,
            runId: agsRuntimeToolCalls.runId,
            toolKey: agsRuntimeToolCalls.toolKey,
            verdict: agsRuntimeToolCalls.verdict,
            durationMs: agsRuntimeToolCalls.durationMs,
            createdAt: agsRuntimeToolCalls.createdAt,
          })
          .from(agsRuntimeToolCalls)
          .orderBy(desc(agsRuntimeToolCalls.createdAt))
          .limit(fetchSize))) as SelectShape[];

    const truncated = raw.length > params.limit;
    const cappedRows = truncated ? raw.slice(0, params.limit) : raw;

    const toolCalls: McpLensToolCallRow[] = cappedRows.map((r) => ({
      id: r.id,
      runId: r.runId,
      toolKey: r.toolKey,
      verdict: r.verdict,
      durationMs: r.durationMs,
      createdAt: r.createdAt,
    }));

    return { toolCalls, truncated };
  };
}
