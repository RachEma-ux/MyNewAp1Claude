/**
 * Agent Studio — Knowledge Base tRPC sub-router (Retrofit P11).
 *
 * Read-only window onto `agsKnowledgeUnits` + `agsProvenanceRecords`.
 * Mutations land via the ingestion pipeline (Phase 3 services) so this
 * router stays observation-only.
 *
 *   - `listUnits`        — protected; workspace + optional source filter
 *   - `getUnit`          — protected; one unit by id (workspace-scoped)
 *   - `getProvenance`    — protected; one provenance row by id
 *   - `listFreshnessCounts` — protected; quick counts for the inspector
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../../_core/trpc";
import { getAsDb } from "../db/connection";
import { hasWorkspaceAccess } from "../../db/workspaces";
import {
  agsKnowledgeUnits,
  agsProvenanceRecords,
} from "../../../drizzle/tables/agent-studio";

const workspaceRefSchema = z.object({
  workspaceId: z.number().int().positive(),
});

function asdb() {
  const db = getAsDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ASDB unavailable" });
  }
  return db;
}

/**
 * Workspace-membership gate. The retrofit's KB tables carry a
 * `workspaceId` column per D-UI-2; this gate ensures clients can only
 * query workspaces they belong to. Mirrors the pattern documents-crud
 * has used since before the retrofit. (Review cleanup — kb-router was
 * trusting client-supplied `workspaceId` without validation.)
 */
async function assertWorkspaceAccess(userId: number, workspaceId: number): Promise<void> {
  const ok = await hasWorkspaceAccess(userId, workspaceId);
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `User ${userId} does not have access to workspace ${workspaceId}`,
    });
  }
}

export const kbRouter = router({
  listUnits: protectedProcedure
    .input(
      workspaceRefSchema.extend({
        sourceId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        includeArchived: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceAccess(ctx.user.id, input.workspaceId);
      const db = asdb();
      const conds = [eq(agsKnowledgeUnits.workspaceId, input.workspaceId)];
      if (typeof input.sourceId === "number") {
        conds.push(eq(agsKnowledgeUnits.sourceId, input.sourceId));
      }
      if (!input.includeArchived) {
        conds.push(isNull(agsKnowledgeUnits.archivedAt));
      }
      const rows = await db
        .select()
        .from(agsKnowledgeUnits)
        .where(and(...conds))
        .orderBy(desc(agsKnowledgeUnits.id))
        .limit(input.limit);
      return rows;
    }),

  getUnit: protectedProcedure
    .input(
      workspaceRefSchema.extend({
        unitId: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceAccess(ctx.user.id, input.workspaceId);
      const db = asdb();
      const rows = await db
        .select()
        .from(agsKnowledgeUnits)
        .where(
          and(
            eq(agsKnowledgeUnits.id, input.unitId),
            eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
          ),
        )
        .limit(1);
      if (!rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Unit ${input.unitId} not found` });
      }
      return rows[0];
    }),

  getProvenance: protectedProcedure
    .input(
      workspaceRefSchema.extend({
        provenanceId: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertWorkspaceAccess(ctx.user.id, input.workspaceId);
      const db = asdb();
      const rows = await db
        .select()
        .from(agsProvenanceRecords)
        .where(
          and(
            eq(agsProvenanceRecords.id, input.provenanceId),
            eq(agsProvenanceRecords.workspaceId, input.workspaceId),
          ),
        )
        .limit(1);
      if (!rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Provenance ${input.provenanceId} not found` });
      }
      return rows[0];
    }),

  listFreshnessCounts: protectedProcedure
    .input(workspaceRefSchema)
    .query(async ({ ctx, input }) => {
      await assertWorkspaceAccess(ctx.user.id, input.workspaceId);
      const db = asdb();
      const rows = await db
        .select({
          freshnessState: agsKnowledgeUnits.freshnessState,
          count: sql<number>`count(*)::int`,
        })
        .from(agsKnowledgeUnits)
        .where(
          and(
            eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
            isNull(agsKnowledgeUnits.archivedAt),
          ),
        )
        .groupBy(agsKnowledgeUnits.freshnessState);
      return rows;
    }),
});
