/**
 * Conversations Router — DEPRECATED compatibility shim.
 *
 * Canonical owner of conversation + message persistence is the
 * Communication module (`server/communication/*`). This router
 * stays mounted at `appRouter.conversations` so existing UI
 * surfaces (AgentChatPage, CatalogAgentChat) keep compiling
 * during migration. Every procedure delegates to Communication;
 * no writes touch the legacy shared-app `conversations` /
 * `messages` tables anymore.
 *
 * Agent-linked threads carry their `agentId` via Communication's
 * (`sourceModule = "agents"`, `sourceRefId = agentId`,
 * `conversationType = "agent"`) so analytics that need to filter
 * agent-thread conversations remain expressible without owning
 * a separate persistence path.
 */

import { z } from "zod";
import {
  router,
  protectedProcedure,
  governedProcedure,
} from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as comm from "../communication/communication.service";
import {
  resolveCatalogAgentExecutionTarget,
  resolveServiceAgentExecutionTarget,
} from "../ai-types/execution";

async function resolveWorkspaceId(
  userId: number,
  preferred?: number,
): Promise<number> {
  if (preferred) return preferred;
  const { getUserWorkspaces } = await import("../db");
  const workspaces = await getUserWorkspaces(userId);
  return workspaces[0]?.id ?? 1;
}

export const conversationsRouter = router({
  /** @deprecated Use `trpc.communication.conversations.list` instead. */
  listConversations: protectedProcedure
    .input(
      z
        .object({
          agentId: z.number().optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const wsId = await resolveWorkspaceId(ctx.user.id);
      const rows = await comm.listConversations({
        workspaceId: wsId,
        ownerUserId: ctx.user.id,
        conversationType: input?.agentId ? "agent" : undefined,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
      // If the caller filtered by agentId, narrow further by
      // sourceRefId. Cheap post-filter — typical lists are small.
      if (input?.agentId) {
        return rows.filter((r) => r.sourceRefId === input.agentId);
      }
      return rows;
    }),

  /** @deprecated Use `trpc.communication.conversations.create` instead. */
  createConversation: governedProcedure
    .input(
      z.object({
        agentId: z.number().optional(),
        catalogEntryId: z.number().int().positive().optional(),
        workspaceId: z.number().optional(),
        title: z.string().min(1).max(255).optional(),
        initialMessage: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
        const serviceTarget = await resolveServiceAgentExecutionTarget(
          input.catalogEntryId,
        ).catch(() => null);
        if (serviceTarget) {
          derivedTitle =
            input.title ||
            `${serviceTarget.entry.displayName || serviceTarget.entry.name} Run`;
        } else {
          const target = await resolveCatalogAgentExecutionTarget(
            input.catalogEntryId,
          );
          resolvedAgentId = target.sourceAgent.id;
          const sourceWsId = target.sourceAgent.workspaceId;
          resolvedWorkspaceId =
            resolvedWorkspaceId ??
            (typeof sourceWsId === "number" ? sourceWsId : undefined);
          derivedTitle =
            input.title ||
            `${target.entry.displayName || target.entry.name} Run`;
        }
      }

      const wsId = await resolveWorkspaceId(ctx.user.id, resolvedWorkspaceId);

      const conv = await comm.createConversation(
        {
          workspaceId: wsId,
          title: derivedTitle,
          conversationType: resolvedAgentId ? "agent" : "human",
          ownerUserId: ctx.user.id,
          sourceModule: resolvedAgentId ? "agents" : undefined,
          sourceRefId: resolvedAgentId ?? undefined,
        },
        ctx.user.id,
      );

      if (input.initialMessage) {
        await comm.addMessage(
          {
            conversationId: conv.id,
            role: "user",
            content: input.initialMessage,
          },
          ctx.user.id,
        );
      }

      // Preserve the legacy response shape callers expect — flat row
      // with id, workspaceId, userId, agentId, title.
      return {
        id: conv.id,
        workspaceId: conv.workspaceId,
        userId: conv.ownerUserId,
        agentId: resolvedAgentId,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    }),

  /** @deprecated Use `trpc.communication.conversations.get` instead. */
  getConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      const conv = await comm.getConversation(input.conversationId);
      if (!conv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }
      return {
        id: conv.id,
        workspaceId: conv.workspaceId,
        userId: conv.ownerUserId,
        agentId: conv.sourceRefId,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messages: conv.messages,
      };
    }),

  /** @deprecated Use `trpc.communication.messages.add` instead. */
  addMessage: governedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        content: z.string().min(1),
        role: z.enum(["user", "assistant", "system"]).default("user"),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      comm.addMessage(
        {
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
        },
        ctx.user.id,
      ),
    ),

  /** @deprecated Use `trpc.communication.conversations.delete` instead. */
  deleteConversation: governedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await comm.deleteConversation(input.conversationId, ctx.user.id);
      return { success: true };
    }),
});
