// Provider Hub - tRPC Router

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getProviderRegistry } from "./registry";
import * as providerDb from "./db";
import type { ProviderType } from "./types";
import { batchService } from "../inference/batch-service";
import { hybridRouter } from "../inference/hybrid-router";
import { providerRouter as unifiedRouter } from "../inference/provider-router";
import { getDb } from "../db";
import { routingAuditLogs } from "../../drizzle/schema";
import { desc, eq, and, gte } from "drizzle-orm";

export const providerRouter = router({
  // List all providers
  list: protectedProcedure
    .input(z.object({
      type: z.enum(["local-llamacpp", "local-ollama", "openai", "anthropic", "google", "custom"]).optional(),
      enabledOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      if (input?.type) {
        return await providerDb.getProvidersByType(input.type);
      }
      if (input?.enabledOnly) {
        return await providerDb.getEnabledProviders();
      }
      return await providerDb.getAllProviders();
    }),

  // Get provider by ID
  getById: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }) => {
      return await providerDb.getProviderById(input.id);
    }),

  // Create new provider
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      type: z.enum(["local-llamacpp", "local-ollama", "openai", "anthropic", "google", "custom"]),
      enabled: z.boolean().optional(),
      priority: z.number().min(0).max(100).optional(),
      config: z.record(z.string(), z.unknown()),
      costPer1kTokens: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Create provider in database
      const provider = await providerDb.createProvider(input);

      // Register provider in registry
      const registry = getProviderRegistry();
      await registry.registerProvider({
        id: provider.id,
        name: provider.name,
        type: provider.type as ProviderType,
        enabled: provider.enabled ?? true,
        priority: provider.priority ?? 50,
        config: provider.config as Record<string, unknown>,
        costPer1kTokens: provider.costPer1kTokens ? parseFloat(provider.costPer1kTokens) : undefined,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt,
      });

      return provider;
    }),

  // Update provider
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      enabled: z.boolean().optional(),
      priority: z.number().min(0).max(100).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      costPer1kTokens: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      
      // Update in database
      await providerDb.updateProvider(id, data as any);

      // Update in registry if config changed and provider is registered
      if (data.config) {
        const registry = getProviderRegistry();
        const provider = registry.getProvider(id);
        if (provider) {
          await registry.updateProviderConfig(id, data.config);
        }
      }

      return { success: true };
    }),

  // Delete provider
  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      // Unregister from registry
      const registry = getProviderRegistry();
      await registry.unregisterProvider(input.id);

      // Delete from database
      await providerDb.deleteProvider(input.id);

      return { success: true };
    }),

  // Test connection for provider
  testConnection: protectedProcedure
    .input(z.object({
      providerId: z.number(),
    }))
    .mutation(async ({ input }) => {
      try {
        const registry = getProviderRegistry();
        const provider = registry.getProvider(input.providerId);
        
        if (!provider) {
          return {
            success: false,
            error: "Provider not found in registry",
          };
        }

        const health = await provider.healthCheck();
        return {
          success: health.healthy,
          error: health.healthy ? undefined : health.message,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Connection test failed",
        };
      }
    }),

  // Health check for provider
  healthCheck: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }) => {
      const registry = getProviderRegistry();
      const provider = registry.getProvider(input.id);
      
      if (!provider) {
        throw new Error("Provider not found in registry");
      }

      return await provider.healthCheck();
    }),

  // Health check all providers
  healthCheckAll: protectedProcedure
    .query(async () => {
      const registry = getProviderRegistry();
      const results = await registry.healthCheckAll();
      
      return Object.fromEntries(results);
    }),

  // Get provider capabilities
  getCapabilities: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }) => {
      const registry = getProviderRegistry();
      const provider = registry.getProvider(input.id);
      
      if (!provider) {
        throw new Error("Provider not found in registry");
      }

      return provider.getCapabilities();
    }),

  // Get provider cost profile
  getCostProfile: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }) => {
      const registry = getProviderRegistry();
      const provider = registry.getProvider(input.id);
      
      if (!provider) {
        throw new Error("Provider not found in registry");
      }

      return provider.getCostPerToken();
    }),

  // Workspace provider assignments
  workspace: router({
    // List providers for workspace
    list: protectedProcedure
      .input(z.object({
        workspaceId: z.number(),
        enabledOnly: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        if (input.enabledOnly) {
          return await providerDb.getEnabledWorkspaceProviders(input.workspaceId);
        }
        return await providerDb.getWorkspaceProviders(input.workspaceId);
      }),

    // Assign provider to workspace
    assign: protectedProcedure
      .input(z.object({
        workspaceId: z.number(),
        providerId: z.number(),
        enabled: z.boolean().optional(),
        priority: z.number().min(0).max(100).optional(),
        quotaTokensPerDay: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return await providerDb.assignProviderToWorkspace(input);
      }),

      // Update workspace provider assignment
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          enabled: z.boolean().optional(),
          priority: z.number().min(0).max(100).optional(),
          quotaTokensPerDay: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await providerDb.updateWorkspaceProvider(id, data as any);
        return { success: true };
      }),

    // Remove provider from workspace
    remove: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ input }) => {
        await providerDb.removeProviderFromWorkspace(input.id);
        return { success: true };
      }),
  }),

  // Usage tracking and analytics
  usage: router({
    // Get usage records
    list: protectedProcedure
      .input(z.object({
        workspaceId: z.number(),
        providerId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await providerDb.getProviderUsage(input.workspaceId, input.providerId);
      }),

    // Get usage statistics
    stats: protectedProcedure
      .input(z.object({
        workspaceId: z.number(),
        providerId: z.number(),
      }))
      .query(async ({ input }) => {
        return await providerDb.getProviderUsageStats(input.workspaceId, input.providerId);
      }),
  }),

  // Batch inference
  batch: router({
    // Get batch job status
    getJob: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .query(({ input }) => {
        return batchService.getJob(input.jobId);
      }),

    // Get all batch jobs
    getAllJobs: protectedProcedure.query(() => {
      return batchService.getAllJobs();
    }),

    // Cancel batch job
    cancelJob: protectedProcedure
      .input(z.object({ jobId: z.string() }))
      .mutation(({ input }) => {
        const success = batchService.cancelJob(input.jobId);
        return { success };
      }),
  }),

  // Hybrid routing
  hybrid: router({
    // Get hybrid router statistics
    getStats: protectedProcedure.query(() => {
      return hybridRouter.getStatistics();
    }),
  }),

  // Unified provider routing with policy support
  routing: router({
    // Get routing plan for a request (dry run)
    getRoutingPlan: protectedProcedure
      .input(z.object({
        workspaceId: z.number(),
        model: z.string().optional(),
        taskHints: z.object({
          mustStayLocal: z.boolean().optional(),
          maxLatencyMs: z.number().optional(),
          budgetCeiling: z.number().optional(),
          qualityTier: z.enum(['FAST', 'BALANCED', 'BEST']).optional(),
          requiredCapabilities: z.array(z.enum(['chat', 'embeddings', 'tools', 'vision', 'json_mode', 'streaming'])).optional(),
        }).optional(),
      }))
      .query(async ({ input }) => {
        const plan = await unifiedRouter.resolvePlan({
          messages: [{ role: 'user', content: 'test' }],
          workspaceId: input.workspaceId,
          model: input.model,
          taskHints: input.taskHints,
        });
        return plan;
      }),

    // Get routing audit logs
    getAuditLogs: protectedProcedure
      .input(z.object({
        workspaceId: z.number().optional(),
        providerId: z.number().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        since: z.date().optional(),
      }))
      .query(async ({ input }) => {
        const db = getDb();
        if (!db) return [];

        const conditions = [];

        if (input.workspaceId) {
          conditions.push(eq(routingAuditLogs.workspaceId, input.workspaceId));
        }
        if (input.providerId) {
          conditions.push(eq(routingAuditLogs.actualProviderId, input.providerId));
        }
        if (input.since) {
          conditions.push(gte(routingAuditLogs.createdAt, input.since));
        }

        const query = db
          .select()
          .from(routingAuditLogs)
          .orderBy(desc(routingAuditLogs.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const logs = conditions.length > 0
          ? await query.where(and(...conditions))
          : await query;

        return logs;
      }),

    // Get routing statistics
    getStats: protectedProcedure
      .input(z.object({
        workspaceId: z.number(),
        since: z.date().optional(),
      }))
      .query(async ({ input }) => {
        const db = getDb();
        if (!db) {
          return {
            totalRequests: 0,
            primaryUsed: 0,
            fallbackUsed: 0,
            fallbackRate: 0,
            avgLatencyMs: 0,
            totalTokens: 0,
            providerBreakdown: {},
          };
        }

        const since = input.since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h

        const logs = await db
          .select()
          .from(routingAuditLogs)
          .where(
            and(
              eq(routingAuditLogs.workspaceId, input.workspaceId),
              gte(routingAuditLogs.createdAt, since)
            )
          );

        // Calculate statistics
        const totalRequests = logs.length;
        const primaryUsed = logs.filter(l => l.routeTaken === 'PRIMARY').length;
        const fallbackUsed = totalRequests - primaryUsed;
        const avgLatency = logs.length > 0
          ? logs.reduce((sum, l) => sum + (l.latencyMs || 0), 0) / logs.length
          : 0;
        const totalTokens = logs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0);

        // Provider breakdown
        const providerCounts: Record<number, number> = {};
        logs.forEach(l => {
          providerCounts[l.actualProviderId] = (providerCounts[l.actualProviderId] || 0) + 1;
        });

        return {
          totalRequests,
          primaryUsed,
          fallbackUsed,
          fallbackRate: totalRequests > 0 ? (fallbackUsed / totalRequests) * 100 : 0,
          avgLatencyMs: Math.round(avgLatency),
          totalTokens,
          providerBreakdown: providerCounts,
        };
      }),
  }),

  // Provider capabilities and policy management
  capabilities: router({
    // Update provider capabilities
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        capabilities: z.array(z.enum(['chat', 'embeddings', 'tools', 'vision', 'json_mode', 'streaming'])).optional(),
        policyTags: z.array(z.enum(['no_egress', 'pii_safe', 'gpu_required', 'hipaa_compliant', 'gdpr_compliant'])).optional(),
        kind: z.enum(['local', 'cloud', 'hybrid']).optional(),
        limits: z.object({
          maxContext: z.number().optional(),
          maxOutput: z.number().optional(),
          rateLimit: z.number().optional(),
          costTier: z.enum(['free', 'low', 'medium', 'high']).optional(),
        }).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await providerDb.updateProvider(id, data as any);
        return { success: true };
      }),

    // Get provider with full routing metadata
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const provider = await providerDb.getProviderById(input.id);
        if (!provider) {
          throw new Error("Provider not found");
        }
        return {
          ...provider,
          kind: (provider as any).kind || 'cloud',
          capabilities: (provider as any).capabilities || [],
          policyTags: (provider as any).policyTags || [],
          limits: (provider as any).limits || null,
        };
      }),
  }),

  // Test provider with comprehensive checks
  test: router({
    // Full provider test (health + sample completion + streaming + capabilities)
    runFullTest: protectedProcedure
      .input(z.object({
        providerId: z.number(),
        testOptions: z.object({
          testHealth: z.boolean().default(true),
          testCompletion: z.boolean().default(true),
          testStreaming: z.boolean().default(true),
          testToolCalling: z.boolean().default(false),
        }).optional(),
      }))
      .mutation(async ({ input }) => {
        const registry = getProviderRegistry();
        const provider = registry.getProvider(input.providerId);

        if (!provider) {
          return {
            success: false,
            error: "Provider not found in registry",
            results: {},
          };
        }

        const results: Record<string, { success: boolean; latencyMs?: number; error?: string }> = {};
        const options = input.testOptions || { testHealth: true, testCompletion: true, testStreaming: true, testToolCalling: false };

        // Health check
        if (options.testHealth) {
          const startHealth = Date.now();
          try {
            const health = await provider.healthCheck();
            results.health = {
              success: health.healthy,
              latencyMs: Date.now() - startHealth,
              error: health.healthy ? undefined : health.message,
            };
          } catch (error: any) {
            results.health = {
              success: false,
              latencyMs: Date.now() - startHealth,
              error: error.message,
            };
          }
        }

        // Sample completion
        if (options.testCompletion) {
          const startCompletion = Date.now();
          try {
            const response = await provider.generate({
              messages: [{ role: 'user', content: 'Say "test successful" and nothing else.' }],
              maxTokens: 20,
            });
            results.completion = {
              success: true,
              latencyMs: Date.now() - startCompletion,
            };
          } catch (error: any) {
            results.completion = {
              success: false,
              latencyMs: Date.now() - startCompletion,
              error: error.message,
            };
          }
        }

        // Streaming test
        if (options.testStreaming) {
          const startStream = Date.now();
          try {
            let tokenCount = 0;
            for await (const token of provider.generateStream({
              messages: [{ role: 'user', content: 'Count to 3.' }],
              maxTokens: 30,
            })) {
              tokenCount++;
              if (token.isComplete) break;
            }
            results.streaming = {
              success: tokenCount > 0,
              latencyMs: Date.now() - startStream,
            };
          } catch (error: any) {
            results.streaming = {
              success: false,
              latencyMs: Date.now() - startStream,
              error: error.message,
            };
          }
        }

        const allSuccess = Object.values(results).every(r => r.success);
        return {
          success: allSuccess,
          results,
        };
      }),
  }),
});
