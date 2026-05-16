/**
 * Institutional Memory lens — ASDB read-seam adapter (T-F.69).
 *
 * Implements `InstitutionalMemoryLensReadFn` against `agsAgents`
 * via Drizzle. `agsAgents` is a global registry (no `workspaceId`
 * column), so region routing alone scopes per workspace.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No banned imports.
 *   - Source-scan tested.
 */

import { desc, lt } from "drizzle-orm";

import { agsAgents } from "../../../../../drizzle/tables/agent-studio.js";
import { getAsDbForWorkspace } from "../../../db/connection.js";
import type {
  InstitutionalMemoryLensAgentRow,
  InstitutionalMemoryLensReadFn,
  InstitutionalMemoryLensReadParams,
  InstitutionalMemoryLensReadResult,
} from "./institutional-memory-lens-runner.js";

const EMPTY_RESULT: InstitutionalMemoryLensReadResult = {
  agents: [],
  truncated: false,
};

export interface CreateInstitutionalMemoryLensAsdbReaderOptions {
  readonly getDbForWorkspace?: typeof getAsDbForWorkspace;
}

export function createInstitutionalMemoryLensAsdbReader(
  options: CreateInstitutionalMemoryLensAsdbReaderOptions = {},
): InstitutionalMemoryLensReadFn {
  const getDbForWorkspace = options.getDbForWorkspace ?? getAsDbForWorkspace;
  return async (
    params: InstitutionalMemoryLensReadParams,
  ): Promise<InstitutionalMemoryLensReadResult> => {
    const db = getDbForWorkspace(params.workspaceId);
    if (!db) return EMPTY_RESULT;

    const fetchSize = params.limit + 1;
    const whereClause = params.before
      ? lt(agsAgents.createdAt, params.before)
      : undefined;

    type SelectShape = {
      id: number;
      name: string;
      internalKey: string;
      ownerId: number | null;
      domain: string | null;
      visibility: string | null;
      lifecycleState: string;
      agentClass: string | null;
      createdAt: Date;
    };

    const raw: SelectShape[] = (await (whereClause
      ? db
          .select({
            id: agsAgents.id,
            name: agsAgents.name,
            internalKey: agsAgents.internalKey,
            ownerId: agsAgents.ownerId,
            domain: agsAgents.domain,
            visibility: agsAgents.visibility,
            lifecycleState: agsAgents.lifecycleState,
            agentClass: agsAgents.agentClass,
            createdAt: agsAgents.createdAt,
          })
          .from(agsAgents)
          .where(whereClause)
          .orderBy(desc(agsAgents.createdAt))
          .limit(fetchSize)
      : db
          .select({
            id: agsAgents.id,
            name: agsAgents.name,
            internalKey: agsAgents.internalKey,
            ownerId: agsAgents.ownerId,
            domain: agsAgents.domain,
            visibility: agsAgents.visibility,
            lifecycleState: agsAgents.lifecycleState,
            agentClass: agsAgents.agentClass,
            createdAt: agsAgents.createdAt,
          })
          .from(agsAgents)
          .orderBy(desc(agsAgents.createdAt))
          .limit(fetchSize))) as SelectShape[];

    const truncated = raw.length > params.limit;
    const cappedRows = truncated ? raw.slice(0, params.limit) : raw;

    const agents: InstitutionalMemoryLensAgentRow[] = cappedRows.map((r) => ({
      id: r.id,
      name: r.name,
      internalKey: r.internalKey,
      ownerId: r.ownerId,
      domain: r.domain,
      visibility: r.visibility,
      lifecycleState: r.lifecycleState,
      agentClass: r.agentClass,
      createdAt: r.createdAt,
    }));

    return { agents, truncated };
  };
}
