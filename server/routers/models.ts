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
 * Models Router — governed model management (domain-first)
 *
 * Models live in the `models` DB table. The Catalog is a separate concern:
 * `importToCatalog` creates a catalog candidate from a deployable model.
 *
 * Model lifecycle: draft -> ready -> active -> deprecated -> disabled
 * "Deployable" = status is "ready" or "active".
 * Catalog import requires deployable status.
 */

import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { createModel, getAllModels, getModelById, updateModel, isDeployable, getBlockingReasons } from "../db/models";
import { getCatalogEntries } from "../ai-types/public-api";
import type { RegisterCatalogEntryResult } from "../ai-types/public-api";
import { warnLegacyImportToCatalog } from "../governance/legacy-import-to-catalog-deprecation";
import { gatewayCall } from "../platform/modules/module-gateway";
import { getAuditLogger } from "../services/auditLogger";
import { getCatalogState } from "@shared/catalog-state";

export const modelsRouter = router({
  /** List all models from the models table */
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        modelType: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      let models = await getAllModels();
      if (input?.status) {
        models = models.filter((m) => m.status === input.status);
      }
      if (input?.modelType) {
        models = models.filter((m) => m.modelType === input.modelType);
      }
      return models;
    }),

  /** Get model details by ID from the models table */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const model = await getModelById(input.id);
      if (!model) throw new Error("Model not found");
      return model;
    }),

  /** Register a new model (creates record in models table, NOT catalog) */
  register: governedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        displayName: z.string().max(255).optional(),
        description: z.string().optional(),
        providerId: z.number().int().positive().optional(),
        providerName: z.string().optional(),
        contextLength: z.number().optional(),
        size: z.string().optional(),
        license: z.string().optional(),
        source: z.enum(["huggingface", "ollama", "direct", "custom"]).optional(),
        checksum: z.string().optional(),
        capabilities: z.array(z.string()).optional(),
        category: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const namePattern = /^[a-z][a-z0-9._-]*$/;
      if (!namePattern.test(input.name.toLowerCase())) {
        throw new Error(`Model name "${input.name}" must be lowercase alphanumeric with dots, hyphens, or underscores`);
      }

      // Map category to modelType
      const categoryToModelType: Record<string, string> = {
        base_llm: "llm",
        fine_tuned: "llm",
        quantized: "llm",
        embedding: "embedding",
        multimodal: "llm",
      };

      const model = await createModel({
        name: input.name,
        displayName: input.displayName ?? input.name,
        modelType: categoryToModelType[input.category ?? "base_llm"] ?? "llm",
        status: "draft",
        contextLength: input.contextLength ?? null,
        parameterCount: input.size ?? null,
        architecture: input.category ?? null,
      });

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "model",
        target_id: String(model.id),
        decision_result: "success",
        metadata: {
          name: input.name,
          action: "register",
          providerName: input.providerName ?? null,
          source: input.source ?? null,
          license: input.license ?? null,
          checksum: input.checksum ?? null,
          capabilities: input.capabilities ?? null,
        },
      });

      return model;
    }),

  /** Update model lifecycle status */
  updateStatus: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["draft", "ready", "active", "deprecated", "disabled"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const model = await getModelById(input.id);
      if (!model) throw new Error("Model not found");

      await updateModel(input.id, { status: input.status });

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "model",
        target_id: String(input.id),
        decision_result: "success",
        metadata: { action: "updateStatus", from: model.status, to: input.status },
      });

      return { ...model, status: input.status };
    }),

  /** Get model stats for dashboard */
  getStats: protectedProcedure.query(async () => {
    const models = await getAllModels();
    return {
      total: models.length,
      byStatus: {
        draft: models.filter((m) => m.status === "draft").length,
        ready: models.filter((m) => m.status === "ready").length,
        active: models.filter((m) => m.status === "active").length,
        deprecated: models.filter((m) => m.status === "deprecated").length,
        disabled: models.filter((m) => m.status === "disabled").length,
      },
      byType: models.reduce(
        (acc, m) => {
          const t = m.modelType || "uncategorized";
          acc[t] = (acc[t] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      recentRegistrations: models.slice(0, 5),
    };
  }),

  /** List models enriched with catalog state */
  listEnriched: protectedProcedure.query(async () => {
    const models = await getAllModels();
    const catalogEntries = await getCatalogEntries({ entryType: "model" });

    // Index catalog entries by sourceId (new structured FK) or legacy config.sourceModelId
    const catalogBySourceId = new Map<number, any>();
    const catalogByLegacyId = new Map<number, any>();
    const catalogByName = new Map<string, any>();
    for (const entry of catalogEntries) {
      if (entry.sourceType === "model" && entry.sourceId) {
        catalogBySourceId.set(entry.sourceId, entry);
      }
      const config = (entry.config as Record<string, any>) || {};
      if (config.sourceModelId) {
        catalogByLegacyId.set(config.sourceModelId, entry);
      }
      catalogByName.set(entry.name.toLowerCase(), entry);
    }

    return models.map((model) => {
      const catalogEntry = catalogBySourceId.get(model.id) ?? catalogByLegacyId.get(model.id) ?? catalogByName.get(model.name.toLowerCase()) ?? null;

      const catalogStateResult = getCatalogState(catalogEntry ? {
        status: catalogEntry.status,
        reviewState: catalogEntry.reviewState,
        tags: catalogEntry.tags as string[] ?? [],
      } : null);

      return {
        ...model,
        catalogState: catalogStateResult.label,
        catalogStateDetail: catalogStateResult,
        catalogEntryId: catalogEntry?.id ?? null,
        isDeployable: isDeployable(model),
        blockingReasons: getBlockingReasons(model),
      };
    });
  }),

  /**
   * Import a deployable model into the Catalog as a candidate.
   * Mirrors agents.importToCatalog and llm.importToCatalog.
   *
   * @deprecated Plan v3 Phase 47 / Phase 32 — thin wrapper around
   * `aiTypes.catalog.register`. New callers should call the gateway
   * action directly to avoid the wrapper hop.
   * See `docs/architecture/provider-model-binding/LEGACY_PATH_DEPRECATION.md`.
   */
  importToCatalog: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      warnLegacyImportToCatalog("models.importToCatalog");
      const model = await getModelById(input.id);
      if (!model) throw new Error("Model not found");

      if (!isDeployable(model)) {
        const reasons = getBlockingReasons(model);
        throw new Error(
          `Model is not deployable and cannot be imported into the Catalog. ${reasons.join("; ")}`
        );
      }

      // Idempotency: if a catalog entry already exists for this model, return
      // it unchanged (Plan v3 Phase 32 preserves the legacy "no-op on
      // duplicate" behavior).
      const existingEntries = await getCatalogEntries({ entryType: "model" });
      const duplicate = existingEntries.find(
        (e) => e.sourceType === "model" && e.sourceId === input.id,
      );
      if (duplicate) {
        return { success: true, entry: duplicate, imported: false };
      }

      const config: Record<string, unknown> = {
        sourceModelId: model.id,
        modelType: model.modelType,
        architecture: model.architecture,
        contextLength: model.contextLength,
        parameterCount: model.parameterCount,
        runtimeAuthority: "catalog_entry",
        catalogEligible: true,
      };

      // Plan v3 Phase 32: route through aiTypes.catalog.register.
      const result = await gatewayCall<unknown, RegisterCatalogEntryResult>({
        ctx: {
          sourceModule: "models",
          targetModule: "aiTypes",
          actionKey: "aiTypes.catalog.register",
          governanceReceiptId: `models-import-to-catalog-${model.id}-${ctx.user.id}-${Date.now()}`,
          actorId: ctx.user.id,
        },
        input: {
          entryType: "model",
          sourceType: "model",
          sourceId: model.id,
          fields: {
            name: model.name,
            displayName: model.displayName,
            description: null,
            scope: "app",
            status: "draft",
            origin: "admin",
            reviewState: "needs_review",
            config,
            tags: ["candidate", "model", "catalog-import"],
            category: model.modelType,
            subCategory: null,
            capabilities: null,
            createdBy: ctx.user.id,
          },
          registeredBy: ctx.user.id,
          sourceModule: "models",
        },
      });

      // Phase 38 — `result.entry` carries the full row; no round-trip.
      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "model",
        target_id: String(model.id),
        decision_result: "success",
        metadata: { action: "importToCatalog", catalogEntryId: result.entryId },
      });

      return { success: true, entry: result.entry, imported: result.action === "created" };
    }),
});
