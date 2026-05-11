/**
 * Graph Agent Lite — tRPC Router.
 *
 * Phase 13. Mounts Graph Agent Lite into the Agent Studio tRPC tree.
 * Procedures route through the wiring layer (OpenRouter + MCP + GraphRepository).
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md
 *
 * Mounting (Phase 13.5):
 *   server/agent-studio/router.ts will import + spread graphAgentRouter
 *   into the agentStudio.* tRPC tree:
 *
 *     graphAgent: graphAgentRouter
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../../_core/trpc.js";
import { GraphAgentRunInput } from "./contracts.js";
import { wireGraphAgentLite } from "./wiring.js";
import { getExplanationForRun } from "./explain-reader.js";
import { getPromptSafeSchemaSummary } from "./schema-summary.js";
import { exportDecisionTraceAsMarkdown } from "./trace-export.js";
import { pruneRuntimeTraces } from "./retention.js";

export const graphAgentRouter = router({
  health: protectedProcedure.query(async () => {
    return { ok: true, agentKey: "graph_agent_lite" };
  }),

  run: protectedProcedure
    .input(GraphAgentRunInput)
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as {
        user?: { id?: number; workspaceId?: number };
      };
      const userId = input.userId ?? ctxAny.user?.id;
      const workspaceId = input.workspaceId ?? ctxAny.user?.workspaceId ?? 1;
      if (userId == null) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Graph Agent Lite requires an authenticated user",
        });
      }
      const engine = wireGraphAgentLite({
        workspaceId,
        actorUserId: userId,
      });
      try {
        const answer = await engine.run({
          ...input,
          userId,
          workspaceId,
        });
        return answer;
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),

  schemaSummary: protectedProcedure
    .input(
      z
        .object({
          nodeLimit: z.number().int().positive().max(200).optional(),
          edgeLimit: z.number().int().positive().max(200).optional(),
          descriptionBudget: z
            .number()
            .int()
            .positive()
            .max(2000)
            .optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      try {
        return await getPromptSafeSchemaSummary({
          nodeLimit: input?.nodeLimit,
          edgeLimit: input?.edgeLimit,
          descriptionBudget: input?.descriptionBudget,
        });
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),

  exportTraceMarkdown: protectedProcedure
    .input(
      z.object({
        runId: z.number().int().positive(),
        title: z.string().min(1).max(200).optional(),
      }),
    )
    .query(async ({ input }) => {
      // Phase 14 §1 — Markdown export of the decision-trace ledger.
      // Returns `{ exported: null }` when the runId has no graph-
      // agent run row (engine ran without §2 decision-trace adapter
      // wired, or ASDB is unavailable). Caller decides whether to
      // map null to a 404 or render a "no trace available" UI.
      try {
        const exported = await exportDecisionTraceAsMarkdown(input.runId, {
          title: input.title,
        });
        return { runId: input.runId, exported };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),

  explain: protectedProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .query(async ({ input }) => {
      // Phase 13 §3 — read-side of the decision-trace ledger written
      // by §2. `runId` is the top-level `agsRuntimeRuns.id` returned
      // from `engine.run()`; the reader joins the graph-agent run
      // row via the `runtime_run_id` FK column.
      try {
        const explanation = await getExplanationForRun(input.runId);
        return {
          runId: input.runId,
          explanation,
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),

  pruneTraces: governedProcedure
    .input(
      z.object({
        // Cap at 1 year — anything past that should be handled by an
        // operations playbook + ADR, not a one-off button click.
        olderThanMs: z
          .number()
          .int()
          .positive()
          .min(60 * 60 * 1000) // 1 hour floor — guardrail against accidental "purge everything"
          .max(365 * 24 * 60 * 60 * 1000)
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Phase 14 §3 — operator-triggered prune across the four
      // trace ledgers (Skill Pack usage rows, query template runs,
      // graph-agent steps, graph-agent runs). Governed because it
      // permanently deletes audit rows.
      try {
        return await pruneRuntimeTraces({
          olderThanMs: input.olderThanMs,
        });
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),
});

export type GraphAgentRouter = typeof graphAgentRouter;
