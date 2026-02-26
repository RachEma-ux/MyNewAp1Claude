/**
 * PMT Engine — Baselines Router
 * Capture and retrieve project state snapshots
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { pmBaselines } from "./baselines-schema";
import { tasks } from "./schema";

export const baselinesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), projectId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmBaselines)
        .where(and(
          eq(pmBaselines.workspaceId, input.workspaceId),
          eq(pmBaselines.projectId, input.projectId),
        ))
        .orderBy(desc(pmBaselines.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      projectId: z.number(),
      name: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Capture snapshot of all tasks in the project
      const items = await db.select().from(tasks).where(and(
        eq(tasks.projectId, input.projectId),
        eq(tasks.workspaceId, input.workspaceId),
      ));
      const [created] = await db.insert(pmBaselines).values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        name: input.name,
        snapshot: items,
        createdBy: ctx.user.id,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "baseline.create", targetType: "baseline", targetId: created.id, metadata: { projectId: input.projectId, taskCount: items.length } });
      return created;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmBaselines)
        .where(and(eq(pmBaselines.id, input.id), eq(pmBaselines.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Baseline not found" });
      return rows[0];
    }),
});
