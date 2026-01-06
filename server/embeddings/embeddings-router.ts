import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { embeddingEngine } from "./embedding-engine";

/**
 * Embeddings Router
 * Exposes embedding engine via tRPC
 */
export const embeddingsRouter = router({
  /**
   * Generate embeddings for texts
   */
  generate: protectedProcedure
    .input(
      z.object({
        texts: z.array(z.string()),
        model: z.enum(["bge-large-en", "bge-base-en", "minilm-l6", "e5-large", "e5-base"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const response = await embeddingEngine.generate({
        texts: input.texts,
        model: input.model,
      });
      
      return response;
    }),
  
  /**
   * Get available embedding models
   */
  getAvailableModels: protectedProcedure.query(async () => {
    return embeddingEngine.getAvailableModels();
  }),
  
  /**
   * Get cache statistics
   */
  getCacheStats: protectedProcedure.query(async () => {
    return embeddingEngine.getCacheStats();
  }),
  
  /**
   * Clear embedding cache
   */
  clearCache: protectedProcedure.mutation(async () => {
    embeddingEngine.clearCache();
    return { success: true };
  }),
});
