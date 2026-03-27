/**
 * PMT Engine — Cost Entries Router
 * CRUD + reporting for cost tracking
 */
import { z } from "zod";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmCostEntries } from "./time-cost-schema";
import { projects } from "./schema";
import { getShellWorkspaceId } from "./pm-shell";

export const costEntriesRouter = router({
  list: protectedProcedure
    .input(z.object({
      projectId: z.number().optional(),
      workItemId: z.number().optional(),
      userId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmCostEntries.wsId)];
      if (input.projectId) conditions.push(eq(pmCostEntries.projectId, input.projectId));
      if (input.workItemId) conditions.push(eq(pmCostEntries.workItemId, input.workItemId));
      if (input.userId) conditions.push(eq(pmCostEntries.userId, input.userId));
      if (input.startDate) conditions.push(gte(pmCostEntries.spentOn, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(pmCostEntries.spentOn, new Date(input.endDate)));
      return db.select().from(pmCostEntries)
        .where(and(...conditions))
        .orderBy(desc(pmCostEntries.spentOn));
    }),

  create: governedProcedure
    .input(z.object({
      projectId: z.number(),
      workItemId: z.number().optional(),
      units: z.number().positive(),
      unitCost: z.number(),
      comment: z.string().optional(),
      spentOn: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmCostEntries).values({
        workspaceId: wsId,
        projectId: input.projectId,
        workItemId: input.workItemId,
        userId: ctx.user.id,
        units: input.units,
        unitCost: input.unitCost,
        comment: input.comment,
        spentOn: new Date(input.spentOn),
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      units: z.number().positive().optional(),
      unitCost: z.number().optional(),
      comment: z.string().optional(),
      spentOn: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, spentOn, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates };
      if (spentOn) setValues.spentOn = new Date(spentOn);
      await db.update(pmCostEntries).set(setValues)
        .where(and(eq(pmCostEntries.id, id), eq(pmCostEntries.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmCostEntries)
        .where(and(eq(pmCostEntries.id, input.id), eq(pmCostEntries.wsId)));
      return { success: true };
    }),

  report: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmCostEntries.wsId)];
      if (input.startDate) conditions.push(gte(pmCostEntries.spentOn, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(pmCostEntries.spentOn, new Date(input.endDate)));
      return db.select({
        projectId: pmCostEntries.projectId,
        projectName: projects.name,
        totalCost: sql<number>`coalesce(sum(${pmCostEntries.units} * ${pmCostEntries.unitCost}), 0)`,
        totalUnits: sql<number>`coalesce(sum(${pmCostEntries.units}), 0)`,
        entryCount: sql<number>`count(*)`,
      }).from(pmCostEntries)
        .innerJoin(projects, eq(pmCostEntries.projectId, projects.id))
        .where(and(...conditions))
        .groupBy(pmCostEntries.projectId, projects.name);
    }),
});
