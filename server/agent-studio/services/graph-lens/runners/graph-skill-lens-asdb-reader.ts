/**
 * Graph Skill lens — ASDB read-seam adapter (T-F.68).
 *
 * Implements `GraphSkillLensReadFn` against `agsGraphSkillPacks`
 * via Drizzle. `agsGraphSkillPacks` has no `workspaceId` column;
 * region routing alone scopes per workspace.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No banned imports.
 *   - Source-scan tested.
 */

import { desc, lt } from "drizzle-orm";

import { agsGraphSkillPacks } from "../../../../../drizzle/tables/agent-studio-graph-skill.js";
import { getAsDbForWorkspace } from "../../../db/connection.js";
import type {
  GraphSkillLensPackRow,
  GraphSkillLensReadFn,
  GraphSkillLensReadParams,
  GraphSkillLensReadResult,
} from "./graph-skill-lens-runner.js";

const EMPTY_RESULT: GraphSkillLensReadResult = { packs: [], truncated: false };

export interface CreateGraphSkillLensAsdbReaderOptions {
  readonly getDbForWorkspace?: typeof getAsDbForWorkspace;
}

export function createGraphSkillLensAsdbReader(
  options: CreateGraphSkillLensAsdbReaderOptions = {},
): GraphSkillLensReadFn {
  const getDbForWorkspace = options.getDbForWorkspace ?? getAsDbForWorkspace;
  return async (
    params: GraphSkillLensReadParams,
  ): Promise<GraphSkillLensReadResult> => {
    const db = getDbForWorkspace(params.workspaceId);
    if (!db) return EMPTY_RESULT;

    const fetchSize = params.limit + 1;
    const whereClause = params.before
      ? lt(agsGraphSkillPacks.createdAt, params.before)
      : undefined;

    type SelectShape = {
      id: number;
      skillKey: string;
      name: string;
      description: string | null;
      domain: string | null;
      riskLevel: string;
      approvalRequired: boolean;
      active: boolean;
      createdAt: Date;
    };

    const raw: SelectShape[] = (await (whereClause
      ? db
          .select({
            id: agsGraphSkillPacks.id,
            skillKey: agsGraphSkillPacks.skillKey,
            name: agsGraphSkillPacks.name,
            description: agsGraphSkillPacks.description,
            domain: agsGraphSkillPacks.domain,
            riskLevel: agsGraphSkillPacks.riskLevel,
            approvalRequired: agsGraphSkillPacks.approvalRequired,
            active: agsGraphSkillPacks.active,
            createdAt: agsGraphSkillPacks.createdAt,
          })
          .from(agsGraphSkillPacks)
          .where(whereClause)
          .orderBy(desc(agsGraphSkillPacks.createdAt))
          .limit(fetchSize)
      : db
          .select({
            id: agsGraphSkillPacks.id,
            skillKey: agsGraphSkillPacks.skillKey,
            name: agsGraphSkillPacks.name,
            description: agsGraphSkillPacks.description,
            domain: agsGraphSkillPacks.domain,
            riskLevel: agsGraphSkillPacks.riskLevel,
            approvalRequired: agsGraphSkillPacks.approvalRequired,
            active: agsGraphSkillPacks.active,
            createdAt: agsGraphSkillPacks.createdAt,
          })
          .from(agsGraphSkillPacks)
          .orderBy(desc(agsGraphSkillPacks.createdAt))
          .limit(fetchSize))) as SelectShape[];

    const truncated = raw.length > params.limit;
    const cappedRows = truncated ? raw.slice(0, params.limit) : raw;

    const packs: GraphSkillLensPackRow[] = cappedRows.map((r) => ({
      id: r.id,
      skillKey: r.skillKey,
      name: r.name,
      description: r.description,
      domain: r.domain,
      riskLevel: r.riskLevel,
      approvalRequired: r.approvalRequired,
      active: r.active,
      createdAt: r.createdAt,
    }));

    return { packs, truncated };
  };
}
