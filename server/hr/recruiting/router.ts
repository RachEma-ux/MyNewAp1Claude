/**
 * HR Recruiting Router — Recruitment requests, candidates, interviews, offers
 *
 * Full talent acquisition pipeline: request → candidates → interviews → offers.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, ilike, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrRecruitmentRequests,
  hrCandidates,
  hrInterviews,
  hrOffers,
} from "../../../drizzle/schema";
import { logHrAudit } from "../audit";
import {
  checkHrAccess,
  requireHrPermission,
  HR_ACTIONS,
} from "../permissions";
import { logLifecycleEvent } from "../lifecycle/event-logger";

// ============================================================================
// Valid state transitions
// ============================================================================

const REQUEST_STATUS_FLOW: Record<string, string[]> = {
  draft: ["open", "cancelled"],
  open: ["sourcing", "cancelled"],
  sourcing: ["interviewing", "cancelled"],
  interviewing: ["offer_pending", "sourcing", "cancelled"],
  offer_pending: ["filled", "interviewing", "cancelled"],
  filled: [],
  cancelled: [],
};

const CANDIDATE_STAGE_FLOW: Record<string, string[]> = {
  applied: ["screening", "rejected", "withdrawn"],
  screening: ["interview", "rejected", "withdrawn"],
  interview: ["assessment", "rejected", "withdrawn"],
  assessment: ["offer", "rejected", "withdrawn"],
  offer: ["hired", "rejected", "withdrawn"],
  hired: [],
  rejected: [],
  withdrawn: [],
};

const OFFER_STATUS_FLOW: Record<string, string[]> = {
  draft: ["pending_approval", "withdrawn"],
  pending_approval: ["extended", "withdrawn"],
  extended: ["accepted", "declined", "expired", "withdrawn"],
  accepted: [],
  declined: [],
  withdrawn: [],
  expired: [],
};

export const hrRecruitingRouter = router({
  // ============================================================================
  // Recruitment Requests
  // ============================================================================

  listRequests: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      priority: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.RECRUITING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.status) conditions.push(eq(hrRecruitmentRequests.status, input.status));
      if (input.priority) conditions.push(eq(hrRecruitmentRequests.priority, input.priority));

      return db
        .select()
        .from(hrRecruitmentRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrRecruitmentRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getRequest: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.RECRUITING_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrRecruitmentRequests)
        .where(eq(hrRecruitmentRequests.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Recruitment request not found" });
      return row;
    }),

  createRequest: governedProcedure
    .input(z.object({
      title: z.string().min(1).max(300),
      positionId: z.number().optional(),
      orgUnitId: z.number().optional(),
      hiringManagerId: z.number().optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      headcount: z.number().min(1).default(1),
      jobDescription: z.string().optional(),
      requiredSkills: z.array(z.string()).optional(),
      employmentType: z.enum(["full_time", "part_time", "contract", "intern"]).default("full_time"),
      targetStartDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RECRUITING_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrRecruitmentRequests).values({
        ...input,
        status: "draft",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logLifecycleEvent({
        entityType: "recruitment_request",
        entityId: created.id,
        event: "created",
        toStatus: "draft",
        actorId: ctx.user.id,
      });

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.recruiting.request.create",
        metadata: { requestId: created.id, title: input.title },
      });

      return created;
    }),

  updateRequestStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      closedReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RECRUITING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrRecruitmentRequests)
        .where(eq(hrRecruitmentRequests.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      const allowed = REQUEST_STATUS_FLOW[current.status] ?? [];
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
      if (input.status === "cancelled" || input.status === "filled") {
        updates.closedAt = new Date();
        if (input.closedReason) updates.closedReason = input.closedReason;
      }

      await db.update(hrRecruitmentRequests).set(updates)
        .where(eq(hrRecruitmentRequests.id, input.id));

      await logLifecycleEvent({
        entityType: "recruitment_request",
        entityId: input.id,
        event: "status_change",
        fromStatus: current.status,
        toStatus: input.status,
        actorId: ctx.user.id,
      });

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.recruiting.request.status_change",
        metadata: { requestId: input.id, from: current.status, to: input.status },
      });

      return { success: true };
    }),

  // ============================================================================
  // Candidates
  // ============================================================================

  listCandidates: protectedProcedure
    .input(z.object({
      recruitmentRequestId: z.number().optional(),
      pipelineStage: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.RECRUITING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.recruitmentRequestId) conditions.push(eq(hrCandidates.recruitmentRequestId, input.recruitmentRequestId));
      if (input.pipelineStage) conditions.push(eq(hrCandidates.pipelineStage, input.pipelineStage));

      return db.select().from(hrCandidates)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrCandidates.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getCandidate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.RECRUITING_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrCandidates)
        .where(eq(hrCandidates.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
      return row;
    }),

  createCandidate: governedProcedure
    .input(z.object({
      recruitmentRequestId: z.number(),
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      email: z.string().email().max(255),
      phone: z.string().max(50).optional(),
      source: z.string().max(100).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RECRUITING_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrCandidates).values({
        ...input,
        pipelineStage: "applied",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logLifecycleEvent({
        entityType: "candidate",
        entityId: created.id,
        event: "created",
        toStatus: "applied",
        actorId: ctx.user.id,
        metadata: { recruitmentRequestId: input.recruitmentRequestId },
      });

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.recruiting.candidate.create",
        metadata: { candidateId: created.id, requestId: input.recruitmentRequestId },
      });

      return created;
    }),

  updateCandidateStage: governedProcedure
    .input(z.object({
      id: z.number(),
      pipelineStage: z.string(),
      rejectionReason: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RECRUITING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrCandidates)
        .where(eq(hrCandidates.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });

      const allowed = CANDIDATE_STAGE_FLOW[current.pipelineStage] ?? [];
      if (!allowed.includes(input.pipelineStage)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from '${current.pipelineStage}' to '${input.pipelineStage}'`,
        });
      }

      const updates: Record<string, unknown> = {
        pipelineStage: input.pipelineStage,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      };
      if (input.rejectionReason) updates.rejectionReason = input.rejectionReason;
      if (input.notes) updates.notes = input.notes;

      await db.update(hrCandidates).set(updates)
        .where(eq(hrCandidates.id, input.id));

      await logLifecycleEvent({
        entityType: "candidate",
        entityId: input.id,
        event: "stage_change",
        fromStatus: current.pipelineStage,
        toStatus: input.pipelineStage,
        actorId: ctx.user.id,
      });

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.recruiting.candidate.stage_change",
        metadata: { candidateId: input.id, from: current.pipelineStage, to: input.pipelineStage },
      });

      return { success: true };
    }),

  // ============================================================================
  // Interviews
  // ============================================================================

  listInterviews: protectedProcedure
    .input(z.object({
      candidateId: z.number().optional(),
      recruitmentRequestId: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.RECRUITING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.candidateId) conditions.push(eq(hrInterviews.candidateId, input.candidateId));
      if (input.recruitmentRequestId) conditions.push(eq(hrInterviews.recruitmentRequestId, input.recruitmentRequestId));
      if (input.status) conditions.push(eq(hrInterviews.status, input.status));

      return db.select().from(hrInterviews)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrInterviews.scheduledAt))
        .limit(input.limit);
    }),

  createInterview: governedProcedure
    .input(z.object({
      candidateId: z.number(),
      recruitmentRequestId: z.number(),
      interviewerId: z.number().optional(),
      type: z.enum(["phone_screen", "technical", "behavioral", "panel", "final", "standard"]).default("standard"),
      scheduledAt: z.string().optional(),
      durationMinutes: z.number().min(15).max(480).default(60),
      location: z.string().max(300).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RECRUITING_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrInterviews).values({
        ...input,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        status: "scheduled",
        createdBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.recruiting.interview.create",
        metadata: { interviewId: created.id, candidateId: input.candidateId, type: input.type },
      });

      return created;
    }),

  updateInterview: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["scheduled", "completed", "cancelled", "no_show"]).optional(),
      outcome: z.enum(["pass", "fail", "strong_pass", "needs_review"]).optional(),
      feedback: z.string().optional(),
      rating: z.number().min(1).max(5).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RECRUITING_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { id, ...updates } = input;
      await db.update(hrInterviews).set({ ...updates, updatedAt: new Date() })
        .where(eq(hrInterviews.id, id));

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.recruiting.interview.update",
        metadata: { interviewId: id, changes: Object.keys(updates) },
      });

      return { success: true };
    }),

  // ============================================================================
  // Offers
  // ============================================================================

  listOffers: protectedProcedure
    .input(z.object({
      recruitmentRequestId: z.number().optional(),
      candidateId: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.RECRUITING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.recruitmentRequestId) conditions.push(eq(hrOffers.recruitmentRequestId, input.recruitmentRequestId));
      if (input.candidateId) conditions.push(eq(hrOffers.candidateId, input.candidateId));
      if (input.status) conditions.push(eq(hrOffers.status, input.status));

      return db.select().from(hrOffers)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrOffers.createdAt))
        .limit(input.limit);
    }),

  createOffer: governedProcedure
    .input(z.object({
      candidateId: z.number(),
      recruitmentRequestId: z.number(),
      positionId: z.number().optional(),
      offerDate: z.string().optional(),
      expiryDate: z.string().optional(),
      proposedStartDate: z.string().optional(),
      employmentType: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RECRUITING_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrOffers).values({
        ...input,
        status: "draft",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logLifecycleEvent({
        entityType: "offer",
        entityId: created.id,
        event: "created",
        toStatus: "draft",
        actorId: ctx.user.id,
        metadata: { candidateId: input.candidateId },
      });

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.recruiting.offer.create",
        metadata: { offerId: created.id, candidateId: input.candidateId },
      });

      return created;
    }),

  updateOfferStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      declineReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RECRUITING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrOffers)
        .where(eq(hrOffers.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Offer not found" });

      const allowed = OFFER_STATUS_FLOW[current.status] ?? [];
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
      if (input.status === "accepted") updates.acceptedAt = new Date();
      if (input.status === "declined") {
        updates.declinedAt = new Date();
        if (input.declineReason) updates.declineReason = input.declineReason;
      }

      await db.update(hrOffers).set(updates)
        .where(eq(hrOffers.id, input.id));

      await logLifecycleEvent({
        entityType: "offer",
        entityId: input.id,
        event: "status_change",
        fromStatus: current.status,
        toStatus: input.status,
        actorId: ctx.user.id,
      });

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.recruiting.offer.status_change",
        metadata: { offerId: input.id, from: current.status, to: input.status },
      });

      return { success: true };
    }),

  // ============================================================================
  // Summary / Dashboard
  // ============================================================================

  summary: protectedProcedure.query(async ({ ctx }) => {
    await checkHrAccess(ctx.user, HR_ACTIONS.RECRUITING_READ);
    const db = getDb();
    if (!db) return { openRequests: 0, activeCandidates: 0, pendingOffers: 0 };

    const [reqRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrRecruitmentRequests)
      .where(and(
        or(
          eq(hrRecruitmentRequests.status, "open"),
          eq(hrRecruitmentRequests.status, "sourcing"),
          eq(hrRecruitmentRequests.status, "interviewing"),
          eq(hrRecruitmentRequests.status, "offer_pending"),
        )
      ));

    const [candRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrCandidates)
      .where(and(
        or(
          eq(hrCandidates.pipelineStage, "applied"),
          eq(hrCandidates.pipelineStage, "screening"),
          eq(hrCandidates.pipelineStage, "interview"),
          eq(hrCandidates.pipelineStage, "assessment"),
          eq(hrCandidates.pipelineStage, "offer"),
        )
      ));

    const [offerRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrOffers)
      .where(eq(hrOffers.status, "extended"));

    return {
      openRequests: reqRows?.count ?? 0,
      activeCandidates: candRows?.count ?? 0,
      pendingOffers: offerRows?.count ?? 0,
    };
  }),
});
