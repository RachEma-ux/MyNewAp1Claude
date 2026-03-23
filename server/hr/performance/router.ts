/**
 * HR Performance Router — Cycles, Goals, Reviews
 *
 * Performance management: review cycles, employee goals with tracking,
 * and performance reviews with employee self-input + manager review path.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrPerformanceCycles,
  hrGoals,
  hrPerformanceReviews,
} from "../../../drizzle/schema";
import { logHrAudit, logStatusChange, logSensitiveRead } from "../audit";
import {
  checkHrAccess,
  requireHrPermission,
  preventSelfApproval,
  getWorkerIdForUser,
  HR_ACTIONS,
} from "../permissions";

// ============================================================================
// State machines
// ============================================================================

const CYCLE_STATUS_FLOW: Record<string, string[]> = {
  draft: ["active", "cancelled"],
  active: ["goal_setting", "cancelled"],
  goal_setting: ["self_review", "cancelled"],
  self_review: ["manager_review", "cancelled"],
  manager_review: ["calibration", "completed", "cancelled"],
  calibration: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const GOAL_STATUS_FLOW: Record<string, string[]> = {
  draft: ["active", "cancelled"],
  active: ["completed", "deferred", "cancelled"],
  completed: [],
  deferred: ["active", "cancelled"],
  cancelled: [],
};

const REVIEW_STATUS_FLOW: Record<string, string[]> = {
  pending: ["self_review", "cancelled"],
  self_review: ["manager_review"],
  manager_review: ["completed"],
  completed: [],
  cancelled: [],
};

function validateTransition(current: string, next: string, flowMap: Record<string, string[]>, entity: string) {
  const allowed = flowMap[current] ?? [];
  if (!allowed.includes(next)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot transition ${entity} from '${current}' to '${next}'`,
    });
  }
}

export const hrPerformanceRouter = router({
  // ============================================================================
  // Performance Cycles
  // ============================================================================

  listCycles: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.PERFORMANCE_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.status) conditions.push(eq(hrPerformanceCycles.status, input.status));

      return db.select().from(hrPerformanceCycles)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrPerformanceCycles.startDate))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getCycle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.PERFORMANCE_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrPerformanceCycles)
        .where(eq(hrPerformanceCycles.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Performance cycle not found" });
      return row;
    }),

  createCycle: governedProcedure
    .input(z.object({
      name: z.string().max(200),
      description: z.string().optional(),
      cycleType: z.enum(["annual", "semi_annual", "quarterly", "probation"]).default("annual"),
      startDate: z.string(),
      endDate: z.string(),
      goalSettingDeadline: z.string().optional(),
      selfReviewDeadline: z.string().optional(),
      managerReviewDeadline: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.PERFORMANCE_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrPerformanceCycles).values({
        ...input,
        status: "draft",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.performance.cycle.create",
        metadata: { cycleId: created.id, name: input.name, type: input.cycleType },
      });

      return created;
    }),

  updateCycleStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.PERFORMANCE_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrPerformanceCycles)
        .where(eq(hrPerformanceCycles.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found" });

      validateTransition(current.status, input.status, CYCLE_STATUS_FLOW, "performance cycle");

      await db.update(hrPerformanceCycles).set({
        status: input.status,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      }).where(eq(hrPerformanceCycles.id, input.id));

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.performance.cycle.status_change",
        metadata: { cycleId: input.id, from: current.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, domain: "performance.cycle", entityId: input.id, fromStatus: current.status, toStatus: input.status });

      return { success: true };
    }),

  // ============================================================================
  // Goals
  // ============================================================================

  listGoals: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      cycleId: z.number().optional(),
      workerId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.PERFORMANCE_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.cycleId) conditions.push(eq(hrGoals.cycleId, input.cycleId));
      if (input.workerId) conditions.push(eq(hrGoals.workerId, input.workerId));
      if (input.status) conditions.push(eq(hrGoals.status, input.status));

      return db.select().from(hrGoals)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrGoals.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getGoal: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.PERFORMANCE_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrGoals)
        .where(eq(hrGoals.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
      return row;
    }),

  createGoal: governedProcedure
    .input(z.object({
      cycleId: z.number(),
      workerId: z.number(),
      title: z.string().max(300),
      description: z.string().optional(),
      category: z.enum(["performance", "development", "strategic", "operational"]).optional(),
      weight: z.number().min(0).max(100).default(0),
      targetMetric: z.string().max(200).optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.PERFORMANCE_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrGoals).values({
        ...input,
        status: "draft",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.performance.goal.create",
        metadata: { goalId: created.id, title: input.title },
      });

      return created;
    }),

  updateGoal: governedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().max(300).optional(),
      description: z.string().optional(),
      weight: z.number().min(0).max(100).optional(),
      targetMetric: z.string().max(200).optional(),
      currentProgress: z.number().min(0).max(100).optional(),
      status: z.string().optional(),
      managerApproved: z.boolean().optional(),
      employeeNotes: z.string().optional(),
      managerNotes: z.string().optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.PERFORMANCE_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrGoals)
        .where(eq(hrGoals.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });

      if (input.status && input.status !== current.status) {
        validateTransition(current.status, input.status, GOAL_STATUS_FLOW, "goal");
      }

      const { id, ...fields } = input;
      const updates: Record<string, unknown> = {
        ...fields,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      };
      if (input.status === "completed") updates.completedAt = new Date();

      await db.update(hrGoals).set(updates).where(eq(hrGoals.id, id));

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: current.workerId,
        action: input.status ? "hr.performance.goal.status_change" : "hr.performance.goal.update",
        metadata: { goalId: id, from: current.status, to: input.status },
      });
      if (input.status && input.status !== current.status) {
        await logStatusChange({ actorId: ctx.user.id, targetWorkerId: current.workerId, domain: "performance.goal", entityId: id, fromStatus: current.status, toStatus: input.status });
      }

      return { success: true };
    }),

  // ============================================================================
  // Performance Reviews
  // ============================================================================

  listReviews: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      cycleId: z.number().optional(),
      workerId: z.number().optional(),
      reviewerId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.PERFORMANCE_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.cycleId) conditions.push(eq(hrPerformanceReviews.cycleId, input.cycleId));
      if (input.workerId) conditions.push(eq(hrPerformanceReviews.workerId, input.workerId));
      if (input.reviewerId) conditions.push(eq(hrPerformanceReviews.reviewerId, input.reviewerId));
      if (input.status) conditions.push(eq(hrPerformanceReviews.status, input.status));

      return db.select().from(hrPerformanceReviews)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrPerformanceReviews.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getReview: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.PERFORMANCE_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrPerformanceReviews)
        .where(eq(hrPerformanceReviews.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Performance review not found" });
      return row;
    }),

  createReview: governedProcedure
    .input(z.object({
      cycleId: z.number(),
      workerId: z.number(),
      reviewerId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.PERFORMANCE_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrPerformanceReviews).values({
        ...input,
        status: "pending",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.performance.review.create",
        metadata: { reviewId: created.id, cycleId: input.cycleId },
      });

      return created;
    }),

  /** Employee submits self-review */
  submitSelfReview: governedProcedure
    .input(z.object({
      id: z.number(),
      selfRating: z.number().min(1).max(5),
      selfComments: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.PERFORMANCE_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrPerformanceReviews)
        .where(eq(hrPerformanceReviews.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });

      // Must be in pending or self_review status
      if (current.status !== "pending" && current.status !== "self_review") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot submit self-review when status is '${current.status}'`,
        });
      }

      await db.update(hrPerformanceReviews).set({
        selfRating: input.selfRating,
        selfComments: input.selfComments,
        selfSubmittedAt: new Date(),
        status: "self_review",
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      }).where(eq(hrPerformanceReviews.id, input.id));

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: current.workerId,
        action: "hr.performance.review.self_submit",
        metadata: { reviewId: input.id, rating: input.selfRating },
      });

      return { success: true };
    }),

  /** Manager submits review */
  submitManagerReview: governedProcedure
    .input(z.object({
      id: z.number(),
      managerRating: z.number().min(1).max(5),
      managerComments: z.string(),
      overallRating: z.number().min(1).max(5).optional(),
      overallComments: z.string().optional(),
      developmentPlan: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.PERFORMANCE_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrPerformanceReviews)
        .where(eq(hrPerformanceReviews.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });

      if (current.status !== "self_review" && current.status !== "manager_review") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot submit manager review when status is '${current.status}'`,
        });
      }

      // Prevent manager from reviewing themselves
      const actorWorkerId = await getWorkerIdForUser(ctx.user.id);
      preventSelfApproval(ctx.user.id, current.workerId, actorWorkerId, "performance review");

      await db.update(hrPerformanceReviews).set({
        managerRating: input.managerRating,
        managerComments: input.managerComments,
        managerSubmittedAt: new Date(),
        overallRating: input.overallRating ?? input.managerRating,
        overallComments: input.overallComments,
        developmentPlan: input.developmentPlan,
        status: "completed",
        completedAt: new Date(),
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      }).where(eq(hrPerformanceReviews.id, input.id));

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: current.workerId,
        action: "hr.performance.review.manager_submit",
        metadata: { reviewId: input.id, rating: input.managerRating, overall: input.overallRating },
      });

      return { success: true };
    }),

  updateReviewStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.PERFORMANCE_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrPerformanceReviews)
        .where(eq(hrPerformanceReviews.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });

      validateTransition(current.status, input.status, REVIEW_STATUS_FLOW, "performance review");

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      };
      if (input.status === "completed") updates.completedAt = new Date();

      await db.update(hrPerformanceReviews).set(updates)
        .where(eq(hrPerformanceReviews.id, input.id));

      await logStatusChange({ actorId: ctx.user.id, targetWorkerId: current.workerId, domain: "performance.review", entityId: input.id, fromStatus: current.status, toStatus: input.status });

      return { success: true };
    }),

  // ============================================================================
  // Performance Summary
  // ============================================================================

  summary: protectedProcedure.query(async ({ ctx }) => {
    await checkHrAccess(ctx.user, HR_ACTIONS.PERFORMANCE_READ);
    const db = getDb();
    if (!db) return { activeCycles: 0, pendingReviews: 0, activeGoals: 0 };

    const [cycleCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrPerformanceCycles)
      .where(or(
        eq(hrPerformanceCycles.status, "active"),
        eq(hrPerformanceCycles.status, "goal_setting"),
        eq(hrPerformanceCycles.status, "self_review"),
        eq(hrPerformanceCycles.status, "manager_review"),
        eq(hrPerformanceCycles.status, "calibration"),
      ));

    const [reviewCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrPerformanceReviews)
      .where(or(
        eq(hrPerformanceReviews.status, "pending"),
        eq(hrPerformanceReviews.status, "self_review"),
        eq(hrPerformanceReviews.status, "manager_review"),
      ));

    const [goalCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrGoals)
      .where(eq(hrGoals.status, "active"));

    return {
      activeCycles: cycleCount?.count ?? 0,
      pendingReviews: reviewCount?.count ?? 0,
      activeGoals: goalCount?.count ?? 0,
    };
  }),
});
