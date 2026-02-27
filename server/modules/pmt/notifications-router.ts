/**
 * PMT Engine — Notifications Router
 * List, mark read, mark all read
 */
import { z } from "zod";
import { eq, and, desc, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule } from "../registry";
import { pmNotifications } from "./integrations-schema";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), unreadOnly: z.boolean().optional() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmNotifications.workspaceId, input.workspaceId)];
      if (input.unreadOnly) conditions.push(isNull(pmNotifications.readAt));
      return db.select().from(pmNotifications)
        .where(and(...conditions))
        .orderBy(desc(pmNotifications.createdAt));
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(pmNotifications).set({ readAt: new Date() })
        .where(and(eq(pmNotifications.id, input.id), eq(pmNotifications.workspaceId, input.workspaceId)));
      return { success: true };
    }),

  markAllRead: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .mutation(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(pmNotifications).set({ readAt: new Date() })
        .where(and(eq(pmNotifications.workspaceId, input.workspaceId), isNull(pmNotifications.readAt)));
      return { success: true };
    }),
});
