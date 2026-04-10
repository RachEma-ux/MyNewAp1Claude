/**
 * OpenRouter Module — tRPC Router
 *
 * Top-level router for the OpenRouter control-plane module.
 * All mutations use governedProcedure. All secrets server-side only.
 */

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getDb } from "../db/connection";
import {
  openrouterConfig,
  openrouterModels,
  openrouterSyncRuns,
  openrouterRoutingProfiles,
  openrouterExecutions,
  openrouterActivity,
} from "./schema";
import {
  getClientSafeConfig,
  saveConfig,
  testConnection,
  healthCheck,
  executeChat,
  executeEmbedding,
  logActivity,
} from "./service";
import { syncModels } from "./sync-service";
import {
  listProfiles,
  getDefaultProfile,
  setDefaultProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  seedDefaultPresets,
} from "./routing-service";

// ── Config ─────────────────────────────────────────────────────────

const configRouter = router({
  get: protectedProcedure.query(async () => {
    return getClientSafeConfig();
  }),

  save: governedProcedure
    .input(z.object({
      apiKey: z.string().min(1).optional(),
      endpoint: z.string().optional(),
      siteUrl: z.string().optional(),
      siteName: z.string().optional(),
      enabled: z.boolean().optional(),
      defaultModelId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await saveConfig(input);
      await logActivity("config.update", ctx.user.id, "OpenRouter configuration updated");

      // Seed routing presets on first config
      await seedDefaultPresets();

      // Return safe version (no secrets)
      return getClientSafeConfig();
    }),

  testConnection: governedProcedure
    .input(z.object({ apiKey: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await testConnection(input.apiKey);
      await logActivity(
        "connection.test",
        ctx.user.id,
        result.connected ? `Connected (${result.latencyMs}ms, ${result.modelsAvailable} models)` : `Failed: ${result.error}`,
      );
      return result;
    }),

  health: protectedProcedure.query(async () => {
    return healthCheck();
  }),
});

// ── Models ─────────────────────────────────────────────────────────

const modelsRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      provider: z.string().optional(),
      capability: z.enum(["chat", "embedding", "toolCalling", "vision", "structuredOutput", "reasoning"]).optional(),
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return { models: [], total: 0 };

      let query = db.select().from(openrouterModels).where(eq(openrouterModels.enabled, true));

      // Search filter applied in JS since capabilities is JSON
      const allModels = await query.orderBy(openrouterModels.name).limit(500);

      let filtered = allModels;
      if (input.search) {
        const s = input.search.toLowerCase();
        filtered = filtered.filter((m) =>
          m.modelId.toLowerCase().includes(s) || m.name.toLowerCase().includes(s) || (m.description ?? "").toLowerCase().includes(s)
        );
      }
      if (input.provider) {
        filtered = filtered.filter((m) => m.providerSlug === input.provider);
      }
      if (input.capability) {
        filtered = filtered.filter((m) => {
          const caps = m.capabilities as any;
          return caps?.[input.capability!] === true;
        });
      }

      return {
        models: filtered.slice(input.offset, input.offset + input.limit),
        total: filtered.length,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [model] = await db.select().from(openrouterModels).where(eq(openrouterModels.modelId, input.modelId)).limit(1);
      if (!model) throw new TRPCError({ code: "NOT_FOUND", message: "Model not found" });
      return model;
    }),

  providers: protectedProcedure.query(async () => {
    const db = getDb();
    if (!db) return [];
    const models = await db.select({ providerSlug: openrouterModels.providerSlug }).from(openrouterModels).where(eq(openrouterModels.enabled, true));
    const slugs = [...new Set(models.map((m) => m.providerSlug).filter(Boolean))];
    return slugs.sort();
  }),
});

// ── Sync ───────────────────────────────────────────────────────────

const syncRouter = router({
  run: governedProcedure.mutation(async ({ ctx }) => {
    const result = await syncModels();
    return result;
  }),

  history: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(openrouterSyncRuns).orderBy(desc(openrouterSyncRuns.createdAt)).limit(input.limit);
    }),
});

// ── Routing ────────────────────────────────────────────────────────

const routingRouter = router({
  listProfiles: protectedProcedure.query(async () => listProfiles()),

  getDefault: protectedProcedure.query(async () => getDefaultProfile()),

  setDefault: governedProcedure
    .input(z.object({ profileId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await setDefaultProfile(input.profileId, ctx.user.id);
      return { success: true };
    }),

  create: governedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      config: z.object({}).passthrough(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createProfile({ ...input, actorId: ctx.user.id });
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      config: z.object({}).passthrough().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      return updateProfile(id, updates, ctx.user.id);
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteProfile(input.id, ctx.user.id);
      return { success: true };
    }),
});

// ── Playground (Execution) ─────────────────────────────────────────

const playgroundRouter = router({
  chat: governedProcedure
    .input(z.object({
      model: z.string(),
      messages: z.array(z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      })),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(128000).optional(),
      routingProfileId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const startMs = Date.now();

      // Load routing profile if specified
      let routingProfile: Record<string, unknown> | undefined;
      if (input.routingProfileId && db) {
        const [profile] = await db.select().from(openrouterRoutingProfiles).where(eq(openrouterRoutingProfiles.id, input.routingProfileId)).limit(1);
        if (profile?.config) routingProfile = profile.config as Record<string, unknown>;
      }

      try {
        const response = await executeChat({
          model: input.model,
          messages: input.messages,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          routingProfile: routingProfile as any,
        });

        const latencyMs = Date.now() - startMs;

        // Log execution
        if (db) {
          await db.insert(openrouterExecutions).values({
            modelId: input.model,
            routingProfileId: input.routingProfileId,
            status: "success",
            requestType: "chat",
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            totalTokens: response.usage?.total_tokens,
            latencyMs,
            providerUsed: response.provider,
            governanceVerdict: "allow",
          });
        }

        return { ...response, latencyMs };
      } catch (err) {
        const latencyMs = Date.now() - startMs;
        if (db) {
          await db.insert(openrouterExecutions).values({
            modelId: input.model,
            status: "error",
            requestType: "chat",
            latencyMs,
            errorMessage: (err as Error).message,
            governanceVerdict: "allow",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  embedding: governedProcedure
    .input(z.object({
      model: z.string(),
      input: z.array(z.string()).min(1).max(100),
    }))
    .mutation(async ({ ctx, input: reqInput }) => {
      const db = getDb();
      const startMs = Date.now();

      try {
        const response = await executeEmbedding(reqInput.model, reqInput.input);
        const latencyMs = Date.now() - startMs;

        if (db) {
          await db.insert(openrouterExecutions).values({
            modelId: reqInput.model,
            status: "success",
            requestType: "embedding",
            promptTokens: response.usage?.prompt_tokens,
            totalTokens: response.usage?.total_tokens,
            latencyMs,
            governanceVerdict: "allow",
          });
        }

        return { ...response, latencyMs };
      } catch (err) {
        const latencyMs = Date.now() - startMs;
        if (db) {
          await db.insert(openrouterExecutions).values({
            modelId: reqInput.model,
            status: "error",
            requestType: "embedding",
            latencyMs,
            errorMessage: (err as Error).message,
            governanceVerdict: "allow",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  structured: governedProcedure
    .input(z.object({
      model: z.string(),
      messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() })),
      schema: z.object({}).passthrough(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const startMs = Date.now();

      try {
        const response = await executeChat({
          model: input.model,
          messages: input.messages,
          responseFormat: { type: "json_object" },
        });

        const latencyMs = Date.now() - startMs;

        if (db) {
          await db.insert(openrouterExecutions).values({
            modelId: input.model,
            status: "success",
            requestType: "structured",
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            totalTokens: response.usage?.total_tokens,
            latencyMs,
            providerUsed: response.provider,
            governanceVerdict: "allow",
          });
        }

        return { ...response, latencyMs };
      } catch (err) {
        const latencyMs = Date.now() - startMs;
        if (db) {
          await db.insert(openrouterExecutions).values({
            modelId: input.model,
            status: "error",
            requestType: "structured",
            latencyMs,
            errorMessage: (err as Error).message,
            governanceVerdict: "allow",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),
});

// ── Usage ──────────────────────────────────────────────────────────

const usageRouter = router({
  summary: protectedProcedure.query(async () => {
    const db = getDb();
    if (!db) return { totalRequests: 0, successRate: 0, totalTokens: 0, totalCost: 0, avgLatency: 0 };

    const executions = await db.select().from(openrouterExecutions).orderBy(desc(openrouterExecutions.createdAt)).limit(1000);

    const total = executions.length;
    const successes = executions.filter((e) => e.status === "success").length;
    const tokens = executions.reduce((sum, e) => sum + (e.totalTokens ?? 0), 0);
    const cost = executions.reduce((sum, e) => sum + (e.cost ?? 0), 0);
    const latencies = executions.filter((e) => e.latencyMs).map((e) => e.latencyMs!);
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    return {
      totalRequests: total,
      successRate: total > 0 ? Math.round((successes / total) * 100) : 0,
      totalTokens: tokens,
      totalCost: Math.round(cost * 10000) / 10000,
      avgLatency,
    };
  }),

  recent: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(openrouterExecutions).orderBy(desc(openrouterExecutions.createdAt)).limit(input.limit);
    }),

  byModel: protectedProcedure.query(async () => {
    const db = getDb();
    if (!db) return [];
    const executions = await db.select().from(openrouterExecutions);

    const grouped = new Map<string, { requests: number; tokens: number; cost: number; errors: number }>();
    for (const e of executions) {
      const g = grouped.get(e.modelId) ?? { requests: 0, tokens: 0, cost: 0, errors: 0 };
      g.requests++;
      g.tokens += e.totalTokens ?? 0;
      g.cost += e.cost ?? 0;
      if (e.status === "error") g.errors++;
      grouped.set(e.modelId, g);
    }

    return Array.from(grouped.entries()).map(([model, stats]) => ({ model, ...stats })).sort((a, b) => b.requests - a.requests);
  }),
});

// ── Activity ───────────────────────────────────────────────────────

const activityRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(openrouterActivity).orderBy(desc(openrouterActivity.createdAt)).limit(input.limit);
    }),
});

// ── Combined Router ────────────────────────────────────────────────

export const openRouterRouter = router({
  config: configRouter,
  models: modelsRouter,
  sync: syncRouter,
  routing: routingRouter,
  playground: playgroundRouter,
  usage: usageRouter,
  activity: activityRouter,
});
