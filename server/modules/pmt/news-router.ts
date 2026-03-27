/**
 * PMT Engine — News Router
 * Project news and announcements
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmNews } from "./collaboration-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const newsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmNews.wsId)];
      if (input.projectId) conditions.push(eq(pmNews.projectId, input.projectId));
      return db.select().from(pmNews)
        .where(and(...conditions))
        .orderBy(desc(pmNews.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmNews)
        .where(and(eq(pmNews.id, input.id), eq(pmNews.wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "News item not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      projectId: z.number().optional(),
      title: z.string().min(1).max(500),
      summary: z.string().optional(),
      content: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmNews).values({
        workspaceId: wsId,
        projectId: input.projectId,
        title: input.title,
        summary: input.summary,
        content: input.content,
        authorId: ctx.user.id,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(500).optional(),
      summary: z.string().optional(),
      content: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmNews).set(updates)
        .where(and(eq(pmNews.id, id), eq(pmNews.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmNews)
        .where(and(eq(pmNews.id, input.id), eq(pmNews.wsId)));
      return { success: true };
    }),
});
