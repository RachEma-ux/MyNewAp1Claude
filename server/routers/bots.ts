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
 * Bot Domain Router — governed domain-first pattern
 *
 * Bots live in the `bots` DB table. The Catalog is a separate concern:
 * `importToCatalog` creates a catalog candidate from a deployable bot.
 *
 * Bot lifecycle: draft -> configured -> validated -> deployable -> archived
 * "Deployable" = configured + validated + no blockers.
 * Catalog import requires deployable status.
 *
 * This router does NOT directly create catalog_entries as its canonical
 * creation path. That is the responsibility of Catalog intake.
 */

import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { createBot, getAllBots, getBotById, updateBot, isDeployable, getBlockingReasons } from "../db/bots";
import { getCatalogEntries, createCatalogEntry, createCatalogAuditEvent, getTaxonomyNodes, setEntryClassifications } from "../db/catalog";
import { getAuditLogger } from "../services/auditLogger";
import { getCatalogState } from "@shared/catalog-state";

const botStatusSchema = z.enum(["draft", "configured", "validated", "deployable", "archived"]);

export const botsRouter = router({
  /** List all bots from the bots domain table */
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      let bots = await getAllBots();
      if (input?.status) {
        bots = bots.filter((b) => b.status === input.status);
      }
      return bots;
    }),

  /** Get bot details by ID from the bots domain table */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const bot = await getBotById(input.id);
      if (!bot) throw new Error("Bot not found");
      return bot;
    }),

  /** Create a new bot (domain entity only — NOT a catalog entry) */
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
      // Bot creation policy: name validation
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

      // Create domain entity — NOT a catalog entry
      const bot = await createBot({
        name: input.name,
        displayName: input.displayName ?? input.name,
        description: input.description ?? null,
        agentId: input.agentId ?? null,
        llmId: input.llmId ?? null,
        channels: input.channels ?? [],
        behaviorConfig: input.behaviorConfig ?? {},
        rateLimit: input.rateLimit ?? null,
        scope: input.scope ?? "app",
        status: "draft",
        createdBy: ctx.user.id,
      });

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "bot",
        target_id: String(bot.id),
        decision_result: "success",
        metadata: { name: input.name, action: "create" },
      });

      return bot;
    }),

  /** Update bot lifecycle status */
  updateStatus: governedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: botStatusSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const bot = await getBotById(input.id);
      if (!bot) throw new Error("Bot not found");

      const updated = await updateBot(input.id, { status: input.status });

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "bot",
        target_id: String(input.id),
        decision_result: "success",
        metadata: { action: "updateStatus", from: bot.status, to: input.status },
      });

      return updated;
    }),

  /** Get bot stats for dashboard */
  getStats: protectedProcedure.query(async () => {
    const bots = await getAllBots();
    return {
      total: bots.length,
      byStatus: {
        draft: bots.filter((b) => b.status === "draft").length,
        configured: bots.filter((b) => b.status === "configured").length,
        validated: bots.filter((b) => b.status === "validated").length,
        deployable: bots.filter((b) => b.status === "deployable").length,
        archived: bots.filter((b) => b.status === "archived").length,
      },
    };
  }),

  /** List bots enriched with catalog state and deployability */
  listEnriched: protectedProcedure.query(async () => {
    const bots = await getAllBots();
    const catalogEntries = await getCatalogEntries({ entryType: "bot" });

    // Index catalog entries by sourceId (new structured FK) or legacy config.sourceBotId
    const catalogBySourceId = new Map<number, any>();
    const catalogByLegacyId = new Map<number, any>();
    const catalogByName = new Map<string, any>();
    for (const entry of catalogEntries) {
      if (entry.sourceType === "bot" && entry.sourceId) {
        catalogBySourceId.set(entry.sourceId, entry);
      }
      const config = (entry.config as Record<string, any>) || {};
      if (config.sourceBotId) {
        catalogByLegacyId.set(config.sourceBotId, entry);
      }
      catalogByName.set(entry.name.toLowerCase(), entry);
    }

    return bots.map((bot) => {
      const catalogEntry = catalogBySourceId.get(bot.id) ?? catalogByLegacyId.get(bot.id) ?? catalogByName.get(bot.name.toLowerCase()) ?? null;

      const catalogStateResult = getCatalogState(catalogEntry ? {
        status: catalogEntry.status,
        reviewState: catalogEntry.reviewState,
        tags: catalogEntry.tags as string[] ?? [],
      } : null);

      return {
        ...bot,
        catalogState: catalogStateResult.label,
        catalogStateDetail: catalogStateResult,
        catalogEntryId: catalogEntry?.id ?? null,
        isDeployable: isDeployable(bot),
        blockingReasons: getBlockingReasons(bot),
      };
    });
  }),

  /**
   * Import a deployable bot into the Catalog as a candidate.
   * Mirrors models.importToCatalog and agents.importToCatalog.
   */
  importToCatalog: governedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const bot = await getBotById(input.id);
      if (!bot) throw new Error("Bot not found");

      if (!isDeployable(bot)) {
        const reasons = getBlockingReasons(bot);
        throw new Error(
          `Bot is not deployable and cannot be imported into the Catalog. ${reasons.join("; ")}`
        );
      }

      // Duplicate prevention (structured FK first, then legacy config)
      const existingEntries = await getCatalogEntries({ entryType: "bot" });
      const duplicate = existingEntries.find((entry) => {
        if (entry.sourceType === "bot" && entry.sourceId === input.id) return true;
        const config = (entry.config as Record<string, any>) || {};
        return config.sourceBotId === input.id;
      });
      if (duplicate) {
        return { success: true, entry: duplicate, imported: false };
      }

      const config: Record<string, unknown> = {
        sourceBotId: bot.id,
        agentId: bot.agentId,
        llmId: bot.llmId,
        channels: bot.channels,
        behaviorConfig: bot.behaviorConfig,
        rateLimit: bot.rateLimit,
        runtimeAuthority: "catalog_entry",
        catalogEligible: true,
      };

      const entry = await createCatalogEntry({
        name: bot.name,
        displayName: bot.displayName ?? bot.name,
        description: bot.description ?? null,
        entryType: "bot",
        sourceType: "bot",
        sourceId: bot.id,
        scope: bot.scope,
        status: "draft",
        origin: "admin",
        reviewState: "needs_review",
        config,
        tags: ["candidate", "bot", "catalog-import"],
        category: "bot",
        subCategory: null,
        capabilities: bot.channels ?? null,
        createdBy: ctx.user.id,
      });

      // Auto-classify
      try {
        const axisNodes = await getTaxonomyNodes({ entryType: "bot", level: "axis" });
        if (axisNodes.length > 0) {
          await setEntryClassifications(entry.id, [axisNodes[0].id]);
        }
      } catch (e: any) {
        console.warn(`[Bots] Auto-classify failed for imported catalog entry ${entry.id}:`, e.message);
      }

      await createCatalogAuditEvent({
        eventType: "catalog.bot.submitted",
        catalogEntryId: entry.id,
        actor: ctx.user.id,
        actorType: "user",
        payload: {
          sourceBotId: bot.id,
          reviewState: "needs_review",
          status: "draft",
        },
      });

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "bot",
        target_id: String(bot.id),
        decision_result: "success",
        metadata: { action: "importToCatalog", catalogEntryId: entry.id },
      });

      return { success: true, entry, imported: true };
    }),
});
