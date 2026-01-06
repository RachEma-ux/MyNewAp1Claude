/**
 * OPA Policy Router
 * 
 * Provides tRPC procedures for managing OPA policies.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getOPAEngine } from "../services/opaPolicyEngine";
import { getDb } from "../db";
import { policies } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const opaPolicyRouter = router({
  /**
   * Evaluate agent against OPA policies
   */
  evaluateAgent: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      workspaceId: z.number(),
      agentData: z.object({
        name: z.string(),
        roleClass: z.string(),
        temperature: z.number(),
        hasDocumentAccess: z.boolean(),
        hasToolAccess: z.boolean(),
        allowedTools: z.array(z.string()),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const opaEngine = getOPAEngine();

      if (!opaEngine) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "OPA engine not initialized",
        });
      }

      try {
        const result = await opaEngine.evaluatePolicy({
          agent: {
            id: input.agentId,
            ...input.agentData,
          },
          workspace: {
            id: input.workspaceId,
            policies: [],
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Policy evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Compile and validate a Rego policy
   */
  compilePolicy: protectedProcedure
    .input(z.object({
      regoContent: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const opaEngine = getOPAEngine();

      if (!opaEngine) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "OPA engine not initialized",
        });
      }

      try {
        const result = await opaEngine.compilePolicy(input.regoContent);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Policy compilation failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Get OPA engine version
   */
  getVersion: protectedProcedure.query(async ({ ctx }) => {
    const opaEngine = getOPAEngine();

    if (!opaEngine) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "OPA engine not initialized",
      });
    }

    try {
      const version = await opaEngine.getVersion();
      return { version };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to get OPA version: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }),

  /**
   * Check OPA health
   */
  healthCheck: protectedProcedure.query(async ({ ctx }) => {
    const opaEngine = getOPAEngine();

    if (!opaEngine) {
      return {
        healthy: false,
        message: "OPA engine not initialized",
      };
    }

    try {
      const healthy = await opaEngine.healthCheck();
      return {
        healthy,
        message: healthy ? "OPA is healthy" : "OPA is unhealthy",
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }),

  /**
   * Save policy to database
   */
  savePolicy: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string(),
      regoContent: z.string(),
      description: z.string().optional(),
      isActive: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const opaEngine = getOPAEngine();

      if (!opaEngine) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "OPA engine not initialized",
        });
      }

      // Validate policy first
      const validation = await opaEngine.compilePolicy(input.regoContent);
      if (!validation.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Policy validation failed: ${validation.errors?.join(', ')}`,
        });
      }

      try {
        // If setting as active, deactivate others
        if (input.isActive) {
          await db
            .update(policies)
            .set({ isActive: false })
            .where(eq(policies.workspaceId, input.workspaceId));
        }

        // Save the policy
        const result = await db.insert(policies).values({
          workspaceId: input.workspaceId,
          name: input.name,
          content: input.regoContent,
          description: input.description,
          isActive: input.isActive,
          isTemplate: false,
          createdBy: ctx.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return {
          success: true,
          policyId: result[0].insertId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to save policy: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Get all policies for workspace
   */
  getPolicies: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();

      try {
        const policyList = await db
          .select()
          .from(policies)
          .where(eq(policies.workspaceId, input.workspaceId));

        return policyList;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get policies: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Get active policy for workspace
   */
  getActivePolicy: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();

      try {
        const activePolicy = await db
          .select()
          .from(policies)
          .where(
            and(
              eq(policies.workspaceId, input.workspaceId),
              eq(policies.isActive, true)
            )
          )
          .limit(1);

        return activePolicy[0] || null;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get active policy: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),
});
