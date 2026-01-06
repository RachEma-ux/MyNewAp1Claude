/**
 * Orchestrator Integration Router
 * 
 * Provides tRPC procedures for managing agent lifecycle on external orchestrator.
 * Implements 8 REST API endpoints for agent management and policy synchronization.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { getOrchestrator } from "../services/externalOrchestrator";
import { agents, workspaces } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const orchestratorRouter = router({
  /**
   * Endpoint 1: Start agent on orchestrator
   */
  startAgent: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      workspaceId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const orchestrator = getOrchestrator();

      if (!orchestrator) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Orchestrator not initialized",
        });
      }

      // Verify agent ownership
      const agent = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, input.agentId),
            eq(agents.workspaceId, input.workspaceId)
          )
        )
        .limit(1);

      if (!agent[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }

      try {
        const result = await orchestrator.startAgent({
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          spec: {
            name: agent[0].name,
            roleClass: agent[0].roleClass,
            systemPrompt: agent[0].systemPrompt,
            modelId: agent[0].modelId,
            temperature: agent[0].temperature ? parseFloat(agent[0].temperature) : 0.7,
            capabilities: agent[0].allowedTools || [],
          },
        });

        return {
          success: result.success,
          agentId: result.agentId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to start agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Endpoint 2: Stop agent on orchestrator
   */
  stopAgent: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      workspaceId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const orchestrator = getOrchestrator();

      if (!orchestrator) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Orchestrator not initialized",
        });
      }

      // Verify agent ownership
      const agent = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, input.agentId),
            eq(agents.workspaceId, input.workspaceId)
          )
        )
        .limit(1);

      if (!agent[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }

      try {
        const result = await orchestrator.stopAgent(input.workspaceId, input.agentId);
        return { success: result.success };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to stop agent: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Endpoint 3: Get single agent status
   */
  getAgentStatus: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      workspaceId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const orchestrator = getOrchestrator();

      if (!orchestrator) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Orchestrator not initialized",
        });
      }

      try {
        const status = await orchestrator.getAgentStatus(input.workspaceId, input.agentId);
        return status;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get agent status: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Endpoint 4: Get all agents statuses (paginated)
   */
  getAgentsStatuses: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      page: z.number().optional().default(1),
      pageSize: z.number().optional().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const orchestrator = getOrchestrator();

      if (!orchestrator) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Orchestrator not initialized",
        });
      }

      try {
        const result = await orchestrator.getAgentsStatuses(input.workspaceId, {
          page: input.page,
          pageSize: input.pageSize,
        });
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get agents statuses: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Endpoint 5: Get current policy snapshot
   */
  getPolicySnapshot: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input, ctx }) => {
      const orchestrator = getOrchestrator();

      if (!orchestrator) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Orchestrator not initialized",
        });
      }

      try {
        const snapshot = await orchestrator.getPolicySnapshot(input.workspaceId);
        return snapshot;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get policy snapshot: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Endpoint 6: Hot reload policy on orchestrator
   */
  hotReloadPolicy: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      policyContent: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const orchestrator = getOrchestrator();

      if (!orchestrator) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Orchestrator not initialized",
        });
      }

      try {
        const result = await orchestrator.hotReloadPolicy(input.workspaceId, input.policyContent);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to hot reload policy: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Endpoint 7: Revalidate agents against new policy
   */
  revalidateAgents: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      agentIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const orchestrator = getOrchestrator();

      if (!orchestrator) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Orchestrator not initialized",
        });
      }

      try {
        const result = await orchestrator.revalidateAgents(input.workspaceId, input.agentIds);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to revalidate agents: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Endpoint 8: Get agent governance status
   */
  getAgentGovernance: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      workspaceId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const orchestrator = getOrchestrator();

      if (!orchestrator) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Orchestrator not initialized",
        });
      }

      try {
        const governance = await orchestrator.getAgentGovernance(input.workspaceId, input.agentId);
        return governance;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get agent governance: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Health check for orchestrator connectivity
   */
  healthCheck: publicProcedure.query(async ({ ctx }) => {
    const orchestrator = getOrchestrator();

    if (!orchestrator) {
      return {
        healthy: false,
        message: "Orchestrator not initialized",
      };
    }

    try {
      const healthy = await orchestrator.healthCheck();
      return {
        healthy,
        message: healthy ? "Orchestrator is healthy" : "Orchestrator is unhealthy",
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }),
});
