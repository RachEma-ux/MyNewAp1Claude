/**
 * Graph Workspace tRPC router — Product Work items 18 / 19 / 20 / 21.
 *
 * Thin wrapper over GraphRepository for the workspace UI's local /
 * global graph views, inspector (explainNode + explainPath), and
 * impact analysis (executeTemplate for the 7 impact_* templates).
 *
 * Boundary discipline:
 *   - This router does NOT import neo4j-driver.
 *   - All graph access flows through `getGraphRepository()`.
 *   - Runtime context (workspaceId + userId + role) is threaded
 *     from `ctx.user`; the repository enforces the permission rules
 *     (safe-default DENY when context absent).
 *   - Impact templates limited to the closed allow-list — operators
 *     cannot run arbitrary templateKeys via this surface.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../../../_core/trpc.js";
import { getGraphRepository } from "../graph/repository/index.js";
import type { RuntimeContext } from "../graph/repository/index.js";

/** Allow-listed impact templates that may be executed via this router. */
const ALLOWED_IMPACT_TEMPLATES = new Set([
  "impact_analysis",
  "impact_knowledge",
  "impact_runtime",
  "impact_code",
  "impact_security",
  "impact_governance",
  "impact_tool",
  "impact_workflow",
]);

function buildRuntime(ctx: {
  user?: { id?: number; role?: string; workspaceId?: number };
}): RuntimeContext {
  return {
    userId: ctx.user?.id,
    userRole: ctx.user?.role,
    workspaceId: ctx.user?.workspaceId,
    governanceStatusFilter: ["active"],
  };
}

const TraversalOptionsInput = z.object({
  maxDepth: z.number().int().min(1).max(8).default(2),
  maxResults: z.number().int().min(1).max(2000).default(100),
});

export const graphWorkspaceRouter = router({
  localGraph: protectedProcedure
    .input(
      z.object({
        seedNodeId: z.string().min(1),
        options: TraversalOptionsInput.optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const repo = getGraphRepository();
      const options = input.options ?? { maxDepth: 2, maxResults: 100 };
      return repo.localGraph(input.seedNodeId, options, buildRuntime(ctx));
    }),

  globalGraphSample: protectedProcedure
    .input(z.object({ options: TraversalOptionsInput.optional() }).default({}))
    .query(async ({ input, ctx }) => {
      const repo = getGraphRepository();
      const options = input.options ?? { maxDepth: 1, maxResults: 100 };
      return repo.globalGraphSample(options, buildRuntime(ctx));
    }),

  neighborhood: protectedProcedure
    .input(
      z.object({
        nodeId: z.string().min(1),
        depth: z.number().int().min(1).max(8).default(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      const repo = getGraphRepository();
      return repo.neighborhood(input.nodeId, input.depth, buildRuntime(ctx));
    }),

  shortestPath: protectedProcedure
    .input(
      z.object({
        fromNodeId: z.string().min(1),
        toNodeId: z.string().min(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      const repo = getGraphRepository();
      return repo.shortestPath(input.fromNodeId, input.toNodeId, buildRuntime(ctx));
    }),

  explainNode: protectedProcedure
    .input(z.object({ nodeId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const repo = getGraphRepository();
      const out = await repo.explainNode(input.nodeId, buildRuntime(ctx));
      if (!out) return { found: false as const };
      return { found: true as const, ...out };
    }),

  explainPath: protectedProcedure
    .input(
      z.object({
        fromNodeId: z.string().min(1),
        toNodeId: z.string().min(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      const repo = getGraphRepository();
      return repo.explainPath(input.fromNodeId, input.toNodeId, buildRuntime(ctx));
    }),

  /**
   * Run an allow-listed impact_* template against the graph backend.
   * Templates outside the allow-list throw FORBIDDEN — operators
   * cannot use this surface to execute arbitrary Cypher templates.
   */
  runImpactTemplate: protectedProcedure
    .input(
      z.object({
        templateKey: z.string().min(1),
        parameters: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!ALLOWED_IMPACT_TEMPLATES.has(input.templateKey)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Template '${input.templateKey}' is not in the impact-analysis allow-list`,
        });
      }
      const repo = getGraphRepository();
      return repo.executeTemplate({
        templateKey: input.templateKey,
        parameters: input.parameters,
        runtime: buildRuntime(ctx),
      });
    }),

  /**
   * Operator-grade health surface for the workspace status bar.
   * Returns the existing `BackendHealth` from the repository.
   */
  backendHealth: protectedProcedure.query(async () => {
    const repo = getGraphRepository();
    return repo.health();
  }),
});

export type GraphWorkspaceRouter = typeof graphWorkspaceRouter;
