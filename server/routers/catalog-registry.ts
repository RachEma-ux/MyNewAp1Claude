/**
 * Catalog Registry Router (Read-Only)
 *
 * Consumption-side endpoints for downstream consumers (dropdowns, agents, etc.)
 * to fetch published, immutable bundles from the registry.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getActiveBundles,
  getBundleByHash,
  getActiveBundleForEntry,
  getCatalogAuditEvents,
  listExecutionRuns,
  resolveCatalogAgentExecutionTarget,
  resolveServiceAgentExecutionTarget,
} from "../ai-types/public-api";

export const catalogRegistryRouter = router({
  /**
   * Get all active published bundles
   * Used by dropdowns and consumers to list available entries
   */
  getActive: protectedProcedure
    .query(async () => {
      return await getActiveBundles();
    }),

  /**
   * Lookup a bundle by its snapshot hash (integrity verification)
   */
  getByHash: protectedProcedure
    .input(z.object({ hash: z.string().length(64) }))
    .query(async ({ input }) => {
      const bundle = await getBundleByHash(input.hash);
      if (!bundle) throw new Error(`No bundle found with hash ${input.hash}`);
      return bundle;
    }),

  /**
   * Get the latest active bundle for a specific catalog entry
   */
  getByEntry: protectedProcedure
    .input(z.object({ catalogEntryId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const bundle = await getActiveBundleForEntry(input.catalogEntryId);
      if (!bundle) throw new Error(`No active bundle for entry ${input.catalogEntryId}`);
      return bundle;
    }),

  /**
   * Resolve a Catalog agent entry into an executable runtime target.
   * The Catalog entry is the execution authority for this path.
   */
  getAgentExecutionTarget: protectedProcedure
    .input(z.object({ catalogEntryId: z.number().int().positive() }))
    .query(async ({ input }) => {
      // Service-backed agents have a different execution target shape
      const serviceTarget = await resolveServiceAgentExecutionTarget(input.catalogEntryId).catch(() => null);
      if (serviceTarget) {
        return {
          catalogEntryId: serviceTarget.entry.id,
          name: serviceTarget.entry.displayName || serviceTarget.entry.name,
          entryType: serviceTarget.entry.entryType,
          status: serviceTarget.entry.status,
          reviewState: serviceTarget.entry.reviewState,
          tags: serviceTarget.entry.tags,
          executionKind: "service" as const,
          serviceName: serviceTarget.serviceTarget.serviceName,
          serviceUrl: serviceTarget.serviceTarget.serviceUrl,
          bundleId: null,
          bundleVersionLabel: null,
          sourceAgentId: null,
          sourceAgentName: null,
          config: {
            serviceKind: serviceTarget.serviceTarget.serviceKind,
            capabilityTags: serviceTarget.serviceTarget.capabilityTags,
          },
        };
      }

      const target = await resolveCatalogAgentExecutionTarget(input.catalogEntryId);
      return {
        catalogEntryId: target.entry.id,
        name: target.entry.displayName || target.entry.name,
        entryType: target.entry.entryType,
        status: target.entry.status,
        reviewState: target.entry.reviewState,
        tags: target.entry.tags,
        executionKind: "llm_chat" as const,
        bundleId: target.bundle.id,
        bundleVersionLabel: target.bundle.versionLabel,
        sourceAgentId: target.sourceAgent.id,
        sourceAgentName: target.sourceAgent.name,
        config: {
          roleClass: target.executionConfig.roleClass,
          modelId: target.executionConfig.modelId,
          hasDocumentAccess: target.executionConfig.hasDocumentAccess,
          hasToolAccess: target.executionConfig.hasToolAccess,
          callable: target.executionConfig.callable,
        },
      };
    }),

  /**
   * List for dropdown consumption — returns simplified active entries
   */
  listForDropdown: protectedProcedure
    .input(z.object({
      entryType: z.enum(["provider", "model"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const bundles = await getActiveBundles();
      return bundles
        .filter((b) => {
          if (!input?.entryType) return true;
          const snap = b.snapshot as Record<string, unknown>;
          return snap?.entryType === input.entryType;
        })
        .map((b) => {
          const snap = b.snapshot as Record<string, unknown>;
          return {
            id: b.id,
            catalogEntryId: b.catalogEntryId,
            name: snap?.name || "",
            displayName: snap?.displayName || snap?.name || "",
            entryType: snap?.entryType || "unknown",
            versionLabel: b.versionLabel,
            snapshotHash: b.snapshotHash,
            config: snap?.config || {},
            tags: snap?.tags || [],
            publishedAt: b.publishedAt,
          };
        });
    }),

  /**
   * Get audit events for catalog management
   */
  auditLog: protectedProcedure
    .input(z.object({
      catalogEntryId: z.number().int().positive().optional(),
      eventType: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    }).optional())
    .query(async ({ input }) => {
      return await getCatalogAuditEvents(input ?? { limit: 50 });
    }),

  executionRuns: protectedProcedure
    .input(z.object({
      catalogEntryId: z.number().int().positive(),
      conversationId: z.number().int().positive().optional(),
      limit: z.number().int().positive().max(50).optional(),
    }))
    .query(async ({ input }) => {
      return await listExecutionRuns(input);
    }),
});
