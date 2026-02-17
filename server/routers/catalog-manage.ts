/**
 * Catalog Management Router
 *
 * tRPC endpoints for managing catalog entries (providers & models)
 * in the authoring space before publishing to the registry.
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  getCatalogEntries,
  getCatalogEntryById,
  createCatalogEntry,
  updateCatalogEntry,
  deleteCatalogEntry,
  getCatalogEntryVersions,
  getPublishBundles,
  createPublishBundle,
  recallPublishBundle,
  createCatalogAuditEvent,
} from "../db";
import { createHash } from "crypto";

/** Helper to emit audit events without blocking the response */
function audit(eventType: string, catalogEntryId: number | null, payload: any, bundleId?: number) {
  createCatalogAuditEvent({
    eventType,
    catalogEntryId,
    publishBundleId: bundleId ?? null,
    actor: 1,
    actorType: "user",
    payload,
  }).catch((e) => console.warn(`[CatalogAudit] Failed to log ${eventType}:`, e.message));
}
import { getProviderRegistry } from "../providers/registry";
import * as providerDb from "../providers/db";

// ============================================================================
// Input Schemas
// ============================================================================

const entryTypeSchema = z.enum(["provider", "model"]);
const statusSchema = z.enum(["draft", "validating", "validated", "publishing", "published", "deprecated"]);
const scopeSchema = z.enum(["app", "workspace", "org", "global"]);

const createEntrySchema = z.object({
  name: z.string().min(1).max(255),
  displayName: z.string().max(255).optional(),
  description: z.string().optional(),
  entryType: entryTypeSchema,
  scope: scopeSchema.optional(),
  providerId: z.number().int().positive().optional(),
  config: z.any().optional(),
  tags: z.array(z.string()).optional(),
});

const updateEntrySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255).optional(),
  displayName: z.string().max(255).optional(),
  description: z.string().optional(),
  status: statusSchema.optional(),
  providerId: z.number().int().positive().optional(),
  config: z.any().optional(),
  tags: z.array(z.string()).optional(),
});

// ============================================================================
// Router
// ============================================================================

export const catalogManageRouter = router({
  /**
   * List catalog entries with optional filters
   */
  list: publicProcedure
    .input(
      z.object({
        entryType: entryTypeSchema.optional(),
        status: statusSchema.optional(),
        scope: scopeSchema.optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return await getCatalogEntries(input ?? {});
    }),

  /**
   * Get a single catalog entry by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry) throw new Error(`Catalog entry ${input.id} not found`);
      return entry;
    }),

  /**
   * Create a new catalog entry
   */
  create: publicProcedure
    .input(createEntrySchema)
    .mutation(async ({ input }) => {
      const entry = await createCatalogEntry({
        name: input.name,
        displayName: input.displayName ?? input.name,
        description: input.description ?? null,
        entryType: input.entryType,
        scope: input.scope ?? "app",
        status: "draft",
        providerId: input.providerId ?? null,
        config: input.config ?? {},
        tags: input.tags ?? [],
        createdBy: 1,
      });
      audit("catalog.entry.created", entry.id, { name: entry.name, entryType: entry.entryType });
      return entry;
    }),

  /**
   * Update an existing catalog entry
   */
  update: publicProcedure
    .input(updateEntrySchema)
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const entry = await updateCatalogEntry(id, data, 1);
      audit("catalog.entry.updated", id, { changes: Object.keys(data) });
      return entry;
    }),

  /**
   * Delete a catalog entry and all its versions
   */
  delete: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const entry = await getCatalogEntryById(input.id);
      await deleteCatalogEntry(input.id);
      audit("catalog.entry.deleted", input.id, { name: entry?.name || "unknown" });
      return { success: true };
    }),

  /**
   * List version history for a catalog entry
   */
  listVersions: publicProcedure
    .input(z.object({ catalogEntryId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await getCatalogEntryVersions(input.catalogEntryId);
    }),

  /**
   * Validate a catalog entry via orchestrator handshake
   * Runs health, capabilities, models, and optional testPrompt checks
   */
  validate: publicProcedure
    .input(z.object({
      id: z.number().int().positive(),
      runTestPrompt: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry) throw new Error(`Catalog entry ${input.id} not found`);

      // Mark as validating
      await updateCatalogEntry(input.id, { status: "validating" }, 1);

      const results: {
        health: { passed: boolean; message: string; latencyMs: number };
        capabilities: { passed: boolean; data: any; message: string };
        models: { passed: boolean; models: string[]; message: string };
        testPrompt: { passed: boolean; response: string; latencyMs: number; message: string } | null;
      } = {
        health: { passed: false, message: "Not checked", latencyMs: 0 },
        capabilities: { passed: false, data: null, message: "Not checked" },
        models: { passed: false, models: [], message: "Not checked" },
        testPrompt: null,
      };

      const errors: string[] = [];

      try {
        // Resolve the provider: use providerId from entry, or find by config
        let providerId = entry.providerId;
        if (!providerId) {
          const config = entry.config as Record<string, any> | null;
          if (config?.providerId) {
            providerId = config.providerId;
          }
        }

        if (!providerId) {
          // Try to find provider by name match
          const allProviders = await providerDb.getAllProviders();
          const match = allProviders.find((p: any) => p.name === entry.name || p.name === entry.displayName);
          if (match) providerId = match.id;
        }

        if (!providerId) {
          errors.push("No linked provider found. Set providerId on the catalog entry.");
          await updateCatalogEntry(input.id, {
            status: "draft",
          }, 1);
          // Update validation fields via direct DB
          const { getDb } = await import("../db");
          const db = getDb();
          if (db) {
            const { catalogEntries } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db.update(catalogEntries).set({
              validationStatus: "failed",
              validationErrors: errors,
              lastValidatedAt: new Date(),
            }).where(eq(catalogEntries.id, input.id));
          }
          return { success: false, results, errors };
        }

        const registry = getProviderRegistry();
        const provider = registry.getProvider(providerId);

        if (!provider) {
          errors.push(`Provider ID ${providerId} not found in runtime registry (may not be initialized).`);
          await updateCatalogEntry(input.id, { status: "draft" }, 1);
          const { getDb } = await import("../db");
          const db = getDb();
          if (db) {
            const { catalogEntries } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db.update(catalogEntries).set({
              validationStatus: "failed",
              validationErrors: errors,
              lastValidatedAt: new Date(),
            }).where(eq(catalogEntries.id, input.id));
          }
          return { success: false, results, errors };
        }

        // 1. Health check
        const healthStart = Date.now();
        try {
          const health = await Promise.race([
            provider.healthCheck(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Health check timed out (30s)")), 30000)),
          ]);
          results.health = {
            passed: health.healthy,
            message: health.message || (health.healthy ? "Healthy" : "Unhealthy"),
            latencyMs: Date.now() - healthStart,
          };
          if (!health.healthy) errors.push(`Health check failed: ${health.message}`);
        } catch (e: any) {
          results.health = { passed: false, message: e.message, latencyMs: Date.now() - healthStart };
          errors.push(`Health check error: ${e.message}`);
        }

        // 2. Capabilities check
        try {
          const caps = provider.getCapabilities();
          results.capabilities = {
            passed: true,
            data: caps,
            message: `Streaming: ${caps.supportsStreaming}, Embedding: ${caps.supportsEmbedding}, Functions: ${caps.supportsFunctionCalling}, Context: ${caps.maxContextLength}`,
          };
        } catch (e: any) {
          results.capabilities = { passed: false, data: null, message: e.message };
          errors.push(`Capabilities check error: ${e.message}`);
        }

        // 3. Models discovery
        try {
          let models: string[] = [];
          if ("getSupportedModels" in provider && typeof (provider as any).getSupportedModels === "function") {
            models = (provider as any).getSupportedModels();
          } else {
            const caps = provider.getCapabilities();
            models = caps.supportedModels || [];
          }
          results.models = {
            passed: models.length > 0,
            models,
            message: models.length > 0 ? `${models.length} model(s) discovered` : "No models found",
          };
          if (models.length === 0) errors.push("No models discovered from provider");
        } catch (e: any) {
          results.models = { passed: false, models: [], message: e.message };
          errors.push(`Models discovery error: ${e.message}`);
        }

        // 4. Test prompt (optional)
        if (input.runTestPrompt && results.health.passed) {
          const promptStart = Date.now();
          try {
            const testModel = results.models.models[0];
            if (!testModel) {
              results.testPrompt = { passed: false, response: "", latencyMs: 0, message: "No model available for test" };
              errors.push("Cannot run test prompt: no model available");
            } else {
              const response = await Promise.race([
                provider.generate({
                  model: testModel,
                  messages: [{ role: "user", content: "Say hello in exactly 5 words." }],
                  maxTokens: 50,
                  temperature: 0.1,
                }),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Test prompt timed out (30s)")), 30000)),
              ]);
              results.testPrompt = {
                passed: true,
                response: response.text || response.content || "[response received]",
                latencyMs: Date.now() - promptStart,
                message: "Test prompt successful",
              };
            }
          } catch (e: any) {
            results.testPrompt = {
              passed: false,
              response: "",
              latencyMs: Date.now() - promptStart,
              message: e.message,
            };
            errors.push(`Test prompt error: ${e.message}`);
          }
        }

        // Determine overall validation status
        const allPassed = results.health.passed && results.capabilities.passed && results.models.passed
          && (results.testPrompt === null || results.testPrompt.passed);

        const validationStatus = allPassed ? "passed" : "failed";
        const newStatus = allPassed ? "validated" : "draft";

        await updateCatalogEntry(input.id, { status: newStatus }, 1);
        // Update validation-specific fields
        const { getDb } = await import("../db");
        const db = getDb();
        if (db) {
          const { catalogEntries } = await import("../../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          await db.update(catalogEntries).set({
            validationStatus,
            validationErrors: errors.length > 0 ? errors : null,
            lastValidatedAt: new Date(),
          }).where(eq(catalogEntries.id, input.id));
        }

        audit("catalog.entry.validated", input.id, { passed: allPassed, validationStatus, errors });
        return { success: allPassed, results, errors };
      } catch (e: any) {
        errors.push(`Unexpected error: ${e.message}`);
        await updateCatalogEntry(input.id, { status: "draft" }, 1);
        const { getDb } = await import("../db");
        const db = getDb();
        if (db) {
          const { catalogEntries } = await import("../../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          await db.update(catalogEntries).set({
            validationStatus: "failed",
            validationErrors: errors,
            lastValidatedAt: new Date(),
          }).where(eq(catalogEntries.id, input.id));
        }
        return { success: false, results, errors };
      }
    }),

  // ============================================================================
  // Publishing Endpoints
  // ============================================================================

  /**
   * List published bundles
   */
  listBundles: publicProcedure
    .input(
      z.object({
        catalogEntryId: z.number().int().positive().optional(),
        status: z.enum(["active", "superseded", "recalled"]).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return await getPublishBundles(input ?? {});
    }),

  /**
   * Publish a catalog entry — creates an immutable snapshot bundle
   * Entry must be in "validated" status
   */
  publish: publicProcedure
    .input(z.object({
      catalogEntryId: z.number().int().positive(),
      versionLabel: z.string().min(1).max(50),
      changeNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const entry = await getCatalogEntryById(input.catalogEntryId);
      if (!entry) throw new Error(`Catalog entry ${input.catalogEntryId} not found`);

      if (entry.status !== "validated" && entry.status !== "published") {
        throw new Error(`Entry must be validated before publishing (current status: ${entry.status})`);
      }

      // Mark entry as publishing
      await updateCatalogEntry(input.catalogEntryId, { status: "publishing" }, 1);

      try {
        // Build immutable snapshot — freeze the current config + metadata
        const snapshot = {
          entryId: entry.id,
          name: entry.name,
          displayName: entry.displayName,
          description: entry.description,
          entryType: entry.entryType,
          scope: entry.scope,
          providerId: entry.providerId,
          config: entry.config,
          tags: entry.tags,
          validationStatus: entry.validationStatus,
          lastValidatedAt: entry.lastValidatedAt,
          publishedAt: new Date().toISOString(),
          versionLabel: input.versionLabel,
          changeNotes: input.changeNotes || null,
        };

        const snapshotHash = createHash("sha256")
          .update(JSON.stringify(snapshot))
          .digest("hex");

        const bundle = await createPublishBundle({
          catalogEntryId: input.catalogEntryId,
          versionLabel: input.versionLabel,
          snapshot,
          snapshotHash,
          publishedBy: 1,
          policyDecision: "pass", // Placeholder — Phase 4 will add real policy gate
        });

        // Mark entry as published
        await updateCatalogEntry(input.catalogEntryId, { status: "published" }, 1);

        audit("catalog.bundle.published", input.catalogEntryId, {
          bundleId: bundle.id, versionLabel: input.versionLabel, snapshotHash: snapshotHash,
        }, bundle.id);

        return bundle;
      } catch (e: any) {
        // Revert to validated on failure
        await updateCatalogEntry(input.catalogEntryId, { status: "validated" }, 1);
        throw new Error(`Publishing failed: ${e.message}`);
      }
    }),

  /**
   * Recall a published bundle — marks it as recalled
   */
  recall: publicProcedure
    .input(z.object({
      bundleId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      await recallPublishBundle(input.bundleId);
      audit("catalog.bundle.recalled", null, { bundleId: input.bundleId }, input.bundleId);
      return { success: true };
    }),
});
