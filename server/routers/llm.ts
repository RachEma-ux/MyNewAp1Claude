/**
 * GOVERNANCE CONTRACT (LOCKED)
 *
 * This module participates in the AI Types governance system.
 *
 * Invariants:
 * - Catalog owns intake and lifecycle
 * - Domain creates entities but does NOT create catalog_entries
 * - Runtime authority comes ONLY from Catalog
 * - Availability must use shared authority rules
 *
 * Any change must preserve these invariants.
 * See: docs/architecture/AI_TYPES_GOVERNANCE_STANDARD.md
 */

/**
 * LLM Control Plane Router
 *
 * Provides tRPC endpoints for managing LLMs, versions, and promotions
 * Following RFC-001 specifications for governed, auditable LLM lifecycle
 *
 * ===== REFERENCE IMPLEMENTATION =====
 * This router is the canonical governance pattern for all governed domains.
 * Other domain routers (agents, models, bots, providers) should follow:
 * - governedProcedure on all mutations
 * - blocking `await getAuditLogger().log()` on critical mutations
 * - LLMPolicyEngine.evaluate() or domain-specific policy evaluation
 * - Catalog onboarding for runtime authority
 * - Promotion workflow with approval gates
 *
 * Sub-routers (merged via spread to keep flat namespace):
 *  - llm-providers.ts: Provider registry, policy validation, device detection
 *  - llm-creation.ts: LLM creation & training pipeline
 */

import { z } from "zod";
import { protectedProcedure, governedProcedure, router } from "../_core/trpc";
import {
  createLLM,
  updateLLM,
  getLLMs,
  getLLMById,
  archiveLLM,
  createLLMVersion,
  getLLMVersions,
  getAllLLMVersions,
  getLLMVersion,
  getLatestCatalogEligibleVersion,
  updateLLMVersionCallable,
  createPromotion,
  getPromotions,
  approvePromotion,
  rejectPromotion,
  executePromotion as executeLLMPromotion,
  getLLMAuditEvents,
} from "../db";
import { getAuditLogger } from "../services/auditLogger";
import { warnLegacyImportToCatalog } from "../governance/legacy-import-to-catalog-deprecation";
import "../services/training-executor"; // Initialize training executor

import { llmProvidersProcedures } from "./llm-providers";
import { llmCreationProcedures } from "./llm-creation";
import {
  onboardLLMVersionToCatalogCandidate,
  resolveCatalogLLMRuntimeAuthority,
} from "../llm/authority";
import {
  createCatalogEntry,
  getCatalogEntries,
  createCatalogAuditEvent,
  getTaxonomyNodes,
  setEntryClassifications,
} from "../ai-types/public-api";

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
    provider: z.string().optional(), // Legacy string reference (backward compat)
    providerId: z.number().int().positive().optional(), // FK to providers table
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

const onboardCatalogSchema = z.object({
  versionId: z.number().int().positive(),
  displayName: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
});

// ============================================================================
// LLM Registry Router
// ============================================================================

export const llmRouter = router({
  // ============================================================================
  // LLM Identity Management
  // ============================================================================

  create: governedProcedure
    .input(createLLMSchema)
    .mutation(async ({ ctx, input }) => {
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

  update: governedProcedure
    .input(updateLLMSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new Error("User not authenticated");
      }

      const { id, ...updateData } = input;

      console.log('[LLM Update] User ID:', ctx.user.id, 'LLM ID:', id, 'Data:', updateData);

      const llm = await updateLLM(id, updateData, ctx.user.id);

      return llm;
    }),

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
   * Enriched list: LLMs + per-LLM version summary for list page status computation.
   * Single batch query for versions avoids N+1. Returns summary fields, not full version objects.
   */
  listEnriched: protectedProcedure
    .input(
      z.object({
        role: llmRoleSchema.optional(),
        archived: z.boolean().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const [llms, allVersions] = await Promise.all([
        getLLMs(input),
        getAllLLMVersions(),
      ]);

      // Group versions by llmId
      const versionsByLlmId = new Map<number, typeof allVersions>();
      for (const v of allVersions) {
        const arr = versionsByLlmId.get(v.llmId) ?? [];
        arr.push(v);
        versionsByLlmId.set(v.llmId, arr);
      }

      return llms.map((llm) => {
        const versions = versionsByLlmId.get(llm.id) ?? [];

        const hasPassingPolicy = versions.some(
          (v) => v.policyDecision === "pass" || v.policyDecision === "warn"
        );
        const hasBlockedVersion = versions.some(
          (v) =>
            v.policyDecision === "deny" ||
            v.attestationStatus === "failed" ||
            v.attestationStatus === "revoked"
        );
        let blockedReason: string | null = null;
        if (hasBlockedVersion) {
          const bv = versions.find(
            (v) =>
              v.policyDecision === "deny" ||
              v.attestationStatus === "failed" ||
              v.attestationStatus === "revoked"
          );
          if (bv?.policyDecision === "deny") blockedReason = "Policy denied";
          else if (bv?.attestationStatus === "failed") blockedReason = "Attestation failed";
          else if (bv?.attestationStatus === "revoked") blockedReason = "Attestation revoked";
          else blockedReason = "Governance blocker";
        }

        return {
          ...llm,
          versionSummary: {
            count: versions.length,
            hasPassingPolicy,
            hasBlockedVersion,
            blockedReason,
          },
        };
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const llm = await getLLMById(input.id);
      if (!llm) {
        throw new Error("LLM not found");
      }

      const [sandboxVersion, governedVersion, productionVersion, allVersions] = await Promise.all([
        getLatestCatalogEligibleVersion(input.id, "sandbox"),
        getLatestCatalogEligibleVersion(input.id, "governed"),
        getLatestCatalogEligibleVersion(input.id, "production"),
        getLLMVersions(input.id),
      ]);

      const latestCatalogEligibleVersions = {
        sandbox: sandboxVersion,
        governed: governedVersion,
        production: productionVersion,
      };

      return {
        ...llm,
        latestVersions: latestCatalogEligibleVersions,
        latestCatalogEligibleVersions,
        callableMeaning: "internal_catalog_eligibility_only",
        runtimeAuthority: "catalog_entry",
        versionCount: allVersions.length,
      };
    }),

  archive: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await archiveLLM(input.id, ctx.user.id);
      return { success: true };
    }),

  // ============================================================================
  // LLM Version Management
  // ============================================================================

  createVersion: governedProcedure
    .input(createVersionSchema)
    .mutation(async ({ ctx, input }) => {
      const llm = await getLLMById(input.llmId);
      if (!llm) throw new Error("LLM not found");

      const { LLMPolicyEngine } = await import("../policies/llm-policy-engine");
      const policyResult = await LLMPolicyEngine.evaluate({
        identity: { name: llm.name, role: llm.role },
        configuration: input.config,
        environment: input.environment,
      });

      if (policyResult.decision === "deny") {
        throw new Error("Policy evaluation denied: " + policyResult.violations.map(v => v.message).join("; "));
      }

      // `callable` on llm_versions is an internal catalog eligibility flag, NOT runtime authority.
      // New versions start as callable=false (not catalog-eligible).
      // Catalog eligibility is granted via the promotion workflow or explicit updateCallable.
      // Runtime authority is resolved through the Catalog entry, not this flag.
      const version = await createLLMVersion({
        ...input,
        createdBy: ctx.user.id,
        policyDecision: policyResult.decision === "allow" ? "pass" : "warn",
        policyHash: policyResult.policyHash,
        attestationStatus: "pending",
        driftStatus: "none",
        callable: false,
      });

      // Blocking audit write — version creation is a critical lifecycle event
      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "llm_version",
        target_id: String(version.id),
        decision_result: "success",
        metadata: {
          llmId: input.llmId,
          environment: input.environment,
          policyDecision: policyResult.decision,
          catalogEligible: false,
        },
      });

      return version;
    }),

  getVersions: protectedProcedure
    .input(z.object({ llmId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const versions = await getLLMVersions(input.llmId);
      return versions;
    }),

  getVersion: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const version = await getLLMVersion(input.versionId);
      if (!version) {
        throw new Error("Version not found");
      }
      return version;
    }),

  updateCallable: governedProcedure
    .input(
      z.object({
        versionId: z.number().int().positive(),
        callable: z.boolean(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Non-sandbox versions require the promotion workflow to enable catalog eligibility
      if (input.callable === true) {
        const version = await getLLMVersion(input.versionId);
        if (!version) throw new Error("Version not found");
        if (version.environment !== "sandbox") {
          throw new Error("Non-sandbox versions require the promotion workflow to enable catalog eligibility");
        }
      }

      await updateLLMVersionCallable(input.versionId, input.callable, input.reason, {
        actorId: ctx.user.id,
        actorType: "user",
      });

      // Blocking audit write — catalog eligibility change
      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_CHANGE",
        target_type: "llm_version",
        target_id: String(input.versionId),
        decision_result: "success",
        metadata: { catalogEligible: input.callable, reason: input.reason },
      });

      return { success: true };
    }),

  onboardVersionToCatalog: governedProcedure
    .input(onboardCatalogSchema)
    .mutation(async ({ ctx, input }) => {
      const entry = await onboardLLMVersionToCatalogCandidate({
        llmVersionId: input.versionId,
        actorId: ctx.user.id,
        displayName: input.displayName,
        description: input.description,
      });

      return entry;
    }),

  /**
   * Import a deployable LLM into the Catalog as a candidate.
   * Mirrors the agent pattern: agents.importToCatalog.
   * Takes an LLM ID (not version ID), validates it has deployable versions,
   * creates a catalog entry with entryType "llm", status "draft", reviewState "needs_review".
   * Catalog owns candidate creation — this just hands off the governed LLM.
   *
   * @deprecated Plan v3 Phase 47 — bypasses `aiTypes.catalog.register`.
   * See `docs/architecture/provider-model-binding/LEGACY_PATH_DEPRECATION.md`
   * for the migration recipe. Removal is gated on caller migration (Phase 26.1).
   */
  importToCatalog: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      warnLegacyImportToCatalog("llm.importToCatalog");
      const llm = await getLLMById(input.id);
      if (!llm) throw new Error("LLM not found");

      // Check that the LLM has at least one version with passing policy
      const versions = await getLLMVersions(input.id);
      const hasPassingPolicy = versions.some(
        (v) => v.policyDecision === "pass" || v.policyDecision === "warn"
      );
      const hasBlocker = versions.some(
        (v) => v.policyDecision === "deny" || v.attestationStatus === "failed" || v.attestationStatus === "revoked"
      );

      if (!hasPassingPolicy || hasBlocker) {
        throw new Error(
          "Only deployable LLMs can be imported into the Catalog. " +
          "This LLM must have at least one version with passing policy and no governance blockers."
        );
      }

      // Check for existing catalog entry to prevent duplicates (structured FK first, then legacy)
      const existingEntries = await getCatalogEntries({ entryType: "llm" });
      const duplicate = existingEntries.find((entry) => {
        if (entry.sourceType === "llm" && entry.sourceId === input.id) return true;
        const config = (entry.config as Record<string, any>) || {};
        return config.sourceLLMId === input.id;
      });
      if (duplicate) {
        return { success: true, entry: duplicate, imported: false };
      }

      // Pick the best version (latest with passing policy)
      const bestVersion = versions.find(
        (v) => v.policyDecision === "pass" || v.policyDecision === "warn"
      );

      const config: Record<string, unknown> = {
        sourceLLMId: llm.id,
        sourceLLMVersionId: bestVersion?.id ?? null,
        sourceEnvironment: bestVersion?.environment ?? null,
        runtimeAuthority: "catalog_entry",
        catalogEligible: true,
        callableMeaning: "catalog_candidate_runtime_disabled_until_published_and_activated",
        llmRole: llm.role,
      };

      const entry = await createCatalogEntry({
        name: llm.name,
        displayName: llm.name,
        description: llm.description ?? null,
        entryType: "llm",
        sourceType: "llm",
        sourceId: llm.id,
        scope: "app",
        status: "draft",
        origin: "admin",
        reviewState: "needs_review",
        config,
        tags: ["candidate", "llm", "catalog-import"],
        category: llm.role,
        subCategory: null,
        capabilities: null,
        createdBy: ctx.user.id,
      });

      // Auto-classify
      try {
        const axisNodes = await getTaxonomyNodes({ entryType: "llm", level: "axis" });
        if (axisNodes.length > 0) {
          await setEntryClassifications(entry.id, [axisNodes[0].id]);
        }
      } catch (e: any) {
        console.warn(`[LLM] Auto-classify failed for imported catalog entry ${entry.id}:`, e.message);
      }

      await createCatalogAuditEvent({
        eventType: "catalog.llm.submitted",
        catalogEntryId: entry.id,
        actor: ctx.user.id,
        actorType: "user",
        payload: {
          sourceLLMId: llm.id,
          sourceLLMVersionId: bestVersion?.id ?? null,
          reviewState: "needs_review",
          status: "draft",
        },
      });

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "llm",
        target_id: String(llm.id),
        decision_result: "success",
        metadata: { action: "importToCatalog", catalogEntryId: entry.id },
      });

      return { success: true, entry, imported: true };
    }),

  getCatalogRuntimeAuthority: protectedProcedure
    .input(z.object({ catalogEntryId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const authority = await resolveCatalogLLMRuntimeAuthority(input.catalogEntryId);
      return {
        catalogEntryId: authority.entry.id,
        bundleId: authority.bundle.id,
        sourceLLMId: authority.sourceLLMId,
        sourceLLMVersionId: authority.sourceLLMVersionId,
        runtimeAuthority: "catalog_entry",
        reviewState: authority.entry.reviewState,
        status: authority.entry.status,
      };
    }),

  enforceCatalogRuntimeAuthority: governedProcedure
    .input(z.object({ catalogEntryId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const authority = await resolveCatalogLLMRuntimeAuthority(input.catalogEntryId);
      return {
        catalogEntryId: authority.entry.id,
        bundleId: authority.bundle.id,
        sourceLLMId: authority.sourceLLMId,
        sourceLLMVersionId: authority.sourceLLMVersionId,
        runtimeAuthority: "catalog_entry",
        enforced: true,
      };
    }),

  // ============================================================================
  // Promotion Workflow
  // ============================================================================

  createPromotion: governedProcedure
    .input(createPromotionSchema)
    .mutation(async ({ ctx, input }) => {
      const validPaths = [
        { from: "sandbox", to: "governed" },
        { from: "governed", to: "production" },
        { from: "sandbox", to: "production" },
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

      // Blocking audit write — promotion request is a critical lifecycle event
      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "llm_promotion",
        target_id: String(promotion.id),
        decision_result: "success",
        metadata: {
          llmVersionId: input.llmVersionId,
          fromEnvironment: input.fromEnvironment,
          toEnvironment: input.toEnvironment,
        },
      });

      return promotion;
    }),

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

  approvePromotion: governedProcedure
    .input(
      z.object({
        promotionId: z.number().int().positive(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await approvePromotion(input.promotionId, ctx.user.id, input.comment);

      // Blocking audit write — promotion approval
      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "llm_promotion",
        target_id: String(input.promotionId),
        decision_result: "success",
        metadata: { action: "approve", comment: input.comment },
      });

      return { success: true };
    }),

  rejectPromotion: governedProcedure
    .input(
      z.object({
        promotionId: z.number().int().positive(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await rejectPromotion(input.promotionId, ctx.user.id, input.reason);

      // Blocking audit write — promotion rejection
      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "llm_promotion",
        target_id: String(input.promotionId),
        decision_result: "denied",
        metadata: { action: "reject", reason: input.reason },
      });

      return { success: true };
    }),

  executePromotion: governedProcedure
    .input(z.object({ promotionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      // Guard: fetch promotion to check current status before executing
      const promotions = await getPromotions({ status: undefined });
      const promotion = promotions.find(p => p.id === input.promotionId);
      if (!promotion) throw new Error("Promotion not found");
      if (promotion.status === "executed") {
        throw new Error("Promotion already executed — duplicate execution blocked");
      }
      if (promotion.status !== "approved") {
        throw new Error(`Promotion must be approved before execution (current: ${promotion.status})`);
      }

      const newVersion = await executeLLMPromotion(input.promotionId, ctx.user.id);

      // Blocking audit write — promotion execution
      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "llm_promotion",
        target_id: String(input.promotionId),
        decision_result: "success",
        metadata: { action: "execute", newVersionId: newVersion?.id },
      });

      return { success: true, newVersion };
    }),

  // ============================================================================
  // Audit & Compliance
  // ============================================================================

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

  // Spread in sub-router procedures (flat — preserves all route names)
  ...llmProvidersProcedures,
  ...llmCreationProcedures,
});
