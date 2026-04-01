/**
 * AI Types Taxonomy Router
 *
 * Dedicated endpoints for managing the multi-axis taxonomy system.
 * Owns browsing, editing, classification, and seeding of taxonomy nodes.
 *
 * Namespace: trpc.aiTypes.taxonomy.*
 */

import { z } from "zod";
import { protectedProcedure, adminProcedure, governedProcedure, router } from "../../_core/trpc";
import {
  getTaxonomyNodes,
  getTaxonomyTree,
  getTaxonomyChildren,
  getEntryClassifications,
  setEntryClassifications,
  seedTaxonomy,
  getCatalogEntries,
} from "../db";
import { getDb } from "../../db/connection";
import {
  taxonomyNodes,
  catalogEntryClassifications,
} from "../../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

const entryTypeSchema = z.enum(["provider", "llm", "model", "agent", "bot"]);

export const taxonomyRouter = router({
  /**
   * Get the full taxonomy tree for an entry type.
   * Returns all nodes (axes, subcategories, classes) for building the multi-axis panel.
   */
  tree: protectedProcedure
    .input(z.object({ entryType: entryTypeSchema }))
    .query(async ({ input }) => {
      return await getTaxonomyTree(input.entryType);
    }),

  /**
   * Get all taxonomy nodes, optionally filtered by entry type and level.
   */
  list: protectedProcedure
    .input(z.object({
      entryType: entryTypeSchema.optional(),
      level: z.enum(["axis", "subcategory", "class"]).optional(),
    }))
    .query(async ({ input }) => {
      return await getTaxonomyNodes(input);
    }),

  /**
   * Get child nodes of a specific taxonomy node.
   */
  children: protectedProcedure
    .input(z.object({ parentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await getTaxonomyChildren(input.parentId);
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
      return { success: true };
    }),

  /**
   * Seed taxonomy nodes from the TS definitions into the DB.
   * Idempotent — safe to call multiple times.
   */
  seed: adminProcedure
    .mutation(async () => {
      return await seedTaxonomy();
    }),

  /**
   * Get taxonomy coverage summary — how many entries per type have classifications.
   */
  coverage: protectedProcedure
    .query(async () => {
      const db = getDb();
      if (!db) return [];

      const entryTypes = ["provider", "llm", "model", "agent", "bot"] as const;
      const results = [];

      for (const entryType of entryTypes) {
        const entries = await getCatalogEntries({ entryType });
        const total = entries.length;

        // Count entries that have at least one classification
        let classified = 0;
        for (const entry of entries) {
          const classifications = await getEntryClassifications(entry.id);
          if (classifications.length > 0) classified++;
        }

        results.push({
          entryType,
          total,
          classified,
          unclassified: total - classified,
          coveragePercent: total > 0 ? Math.round((classified / total) * 100) : 0,
        });
      }

      return results;
    }),

  /**
   * Get taxonomy statistics — total nodes per entry type and level.
   */
  stats: protectedProcedure
    .query(async () => {
      const db = getDb();
      if (!db) return [];

      const rows = await db
        .select({
          entryType: taxonomyNodes.entryType,
          level: taxonomyNodes.level,
          count: sql<number>`count(*)::int`,
        })
        .from(taxonomyNodes)
        .groupBy(taxonomyNodes.entryType, taxonomyNodes.level)
        .orderBy(taxonomyNodes.entryType, taxonomyNodes.level);

      return rows;
    }),
});
