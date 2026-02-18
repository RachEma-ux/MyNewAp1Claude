import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getProviderRegistry } from "../providers/registry";
import type { Message } from "../providers/types";
import { trackProviderUsage } from "../providers/usage";
import { getDb } from "../db";
import { conversations, messages as messagesTable } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const chatRouter = router({
  // Send a message and get a response from the selected provider
  sendMessage: protectedProcedure
    .input(z.object({
      providerId: z.number(),
      messages: z.array(z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      })),
      conversationId: z.number().optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(128000).optional(),
      useRAG: z.boolean().optional(),
      workspaceId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const registry = getProviderRegistry();
      const provider = registry.getProvider(input.providerId);

      if (!provider) {
        throw new Error(`Provider with ID ${input.providerId} not found`);
      }

      // Convert messages to provider format
      let messages: Message[] = input.messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // If RAG is enabled, retrieve relevant context
      if (input.useRAG && input.workspaceId) {
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();
        if (lastUserMessage) {
          try {
            const { qdrantService } = await import('../vectordb/qdrant-service');
            const { embeddingEngine } = await import('../embeddings/embedding-engine');
            
            // Generate embedding for query
            const queryEmbedding = await embeddingEngine.generate({
              texts: [lastUserMessage.content],
            });
            
            // Search for relevant context
            const searchResults = await qdrantService.search({
              collection: `workspace-${input.workspaceId}`,
              query: queryEmbedding.embeddings[0]!,
              limit: 5,
            });
            
            // Add context to messages
            if (searchResults.length > 0) {
              const contextText = searchResults
                .map((result, i) => `[${i + 1}] ${result.payload.text}`)
                .join('\n\n');
              
              messages.unshift({
                role: 'system',
                content: `You are a helpful assistant. Use the following context to answer the user's question:\n\n${contextText}\n\nIf the context doesn't contain relevant information, say so and answer based on your general knowledge.`,
              });
            }
          } catch (error) {
            console.error('[Chat] RAG retrieval failed:', error);
            // Continue without RAG if retrieval fails
          }
        }
      }

      // Generate response
      const startTime = Date.now();
      const response = await provider.generate({
        messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });
      const latencyMs = Date.now() - startTime;

      // Track usage
      if (response.usage) {
        const totalTokens = (response.usage.promptTokens || 0) + (response.usage.completionTokens || 0);

        // Calculate cost (simplified - should use provider-specific pricing)
        const costPer1kTokens = 0.002; // Default cost
        const cost = (totalTokens / 1000) * costPer1kTokens;

        // Resolve workspace ID from input or user's first workspace
        let wsId = input.workspaceId;
        if (!wsId) {
          const { getUserWorkspaces } = await import("../db");
          const userWorkspaces = await getUserWorkspaces(ctx.user.id);
          wsId = userWorkspaces[0]?.id ?? 1;
        }

        await trackProviderUsage({
          workspaceId: wsId,
          providerId: input.providerId,
          modelName: response.model || "unknown",
          tokensUsed: totalTokens,
          cost,
          latencyMs,
        });
      }

      // TODO: Save conversation and message to database

      return {
        content: response.content,
        usage: response.usage,
        model: response.model,
        finishReason: response.finishReason,
      };
    }),

  // List all conversations
  listConversations: protectedProcedure
    .query(async ({ ctx }) => {
      const { getConversationsWithDetails } = await import("../db");
      return await getConversationsWithDetails(ctx.user.id);
    }),

  // Delete a conversation
  deleteConversation: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { deleteConversationWithMessages } = await import("../db");
      await deleteConversationWithMessages(input.conversationId);
      return { success: true };
    }),

  // Bulk delete conversations
  bulkDeleteConversations: protectedProcedure
    .input(z.object({
      conversationIds: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const { bulkDeleteConversations } = await import("../db");
      await bulkDeleteConversations(input.conversationIds);
      return { success: true };
    }),

  // Get available providers for chat
  getAvailableProviders: protectedProcedure
    .query(async () => {
      const registry = getProviderRegistry();
      const providers = registry.getAllProviders();
      
      // Return all providers (registry only contains enabled ones)
      return providers.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
      }));
    }),

  // Send a message with streaming response (returns async generator)
  sendMessageStream: protectedProcedure
    .input(z.object({
      providerId: z.number(),
      messages: z.array(z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      })),
      conversationId: z.number().optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(128000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const registry = getProviderRegistry();
      const provider = registry.getProvider(input.providerId);

      if (!provider) {
        throw new Error(`Provider with ID ${input.providerId} not found`);
      }

      // Convert messages to provider format
      const messages: Message[] = input.messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const startTime = Date.now();
      let fullContent = '';
      let tokenCount = 0;

      try {
        // Collect all tokens from the stream
        for await (const token of provider.generateStream({
          messages,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        })) {
          if (!token.isComplete) {
            fullContent += token.content;
            tokenCount++;
          }
        }

        const latencyMs = Date.now() - startTime;
        
        // Estimate token usage (rough approximation)
        const promptTokens = Math.ceil(input.messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
        const completionTokens = tokenCount;
        const totalTokens = promptTokens + completionTokens;

        // Get cost from provider
        const costProfile = provider.getCostPerToken();
        const cost = (
          (promptTokens / 1000) * costProfile.inputCostPer1kTokens +
          (completionTokens / 1000) * costProfile.outputCostPer1kTokens
        );

        // Resolve workspace ID from user's first workspace
        const { getUserWorkspaces } = await import("../db");
        const userWorkspaces = await getUserWorkspaces(ctx.user.id);
        const wsId = userWorkspaces[0]?.id ?? 1;

        // Track usage
        await trackProviderUsage({
          workspaceId: wsId,
          providerId: input.providerId,
          modelName: provider.name || "streaming-model",
          tokensUsed: totalTokens,
          cost,
          latencyMs,
        });

        return {
          content: fullContent,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens,
          },
        };
      } catch (error) {
        console.error('[ChatRouter] Streaming error:', error);
        throw error;
      }
    }),

  // Save a full conversation (title + messages) to the database
  saveConversation: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(500),
      messages: z.array(z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })),
      providerId: z.number().optional(),
      workspaceId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) return { saved: false, reason: "no_db" };

      // Resolve workspace
      let wsId = input.workspaceId;
      if (!wsId) {
        const { getUserWorkspaces } = await import("../db");
        const workspaces = await getUserWorkspaces(ctx.user.id);
        wsId = workspaces[0]?.id ?? 1;
      }

      // Create conversation
      const [conv] = await db.insert(conversations).values({
        workspaceId: wsId,
        userId: ctx.user.id,
        title: input.title,
      }).returning();

      // Bulk insert messages
      if (input.messages.length > 0) {
        await db.insert(messagesTable).values(
          input.messages.map((m) => ({
            conversationId: conv.id,
            role: m.role,
            content: m.content,
          }))
        );
      }

      return { saved: true, conversationId: conv.id };
    }),

  // Test provider connection
  testProvider: protectedProcedure
    .input(z.object({
      providerId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const registry = getProviderRegistry();
      const provider = registry.getProvider(input.providerId);

      if (!provider) {
        throw new Error(`Provider with ID ${input.providerId} not found`);
      }

      try {
        // Send a simple test message
        const response = await provider.generate({
          messages: [
            { role: "user", content: "Hello! Please respond with 'Connection successful.'" }
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
