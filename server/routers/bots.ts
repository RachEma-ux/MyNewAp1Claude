/**
 * Bot Domain Router
 *
 * tRPC endpoints for managing bots — governed domain entities
 * that bind agents + LLMs to channels with lifecycle governance.
 *
 * Uses catalog_entries with entryType="bot" as the storage layer.
 *
 * Bot lifecycle: draft → bound → reviewed → approved → active → suspended
 * Bots are catalog-first (entryType="bot" in catalog_entries).
 * activate requires reviewState="approved" (governance gate).
 * Runtime authority requires catalog publication + activation.
 */

import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getCatalogEntries, getCatalogEntryById, createCatalogEntry, updateCatalogEntry } from "../db";
import { getAuditLogger } from "../services/auditLogger";

const botStatusSchema = z.enum(["draft", "bound", "reviewed", "approved", "active", "suspended"]);

export const botsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const entries = await getCatalogEntries({ entryType: "bot", ...input });
      return entries;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry || entry.entryType !== "bot") throw new Error("Bot not found");
      return entry;
    }),

  create: governedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        displayName: z.string().max(255).optional(),
        description: z.string().optional(),
        agentId: z.number().int().positive().optional(),
        llmId: z.number().int().positive().optional(),
        channels: z.array(z.string()).optional(),
        behaviorConfig: z
          .object({
            systemPrompt: z.string().optional(),
            persona: z.string().optional(),
            responseStyle: z.string().optional(),
          })
          .optional(),
        scope: z.enum(["app", "workspace", "org"]).optional(),
        rateLimit: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Bot creation policy evaluation
      const namePattern = /^[a-z][a-z0-9-]*[a-z0-9]$/;
      if (input.name.length >= 3 && !namePattern.test(input.name.toLowerCase())) {
        throw new Error(`Bot name "${input.name}" must be lowercase alphanumeric with hyphens`);
      }

      // Validate upstream entity references
      if (input.agentId) {
        const { agents } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { getDb } = await import("../db");
        const db = getDb();
        if (db) {
          const [agent] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
          if (!agent) throw new Error(`Referenced agent ${input.agentId} not found`);
        }
      }
      if (input.llmId) {
        const { llms } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { getDb } = await import("../db");
        const db = getDb();
        if (db) {
          const [llm] = await db.select().from(llms).where(eq(llms.id, input.llmId)).limit(1);
          if (!llm) throw new Error(`Referenced LLM ${input.llmId} not found`);
        }
      }

      const entry = await createCatalogEntry({
        name: input.name,
        displayName: input.displayName ?? input.name,
        description: input.description ?? null,
        entryType: "bot",
        scope: input.scope ?? "app",
        status: "draft",
        origin: "admin",
        reviewState: "needs_review",
        providerId: null,
        config: {
          agentId: input.agentId ?? null,
          llmId: input.llmId ?? null,
          channels: input.channels ?? [],
          behaviorConfig: input.behaviorConfig ?? {},
          rateLimit: input.rateLimit ?? null,
          lifecycleStatus: "draft",
        },
        tags: ["candidate", "bot"],
        category: "bot",
        subCategory: null,
        capabilities: input.channels ?? null,
        createdBy: ctx.user.id,
      });

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "bot",
        target_id: String(entry.id),
        decision_result: "success",
        metadata: { name: input.name, action: "create" },
      });

      return entry;
    }),

  updateStatus: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: botStatusSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry || entry.entryType !== "bot") throw new Error("Bot not found");

      const config = (entry.config as Record<string, any>) || {};
      const updatedConfig = { ...config, lifecycleStatus: input.status };

      const catalogStatus =
        input.status === "active"
          ? "active"
          : input.status === "suspended"
            ? "disabled"
            : "draft";

      const updated = await updateCatalogEntry(
        input.id,
        { config: updatedConfig, status: catalogStatus },
        ctx.user.id
      );

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "bot",
        target_id: String(input.id),
        decision_result: "success",
        metadata: { action: "updateStatus", newStatus: input.status },
      });

      return updated;
    }),

  activate: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry || entry.entryType !== "bot") throw new Error("Bot not found");
      if (entry.reviewState !== "approved")
        throw new Error("Bot must be approved before activation");

      const config = (entry.config as Record<string, any>) || {};
      const result = await updateCatalogEntry(
        input.id,
        { status: "active", config: { ...config, lifecycleStatus: "active" } },
        ctx.user.id
      );

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "bot",
        target_id: String(input.id),
        decision_result: "success",
        metadata: { action: "activate" },
      });

      return result;
    }),

  suspend: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry || entry.entryType !== "bot") throw new Error("Bot not found");

      const config = (entry.config as Record<string, any>) || {};
      const result = await updateCatalogEntry(
        input.id,
        { status: "disabled", config: { ...config, lifecycleStatus: "suspended" } },
        ctx.user.id
      );

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "bot",
        target_id: String(input.id),
        decision_result: "success",
        metadata: { action: "suspend" },
      });

      return result;
    }),

  getStats: protectedProcedure.query(async () => {
    const bots = await getCatalogEntries({ entryType: "bot" });
    const byLifecycle: Record<string, number> = {
      draft: 0,
      bound: 0,
      reviewed: 0,
      approved: 0,
      active: 0,
      suspended: 0,
    };
    for (const b of bots) {
      const config = (b.config as Record<string, any>) || {};
      const ls = config.lifecycleStatus || "draft";
      if (ls in byLifecycle) byLifecycle[ls]++;
      else byLifecycle.draft++;
    }
    return {
      total: bots.length,
      byStatus: {
        draft: bots.filter((b) => b.status === "draft").length,
        active: bots.filter((b) => b.status === "active").length,
        disabled: bots.filter((b) => b.status === "disabled").length,
      },
      byLifecycle,
    };
  }),
});
