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
  updateLLM,
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
import * as providers from "../llm/providers";
import { jobQueue } from "../services/job-queue";
import "../services/training-executor"; // Initialize training executor

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

const updateLLMSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  role: llmRoleSchema.optional(),
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
      // Ensure user is authenticated
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      console.log('[LLM Create] User ID:', ctx.user.id, 'Input:', input);

      const insertData = {
        name: input.name,
        description: input.description || null,
        role: input.role,
        ownerTeam: input.ownerTeam || null,
        createdBy: ctx.user.id,
      };

      console.log('[LLM Create] Insert data:', insertData);

      const llm = await createLLM(insertData);

      return llm;
    }),

  /**
   * Update an existing LLM
   */
  update: protectedProcedure
    .input(updateLLMSchema)
    .mutation(async ({ ctx, input }) => {
      // Ensure user is authenticated
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      const { id, ...updateData } = input;

      console.log('[LLM Update] User ID:', ctx.user.id, 'LLM ID:', id, 'Data:', updateData);

      const llm = await updateLLM(id, updateData, ctx.user.id);

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
      const { getDb } = await import("../db");
      const { llmPromotions } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = getDb();
      if (db) {
        await db.update(llmPromotions)
          .set({
            status: "executed",
            executedAt: new Date(),
            newVersionId: newVersion.id,
          })
          .where(eq(llmPromotions.id, promotion.id));
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
      const result = await LLMPolicyEngine.evaluate({
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

  // ============================================================================
  // Provider Registry
  // ============================================================================

  /**
   * List all available LLM providers from MultiChat
   * Returns 14 providers: Anthropic, OpenAI, Google, Meta, etc.
   */
  listProviders: protectedProcedure.query(async () => {
    return providers.getAllProviders();
  }),

  /**
   * Get a specific provider by ID
   */
  getProvider: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input }) => {
      const provider = providers.getProvider(input.id);
      if (!provider) {
        throw new Error(`Provider not found: ${input.id}`);
      }
      return provider;
    }),

  /**
   * Get models for a specific provider
   */
  getProviderModels: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
      })
    )
    .query(async ({ input }) => {
      return providers.getProviderModels(input.providerId);
    }),

  /**
   * List all provider presets
   * Returns 5 presets: coding, creative, research, general, fast
   */
  listPresets: protectedProcedure.query(async () => {
    return providers.getAllPresets();
  }),

  /**
   * Get a specific preset by ID
   */
  getPreset: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input }) => {
      const preset = providers.getPreset(input.id);
      if (!preset) {
        throw new Error(`Preset not found: ${input.id}`);
      }
      return preset;
    }),

  // ============================================================================
  // Provider Configuration & Testing
  // ============================================================================

  /**
   * Test provider connection with credentials
   * Validates API key and connectivity
   */
  testProviderConnection: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        credentials: z.object({
          apiKey: z.string().optional(),
          endpoint: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const { testProviderConnection } = await import("../llm/provider-test");
      return await testProviderConnection(input.providerId, input.credentials);
    }),

  /**
   * Configure provider credentials (encrypted storage)
   * Stores API keys securely with encryption
   */
  configureProvider: protectedProcedure
    .input(
      z.object({
        dbProviderId: z.number(), // The database provider ID
        providerId: z.string(), // The provider type (openai, anthropic, etc.)
        credentials: z.object({
          apiKey: z.string().optional(),
          apiSecret: z.string().optional(),
          endpoint: z.string().optional(),
          organizationId: z.string().optional(),
          projectId: z.string().optional(),
        }),
        setAsDefault: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { storeProviderCredentials } = await import("../llm/provider-credentials");

      // Store encrypted credentials
      await storeProviderCredentials(input.dbProviderId, input.credentials);

      // If setting as default, update user preferences
      if (input.setAsDefault) {
        // TODO: Store user's default provider preference
        console.log(`[LLM Router] Set provider ${input.providerId} as default for user ${ctx.user.id}`);
      }

      return {
        success: true,
        message: "Provider configured successfully",
      };
    }),

  /**
   * Get provider credentials (masked for security)
   */
  getProviderCredentials: protectedProcedure
    .input(
      z.object({
        dbProviderId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const { getProviderCredentials, maskCredential } = await import("../llm/provider-credentials");

      const credentials = await getProviderCredentials(input.dbProviderId);

      if (!credentials) {
        return null;
      }

      // Mask sensitive fields before returning
      return {
        apiKey: credentials.apiKey ? maskCredential(credentials.apiKey) : undefined,
        apiSecret: credentials.apiSecret ? maskCredential(credentials.apiSecret) : undefined,
        endpoint: credentials.endpoint,
        organizationId: credentials.organizationId,
        projectId: credentials.projectId,
      };
    }),

  /**
   * Delete provider credentials
   */
  deleteProviderCredentials: protectedProcedure
    .input(
      z.object({
        dbProviderId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const { deleteProviderCredentials } = await import("../llm/provider-credentials");

      await deleteProviderCredentials(input.dbProviderId);

      return {
        success: true,
        message: "Credentials deleted successfully",
      };
    }),

  // ============================================================================
  // Provider Installation & Model Management
  // ============================================================================

  /**
   * Check if a local provider (e.g., Ollama) is installed
   * Returns installation status and installed models
   */
  checkProviderInstallation: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { checkProviderInstallation } = await import("../llm/provider-installation");
      return await checkProviderInstallation(input.providerId);
    }),

  /**
   * Get installation instructions for a provider
   * Returns OS-specific download URLs and step-by-step instructions
   */
  getInstallationInstructions: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { getInstallationInstructions } = await import("../llm/provider-installation");
      return getInstallationInstructions(input.providerId);
    }),

  /**
   * Get list of available models for a provider
   * Returns models from provider's library/catalog
   */
  getAvailableModels: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { getAvailableModels } = await import("../llm/provider-installation");
      return await getAvailableModels(input.providerId);
    }),

  /**
   * Get list of installed models for a local provider
   * Only works for providers that are already installed
   */
  getInstalledModels: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { getInstalledModels } = await import("../llm/provider-installation");
      return await getInstalledModels(input.providerId);
    }),

  /**
   * Get command to download a model for a local provider
   * Returns command and instructions for user to execute
   */
  downloadModel: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        modelId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { downloadModel } = await import("../llm/provider-installation");
      return await downloadModel(input.providerId, input.modelId);
    }),

  /**
   * Get command to remove a model from a local provider
   * Returns command and instructions for user to execute
   */
  removeModel: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        modelId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { removeModel } = await import("../llm/provider-installation");
      return await removeModel(input.providerId, input.modelId);
    }),

  // ============================================================================
  // Device Detection & Compatibility
  // ============================================================================

  /**
   * Get current device specifications
   * Returns RAM, CPU, GPU, disk space, and OS information
   */
  getDeviceSpecs: protectedProcedure.query(async () => {
    const { detectDeviceSpecs } = await import("../llm/device-detection");
    return await detectDeviceSpecs();
  }),

  /**
   * Check if device is compatible with a specific model
   * Returns compatibility status, warnings, and recommendations
   */
  checkModelCompatibility: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        modelId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { detectDeviceSpecs, checkCompatibility } = await import("../llm/device-detection");
      const { getProvider } = await import("../llm/providers");

      const provider = getProvider(input.providerId);
      if (!provider) {
        throw new Error(`Provider not found: ${input.providerId}`);
      }

      const model = provider.models.find((m) => m.id === input.modelId);
      if (!model) {
        throw new Error(`Model not found: ${input.modelId}`);
      }

      if (!model.systemRequirements) {
        return {
          compatible: true,
          warnings: [],
          errors: [],
          recommendations: [],
          deviceSpecs: await detectDeviceSpecs(),
          requirements: null,
        };
      }

      const deviceSpecs = await detectDeviceSpecs();
      return checkCompatibility(deviceSpecs, model.systemRequirements);
    }),

  // ============================================================================
  // LLM Creation & Training Pipeline
  // Following "COMPLETE LLM CREATION GUIDE" methodology
  // ============================================================================

  /**
   * Create a new LLM creation project
   * Phase 0-1: Target specification and path selection
   */
  createCreationProject: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        path: z.enum(["PATH_A", "PATH_B"]),
        target: z.object({
          useCase: z.string(),
          deployment: z.string(),
          maxModelSize: z.string(),
          contextLength: z.string(),
          allowedData: z.string(),
        }),
        baseModel: z
          .object({
            name: z.string(),
            ollamaTag: z.string().optional(),
            hfRepo: z.string().optional(),
            size: z.string().optional(),
            license: z.string().optional(),
            context: z.number().optional(),
            rationale: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { insertInto, getDb } = await import("../db");
      const { llmCreationProjects, llmCreationAuditEvents } = await import("../../drizzle/schema");
      const { sql } = await import("drizzle-orm");

      // Ensure the table exists (migration may not have run)
      const db = getDb();
      if (!db) throw new Error("Database not available");
      try {
        await db.execute(sql`SELECT 1 FROM llm_creation_projects LIMIT 0`);
      } catch {
        // Table doesn't exist — create it inline
        console.log("[LLM Create] Table llm_creation_projects missing, creating...");
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS "llm_creation_projects" (
            "id" serial PRIMARY KEY,
            "name" varchar(255) NOT NULL,
            "description" text,
            "path" varchar(10) NOT NULL,
            "target" json NOT NULL,
            "baseModel" json,
            "status" varchar(50) NOT NULL DEFAULT 'draft',
            "currentPhase" varchar(50),
            "progress" integer DEFAULT 0,
            "finalModelPath" varchar(512),
            "ollamaModelName" varchar(255),
            "deploymentStatus" varchar(50),
            "llmId" integer,
            "createdBy" integer NOT NULL,
            "createdAt" timestamp DEFAULT now() NOT NULL,
            "updatedAt" timestamp DEFAULT now() NOT NULL,
            "completedAt" timestamp
          )
        `);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS "llm_creation_audit_events" (
            "id" serial PRIMARY KEY,
            "eventType" varchar(100) NOT NULL,
            "projectId" integer NOT NULL,
            "actor" integer NOT NULL,
            "phase" varchar(50),
            "action" varchar(100) NOT NULL,
            "payload" json,
            "status" varchar(50) NOT NULL DEFAULT 'success',
            "errorMessage" text,
            "createdAt" timestamp DEFAULT now() NOT NULL
          )
        `);
        console.log("[LLM Create] Tables created successfully");
      }

      const [project] = await insertInto(llmCreationProjects)
        .values({
          name: input.name,
          description: input.description,
          path: input.path,
          target: input.target,
          baseModel: input.baseModel || null,
          status: "draft",
          currentPhase: "phase_0_planning",
          createdBy: ctx.user.id,
        })
        .returning();

      // Audit event
      try {
        await insertInto(llmCreationAuditEvents).values({
          eventType: "project.created",
          projectId: project.id,
          actor: ctx.user.id,
          phase: "phase_0_planning",
          action: "create_project",
          payload: { name: input.name, path: input.path, target: input.target },
          status: "success",
        });
      } catch (e) {
        console.warn("[LLM Create] Audit event insert failed:", e);
      }

      return project;
    }),

  /**
   * List all creation projects for current user
   */
  listCreationProjects: protectedProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          path: z.enum(["PATH_A", "PATH_B"]).optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const { db } = await import("../db");
      const { llmCreationProjects } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      const conditions = [eq(llmCreationProjects.createdBy, ctx.user.id)];

      if (input?.status) {
        conditions.push(eq(llmCreationProjects.status, input.status));
      }

      if (input?.path) {
        conditions.push(eq(llmCreationProjects.path, input.path));
      }

      return await db.select().from(llmCreationProjects).where(and(...conditions));
    }),

  /**
   * Get a single creation project with all related data
   */
  getCreationProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { db } = await import("../db");
      const {
        llmCreationProjects,
        llmDatasets,
        llmTrainingRuns,
        llmEvaluations,
        llmQuantizations
      } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [project] = await db
        .select()
        .from(llmCreationProjects)
        .where(eq(llmCreationProjects.id, input.projectId));

      if (!project) {
        throw new Error("Project not found");
      }

      // Fetch related data
      const datasets = await db
        .select()
        .from(llmDatasets)
        .where(eq(llmDatasets.projectId, input.projectId));

      const trainingRuns = await db
        .select()
        .from(llmTrainingRuns)
        .where(eq(llmTrainingRuns.projectId, input.projectId));

      const evaluations = await db
        .select()
        .from(llmEvaluations)
        .where(eq(llmEvaluations.projectId, input.projectId));

      const quantizations = await db
        .select()
        .from(llmQuantizations)
        .where(eq(llmQuantizations.projectId, input.projectId));

      return {
        project,
        datasets,
        trainingRuns,
        evaluations,
        quantizations,
      };
    }),

  /**
   * Update creation project
   */
  updateCreationProject: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        status: z.string().optional(),
        currentPhase: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
        baseModel: z.any().optional(),
        finalModelPath: z.string().optional(),
        ollamaModelName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, updateTable, eq } = await import("../db");
      const { llmCreationProjects, llmCreationAuditEvents } = await import("../../drizzle/schema");

      const { projectId, ...updates } = input;

      const [updated] = await updateTable(llmCreationProjects)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(llmCreationProjects.id, projectId))
        .returning();

      // Audit event
      const { insertInto } = await import("../db");
      await insertInto(llmCreationAuditEvents).values({
        eventType: "project.updated",
        projectId: projectId,
        actor: ctx.user.id,
        phase: updates.currentPhase || "unknown",
        action: "update_project",
        payload: updates,
        status: "success",
      });

      return updated;
    }),

  /**
   * Upload and create a dataset
   * Phase 2: Dataset creation
   */
  createDataset: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        name: z.string().min(1).max(255),
        type: z.enum(["sft", "dpo", "eval", "pretrain"]),
        source: z.enum(["upload", "synthetic", "public", "mixed"]).optional(),
        format: z.enum(["jsonl", "csv", "parquet"]),
        filePath: z.string().max(512),
        fileSize: z.number().optional(),
        recordCount: z.number().optional(),
        tokenCount: z.number().optional(),
        stats: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, insertInto } = await import("../db");
      const { llmDatasets, llmCreationAuditEvents } = await import("../../drizzle/schema");

      const [dataset] = await insertInto(llmDatasets)
        .values({
          ...input,
          status: "pending",
          createdBy: ctx.user.id,
        })
        .returning();

      // Audit event
      await insertInto(llmCreationAuditEvents).values({
        eventType: "dataset.created",
        projectId: input.projectId,
        datasetId: dataset.id,
        actor: ctx.user.id,
        phase: "phase_2_dataset",
        action: "create_dataset",
        payload: { name: input.name, type: input.type, format: input.format },
        status: "success",
      });

      return dataset;
    }),

  /**
   * Update dataset status and validation
   */
  updateDataset: protectedProcedure
    .input(
      z.object({
        datasetId: z.number(),
        status: z.string().optional(),
        validated: z.boolean().optional(),
        validationErrors: z.any().optional(),
        qualityScore: z.number().optional(),
        qualityChecks: z.any().optional(),
        stats: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, updateTable, eq } = await import("../db");
      const { llmDatasets } = await import("../../drizzle/schema");

      const { datasetId, qualityScore, ...updates } = input;

      const [updated] = await updateTable(llmDatasets)
        .set({
          ...updates,
          qualityScore: qualityScore?.toString(),
          updatedAt: new Date()
        })
        .where(eq(llmDatasets.id, datasetId))
        .returning();

      return updated;
    }),

  /**
   * Start a training run
   * Phase 3-5: SFT, DPO, Tool Tuning
   */
  startTraining: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        trainingType: z.enum(["sft", "dpo", "tool_tuning", "pretrain"]),
        phase: z.string(),
        config: z.any(),
        datasetIds: z.array(z.number()),
        framework: z.enum(["huggingface", "deepspeed", "megatron", "ollama"]).optional(),
        accelerator: z.enum(["cpu", "cuda", "tpu"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, insertInto } = await import("../db");
      const { llmTrainingRuns, llmCreationAuditEvents } = await import("../../drizzle/schema");
      const crypto = await import("crypto");

      const configHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(input.config))
        .digest("hex");

      const [trainingRun] = await insertInto(llmTrainingRuns)
        .values({
          projectId: input.projectId,
          trainingType: input.trainingType,
          phase: input.phase,
          config: input.config,
          configHash,
          datasetIds: input.datasetIds,
          framework: input.framework || "huggingface",
          accelerator: input.accelerator || "cpu",
          status: "pending",
          createdBy: ctx.user.id,
        })
        .returning();

      // Audit event
      await insertInto(llmCreationAuditEvents).values({
        eventType: "training.started",
        projectId: input.projectId,
        trainingRunId: trainingRun.id,
        actor: ctx.user.id,
        phase: input.phase,
        action: "start_training",
        payload: { trainingType: input.trainingType, framework: input.framework },
        status: "success",
      });

      // Enqueue training job for background execution
      const job = await jobQueue.enqueue(
        "training",
        {
          trainingRunId: trainingRun.id,
          config: input.config,
          datasetIds: input.datasetIds,
          framework: input.framework,
        },
        {
          projectId: input.projectId,
          trainingRunId: trainingRun.id,
          userId: ctx.user.id,
        }
      );

      console.log(`[LLM Router] Training job ${job.id} enqueued for training run ${trainingRun.id}`);

      return { ...trainingRun, jobId: job.id };
    }),

  /**
   * Update training run progress
   */
  updateTrainingRun: protectedProcedure
    .input(
      z.object({
        trainingRunId: z.number(),
        status: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
        currentStep: z.number().optional(),
        totalSteps: z.number().optional(),
        metrics: z.any().optional(),
        finalLoss: z.number().optional(),
        checkpointPath: z.string().optional(),
        loraAdapterPath: z.string().optional(),
        logs: z.string().optional(),
        errorMessage: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, updateTable, eq } = await import("../db");
      const { llmTrainingRuns } = await import("../../drizzle/schema");

      const { trainingRunId, ...updates } = input;

      const updateData: any = { ...updates, updatedAt: new Date() };

      if (updates.status === "completed") {
        updateData.completedAt = new Date();
      } else if (updates.status === "failed") {
        updateData.failedAt = new Date();
      } else if (updates.status === "running" && !updateData.startedAt) {
        updateData.startedAt = new Date();
      }

      const [updated] = await updateTable(llmTrainingRuns)
        .set(updateData)
        .where(eq(llmTrainingRuns.id, trainingRunId))
        .returning();

      return updated;
    }),

  /**
   * Create evaluation
   * Phase 6: Evaluation
   */
  createEvaluation: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        trainingRunId: z.number().optional(),
        modelPath: z.string().max(512),
        modelType: z.enum(["base", "sft", "dpo", "quantized"]),
        evalDatasetId: z.number().optional(),
        benchmarks: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, insertInto } = await import("../db");
      const { llmEvaluations, llmCreationAuditEvents } = await import("../../drizzle/schema");

      const [evaluation] = await insertInto(llmEvaluations)
        .values({
          ...input,
          results: {},
          status: "pending",
          createdBy: ctx.user.id,
        })
        .returning();

      // Audit event
      await insertInto(llmCreationAuditEvents).values({
        eventType: "evaluation.created",
        projectId: input.projectId,
        evaluationId: evaluation.id,
        actor: ctx.user.id,
        phase: "phase_6_evaluation",
        action: "create_evaluation",
        payload: { modelType: input.modelType, benchmarks: input.benchmarks },
        status: "success",
      });

      // Enqueue evaluation job for background execution
      const job = await jobQueue.enqueue(
        "evaluation",
        {
          evaluationId: evaluation.id,
          modelPath: input.modelPath,
          modelType: input.modelType,
          benchmarks: input.benchmarks || ["mmlu", "hellaswag", "arc", "truthfulqa", "gsm8k"],
        },
        {
          projectId: input.projectId,
          evaluationId: evaluation.id,
          userId: ctx.user.id,
        }
      );

      console.log(`[LLM Router] Evaluation job ${job.id} enqueued for evaluation ${evaluation.id}`);

      return { ...evaluation, jobId: job.id };
    }),

  /**
   * Update evaluation results
   */
  updateEvaluation: protectedProcedure
    .input(
      z.object({
        evaluationId: z.number(),
        status: z.string().optional(),
        results: z.any().optional(),
        overallScore: z.number().optional(),
        taskAccuracy: z.number().optional(),
        formatCorrectness: z.number().optional(),
        refusalCorrectness: z.number().optional(),
        latency: z.number().optional(),
        throughput: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, updateTable, eq } = await import("../db");
      const { llmEvaluations } = await import("../../drizzle/schema");

      const { evaluationId, ...updates } = input;

      const updateData: any = { updatedAt: new Date() };

      // Copy non-numeric fields directly
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.results !== undefined) updateData.results = updates.results;

      // Convert numeric fields to strings for Drizzle numeric columns
      if (updates.overallScore !== undefined) updateData.overallScore = String(updates.overallScore);
      if (updates.taskAccuracy !== undefined) updateData.taskAccuracy = String(updates.taskAccuracy);
      if (updates.formatCorrectness !== undefined) updateData.formatCorrectness = String(updates.formatCorrectness);
      if (updates.refusalCorrectness !== undefined) updateData.refusalCorrectness = String(updates.refusalCorrectness);
      if (updates.throughput !== undefined) updateData.throughput = String(updates.throughput);

      // latency is integer column — truncate to int
      if (updates.latency !== undefined) updateData.latency = Math.round(updates.latency);

      if (updates.status === "completed") {
        updateData.completedAt = new Date();
      }

      const [updated] = await updateTable(llmEvaluations)
        .set(updateData)
        .where(eq(llmEvaluations.id, evaluationId))
        .returning();

      return updated;
    }),

  /**
   * Start quantization
   * Phase 7: Quantization and GGUF conversion
   */
  startQuantization: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        sourceTrainingRunId: z.number().optional(),
        sourceModelPath: z.string().max(512),
        quantizationType: z.enum(["Q4_K_M", "Q5_K_M", "Q8_0", "Q2_K", "f16"]),
        method: z.enum(["llama.cpp", "gptq", "awq"]).optional(),
        outputPath: z.string().max(512).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, insertInto } = await import("../db");
      const { llmQuantizations, llmCreationAuditEvents } = await import("../../drizzle/schema");

      const [quantization] = await insertInto(llmQuantizations)
        .values({
          ...input,
          method: input.method || "llama.cpp",
          outputFormat: "gguf",
          status: "pending",
          createdBy: ctx.user.id,
        })
        .returning();

      // Audit event
      await insertInto(llmCreationAuditEvents).values({
        eventType: "quantization.started",
        projectId: input.projectId,
        quantizationId: quantization.id,
        actor: ctx.user.id,
        phase: "phase_7_quantization",
        action: "start_quantization",
        payload: { quantizationType: input.quantizationType, method: input.method },
        status: "success",
      });

      // Enqueue quantization job for background execution
      const job = await jobQueue.enqueue(
        "quantization",
        {
          quantizationId: quantization.id,
          sourceModelPath: input.sourceModelPath,
          quantizationType: input.quantizationType,
          method: input.method || "llama.cpp",
          outputPath: input.outputPath,
        },
        {
          projectId: input.projectId,
          quantizationId: quantization.id,
          userId: ctx.user.id,
        }
      );

      console.log(`[LLM Router] Quantization job ${job.id} enqueued for quantization ${quantization.id}`);

      return { ...quantization, jobId: job.id };
    }),

  /**
   * Update quantization status
   */
  updateQuantization: protectedProcedure
    .input(
      z.object({
        quantizationId: z.number(),
        status: z.string().optional(),
        outputPath: z.string().optional(),
        fileSize: z.number().optional(),
        accuracyDrop: z.number().optional(),
        compressionRatio: z.number().optional(),
        logs: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, updateTable, eq } = await import("../db");
      const { llmQuantizations } = await import("../../drizzle/schema");

      const { quantizationId, ...updates } = input;

      const updateData: any = { ...updates };

      if (updates.status === "completed") {
        updateData.completedAt = new Date();
      }

      const [updated] = await updateTable(llmQuantizations)
        .set(updateData)
        .where(eq(llmQuantizations.id, quantizationId))
        .returning();

      return updated;
    }),

  /**
   * Get audit trail for a creation project
   */
  getCreationAuditTrail: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const { db } = await import("../db");
      const { llmCreationAuditEvents } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");

      return await db
        .select()
        .from(llmCreationAuditEvents)
        .where(eq(llmCreationAuditEvents.projectId, input.projectId))
        .orderBy(desc(llmCreationAuditEvents.timestamp));
    }),

  // ============================================================================
  // Job Queue & Training Orchestration
  // ============================================================================

  /**
   * Get job status by ID
   */
  getJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = jobQueue.getJob(input.jobId);
      if (!job) {
        throw new Error("Job not found");
      }
      return job;
    }),

  /**
   * Get all jobs (with optional filters)
   */
  listJobs: protectedProcedure
    .input(
      z
        .object({
          type: z.enum(["training", "evaluation", "quantization", "dataset_validation"]).optional(),
          status: z.enum(["pending", "running", "completed", "failed", "cancelled"]).optional(),
          projectId: z.number().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      let jobs = jobQueue.getJobs({
        type: input?.type,
        status: input?.status,
      });

      // Filter by projectId if provided
      if (input?.projectId) {
        jobs = jobs.filter((job) => job.metadata?.projectId === input.projectId);
      }

      return jobs;
    }),

  /**
   * Cancel a running or pending job
   */
  cancelJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input }) => {
      const job = await jobQueue.cancelJob(input.jobId);
      return { success: true, job };
    }),

  /**
   * Get job queue statistics
   */
  getQueueStats: protectedProcedure.query(async () => {
    return jobQueue.getStats();
  }),

  /**
   * Pause a running training job
   * Note: This is a placeholder - actual pause/resume requires deeper integration
   */
  pauseTraining: protectedProcedure
    .input(z.object({ trainingRunId: z.number() }))
    .mutation(async ({ input }) => {
      // Find job by training run ID
      const jobs = jobQueue.getJobs({ type: "training", status: "running" });
      const job = jobs.find((j) => j.metadata?.trainingRunId === input.trainingRunId);

      if (!job) {
        throw new Error("Training job not found or not running");
      }

      // For now, just cancel it (pause/resume requires more complex state management)
      await jobQueue.cancelJob(job.id);

      return { success: true, message: "Training paused (cancelled)" };
    }),
});
