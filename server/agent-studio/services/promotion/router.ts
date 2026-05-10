/**
 * Promotion — tRPC Router.
 *
 * Phase 11. Mounts promotion lifecycle into the Agent Studio tRPC tree.
 *
 * The PromotionAdapter is supplied by the wiring layer (Phase 11.5);
 * MVP exposes the router signatures with explicit "not yet wired" errors
 * so the frontend can render the surface and we can deploy in two steps.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../_core/trpc.js";
import { PromotionLifecycle, type PromotionAdapter, type PromotionRequest } from "./lifecycle.js";

let cachedAdapter: PromotionAdapter | null = null;
let cachedLifecycle: PromotionLifecycle | null = null;

/**
 * Wiring entry point: call once at boot to inject the real Drizzle-backed
 * adapter that hooks into existing approval scaffolding. Until called,
 * router procedures throw a clear PRECONDITION_FAILED.
 */
export function _setPromotionAdapter(adapter: PromotionAdapter): void {
  cachedAdapter = adapter;
  cachedLifecycle = new PromotionLifecycle(adapter);
}

function lifecycle(): PromotionLifecycle {
  if (!cachedLifecycle) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Promotion adapter not yet wired. Operator must inject the Drizzle-backed PromotionAdapter at boot.",
    });
  }
  return cachedLifecycle;
}

const PromotionKindEnum = z.enum([
  "knowledge_unit",
  "cag_block",
  "graph_skill_pack",
  "tool_knowledge",
  "workflow",
  "policy",
  "evaluation_case",
  "runtime_investigation",
  "graph_entity",
  "temporal_observation",
]);

export const promotionRouter = router({
  submit: protectedProcedure
    .input(z.object({
      noteId: z.number().int(),
      noteVersionId: z.number().int(),
      promotionKind: PromotionKindEnum,
      rationale: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id;
      if (userId == null) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Promotion requires authenticated user" });
      }
      const request: PromotionRequest = {
        noteId: input.noteId,
        noteVersionId: input.noteVersionId,
        promotionKind: input.promotionKind,
        initiatedByUserId: userId,
        rationale: input.rationale,
      };
      return await lifecycle().submit(request);
    }),

  approve: protectedProcedure
    .input(z.object({ promotionId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id;
      if (userId == null) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Approval requires authenticated user" });
      }
      return await lifecycle().approve(input.promotionId, userId);
    }),

  reject: protectedProcedure
    .input(z.object({ promotionId: z.number().int(), reason: z.string().max(1000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id;
      if (userId == null) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Rejection requires authenticated user" });
      }
      return await lifecycle().reject(input.promotionId, userId);
    }),

  rollback: protectedProcedure
    .input(z.object({ promotionId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id;
      if (userId == null) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Rollback requires authenticated user" });
      }
      return await lifecycle().rollback(input.promotionId, userId);
    }),
});

export type PromotionRouter = typeof promotionRouter;
