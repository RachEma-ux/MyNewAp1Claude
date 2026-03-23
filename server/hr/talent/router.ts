/**
 * HR Advanced Talent Router
 *
 * Talent reviews (9-box), succession plans, and succession candidates.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrTalentReviews,
  hrSuccessionPlans,
  hrSuccessionCandidates,
} from "../../../drizzle/schema";
import { logHrAudit, logSensitiveRead } from "../audit";
import {
  checkHrAccess,
  requireHrPermission,
  maskTalentFields,
  HR_ACTIONS,
} from "../permissions";

// ============================================================================
// State machines
// ============================================================================

const TALENT_REVIEW_STATUS_FLOW: Record<string, string[]> = {
  draft: ["submitted"],
  submitted: ["calibrated", "draft"],
  calibrated: ["finalized"],
  finalized: [],
};

const SUCCESSION_PLAN_STATUS_FLOW: Record<string, string[]> = {
  draft: ["active"],
  active: ["archived", "completed"],
  archived: ["active"],
  completed: [],
};

const SUCCESSION_CANDIDATE_STATUS_FLOW: Record<string, string[]> = {
  nominated: ["approved", "withdrawn"],
  approved: ["developing", "ready", "withdrawn"],
  developing: ["ready", "withdrawn"],
  ready: ["withdrawn"],
  withdrawn: [],
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

export const hrTalentRouter = router({
  // ============================================================================
  // Talent Reviews
  // ============================================================================

  listTalentReviews: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      workerId: z.number().optional(),
      status: z.string().optional(),
      nineBoxPosition: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.TALENT_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.workerId) conditions.push(eq(hrTalentReviews.workerId, input.workerId));
      if (input.status) conditions.push(eq(hrTalentReviews.status, input.status));
      if (input.nineBoxPosition) conditions.push(eq(hrTalentReviews.nineBoxPosition, input.nineBoxPosition));
      return db.select().from(hrTalentReviews)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrTalentReviews.reviewDate))
        .limit(input.limit).offset(input.offset);
    }),

  getTalentReview: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.TALENT_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(hrTalentReviews).where(eq(hrTalentReviews.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Talent review not found" });
      await logSensitiveRead({ actorId: ctx.user.id, domain: "talent", entityId: input.id, fields: ["performanceRating", "potentialRating", "nineBoxPosition", "retentionRisk"] });
      return row;
    }),

  createTalentReview: governedProcedure
    .input(z.object({
      workerId: z.number(),
      reviewerId: z.number().optional(),
      reviewDate: z.string(),
      performanceRating: z.enum(["exceptional", "strong", "meets_expectations", "needs_improvement", "unsatisfactory"]).optional(),
      potentialRating: z.enum(["high", "medium", "low"]).optional(),
      nineBoxPosition: z.enum(["star", "high_performer", "consistent", "growth", "key_player", "solid", "enigma", "dilemma", "underperformer"]).optional(),
      readinessForPromotion: z.enum(["ready_now", "ready_1yr", "ready_2yr", "not_ready"]).optional(),
      retentionRisk: z.enum(["low", "medium", "high", "critical"]).optional(),
      strengths: z.string().optional(),
      developmentAreas: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.TALENT_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrTalentReviews).values({
        ...input, status: "draft", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: input.workerId,
        action: "hr.talent.review.create", metadata: { reviewId: created.id },
      });
      return created;
    }),

  updateTalentReview: governedProcedure
    .input(z.object({
      id: z.number(),
      performanceRating: z.string().optional(),
      potentialRating: z.string().optional(),
      nineBoxPosition: z.string().optional(),
      readinessForPromotion: z.string().optional(),
      retentionRisk: z.string().optional(),
      strengths: z.string().optional(),
      developmentAreas: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.TALENT_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...data } = input;
      const [updated] = await db.update(hrTalentReviews).set({ ...data, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrTalentReviews.id, id)).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Talent review not found" });
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: updated.workerId,
        action: "hr.talent.review.update", metadata: { reviewId: id },
      });
      return updated;
    }),

  transitionTalentReview: governedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.TALENT_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrTalentReviews).where(eq(hrTalentReviews.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Talent review not found" });
      validateTransition(existing.status, input.status, TALENT_REVIEW_STATUS_FLOW, "talent review");
      const [updated] = await db.update(hrTalentReviews)
        .set({ status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrTalentReviews.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: existing.workerId,
        action: "hr.talent.review.transition",
        metadata: { reviewId: input.id, from: existing.status, to: input.status },
      });
      return updated;
    }),

  // ============================================================================
  // Succession Plans
  // ============================================================================

  listSuccessionPlans: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      criticality: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.SUCCESSION_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(hrSuccessionPlans.status, input.status));
      if (input.criticality) conditions.push(eq(hrSuccessionPlans.criticality, input.criticality));
      return db.select().from(hrSuccessionPlans)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrSuccessionPlans.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  getSuccessionPlan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.SUCCESSION_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(hrSuccessionPlans).where(eq(hrSuccessionPlans.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Succession plan not found" });
      return row;
    }),

  createSuccessionPlan: governedProcedure
    .input(z.object({
      positionId: z.number().optional(),
      positionTitle: z.string().max(300),
      criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      currentIncumbentId: z.number().optional(),
      notes: z.string().optional(),
      nextReviewDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.SUCCESSION_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrSuccessionPlans).values({
        ...input, status: "draft", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.talent.succession.create", metadata: { planId: created.id } });
      return created;
    }),

  transitionSuccessionPlan: governedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.SUCCESSION_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrSuccessionPlans).where(eq(hrSuccessionPlans.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Succession plan not found" });
      validateTransition(existing.status, input.status, SUCCESSION_PLAN_STATUS_FLOW, "succession plan");
      const [updated] = await db.update(hrSuccessionPlans)
        .set({ status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrSuccessionPlans.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.talent.succession.transition",
        metadata: { planId: input.id, from: existing.status, to: input.status },
      });
      return updated;
    }),

  // ============================================================================
  // Succession Candidates
  // ============================================================================

  listSuccessionCandidates: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      successionPlanId: z.number().optional(),
      candidateWorkerId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.SUCCESSION_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.successionPlanId) conditions.push(eq(hrSuccessionCandidates.successionPlanId, input.successionPlanId));
      if (input.candidateWorkerId) conditions.push(eq(hrSuccessionCandidates.candidateWorkerId, input.candidateWorkerId));
      if (input.status) conditions.push(eq(hrSuccessionCandidates.status, input.status));
      return db.select().from(hrSuccessionCandidates)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(hrSuccessionCandidates.priority)
        .limit(input.limit).offset(input.offset);
    }),

  createSuccessionCandidate: governedProcedure
    .input(z.object({
      successionPlanId: z.number(),
      candidateWorkerId: z.number(),
      readiness: z.enum(["ready_now", "ready_1yr", "ready_2yr", "long_term"]).default("ready_2yr"),
      developmentNeeds: z.string().optional(),
      priority: z.number().default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.SUCCESSION_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrSuccessionCandidates).values({
        ...input, status: "nominated", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: input.candidateWorkerId,
        action: "hr.talent.succession_candidate.create",
        metadata: { candidateId: created.id, planId: input.successionPlanId },
      });
      return created;
    }),

  transitionSuccessionCandidate: governedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.SUCCESSION_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrSuccessionCandidates).where(eq(hrSuccessionCandidates.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Succession candidate not found" });
      validateTransition(existing.status, input.status, SUCCESSION_CANDIDATE_STATUS_FLOW, "succession candidate");
      const [updated] = await db.update(hrSuccessionCandidates)
        .set({ status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrSuccessionCandidates.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: existing.candidateWorkerId,
        action: "hr.talent.succession_candidate.transition",
        metadata: { candidateId: input.id, from: existing.status, to: input.status },
      });
      return updated;
    }),
});
