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
import { router, protectedProcedure } from "../../../_core/trpc.js";
import { GraphAgentRunInput } from "./contracts.js";
import { wireGraphAgentLite } from "./wiring.js";

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

  explain: protectedProcedure
    .input(z.object({ runId: z.number().int() }))
    .query(async ({ input }) => {
      // Phase 13.5 wires this through the runtime trace + Why-This-Answer
      // accumulator. MVP returns a placeholder pending the full repository
      // query layer (ags_graph_agent_explanations).
      return {
        runId: input.runId,
        explanation: null,
      };
    }),
});

export type GraphAgentRouter = typeof graphAgentRouter;
