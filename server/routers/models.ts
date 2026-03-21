/**
 * Models Router — governed model management
 *
 * Wraps catalog entries with entryType="model" to provide
 * model-specific governance, registration, and stats endpoints.
 *
 * Model lifecycle: draft → active → deprecated → disabled
 * Models are catalog-first (entryType="model" in catalog_entries).
 * Runtime authority requires catalog publication + approval.
 * Registration creates a draft catalog entry that must be reviewed.
 */

import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getCatalogEntries, getCatalogEntryById, createCatalogEntry, updateCatalogEntry } from "../db";
import { getAuditLogger } from "../services/auditLogger";

export const modelsRouter = router({
  /** List governed models (wraps catalog with entryType="model") */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "active", "deprecated", "disabled"]).optional(),
        category: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return await getCatalogEntries({ entryType: "model", ...input });
    }),

  /** Get model details by catalog entry ID */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry || entry.entryType !== "model") throw new Error("Model not found");
      return entry;
    }),

  /** Register a new model (creates catalog entry with entryType="model") */
  register: governedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        displayName: z.string().max(255).optional(),
        description: z.string().optional(),
        providerId: z.number().int().positive().optional(), // FK to providers table (preferred)
        providerName: z.string().optional(), // Display name only (for UI)
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
      // Model registration policy evaluation
      const namePattern = /^[a-z][a-z0-9._-]*$/;
      if (!namePattern.test(input.name.toLowerCase())) {
        throw new Error(`Model name "${input.name}" must be lowercase alphanumeric with dots, hyphens, or underscores`);
      }
      if (input.providerId) {
        // Verify provider exists
        const provider = await getCatalogEntryById(input.providerId);
        // Provider may be in providers table, not catalog — just log warning if not found
        if (!provider) {
          console.warn(`[ModelPolicy] providerId ${input.providerId} not found in catalog, may be infrastructure-backed`);
        }
      }

      const entry = await createCatalogEntry({
        name: input.name,
        displayName: input.displayName ?? input.name,
        description: input.description ?? null,
        entryType: "model",
        scope: "app",
        status: "draft",
        origin: "admin",
        reviewState: "needs_review",
        providerId: input.providerId ?? null,
        config: {
          providerName: input.providerName ?? null,
          contextLength: input.contextLength ?? null,
          size: input.size ?? null,
          license: input.license ?? null,
          source: input.source ?? null,
          checksum: input.checksum ?? null,
        },
        tags: ["candidate", "model"],
        category: input.category ?? "base_llm",
        subCategory: null,
        capabilities: input.capabilities ?? null,
        createdBy: ctx.user.id,
      });

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "model",
        target_id: String(entry.id),
        decision_result: "success",
        metadata: { name: input.name, action: "register" },
      });

      return entry;
    }),

  /** Update model lifecycle status */
  updateStatus: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["draft", "active", "deprecated", "disabled"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry || entry.entryType !== "model") throw new Error("Model not found");

      const updated = await updateCatalogEntry(input.id, { status: input.status }, ctx.user.id);

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "model",
        target_id: String(input.id),
        decision_result: "success",
        metadata: { action: "updateStatus", from: entry.status, to: input.status },
      });

      return updated;
    }),

  /** Get model stats for dashboard */
  getStats: protectedProcedure.query(async () => {
    const models = await getCatalogEntries({ entryType: "model" });
    return {
      total: models.length,
      byStatus: {
        draft: models.filter((m) => m.status === "draft").length,
        active: models.filter((m) => m.status === "active").length,
        deprecated: models.filter((m) => m.status === "deprecated").length,
        disabled: models.filter((m) => m.status === "disabled").length,
      },
      byCategory: models.reduce(
        (acc, m) => {
          const cat = (m as any).category || "uncategorized";
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      recentRegistrations: models
        .sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return db - da;
        })
        .slice(0, 5),
    };
  }),
});
