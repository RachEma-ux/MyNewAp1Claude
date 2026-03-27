/**
 * GraphRAG tRPC Router
 *
 * API surface for the GraphRAG engine.
 * All operations require moduleSlug for isolation enforcement.
 *
 * Namespace: dataAnalysis.graphRag.*
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import * as service from "./service";

const queryMethodSchema = z.enum(["basic", "local", "global", "drift"]);

export const graphRagRouter = router({
  // ── Sources ──────────────────────────────────────────────────────────────

  /**
   * Register a new source (admin/setup operation).
   * In practice, adapters are registered programmatically at boot.
   * This endpoint lets the UI trigger DB persistence for a source.
   */
  registerSource: governedProcedure
    .input(
      z.object({
        moduleSlug: z.string().min(1).max(100),
        datasetKey: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ input }) => {
      const adapter = (await import("./source-registry")).getSourceAdapter(
        input.moduleSlug,
        input.datasetKey
      );
      if (!adapter) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No adapter registered for ${input.moduleSlug}:${input.datasetKey}`,
        });
      }
      return service.registerSource(adapter);
    }),

  listSources: protectedProcedure.query(async () => {
    return service.listSources();
  }),

  getSource: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const source = await service.getSource(input.id);
      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
      }
      return source;
    }),

  // ── Source Adapters (read-only introspection) ────────────────────────────

  listAdapters: protectedProcedure.query(async () => {
    const { listSourceAdapters } = await import("./source-registry");
    return listSourceAdapters().map((a) => ({
      moduleSlug: a.moduleSlug,
      datasetKey: a.datasetKey,
      displayName: a.displayName,
      description: a.description,
    }));
  }),

  // ── Sync Operations ─────────────────────────────────────────────────────

  syncSource: governedProcedure
    .input(z.object({ sourceId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        return await service.syncSource(input.sourceId);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message,
        });
      }
    }),

  listSyncRuns: protectedProcedure
    .input(z.object({ sourceId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return service.listSyncRuns(input?.sourceId);
    }),

  // ── Index Operations ────────────────────────────────────────────────────

  buildIndex: governedProcedure
    .input(
      z.object({
        sourceId: z.number(),
        syncRunId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await service.buildIndex(input.sourceId, input.syncRunId);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message,
        });
      }
    }),

  listIndexRuns: protectedProcedure
    .input(z.object({ sourceId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return service.listIndexRuns(input?.sourceId);
    }),

  getIndexRun: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const run = await service.getIndexRun(input.id);
      if (!run) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Index run not found",
        });
      }
      return run;
    }),

  // ── Query Operations ────────────────────────────────────────────────────

  /**
   * Execute a GraphRAG query. Enforces single-module scope.
   */
  query: protectedProcedure
    .input(
      z.object({
        moduleSlug: z.string().min(1),
        datasetKey: z.string().min(1),
        method: queryMethodSchema,
        question: z.string().min(1).max(5000),
        runId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await service.query(input);
      } catch (err: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err.message,
        });
      }
    }),

  listQueryRuns: protectedProcedure
    .input(z.object({ sourceId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return service.listQueryRuns(input?.sourceId);
    }),

  // ── Graph Data ──────────────────────────────────────────────────────────

  listEntities: protectedProcedure
    .input(
      z.object({
        moduleSlug: z.string().min(1),
        datasetKey: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return service.listEntities(input.moduleSlug, input.datasetKey);
    }),

  listRelationships: protectedProcedure
    .input(
      z.object({
        moduleSlug: z.string().min(1),
        datasetKey: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return service.listRelationships(input.moduleSlug, input.datasetKey);
    }),

  listCommunities: protectedProcedure
    .input(
      z.object({
        moduleSlug: z.string().min(1),
        datasetKey: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return service.listCommunities(input.moduleSlug, input.datasetKey);
    }),

  listCommunityReports: protectedProcedure
    .input(
      z.object({
        moduleSlug: z.string().min(1),
        datasetKey: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return service.listCommunityReports(input.moduleSlug, input.datasetKey);
    }),

  // ── Worker Status ───────────────────────────────────────────────────────

  workerStatus: protectedProcedure.query(async () => {
    return service.getWorkerStatus();
  }),
});
