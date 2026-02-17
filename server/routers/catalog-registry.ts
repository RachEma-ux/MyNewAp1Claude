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
} from "../db";

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
   * List for dropdown consumption — returns simplified active entries
   */
  listForDropdown: protectedProcedure
    .input(z.object({
      entryType: z.enum(["provider", "model"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const bundles = await getActiveBundles();
      return bundles
        .filter((b: any) => {
          if (!input?.entryType) return true;
          const snap = b.snapshot as any;
          return snap?.entryType === input.entryType;
        })
        .map((b: any) => {
          const snap = b.snapshot as any;
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
});
