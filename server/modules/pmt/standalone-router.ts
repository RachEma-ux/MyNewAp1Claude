/**
 * PMT Standalone Router — Workspace-free PM Shell API
 *
 * Auto-manages an internal "PM Shell" workspace so callers
 * never need to pass workspaceId. Fully independent from
 * the workspace system.
 */

import { z } from "zod";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { projects, tasks, taskDependencies } from "./schema";
import { pmSprints } from "./sprints-schema";
import { workspaces } from "../../../drizzle/tables/users";
import { seedWorkspaceModules } from "../registry";

// ── Auto-managed PM Shell workspace ──

let cachedWsId: number | null = null;

async function getOrCreatePMShellWorkspace(userId: number): Promise<number> {
  if (cachedWsId) return cachedWsId;

  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

  // Look for existing PM Shell workspace
  const existing = await db.select().from(workspaces)
    .where(eq(workspaces.type, "pm-shell"))
    .limit(1);

  if (existing[0]) {
    cachedWsId = existing[0].id;
    return cachedWsId;
  }

  // Create PM Shell workspace
  const [ws] = await db.insert(workspaces).values({
    name: "PM Shell",
    description: "Standalone PM Shell workspace (auto-managed)",
    type: "pm-shell",
    ownerId: userId,
  }).returning();

  // Seed PMT module
  await seedWorkspaceModules(ws.id, "project");

  cachedWsId = ws.id;
  return cachedWsId;
}

// ── Projects ──

const shellProjectsRouter = router({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) return [];
      return db.select().from(projects)
        .where(eq(projects.workspaceId, wsId))
        .orderBy(desc(projects.updatedAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(projects)
        .where(and(eq(projects.id, input.id), eq(projects.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return rows[0];
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
      startDate: z.string().optional(),
      targetDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(projects).values({
        workspaceId: wsId,
        name: input.name,
        description: input.description,
        riskLevel: input.riskLevel,
        ownerId: ctx.user.id,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
      }).returning();
      return created;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      riskLevel: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(projects).set({ ...updates, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.workspaceId, wsId)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(projects)
        .where(and(eq(projects.id, input.id), eq(projects.workspaceId, wsId)));
      return { success: true };
    }),
});

// ── Tasks ──

const shellTasksRouter = router({
  list: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      status: z.string().optional(),
      type: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(tasks.projectId, input.projectId), eq(tasks.workspaceId, wsId)];
      if (input.status) conditions.push(eq(tasks.status, input.status));
      if (input.type) conditions.push(eq(tasks.type, input.type));
      return db.select().from(tasks)
        .where(and(...conditions))
        .orderBy(desc(tasks.updatedAt))
        .limit(200);
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      type: z.string().optional(),
      startDate: z.string().optional(),
      dueDate: z.string().optional(),
      estimatedHours: z.number().optional(),
      storyPoints: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(tasks).values({
        workspaceId: wsId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        type: input.type,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        estimatedHours: input.estimatedHours,
        storyPoints: input.storyPoints,
      }).returning();
      return created;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      type: z.string().optional(),
      startDate: z.string().optional(),
      dueDate: z.string().optional(),
      estimatedHours: z.number().optional(),
      remainingHours: z.number().optional(),
      percentComplete: z.number().min(0).max(100).optional(),
      storyPoints: z.number().optional(),
      sprintId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, startDate, dueDate, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (startDate) setValues.startDate = new Date(startDate);
      if (dueDate) setValues.dueDate = new Date(dueDate);
      if (input.status === "done") setValues.completedAt = new Date();
      await db.update(tasks).set(setValues)
        .where(and(eq(tasks.id, id), eq(tasks.workspaceId, wsId)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(taskDependencies).where(eq(taskDependencies.taskId, input.id));
      await db.delete(tasks).where(and(eq(tasks.id, input.id), eq(tasks.workspaceId, wsId)));
      return { success: true };
    }),
});

// ── Sprints ──

const shellSprintsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmSprints)
        .where(and(
          eq(pmSprints.workspaceId, wsId),
          eq(pmSprints.projectId, input.projectId),
        ))
        .orderBy(desc(pmSprints.startDate));
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1).max(255),
      goal: z.string().optional(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
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

  start: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmSprints)
        .where(and(eq(pmSprints.id, input.id), eq(pmSprints.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Sprint not found" });
      const active = await db.select().from(pmSprints)
        .where(and(
          eq(pmSprints.projectId, rows[0].projectId),
          eq(pmSprints.workspaceId, wsId),
          eq(pmSprints.status, "active"),
        ))
        .limit(1);
      if (active.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Another sprint is already active" });
      await db.update(pmSprints).set({ status: "active" })
        .where(and(eq(pmSprints.id, input.id), eq(pmSprints.workspaceId, wsId)));
      return { success: true };
    }),

  close: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const result = await db.select({
        totalPoints: sql<number>`coalesce(sum(${tasks.storyPoints}), 0)`,
      }).from(tasks)
        .where(and(eq(tasks.sprintId, input.id), eq(tasks.status, "done")));
      const velocity = result[0]?.totalPoints ?? 0;
      await db.update(pmSprints).set({ status: "closed", velocity })
        .where(and(eq(pmSprints.id, input.id), eq(pmSprints.workspaceId, wsId)));
      return { success: true, velocity };
    }),

  addItems: protectedProcedure
    .input(z.object({
      sprintId: z.number(),
      taskIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(tasks).set({ sprintId: input.sprintId, updatedAt: new Date() })
        .where(and(inArray(tasks.id, input.taskIds), eq(tasks.workspaceId, wsId)));
      return { success: true };
    }),

  removeItems: protectedProcedure
    .input(z.object({
      sprintId: z.number(),
      taskIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(tasks).set({ sprintId: null, updatedAt: new Date() })
        .where(and(
          inArray(tasks.id, input.taskIds),
          eq(tasks.sprintId, input.sprintId),
          eq(tasks.workspaceId, wsId),
        ));
      return { success: true };
    }),
});

// ── Dependencies ──

const shellDependenciesRouter = router({
  list: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(taskDependencies)
        .where(eq(taskDependencies.taskId, input.taskId));
    }),
});

// ── Export ──

export const standaloneRouter = router({
  projects: shellProjectsRouter,
  tasks: shellTasksRouter,
  sprints: shellSprintsRouter,
  dependencies: shellDependenciesRouter,
});
