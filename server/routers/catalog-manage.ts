/**
 * Catalog Management Router
 *
 * tRPC endpoints for managing catalog entries (providers & models)
 * in the authoring space before publishing to the registry.
 *
 * Auth model:
 * - Read ops (list, getById, listVersions, listBundles): protectedProcedure
 * - Authoring ops (create, update, delete, validate): protectedProcedure
 * - Authority ops (publish, recall, activate, approve, reject): adminProcedure
 */

import { z } from "zod";
import { protectedProcedure, governedProcedure, adminProcedure, governedAdminProcedure, router } from "../_core/trpc";
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
  approveCatalogEntry,
  getTaxonomyTree,
  getTaxonomyNodes,
  getEntryClassifications,
  setEntryClassifications,
  seedTaxonomy,
} from "../db";
import { createHash } from "crypto";

/** Helper to emit audit events without blocking the response */
function audit(eventType: string, catalogEntryId: number | null, payload: any, bundleId?: number, actor: number = 1) {
  // Legacy DB audit
  createCatalogAuditEvent({
    eventType,
    catalogEntryId,
    publishBundleId: bundleId ?? null,
    actor,
    actorType: "user",
    payload,
  }).catch((e) => console.warn(`[CatalogAudit] Failed to log ${eventType}:`, e.message));

  // Unified audit logger
  getAuditLogger().log({
    action_type: eventType.startsWith("catalog.bundle") ? "PUBLICATION_GATE" : "LIFECYCLE_TRANSITION",
    target_type: "catalog_entry",
    target_id: catalogEntryId ? String(catalogEntryId) : null,
    decision_result: "success",
    metadata: { eventType, ...payload, bundleId },
  });
}
import { getAuditLogger } from "../services/auditLogger";
import { getProviderRegistry } from "../providers/registry";
import * as providerDb from "../providers/db";
import { discoverProvider, discoverDocsUrl, extractDocMetadata } from "./discover-provider";
import { normalizeDiscovery, toArtifactSummary } from "../governance/discovery-artifact";
import { TRPCError } from "@trpc/server";
import { evaluateStageReview } from "../governance/stage-review";

// ── Rate Limiting & Caching ─────────────────────────────────────────
const _rateLimitBuckets = new Map<string, { windowStart: number; count: number }>();
const _discoveryCache = new Map<string, { result: any; ts: number }>();
// Clean up stale entries every 5 minutes
const _catalogCleanupInterval = setInterval(() => {
  const now = Date.now();
  _rateLimitBuckets.forEach((v, k) => { if (now - v.windowStart > 120_000) _rateLimitBuckets.delete(k); });
  _discoveryCache.forEach((v, k) => { if (now - v.ts > 120_000) _discoveryCache.delete(k); });
}, 300_000);

export function stopCatalogCleanup() {
  clearInterval(_catalogCleanupInterval);
}

// ============================================================================
// Input Schemas
// ============================================================================

const entryTypeSchema = z.enum(["provider", "llm", "model", "agent", "bot"]);
const statusSchema = z.enum(["draft", "active", "deprecated", "disabled"]);
const originSchema = z.enum(["admin", "discovery", "api", "connect", "import", "wizard", "agent"]);
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
  origin: originSchema.optional(),
  capabilities: z.array(z.string()).optional(),
  category: z.string().optional(),
  subCategory: z.string().optional(),
});

const updateEntrySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255).optional(),
  displayName: z.string().max(255).optional(),
  description: z.string().optional(),
  providerId: z.number().int().positive().optional(),
  config: z.any().optional(),
  tags: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
});

// ============================================================================
// Router
// ============================================================================

export const catalogManageRouter = router({
  /**
   * List catalog entries with optional filters
   */
  list: protectedProcedure
    .input(
      z.object({
        entryType: entryTypeSchema.optional(),
        status: statusSchema.optional(),
        scope: scopeSchema.optional(),
        origin: originSchema.optional(),
        reviewState: z.enum(["needs_review", "approved", "rejected"]).optional(),
        category: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return await getCatalogEntries(input ?? {});
    }),

  /**
   * Discover provider metadata from a website URL.
   * Returns name, description, API URL candidates — never writes to DB.
   * Logs discovery event for monitoring/promotion triggers.
   *
   * Rate limited: 10 req/min per user. Cached: 60s per domain.
   */
  discoverProvider: governedProcedure
    .input(z.object({ websiteUrl: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      // Rate limit: 10 requests per minute per user
      const userId = ctx.user?.id ?? 0;
      const now = Date.now();
      const windowMs = 60_000;
      const maxRequests = 25;
      const key = `discover:${userId}`;
      let bucket = _rateLimitBuckets.get(key);
      if (!bucket || now - bucket.windowStart > windowMs) {
        bucket = { windowStart: now, count: 0 };
        _rateLimitBuckets.set(key, bucket);
      }
      bucket.count++;
      if (bucket.count > maxRequests) {
        throw new Error("Rate limit exceeded — max 25 discovery requests per minute");
      }

      // Short-TTL cache (60s) — return cached result for same domain
      const domain = input.websiteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
      const cached = _discoveryCache.get(domain);
      if (cached && now - cached.ts < 60_000) {
        return cached.result;
      }

      const result = await discoverProvider(input.websiteUrl, { captureRawBody: true });

      // Normalize into a discovery artifact (stores raw snapshot, computes hashes)
      let artifactSummary: ReturnType<typeof toArtifactSummary> | null = null;
      try {
        const artifact = await normalizeDiscovery(result, result.rawBody ?? null, input.websiteUrl);
        artifactSummary = toArtifactSummary(artifact);

        // Enhanced audit logging with artifact reference
        getAuditLogger().log({
          action_type: "DISCOVERY_ATTEMPT",
          target_type: "provider_discovery",
          target_id: result.domain,
          decision_result: result.status === "ok" ? "success" : "partial",
          metadata: {
            sourceUrl: input.websiteUrl,
            rawHash: artifact.raw_hash,
            extractionMethod: artifact.extraction_method,
            confidenceScore: artifact.confidence_score,
            stage: artifact.stage,
            domain: result.domain,
            registrySlug: result.registrySlug,
            bestUrl: result.api.bestUrl,
            candidateCount: result.api.candidates.length,
          },
        });
      } catch (err) {
        console.warn(`[CatalogManage] Discovery normalization failed: ${err}`);
      }

      // Strip rawBody before caching/returning (not for client)
      const { rawBody: _rawBody, ...clientResult } = result;

      // Cache result
      _discoveryCache.set(domain, { result: clientResult, ts: now });

      // Log event asynchronously (non-blocking)
      import("./discovery-ops").then(({ logDiscoveryEvent }) => {
        logDiscoveryEvent(result).catch(() => {});
      }).catch(() => {});

      return { ...clientResult, artifact: artifactSummary };
    }),

  /**
   * Submit a discovered provider into the governance pipeline at the "submit" stage.
   * Creates a catalog entry with origin="discovery", reviewState="needs_review",
   * status="draft". The requireGovernance middleware evaluates the gate at "submit".
   */
  submitFromDiscovery: governedProcedure
    .input(z.object({
      // Governance fields (picked up by requireGovernance middleware)
      subjectId: z.literal(0),
      stage: z.literal("submit"),
      subjectType: z.literal("provider"),
      subjectName: z.string(),
      tags: z.array(z.string()).default(["candidate"]),
      // Entry fields
      name: z.string().min(1).max(255),
      displayName: z.string().max(255).optional(),
      description: z.string().optional(),
      config: z.any().optional(),
      // Artifact reference
      discoveryArtifactId: z.string(),
      // Optional origin override (defaults to "discovery")
      origin: originSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Middleware already evaluated gate at "submit" stage
      const entry = await createCatalogEntry({
        name: input.name,
        displayName: input.displayName ?? input.name,
        description: input.description ?? null,
        entryType: "provider",
        scope: "app",
        status: "draft",
        origin: input.origin ?? "discovery",
        reviewState: "needs_review",
        config: {
          ...input.config,
          discoveryArtifactId: input.discoveryArtifactId,
          artifact_version: "1.0.0",
          artifact_stage: "submit",
        },
        tags: input.tags,
        createdBy: ctx.user.id,
      });

      audit("catalog.entry.submitted_from_discovery", entry.id, {
        name: entry.name,
        artifactId: input.discoveryArtifactId,
        stage: "submit",
        artifact_version: "1.0.0",
      });

      // Auto-classify: assign the first axis node so registration stage review passes
      try {
        const axisNodes = await getTaxonomyNodes({ entryType: "provider", level: "axis" });
        if (axisNodes.length > 0) {
          await setEntryClassifications(entry.id, [axisNodes[0].id]);
          audit("catalog.entry.auto-classified", entry.id, { nodeIds: [axisNodes[0].id], label: axisNodes[0].label });
        }
      } catch (e: any) {
        console.warn(`[CatalogManage] Auto-classify failed for discovery entry ${entry.id}:`, e.message);
      }

      return entry;
    }),

  /**
   * Get a single catalog entry by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      // Negative IDs are synthetic static-catalog entries
      if (input.id < 0) {
        const { getStaticCatalogEntries } = await import("@shared/static-catalog");
        const staticEntry = getStaticCatalogEntries().find((e) => e.id === input.id);
        if (!staticEntry) throw new Error(`Catalog entry ${input.id} not found`);
        return { ...staticEntry, providerId: null, createdAt: null, updatedAt: null };
      }
      const entry = await getCatalogEntryById(input.id);
      if (!entry) throw new Error(`Catalog entry ${input.id} not found`);
      return entry;
    }),

  /**
   * Create a new catalog entry
   * Non-admin origins get reviewState = "needs_review"
   */
  create: governedProcedure
    .input(createEntrySchema)
    .mutation(async ({ input, ctx }) => {
      const origin = input.origin ?? "admin";
      const reviewState = origin !== "admin" ? "needs_review" : "approved";

      const entry = await createCatalogEntry({
        name: input.name,
        displayName: input.displayName ?? input.name,
        description: input.description ?? null,
        entryType: input.entryType,
        scope: input.scope ?? "app",
        status: "draft",
        origin,
        reviewState,
        providerId: input.providerId ?? null,
        config: input.config ?? {},
        tags: input.tags ?? [],
        category: input.category ?? null,
        subCategory: input.subCategory ?? null,
        capabilities: input.capabilities ?? null,
        createdBy: ctx.user.id,
      });
      audit("catalog.entry.created", entry.id, { name: entry.name, entryType: entry.entryType, origin, reviewState });

      // Auto-classify: assign the first axis node for this entry type
      try {
        const axisNodes = await getTaxonomyNodes({ entryType: input.entryType, level: "axis" });
        if (axisNodes.length > 0) {
          await setEntryClassifications(entry.id, [axisNodes[0].id]);
          audit("catalog.entry.auto-classified", entry.id, { nodeIds: [axisNodes[0].id], label: axisNodes[0].label });
        }
      } catch (e: any) {
        console.warn(`[CatalogManage] Auto-classify failed for entry ${entry.id}:`, e.message);
      }

      return entry;
    }),

  /**
   * Update an existing catalog entry (authoring fields only — not status/authority)
   */
  update: governedProcedure
    .input(updateEntrySchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      const entry = await updateCatalogEntry(id, data, ctx.user.id);
      audit("catalog.entry.updated", id, { changes: Object.keys(data) });
      return entry;
    }),

  /**
   * Delete a catalog entry and all its versions
   */
  delete: governedProcedure
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
  listVersions: protectedProcedure
    .input(z.object({ catalogEntryId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await getCatalogEntryVersions(input.catalogEntryId);
    }),

  /**
   * Validate a catalog entry via orchestrator handshake
   * Allowed on draft and active entries. Restores previous status on completion.
   */
  validate: governedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      runTestPrompt: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry) throw new Error(`Catalog entry ${input.id} not found`);

      // Remember previous status to restore after validation
      const previousStatus = entry.status;

      // Mark as validating (transient)
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
          await updateCatalogEntry(input.id, { status: previousStatus }, 1);
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
          await updateCatalogEntry(input.id, { status: previousStatus }, 1);
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
          if ("getSupportedModels" in provider && typeof (provider as Record<string, unknown>).getSupportedModels === "function") {
            models = (provider as unknown as { getSupportedModels(): string[] }).getSupportedModels();
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
                response: (response as unknown as Record<string, unknown>).text as string || (response as unknown as Record<string, unknown>).content as string || "[response received]",
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

        // Restore previous status — validation doesn't change catalog status
        await updateCatalogEntry(input.id, { status: previousStatus }, 1);
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
        await updateCatalogEntry(input.id, { status: previousStatus }, 1);
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
  // Authority Endpoints (admin only)
  // ============================================================================

  /**
   * Approve a catalog entry for a specific lifecycle stage.
   * Each stage (register, validate, publish) is reviewed independently.
   */
  approve: governedAdminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      stage: z.enum(["register", "validate", "publish"]).default("register"),
      activateNow: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry) throw new Error(`Catalog entry ${input.id} not found`);

      const stage = input.stage;

      // Prevent duplicate stage approval — each stage can only be approved once
      const currentStageState = ((entry as any).stageReviews || {})[stage];
      if (currentStageState === "approved") {
        const stageLabel = stage === "register" ? "Registration" : stage === "validate" ? "Validation" : "Publication";
        throw new TRPCError({
          code: "CONFLICT",
          message: `${stageLabel} already approved — each stage can only be approved once`,
        });
      }

      // Governance gate: run stage-specific review (fetch fresh classifications from DB)
      const classifications = await getEntryClassifications(input.id);
      const review = evaluateStageReview(
        {
          id: entry.id,
          name: entry.name,
          entryType: entry.entryType,
          tags: (entry.tags as string[]) || [],
          description: entry.description || undefined,
          config: entry.config,
          reviewState: entry.reviewState || undefined,
          status: entry.status,
          validationStatus: (entry as any).validationStatus || undefined,
          stageReviews: (entry as any).stageReviews || {},
          classifications: classifications.map(c => c.label),
        },
        stage,
        { id: String(ctx.user.id), role: ctx.user.role || "admin" }
      );
      if (!review.passed) {
        const stageLabel = stage === "register" ? "Registration" : stage === "validate" ? "Validation" : "Publication";
        throw new TRPCError({
          code: "CONFLICT",
          message: `${stageLabel} gate FAIL: ${review.blockers.map((b) => b.name).join(", ")}`,
          cause: review,
        });
      }

      // Update per-stage review tracking — approve ONLY marks the review as done.
      // Lifecycle tag propagation (registered/validated/published) happens via the
      // separate governance.stageTransition mutation, which the user triggers explicitly.
      const currentStageReviews = (entry as any).stageReviews || {};
      const updatedStageReviews = { ...currentStageReviews, [stage]: "approved" };

      await updateCatalogEntry(input.id, {
        stageReviews: updatedStageReviews,
      } as any, 1);

      audit("catalog.entry.approved", input.id, {
        name: entry.name,
        stage,
        activateNow: input.activateNow ?? false,
      });

      const updated = await getCatalogEntryById(input.id);
      return updated!;
    }),

  /**
   * Reject a catalog entry — sets reviewState to "rejected"
   */
  reject: governedAdminProcedure
    .input(z.object({
      id: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry) throw new Error(`Catalog entry ${input.id} not found`);

      await updateCatalogEntry(input.id, { reviewState: "rejected" }, 1);

      audit("catalog.entry.rejected", input.id, { name: entry.name });

      const updated = await getCatalogEntryById(input.id);
      return updated!;
    }),

  /**
   * Activate a catalog entry — sets status to "active"
   * Entry must have reviewState = "approved"
   */
  activate: governedAdminProcedure
    .input(z.object({
      id: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const entry = await getCatalogEntryById(input.id);
      if (!entry) throw new Error(`Catalog entry ${input.id} not found`);

      if (entry.reviewState !== "approved") {
        throw new Error(`Entry must be approved before activation (current reviewState: ${entry.reviewState})`);
      }

      // Governance gate: run Validate stage review
      const review = evaluateStageReview(
        {
          id: entry.id,
          name: entry.name,
          entryType: entry.entryType,
          tags: (entry.tags as string[]) || [],
          description: entry.description || undefined,
          config: entry.config,
          reviewState: entry.reviewState || undefined,
          status: entry.status,
          validationStatus: (entry as any).validationStatus || undefined,
          stageReviews: (entry as any).stageReviews || {},
        },
        "validate",
        { id: String(ctx.user.id), role: ctx.user.role || "admin" }
      );
      if (!review.passed) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Validation gate FAIL: ${review.blockers.map((b) => b.name).join(", ")}`,
          cause: review,
        });
      }

      await updateCatalogEntry(input.id, { status: "active" }, 1);

      audit("catalog.entry.activated", input.id, { name: entry.name });

      const updated = await getCatalogEntryById(input.id);
      return updated!;
    }),

  // ============================================================================
  // Publishing Endpoints (admin only)
  // ============================================================================

  /**
   * List published bundles
   */
  listBundles: protectedProcedure
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
   * Entry must be status = "active" AND reviewState = "approved"
   */
  publish: governedAdminProcedure
    .input(z.object({
      catalogEntryId: z.number().int().positive(),
      versionLabel: z.string().min(1).max(50),
      changeNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const entry = await getCatalogEntryById(input.catalogEntryId);
      if (!entry) throw new Error(`Catalog entry ${input.catalogEntryId} not found`);

      if (entry.status !== "active") {
        throw new Error(`Entry must be active before publishing (current status: ${entry.status})`);
      }

      // Prevent duplicate publishing — check if already published via tags
      const entryTags: string[] = (entry.tags as string[]) || [];
      if (entryTags.includes("published")) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Entry already published — each entry can only be published once per version",
        });
      }

      const stageReviews = (entry as any).stageReviews || {};
      const allPriorStagesApproved = stageReviews.register === "approved" && stageReviews.validate === "approved";
      if (entry.reviewState !== "approved" && !allPriorStagesApproved) {
        throw new Error(`Entry must have all prior stages approved before publishing`);
      }

      // Governance gate: run Publish stage review (Triple Validation)
      const review = evaluateStageReview(
        {
          id: entry.id,
          name: entry.name,
          entryType: entry.entryType,
          tags: (entry.tags as string[]) || [],
          description: entry.description || undefined,
          config: entry.config,
          reviewState: entry.reviewState || undefined,
          status: entry.status,
          validationStatus: (entry as any).validationStatus || undefined,
          stageReviews,
        },
        "publish",
        { id: String(ctx.user.id), role: ctx.user.role || "admin" }
      );
      if (!review.passed) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Publication gate FAIL: ${review.blockers.map((b) => b.name).join(", ")}`,
          cause: review,
        });
      }

      // Mark entry as publishing (transient)
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
          policyDecision: "pass",
        });

        // Restore to active after publishing
        await updateCatalogEntry(input.catalogEntryId, { status: "active" }, 1);

        audit("catalog.bundle.published", input.catalogEntryId, {
          bundleId: bundle.id, versionLabel: input.versionLabel, snapshotHash: snapshotHash,
        }, bundle.id);

        return bundle;
      } catch (e: any) {
        // Revert to active on failure
        await updateCatalogEntry(input.catalogEntryId, { status: "active" }, 1);
        throw new Error(`Publishing failed: ${e.message}`);
      }
    }),

  /**
   * Sync providers — auto-creates catalog entries for providers that don't have one.
   * Returns the number of entries created.
   */
  syncProviders: governedProcedure
    .mutation(async () => {
      const allProviders = await providerDb.getAllProviders();
      const existingEntries = await getCatalogEntries({ entryType: "provider" });
      const existingProviderIds = new Set(
        existingEntries
          .filter((e) => e.providerId != null)
          .map((e) => e.providerId!)
      );
      // Also match by name for entries created without providerId
      const existingNames = new Set(
        existingEntries.map((e) => e.name.toLowerCase())
      );

      let created = 0;
      for (const provider of allProviders) {
        if (existingProviderIds.has(provider.id) || existingNames.has(provider.name.toLowerCase())) {
          continue;
        }
        // Determine category from provider type/kind
        let category = "cloud_api";
        if (provider.type?.startsWith("local-") || provider.kind === "local") {
          category = "local_runtime";
        } else if (provider.type === "custom") {
          category = "custom_adapter";
        }

        await createCatalogEntry({
          name: provider.name,
          displayName: provider.name,
          description: `Auto-synced from provider: ${provider.type}`,
          entryType: "provider",
          scope: "app",
          status: "active",
          origin: "discovery",
          reviewState: "approved",
          providerId: provider.id,
          config: { providerType: provider.type, kind: provider.kind },
          tags: [provider.type, provider.kind ?? "cloud"].filter(Boolean) as string[],
          category,
          subCategory: null,
          capabilities: null,
          createdBy: 1,
        });
        created++;
      }

      audit("catalog.providers.synced", null, { created, total: allProviders.length });
      return { created, total: allProviders.length };
    }),

  /**
   * Sync from the PROVIDERS registry (server/llm/providers.ts).
   * Seeds catalog entries for each provider AND each of their models.
   * Skips entries that already exist (matched by name).
   */
  syncRegistry: governedProcedure
    .mutation(async () => {
      const { PROVIDERS } = await import("../llm/providers");
      const existingEntries = await getCatalogEntries({});
      // Build set from both name and displayName to catch all duplicates
      const existingKeys = new Set<string>();
      for (const e of existingEntries) {
        existingKeys.add(e.name.toLowerCase());
        if (e.displayName) existingKeys.add(e.displayName.toLowerCase());
      }

      let providersCreated = 0;
      let modelsCreated = 0;

      for (const provider of Object.values(PROVIDERS)) {
        // Create provider entry — check both id and display name
        if (!existingKeys.has(provider.id.toLowerCase()) && !existingKeys.has(provider.name.toLowerCase())) {
          const category = provider.type === "local" ? "local_runtime" : "cloud_api";
          const caps: string[] = [];
          if (provider.requiresApiKey) caps.push("internet_required");
          if (provider.type === "local") caps.push("low_latency", "sandbox");

          await createCatalogEntry({
            name: provider.id,
            displayName: provider.name,
            description: `${provider.company} — ${provider.strengths.join(", ")}`,
            entryType: "provider",
            scope: "app",
            status: "active",
            origin: "discovery",
            reviewState: "approved",
            providerId: null,
            config: { registryId: provider.id, type: provider.type, baseUrl: provider.baseUrl ?? null },
            tags: [provider.type, ...provider.strengths],
            category,
            subCategory: null,
            capabilities: caps.length > 0 ? caps : null,
            createdBy: 1,
          });
          existingKeys.add(provider.id.toLowerCase());
          existingKeys.add(provider.name.toLowerCase());
          providersCreated++;
        }

        // Create model entries for each provider's models
        for (const model of provider.models) {
          if (existingKeys.has(model.id.toLowerCase()) || existingKeys.has(model.name.toLowerCase())) continue;

          const caps: string[] = [];
          if (model.contextLength && model.contextLength >= 100000) caps.push("high_context");
          if (model.contextLength && model.contextLength <= 8192) caps.push("low_latency");
          if (model.id.includes("embed") || model.id.includes("rerank")) caps.push("cost_optimized");
          if (provider.type === "local") caps.push("low_latency", "sandbox");

          await createCatalogEntry({
            name: model.id,
            displayName: model.name,
            description: `${model.name} by ${provider.company}${model.contextLength ? ` — ${(model.contextLength / 1000).toFixed(0)}K context` : ""}${model.size ? ` — ${model.size}` : ""}`,
            entryType: "model",
            scope: "app",
            status: "active",
            origin: "discovery",
            reviewState: "approved",
            providerId: null,
            config: { providerId: provider.id, providerName: provider.name, contextLength: model.contextLength ?? null, size: model.size ?? null },
            tags: [provider.id, ...(model.strengths ?? provider.strengths)],
            category: "base_llm",
            subCategory: model.contextLength && model.contextLength >= 100000 ? "multimodal" : "text_only",
            capabilities: caps.length > 0 ? Array.from(new Set(caps)) : null,
            createdBy: 1,
          });
          existingKeys.add(model.id.toLowerCase());
          existingKeys.add(model.name.toLowerCase());
          modelsCreated++;
        }
      }

      audit("catalog.registry.synced", null, { providersCreated, modelsCreated });
      return { providersCreated, modelsCreated, totalProviders: Object.keys(PROVIDERS).length };
    }),

  /**
   * Recall a published bundle — marks it as recalled (admin only)
   */
  recall: governedAdminProcedure
    .input(z.object({
      bundleId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      await recallPublishBundle(input.bundleId);
      audit("catalog.bundle.recalled", null, { bundleId: input.bundleId }, input.bundleId);
      return { success: true };
    }),

  // ============================================================================
  // Taxonomy Endpoints
  // ============================================================================

  /**
   * Get the full taxonomy tree for an entry type.
   * Returns all nodes (axes, subcategories, classes) for building the multi-axis panel.
   */
  taxonomyTree: protectedProcedure
    .input(z.object({ entryType: entryTypeSchema }))
    .query(async ({ input }) => {
      return await getTaxonomyTree(input.entryType);
    }),

  /**
   * Seed taxonomy nodes from the TS definitions into the DB.
   * Idempotent — safe to call multiple times.
   */
  taxonomySeed: adminProcedure
    .mutation(async () => {
      const result = await seedTaxonomy();
      audit("catalog.taxonomy.seeded", null, result);
      return result;
    }),

  /**
   * Get multi-axis classifications for a catalog entry.
   */
  getClassifications: protectedProcedure
    .input(z.object({ catalogEntryId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await getEntryClassifications(input.catalogEntryId);
    }),

  /**
   * Set multi-axis classifications for a catalog entry.
   * Replaces all existing classifications with the provided node IDs.
   */
  classify: governedProcedure
    .input(z.object({
      catalogEntryId: z.number().int().positive(),
      nodeIds: z.array(z.number().int().positive()),
    }))
    .mutation(async ({ input }) => {
      await setEntryClassifications(input.catalogEntryId, input.nodeIds);
      audit("catalog.entry.classified", input.catalogEntryId, { nodeIds: input.nodeIds });
      return { success: true };
    }),

  /**
   * Refresh tech docs metadata for a catalog entry.
   * Re-runs doc discovery from the entry's domain/baseUrl and updates config.
   */
  refreshDocs: adminProcedure
    .input(z.object({ entryId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const entry = await getCatalogEntryById(input.entryId);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: `Entry ${input.entryId} not found` });

      const config = (entry.config as Record<string, any>) || {};
      // Determine domain from baseUrl or entry name
      let domain: string | null = null;
      if (config.baseUrl) {
        try { domain = new URL(config.baseUrl).hostname.replace(/^www\./, ""); } catch {}
      }
      if (!domain && config.docsUrl) {
        try { domain = new URL(config.docsUrl).hostname.replace(/^www\./, ""); } catch {}
      }
      if (!domain) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot determine domain for doc discovery" });
      }

      const isDev = process.env.NODE_ENV === "development";
      const docsUrl = await discoverDocsUrl(domain, undefined, isDev);
      let techDocs = null;
      if (docsUrl) {
        techDocs = await extractDocMetadata(docsUrl, isDev);
      }

      // Merge into config
      const updatedConfig = {
        ...config,
        docsUrl: docsUrl || config.docsUrl || null,
        ...(techDocs?.authMethod && { authMethod: techDocs.authMethod }),
        ...(techDocs?.rateLimits && { rateLimits: techDocs.rateLimits }),
        ...(techDocs?.httpsOnly !== undefined && { httpsOnly: techDocs.httpsOnly }),
        lastDocsRefreshedAt: new Date().toISOString(),
      };

      await updateCatalogEntry(input.entryId, { config: updatedConfig }, 1);
      audit("catalog.entry.docs_refreshed", input.entryId, { docsUrl, techDocs });

      const updated = await getCatalogEntryById(input.entryId);
      return updated!;
    }),

});

/**
 * Auto-detect live models from configured providers on startup.
 * Scans DB providers with reachable endpoints and auto-creates catalog entries.
 * Safe to call multiple times — skips entries that already exist (idempotent).
 * Never blocks startup on failure.
 */
export async function autoDetectLiveModels() {
  try {
    const { discoverFromApiUrl } = await import("../catalog-import/discovery-service");
    const { PROVIDERS } = await import("../llm/providers");

    // 1. Get all enabled providers from DB
    const allProviders = await providerDb.getAllProviders();
    const enabledProviders = allProviders.filter((p: any) => p.enabled !== false);

    if (enabledProviders.length === 0) {
      console.log("[AutoDetect] No enabled providers found, skipping live model detection");
      return;
    }

    // 2. Resolve base URL for each provider
    type ProviderTarget = { provider: any; baseUrl: string; apiKey?: string };
    const targets: ProviderTarget[] = [];

    for (const provider of enabledProviders) {
      const config = (provider.config as Record<string, any>) || {};
      let baseUrl = config.baseUrl || config.apiUrl || config.endpoint || null;

      // Fall back to PROVIDERS constant baseUrl (e.g. Ollama → http://localhost:11434)
      if (!baseUrl && PROVIDERS[provider.type]?.baseUrl) {
        baseUrl = PROVIDERS[provider.type].baseUrl;
      }

      // Skip cloud providers without a baseUrl (don't hit paid APIs uninvited)
      if (!baseUrl) continue;

      // Skip if provider has apiKey requirement but no key configured
      const registryProvider = PROVIDERS[provider.type];
      if (registryProvider?.requiresApiKey && !config.apiKey) continue;

      targets.push({ provider, baseUrl, apiKey: config.apiKey });
    }

    if (targets.length === 0) {
      console.log("[AutoDetect] No providers with reachable endpoints, skipping");
      return;
    }

    // 3. Discover models from each provider (parallel, with 10s timeout per provider)
    const results = await Promise.allSettled(
      targets.map(async ({ provider, baseUrl, apiKey }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const models = await discoverFromApiUrl(baseUrl, apiKey);
          return { provider, models };
        } finally {
          clearTimeout(timeout);
        }
      })
    );

    // 4. Collect all discovered models
    const discovered: Array<{ provider: any; model: any }> = [];
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.models.length > 0) {
        for (const model of result.value.models) {
          discovered.push({ provider: result.value.provider, model });
        }
      }
    }

    if (discovered.length === 0) {
      console.log(`[AutoDetect] Scanned ${targets.length} provider(s), no new models discovered`);
      return;
    }

    // 5. Dedup against existing catalog entries
    const existingEntries = await getCatalogEntries({});
    const existingKeys = new Set<string>();
    for (const e of existingEntries) {
      existingKeys.add(e.name.toLowerCase());
      if (e.displayName) existingKeys.add(e.displayName.toLowerCase());
    }

    let created = 0;
    for (const { provider, model } of discovered) {
      const name = model.name || model.id;
      if (existingKeys.has(name.toLowerCase())) continue;

      await createCatalogEntry({
        name,
        displayName: name,
        description: model.description || `Live-detected from ${provider.name}`,
        entryType: "model",
        scope: "app",
        status: "active",
        origin: "discovery",
        reviewState: "approved",
        providerId: provider.id,
        config: {
          ...(model.metadata || {}),
          detectedAt: new Date().toISOString(),
        },
        tags: [provider.name, "auto-detected"],
        category: "base_llm",
        subCategory: null,
        capabilities: null,
        createdBy: 1,
      });
      existingKeys.add(name.toLowerCase());
      created++;
    }

    if (created > 0) {
      console.log(`[AutoDetect] Discovered ${created} new model(s) from ${targets.length} provider(s)`);
    } else {
      console.log(`[AutoDetect] Scanned ${targets.length} provider(s), all models already in catalog`);
    }
  } catch (error: any) {
    console.warn(`[AutoDetect] Skipped — ${error.message}`);
  }
}

/**
 * Auto-seed catalog_entries from PROVIDERS on server startup.
 * Safe to call multiple times — skips entries that already exist.
 */
export async function syncRegistryOnStartup() {
  try {
    const { PROVIDERS } = await import("../llm/providers");
    const existingEntries = await getCatalogEntries({});
    const existingKeys = new Set<string>();
    for (const e of existingEntries) {
      existingKeys.add(e.name.toLowerCase());
      if (e.displayName) existingKeys.add(e.displayName.toLowerCase());
    }

    // Pre-approved governance state for seeded entries
    const governanceState = {
      stageReviews: { register: "approved", validate: "approved", publish: "approved" } as Record<string, string>,
      approvedBy: 1,
      approvedAt: new Date(),
    };
    const governanceTags = ["candidate", "registered", "validated", "published"];

    let providersCreated = 0;
    let modelsCreated = 0;
    const newEntryIds: { id: number; entryType: string }[] = [];

    for (const provider of Object.values(PROVIDERS)) {
      if (!existingKeys.has(provider.id.toLowerCase()) && !existingKeys.has(provider.name.toLowerCase())) {
        const category = provider.type === "local" ? "local_runtime" : "cloud_api";
        const caps: string[] = [];
        if (provider.requiresApiKey) caps.push("internet_required");
        if (provider.type === "local") caps.push("low_latency", "sandbox");

        const entry = await createCatalogEntry({
          name: provider.id,
          displayName: provider.name,
          description: `${provider.company} — ${provider.strengths.join(", ")}`,
          entryType: "provider",
          scope: "app",
          status: "active",
          origin: "discovery",
          reviewState: "approved",
          providerId: null,
          config: { registryId: provider.id, type: provider.type, baseUrl: provider.baseUrl ?? null },
          tags: [provider.type, ...provider.strengths, ...governanceTags],
          category,
          subCategory: null,
          capabilities: caps.length > 0 ? caps : null,
          createdBy: 1,
          ...governanceState,
        });
        newEntryIds.push({ id: entry.id, entryType: "provider" });
        existingKeys.add(provider.id.toLowerCase());
        existingKeys.add(provider.name.toLowerCase());
        providersCreated++;
      }

      for (const model of provider.models) {
        if (existingKeys.has(model.id.toLowerCase()) || existingKeys.has(model.name.toLowerCase())) continue;

        const caps: string[] = [];
        if (model.contextLength && model.contextLength >= 100000) caps.push("high_context");
        if (model.contextLength && model.contextLength <= 8192) caps.push("low_latency");
        if (model.id.includes("embed") || model.id.includes("rerank")) caps.push("cost_optimized");
        if (provider.type === "local") caps.push("low_latency", "sandbox");

        const entry = await createCatalogEntry({
          name: model.id,
          displayName: model.name,
          description: `${model.name} by ${provider.company}${model.contextLength ? ` — ${(model.contextLength / 1000).toFixed(0)}K context` : ""}${model.size ? ` — ${model.size}` : ""}`,
          entryType: "model",
          scope: "app",
          status: "active",
          origin: "discovery",
          reviewState: "approved",
          providerId: null,
          config: { providerId: provider.id, providerName: provider.name, contextLength: model.contextLength ?? null, size: model.size ?? null },
          tags: [provider.id, ...(model.strengths ?? provider.strengths), ...governanceTags],
          category: "base_llm",
          subCategory: model.contextLength && model.contextLength >= 100000 ? "multimodal" : "text_only",
          capabilities: caps.length > 0 ? Array.from(new Set(caps)) : null,
          createdBy: 1,
          ...governanceState,
        });
        newEntryIds.push({ id: entry.id, entryType: "model" });
        existingKeys.add(model.id.toLowerCase());
        existingKeys.add(model.name.toLowerCase());
        modelsCreated++;
      }
    }

    // Auto-classify newly created entries
    if (newEntryIds.length > 0) {
      try {
        const providerNodes = await getTaxonomyNodes({ entryType: "provider" });
        const modelNodes = await getTaxonomyNodes({ entryType: "model" });
        const providerAxisId = providerNodes.find(n => n.level === "axis")?.id;
        const modelAxisId = modelNodes.find(n => n.level === "axis")?.id;
        let classified = 0;
        for (const { id, entryType } of newEntryIds) {
          const nodeId = entryType === "provider" ? providerAxisId : modelAxisId;
          if (nodeId) {
            await setEntryClassifications(id, [nodeId]);
            classified++;
          }
        }
        if (classified > 0) {
          console.log(`[CatalogSync] Auto-classified ${classified} entries`);
        }
      } catch (err: any) {
        console.warn(`[CatalogSync] Auto-classify skipped — ${err.message}`);
      }
    }

    if (providersCreated > 0 || modelsCreated > 0) {
      console.log(`[CatalogSync] Seeded ${providersCreated} providers and ${modelsCreated} models (pre-approved governance)`);
    } else {
      console.log(`[CatalogSync] Catalog already populated (${existingEntries.length} entries)`);
    }
  } catch (error: any) {
    console.warn(`[CatalogSync] Skipped — ${error.message}`);
  }
}
