/**
 * HR Time & Attendance Router — Time entries, Leave, Overtime, Shifts
 *
 * Workforce operations: time tracking, leave management with approval,
 * overtime requests with approval, shift planning and assignments.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, or, sql, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrTimeEntries,
  hrLeaveTypes,
  hrLeaveRequests,
  hrLeaveBalances,
  hrOvertimeRequests,
  hrShiftPlans,
  hrShiftAssignments,
} from "../../../drizzle/schema";
import { logHrAudit, logStatusChange } from "../audit";
import {
  checkHrAccess,
  requireHrPermission,
  HR_ACTIONS,
} from "../permissions";

// ============================================================================
// State machines
// ============================================================================

const TIME_ENTRY_STATUS_FLOW: Record<string, string[]> = {
  draft: ["submitted"],
  submitted: ["approved", "rejected"],
  approved: [],
  rejected: ["draft"],
};

const LEAVE_REQUEST_STATUS_FLOW: Record<string, string[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  rejected: [],
  cancelled: [],
  completed: [],
};

const OVERTIME_STATUS_FLOW: Record<string, string[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: [],
  rejected: [],
  cancelled: [],
};

const SHIFT_PLAN_STATUS_FLOW: Record<string, string[]> = {
  draft: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const SHIFT_ASSIGNMENT_STATUS_FLOW: Record<string, string[]> = {
  assigned: ["confirmed", "absent", "swapped"],
  confirmed: ["completed", "absent", "swapped"],
  completed: [],
  absent: [],
  swapped: [],
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

export const hrTimeRouter = router({
  // ============================================================================
  // Time Entries
  // ============================================================================

  listTimeEntries: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      workerId: z.number().optional(),
      status: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.TIME_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.workerId) conditions.push(eq(hrTimeEntries.workerId, input.workerId));
      if (input.status) conditions.push(eq(hrTimeEntries.status, input.status));
      if (input.dateFrom) conditions.push(gte(hrTimeEntries.entryDate, input.dateFrom));
      if (input.dateTo) conditions.push(lte(hrTimeEntries.entryDate, input.dateTo));

      return db.select().from(hrTimeEntries)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrTimeEntries.entryDate))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getTimeEntry: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.TIME_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrTimeEntries)
        .where(eq(hrTimeEntries.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found" });
      return row;
    }),

  createTimeEntry: governedProcedure
    .input(z.object({
      workerId: z.number(),
      entryDate: z.string(),
      startTime: z.string().max(10).optional(),
      endTime: z.string().max(10).optional(),
      hoursWorked: z.string().optional(),
      breakMinutes: z.number().min(0).default(0),
      entryType: z.enum(["regular", "overtime", "holiday", "sick", "remote"]).default("regular"),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.TIME_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrTimeEntries).values({
        ...input,
        status: "draft",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.time.entry.create",
        metadata: { entryId: created.id, date: input.entryDate },
      });

      return created;
    }),

  updateTimeEntry: governedProcedure
    .input(z.object({
      id: z.number(),
      startTime: z.string().max(10).optional(),
      endTime: z.string().max(10).optional(),
      hoursWorked: z.string().optional(),
      breakMinutes: z.number().min(0).optional(),
      entryType: z.enum(["regular", "overtime", "holiday", "sick", "remote"]).optional(),
      description: z.string().optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrTimeEntries)
        .where(eq(hrTimeEntries.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found" });

      if (input.status && input.status !== current.status) {
        validateTransition(current.status, input.status, TIME_ENTRY_STATUS_FLOW, "time entry");
      }

      const { id, ...fields } = input;
      const updates: Record<string, unknown> = { ...fields, updatedBy: ctx.user.id, updatedAt: new Date() };
      if (input.status === "approved") {
        updates.approvedBy = ctx.user.id;
        updates.approvedAt = new Date();
      }

      await db.update(hrTimeEntries).set(updates).where(eq(hrTimeEntries.id, id));

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: current.workerId,
        action: input.status ? "hr.time.entry.status_change" : "hr.time.entry.update",
        metadata: { entryId: id, from: current.status, to: input.status },
      });

      if (input.status && input.status !== current.status) {
        await logStatusChange({ actorId: ctx.user.id, targetWorkerId: current.workerId, domain: "time.entry", entityId: id, fromStatus: current.status, toStatus: input.status });
      }

      return { success: true };
    }),

  // ============================================================================
  // Leave Types
  // ============================================================================

  listLeaveTypes: protectedProcedure.query(async ({ ctx }) => {
    await checkHrAccess(ctx.user, HR_ACTIONS.LEAVE_READ);
    const db = getDb();
    if (!db) return [];
    return db.select().from(hrLeaveTypes).orderBy(hrLeaveTypes.name);
  }),

  createLeaveType: governedProcedure
    .input(z.object({
      code: z.string().max(30),
      name: z.string().max(100),
      description: z.string().optional(),
      defaultDaysPerYear: z.number().optional(),
      requiresApproval: z.boolean().default(true),
      isPaid: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrLeaveTypes).values(input).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.leave.type.create",
        metadata: { code: input.code, name: input.name },
      });

      return created;
    }),

  // ============================================================================
  // Leave Requests
  // ============================================================================

  listLeaveRequests: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      workerId: z.number().optional(),
      status: z.string().optional(),
      leaveTypeId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.LEAVE_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.workerId) conditions.push(eq(hrLeaveRequests.workerId, input.workerId));
      if (input.status) conditions.push(eq(hrLeaveRequests.status, input.status));
      if (input.leaveTypeId) conditions.push(eq(hrLeaveRequests.leaveTypeId, input.leaveTypeId));

      return db.select().from(hrLeaveRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrLeaveRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getLeaveRequest: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.LEAVE_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrLeaveRequests)
        .where(eq(hrLeaveRequests.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found" });
      return row;
    }),

  createLeaveRequest: governedProcedure
    .input(z.object({
      workerId: z.number(),
      leaveTypeId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
      totalDays: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrLeaveRequests).values({
        ...input,
        status: "pending",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.leave.request.create",
        metadata: { requestId: created.id, startDate: input.startDate, endDate: input.endDate },
      });

      return created;
    }),

  updateLeaveRequestStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      rejectionReason: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrLeaveRequests)
        .where(eq(hrLeaveRequests.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found" });

      validateTransition(current.status, input.status, LEAVE_REQUEST_STATUS_FLOW, "leave request");

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      };
      if (input.status === "approved") {
        updates.approvedBy = ctx.user.id;
        updates.approvedAt = new Date();
      }
      if (input.rejectionReason) updates.rejectionReason = input.rejectionReason;
      if (input.notes) updates.notes = input.notes;

      await db.update(hrLeaveRequests).set(updates)
        .where(eq(hrLeaveRequests.id, input.id));

      // Update leave balance on approval
      if (input.status === "approved") {
        const year = new Date().getFullYear();
        const [balance] = await db.select().from(hrLeaveBalances)
          .where(and(
            eq(hrLeaveBalances.workerId, current.workerId),
            eq(hrLeaveBalances.leaveTypeId, current.leaveTypeId),
            eq(hrLeaveBalances.year, year),
          )).limit(1);

        if (balance) {
          const newPending = Math.max(0, parseFloat(balance.pending) - parseFloat(current.totalDays));
          const newUsed = parseFloat(balance.used) + parseFloat(current.totalDays);
          await db.update(hrLeaveBalances).set({
            pending: String(newPending),
            used: String(newUsed),
            updatedAt: new Date(),
          }).where(eq(hrLeaveBalances.id, balance.id));
        }
      }

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: current.workerId,
        action: `hr.leave.request.${input.status}`,
        metadata: { requestId: input.id, from: current.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, targetWorkerId: current.workerId, domain: "time.leave", entityId: input.id, fromStatus: current.status, toStatus: input.status });

      return { success: true };
    }),

  // ============================================================================
  // Leave Balances
  // ============================================================================

  getLeaveBalances: protectedProcedure
    .input(z.object({
      workerId: z.number(),
      year: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.LEAVE_READ);
      const db = getDb();
      if (!db) return [];

      const year = input.year ?? new Date().getFullYear();
      return db.select().from(hrLeaveBalances)
        .where(and(
          eq(hrLeaveBalances.workerId, input.workerId),
          eq(hrLeaveBalances.year, year),
        ));
    }),

  // ============================================================================
  // Overtime Requests
  // ============================================================================

  listOvertimeRequests: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      workerId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.OVERTIME_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.workerId) conditions.push(eq(hrOvertimeRequests.workerId, input.workerId));
      if (input.status) conditions.push(eq(hrOvertimeRequests.status, input.status));

      return db.select().from(hrOvertimeRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrOvertimeRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getOvertimeRequest: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.OVERTIME_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrOvertimeRequests)
        .where(eq(hrOvertimeRequests.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Overtime request not found" });
      return row;
    }),

  createOvertimeRequest: governedProcedure
    .input(z.object({
      workerId: z.number(),
      requestDate: z.string(),
      startTime: z.string().max(10),
      endTime: z.string().max(10),
      hours: z.string(),
      reason: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrOvertimeRequests).values({
        ...input,
        status: "pending",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.overtime.request.create",
        metadata: { requestId: created.id, date: input.requestDate, hours: input.hours },
      });

      return created;
    }),

  updateOvertimeRequestStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      rejectionReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrOvertimeRequests)
        .where(eq(hrOvertimeRequests.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Overtime request not found" });

      validateTransition(current.status, input.status, OVERTIME_STATUS_FLOW, "overtime request");

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      };
      if (input.status === "approved") {
        updates.approvedBy = ctx.user.id;
        updates.approvedAt = new Date();
      }
      if (input.rejectionReason) updates.rejectionReason = input.rejectionReason;

      await db.update(hrOvertimeRequests).set(updates)
        .where(eq(hrOvertimeRequests.id, input.id));

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: current.workerId,
        action: `hr.overtime.request.${input.status}`,
        metadata: { requestId: input.id, from: current.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, targetWorkerId: current.workerId, domain: "time.overtime", entityId: input.id, fromStatus: current.status, toStatus: input.status });

      return { success: true };
    }),

  // ============================================================================
  // Shift Plans
  // ============================================================================

  listShiftPlans: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      orgUnitId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.SHIFT_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.status) conditions.push(eq(hrShiftPlans.status, input.status));
      if (input.orgUnitId) conditions.push(eq(hrShiftPlans.orgUnitId, input.orgUnitId));

      return db.select().from(hrShiftPlans)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrShiftPlans.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getShiftPlan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.SHIFT_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrShiftPlans)
        .where(eq(hrShiftPlans.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Shift plan not found" });
      return row;
    }),

  createShiftPlan: governedProcedure
    .input(z.object({
      name: z.string().max(200),
      description: z.string().optional(),
      orgUnitId: z.number().optional(),
      startDate: z.string(),
      endDate: z.string().optional(),
      shiftStartTime: z.string().max(10),
      shiftEndTime: z.string().max(10),
      breakMinutes: z.number().min(0).default(0),
      maxCapacity: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrShiftPlans).values({
        ...input,
        status: "draft",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.shift.plan.create",
        metadata: { planId: created.id, name: input.name },
      });

      return created;
    }),

  updateShiftPlanStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrShiftPlans)
        .where(eq(hrShiftPlans.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Shift plan not found" });

      validateTransition(current.status, input.status, SHIFT_PLAN_STATUS_FLOW, "shift plan");

      await db.update(hrShiftPlans).set({
        status: input.status,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      }).where(eq(hrShiftPlans.id, input.id));

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.shift.plan.status_change",
        metadata: { planId: input.id, from: current.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, domain: "time.shift_plan", entityId: input.id, fromStatus: current.status, toStatus: input.status });

      return { success: true };
    }),

  // ============================================================================
  // Shift Assignments
  // ============================================================================

  listShiftAssignments: protectedProcedure
    .input(z.object({
      shiftPlanId: z.number(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.SHIFT_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [eq(hrShiftAssignments.shiftPlanId, input.shiftPlanId)];
      if (input.status) conditions.push(eq(hrShiftAssignments.status, input.status));

      return db.select().from(hrShiftAssignments)
        .where(and(...conditions))
        .orderBy(hrShiftAssignments.assignedDate);
    }),

  assignWorkerToShift: governedProcedure
    .input(z.object({
      shiftPlanId: z.number(),
      workerId: z.number(),
      assignedDate: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify shift plan is active
      const [plan] = await db.select().from(hrShiftPlans)
        .where(eq(hrShiftPlans.id, input.shiftPlanId)).limit(1);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Shift plan not found" });
      if (plan.status !== "active" && plan.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Shift plan is not active or draft" });
      }

      const [created] = await db.insert(hrShiftAssignments).values({
        ...input,
        status: "assigned",
        createdBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.shift.assign",
        metadata: { assignmentId: created.id, planId: input.shiftPlanId },
      });

      return created;
    }),

  updateShiftAssignmentStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrShiftAssignments)
        .where(eq(hrShiftAssignments.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Shift assignment not found" });

      validateTransition(current.status, input.status, SHIFT_ASSIGNMENT_STATUS_FLOW, "shift assignment");

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };
      if (input.notes) updates.notes = input.notes;

      await db.update(hrShiftAssignments).set(updates)
        .where(eq(hrShiftAssignments.id, input.id));

      await logStatusChange({ actorId: 0, targetWorkerId: current.workerId, domain: "time.shift_assignment", entityId: input.id, fromStatus: current.status, toStatus: input.status });

      return { success: true };
    }),

  // ============================================================================
  // Time & Attendance Summary
  // ============================================================================

  summary: protectedProcedure.query(async ({ ctx }) => {
    await checkHrAccess(ctx.user, HR_ACTIONS.TIME_READ);
    const db = getDb();
    if (!db) return { pendingLeave: 0, pendingOvertime: 0, activeShifts: 0, draftTimeEntries: 0 };

    const [leaveCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrLeaveRequests)
      .where(eq(hrLeaveRequests.status, "pending"));

    const [overtimeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrOvertimeRequests)
      .where(eq(hrOvertimeRequests.status, "pending"));

    const [shiftCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrShiftPlans)
      .where(eq(hrShiftPlans.status, "active"));

    const [timeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrTimeEntries)
      .where(eq(hrTimeEntries.status, "draft"));

    return {
      pendingLeave: leaveCount?.count ?? 0,
      pendingOvertime: overtimeCount?.count ?? 0,
      activeShifts: shiftCount?.count ?? 0,
      draftTimeEntries: timeCount?.count ?? 0,
    };
  }),
});
