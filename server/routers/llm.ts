/**
 * LLM Control Plane Router
 *
 * Provides tRPC endpoints for managing LLMs, versions, and promotions
 * Following RFC-001 specifications for governed, auditable LLM lifecycle
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  createLLM,
  getLLMs,
  getLLMById,
  archiveLLM,
  createLLMVersion,
  getLLMVersions,
  getLLMVersion,
  getLatestCallableVersion,
  updateLLMVersionCallable,
  createPromotion,
  getPromotions,
  approvePromotion,
  rejectPromotion,
  getLLMAuditEvents,
} from "../db";
import { LLMPolicyEngine } from "../policies/llm-policy-engine";

// ============================================================================
// Input Validation Schemas
// ============================================================================

const llmRoleSchema = z.enum(["planner", "executor", "router", "guard", "observer", "embedder"]);
const environmentSchema = z.enum(["sandbox", "governed", "production"]);

const createLLMSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  role: llmRoleSchema,
  ownerTeam: z.string().max(255).optional(),
});

const llmConfigSchema = z.object({
  runtime: z.object({
    type: z.enum(["local", "cloud", "remote"]),
    provider: z.string().optional(),
    endpoint: z.string().optional(),
  }),
  model: z.object({
    name: z.string(),
    version: z.string().optional(),
    contextLength: z.number().optional(),
  }),
  parameters: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
    topP: z.number().min(0).max(1).optional(),
    streaming: z.boolean().optional(),
  }).optional(),
  capabilities: z.object({
    tools: z.array(z.string()).optional(),
    functions: z.array(z.string()).optional(),
  }).optional(),
});

const createVersionSchema = z.object({
  llmId: z.number().int().positive(),
  environment: environmentSchema,
  config: llmConfigSchema,
  policyBundleRef: z.string().max(512).optional(),
  policyHash: z.string().length(64).optional(),
  changeNotes: z.string().optional(),
});

const createPromotionSchema = z.object({
  llmVersionId: z.number().int().positive(),
  fromEnvironment: environmentSchema,
  toEnvironment: environmentSchema,
});

// ============================================================================
// LLM Registry Router
// ============================================================================

export const llmRouter = router({
  // ============================================================================
  // LLM Identity Management
  // ============================================================================

  /**
   * Create a new LLM identity
   */
  create: protectedProcedure
    .input(createLLMSchema)
    .mutation(async ({ ctx, input }) => {
      const llm = await createLLM({
        name: input.name,
        description: input.description ?? null,
        role: input.role,
        ownerTeam: input.ownerTeam ?? null,
        createdBy: ctx.user.id,
      });

      return llm;
    }),

  /**
   * List all LLMs (with optional filters)
   */
  list: protectedProcedure
    .input(
      z.object({
        role: llmRoleSchema.optional(),
        archived: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const llms = await getLLMs(input);
      return llms;
    }),

  /**
   * Get LLM by ID with latest versions summary
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const llm = await getLLMById(input.id);
      if (!llm) {
        throw new Error("LLM not found");
      }

      // Get latest version for each environment
      const [sandboxVersion, governedVersion, productionVersion, allVersions] = await Promise.all([
        getLatestCallableVersion(input.id, "sandbox"),
        getLatestCallableVersion(input.id, "governed"),
        getLatestCallableVersion(input.id, "production"),
        getLLMVersions(input.id),
      ]);

      return {
        ...llm,
        latestVersions: {
          sandbox: sandboxVersion,
          governed: governedVersion,
          production: productionVersion,
        },
        versionCount: allVersions.length,
      };
    }),

  /**
   * Archive an LLM
   */
  archive: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await archiveLLM(input.id, ctx.user.id);
      return { success: true };
    }),

  // ============================================================================
  // LLM Version Management
  // ============================================================================

  /**
   * Create a new LLM version
   */
  createVersion: protectedProcedure
    .input(createVersionSchema)
    .mutation(async ({ ctx, input }) => {
      const version = await createLLMVersion({
        ...input,
        createdBy: ctx.user.id,
        policyDecision: "pass", // Will be updated by policy service
        attestationStatus: "pending",
        driftStatus: "none",
        callable: input.environment === "sandbox", // Sandbox versions start callable
      });

      return version;
    }),

  /**
   * Get all versions for an LLM
   */
  getVersions: protectedProcedure
    .input(z.object({ llmId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const versions = await getLLMVersions(input.llmId);
      return versions;
    }),

  /**
   * Get specific version details
   */
  getVersion: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const version = await getLLMVersion(input.versionId);
      if (!version) {
        throw new Error("Version not found");
      }
      return version;
    }),

  /**
   * Update version callable status
   */
  updateCallable: protectedProcedure
    .input(
      z.object({
        versionId: z.number().int().positive(),
        callable: z.boolean(),
        reason: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await updateLLMVersionCallable(input.versionId, input.callable, input.reason);
      return { success: true };
    }),

  // ============================================================================
  // Promotion Workflow
  // ============================================================================

  /**
   * Create a promotion request
   */
  createPromotion: protectedProcedure
    .input(createPromotionSchema)
    .mutation(async ({ ctx, input }) => {
      // Validate promotion path
      const validPaths = [
        { from: "sandbox", to: "governed" },
        { from: "governed", to: "production" },
        { from: "sandbox", to: "production" }, // Direct promotion (may require special approval)
      ];

      const isValidPath = validPaths.some(
        (path) => path.from === input.fromEnvironment && path.to === input.toEnvironment
      );

      if (!isValidPath) {
        throw new Error(`Invalid promotion path: ${input.fromEnvironment} → ${input.toEnvironment}`);
      }

      const promotion = await createPromotion({
        ...input,
        requestedBy: ctx.user.id,
        status: "pending",
      });

      return promotion;
    }),

  /**
   * List promotions (with filters)
   */
  listPromotions: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "simulated", "approved", "rejected", "executed", "failed"]).optional(),
        llmVersionId: z.number().int().positive().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const promotions = await getPromotions(input);
      return promotions;
    }),

  /**
   * Approve a promotion
   */
  approvePromotion: protectedProcedure
    .input(
      z.object({
        promotionId: z.number().int().positive(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await approvePromotion(input.promotionId, ctx.user.id, input.comment);
      return { success: true };
    }),

  /**
   * Reject a promotion
   */
  rejectPromotion: protectedProcedure
    .input(
      z.object({
        promotionId: z.number().int().positive(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await rejectPromotion(input.promotionId, ctx.user.id, input.reason);
      return { success: true };
    }),

  /**
   * Execute an approved promotion (creates new version in target environment)
   */
  executePromotion: protectedProcedure
    .input(z.object({ promotionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [promotion] = await getPromotions({ llmVersionId: input.promotionId });

      if (!promotion) {
        throw new Error("Promotion not found");
      }

      if (promotion.status !== "approved") {
        throw new Error("Promotion must be approved before execution");
      }

      // Get source version
      const sourceVersion = await getLLMVersion(promotion.llmVersionId);
      if (!sourceVersion) {
        throw new Error("Source version not found");
      }

      // Create new version in target environment
      const newVersion = await createLLMVersion({
        llmId: sourceVersion.llmId,
        environment: promotion.toEnvironment,
        config: sourceVersion.config,
        policyBundleRef: sourceVersion.policyBundleRef,
        policyHash: sourceVersion.policyHash,
        policyDecision: sourceVersion.policyDecision,
        policyViolations: sourceVersion.policyViolations,
        attestationContract: sourceVersion.attestationContract,
        attestationStatus: "pending", // Needs new attestation in target env
        driftStatus: "none",
        callable: false, // Requires attestation before becoming callable
        createdBy: ctx.user.id,
        changeNotes: `Promoted from ${promotion.fromEnvironment} (promotion #${promotion.id})`,
        promotionRequestId: promotion.id,
      });

      // Update promotion status
      const db = await import("../db").then((m) => m.getDb());
      if (db) {
        await db().update(await import("../../drizzle/schema").then((m) => m.llmPromotions))
          .set({
            status: "executed",
            executedAt: new Date(),
            newVersionId: newVersion.id,
          })
          .where(await import("drizzle-orm").then((m) => m.eq)(
            (await import("../../drizzle/schema")).llmPromotions.id,
            promotion.id
          ));
      }

      return { success: true, newVersion };
    }),

  // ============================================================================
  // Audit & Compliance
  // ============================================================================

  /**
   * Get audit events for an LLM
   */
  getAuditEvents: protectedProcedure
    .input(
      z.object({
        llmId: z.number().int().positive().optional(),
        llmVersionId: z.number().int().positive().optional(),
        eventType: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional().default(100),
      })
    )
    .query(async ({ input }) => {
      const events = await getLLMAuditEvents(input);
      return events;
    }),

  // ============================================================================
  // Dashboard Statistics
  // ============================================================================

  /**
   * Get LLM Control Plane dashboard stats
   */
  getDashboardStats: protectedProcedure.query(async () => {
    const llms = await getLLMs({ archived: false });

    const stats = {
      totalLLMs: llms.length,
      byRole: {
        planner: llms.filter((l) => l.role === "planner").length,
        executor: llms.filter((l) => l.role === "executor").length,
        router: llms.filter((l) => l.role === "router").length,
        guard: llms.filter((l) => l.role === "guard").length,
        observer: llms.filter((l) => l.role === "observer").length,
        embedder: llms.filter((l) => l.role === "embedder").length,
      },
      byEnvironment: {
        sandbox: 0,
        governed: 0,
        production: 0,
      },
      attestationStatus: {
        attested: 0,
        pending: 0,
        failed: 0,
      },
      recentActivity: await getLLMAuditEvents({ limit: 10 }),
    };

    // Count versions by environment
    for (const llm of llms) {
      const versions = await getLLMVersions(llm.id);
      for (const version of versions) {
        stats.byEnvironment[version.environment]++;
        if (version.attestationStatus === "attested") {
          stats.attestationStatus.attested++;
        } else if (version.attestationStatus === "failed" || version.attestationStatus === "revoked") {
          stats.attestationStatus.failed++;
        } else {
          stats.attestationStatus.pending++;
        }
      }
    }

    return stats;
  }),

  // ============================================================================
  // Policy Validation
  // ============================================================================

  /**
   * Validate LLM configuration against policies
   * Returns policy decision and any violations/warnings
   */
  validatePolicy: protectedProcedure
    .input(
      z.object({
        identity: z.object({
          name: z.string(),
          role: llmRoleSchema,
          ownerTeam: z.string().optional(),
        }),
        configuration: llmConfigSchema,
        environment: environmentSchema.optional().default("sandbox"),
      })
    )
    .mutation(async ({ input }) => {
      const result = LLMPolicyEngine.evaluate({
        identity: {
          name: input.identity.name,
          role: input.identity.role,
          ownerTeam: input.identity.ownerTeam,
        },
        configuration: input.configuration,
        environment: input.environment,
      });

      return result;
    }),
});
