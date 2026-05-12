/**
 * Agent Studio — RAC Trace tRPC sub-router.
 *
 * RAC Phase 7. Two `protectedProcedure`s:
 *
 *   getTrace({ workspaceId, traceId? | messageId? }) → trace + blocks
 *   submitFeedback({ workspaceId, agentId, messageId, verdict, note?, traceId? })
 *
 * The trace itself is written by the chat-stream end-of-stream path
 * (P6 orchestrator → P7 store) — this router only reads + accepts
 * feedback. Feedback is idempotent on `messageId` via the unique
 * index in `ags_rac_feedback`.
 *
 * Phase 22 follow-up #640 adds two `adminProcedure`s on the same
 * sub-router:
 *
 *   pruneRetention({ retentionDays?, workspaceId?, agentId? })
 *   getRetentionCronStatus()
 *
 * Sister of `runs.pruneRetention` (#623) / `runs.pruneToolCallTracesRetention`
 * (#627) / `mcp.pruneTransitionsRetention` (#631) /
 * `catalogSyncLog.pruneRetention` (#635). adminProcedure because the
 * cron + sweep operate across all workspaces; operators reading status
 * are doing cross-tenant ops monitoring.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../../_core/trpc";
import {
  getTraceById,
  getTraceForMessage,
  listContextBlocks,
  recordFeedback,
  getFeedbackForMessage,
} from "../services/rac/trace";

const verdictSchema = z.enum(["thumbs_up", "thumbs_down"]);

export const racTraceRouter = router({
  getTrace: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.number().int().positive(),
          traceId: z.number().int().positive().optional(),
          messageId: z.number().int().positive().optional(),
        })
        .refine((d) => d.traceId != null || d.messageId != null, {
          message: "Provide traceId or messageId",
        }),
    )
    .query(async ({ input }) => {
      const trace =
        input.traceId != null
          ? await getTraceById(input.workspaceId, input.traceId)
          : await getTraceForMessage(input.workspaceId, input.messageId!);
      if (!trace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: input.traceId
            ? `RAC trace ${input.traceId} not found`
            : `No RAC trace found for messageId=${input.messageId}`,
        });
      }
      const blocks = await listContextBlocks(trace.id);
      const feedback = trace.messageId
        ? await getFeedbackForMessage(input.workspaceId, trace.messageId)
        : null;
      return { trace, blocks, feedback };
    }),

  submitFeedback: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        agentId: z.number().int().positive(),
        messageId: z.number().int().positive(),
        traceId: z.number().int().positive().nullable().optional(),
        verdict: verdictSchema,
        note: z.string().max(2048).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return recordFeedback({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        messageId: input.messageId,
        traceId: input.traceId ?? null,
        verdict: input.verdict,
        note: input.note ?? null,
        createdBy: ctx.user.id,
      });
    }),

  // ── Retention (Phase 22 follow-up #638 + #639 + #640) ──────────────
  pruneRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          workspaceId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
          agentId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldRacRuntimeTraces } = await import(
        "../services/rac-runtime-traces-retention"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldRacRuntimeTraces({
        olderThan,
        workspaceId: input?.workspaceId,
        agentId: input?.agentId,
      });
    }),
  getRetentionCronStatus: adminProcedure.query(async () => {
    const { getRacRuntimeTracesRetentionCronStatus } = await import(
      "../services/rac-runtime-traces-retention-cron"
    );
    return getRacRuntimeTracesRetentionCronStatus();
  }),
});
