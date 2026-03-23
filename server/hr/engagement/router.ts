/**
 * HR Well Being & Engagement Router
 *
 * Survey campaigns, responses, engagement programs,
 * wellbeing resources, recognition programs, and recognition events.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrSurveyCampaigns,
  hrSurveyResponses,
  hrEngagementPrograms,
  hrWellbeingResources,
  hrRecognitionPrograms,
  hrRecognitionEvents,
} from "../../../drizzle/schema";
import { logHrAudit } from "../audit";

// ============================================================================
// State machines
// ============================================================================

const SURVEY_STATUS_FLOW: Record<string, string[]> = {
  draft: ["active", "cancelled"],
  active: ["closed", "cancelled"],
  closed: [],
  cancelled: [],
};

const ENGAGEMENT_PROGRAM_STATUS_FLOW: Record<string, string[]> = {
  planned: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const RECOGNITION_STATUS_FLOW: Record<string, string[]> = {
  nominated: ["approved", "declined"],
  approved: ["awarded"],
  awarded: [],
  declined: [],
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

export const hrEngagementRouter = router({
  // ============================================================================
  // Survey Campaigns
  // ============================================================================

  listSurveyCampaigns: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      surveyType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(hrSurveyCampaigns.status, input.status));
      if (input.surveyType) conditions.push(eq(hrSurveyCampaigns.surveyType, input.surveyType));
      return db.select().from(hrSurveyCampaigns)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrSurveyCampaigns.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  getSurveyCampaign: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(hrSurveyCampaigns).where(eq(hrSurveyCampaigns.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Survey campaign not found" });
      return row;
    }),

  createSurveyCampaign: governedProcedure
    .input(z.object({
      title: z.string().max(300),
      description: z.string().optional(),
      surveyType: z.enum(["pulse", "engagement", "exit", "onboarding", "custom"]).default("pulse"),
      questions: z.array(z.object({ id: z.string(), text: z.string(), type: z.string() })).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      isAnonymous: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrSurveyCampaigns).values({
        ...input, status: "draft", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.engagement.survey.create", metadata: { campaignId: created.id } });
      return created;
    }),

  transitionSurveyCampaign: governedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrSurveyCampaigns).where(eq(hrSurveyCampaigns.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Survey campaign not found" });
      validateTransition(existing.status, input.status, SURVEY_STATUS_FLOW, "survey campaign");
      const [updated] = await db.update(hrSurveyCampaigns)
        .set({ status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrSurveyCampaigns.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.engagement.survey.transition",
        metadata: { campaignId: input.id, from: existing.status, to: input.status },
      });
      return updated;
    }),

  // ============================================================================
  // Survey Responses
  // ============================================================================

  listSurveyResponses: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      campaignId: z.number().optional(),
      workerId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.campaignId) conditions.push(eq(hrSurveyResponses.campaignId, input.campaignId));
      if (input.workerId) conditions.push(eq(hrSurveyResponses.workerId, input.workerId));
      return db.select().from(hrSurveyResponses)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrSurveyResponses.submittedAt))
        .limit(input.limit).offset(input.offset);
    }),

  submitSurveyResponse: governedProcedure
    .input(z.object({
      campaignId: z.number(),
      workerId: z.number().optional(),
      answers: z.record(z.unknown()).optional(),
      overallRating: z.number().min(1).max(5).optional(),
      comments: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrSurveyResponses).values({
        ...input, submittedAt: new Date(),
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.engagement.survey.respond",
        metadata: { campaignId: input.campaignId, responseId: created.id },
      });
      return created;
    }),

  // ============================================================================
  // Engagement Programs
  // ============================================================================

  listEngagementPrograms: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(hrEngagementPrograms.status, input.status));
      if (input.category) conditions.push(eq(hrEngagementPrograms.category, input.category));
      return db.select().from(hrEngagementPrograms)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrEngagementPrograms.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  createEngagementProgram: governedProcedure
    .input(z.object({
      name: z.string().max(200),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrEngagementPrograms).values({
        ...input, status: "planned", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.engagement.program.create", metadata: { programId: created.id } });
      return created;
    }),

  transitionEngagementProgram: governedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrEngagementPrograms).where(eq(hrEngagementPrograms.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Engagement program not found" });
      validateTransition(existing.status, input.status, ENGAGEMENT_PROGRAM_STATUS_FLOW, "engagement program");
      const [updated] = await db.update(hrEngagementPrograms)
        .set({ status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrEngagementPrograms.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.engagement.program.transition",
        metadata: { programId: input.id, from: existing.status, to: input.status },
      });
      return updated;
    }),

  // ============================================================================
  // Wellbeing Resources
  // ============================================================================

  listWellbeingResources: protectedProcedure
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
      if (input.category) conditions.push(eq(hrWellbeingResources.category, input.category));
      if (input.isActive !== undefined) conditions.push(eq(hrWellbeingResources.isActive, input.isActive));
      return db.select().from(hrWellbeingResources)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrWellbeingResources.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  createWellbeingResource: governedProcedure
    .input(z.object({
      title: z.string().max(300),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      resourceType: z.string().max(50).optional(),
      url: z.string().optional(),
      contactInfo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrWellbeingResources).values({
        ...input, isActive: true, createdBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.engagement.wellbeing.create", metadata: { resourceId: created.id } });
      return created;
    }),

  // ============================================================================
  // Recognition Programs
  // ============================================================================

  listRecognitionPrograms: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.isActive !== undefined) conditions.push(eq(hrRecognitionPrograms.isActive, input.isActive));
      return db.select().from(hrRecognitionPrograms)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrRecognitionPrograms.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  createRecognitionProgram: governedProcedure
    .input(z.object({
      name: z.string().max(200),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrRecognitionPrograms).values({
        ...input, isActive: true, createdBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.engagement.recognition_program.create", metadata: { programId: created.id } });
      return created;
    }),

  // ============================================================================
  // Recognition Events
  // ============================================================================

  listRecognitionEvents: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      programId: z.number().optional(),
      recipientWorkerId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.programId) conditions.push(eq(hrRecognitionEvents.programId, input.programId));
      if (input.recipientWorkerId) conditions.push(eq(hrRecognitionEvents.recipientWorkerId, input.recipientWorkerId));
      if (input.status) conditions.push(eq(hrRecognitionEvents.status, input.status));
      return db.select().from(hrRecognitionEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrRecognitionEvents.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  createRecognitionEvent: governedProcedure
    .input(z.object({
      programId: z.number().optional(),
      recipientWorkerId: z.number(),
      nominatedByWorkerId: z.number().optional(),
      title: z.string().max(300),
      description: z.string().optional(),
      awardDate: z.string().optional(),
      value: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrRecognitionEvents).values({
        ...input, status: "nominated", createdBy: ctx.user.id,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: input.recipientWorkerId,
        action: "hr.engagement.recognition.create", metadata: { eventId: created.id },
      });
      return created;
    }),

  transitionRecognitionEvent: governedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrRecognitionEvents).where(eq(hrRecognitionEvents.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Recognition event not found" });
      validateTransition(existing.status, input.status, RECOGNITION_STATUS_FLOW, "recognition event");
      const updates: Record<string, unknown> = { status: input.status, updatedAt: new Date() };
      if (input.status === "awarded") updates.awardDate = new Date().toISOString().slice(0, 10);
      const [updated] = await db.update(hrRecognitionEvents).set(updates).where(eq(hrRecognitionEvents.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: existing.recipientWorkerId,
        action: "hr.engagement.recognition.transition",
        metadata: { eventId: input.id, from: existing.status, to: input.status },
      });
      return updated;
    }),
});
