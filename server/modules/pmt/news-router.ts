/**
 * PMT Engine — News Router
 * Project news and announcements
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { pmNews } from "./collaboration-schema";

export const newsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), projectId: z.number().optional() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmNews.workspaceId, input.workspaceId)];
      if (input.projectId) conditions.push(eq(pmNews.projectId, input.projectId));
      return db.select().from(pmNews)
        .where(and(...conditions))
        .orderBy(desc(pmNews.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmNews)
        .where(and(eq(pmNews.id, input.id), eq(pmNews.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "News item not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      projectId: z.number().optional(),
      title: z.string().min(1).max(500),
      summary: z.string().optional(),
      content: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmNews).values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        title: input.title,
        summary: input.summary,
        content: input.content,
        authorId: ctx.user.id,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "news.create", targetType: "news", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      title: z.string().min(1).max(500).optional(),
      summary: z.string().optional(),
      content: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(pmNews).set(updates)
        .where(and(eq(pmNews.id, id), eq(pmNews.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "news.update", targetType: "news", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmNews)
        .where(and(eq(pmNews.id, input.id), eq(pmNews.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "news.delete", targetType: "news", targetId: input.id });
      return { success: true };
    }),
});
