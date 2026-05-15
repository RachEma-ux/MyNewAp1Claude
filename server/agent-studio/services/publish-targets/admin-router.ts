/**
 * Publish-targets admin tRPC router — PR-V1-186.
 *
 * Operator-facing read-only surface for the publish-targets
 * registry + executions ledger. Mounted at
 * `agentStudio.publishTargets.*`. All procedures are
 * `adminProcedure` — operator authority required.
 *
 * Read-only first slice. Mutations (register / disable target,
 * retry execution) ship in a follow-up once the basic operator
 * observability is in operators' hands.
 *
 * Hard-rule compliance:
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` /
 *     `neo4j-driver` imports.
 */

import { z } from "zod";

import { adminProcedure, router } from "../../../_core/trpc.js";
import {
  listPublishTargets,
  listRecentPublishExecutions,
  setPublishTargetEnabled,
} from "./admin-queries.js";
import { PUBLISH_EXECUTION_STATUSES } from "./types.js";

const ListRecentInputSchema = z.object({
  targetId: z.number().int().positive().optional(),
  status: z.enum(PUBLISH_EXECUTION_STATUSES).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export const publishTargetsAdminRouter = router({
  /**
   * List every publish-target row in the registry. Operator
   * dashboard primary read.
   */
  listTargets: adminProcedure.query(async () => {
    return listPublishTargets();
  }),

  /**
   * Recent publish-target executions. Filter by `targetId` /
   * `status`. Default 50, capped at 500.
   */
  listRecentExecutions: adminProcedure
    .input(ListRecentInputSchema)
    .query(async ({ input }) => {
      return listRecentPublishExecutions({
        targetId: input.targetId,
        status: input.status,
        limit: input.limit,
      });
    }),

  /**
   * PR-V1-187: operator-toggle for the `enabled` boolean. Disabled
   * targets refuse dispatch via `PublishTargetDisabledError` in
   * `executePublish`. Use this to quiesce a target during an
   * upstream incident without touching the registry row.
   */
  setEnabled: adminProcedure
    .input(
      z.object({
        targetId: z.number().int().positive(),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      return setPublishTargetEnabled(input.targetId, input.enabled);
    }),
});
