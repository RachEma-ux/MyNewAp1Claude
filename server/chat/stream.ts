import type { Request, Response } from 'express';
import { z } from 'zod';
import { trackProviderUsage } from '../providers/usage';
import { sdk } from '../_core/sdk';
import { ENV } from '../_core/env';
import { providerRouter } from '../inference/provider-router';
import { sanitizeErrorForLogging } from '../_core/log-utils';
import { listActiveForProvider } from '../provider-connections/public-api';
import { resolveWorkspaceDefaultBinding } from '../agent-studio/workspace-default-bindings';
import { stream as modelAccessStream } from '../openrouter/model-access';
import { getModelPricing, computeCost } from '../providers/pricing';

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

// PMB Phase 29.6a — chat-stream binding resolver
//
// Two-step lookup, mirroring D-PR-4 in PROVIDER_ROUTER_MIGRATION_DECISION.md:
//   (I)  Map `providerId` (legacy `providers` table) → `providerConnectionId`
//        via `listActiveForProvider({workspaceId, providerId})`.
//        Picks the first ACTIVE row.
//   (II) If (I) returns no row, fall back to the workspace `chat` default
//        via `resolveWorkspaceDefaultBinding({workspaceId, role: "chat"})`.
//
// Returns null when both (I) and (II) miss; the caller refuses with
// `binding_required` (D-WDB-3 contract — no automatic system-default
// fallback inside the primitives).
async function resolveChatBinding(args: {
  workspaceId: number;
  providerId?: number;
  modelOverride?: string;
}): Promise<{
  providerConnectionId: number;
  modelRef: string;
  source: "active-for-provider" | "workspace-default";
} | null> {
  // Path (I): legacy providerId → providerConnectionId
  if (args.providerId) {
    const active = await listActiveForProvider({
      workspaceId: args.workspaceId,
      providerId: args.providerId,
    });
    if (active.length > 0) {
      // Prefer an explicit `model` override on the request; otherwise use
      // the workspace's `chat` default modelRef, falling back to a
      // sensible default so the upstream call has a model.
      let modelRef = args.modelOverride;
      if (!modelRef) {
        const wsDefault = await resolveWorkspaceDefaultBinding({
          workspaceId: args.workspaceId,
          role: "chat",
        });
        modelRef = wsDefault?.modelRef ?? "gpt-4o-mini";
      }
      return {
        providerConnectionId: active[0].providerConnectionId,
        modelRef,
        source: "active-for-provider",
      };
    }
  }

  // Path (II): workspace `chat` default
  const wsDefault = await resolveWorkspaceDefaultBinding({
    workspaceId: args.workspaceId,
    role: "chat",
  });
  if (wsDefault?.ok) {
    return {
      providerConnectionId: wsDefault.providerConnectionId,
      modelRef: args.modelOverride ?? wsDefault.modelRef,
      source: "workspace-default",
    };
  }

  return null;
}

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

    // PMB Phase 29.6a — resolve workspace context. For the post-LR-08
    // path we need a workspaceId; if the request omits one, fall back
    // to the user's first workspace (preserves the previous code's
    // resolution shape for the cost-tracking step).
    let wsId = workspaceId;
    if (!wsId) {
      const { getUserWorkspaces } = await import('../db');
      const userWorkspaces = await getUserWorkspaces(user.id);
      wsId = userWorkspaces[0]?.id;
    }
    if (!wsId) {
      res.status(400).json({ error: 'workspaceId required (no fallback workspace found for user)' });
      return;
    }

    // Step 1 — selection (unified routing if requested + workspaceId in scope)
    let selectedProviderId: number | undefined = providerId;
    let routingPlan = null;
    if (useUnifiedRouting && workspaceId) {
      try {
        routingPlan = await providerRouter.resolvePlan({
          messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
          workspaceId,
          temperature,
          maxTokens,
          taskHints,
        });
        selectedProviderId = routingPlan.primaryProviderId;
        console.log(`[ChatStream] Unified routing selected provider: ${routingPlan.primaryProviderName}`);
      } catch (routingError: any) {
        console.error('[ChatStream] Unified routing failed:', routingError);
        res.status(500).json({ error: `Routing failed: ${routingError.message}` });
        return;
      }
    }

    // Step 2 — resolve binding (D-PR-4: providerId → providerConnectionId
    // with workspace-default fallback)
    const binding = await resolveChatBinding({
      workspaceId: wsId,
      providerId: selectedProviderId,
      modelOverride: model,
    });
    if (!binding) {
      res.status(400).json({
        error: 'binding_required',
        detail: `No usable provider binding found for workspace ${wsId} (providerId=${selectedProviderId ?? "n/a"}, role="chat" default not set or unhealthy)`,
      });
      return;
    }
    console.log(
      `[ChatStream] Resolved binding via ${binding.source}: pcid=${binding.providerConnectionId}, modelRef=${binding.modelRef}`,
    );

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Convert messages to provider format
    let providerMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> =
      messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      }));

    // Inject RAG context if enabled
    let ragSources: any[] = [];
    if (useRAG && wsId) {
      try {
        const { retrieveRelevantChunks } = await import('../documents/rag-pipeline');

        // Get the last user message as the query
        const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
        if (lastUserMessage) {
          // Search for relevant chunks using RAG pipeline
          const relevantChunks = await retrieveRelevantChunks(
            lastUserMessage.content,
            'documents', // Default collection name
            wsId,
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
            const contextMessage = {
              role: 'system' as const,
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
    let finalUsage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

    try {
      // PMB Phase 29.6a — direct-import the Model Access streaming
      // primitive. The gateway-call form of `openRouter.modelAccess.stream`
      // collapses streams to a single result; for SSE we need real
      // streaming and therefore call the function directly. The
      // receipt policy is enforced at the gateway boundary; the direct-
      // import path is reserved for streaming consumers (as noted in
      // `manifest.ts:124` and used by simulation.ts via the bridge).
      for await (const chunk of modelAccessStream({
        providerConnectionId: binding.providerConnectionId,
        modelRef: binding.modelRef,
        messages: providerMessages.map((m) => ({ role: m.role, content: m.content })),
        intent: "chat",
        workspaceId: wsId,
        actorId: user.id,
        temperature,
        tokenBudget: maxTokens,
      })) {
        if (chunk.usage) finalUsage = chunk.usage;
        if (chunk.done) {
          // Final chunk — finalize usage + send completion event
          const latencyMs = Date.now() - startTime;
          const promptTokens =
            finalUsage?.inputTokens ??
            Math.ceil(messages.reduce((sum: number, m: any) => sum + m.content.length, 0) / 4);
          const completionTokens = finalUsage?.outputTokens ?? tokenCount;
          const totalTokens = finalUsage?.totalTokens ?? promptTokens + completionTokens;

          // PMB Phase 30.2 — restore cost-tracking via the workspace
          // pricing config. Lookup order: workspace_pricing_config row →
          // BUILT_IN_PRICING (OpenAI + Anthropic public list-prices) →
          // fallback to 0 with a console.warn. Best-effort: pricing
          // failures never block the chat call.
          const pricing = await getModelPricing(wsId, binding.modelRef);
          const cost = computeCost(pricing, promptTokens, completionTokens);

          // Track usage (workspace context only — per-provider id no
          // longer applies cleanly post-LR-08; we track providerConnectionId
          // when the legacy field is unavailable).
          await trackProviderUsage({
            workspaceId: wsId,
            providerId: providerId ?? 0,
            modelName: binding.modelRef,
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
            currency: pricing.currency,
            pricingSource: pricing.source,
            sources: ragSources.length > 0 ? ragSources : undefined,
            routing: routingPlan ? {
              requestId: routingPlan.requestId,
              providerId: routingPlan.primaryProviderId,
              providerName: routingPlan.primaryProviderName,
              fallbackChain: routingPlan.fallbackChain,
              auditReasons: routingPlan.auditReasons,
            } : undefined,
            binding: {
              providerConnectionId: binding.providerConnectionId,
              modelRef: binding.modelRef,
              source: binding.source,
            },
          })}\n\n`);

          res.end();
          break;
        } else {
          // Stream token to client
          fullContent += chunk.delta;
          tokenCount++;

          res.write(`data: ${JSON.stringify({
            type: 'token',
            content: chunk.delta,
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
