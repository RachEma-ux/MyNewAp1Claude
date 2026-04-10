/**
 * KGRA Agent — tRPC Router
 * Server-side proxy to KGRA Python service. No secrets exposed to client.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { kgraHealth, kgraRun, kgraEvaluateBundle, kgraGetReasoningPath } from "./adapter";

export const kgraAgentRouter = router({
  health: protectedProcedure.query(async () => {
    return kgraHealth();
  }),

  run: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(4000),
      mode: z.enum([
        "direct_query", "path_reasoning", "graphrag_local", "graphrag_global",
        "drift", "basic_rag", "bundle_evaluation", "self_learning",
        "expertise_building", "research_mode",
      ]).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await kgraRun({ query: input.query, mode: input.mode });
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  evaluateBundle: protectedProcedure
    .input(z.object({
      documents: z.array(z.object({ name: z.string(), content: z.string() })).min(1).max(100),
      bundle_name: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await kgraEvaluateBundle({ documents: input.documents, bundle_name: input.bundle_name });
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  getReasoningPath: protectedProcedure
    .input(z.object({ pathId: z.string() }))
    .query(async ({ input }) => {
      try {
        return await kgraGetReasoningPath(input.pathId);
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),
});
