import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as analyticsService from "./analytics-service";

/**
 * Download Analytics tRPC Router
 * Provides bandwidth analytics, usage patterns, and statistics
 */

export const downloadAnalyticsRouter = router({
  // Get analytics for a specific download
  getByDownload: protectedProcedure
    .input(z.object({ downloadId: z.number() }))
    .query(async ({ input }) => {
      return analyticsService.getDownloadAnalytics(input.downloadId);
    }),

  // Get analytics for a model
  getByModel: protectedProcedure
    .input(z.object({ modelId: z.number() }))
    .query(async ({ input }) => {
      return analyticsService.getModelAnalytics(input.modelId);
    }),

  // Get user's analytics
  getMyAnalytics: protectedProcedure.query(async ({ ctx }) => {
    return analyticsService.getUserAnalytics(ctx.user.id);
  }),

  // Get analytics within time range
  getByTimeRange: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ input }) => {
      return analyticsService.getAnalyticsByTimeRange(input.startDate, input.endDate);
    }),

  // Get aggregated statistics
  getStats: protectedProcedure.query(async ({ ctx }) => {
    return analyticsService.getAggregatedStats(ctx.user.id);
  }),

  // Get peak usage times
  getPeakTimes: protectedProcedure.query(async ({ ctx }) => {
    return analyticsService.getPeakUsageTimes(ctx.user.id);
  }),

  // Get bandwidth per model
  getBandwidthPerModel: protectedProcedure.query(async ({ ctx }) => {
    return analyticsService.getBandwidthPerModel(ctx.user.id);
  }),
});
