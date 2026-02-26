/**
 * PMT Engine — Views Router
 * CRUD for saved views (table, kanban, gantt, calendar, timeline)
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { pmSavedViews } from "./views-schema";

export const viewsRouter = router({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      projectId: z.number().optional(),
      viewType: z.enum(["table", "kanban", "gantt", "calendar", "timeline"]).optional(),
    }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmSavedViews.workspaceId, input.workspaceId)];
      if (input.projectId) conditions.push(eq(pmSavedViews.projectId, input.projectId));
      if (input.viewType) conditions.push(eq(pmSavedViews.viewType, input.viewType));
      return db.select().from(pmSavedViews)
        .where(and(...conditions))
        .orderBy(desc(pmSavedViews.updatedAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmSavedViews)
        .where(and(eq(pmSavedViews.id, input.id), eq(pmSavedViews.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "View not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      projectId: z.number().optional(),
      name: z.string().min(1).max(255),
      viewType: z.enum(["table", "kanban", "gantt", "calendar", "timeline"]),
      config: z.any(),
      isDefault: z.boolean().optional(),
      isPublic: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmSavedViews).values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        name: input.name,
        viewType: input.viewType,
        config: input.config,
        isDefault: input.isDefault,
        isPublic: input.isPublic,
        ownerId: ctx.user.id,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "view.create", targetType: "view", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      name: z.string().min(1).max(255).optional(),
      config: z.any().optional(),
      isDefault: z.boolean().optional(),
      isPublic: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(pmSavedViews).set({ ...updates, updatedAt: new Date() })
        .where(and(eq(pmSavedViews.id, id), eq(pmSavedViews.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "view.update", targetType: "view", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmSavedViews)
        .where(and(eq(pmSavedViews.id, input.id), eq(pmSavedViews.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "view.delete", targetType: "view", targetId: input.id });
      return { success: true };
    }),
});
