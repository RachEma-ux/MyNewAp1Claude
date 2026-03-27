/**
 * PMT Engine — Baselines Router
 * Capture and retrieve project state snapshots
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmBaselines } from "./baselines-schema";
import { tasks } from "./schema";
import { getShellWorkspaceId } from "./pm-shell";

export const baselinesRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmBaselines)
        .where(and(
          eq(pmBaselines.workspaceId, wsId),
          eq(pmBaselines.projectId, input.projectId),
        ))
        .orderBy(desc(pmBaselines.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Capture snapshot of all tasks in the project
      const items = await db.select().from(tasks).where(and(
        eq(tasks.projectId, input.projectId),
        eq(tasks.workspaceId, wsId),
      ));
      const [created] = await db.insert(pmBaselines).values({
        workspaceId: wsId,
        projectId: input.projectId,
        name: input.name,
        snapshot: items,
        createdBy: ctx.user.id,
      }).returning();
      return created;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmBaselines)
        .where(and(eq(pmBaselines.id, input.id), eq(pmBaselines.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Baseline not found" });
      return rows[0];
    }),
});
