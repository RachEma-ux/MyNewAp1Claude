// Provider Hub - tRPC Router

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getProviderRegistry } from "./registry";
import * as providerDb from "./db";
import type { ProviderType } from "./types";
import { batchService } from "../inference/batch-service";
import { hybridRouter } from "../inference/hybrid-router";

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
});
