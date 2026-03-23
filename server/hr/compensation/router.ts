/**
 * HR Compensation & Benefits Router
 *
 * Salary bands, compensation records, salary review cycles,
 * bonuses, benefit plans, and benefit enrollments.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrSalaryBands,
  hrCompensationRecords,
  hrSalaryReviewCycles,
  hrBonusRecords,
  hrBenefitPlans,
  hrBenefitEnrollments,
} from "../../../drizzle/schema";
import { logHrAudit, logSensitiveRead, logStatusChange } from "../audit";
import { maskCompensationFields } from "../permissions";

// ============================================================================
// State machines
// ============================================================================

const SALARY_REVIEW_STATUS_FLOW: Record<string, string[]> = {
  draft: ["open"],
  open: ["in_review", "cancelled"],
  in_review: ["approved", "cancelled"],
  approved: ["completed"],
  completed: [],
  cancelled: [],
};

const BONUS_STATUS_FLOW: Record<string, string[]> = {
  pending: ["approved", "cancelled"],
  approved: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

const ENROLLMENT_STATUS_FLOW: Record<string, string[]> = {
  pending: ["active", "cancelled"],
  active: ["cancelled", "expired"],
  cancelled: [],
  expired: [],
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

export const hrCompensationRouter = router({
  // ============================================================================
  // Salary Bands
  // ============================================================================

  listSalaryBands: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      jobLevel: z.string().optional(),
      jobFamily: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.jobLevel) conditions.push(eq(hrSalaryBands.jobLevel, input.jobLevel));
      if (input.jobFamily) conditions.push(eq(hrSalaryBands.jobFamily, input.jobFamily));
      if (input.isActive !== undefined) conditions.push(eq(hrSalaryBands.isActive, input.isActive));
      return db.select().from(hrSalaryBands)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrSalaryBands.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  getSalaryBand: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(hrSalaryBands).where(eq(hrSalaryBands.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Salary band not found" });
      return row;
    }),

  createSalaryBand: governedProcedure
    .input(z.object({
      code: z.string().max(50).optional(),
      name: z.string().max(200),
      description: z.string().optional(),
      currency: z.string().max(10).default("USD"),
      minAmount: z.string(),
      midAmount: z.string().optional(),
      maxAmount: z.string(),
      jobLevel: z.string().max(50).optional(),
      jobFamily: z.string().max(100).optional(),
      effectiveFrom: z.string().optional(),
      effectiveTo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrSalaryBands).values({
        ...input, isActive: true, createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.compensation.salary_band.create", metadata: { bandId: created.id } });
      return created;
    }),

  updateSalaryBand: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().max(200).optional(),
      description: z.string().optional(),
      minAmount: z.string().optional(),
      midAmount: z.string().optional(),
      maxAmount: z.string().optional(),
      jobLevel: z.string().max(50).optional(),
      jobFamily: z.string().max(100).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...data } = input;
      const [updated] = await db.update(hrSalaryBands).set({ ...data, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrSalaryBands.id, id)).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Salary band not found" });
      await logHrAudit({ actorId: ctx.user.id, action: "hr.compensation.salary_band.update", metadata: { bandId: id } });
      return updated;
    }),

  // ============================================================================
  // Compensation Records
  // ============================================================================

  listCompensationRecords: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      workerId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.workerId) conditions.push(eq(hrCompensationRecords.workerId, input.workerId));
      if (input.status) conditions.push(eq(hrCompensationRecords.status, input.status));
      const results = await db.select().from(hrCompensationRecords)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrCompensationRecords.effectiveFrom))
        .limit(input.limit).offset(input.offset);
      await logSensitiveRead({ actorId: ctx.user.id, domain: "compensation", recordCount: results.length });
      return results.map((r) => maskCompensationFields(r as Record<string, unknown>));
    }),

  createCompensationRecord: governedProcedure
    .input(z.object({
      workerId: z.number(),
      salaryBandId: z.number().optional(),
      baseSalary: z.string(),
      currency: z.string().max(10).default("USD"),
      payFrequency: z.enum(["monthly", "biweekly", "weekly", "annual"]).default("monthly"),
      effectiveFrom: z.string(),
      effectiveTo: z.string().optional(),
      changeReason: z.string().max(100).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrCompensationRecords).values({
        ...input, status: "active", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: input.workerId,
        action: "hr.compensation.record.create", metadata: { recordId: created.id },
      });
      return created;
    }),

  // ============================================================================
  // Salary Review Cycles
  // ============================================================================

  listSalaryReviewCycles: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(hrSalaryReviewCycles.status, input.status));
      return db.select().from(hrSalaryReviewCycles)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrSalaryReviewCycles.startDate))
        .limit(input.limit).offset(input.offset);
    }),

  createSalaryReviewCycle: governedProcedure
    .input(z.object({
      name: z.string().max(200),
      description: z.string().optional(),
      budgetPercent: z.string().optional(),
      effectiveDate: z.string().optional(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrSalaryReviewCycles).values({
        ...input, status: "draft", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.compensation.review_cycle.create", metadata: { cycleId: created.id } });
      return created;
    }),

  transitionSalaryReviewCycle: governedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrSalaryReviewCycles).where(eq(hrSalaryReviewCycles.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Salary review cycle not found" });
      validateTransition(existing.status, input.status, SALARY_REVIEW_STATUS_FLOW, "salary review cycle");
      const [updated] = await db.update(hrSalaryReviewCycles)
        .set({ status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrSalaryReviewCycles.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.compensation.review_cycle.transition",
        metadata: { cycleId: input.id, from: existing.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, domain: "compensation.review_cycle", entityId: input.id, fromStatus: existing.status, toStatus: input.status });
      return updated;
    }),

  // ============================================================================
  // Bonus Records
  // ============================================================================

  listBonusRecords: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      workerId: z.number().optional(),
      status: z.string().optional(),
      bonusType: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.workerId) conditions.push(eq(hrBonusRecords.workerId, input.workerId));
      if (input.status) conditions.push(eq(hrBonusRecords.status, input.status));
      if (input.bonusType) conditions.push(eq(hrBonusRecords.bonusType, input.bonusType));
      const results = await db.select().from(hrBonusRecords)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrBonusRecords.createdAt))
        .limit(input.limit).offset(input.offset);
      await logSensitiveRead({ actorId: ctx.user.id, domain: "compensation.bonus", recordCount: results.length });
      return results.map((r) => maskCompensationFields(r as Record<string, unknown>));
    }),

  createBonusRecord: governedProcedure
    .input(z.object({
      workerId: z.number(),
      bonusType: z.enum(["annual", "performance", "signing", "retention", "spot", "referral"]),
      amount: z.string(),
      currency: z.string().max(10).default("USD"),
      period: z.string().max(30).optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrBonusRecords).values({
        ...input, status: "pending", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: input.workerId,
        action: "hr.compensation.bonus.create", metadata: { bonusId: created.id },
      });
      return created;
    }),

  transitionBonusRecord: governedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrBonusRecords).where(eq(hrBonusRecords.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Bonus record not found" });
      validateTransition(existing.status, input.status, BONUS_STATUS_FLOW, "bonus record");
      const updates: Record<string, unknown> = { status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() };
      if (input.status === "approved") { updates.approvedBy = ctx.user.id; updates.approvedAt = new Date(); }
      if (input.status === "paid") { updates.paidAt = new Date(); }
      const [updated] = await db.update(hrBonusRecords).set(updates).where(eq(hrBonusRecords.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: existing.workerId,
        action: "hr.compensation.bonus.transition",
        metadata: { bonusId: input.id, from: existing.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, targetWorkerId: existing.workerId, domain: "compensation.bonus", entityId: input.id, fromStatus: existing.status, toStatus: input.status });
      return updated;
    }),

  // ============================================================================
  // Benefit Plans
  // ============================================================================

  listBenefitPlans: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      category: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.category) conditions.push(eq(hrBenefitPlans.category, input.category));
      if (input.isActive !== undefined) conditions.push(eq(hrBenefitPlans.isActive, input.isActive));
      return db.select().from(hrBenefitPlans)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrBenefitPlans.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  createBenefitPlan: governedProcedure
    .input(z.object({
      code: z.string().max(50).optional(),
      name: z.string().max(200),
      description: z.string().optional(),
      category: z.enum(["health", "dental", "vision", "life", "retirement", "wellness", "other"]),
      provider: z.string().max(200).optional(),
      employerContribution: z.string().optional(),
      employeeContribution: z.string().optional(),
      enrollmentWindowStart: z.string().optional(),
      enrollmentWindowEnd: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrBenefitPlans).values({
        ...input, isActive: true, createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.benefits.plan.create", metadata: { planId: created.id } });
      return created;
    }),

  // ============================================================================
  // Benefit Enrollments
  // ============================================================================

  listBenefitEnrollments: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      workerId: z.number().optional(),
      benefitPlanId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.workerId) conditions.push(eq(hrBenefitEnrollments.workerId, input.workerId));
      if (input.benefitPlanId) conditions.push(eq(hrBenefitEnrollments.benefitPlanId, input.benefitPlanId));
      if (input.status) conditions.push(eq(hrBenefitEnrollments.status, input.status));
      return db.select().from(hrBenefitEnrollments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrBenefitEnrollments.enrollmentDate))
        .limit(input.limit).offset(input.offset);
    }),

  createBenefitEnrollment: governedProcedure
    .input(z.object({
      workerId: z.number(),
      benefitPlanId: z.number(),
      enrollmentDate: z.string(),
      effectiveFrom: z.string().optional(),
      effectiveTo: z.string().optional(),
      coverageLevel: z.enum(["individual", "family", "spouse", "dependents"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrBenefitEnrollments).values({
        ...input, status: "pending", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: input.workerId,
        action: "hr.benefits.enrollment.create", metadata: { enrollmentId: created.id },
      });
      return created;
    }),

  transitionBenefitEnrollment: governedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrBenefitEnrollments).where(eq(hrBenefitEnrollments.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Benefit enrollment not found" });
      validateTransition(existing.status, input.status, ENROLLMENT_STATUS_FLOW, "benefit enrollment");
      const [updated] = await db.update(hrBenefitEnrollments)
        .set({ status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrBenefitEnrollments.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: existing.workerId,
        action: "hr.benefits.enrollment.transition",
        metadata: { enrollmentId: input.id, from: existing.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, targetWorkerId: existing.workerId, domain: "benefits.enrollment", entityId: input.id, fromStatus: existing.status, toStatus: input.status });
      return updated;
    }),
});
