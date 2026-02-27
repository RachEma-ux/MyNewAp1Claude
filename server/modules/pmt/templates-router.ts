/**
 * PMT Engine — Templates Router
 * Project templates and work-item templates with apply functionality
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { pmProjectTemplates, pmWorkItemTemplates } from "./integrations-schema";
import { projects, tasks } from "./schema";

const projectTemplatesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmProjectTemplates)
        .where(eq(pmProjectTemplates.workspaceId, input.workspaceId))
        .orderBy(desc(pmProjectTemplates.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmProjectTemplates)
        .where(and(eq(pmProjectTemplates.id, input.id), eq(pmProjectTemplates.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project template not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      templateData: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmProjectTemplates).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        templateData: input.templateData,
        createdBy: ctx.user.id,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.create", targetType: "project_template", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      templateData: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(pmProjectTemplates).set(updates)
        .where(and(eq(pmProjectTemplates.id, id), eq(pmProjectTemplates.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.update", targetType: "project_template", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmProjectTemplates)
        .where(and(eq(pmProjectTemplates.id, input.id), eq(pmProjectTemplates.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.delete", targetType: "project_template", targetId: input.id });
      return { success: true };
    }),

  useTemplate: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number(), name: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmProjectTemplates)
        .where(and(eq(pmProjectTemplates.id, input.id), eq(pmProjectTemplates.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project template not found" });
      const tpl = rows[0].templateData as Record<string, unknown>;
      const [created] = await db.insert(projects).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: (tpl.description as string) || undefined,
        status: (tpl.status as string) || "active",
        ownerId: ctx.user.id,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.apply", targetType: "project", targetId: created.id, metadata: { templateId: input.id } });
      return created;
    }),
});

const workItemTemplatesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmWorkItemTemplates)
        .where(eq(pmWorkItemTemplates.workspaceId, input.workspaceId))
        .orderBy(desc(pmWorkItemTemplates.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmWorkItemTemplates)
        .where(and(eq(pmWorkItemTemplates.id, input.id), eq(pmWorkItemTemplates.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Work item template not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      templateData: z.record(z.unknown()),
      typeId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmWorkItemTemplates).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        templateData: input.templateData,
        typeId: input.typeId,
        createdBy: ctx.user.id,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "workItemTemplate.create", targetType: "work_item_template", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      templateData: z.record(z.unknown()).optional(),
      typeId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(pmWorkItemTemplates).set(updates)
        .where(and(eq(pmWorkItemTemplates.id, id), eq(pmWorkItemTemplates.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "workItemTemplate.update", targetType: "work_item_template", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmWorkItemTemplates)
        .where(and(eq(pmWorkItemTemplates.id, input.id), eq(pmWorkItemTemplates.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "workItemTemplate.delete", targetType: "work_item_template", targetId: input.id });
      return { success: true };
    }),

  useTemplate: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number(), projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmWorkItemTemplates)
        .where(and(eq(pmWorkItemTemplates.id, input.id), eq(pmWorkItemTemplates.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Work item template not found" });
      const tpl = rows[0].templateData as Record<string, unknown>;
      const [created] = await db.insert(tasks).values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        title: (tpl.title as string) || rows[0].name,
        description: (tpl.description as string) || undefined,
        priority: (tpl.priority as string) || "medium",
        type: (tpl.type as string) || "task",
        status: "todo",
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "workItemTemplate.apply", targetType: "task", targetId: created.id, metadata: { templateId: input.id } });
      return created;
    }),
});

export const templatesRouter = router({
  projectTemplates: projectTemplatesRouter,
  workItemTemplates: workItemTemplatesRouter,
});
