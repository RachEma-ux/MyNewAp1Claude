/**
 * PMT Engine — tRPC Router
 * Project Management: projects, tasks, dependencies
 * All mutations are governance-gated.
 */

import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { projects, tasks, taskDependencies } from "./schema";
import { commentsRouter } from "./comments-router";
import { attachmentsRouter } from "./attachments-router";
import { watchersRouter } from "./watchers-router";
import { configRouter } from "./config-router";
import { customFieldsRouter } from "./custom-fields-router";
import { viewsRouter } from "./views-router";
import { versionsRouter } from "./versions-router";
import { baselinesRouter } from "./baselines-router";

const projectsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(projects)
        .where(eq(projects.workspaceId, input.workspaceId))
        .orderBy(desc(projects.updatedAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(projects)
        .where(and(eq(projects.id, input.id), eq(projects.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
      startDate: z.string().optional(),
      targetDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(projects).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        riskLevel: input.riskLevel,
        ownerId: ctx.user.id,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "project.create", targetType: "project", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      riskLevel: z.string().optional(),
      governanceStage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(projects).set({ ...updates, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "project.update", targetType: "project", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(projects)
        .where(and(eq(projects.id, input.id), eq(projects.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "project.delete", targetType: "project", targetId: input.id });
      return { success: true };
    }),
});

const tasksRouter = router({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      projectId: z.number(),
      status: z.string().optional(),
      type: z.string().optional(),
      parentId: z.number().optional(),
      assigneeId: z.number().optional(),
      limit: z.number().min(1).max(200).default(50).optional(),
      offset: z.number().min(0).default(0).optional(),
    }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(tasks.projectId, input.projectId), eq(tasks.workspaceId, input.workspaceId)];
      if (input.status) conditions.push(eq(tasks.status, input.status));
      if (input.type) conditions.push(eq(tasks.type, input.type));
      if (input.parentId !== undefined) conditions.push(eq(tasks.parentId, input.parentId));
      if (input.assigneeId !== undefined) conditions.push(eq(tasks.assigneeId, input.assigneeId));
      return db.select().from(tasks)
        .where(and(...conditions))
        .orderBy(desc(tasks.updatedAt))
        .limit(input.limit ?? 50)
        .offset(input.offset ?? 0);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      projectId: z.number(),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      assigneeId: z.number().optional(),
      assigneeType: z.enum(["human", "ai"]).optional(),
      riskLevel: z.string().optional(),
      dueDate: z.string().optional(),
      type: z.string().optional(),
      startDate: z.string().optional(),
      estimatedHours: z.number().optional(),
      remainingHours: z.number().optional(),
      percentComplete: z.number().min(0).max(100).optional(),
      storyPoints: z.number().optional(),
      labels: z.array(z.string()).optional(),
      parentId: z.number().optional(),
      accountableId: z.number().optional(),
      position: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(tasks).values({
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "task.create", targetType: "task", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      assigneeId: z.number().nullable().optional(),
      assigneeType: z.enum(["human", "ai"]).optional(),
      riskLevel: z.string().optional(),
      confidenceScore: z.number().optional(),
      governanceStage: z.string().optional(),
      type: z.string().optional(),
      startDate: z.string().optional(),
      estimatedHours: z.number().optional(),
      remainingHours: z.number().optional(),
      percentComplete: z.number().min(0).max(100).optional(),
      storyPoints: z.number().optional(),
      labels: z.array(z.string()).optional(),
      parentId: z.number().nullable().optional(),
      accountableId: z.number().nullable().optional(),
      position: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, startDate, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (startDate) setValues.startDate = new Date(startDate);
      if (input.status === "done") setValues.completedAt = new Date();
      await db.update(tasks).set(setValues)
        .where(and(eq(tasks.id, id), eq(tasks.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "task.update", targetType: "task", targetId: id, metadata: { status: input.status } });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(taskDependencies).where(eq(taskDependencies.taskId, input.id));
      await db.delete(tasks).where(and(eq(tasks.id, input.id), eq(tasks.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "task.delete", targetType: "task", targetId: input.id });
      return { success: true };
    }),

  duplicate: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      const original = rows[0];
      const { id, createdAt, updatedAt, completedAt, ...rest } = original;
      const [created] = await db.insert(tasks).values({
        ...rest,
        title: `Copy of ${original.title}`,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "task.duplicate", targetType: "task", targetId: created.id, metadata: { originalId: input.id } });
      return created;
    }),

  bulkUpdate: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      ids: z.array(z.number()).min(1),
      updates: z.object({
        status: z.string().optional(),
        priority: z.string().optional(),
        assigneeId: z.number().optional(),
        type: z.string().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const setValues: Record<string, unknown> = { ...input.updates, updatedAt: new Date() };
      if (input.updates.status === "done") setValues.completedAt = new Date();
      await db.update(tasks).set(setValues)
        .where(and(inArray(tasks.id, input.ids), eq(tasks.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "task.bulkUpdate", targetType: "task", metadata: { ids: input.ids, updates: input.updates } });
      return { success: true, count: input.ids.length };
    }),

  bulkDelete: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      ids: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(taskDependencies).where(inArray(taskDependencies.taskId, input.ids));
      await db.delete(tasks)
        .where(and(inArray(tasks.id, input.ids), eq(tasks.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "task.bulkDelete", targetType: "task", metadata: { ids: input.ids } });
      return { success: true, count: input.ids.length };
    }),

  move: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      targetProjectId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(tasks).set({ projectId: input.targetProjectId, updatedAt: new Date() })
        .where(and(eq(tasks.id, input.id), eq(tasks.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "task.move", targetType: "task", targetId: input.id, metadata: { targetProjectId: input.targetProjectId } });
      return { success: true };
    }),
});

const dependenciesRouter = router({
  list: protectedProcedure
    .input(z.object({ taskId: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(taskDependencies).where(eq(taskDependencies.taskId, input.taskId));
    }),

  add: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      taskId: z.number(),
      dependsOnId: z.number(),
      type: z.enum(["blocks", "required_by"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (input.taskId === input.dependsOnId) throw new TRPCError({ code: "BAD_REQUEST", message: "Task cannot depend on itself" });
      const [created] = await db.insert(taskDependencies).values({
        taskId: input.taskId,
        dependsOnId: input.dependsOnId,
        type: input.type || "blocks",
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "dependency.add", targetType: "task_dependency", targetId: created.id });
      return created;
    }),

  remove: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(taskDependencies).where(eq(taskDependencies.id, input.id));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "dependency.remove", targetType: "task_dependency", targetId: input.id });
      return { success: true };
    }),
});

export const pmtRouter = router({
  projects: projectsRouter,
  tasks: tasksRouter,
  dependencies: dependenciesRouter,
  comments: commentsRouter,
  attachments: attachmentsRouter,
  watchers: watchersRouter,
  config: configRouter,
  customFields: customFieldsRouter,
  views: viewsRouter,
  versions: versionsRouter,
  baselines: baselinesRouter,
});
