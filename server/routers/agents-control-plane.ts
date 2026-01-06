/**
 * Agent Control Plane Router
 * 
 * Comprehensive backend endpoints for agent lifecycle management,
 * policy enforcement, promotions, and governance.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { agents, agentProofs, agentHistory } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  DraftAgent,
  SandboxAgent,
  GovernedAgent,
  AgentLifecycleState,
  AgentOriginType,
  PolicyContext,
  computeSpecHash,
  incrementVersion,
} from "../../features/agents-create/types/agent-schema";
import { getFeatureFlags } from "../../features/agents-create/utils/feature-flags";

// ============================================================================
// AGENTS CRUD
// ============================================================================

export const agentsControlPlaneRouter = router({
  /**
   * POST /agents/draft - Create or update draft agent
   * Autosave endpoint for wizard
   */
  createOrUpdateDraft: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        identity: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          tags: z.array(z.string()).optional(),
          roleClass: z.string().optional(),
        }).optional(),
        anatomy: z.object({
          systemPrompt: z.string().optional(),
          llm: z.any().optional(),
          capabilities: z.any().optional(),
          memory: z.any().optional(),
        }).optional(),
        trigger: z.any().optional(),
        limits: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.id; // Use numeric ID instead of openId string

      // If ID provided, update existing draft
      if (input.id) {
        const existing = await (db.query as any).agents.findFirst({
          where: and(

            eq(agents.id, input.id),

            eq(agents.createdBy, userId),

            eq(agents.lifecycleState, "draft")
          ),
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Draft not found or not owned by user",
          });
        }

        // Merge partial updates
        const updated = {
          ...existing,
          ...input,
          updatedAt: new Date(),
        };

        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });


        await db

          .update(agents)
          .set(updated)
          .where(eq(agents.id, input.id));

        return { id: input.id, ...updated };
      }

      // Create new draft
      const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const now = new Date().toISOString();

      const draft = {
        id: draftId,
        ...input,
        lifecycleState: "draft" as AgentLifecycleState,
        lifecycleVersion: 1,
        origin: "scratch" as AgentOriginType,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      };

      await db.insert(agents).values(draft as any);

      return draft;
    }),

  /**
   * POST /agents/validate - Validate agent against schema + policy
   * Called on step exit, review open, create attempt
   */
  validate: protectedProcedure
    .input(
      z.object({
        agent: z.any(), // Partial or full agent
        hook: z.enum([
          "on_field_change",
          "on_step_exit",
          "on_review_open",
          "on_create_attempt",
          "on_promotion_attempt",
          "before_execute",
        ]),
        changeSet: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { agent, hook } = input;

      // Schema validation
      let schemaValid = true;
      const schemaErrors: string[] = [];

      try {
        if (agent.lifecycleState === "draft") {
          DraftAgent.parse(agent);
        } else if (agent.lifecycleState === "sandbox") {
          SandboxAgent.parse(agent);
        } else if (agent.lifecycleState === "governed") {
          GovernedAgent.parse(agent);
        }
      } catch (error: any) {
        schemaValid = false;
        schemaErrors.push(...error.errors.map((e: any) => e.message));
      }

      // Policy validation (mock for now - will integrate with OPA)
      const policyResult = await validateAgainstPolicy(agent, hook, ctx.user);

      return {
        schemaValid,
        schemaErrors,
        policyResult,
        canProceed: schemaValid && policyResult.status !== "deny",
      };
    }),

  /**
   * GET /agents/:id - Load agent for resume/edit
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const agent = await (db.query as any).agents.findFirst({
        where: eq(agents.id, input.id),
      });

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }

      // Check permissions
      if (agent.createdBy !== ctx.user.openId && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this agent",
        });
      }

      return agent;
    }),

  /**
   * POST /agents/:id/sandbox - Transition draft → sandbox
   */
  admitToSandbox: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.id; // Use numeric ID instead of openId string

      // Load draft
      const draft = await (db.query as any).agents.findFirst({
        where: and(

          eq(agents.id, input.id),

          eq(agents.lifecycleState, "draft")
        ),
      });

      if (!draft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft not found",
        });
      }

      // Validate as SandboxAgent
      try {
        SandboxAgent.parse(draft);
      } catch (error: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Draft is incomplete or invalid",
          cause: error,
        });
      }

      // Policy validation
      const policyResult = await validateAgainstPolicy(
        draft,
        "on_create_attempt",
        ctx.user
      );

      if (policyResult.status === "deny") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Policy denies sandbox admission",
          cause: policyResult.violations,
        });
      }

      // Transition to sandbox
      const now = new Date().toISOString();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db

        .update(agents)
        .set({
          lifecycleState: "sandbox",
          updatedAt: now,
        })
        .where(eq(agents.id, input.id));

      // Record history
      await db.insert(agentHistory).values({
        agentId: input.id,
        event: "admitted_to_sandbox",
        timestamp: now,
        actor: userId,
        details: JSON.stringify({ policyResult }),
      } as any);

      return { success: true, agentId: input.id };
    }),

  /**
   * POST /agents/:id/fork - Fork governed agent → draft
   */
  fork: protectedProcedure
    .input(z.object({ id: z.number(), newName: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.openId();

      // Load source agent
      const source = await (db.query as any).agents.findFirst({
        where: eq(agents.id, input.id),
      });

      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Source agent not found",
        });
      }

      // Create fork as draft
      const forkId = `draft_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const now = new Date().toISOString();

      const fork = {
        ...source,
        id: forkId,
        name: input.newName || `${source.name} (Copy)`,
        lifecycleState: "draft" as AgentLifecycleState,
        lifecycleVersion: incrementVersion(source.lifecycleVersion || 1),
        origin: "clone" as AgentOriginType,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        promotedAt: null,
        promotedBy: null,
        governanceProof: null,
      };

      await db.insert(agents).values(fork as any);

      return { id: forkId, ...fork };
    }),

  /**
   * POST /agents/:id/promote - Direct promote (if approvals disabled)
   */
  promote: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const flags = getFeatureFlags();

      if (flags.approvals.enabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Approvals are enabled. Use promotion request workflow.",
        });
      }

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.id; // Use numeric ID instead of openId string

      // Load sandbox agent
      const agent = await (db.query as any).agents.findFirst({
        where: and(

          eq(agents.id, input.id),

          eq(agents.lifecycleState, "sandbox")
        ),
      });

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sandbox agent not found",
        });
      }

      // Policy validation
      const policyResult = await validateAgainstPolicy(
        agent,
        "on_promotion_attempt",
        ctx.user
      );

      if (policyResult.status === "deny") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Policy denies promotion",
          cause: policyResult.violations,
        });
      }

      // Generate governance proof
      const specHash = computeSpecHash(agent as any);
      const proof = {
        proofHash: `proof_${Date.now()}`,
        policyDigest: policyResult.policyDigest,
        policySetHash: policyResult.policySetHash,
        specHash,
        signature: `sig_${Date.now()}`, // Mock signature
        timestamp: new Date().toISOString(),
      };

      // Store proof
      await db.insert(agentProofs).values({
        agentId: input.id,
        ...proof,
      } as any);

      // Promote to governed
      const now = new Date().toISOString();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db

        .update(agents)
        .set({
          lifecycleState: "governed",
          lifecycleVersion: incrementVersion(agent.lifecycleVersion || 1),
          promotedAt: now,
          promotedBy: userId,
          updatedAt: now,
        })
        .where(eq(agents.id, input.id));

      // Record history
      await db.insert(agentHistory).values({
        agentId: input.id,
        event: "promoted_to_governed",
        timestamp: now,
        actor: userId,
        details: JSON.stringify({ proof }),
      } as any);

      return { success: true, proof };
    }),

  /**
   * POST /agents/:id/disable - Disable agent (terminal state)
   */
  disable: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.id; // Use numeric ID instead of openId string

      const now = new Date().toISOString();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db

        .update(agents)
        .set({
          lifecycleState: "disabled",
          disabledAt: now,
          disabledBy: userId,
          disabledReason: input.reason,
          updatedAt: now,
        })
        .where(eq(agents.id, input.id));

      // Record history
      await db.insert(agentHistory).values({
        agentId: input.id,
        event: "disabled",
        timestamp: now,
        actor: userId,
        details: JSON.stringify({ reason: input.reason }),
      } as any);

      return { success: true };
    }),

  /**
   * GET /agents/:id/actions - Get available actions for workflow builder
   */
  getActions: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const agent = await (db.query as any).agents.findFirst({
        where: eq(agents.id, input.id),
      });

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }

      // Extract actions from capabilities
      const capabilities = agent.capabilities as any;
      const actions = capabilities?.actions || [];

      return { actions };
    }),

  /**
   * GET /agents/drafts - List user's draft agents
   */
  listDrafts: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const drafts = await (db.query as any).agents.findMany({
      where: and(

        eq(agents.createdBy, ctx.user.id),

        eq(agents.lifecycleState, "draft")
      ),
      orderBy: [desc(agents.updatedAt)],
    });

    return drafts;
  }),
});

// ============================================================================
// POLICY VALIDATION (Mock - will integrate with OPA)
// ============================================================================

async function validateAgainstPolicy(
  agent: any,
  hook: string,
  user: any
): Promise<PolicyContext & { status: "allow" | "warn" | "deny" }> {
  // Mock policy validation
  // In production, this calls OPA with policy bundle

  const violations: any[] = [];
  const warnings: any[] = [];
  const lockedFields: string[] = [];
  const mutations: any[] = [];

  // Example policy checks
  if (agent.anatomy?.capabilities?.allowExternalWrite && hook === "on_promotion_attempt") {
    violations.push({
      policyId: "policy.no_external_write",
      message: "External write access not allowed in production",
      severity: "error",
      runbookUrl: "https://docs.example.com/policies/no-external-write",
    });
  }

  if (agent.limits?.maxCostPerDay && agent.limits.maxCostPerDay > 1000) {
    warnings.push({
      policyId: "policy.cost_limit",
      message: "Daily cost limit exceeds recommended threshold",
      runbookUrl: "https://docs.example.com/policies/cost-limits",
    });
  }

  // Determine status
  let status: "allow" | "warn" | "deny" = "allow";
  if (violations.length > 0) {
    status = "deny";
  } else if (warnings.length > 0) {
    status = "warn";
  }

  return {
    policyDigest: "sha256:mock_digest",
    policySetHash: "sha256:mock_set_hash",
    evaluatedAt: new Date().toISOString(),
    violations,
    warnings,
    lockedFields,
    mutations,
    status,
  };
}
