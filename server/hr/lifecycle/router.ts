/**
 * HR Lifecycle Router — Onboarding & Offboarding case management
 *
 * Manages lifecycle cases with auto-generated task sets, status tracking,
 * knowledge transfer items, and exit interviews.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrOnboardingCases,
  hrOnboardingTasks,
  hrOffboardingCases,
  hrOffboardingTasks,
  hrKnowledgeTransferItems,
  hrExitInterviews,
} from "../../../drizzle/schema";
import { logHrAudit, logStatusChange } from "../audit";
import {
  checkHrAccess,
  requireHrPermission,
  HR_ACTIONS,
} from "../permissions";
import { logLifecycleEvent } from "./event-logger";
import { generateOnboardingTasks, generateOffboardingTasks } from "./task-generator";

// ============================================================================
// Valid state transitions
// ============================================================================

const ONBOARDING_STATUS_FLOW: Record<string, string[]> = {
  pending: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const OFFBOARDING_STATUS_FLOW: Record<string, string[]> = {
  initiated: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const TASK_STATUS_FLOW: Record<string, string[]> = {
  pending: ["in_progress", "skipped", "blocked"],
  in_progress: ["completed", "blocked", "pending"],
  blocked: ["pending", "in_progress", "skipped"],
  skipped: [],
  completed: [],
};

export const hrLifecycleRouter = router({
  // ============================================================================
  // Onboarding Cases
  // ============================================================================

  listOnboardingCases: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ONBOARDING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.status) conditions.push(eq(hrOnboardingCases.status, input.status));

      return db.select().from(hrOnboardingCases)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrOnboardingCases.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getOnboardingCase: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ONBOARDING_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrOnboardingCases)
        .where(eq(hrOnboardingCases.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Onboarding case not found" });
      return row;
    }),

  createOnboardingCase: governedProcedure
    .input(z.object({
      workerId: z.number().optional(),
      candidateId: z.number().optional(),
      offerId: z.number().optional(),
      positionId: z.number().optional(),
      orgUnitId: z.number().optional(),
      managerWorkerId: z.number().optional(),
      plannedStartDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ONBOARDING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrOnboardingCases).values({
        ...input,
        status: "pending",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      // Auto-generate task set
      const taskCount = await generateOnboardingTasks(created.id, input.plannedStartDate);

      // Update total task count on case
      await db.update(hrOnboardingCases)
        .set({ totalTasks: taskCount })
        .where(eq(hrOnboardingCases.id, created.id));

      await logLifecycleEvent({
        entityType: "onboarding_case",
        entityId: created.id,
        event: "created",
        toStatus: "pending",
        actorId: ctx.user.id,
        metadata: { taskCount, workerId: input.workerId },
      });

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.onboarding.case.create",
        metadata: { caseId: created.id, taskCount },
      });

      return { ...created, totalTasks: taskCount };
    }),

  updateOnboardingStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      actualStartDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ONBOARDING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrOnboardingCases)
        .where(eq(hrOnboardingCases.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });

      const allowed = ONBOARDING_STATUS_FLOW[current.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from '${current.status}' to '${input.status}'`,
        });
      }

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      };
      if (input.status === "completed") updates.completedAt = new Date();
      if (input.actualStartDate) updates.actualStartDate = input.actualStartDate;
      if (input.notes) updates.notes = input.notes;

      await db.update(hrOnboardingCases).set(updates)
        .where(eq(hrOnboardingCases.id, input.id));

      await logLifecycleEvent({
        entityType: "onboarding_case",
        entityId: input.id,
        event: "status_change",
        fromStatus: current.status,
        toStatus: input.status,
        actorId: ctx.user.id,
      });
      await logStatusChange({ actorId: ctx.user.id, targetWorkerId: current.workerId ?? undefined, domain: "lifecycle.onboarding", entityId: input.id, fromStatus: current.status, toStatus: input.status });

      return { success: true };
    }),

  // ============================================================================
  // Onboarding Tasks
  // ============================================================================

  listOnboardingTasks: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      category: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ONBOARDING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [eq(hrOnboardingTasks.caseId, input.caseId)];
      if (input.category) conditions.push(eq(hrOnboardingTasks.category, input.category));
      if (input.status) conditions.push(eq(hrOnboardingTasks.status, input.status));

      return db.select().from(hrOnboardingTasks)
        .where(and(...conditions))
        .orderBy(hrOnboardingTasks.sortOrder);
    }),

  updateOnboardingTask: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string().optional(),
      assigneeId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ONBOARDING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrOnboardingTasks)
        .where(eq(hrOnboardingTasks.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });

      // Validate status transition if status is being changed
      if (input.status && input.status !== current.status) {
        const allowed = TASK_STATUS_FLOW[current.status] ?? [];
        if (!allowed.includes(input.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot transition task from '${current.status}' to '${input.status}'`,
          });
        }
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.status) updates.status = input.status;
      if (input.assigneeId !== undefined) updates.assigneeId = input.assigneeId;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.status === "completed") {
        updates.completedAt = new Date();
        updates.completedBy = ctx.user.id;
      }

      await db.update(hrOnboardingTasks).set(updates)
        .where(eq(hrOnboardingTasks.id, input.id));

      // Update completed task count on case
      if (input.status === "completed" || input.status === "skipped") {
        const [countRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(hrOnboardingTasks)
          .where(and(
            eq(hrOnboardingTasks.caseId, current.caseId),
            or(
              eq(hrOnboardingTasks.status, "completed"),
              eq(hrOnboardingTasks.status, "skipped"),
            ),
          ));
        // The UPDATE already committed the new status, so the COUNT reflects it
        const completedCount = countRow?.count ?? 0;
        await db.update(hrOnboardingCases)
          .set({ completedTasks: completedCount, updatedAt: new Date() })
          .where(eq(hrOnboardingCases.id, current.caseId));
      }

      return { success: true };
    }),

  // ============================================================================
  // Offboarding Cases
  // ============================================================================

  listOffboardingCases: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.OFFBOARDING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.status) conditions.push(eq(hrOffboardingCases.status, input.status));

      return db.select().from(hrOffboardingCases)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrOffboardingCases.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getOffboardingCase: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.OFFBOARDING_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrOffboardingCases)
        .where(eq(hrOffboardingCases.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Offboarding case not found" });
      return row;
    }),

  createOffboardingCase: governedProcedure
    .input(z.object({
      workerId: z.number(),
      reason: z.enum(["resignation", "termination", "retirement", "contract_end", "mutual_agreement"]),
      lastWorkingDate: z.string().optional(),
      noticeDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.OFFBOARDING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrOffboardingCases).values({
        ...input,
        status: "initiated",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      // Auto-generate task set
      const taskCount = await generateOffboardingTasks(created.id, input.lastWorkingDate);

      await db.update(hrOffboardingCases)
        .set({ totalTasks: taskCount })
        .where(eq(hrOffboardingCases.id, created.id));

      await logLifecycleEvent({
        entityType: "offboarding_case",
        entityId: created.id,
        event: "created",
        toStatus: "initiated",
        actorId: ctx.user.id,
        metadata: { taskCount, workerId: input.workerId, reason: input.reason },
      });

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.offboarding.case.create",
        metadata: { caseId: created.id, reason: input.reason, taskCount },
      });

      return { ...created, totalTasks: taskCount };
    }),

  updateOffboardingStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.OFFBOARDING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrOffboardingCases)
        .where(eq(hrOffboardingCases.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });

      const allowed = OFFBOARDING_STATUS_FLOW[current.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from '${current.status}' to '${input.status}'`,
        });
      }

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      };
      if (input.status === "completed") updates.completedAt = new Date();
      if (input.notes) updates.notes = input.notes;

      await db.update(hrOffboardingCases).set(updates)
        .where(eq(hrOffboardingCases.id, input.id));

      await logLifecycleEvent({
        entityType: "offboarding_case",
        entityId: input.id,
        event: "status_change",
        fromStatus: current.status,
        toStatus: input.status,
        actorId: ctx.user.id,
      });
      await logStatusChange({ actorId: ctx.user.id, targetWorkerId: current.workerId, domain: "lifecycle.offboarding", entityId: input.id, fromStatus: current.status, toStatus: input.status });

      return { success: true };
    }),

  // ============================================================================
  // Offboarding Tasks
  // ============================================================================

  listOffboardingTasks: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      category: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.OFFBOARDING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [eq(hrOffboardingTasks.caseId, input.caseId)];
      if (input.category) conditions.push(eq(hrOffboardingTasks.category, input.category));
      if (input.status) conditions.push(eq(hrOffboardingTasks.status, input.status));

      return db.select().from(hrOffboardingTasks)
        .where(and(...conditions))
        .orderBy(hrOffboardingTasks.sortOrder);
    }),

  updateOffboardingTask: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string().optional(),
      assigneeId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.OFFBOARDING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrOffboardingTasks)
        .where(eq(hrOffboardingTasks.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });

      if (input.status && input.status !== current.status) {
        const allowed = TASK_STATUS_FLOW[current.status] ?? [];
        if (!allowed.includes(input.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot transition task from '${current.status}' to '${input.status}'`,
          });
        }
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.status) updates.status = input.status;
      if (input.assigneeId !== undefined) updates.assigneeId = input.assigneeId;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.status === "completed") {
        updates.completedAt = new Date();
        updates.completedBy = ctx.user.id;
      }

      await db.update(hrOffboardingTasks).set(updates)
        .where(eq(hrOffboardingTasks.id, input.id));

      // Update completed task count on case
      if (input.status === "completed" || input.status === "skipped") {
        const [countRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(hrOffboardingTasks)
          .where(and(
            eq(hrOffboardingTasks.caseId, current.caseId),
            or(
              eq(hrOffboardingTasks.status, "completed"),
              eq(hrOffboardingTasks.status, "skipped"),
            ),
          ));
        // The UPDATE already committed the new status, so the COUNT reflects it
        const completedCount = countRow?.count ?? 0;
        await db.update(hrOffboardingCases)
          .set({ completedTasks: completedCount, updatedAt: new Date() })
          .where(eq(hrOffboardingCases.id, current.caseId));
      }

      return { success: true };
    }),

  // ============================================================================
  // Knowledge Transfer Items (Offboarding)
  // ============================================================================

  listKnowledgeTransferItems: protectedProcedure
    .input(z.object({ offboardingCaseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.OFFBOARDING_READ);
      const db = getDb();
      if (!db) return [];

      return db.select().from(hrKnowledgeTransferItems)
        .where(eq(hrKnowledgeTransferItems.offboardingCaseId, input.offboardingCaseId))
        .orderBy(hrKnowledgeTransferItems.createdAt);
    }),

  createKnowledgeTransferItem: governedProcedure
    .input(z.object({
      offboardingCaseId: z.number(),
      title: z.string().min(1).max(300),
      description: z.string().optional(),
      recipientWorkerId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.OFFBOARDING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrKnowledgeTransferItems).values({
        ...input,
        status: "pending",
      }).returning();

      return created;
    }),

  updateKnowledgeTransferItem: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "in_progress", "completed"]).optional(),
      notes: z.string().optional(),
      recipientWorkerId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.OFFBOARDING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { id, ...updates } = input;
      const setData: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (input.status === "completed") setData.completedAt = new Date();

      await db.update(hrKnowledgeTransferItems).set(setData)
        .where(eq(hrKnowledgeTransferItems.id, id));

      return { success: true };
    }),

  // ============================================================================
  // Exit Interviews
  // ============================================================================

  listExitInterviews: protectedProcedure
    .input(z.object({
      offboardingCaseId: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.OFFBOARDING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.offboardingCaseId) conditions.push(eq(hrExitInterviews.offboardingCaseId, input.offboardingCaseId));
      if (input.status) conditions.push(eq(hrExitInterviews.status, input.status));

      return db.select().from(hrExitInterviews)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrExitInterviews.createdAt))
        .limit(input.limit);
    }),

  createExitInterview: governedProcedure
    .input(z.object({
      offboardingCaseId: z.number(),
      workerId: z.number(),
      interviewerId: z.number().optional(),
      scheduledAt: z.string().optional(),
      confidential: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.OFFBOARDING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrExitInterviews).values({
        ...input,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        status: "scheduled",
      }).returning();

      return created;
    }),

  updateExitInterview: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["scheduled", "completed", "cancelled", "declined"]).optional(),
      feedback: z.string().optional(),
      overallSatisfaction: z.number().min(1).max(5).optional(),
      wouldRecommend: z.boolean().optional(),
      primaryReason: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.OFFBOARDING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { id, ...updates } = input;
      const setData: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (input.status === "completed") setData.conductedAt = new Date();

      await db.update(hrExitInterviews).set(setData)
        .where(eq(hrExitInterviews.id, id));

      return { success: true };
    }),

  // ============================================================================
  // Lifecycle Summary
  // ============================================================================

  summary: protectedProcedure.query(async ({ ctx }) => {
    await checkHrAccess(ctx.user, HR_ACTIONS.LIFECYCLE_READ);
    const db = getDb();
    if (!db) return { activeOnboarding: 0, activeOffboarding: 0, pendingTasks: 0 };

    const [onboardRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrOnboardingCases)
      .where(or(
        eq(hrOnboardingCases.status, "pending"),
        eq(hrOnboardingCases.status, "in_progress"),
      ));

    const [offboardRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrOffboardingCases)
      .where(or(
        eq(hrOffboardingCases.status, "initiated"),
        eq(hrOffboardingCases.status, "in_progress"),
      ));

    const [taskRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrOnboardingTasks)
      .where(eq(hrOnboardingTasks.status, "pending"));

    return {
      activeOnboarding: onboardRows?.count ?? 0,
      activeOffboarding: offboardRows?.count ?? 0,
      pendingTasks: taskRows?.count ?? 0,
    };
  }),
});
