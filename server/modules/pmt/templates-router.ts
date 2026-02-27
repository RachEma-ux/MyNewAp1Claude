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
import { pmStatuses, pmTypes } from "./config-schema";

/** Built-in "Full PM Lifecycle" template data (OpenProject-inspired) */
const PM_LIFECYCLE_TEMPLATE_DATA = {
  description: "Full project lifecycle based on PM² methodology — Initiating, Planning, Executing, Monitoring & Controlling, and Closing phases with gates, milestones, and deliverables.",
  status: "active",
  statuses: [
    { name: "New",                color: "#1E88E5", isClosed: false, isDefault: true,  position: 1 },
    { name: "In Specification",   color: "#8E24AA", isClosed: false, isDefault: false, position: 2 },
    { name: "Specified",          color: "#5E35B1", isClosed: false, isDefault: false, position: 3 },
    { name: "In Progress",        color: "#FB8C00", isClosed: false, isDefault: false, position: 4 },
    { name: "Developed",          color: "#00ACC1", isClosed: false, isDefault: false, position: 5 },
    { name: "In QA/Testing",      color: "#F4511E", isClosed: false, isDefault: false, position: 6 },
    { name: "Tested",             color: "#43A047", isClosed: false, isDefault: false, position: 7 },
    { name: "On Hold",            color: "#757575", isClosed: false, isDefault: false, position: 8 },
    { name: "Rejected",           color: "#E53935", isClosed: true,  isDefault: false, position: 9 },
    { name: "Closed",             color: "#2E7D32", isClosed: true,  isDefault: false, position: 10 },
  ],
  types: [
    { name: "Task",       color: "#1E88E5", icon: "check-square",    isMilestone: false, position: 1 },
    { name: "Milestone",  color: "#8E24AA", icon: "flag",            isMilestone: true,  position: 2 },
    { name: "Phase",      color: "#00897B", icon: "layers",          isMilestone: false, position: 3 },
    { name: "Feature",    color: "#43A047", icon: "star",            isMilestone: false, position: 4 },
    { name: "Bug",        color: "#E53935", icon: "bug",             isMilestone: false, position: 5 },
    { name: "Epic",       color: "#5E35B1", icon: "zap",             isMilestone: false, position: 6 },
    { name: "User Story", color: "#FB8C00", icon: "user",            isMilestone: false, position: 7 },
    { name: "Risk",       color: "#F4511E", icon: "alert-triangle",  isMilestone: false, position: 8 },
  ],
  phases: [
    {
      name: "Phase: Initiating",
      type: "phase",
      tasks: [
        { title: "Define project scope & objectives", type: "task" },
        { title: "Identify stakeholders", type: "task" },
        { title: "Create project charter", type: "task" },
        { title: "Feasibility assessment", type: "task" },
        { title: "Initiation Gate Approval", type: "milestone" },
      ],
    },
    {
      name: "Phase: Planning",
      type: "phase",
      tasks: [
        { title: "Work breakdown structure (WBS)", type: "task" },
        { title: "Schedule & timeline planning", type: "task" },
        { title: "Resource allocation", type: "task" },
        { title: "Budget estimation", type: "task" },
        { title: "Risk identification & mitigation plan", type: "task" },
        { title: "Communication plan", type: "task" },
        { title: "Planning Gate Approval", type: "milestone" },
      ],
    },
    {
      name: "Phase: Executing",
      type: "phase",
      tasks: [
        { title: "Sprint/iteration setup", type: "task" },
        { title: "Development & implementation", type: "task" },
        { title: "Quality assurance & testing", type: "task" },
        { title: "Progress tracking & reporting", type: "task" },
        { title: "Stakeholder communication", type: "task" },
        { title: "Change request management", type: "task" },
        { title: "Execution Complete", type: "milestone" },
      ],
    },
    {
      name: "Phase: Monitoring & Controlling",
      type: "phase",
      tasks: [
        { title: "KPI tracking dashboard", type: "task" },
        { title: "Budget vs. actual monitoring", type: "task" },
        { title: "Risk register updates", type: "task" },
        { title: "Scope change control", type: "task" },
        { title: "Status reporting", type: "task" },
      ],
    },
    {
      name: "Phase: Closing",
      type: "phase",
      tasks: [
        { title: "Final deliverable review", type: "task" },
        { title: "Acceptance sign-off", type: "task" },
        { title: "Lessons learned documentation", type: "task" },
        { title: "Archive project artifacts", type: "task" },
        { title: "Team release & recognition", type: "task" },
        { title: "Project Closure", type: "milestone" },
      ],
    },
  ],
};

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

      // 1. Create the project
      const [created] = await db.insert(projects).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: (tpl.description as string) || undefined,
        status: (tpl.status as string) || "active",
        ownerId: ctx.user.id,
      }).returning();

      // 2. Seed statuses
      const statusArr = tpl.statuses as Array<{ name: string; color: string; isClosed?: boolean; isDefault?: boolean; position: number }> | undefined;
      if (statusArr && statusArr.length > 0) {
        await db.insert(pmStatuses).values(
          statusArr.map((s) => ({
            workspaceId: input.workspaceId,
            name: s.name,
            color: s.color,
            isClosed: s.isClosed ?? false,
            isDefault: s.isDefault ?? false,
            position: s.position,
          }))
        );
      }

      // 3. Seed types
      const typeArr = tpl.types as Array<{ name: string; color: string; icon?: string; isMilestone?: boolean; position: number }> | undefined;
      if (typeArr && typeArr.length > 0) {
        await db.insert(pmTypes).values(
          typeArr.map((t) => ({
            workspaceId: input.workspaceId,
            name: t.name,
            color: t.color,
            icon: t.icon,
            isMilestone: t.isMilestone ?? false,
            position: t.position,
          }))
        );
      }

      // 4. Seed phases + tasks (parent-child)
      const phasesArr = tpl.phases as Array<{ name: string; type: string; tasks: Array<{ title: string; type: string }> }> | undefined;
      if (phasesArr && phasesArr.length > 0) {
        let position = 1;
        for (const phase of phasesArr) {
          // Create parent phase task
          const [parentTask] = await db.insert(tasks).values({
            workspaceId: input.workspaceId,
            projectId: created.id,
            title: phase.name,
            type: phase.type || "task",
            status: "todo",
            priority: "medium",
            position: position++,
          }).returning();

          // Create child tasks
          if (phase.tasks && phase.tasks.length > 0) {
            for (const child of phase.tasks) {
              await db.insert(tasks).values({
                workspaceId: input.workspaceId,
                projectId: created.id,
                title: child.title,
                type: child.type || "task",
                status: "todo",
                priority: "medium",
                parentId: parentTask.id,
                position: position++,
              });
            }
          }
        }
      }

      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.apply", targetType: "project", targetId: created.id, metadata: { templateId: input.id } });
      return created;
    }),

  seed: governedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmProjectTemplates).values({
        workspaceId: input.workspaceId,
        name: "Full PM Lifecycle",
        description: "Complete PM² lifecycle with Initiating, Planning, Executing, Monitoring & Controlling, and Closing phases. Includes statuses, types, phase gates, milestones, and deliverables.",
        templateData: PM_LIFECYCLE_TEMPLATE_DATA,
        createdBy: ctx.user.id,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.seed", targetType: "project_template", targetId: created.id });
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
