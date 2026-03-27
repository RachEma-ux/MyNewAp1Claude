/**
 * PMT Engine — Notifications Router
 * List, mark read, mark all read
 */
import { z } from "zod";
import { eq, and, desc, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmNotifications } from "./integrations-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmNotifications.wsId)];
      if (input.unreadOnly) conditions.push(isNull(pmNotifications.readAt));
      return db.select().from(pmNotifications)
        .where(and(...conditions))
        .orderBy(desc(pmNotifications.createdAt));
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(pmNotifications).set({ readAt: new Date() })
        .where(and(eq(pmNotifications.id, input.id), eq(pmNotifications.wsId)));
      return { success: true };
    }),

  markAllRead: protectedProcedure
    
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(pmNotifications).set({ readAt: new Date() })
        .where(and(eq(pmNotifications.wsId), isNull(pmNotifications.readAt)));
      return { success: true };
    }),
});
