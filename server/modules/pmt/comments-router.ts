/**
 * PMT Engine — Comments Router
 * CRUD for threaded comments on work items
 */

import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmComments } from "./comments-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const commentsRouter = router({
  list: protectedProcedure
    .input(z.object({ workItemId: z.number() }))
    .query(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmComments)
        .where(and(
          eq(pmComments.workItemId, input.workItemId),
          eq(pmComments.workspaceId, wsId),
        ))
        .orderBy(asc(pmComments.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      workItemId: z.number(),
      content: z.string().min(1),
      parentId: z.number().optional(),
      authorType: z.enum(["human", "ai"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Parse @mentions from content
      const mentionMatches = input.content.match(/@(\d+)/g);
      const mentions = mentionMatches
        ? mentionMatches.map((m) => parseInt(m.slice(1), 10))
        : [];

      const [created] = await db.insert(pmComments).values({
        workspaceId: wsId,
        workItemId: input.workItemId,
        parentId: input.parentId,
        authorId: ctx.user.id,
        authorType: input.authorType || "human",
        content: input.content,
        mentions: mentions.length > 0 ? mentions : null,
      }).returning();

      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const mentionMatches = input.content.match(/@(\d+)/g);
      const mentions = mentionMatches
        ? mentionMatches.map((m) => parseInt(m.slice(1), 10))
        : [];

      await db.update(pmComments).set({
        content: input.content,
        mentions: mentions.length > 0 ? mentions : null,
        updatedAt: new Date(),
      }).where(and(eq(pmComments.id, input.id), eq(pmComments.workspaceId, wsId)));

      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.delete(pmComments)
        .where(and(eq(pmComments.id, input.id), eq(pmComments.workspaceId, wsId)));

      return { success: true };
    }),
});
