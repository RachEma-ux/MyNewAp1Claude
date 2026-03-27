/**
 * PMT Engine — Activity Types Router
 * Simple CRUD for billable/non-billable activity categories
 */
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmActivityTypes } from "./time-cost-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const activityTypesRouter = router({
  list: protectedProcedure
    
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmActivityTypes)
        .where(eq(pmActivityTypes.workspaceId, wsId))
        .orderBy(asc(pmActivityTypes.position));
    }),

  create: governedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      billable: z.boolean().optional(),
      position: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmActivityTypes).values({
        workspaceId: wsId,
        name: input.name,
        billable: input.billable,
        position: input.position,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100).optional(),
      billable: z.boolean().optional(),
      position: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmActivityTypes).set(updates)
        .where(and(eq(pmActivityTypes.id, id), eq(pmActivityTypes.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmActivityTypes)
        .where(and(eq(pmActivityTypes.id, input.id), eq(pmActivityTypes.workspaceId, wsId)));
      return { success: true };
    }),
});
