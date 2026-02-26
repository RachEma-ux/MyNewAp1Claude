/**
 * PMT Engine — Watchers Router
 * Add/remove/list watchers on work items
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { pmWatchers } from "./watchers-schema";

export const watchersRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), workItemId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmWatchers)
        .where(and(
          eq(pmWatchers.workItemId, input.workItemId),
          eq(pmWatchers.workspaceId, input.workspaceId),
        ));
    }),

  add: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      workItemId: z.number(),
      userId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(pmWatchers).values({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        userId: input.userId,
      }).returning();

      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "pmt",
        actorId: ctx.user.id,
        action: "watcher.add",
        targetType: "watcher",
        targetId: created.id,
        metadata: { workItemId: input.workItemId, userId: input.userId },
      });
      return created;
    }),

  remove: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      workItemId: z.number(),
      userId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.delete(pmWatchers)
        .where(and(
          eq(pmWatchers.workItemId, input.workItemId),
          eq(pmWatchers.userId, input.userId),
          eq(pmWatchers.workspaceId, input.workspaceId),
        ));

      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "pmt",
        actorId: ctx.user.id,
        action: "watcher.remove",
        targetType: "watcher",
        targetId: input.workItemId,
        metadata: { userId: input.userId },
      });
      return { success: true };
    }),
});
