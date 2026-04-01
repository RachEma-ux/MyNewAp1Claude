import { z } from "zod";
import { router, publicProcedure, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { conversations, messages } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { resolveCatalogAgentExecutionTarget, resolveServiceAgentExecutionTarget } from "../ai-types/execution";

/**
 * Conversations Router
 * 
 * Handles agent conversation management:
 * - List user's conversations
 * - Create new conversations
 * - Get conversation details
 * - Add messages to conversations
 */

export const conversationsRouter = router({
  /**
   * List all conversations for the current user
   * 
   * Returns conversations ordered by most recent activity
   */
  listConversations: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

      const filters = [eq(conversations.userId, ctx.user.id)];
      
      if (input?.agentId) {
        filters.push(eq(conversations.agentId, input.agentId));
      }

      const results = await db
        .select()
        .from(conversations)
        .where(and(...filters))
        .orderBy(desc(conversations.updatedAt))
        .limit(input?.limit || 50)
        .offset(input?.offset || 0);

      return results;
    }),

  /**
   * Create a new conversation
   * 
   * Initializes a conversation between user and agent
   */
  createConversation: governedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      catalogEntryId: z.number().int().positive().optional(),
      workspaceId: z.number().optional(),
      title: z.string().min(1).max(255).optional(),
      initialMessage: z.string().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

      if (input.agentId && input.catalogEntryId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose either a Catalog entry or a raw agent, not both",
        });
      }

      let resolvedAgentId = input.agentId ?? null;
      let derivedTitle = input.title || "New Conversation";
      let resolvedWorkspaceId = input.workspaceId;

      if (input.catalogEntryId) {
        // Service-backed agents don't have a sourceAgent — handle them separately
        const serviceTarget = await resolveServiceAgentExecutionTarget(input.catalogEntryId).catch(() => null);
        if (serviceTarget) {
          derivedTitle = input.title || `${serviceTarget.entry.displayName || serviceTarget.entry.name} Run`;
        } else {
          const target = await resolveCatalogAgentExecutionTarget(input.catalogEntryId);
          resolvedAgentId = target.sourceAgent.id;
          resolvedWorkspaceId = resolvedWorkspaceId ?? target.sourceAgent.workspaceId;
          derivedTitle = input.title || `${target.entry.displayName || target.entry.name} Run`;
        }
      }

      // Use provided workspaceId, or fall back to user's first workspace
      let wsId = resolvedWorkspaceId;
      if (!wsId) {
        const { getUserWorkspaces } = await import("../db");
        const workspaces = await getUserWorkspaces(ctx.user.id);
        wsId = workspaces[0]?.id ?? 1;
      }

      const [conversation] = await db.insert(conversations).values({
        workspaceId: wsId,
        userId: ctx.user.id,
        agentId: resolvedAgentId,
        title: derivedTitle,
      }).returning();

      // Add initial message if provided
      if (input.initialMessage) {
        await db.insert(messages).values({
          conversationId: conversation.id,
          role: "user",
          content: input.initialMessage,
        });
      }

      return conversation;
    }),

  /**
   * Get conversation details with messages
   */
  getConversation: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

      // Get conversation
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.conversationId),
            eq(conversations.userId, ctx.user.id)
          )
        );

      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      // Get messages
      const conversationMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(messages.createdAt);

      return {
        ...conversation,
        messages: conversationMessages,
      };
    }),

  /**
   * Add message to conversation
   */
  addMessage: governedProcedure
    .input(z.object({
      conversationId: z.number(),
      content: z.string().min(1),
      role: z.enum(["user", "assistant", "system"]).default("user"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

      // Verify conversation belongs to user
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.conversationId),
            eq(conversations.userId, ctx.user.id)
          )
        );

      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      // Add message (PostgreSQL: use .returning())
      const [message] = await db.insert(messages).values({
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
      }).returning();

      // Update conversation timestamp
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      return message;
    }),

  /**
   * Delete conversation
   */
  deleteConversation: governedProcedure
    .input(z.object({
      conversationId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

      // Verify ownership
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.conversationId),
            eq(conversations.userId, ctx.user.id)
          )
        );

      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      // Delete messages first (foreign key constraint)
      await db.delete(messages).where(eq(messages.conversationId, input.conversationId));

      // Delete conversation
      await db.delete(conversations).where(eq(conversations.id, input.conversationId));

      return { success: true };
    }),
});
