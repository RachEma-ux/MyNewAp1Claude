import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { qdrantService } from "./qdrant-service";

/**
 * Vector Database Router
 * Exposes Qdrant vector database via tRPC
 */
export const vectordbRouter = router({
  /**
   * Create a collection
   */
  createCollection: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        vectorSize: z.number(),
        distance: z.enum(["Cosine", "Euclid", "Dot"]).default("Cosine"),
      })
    )
    .mutation(async ({ input }) => {
      await qdrantService.createCollection({
        name: input.name,
        vectorSize: input.vectorSize,
        distance: input.distance,
      });
      
      return { success: true, collection: input.name };
    }),
  
  /**
   * Delete a collection
   */
  deleteCollection: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      await qdrantService.deleteCollection(input.name);
      return { success: true };
    }),
  
  /**
   * List all collections
   */
  listCollections: protectedProcedure.query(async () => {
    return await qdrantService.listCollections();
  }),
  
  /**
   * Insert vectors
   */
  insert: protectedProcedure
    .input(
      z.object({
        collection: z.string(),
        vectors: z.array(z.array(z.number())),
        payloads: z.array(z.record(z.string(), z.any())),
        ids: z.array(z.union([z.string(), z.number()])).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await qdrantService.insert(input);
      
      return { success: true, count: input.vectors.length };
    }),
  
  /**
   * Search for similar vectors
   */
  search: protectedProcedure
    .input(
      z.object({
        collection: z.string(),
        query: z.array(z.number()),
        limit: z.number().optional(),
        scoreThreshold: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return await qdrantService.search(input);
    }),
  
  /**
   * Hybrid search (semantic + keyword)
   */
  hybridSearch: protectedProcedure
    .input(
      z.object({
        collection: z.string(),
        query: z.array(z.number()),
        keywords: z.array(z.string()),
        limit: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return await qdrantService.hybridSearch(
        input.collection,
        input.query,
        input.keywords,
        input.limit
      );
    }),
  
  /**
   * Get collection info
   */
  getCollectionInfo: protectedProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      return await qdrantService.getCollectionInfo(input.name);
    }),
  
  /**
   * Count vectors in collection
   */
  count: protectedProcedure
    .input(z.object({ collection: z.string() }))
    .query(async ({ input }) => {
      return await qdrantService.count(input.collection);
    }),
});
