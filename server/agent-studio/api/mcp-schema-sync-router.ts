/**
 * Agent Studio — MCP Schema Sync tRPC sub-router (Retrofit P11).
 *
 * Single mutation that drives `syncToolKnowledge` (Phase 7) — mirrors a
 * caller-provided live snapshot of an MCP server's tools into
 * `agsMcpToolKnowledge` + `agsKnowledgeUnits`. The route accepts the
 * snapshot as an input rather than reaching into the in-process
 * registry directly so:
 *
 *   - The router is pure data-in/data-out (testable without live
 *     transports).
 *   - Operator UIs can preview a sync against a fixture before running
 *     it for real.
 *   - The orchestrator (which already has a registry handle) can call
 *     the underlying service directly without going through the router.
 *
 *   - `sync` — governed; runs syncToolKnowledge with the supplied
 *              snapshot. Returns the diff summary.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, governedProcedure } from "../../_core/trpc";
import { syncToolKnowledge } from "../services/mcp/tool-knowledge-sync";

const mcpToolSnapshotSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});

export const mcpSchemaSyncRouter = router({
  sync: governedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        mcpServerId: z.string().min(1).max(128),
        knowledgeSourceId: z.number().int().positive(),
        actorId: z.number().int().positive(),
        tools: z.array(mcpToolSnapshotSchema).max(1000),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await syncToolKnowledge({
          workspaceId: input.workspaceId,
          mcpServerId: input.mcpServerId,
          knowledgeSourceId: input.knowledgeSourceId,
          actorId: input.actorId,
          tools: input.tools,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `tool knowledge sync failed: ${msg}`,
        });
      }
    }),
});
