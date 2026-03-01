/**
 * PMT Standalone Router — Workspace-free PM Shell API
 *
 * Auto-manages an internal "PM Shell" workspace so callers
 * never need to pass workspaceId. Fully independent from
 * the workspace system.
 *
 * Includes lifecycle state machine, governance gates, change control,
 * and project artifacts sub-routers.
 */

import { z } from "zod";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { projects, tasks, taskDependencies } from "./schema";
import { pmSprints } from "./sprints-schema";
import {
  pmtGateRequests, pmtChangeRequests, pmtProjectArtifacts, pmtStateTransitions,
} from "./governance-schema";
import { workspaces } from "../../../drizzle/tables/users";
import { seedWorkspaceModules } from "../registry";
import { toolsRouter } from "./tools-router";
import { wizardRouter } from "./wizard-router";
import {
  validateTransition, validateEvent, getAvailableTransitions,
  getAvailableEvents, inferEventFromTransition,
  PROJECT_STATES, LIFECYCLE_EVENTS, GATE_IDS, GATE_STATUSES,
  CHANGE_TYPES, CHANGE_IMPACTS, CHANGE_STATUSES,
  ARTIFACT_TYPES, FREEZE_ELIGIBLE_STATES, isFreezable,
  type ProjectState, type LifecycleEvent,
} from "./project-lifecycle";
import { getMethodPack } from "@shared/pm-method-packs";

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
      methodPackId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(projects).values({
        workspaceId: wsId,
        name: input.name,
        description: input.description,
        status: "draft_shell",
        riskLevel: input.riskLevel,
        ownerId: ctx.user.id,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
        metadata: input.methodPackId ? { methodPackId: input.methodPackId } : undefined,
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

// ── Lifecycle ──

const shellLifecycleRouter = router({
  getState: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      const currentState = (rows[0].status || "draft_shell") as ProjectState;
      return {
        projectId: rows[0].id,
        currentState,
        availableTransitions: getAvailableTransitions(currentState),
        availableEvents: getAvailableEvents(currentState),
        isFrozen: currentState === "control_hold" && !!(rows[0].metadata as any)?.frozenFromState,
        frozenFromState: (rows[0].metadata as any)?.frozenFromState || null,
      };
    }),

  transition: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      event: z.enum(LIFECYCLE_EVENTS as unknown as [string, ...string[]]).optional(),
      toState: z.enum(PROJECT_STATES as unknown as [string, ...string[]]).optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      if (!input.event && !input.toState) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Either event or toState is required" });
      }

      const rows = await db.select().from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const fromState = (rows[0].status || "draft_shell") as ProjectState;
      let targetState: ProjectState;
      let eventName: LifecycleEvent | undefined;
      let gateRequired = false;
      let gateId: string | undefined;

      if (input.event) {
        // Event-based validation (primary path)
        const ev = validateEvent(fromState, input.event as LifecycleEvent);
        if (!ev.valid || !ev.transition) {
          throw new TRPCError({ code: "BAD_REQUEST", message: ev.reason || "Invalid event" });
        }
        targetState = ev.transition.toState;
        eventName = ev.transition.event;
        gateRequired = ev.transition.gateRequired ?? false;
        gateId = ev.transition.gateId;
      } else {
        // Backward-compatible toState-based validation
        const validation = validateTransition(fromState, input.toState as ProjectState);
        if (!validation.valid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: validation.reason || "Invalid transition" });
        }
        targetState = input.toState as ProjectState;
        eventName = validation.event;
        gateRequired = validation.gateRequired;
        gateId = validation.gateId;
      }

      // If gate required, create gate request
      let gateRequestId: number | undefined;
      if (gateRequired && gateId) {
        const [gateReq] = await db.insert(pmtGateRequests).values({
          projectId: input.projectId,
          gateId,
          status: "pending",
          requestedBy: ctx.user.id,
          reason: input.reason,
        }).returning();
        gateRequestId = gateReq.id;
      }

      // Update project status
      await db.update(projects).set({
        status: targetState,
        updatedAt: new Date(),
      }).where(eq(projects.id, input.projectId));

      // Log state transition with event name
      const reason = eventName
        ? `[${eventName}] ${input.reason || ""}`
        : input.reason;
      await db.insert(pmtStateTransitions).values({
        projectId: input.projectId,
        fromState,
        toState: targetState,
        actorId: ctx.user.id,
        gateRequestId,
        reason: reason?.trim() || undefined,
      });

      return {
        success: true,
        fromState,
        toState: targetState,
        event: eventName,
        gateRequestId,
        gateRequired,
      };
    }),

  freeze: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const currentState = (rows[0].status || "draft_shell") as ProjectState;
      if (!isFreezable(currentState)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot freeze project in state "${currentState}". Eligible states: ${FREEZE_ELIGIBLE_STATES.join(", ")}`,
        });
      }

      // Store prior state in metadata
      const currentMeta = (rows[0].metadata || {}) as Record<string, unknown>;
      await db.update(projects).set({
        status: "control_hold",
        metadata: { ...currentMeta, frozenFromState: currentState },
        updatedAt: new Date(),
      } as any).where(eq(projects.id, input.projectId));

      // Log audit
      await db.insert(pmtStateTransitions).values({
        projectId: input.projectId,
        fromState: currentState,
        toState: "control_hold",
        actorId: ctx.user.id,
        reason: `[FREEZE] ${input.reason}`,
      });

      return { success: true, fromState: currentState, toState: "control_hold" as const };
    }),

  unfreeze: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const currentState = (rows[0].status || "draft_shell") as ProjectState;
      if (currentState !== "control_hold") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Project is not in control_hold state" });
      }

      const frozenFromState = (rows[0].metadata as any)?.frozenFromState as ProjectState | undefined;
      if (!frozenFromState) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No prior state recorded — cannot unfreeze (project may have entered control_hold via G3 fail, not freeze)" });
      }

      // Restore prior state, clear frozenFromState
      const currentMeta = (rows[0].metadata || {}) as Record<string, unknown>;
      const { frozenFromState: _, ...cleanedMeta } = currentMeta;
      await db.update(projects).set({
        status: frozenFromState,
        metadata: cleanedMeta,
        updatedAt: new Date(),
      } as any).where(eq(projects.id, input.projectId));

      // Log audit
      await db.insert(pmtStateTransitions).values({
        projectId: input.projectId,
        fromState: "control_hold",
        toState: frozenFromState,
        actorId: ctx.user.id,
        reason: `[UNFREEZE] ${input.reason || "Resumed from freeze"}`,
      });

      return { success: true, fromState: "control_hold" as const, toState: frozenFromState };
    }),

  clone: protectedProcedure
    .input(z.object({
      sourceProjectId: z.number(),
      name: z.string().min(1).max(255),
      cloneOptions: z.object({
        copyWizardData: z.boolean().default(true),
        copyMethodPack: z.boolean().default(true),
        copyRiskLevel: z.boolean().default(true),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getOrCreatePMShellWorkspace(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Load source project
      const rows = await db.select().from(projects)
        .where(and(eq(projects.id, input.sourceProjectId), eq(projects.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Source project not found" });

      const source = rows[0];
      const opts = input.cloneOptions ?? { copyWizardData: true, copyMethodPack: true, copyRiskLevel: true };

      // Build new metadata
      const newMeta: Record<string, unknown> = {};
      const sourceMeta = (source.metadata || {}) as Record<string, unknown>;

      if (opts.copyMethodPack && sourceMeta.methodPackId) {
        newMeta.methodPackId = sourceMeta.methodPackId;
      }

      if (opts.copyWizardData && sourceMeta.wizard) {
        const sourceWizard = sourceMeta.wizard as Record<string, unknown>;
        newMeta.wizard = {
          ...sourceWizard,
          completedSteps: [],
          currentStep: "method-confirmation",
          phase: "initiating",
        };
      }

      // Create new project as draft_shell
      const [created] = await db.insert(projects).values({
        workspaceId: wsId,
        name: input.name,
        description: source.description,
        status: "draft_shell",
        riskLevel: opts.copyRiskLevel ? source.riskLevel : "low",
        ownerId: ctx.user.id,
        parentProjectId: source.id,
        metadata: Object.keys(newMeta).length > 0 ? newMeta : undefined,
      }).returning();

      // Log audit event on new project
      await db.insert(pmtStateTransitions).values({
        projectId: created.id,
        fromState: "draft_shell",
        toState: "draft_shell",
        actorId: ctx.user.id,
        reason: `Cloned from project #${source.id} (${source.name})`,
      });

      return created;
    }),

  history: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtStateTransitions)
        .where(eq(pmtStateTransitions.projectId, input.projectId))
        .orderBy(desc(pmtStateTransitions.createdAt))
        .limit(100);
    }),
});

// ── Gates ──

const shellGatesRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtGateRequests)
        .where(eq(pmtGateRequests.projectId, input.projectId))
        .orderBy(desc(pmtGateRequests.createdAt));
    }),

  request: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      gateId: z.enum(GATE_IDS as unknown as [string, ...string[]]),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmtGateRequests).values({
        projectId: input.projectId,
        gateId: input.gateId,
        status: "pending",
        requestedBy: ctx.user.id,
        reason: input.reason,
      }).returning();
      return created;
    }),

  evaluate: protectedProcedure
    .input(z.object({
      gateRequestId: z.number(),
      passed: z.boolean(),
      verdict: z.record(z.unknown()).optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Get gate request
      const rows = await db.select().from(pmtGateRequests)
        .where(eq(pmtGateRequests.id, input.gateRequestId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Gate request not found" });
      if (rows[0].status !== "pending" && rows[0].status !== "evaluating") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Gate already evaluated" });
      }

      const gateReq = rows[0];
      const newStatus = input.passed ? "passed" : "failed";

      // Method-pack-aware G1 artifact check
      let methodPackWarnings: string[] = [];
      if (gateReq.gateId === "G1" && input.passed) {
        const projRows = await db.select().from(projects)
          .where(eq(projects.id, gateReq.projectId))
          .limit(1);
        const packId = (projRows[0]?.metadata as any)?.methodPackId;
        if (packId) {
          const pack = getMethodPack(packId);
          if (pack.requiredArtifacts && pack.requiredArtifacts.length > 0) {
            const artifacts = await db.select().from(pmtProjectArtifacts)
              .where(eq(pmtProjectArtifacts.projectId, gateReq.projectId));
            const existingTypes = new Set(artifacts.map((a) => a.name.toLowerCase().replace(/\s+/g, "_")));
            const existingArtifactTypes = new Set(artifacts.map((a) => a.artifactType));
            for (const req of pack.requiredArtifacts) {
              if (!existingTypes.has(req) && !existingArtifactTypes.has(req)) {
                methodPackWarnings.push(`Method pack requires artifact "${req}" which was not found`);
              }
            }
          }
        }
      }

      // Update gate request (include method pack warnings in verdict)
      const verdictPayload = input.verdict
        ? { ...input.verdict, methodPackWarnings }
        : { passed: input.passed, methodPackWarnings };
      await db.update(pmtGateRequests).set({
        status: newStatus,
        evaluatedBy: ctx.user.id,
        evaluatedAt: new Date(),
        verdict: verdictPayload,
        reason: input.reason,
      }).where(eq(pmtGateRequests.id, input.gateRequestId));

      // Determine state transition based on gate result
      const project = await db.select().from(projects)
        .where(eq(projects.id, gateReq.projectId))
        .limit(1);
      if (!project[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const currentState = project[0].status as ProjectState;
      let targetState: ProjectState | null = null;

      // Map gate results to state transitions
      if (input.passed) {
        if (gateReq.gateId === "G0" && currentState === "intake_review") targetState = "planning";
        if (gateReq.gateId === "G1" && currentState === "plan_gate_pending") targetState = "authorized";
        if (gateReq.gateId === "G2" && currentState === "change_pending") targetState = "executing";
        if (gateReq.gateId === "G4" && currentState === "close_gate_pending") targetState = "closed";
      } else {
        if (gateReq.gateId === "G0" && currentState === "intake_review") targetState = "rejected";
        if (gateReq.gateId === "G1" && currentState === "plan_gate_pending") targetState = "planning";
        if (gateReq.gateId === "G3") targetState = "control_hold";
        if (gateReq.gateId === "G4" && currentState === "close_gate_pending") targetState = "closing";
      }

      if (targetState) {
        await db.update(projects).set({
          status: targetState,
          updatedAt: new Date(),
        }).where(eq(projects.id, gateReq.projectId));

        await db.insert(pmtStateTransitions).values({
          projectId: gateReq.projectId,
          fromState: currentState,
          toState: targetState,
          actorId: ctx.user.id,
          gateRequestId: input.gateRequestId,
          reason: input.reason || `${gateReq.gateId} gate ${newStatus}`,
        });
      }

      return { success: true, gateStatus: newStatus, newProjectState: targetState, methodPackWarnings };
    }),

  waive: protectedProcedure
    .input(z.object({
      gateRequestId: z.number(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(pmtGateRequests)
        .where(eq(pmtGateRequests.id, input.gateRequestId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Gate request not found" });

      await db.update(pmtGateRequests).set({
        status: "waived",
        evaluatedBy: ctx.user.id,
        evaluatedAt: new Date(),
        reason: `WAIVED: ${input.reason}`,
      }).where(eq(pmtGateRequests.id, input.gateRequestId));

      return { success: true };
    }),
});

// ── Changes ──

const shellChangesRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      if (input.projectId) {
        return db.select().from(pmtChangeRequests)
          .where(eq(pmtChangeRequests.projectId, input.projectId))
          .orderBy(desc(pmtChangeRequests.createdAt));
      }
      return db.select().from(pmtChangeRequests)
        .orderBy(desc(pmtChangeRequests.createdAt))
        .limit(100);
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      changeType: z.enum(CHANGE_TYPES as unknown as [string, ...string[]]),
      impact: z.enum(CHANGE_IMPACTS as unknown as [string, ...string[]]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmtChangeRequests).values({
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        changeType: input.changeType,
        impact: input.impact || "medium",
        requestedBy: ctx.user.id,
      }).returning();
      return created;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      changeType: z.string().optional(),
      impact: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmtChangeRequests).set({ ...updates, updatedAt: new Date() })
        .where(eq(pmtChangeRequests.id, id));
      return { success: true };
    }),

  submit: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(pmtChangeRequests)
        .where(eq(pmtChangeRequests.id, input.id))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Change request not found" });
      if (rows[0].status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft changes can be submitted" });
      }

      // Create G2 gate request
      const [gateReq] = await db.insert(pmtGateRequests).values({
        projectId: rows[0].projectId,
        gateId: "G2",
        status: "pending",
        requestedBy: ctx.user.id,
        reason: `Change request: ${rows[0].title}`,
      }).returning();

      // Update change request status
      await db.update(pmtChangeRequests).set({
        status: "submitted",
        gateRequestId: gateReq.id,
        updatedAt: new Date(),
      }).where(eq(pmtChangeRequests.id, input.id));

      return { success: true, gateRequestId: gateReq.id };
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(pmtChangeRequests).set({
        status: "approved",
        reviewedBy: ctx.user.id,
        updatedAt: new Date(),
      }).where(eq(pmtChangeRequests.id, input.id));
      return { success: true };
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(pmtChangeRequests).set({
        status: "rejected",
        reviewedBy: ctx.user.id,
        updatedAt: new Date(),
      }).where(eq(pmtChangeRequests.id, input.id));
      return { success: true };
    }),
});

// ── Artifacts ──

const shellArtifactsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtProjectArtifacts)
        .where(eq(pmtProjectArtifacts.projectId, input.projectId))
        .orderBy(desc(pmtProjectArtifacts.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1).max(255),
      artifactType: z.enum(ARTIFACT_TYPES as unknown as [string, ...string[]]),
      content: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Compute SHA-256 hash of content
      const contentStr = JSON.stringify(input.content);
      const sha256 = createHash("sha256").update(contentStr).digest("hex");

      const [created] = await db.insert(pmtProjectArtifacts).values({
        projectId: input.projectId,
        name: input.name,
        artifactType: input.artifactType,
        content: input.content,
        sha256,
        createdBy: ctx.user.id,
      }).returning();
      return created;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmtProjectArtifacts)
        .where(eq(pmtProjectArtifacts.id, input.id))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Artifact not found" });
      return rows[0];
    }),
});

// ── Export ──

export const standaloneRouter = router({
  projects: shellProjectsRouter,
  tasks: shellTasksRouter,
  sprints: shellSprintsRouter,
  dependencies: shellDependenciesRouter,
  lifecycle: shellLifecycleRouter,
  gates: shellGatesRouter,
  changes: shellChangesRouter,
  artifacts: shellArtifactsRouter,
  tools: toolsRouter,
  wizard: wizardRouter,
});
