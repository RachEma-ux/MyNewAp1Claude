/**
 * Agent Studio — Tool Knowledge tRPC sub-router (Retrofit P11).
 *
 * Read-only window onto `agsMcpToolKnowledge` — the Phase 7 mirror of
 * the live MCP registry. Sync mutation lives on `mcpSchemaSyncRouter`;
 * this surface is observation-only.
 *
 *   - `listTools`   — protected; workspace + optional serverId/availability
 *                     filter
 *   - `getTool`     — protected; one tool by (serverId, toolName)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../../_core/trpc";
import { getAsDbForWorkspace } from "../db/connection";
import { agsMcpToolKnowledge } from "../../../drizzle/tables/agent-studio";

const workspaceRefSchema = z.object({
  workspaceId: z.number().int().positive(),
});

function asdb(workspaceId: number) {
  // V1+ MR-3 fifteenth batch (PR-V1-76): every procedure is
  // workspace-scoped via `workspaceRefSchema`, so the per-call shim
  // handle is routed through `getAsDbForWorkspace(workspaceId)`.
  // Phase-1 shim still delegates to `getAsDb()`; Phase-2 routes by
  // region without further caller changes.
  const db = getAsDbForWorkspace(workspaceId);
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ASDB unavailable" });
  }
  return db;
}

export const toolKnowledgeRouter = router({
  listTools: protectedProcedure
    .input(
      workspaceRefSchema.extend({
        mcpServerId: z.string().min(1).max(128).optional(),
        onlyAvailable: z.boolean().default(true),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ input }) => {
      const db = asdb(input.workspaceId);
      const conds = [eq(agsMcpToolKnowledge.workspaceId, input.workspaceId)];
      if (input.mcpServerId) {
        conds.push(eq(agsMcpToolKnowledge.mcpServerId, input.mcpServerId));
      }
      if (input.onlyAvailable) {
        conds.push(eq(agsMcpToolKnowledge.available, true));
      }
      return db
        .select()
        .from(agsMcpToolKnowledge)
        .where(and(...conds))
        .orderBy(desc(agsMcpToolKnowledge.lastSeenAt))
        .limit(input.limit);
    }),

  getTool: protectedProcedure
    .input(
      workspaceRefSchema.extend({
        mcpServerId: z.string().min(1).max(128),
        toolName: z.string().min(1).max(256),
      }),
    )
    .query(async ({ input }) => {
      const db = asdb(input.workspaceId);
      const rows = await db
        .select()
        .from(agsMcpToolKnowledge)
        .where(
          and(
            eq(agsMcpToolKnowledge.workspaceId, input.workspaceId),
            eq(agsMcpToolKnowledge.mcpServerId, input.mcpServerId),
            eq(agsMcpToolKnowledge.toolName, input.toolName),
          ),
        )
        .limit(1);
      if (!rows[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Tool ${input.mcpServerId}/${input.toolName} not in knowledge mirror`,
        });
      }
      return rows[0];
    }),
});
