/**
 * PMT Engine — Watchers Router
 * Add/remove/list watchers on work items
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmWatchers } from "./watchers-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const watchersRouter = router({
  list: protectedProcedure
    .input(z.object({ workItemId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmWatchers)
        .where(and(
          eq(pmWatchers.workItemId, input.workItemId),
          eq(pmWatchers.wsId),
        ));
    }),

  add: governedProcedure
    .input(z.object({
      workItemId: z.number(),
      userId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(pmWatchers).values({
        workspaceId: wsId,
        workItemId: input.workItemId,
        userId: input.userId,
      }).returning();

      return created;
    }),

  remove: governedProcedure
    .input(z.object({
      workItemId: z.number(),
      userId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.delete(pmWatchers)
        .where(and(
          eq(pmWatchers.workItemId, input.workItemId),
          eq(pmWatchers.userId, input.userId),
          eq(pmWatchers.wsId),
        ));

      return { success: true };
    }),
});
