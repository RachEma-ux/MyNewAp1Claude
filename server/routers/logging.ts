/**
 * Logging Router
 * 
 * Provides tRPC procedures for logging and monitoring.
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getLogger, getMetricsCollector } from "../services/loggingService";

const logger = getLogger("LoggingRouter");

export const loggingRouter = router({
  /**
   * Get application logs
   */
  getLogs: protectedProcedure
    .input(z.object({
      level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).optional(),
      service: z.string().optional(),
      limit: z.number().optional().default(100),
    }))
    .query(async ({ input, ctx }) => {
      logger.info('Fetching logs', { level: input.level, service: input.service });

      // In production, this would query a logging service
      return {
        logs: [],
        total: 0,
      };
    }),

  /**
   * Get metrics
   */
  getMetrics: protectedProcedure
    .input(z.object({
      name: z.string().optional(),
      limit: z.number().optional().default(100),
    }))
    .query(async ({ input, ctx }) => {
      const metricsCollector = getMetricsCollector();
      const metrics = metricsCollector.getMetrics(input.name, input.limit);

      return {
        metrics,
        total: metrics.length,
      };
    }),

  /**
   * Record custom metric
   */
  recordMetric: protectedProcedure
    .input(z.object({
      name: z.string(),
      value: z.number(),
      tags: z.record(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const metricsCollector = getMetricsCollector();
      metricsCollector.record(input.name, input.value, input.tags);

      logger.info('Metric recorded', { name: input.name, value: input.value });

      return { success: true };
    }),

  /**
   * Get system health
   */
  getHealth: publicProcedure.query(async ({ ctx }) => {
    const metricsCollector = getMetricsCollector();
    const metrics = metricsCollector.getMetrics();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        total: metrics.length,
        recent: metrics.slice(-10),
      },
    };
  }),

  /**
   * Clear metrics
   */
  clearMetrics: protectedProcedure.mutation(async ({ ctx }) => {
    const metricsCollector = getMetricsCollector();
    metricsCollector.clear();

    logger.info('Metrics cleared');

    return { success: true };
  }),

  /**
   * Get log levels
   */
  getLogLevels: publicProcedure.query(async ({ ctx }) => {
    return {
      levels: ['debug', 'info', 'warn', 'error', 'fatal'],
    };
  }),
});
