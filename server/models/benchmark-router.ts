import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  runModelBenchmark,
  getModelBenchmarks,
  getAllBenchmarks,
  getBenchmarkStats,
} from "./benchmark-service";

/**
 * Model Benchmark Router
 * Handles model performance benchmarking endpoints
 */

export const modelBenchmarkRouter = router({
  // Run benchmark for a model
  runBenchmark: protectedProcedure
    .input(
      z.object({
        modelId: z.number(),
        modelName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await runModelBenchmark(input.modelId, input.modelName, ctx.user.id);
      return result;
    }),

  // Get benchmarks for a specific model
  getForModel: protectedProcedure
    .input(z.object({ modelId: z.number() }))
    .query(async ({ input }) => {
      const benchmarks = await getModelBenchmarks(input.modelId);
      return benchmarks;
    }),

  // Get all benchmarks
  getAll: protectedProcedure
    .query(async () => {
      const benchmarks = await getAllBenchmarks();
      return benchmarks;
    }),

  // Get benchmark statistics for a model
  getStats: protectedProcedure
    .input(z.object({ modelId: z.number() }))
    .query(async ({ input }) => {
      const stats = await getBenchmarkStats(input.modelId);
      return stats;
    }),
});
