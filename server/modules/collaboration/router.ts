/**
 * Collaboration Engine — tRPC Router
 * Threads, messages, mentions
 * All mutations are governance-gated.
 */

import { z } from "zod";
import { eq, and, desc, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { threads, threadMessages, threadMentions } from "./schema";

const threadsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), type: z.string().optional() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "collaboration");
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(threads.workspaceId, input.workspaceId)];
      if (input.type) conditions.push(eq(threads.type, input.type));
      return db.select().from(threads).where(and(...conditions)).orderBy(desc(threads.updatedAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "collaboration");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(threads)
        .where(and(eq(threads.id, input.id), eq(threads.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      title: z.string().min(1).max(500),
      type: z.enum(["discussion", "approval", "meeting_notes"]).optional(),
      linkedType: z.string().optional(),
      linkedId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "collaboration");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(threads).values({
        workspaceId: input.workspaceId,
        title: input.title,
        type: input.type,
        createdBy: ctx.user.id,
        linkedType: input.linkedType,
        linkedId: input.linkedId,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "collaboration", actorId: ctx.user.id, action: "thread.create", targetType: "thread", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      title: z.string().optional(),
      status: z.enum(["open", "closed", "archived"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "collaboration");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(threads).set({ ...updates, updatedAt: new Date() })
        .where(and(eq(threads.id, id), eq(threads.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "collaboration", actorId: ctx.user.id, action: "thread.update", targetType: "thread", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "collaboration");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Delete mentions for messages in this thread
      const msgs = await db.select({ id: threadMessages.id }).from(threadMessages)
        .where(eq(threadMessages.threadId, input.id));
      for (const msg of msgs) {
        await db.delete(threadMentions).where(eq(threadMentions.messageId, msg.id));
      }
      await db.delete(threadMessages).where(eq(threadMessages.threadId, input.id));
      await db.delete(threads)
        .where(and(eq(threads.id, input.id), eq(threads.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "collaboration", actorId: ctx.user.id, action: "thread.delete", targetType: "thread", targetId: input.id });
      return { success: true };
    }),
});

const messagesRouter = router({
  list: protectedProcedure
    .input(z.object({ threadId: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "collaboration");
      const db = getDb();
      if (!db) return [];
      return db.select().from(threadMessages)
        .where(eq(threadMessages.threadId, input.threadId))
        .orderBy(asc(threadMessages.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      threadId: z.number(),
      content: z.string().min(1),
      authorType: z.enum(["human", "ai"]).optional(),
      mentions: z.array(z.object({
        userId: z.number(),
        mentionType: z.enum(["user", "ai", "role"]).optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "collaboration");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [msg] = await db.insert(threadMessages).values({
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        authorId: ctx.user.id,
        authorType: input.authorType,
        content: input.content,
      }).returning();
      // Insert mentions
      if (input.mentions?.length) {
        for (const m of input.mentions) {
          await db.insert(threadMentions).values({
            messageId: msg.id,
            userId: m.userId,
            mentionType: m.mentionType || "user",
          });
        }
      }
      // Update thread timestamp
      await db.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, input.threadId));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "collaboration", actorId: ctx.user.id, action: "message.create", targetType: "message", targetId: msg.id });
      return msg;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "collaboration");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(threadMessages).set({ content: input.content, editedAt: new Date() })
        .where(and(eq(threadMessages.id, input.id), eq(threadMessages.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "collaboration", actorId: ctx.user.id, action: "message.update", targetType: "message", targetId: input.id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "collaboration");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(threadMentions).where(eq(threadMentions.messageId, input.id));
      await db.delete(threadMessages)
        .where(and(eq(threadMessages.id, input.id), eq(threadMessages.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "collaboration", actorId: ctx.user.id, action: "message.delete", targetType: "message", targetId: input.id });
      return { success: true };
    }),
});

export const collaborationRouter = router({
  threads: threadsRouter,
  messages: messagesRouter,
});
