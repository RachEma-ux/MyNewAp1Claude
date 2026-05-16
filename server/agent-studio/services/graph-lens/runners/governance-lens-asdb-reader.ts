/**
 * Governance lens — ASDB read-seam adapter (T-F.63).
 *
 * Implements `GovernanceLensReadFn` against `agsPublishRequests` +
 * `agsApprovalSteps` via Drizzle through `getAsDbForWorkspace`. The
 * pure builder lives in `governance-lens-runner.ts`; this file is
 * the DB-touching half.
 *
 * Workspace scoping
 *   Region routing is enforced via `getAsDbForWorkspace(workspaceId)`.
 *   `agsPublishRequests` does not carry a `workspaceId` column
 *   directly (governance lifecycle scopes by agent ownership); per-
 *   workspace isolation is database-level. The adapter surface
 *   already passes `workspaceId` so a follow-up that joins through
 *   `agsAgentProviderBindings` for strict-fence enforcement won't
 *   change the public shape.
 *
 * Truncation detection
 *   Selects `limit + 1` requests. Steps are fetched for every
 *   in-scope request in a single batched `inArray(publishRequestId)`
 *   query. Step rows are NOT cap-limited because they're bounded
 *   by the request set; an operator who narrows the request window
 *   indirectly narrows the steps.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - Source-scan tested.
 */

import { desc, inArray, lt } from "drizzle-orm";

import {
  agsApprovalSteps,
  agsPublishRequests,
} from "../../../../../drizzle/tables/agent-studio.js";
import { getAsDbForWorkspace } from "../../../db/connection.js";
import type {
  GovernanceLensReadFn,
  GovernanceLensReadParams,
  GovernanceLensReadResult,
  GovernanceLensRequestRow,
  GovernanceLensStepRow,
} from "./governance-lens-runner.js";

const EMPTY_RESULT: GovernanceLensReadResult = {
  requests: [],
  steps: [],
  truncated: false,
};

export interface CreateGovernanceLensAsdbReaderOptions {
  readonly getDbForWorkspace?: typeof getAsDbForWorkspace;
}

export function createGovernanceLensAsdbReader(
  options: CreateGovernanceLensAsdbReaderOptions = {},
): GovernanceLensReadFn {
  const getDbForWorkspace = options.getDbForWorkspace ?? getAsDbForWorkspace;
  return async (
    params: GovernanceLensReadParams,
  ): Promise<GovernanceLensReadResult> => {
    const db = getDbForWorkspace(params.workspaceId);
    if (!db) return EMPTY_RESULT;

    const fetchSize = params.limit + 1;
    const requestWhere = params.before
      ? lt(agsPublishRequests.createdAt, params.before)
      : undefined;

    type RequestSelectShape = {
      id: number;
      agentId: number;
      state: string;
      targetEnvironment: string;
      requestedBy: number | null;
      createdAt: Date;
    };

    const rawRequests: RequestSelectShape[] = (await (requestWhere
      ? db
          .select({
            id: agsPublishRequests.id,
            agentId: agsPublishRequests.agentId,
            state: agsPublishRequests.state,
            targetEnvironment: agsPublishRequests.targetEnvironment,
            requestedBy: agsPublishRequests.requestedBy,
            createdAt: agsPublishRequests.createdAt,
          })
          .from(agsPublishRequests)
          .where(requestWhere)
          .orderBy(desc(agsPublishRequests.createdAt))
          .limit(fetchSize)
      : db
          .select({
            id: agsPublishRequests.id,
            agentId: agsPublishRequests.agentId,
            state: agsPublishRequests.state,
            targetEnvironment: agsPublishRequests.targetEnvironment,
            requestedBy: agsPublishRequests.requestedBy,
            createdAt: agsPublishRequests.createdAt,
          })
          .from(agsPublishRequests)
          .orderBy(desc(agsPublishRequests.createdAt))
          .limit(fetchSize))) as RequestSelectShape[];

    const truncated = rawRequests.length > params.limit;
    const cappedRows = truncated
      ? rawRequests.slice(0, params.limit)
      : rawRequests;

    const requests: GovernanceLensRequestRow[] = cappedRows.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      state: r.state,
      targetEnvironment: r.targetEnvironment,
      requestedBy: r.requestedBy,
      createdAt: r.createdAt,
    }));

    const requestIds = requests.map((r) => r.id);
    let steps: GovernanceLensStepRow[] = [];
    if (requestIds.length > 0) {
      type StepSelectShape = {
        id: number;
        publishRequestId: number;
        stepOrder: number;
        approverRole: string;
        state: string;
        decidedBy: number | null;
        decidedAt: Date | null;
        createdAt: Date;
      };
      const rawSteps = (await db
        .select({
          id: agsApprovalSteps.id,
          publishRequestId: agsApprovalSteps.publishRequestId,
          stepOrder: agsApprovalSteps.stepOrder,
          approverRole: agsApprovalSteps.approverRole,
          state: agsApprovalSteps.state,
          decidedBy: agsApprovalSteps.decidedBy,
          decidedAt: agsApprovalSteps.decidedAt,
          createdAt: agsApprovalSteps.createdAt,
        })
        .from(agsApprovalSteps)
        .where(inArray(agsApprovalSteps.publishRequestId, requestIds))) as StepSelectShape[];
      steps = rawSteps.map((s) => ({
        id: s.id,
        publishRequestId: s.publishRequestId,
        stepOrder: s.stepOrder,
        approverRole: s.approverRole,
        state: s.state,
        decidedBy: s.decidedBy,
        decidedAt: s.decidedAt,
        createdAt: s.createdAt,
      }));
    }

    return { requests, steps, truncated };
  };
}
