import { router, protectedProcedure } from "../_core/trpc";
import { detectHardware, isModelCompatible } from "./detection-service";
import { resourceManager } from "../inference/resource-manager";
import { modelCache } from "../inference/model-cache";
import { z } from "zod";

/**
 * Hardware Detection Router
 * Provides endpoints for hardware detection and model compatibility checks
 */

export const hardwareRouter = router({
  /**
   * Get current hardware profile
   */
  getProfile: protectedProcedure.query(async () => {
    const profile = await detectHardware();
    return profile;
  }),

  /**
   * Check if a model is compatible with current hardware
   */
  checkCompatibility: protectedProcedure
    .input(
      z.object({
        modelSizeGB: z.number(),
      })
    )
    .query(async ({ input }) => {
      const profile = await detectHardware();
      const result = isModelCompatible(input.modelSizeGB, profile);
      return result;
    }),

  /**
   * Get resource allocation status
   */
  getResourceAllocation: protectedProcedure.query(() => {
    return resourceManager.getAllocation();
  }),

  /**
   * Get resource statistics
   */
  getResourceStatistics: protectedProcedure.query(() => {
    return resourceManager.getStatistics();
  }),

  /**
   * Get cache statistics
   */
  getCacheStatistics: protectedProcedure.query(() => {
    return modelCache.getStatistics();
  }),

  /**
   * Get cache entries
   */
  getCacheEntries: protectedProcedure.query(() => {
    return modelCache.getEntries();
  }),

  /**
   * Get prefetch recommendations
   */
  getPrefetchRecommendations: protectedProcedure.query(() => {
    return modelCache.getPrefetchRecommendations();
  }),

  /**
   * Clear model cache
   */
  clearCache: protectedProcedure.mutation(() => {
    modelCache.clear();
    return { success: true };
  }),
});
