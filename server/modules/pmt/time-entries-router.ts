/**
 * PMT Engine — Time Entries Router
 * CRUD + reporting for time tracking
 */
import { z } from "zod";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmTimeEntries } from "./time-cost-schema";
import { projects } from "./schema";
import { getShellWorkspaceId } from "./pm-shell";

export const timeEntriesRouter = router({
  list: protectedProcedure
    .input(z.object({
      projectId: z.number().optional(),
      workItemId: z.number().optional(),
      userId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmTimeEntries.workspaceId, wsId)];
      if (input.projectId) conditions.push(eq(pmTimeEntries.projectId, input.projectId));
      if (input.workItemId) conditions.push(eq(pmTimeEntries.workItemId, input.workItemId));
      if (input.userId) conditions.push(eq(pmTimeEntries.userId, input.userId));
      if (input.startDate) conditions.push(gte(pmTimeEntries.spentOn, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(pmTimeEntries.spentOn, new Date(input.endDate)));
      return db.select().from(pmTimeEntries)
        .where(and(...conditions))
        .orderBy(desc(pmTimeEntries.spentOn));
    }),

  create: governedProcedure
    .input(z.object({
      projectId: z.number(),
      workItemId: z.number().optional(),
      activityTypeId: z.number().optional(),
      hours: z.number().positive(),
      comment: z.string().optional(),
      spentOn: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmTimeEntries).values({
        workspaceId: wsId,
        projectId: input.projectId,
        workItemId: input.workItemId,
        userId: ctx.user.id,
        activityTypeId: input.activityTypeId,
        hours: input.hours,
        comment: input.comment,
        spentOn: new Date(input.spentOn),
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      hours: z.number().positive().optional(),
      comment: z.string().optional(),
      activityTypeId: z.number().optional(),
      spentOn: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, spentOn, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (spentOn) setValues.spentOn = new Date(spentOn);
      await db.update(pmTimeEntries).set(setValues)
        .where(and(eq(pmTimeEntries.id, id), eq(pmTimeEntries.workspaceId, wsId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmTimeEntries)
        .where(and(eq(pmTimeEntries.id, input.id), eq(pmTimeEntries.workspaceId, wsId)));
      return { success: true };
    }),

  report: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmTimeEntries.workspaceId, wsId)];
      if (input.startDate) conditions.push(gte(pmTimeEntries.spentOn, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(pmTimeEntries.spentOn, new Date(input.endDate)));
      return db.select({
        projectId: pmTimeEntries.projectId,
        projectName: projects.name,
        totalHours: sql<number>`coalesce(sum(${pmTimeEntries.hours}), 0)`,
        entryCount: sql<number>`count(*)`,
      }).from(pmTimeEntries)
        .innerJoin(projects, eq(pmTimeEntries.projectId, projects.id))
        .where(and(...conditions))
        .groupBy(pmTimeEntries.projectId, projects.name);
    }),
});
