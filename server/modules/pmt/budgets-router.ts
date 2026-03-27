/**
 * PMT Engine — Budgets Router
 * CRUD + variance analysis for project budgets
 */
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmBudgets, pmTimeEntries, pmCostEntries } from "./time-cost-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const budgetsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmBudgets.wsId)];
      if (input.projectId) conditions.push(eq(pmBudgets.projectId, input.projectId));
      return db.select().from(pmBudgets)
        .where(and(...conditions))
        .orderBy(desc(pmBudgets.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmBudgets)
        .where(and(eq(pmBudgets.id, input.id), eq(pmBudgets.wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Budget not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      plannedLabor: z.number().optional(),
      plannedUnits: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmBudgets).values({
        workspaceId: wsId,
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        plannedLabor: input.plannedLabor ?? 0,
        plannedUnits: input.plannedUnits ?? 0,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      plannedLabor: z.number().optional(),
      plannedUnits: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmBudgets).set({ ...updates, updatedAt: new Date() })
        .where(and(eq(pmBudgets.id, id), eq(pmBudgets.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmBudgets)
        .where(and(eq(pmBudgets.id, input.id), eq(pmBudgets.wsId)));
      return { success: true };
    }),

  variance: protectedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Get budget
      const budgetRows = await db.select().from(pmBudgets)
        .where(and(eq(pmBudgets.id, input.id), eq(pmBudgets.wsId)))
        .limit(1);
      if (!budgetRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Budget not found" });
      const budget = budgetRows[0];
      // Actual labor hours for this project
      const laborResult = await db.select({
        actualHours: sql<number>`coalesce(sum(${pmTimeEntries.hours}), 0)`,
      }).from(pmTimeEntries)
        .where(and(
          eq(pmTimeEntries.projectId, budget.projectId),
          eq(pmTimeEntries.wsId),
        ));
      // Actual cost units for this project
      const costResult = await db.select({
        actualUnits: sql<number>`coalesce(sum(${pmCostEntries.units}), 0)`,
        actualCost: sql<number>`coalesce(sum(${pmCostEntries.units} * ${pmCostEntries.unitCost}), 0)`,
      }).from(pmCostEntries)
        .where(and(
          eq(pmCostEntries.projectId, budget.projectId),
          eq(pmCostEntries.wsId),
        ));
      const actualHours = laborResult[0]?.actualHours ?? 0;
      const actualUnits = costResult[0]?.actualUnits ?? 0;
      const actualCost = costResult[0]?.actualCost ?? 0;
      return {
        budget,
        actual: { hours: actualHours, units: actualUnits, cost: actualCost },
        variance: {
          laborVariance: (budget.plannedLabor ?? 0) - actualHours,
          unitsVariance: (budget.plannedUnits ?? 0) - actualUnits,
        },
      };
    }),
});
