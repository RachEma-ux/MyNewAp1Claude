/**
 * PMT Engine — Sprints Router
 * Sprint planning, tracking, and burndown
 */

import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmSprints } from "./sprints-schema";
import { tasks } from "./schema";
import { getShellWorkspaceId } from "./pm-shell";

export const sprintsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmSprints)
        .where(and(
          eq(pmSprints.workspaceId, wsId),
          eq(pmSprints.projectId, input.projectId),
        ))
        .orderBy(desc(pmSprints.startDate));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmSprints)
        .where(and(eq(pmSprints.id, input.id), eq(pmSprints.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1).max(255),
      goal: z.string().optional(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmSprints).values({
        workspaceId: wsId,
        projectId: input.projectId,
        name: input.name,
        goal: input.goal,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      goal: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, startDate, endDate, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates };
      if (startDate) setValues.startDate = new Date(startDate);
      if (endDate) setValues.endDate = new Date(endDate);
      await db.update(pmSprints).set(setValues)
        .where(and(eq(pmSprints.id, id), eq(pmSprints.workspaceId)));
      return { success: true };
    }),

  start: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Get the sprint to find its project
      const rows = await db.select().from(pmSprints)
        .where(and(eq(pmSprints.id, input.id), eq(pmSprints.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found" });
      // Validate no other active sprint in same project
      const active = await db.select().from(pmSprints)
        .where(and(
          eq(pmSprints.projectId, rows[0].projectId),
          eq(pmSprints.workspaceId, wsId),
          eq(pmSprints.status, "active"),
        ))
        .limit(1);
      if (active.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Another sprint is already active in this project" });
      await db.update(pmSprints).set({ status: "active" })
        .where(and(eq(pmSprints.id, input.id), eq(pmSprints.workspaceId, wsId)));
      return { success: true };
    }),

  close: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Compute velocity: sum of storyPoints for done tasks in this sprint
      const result = await db.select({
        totalPoints: sql<number>`coalesce(sum(${tasks.storyPoints}), 0)`,
      }).from(tasks)
        .where(and(
          eq(tasks.sprintId, input.id),
          eq(tasks.status, "done"),
        ));
      const velocity = result[0]?.totalPoints ?? 0;
      await db.update(pmSprints).set({ status: "closed", velocity })
        .where(and(eq(pmSprints.id, input.id), eq(pmSprints.workspaceId, wsId)));
      return { success: true, velocity };
    }),

  addItems: governedProcedure
    .input(z.object({
      sprintId: z.number(),
      taskIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { inArray } = await import("drizzle-orm");
      await db.update(tasks).set({ sprintId: input.sprintId, updatedAt: new Date() })
        .where(and(inArray(tasks.id, input.taskIds), eq(tasks.workspaceId, wsId)));
      return { success: true };
    }),

  removeItems: governedProcedure
    .input(z.object({
      sprintId: z.number(),
      taskIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { inArray } = await import("drizzle-orm");
      await db.update(tasks).set({ sprintId: null, updatedAt: new Date() })
        .where(and(
          inArray(tasks.id, input.taskIds),
          eq(tasks.sprintId, input.sprintId),
          eq(tasks.workspaceId, wsId),
        ));
      return { success: true };
    }),

  burndown: protectedProcedure
    .input(z.object({ sprintId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const sprintRows = await db.select().from(pmSprints)
        .where(and(eq(pmSprints.id, input.sprintId), eq(pmSprints.workspaceId, wsId)))
        .limit(1);
      if (!sprintRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found" });
      const sprintTasks = await db.select().from(tasks)
        .where(eq(tasks.sprintId, input.sprintId));
      return { sprint: sprintRows[0], tasks: sprintTasks };
    }),
});
