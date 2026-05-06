/**
 * Agent Studio — Tool Approvals tRPC sub-router (Retrofit P11).
 *
 * Wires the Phase 9 approval-gate service to the operator UI.
 *
 *   - `list`            — protected; rows for a runtime run, newest first
 *   - `listByDraft`     — protected; pending rows for an agent draft
 *   - `getByHash`       — protected; lookup by (agentDraftId, hash)
 *   - `decide`          — governed; flips a pending row to allowed/denied
 *
 * Mounted on the agent-studio root router as `toolApprovals`. The
 * retrofit prompt names this surface `governance.toolApprovals.*` —
 * keeping it on the agent-studio root keeps the existing client
 * `agentStudio.toolApprovals` shape; the platform's `governance` slice
 * stays focused on workspace-level governance.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import {
  router,
  protectedProcedure,
  governedProcedure,
} from "../../_core/trpc";
import { getAsDb } from "../db/connection";
import { agsPendingPermissionRequests } from "../../../drizzle/tables/agent-studio";
import { decideApprovalRequest } from "../services/approval/approval-gate";

function asdb() {
  const db = getAsDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ASDB unavailable" });
  }
  return db;
}

export const toolApprovalsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        runtimeRunId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const db = asdb();
      return db
        .select()
        .from(agsPendingPermissionRequests)
        .where(eq(agsPendingPermissionRequests.runtimeRunId, input.runtimeRunId))
        .orderBy(desc(agsPendingPermissionRequests.createdAt))
        .limit(input.limit);
    }),

  listByDraft: protectedProcedure
    .input(
      z.object({
        agentDraftId: z.number().int().positive(),
        status: z
          .enum(["pending", "allowed", "denied", "timed_out"])
          .optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const db = asdb();
      const conds = [
        eq(agsPendingPermissionRequests.agentDraftId, input.agentDraftId),
      ];
      if (input.status) {
        conds.push(eq(agsPendingPermissionRequests.status, input.status));
      }
      return db
        .select()
        .from(agsPendingPermissionRequests)
        .where(and(...conds))
        .orderBy(desc(agsPendingPermissionRequests.createdAt))
        .limit(input.limit);
    }),

  getByHash: protectedProcedure
    .input(
      z.object({
        agentDraftId: z.number().int().positive(),
        proposedToolCallHash: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .query(async ({ input }) => {
      const db = asdb();
      const rows = await db
        .select()
        .from(agsPendingPermissionRequests)
        .where(
          and(
            eq(agsPendingPermissionRequests.agentDraftId, input.agentDraftId),
            eq(
              agsPendingPermissionRequests.proposedToolCallHash,
              input.proposedToolCallHash,
            ),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    }),

  decide: governedProcedure
    .input(
      z.object({
        approvalRequestId: z.number().int().positive(),
        status: z.enum(["allowed", "denied", "timed_out"]),
        decidedBy: z.number().int().positive().optional(),
        reason: z.string().max(2000).optional(),
        ttlSecondsOverride: z.number().int().positive().max(86_400).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await decideApprovalRequest({
          approvalRequestId: input.approvalRequestId,
          status: input.status,
          decidedBy: input.decidedBy ?? null,
          reason: input.reason ?? null,
          ttlSecondsOverride: input.ttlSecondsOverride ?? null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `approval decide failed: ${msg}`,
        });
      }
    }),
});
