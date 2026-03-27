/**
 * PMT Engine — Discussions Router
 * Discussion threads and posts
 */

import { z } from "zod";
import { eq, and, desc, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmDiscussions, pmDiscussionPosts } from "./collaboration-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const discussionsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmDiscussions.workspaceId, wsId)];
      if (input.projectId) conditions.push(eq(pmDiscussions.projectId, input.projectId));
      return db.select().from(pmDiscussions)
        .where(and(...conditions))
        .orderBy(desc(pmDiscussions.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmDiscussions)
        .where(and(eq(pmDiscussions.id, input.id), eq(pmDiscussions.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Discussion not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      projectId: z.number().optional(),
      title: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmDiscussions).values({
        workspaceId: wsId,
        projectId: input.projectId,
        title: input.title,
        createdBy: ctx.user.id,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(500).optional(),
      pinned: z.boolean().optional(),
      locked: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmDiscussions).set(updates)
        .where(and(eq(pmDiscussions.id, id), eq(pmDiscussions.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Delete posts first, then the discussion
      const posts = await db.select({ id: pmDiscussionPosts.id }).from(pmDiscussionPosts)
        .where(eq(pmDiscussionPosts.discussionId, input.id));
      if (posts.length > 0) {
        const { inArray } = await import("drizzle-orm");
        await db.delete(pmDiscussionPosts).where(inArray(pmDiscussionPosts.id, posts.map(p => p.id)));
      }
      await db.delete(pmDiscussions)
        .where(and(eq(pmDiscussions.id, input.id), eq(pmDiscussions.workspaceId, wsId)));
      return { success: true };
    }),

  posts: router({
    list: protectedProcedure
      .input(z.object({ discussionId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = getDb();
        if (!db) return [];
        return db.select().from(pmDiscussionPosts)
          .where(eq(pmDiscussionPosts.discussionId, input.discussionId))
          .orderBy(asc(pmDiscussionPosts.createdAt));
      }),

    create: governedProcedure
      .input(z.object({
        discussionId: z.number(),
        content: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const [created] = await db.insert(pmDiscussionPosts).values({
          discussionId: input.discussionId,
          authorId: ctx.user.id,
          content: input.content,
        }).returning();
        return created;
      }),

    update: governedProcedure
      .input(z.object({
        id: z.number(),
        content: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db.update(pmDiscussionPosts).set({
          content: input.content,
          updatedAt: new Date(),
        }).where(eq(pmDiscussionPosts.id, input.id));
        return { success: true };
      }),

    delete: governedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db.delete(pmDiscussionPosts).where(eq(pmDiscussionPosts.id, input.id));
        return { success: true };
      }),
  }),
});
