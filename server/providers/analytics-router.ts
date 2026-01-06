import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllProvidersWithMetrics,
  getProviderUsageStats,
  getProviderUsageTrend,
  calculateProviderUptime,
  getHealthCheckHistory,
  getMetricsHistory,
} from "./analytics-db";

/**
 * Provider Analytics tRPC Router
 * Exposes provider health, metrics, and usage analytics
 */

export const providerAnalyticsRouter = router({
  // Get all providers with their latest metrics and health status
  getAllWithMetrics: protectedProcedure.query(async () => {
    return await getAllProvidersWithMetrics();
  }),

  // Get usage statistics for a specific provider
  getUsageStats: protectedProcedure
    .input(
      z.object({
        providerId: z.number(),
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ input }) => {
      return await getProviderUsageStats(
        input.providerId,
        input.startDate,
        input.endDate
      );
    }),

  // Get usage trend for a provider
  getUsageTrend: protectedProcedure
    .input(
      z.object({
        providerId: z.number(),
        days: z.number().default(7),
      })
    )
    .query(async ({ input }) => {
      return await getProviderUsageTrend(input.providerId, input.days);
    }),

  // Calculate provider uptime
  getUptime: protectedProcedure
    .input(
      z.object({
        providerId: z.number(),
        days: z.number().default(30),
      })
    )
    .query(async ({ input }) => {
      return await calculateProviderUptime(input.providerId, input.days);
    }),

  // Get health check history
  getHealthHistory: protectedProcedure
    .input(
      z.object({
        providerId: z.number(),
        limit: z.number().default(100),
      })
    )
    .query(async ({ input }) => {
      return await getHealthCheckHistory(input.providerId, input.limit);
    }),

  // Get metrics history
  getMetricsHistory: protectedProcedure
    .input(
      z.object({
        providerId: z.number(),
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ input }) => {
      return await getMetricsHistory(
        input.providerId,
        input.startDate,
        input.endDate
      );
    }),
});
