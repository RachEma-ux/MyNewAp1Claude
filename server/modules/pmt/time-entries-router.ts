/**
 * PMT Engine — Time Entries Router
 * CRUD + reporting for time tracking
 */
import { z } from "zod";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { pmTimeEntries } from "./time-cost-schema";
import { projects } from "./schema";

export const timeEntriesRouter = router({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      projectId: z.number().optional(),
      workItemId: z.number().optional(),
      userId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmTimeEntries.workspaceId, input.workspaceId)];
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
      workspaceId: z.number(),
      projectId: z.number(),
      workItemId: z.number().optional(),
      activityTypeId: z.number().optional(),
      hours: z.number().positive(),
      comment: z.string().optional(),
      spentOn: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmTimeEntries).values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        workItemId: input.workItemId,
        userId: ctx.user.id,
        activityTypeId: input.activityTypeId,
        hours: input.hours,
        comment: input.comment,
        spentOn: new Date(input.spentOn),
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "timeEntry.create", targetType: "time_entry", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      hours: z.number().positive().optional(),
      comment: z.string().optional(),
      activityTypeId: z.number().optional(),
      spentOn: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, spentOn, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (spentOn) setValues.spentOn = new Date(spentOn);
      await db.update(pmTimeEntries).set(setValues)
        .where(and(eq(pmTimeEntries.id, id), eq(pmTimeEntries.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "timeEntry.update", targetType: "time_entry", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmTimeEntries)
        .where(and(eq(pmTimeEntries.id, input.id), eq(pmTimeEntries.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "timeEntry.delete", targetType: "time_entry", targetId: input.id });
      return { success: true };
    }),

  report: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmTimeEntries.workspaceId, input.workspaceId)];
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
