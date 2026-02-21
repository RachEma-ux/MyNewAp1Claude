import type { Request, Response } from 'express';
import { z } from 'zod';
import { getProviderRegistry } from '../providers/registry';
import type { Message } from '../providers/types';
import { trackProviderUsage } from '../providers/usage';
import { sdk } from '../_core/sdk';
import { ENV } from '../_core/env';
import { providerRouter } from '../inference/provider-router';
import { sanitizeErrorForLogging } from '../_core/log-utils';

// Zod schema for chat stream request body
const chatStreamSchema = z.object({
  providerId: z.number().int().positive().optional(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(500_000), // 500K char limit per message
  })).min(1).max(200),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(200_000).optional(),
  model: z.string().max(255).optional(),
  useRAG: z.boolean().optional(),
  workspaceId: z.number().int().positive().optional(),
  useUnifiedRouting: z.boolean().optional(),
  taskHints: z.record(z.string(), z.unknown()).optional(),
});

export async function handleChatStream(req: Request, res: Response) {
  try {
    // Authenticate user (DEV_MODE bypasses authentication)
    let user;
    if (ENV.isDevMode) {
      user = {
        id: 1,
        openId: "dev-user-001",
        name: "Dev User",
        email: "dev@example.com",
        loginMethod: "dev-mode",
        role: "user" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    } else {
      user = await sdk.authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    // Validate request body with Zod
    const parseResult = chatStreamSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const { providerId, messages, temperature, maxTokens, useRAG, workspaceId, useUnifiedRouting, taskHints, model } = parseResult.data;

    // providerId is required when not using unified routing
    if (!useUnifiedRouting && !providerId) {
      res.status(400).json({ error: 'Invalid request body: providerId required when not using unified routing' });
      return;
    }

    // Get provider - either directly or via unified routing
    const registry = getProviderRegistry();
    let provider;
    let routingPlan = null;

    if (useUnifiedRouting && workspaceId) {
      // Use unified provider routing
      try {
        routingPlan = await providerRouter.resolvePlan({
          messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
          workspaceId,
          temperature,
          maxTokens,
          taskHints,
        });
        provider = registry.getProvider(routingPlan.primaryProviderId);
        console.log(`[ChatStream] Unified routing selected provider: ${routingPlan.primaryProviderName}`);
      } catch (routingError: any) {
        console.error('[ChatStream] Unified routing failed:', routingError);
        res.status(500).json({ error: `Routing failed: ${routingError.message}` });
        return;
      }
    } else {
      // Legacy direct provider selection
      provider = registry.getProvider(providerId);
    }

    if (!provider) {
      res.status(404).json({ error: `Provider not found` });
      return;
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Convert messages to provider format
    let providerMessages: Message[] = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // Inject RAG context if enabled
    let ragSources: any[] = [];
    if (useRAG && workspaceId) {
      try {
        const { retrieveRelevantChunks } = await import('../documents/rag-pipeline');
        
        // Get the last user message as the query
        const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
        if (lastUserMessage) {
          // Search for relevant chunks using RAG pipeline
          const relevantChunks = await retrieveRelevantChunks(
            lastUserMessage.content,
            'documents', // Default collection name
            workspaceId,
            5 // Top 5 most relevant chunks
          );
          
          if (relevantChunks.length > 0) {
            // Store sources for citation
            ragSources = relevantChunks.map((chunk: any, idx: number) => ({
              id: idx + 1,
              text: chunk.text || chunk.content,
              score: chunk.score,
              metadata: chunk.metadata,
            }));
            
            // Build context from retrieved chunks
            const context = relevantChunks
              .map((chunk: any, idx: number) => `[Source ${idx + 1}] ${chunk.text || chunk.content}`)
              .join('\n\n');
            
            // Inject context as a system message before the conversation
            const contextMessage: Message = {
              role: 'system',
              content: `You are a helpful assistant. Use the following context from the knowledge base to answer the user's question. Cite sources using [Source N] notation when referencing information. If the context doesn't contain relevant information, say so and answer based on your general knowledge.\n\nContext:\n${context}`,
            };
            
            // Insert context message at the beginning (after any existing system message)
            const systemMsgIndex = providerMessages.findIndex(m => m.role === 'system');
            if (systemMsgIndex >= 0) {
              // Replace existing system message with enhanced one
              providerMessages[systemMsgIndex] = {
                role: 'system',
                content: providerMessages[systemMsgIndex].content + '\n\n' + contextMessage.content,
              };
            } else {
              // Add new system message at the beginning
              providerMessages = [contextMessage, ...providerMessages];
            }
            
            console.log(`[ChatStream] Injected RAG context: ${relevantChunks.length} chunks`);
          }
        }
      } catch (ragError) {
        console.error('[ChatStream] RAG error:', sanitizeErrorForLogging(ragError));
        // Continue without RAG if it fails
      }
    }

    const startTime = Date.now();
    let fullContent = '';
    let tokenCount = 0;

    try {
      // Stream tokens from provider
      for await (const token of provider.generateStream({
        messages: providerMessages,
        model,
        temperature,
        maxTokens,
      })) {
        if (token.isComplete) {
          // Final token - calculate usage and track
          const latencyMs = Date.now() - startTime;
          
          // Estimate token usage (rough approximation)
          const promptTokens = Math.ceil(messages.reduce((sum: number, m: any) => sum + m.content.length, 0) / 4);
          const completionTokens = tokenCount;
          const totalTokens = promptTokens + completionTokens;

          // Get cost from provider
          const costProfile = provider.getCostPerToken();
          const cost = (
            (promptTokens / 1000) * costProfile.inputCostPer1kTokens +
            (completionTokens / 1000) * costProfile.outputCostPer1kTokens
          );

          // Resolve workspace from request body or user's first workspace
          let wsId = workspaceId;
          if (!wsId) {
            const { getUserWorkspaces } = await import('../db');
            const userWorkspaces = await getUserWorkspaces(user.id);
            wsId = userWorkspaces[0]?.id ?? 1;
          }

          // Track usage
          await trackProviderUsage({
            workspaceId: wsId,
            providerId,
            modelName: provider.name || "streaming-model",
            tokensUsed: totalTokens,
            cost,
            latencyMs,
          });

          // Send completion event
          res.write(`data: ${JSON.stringify({
            type: 'complete',
            content: fullContent,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens,
            },
            cost,
            sources: ragSources.length > 0 ? ragSources : undefined,
            routing: routingPlan ? {
              requestId: routingPlan.requestId,
              providerId: routingPlan.primaryProviderId,
              providerName: routingPlan.primaryProviderName,
              fallbackChain: routingPlan.fallbackChain,
              auditReasons: routingPlan.auditReasons,
            } : undefined,
          })}\n\n`);
          
          res.end();
        } else {
          // Stream token to client
          fullContent += token.content;
          tokenCount++;
          
          res.write(`data: ${JSON.stringify({
            type: 'token',
            content: token.content,
          })}\n\n`);
        }
      }
    } catch (error) {
      console.error('[ChatStream] Streaming error:', sanitizeErrorForLogging(error));
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown streaming error',
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('[ChatStream] Request error:', sanitizeErrorForLogging(error));
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
