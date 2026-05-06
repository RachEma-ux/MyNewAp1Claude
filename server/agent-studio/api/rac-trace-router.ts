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
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
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
});
