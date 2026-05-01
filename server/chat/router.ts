/**
 * Chat Router — DEPRECATED compatibility shim.
 *
 * Canonical owner of chat/conversation/message persistence is the
 * Communication module (`server/communication/*`). New consumers
 * MUST call `trpc.communication.chat.*` and
 * `trpc.communication.conversations.*` directly.
 *
 * This router stays mounted at `appRouter.chat` only to keep
 * existing UI surfaces (`/chat` page, legacy clients) compiling
 * while they migrate. Every procedure here delegates to
 * Communication; no writes touch the shared-app `conversations`
 * or `messages` tables anymore.
 */

import { z } from "zod";
import {
  protectedProcedure,
  governedProcedure,
  router,
} from "../_core/trpc";
import { getProviderRegistry } from "../providers/registry";
import * as comm from "../communication/communication.service";

export const chatRouter = router({
  /** @deprecated Use `trpc.communication.chat.send` instead. */
  sendMessage: governedProcedure
    .input(
      z.object({
        providerId: z.number(),
        messages: z.array(
          z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string(),
          }),
        ),
        conversationId: z.number().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(128_000).optional(),
        useRAG: z.boolean().optional(),
        workspaceId: z.number().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const wsId = await resolveWorkspaceId(ctx.user.id, input.workspaceId);
      const result = await comm.chatSendMessage(
        {
          workspaceId: wsId,
          providerId: input.providerId,
          messages: input.messages,
          conversationId: input.conversationId,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        },
        ctx.user.id,
      );
      // Preserve the legacy response shape callers expect.
      return {
        content: result.content,
        usage: result.usage,
        model: result.model,
        finishReason: result.finishReason,
      };
    }),

  /** @deprecated Use `trpc.communication.conversations.list` instead. */
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    const wsId = await resolveWorkspaceId(ctx.user.id);
    const rows = await comm.listConversations({
      workspaceId: wsId,
      ownerUserId: ctx.user.id,
    });
    return rows;
  }),

  /** @deprecated Use `trpc.communication.conversations.delete` instead. */
  deleteConversation: governedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await comm.deleteConversation(input.conversationId, ctx.user.id);
      return { success: true };
    }),

  /** @deprecated Use `trpc.communication.conversations.delete` per id instead. */
  bulkDeleteConversations: governedProcedure
    .input(z.object({ conversationIds: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      for (const id of input.conversationIds) {
        await comm.deleteConversation(id, ctx.user.id).catch(() => undefined);
      }
      return { success: true };
    }),

  /** Provider-domain helper, not Communication's concern. Stays here. */
  getAvailableProviders: protectedProcedure.query(async () => {
    const registry = getProviderRegistry();
    return registry.getAllProviders().map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
    }));
  }),

  /**
   * @deprecated Streaming send still goes through the provider but
   * persists the resulting message via Communication. Migrate to
   * `trpc.communication.chat.send` (non-stream) or a future
   * communication.chat.sendStream when the project adopts a real
   * tRPC subscription transport.
   */
  sendMessageStream: governedProcedure
    .input(
      z.object({
        providerId: z.number(),
        messages: z.array(
          z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string(),
          }),
        ),
        conversationId: z.number().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(128_000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const wsId = await resolveWorkspaceId(ctx.user.id);
      const result = await comm.chatSendMessage(
        {
          workspaceId: wsId,
          providerId: input.providerId,
          messages: input.messages,
          conversationId: input.conversationId,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        },
        ctx.user.id,
      );
      return {
        content: result.content,
        usage: result.usage,
      };
    }),

  /** @deprecated Use `trpc.communication.conversations.create` + add messages. */
  saveConversation: governedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(500),
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant", "system"]),
            content: z.string(),
          }),
        ),
        providerId: z.number().optional(),
        workspaceId: z.number().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const wsId = await resolveWorkspaceId(ctx.user.id, input.workspaceId);
      const conv = await comm.createConversation(
        {
          workspaceId: wsId,
          title: input.title,
          conversationType: "human",
          ownerUserId: ctx.user.id,
        },
        ctx.user.id,
      );
      for (const m of input.messages) {
        await comm.addMessage(
          {
            conversationId: conv.id,
            role: m.role,
            content: m.content,
          },
          ctx.user.id,
        );
      }
      return { saved: true, conversationId: conv.id };
    }),

  /** Provider-domain test helper. Stays here. */
  testProvider: governedProcedure
    .input(z.object({ providerId: z.number() }))
    .mutation(async ({ input }) => {
      const registry = getProviderRegistry();
      const provider = registry.getProvider(input.providerId);
      if (!provider) throw new Error(`Provider with ID ${input.providerId} not found`);
      try {
        const response = await provider.generate({
          messages: [
            { role: "user", content: "Hello! Please respond with 'Connection successful.'" },
          ],
          maxTokens: 50,
        });
        return {
          success: true,
          message: "Provider connection successful",
          response: response.content,
          usage: response.usage,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
});

async function resolveWorkspaceId(
  userId: number,
  preferred?: number,
): Promise<number> {
  if (preferred) return preferred;
  const { getUserWorkspaces } = await import("../db");
  const workspaces = await getUserWorkspaces(userId);
  return workspaces[0]?.id ?? 1;
}
