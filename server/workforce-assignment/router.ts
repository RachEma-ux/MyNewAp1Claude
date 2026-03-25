/**
 * Workforce Assignment Bridge — tRPC Router
 *
 * Governed API endpoints for the cross-domain staffing bridge.
 * All mutations use governedProcedure. All actions are audited.
 *
 * Ownership model:
 * - PM Central creates demand (resource_request)
 * - HR validates + proposes candidates
 * - Approval gate authorizes assignment
 * - Bridge creates governed resource_assignment
 */

import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getDb } from "../db/connection";
import { resourceRequests, resourceAssignments } from "../../drizzle/schema";
import { validateRequestTransition, validateAssignmentTransition } from "./lifecycle";
import {
  requireGovernedAssignmentFlow,
  preventRequesterSelfApproval,
  checkAllocationOverflow,
} from "./enforcement";
import { resolveAssignmentAuthority } from "./authority";
import { validateEmployeeEligibility } from "./validation";
import { logBridgeAudit } from "./audit";

// ============================================================================
// Request Endpoints — PM Central (demand side)
// ============================================================================

const requestRouter = router({
  /** Create a draft resource request */
  create: governedProcedure
    .input(z.object({
      projectId: z.number(),
      wbsId: z.number().optional(),
      requestedRole: z.string().min(1),
      requiredSkill: z.string().optional(),
      requiredLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
      allocationPercent: z.number().min(1).max(100).default(100),
      startDate: z.string(),
      endDate: z.string().optional(),
      locationMode: z.enum(["onsite", "remote", "hybrid", "any"]).default("any"),
      budgetLimit: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(resourceRequests).values({
        ...input,
        status: "draft",
        requesterId: ctx.user.id,
      }).returning();

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.request.created",
        requestId: created.id,
        projectId: input.projectId,
      });

      return created;
    }),

  /** Update a draft request (only editable in draft status) */
  update: governedProcedure
    .input(z.object({
      id: z.number(),
      requestedRole: z.string().optional(),
      requiredSkill: z.string().optional(),
      requiredLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
      allocationPercent: z.number().min(1).max(100).optional(),
      startDate: z.string().optional(),
      endDate: z.string().nullable().optional(),
      locationMode: z.enum(["onsite", "remote", "hybrid", "any"]).optional(),
      budgetLimit: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(resourceRequests)
        .where(eq(resourceRequests.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Request can only be updated in "draft" status. Current: "${existing.status}"`,
        });
      }

      const { id, ...updates } = input;
      await db.update(resourceRequests)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(resourceRequests.id, id));

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.request.updated",
        requestId: id,
        projectId: existing.projectId,
        metadata: { changedFields: Object.keys(updates) },
      });

      return { success: true };
    }),

  /** Submit a draft request — transitions draft → requested */
  submit: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(resourceRequests)
        .where(eq(resourceRequests.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      validateRequestTransition(existing.status, "requested");

      await db.update(resourceRequests)
        .set({ status: "requested", updatedAt: new Date() })
        .where(eq(resourceRequests.id, input.id));

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.request.submitted",
        requestId: input.id,
        projectId: existing.projectId,
        fromStatus: existing.status,
        toStatus: "requested",
      });

      return { success: true };
    }),

  /** Cancel a request (allowed from most non-terminal states) */
  cancel: governedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(resourceRequests)
        .where(eq(resourceRequests.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      validateRequestTransition(existing.status, "cancelled");

      await db.update(resourceRequests)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(resourceRequests.id, input.id));

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.request.cancelled",
        requestId: input.id,
        projectId: existing.projectId,
        fromStatus: existing.status,
        toStatus: "cancelled",
        reason: input.reason,
      });

      return { success: true };
    }),

  /** List requests (filtered) */
  list: protectedProcedure
    .input(z.object({
      projectId: z.number().optional(),
      status: z.string().optional(),
      requesterId: z.number().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.projectId) conditions.push(eq(resourceRequests.projectId, input.projectId));
      if (input.status) conditions.push(eq(resourceRequests.status, input.status));
      if (input.requesterId) conditions.push(eq(resourceRequests.requesterId, input.requesterId));

      return db
        .select()
        .from(resourceRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(resourceRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  /** Get a single request by ID */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [request] = await db.select().from(resourceRequests)
        .where(eq(resourceRequests.id, input.id)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      return request;
    }),
});

// ============================================================================
// HR Validation Endpoints — HR side
// ============================================================================

const hrValidationRouter = router({
  /** Start HR review — transitions requested → under_hr_review */
  startReview: governedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [request] = await db.select().from(resourceRequests)
        .where(eq(resourceRequests.id, input.requestId)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      validateRequestTransition(request.status, "under_hr_review");

      await db.update(resourceRequests)
        .set({ status: "under_hr_review", updatedAt: new Date() })
        .where(eq(resourceRequests.id, input.requestId));

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.request.hr_review_started",
        requestId: input.requestId,
        projectId: request.projectId,
        fromStatus: request.status,
        toStatus: "under_hr_review",
      });

      return { success: true };
    }),

  /** Validate a candidate employee against request requirements */
  validateCandidate: protectedProcedure
    .input(z.object({
      requestId: z.number(),
      employeeId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [request] = await db.select().from(resourceRequests)
        .where(eq(resourceRequests.id, input.requestId)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      const eligibility = await validateEmployeeEligibility({
        employeeId: input.employeeId,
        requiredSkill: request.requiredSkill,
        requiredLevel: request.requiredLevel,
      });

      const allocation = await checkAllocationOverflow(
        input.employeeId,
        request.allocationPercent,
      );

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.candidate.validated",
        requestId: input.requestId,
        employeeId: input.employeeId,
        projectId: request.projectId,
        metadata: { eligibility, allocation },
      });

      return {
        eligible: eligibility.valid && !allocation.wouldOverflow,
        eligibility,
        allocation,
      };
    }),

  /** Propose a candidate — transitions under_hr_review → candidate_proposed */
  proposeCandidate: governedProcedure
    .input(z.object({
      requestId: z.number(),
      employeeId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [request] = await db.select().from(resourceRequests)
        .where(eq(resourceRequests.id, input.requestId)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      validateRequestTransition(request.status, "candidate_proposed");

      // Validate employee eligibility before proposal
      const eligibility = await validateEmployeeEligibility({
        employeeId: input.employeeId,
        requiredSkill: request.requiredSkill,
        requiredLevel: request.requiredLevel,
      });

      if (!eligibility.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Candidate not eligible: ${eligibility.reason}`,
        });
      }

      await db.update(resourceRequests)
        .set({
          status: "candidate_proposed",
          updatedAt: new Date(),
          metadata: {
            ...(request.metadata as Record<string, unknown> ?? {}),
            proposedCandidateId: input.employeeId,
            proposedBy: ctx.user.id,
            proposedAt: new Date().toISOString(),
          },
        })
        .where(eq(resourceRequests.id, input.requestId));

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.candidate.proposed",
        requestId: input.requestId,
        employeeId: input.employeeId,
        projectId: request.projectId,
        fromStatus: request.status,
        toStatus: "candidate_proposed",
      });

      return { success: true };
    }),
});

// ============================================================================
// Approval Endpoints
// ============================================================================

const approvalRouter = router({
  /** Move candidate_proposed → pending_approval (PM accepts candidate) */
  submitForApproval: governedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [request] = await db.select().from(resourceRequests)
        .where(eq(resourceRequests.id, input.requestId)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      validateRequestTransition(request.status, "pending_approval");

      await db.update(resourceRequests)
        .set({ status: "pending_approval", updatedAt: new Date() })
        .where(eq(resourceRequests.id, input.requestId));

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.request.submitted",
        requestId: input.requestId,
        projectId: request.projectId,
        fromStatus: request.status,
        toStatus: "pending_approval",
      });

      return { success: true };
    }),

  /** Approve request — transitions pending_approval → approved */
  approve: governedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [request] = await db.select().from(resourceRequests)
        .where(eq(resourceRequests.id, input.requestId)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      validateRequestTransition(request.status, "approved");

      // Separation of duties: requester cannot approve own request
      preventRequesterSelfApproval(request.requesterId, ctx.user.id);

      // Temporary authority check (OM not implemented)
      const authority = resolveAssignmentAuthority({
        actorId: ctx.user.id,
        actorRole: ctx.user.role || "user",
        employeeId: ((request.metadata as any)?.proposedCandidateId) ?? 0,
        projectId: request.projectId,
      });

      if (!authority.resolved) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: authority.warning || "Insufficient authority to approve this request.",
        });
      }

      await db.update(resourceRequests)
        .set({
          status: "approved",
          updatedAt: new Date(),
          metadata: {
            ...(request.metadata as Record<string, unknown> ?? {}),
            approvedBy: ctx.user.id,
            approvedAt: new Date().toISOString(),
            authorityChain: authority.chain,
          },
        })
        .where(eq(resourceRequests.id, input.requestId));

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.request.approved",
        requestId: input.requestId,
        projectId: request.projectId,
        fromStatus: request.status,
        toStatus: "approved",
        metadata: { authoritySource: authority.source },
      });

      return { success: true, authority };
    }),

  /** Reject request */
  reject: governedProcedure
    .input(z.object({ requestId: z.number(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [request] = await db.select().from(resourceRequests)
        .where(eq(resourceRequests.id, input.requestId)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      // Rejection allowed from under_hr_review or pending_approval
      validateRequestTransition(request.status, "rejected");

      await db.update(resourceRequests)
        .set({
          status: "rejected",
          updatedAt: new Date(),
          metadata: {
            ...(request.metadata as Record<string, unknown> ?? {}),
            rejectedBy: ctx.user.id,
            rejectedAt: new Date().toISOString(),
            rejectionReason: input.reason,
          },
        })
        .where(eq(resourceRequests.id, input.requestId));

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.request.rejected",
        requestId: input.requestId,
        projectId: request.projectId,
        fromStatus: request.status,
        toStatus: "rejected",
        reason: input.reason,
      });

      return { success: true };
    }),
});

// ============================================================================
// Assignment Endpoints
// ============================================================================

const assignmentRouter = router({
  /**
   * Create a governed assignment.
   * This is the critical path — all enforcement checks happen here.
   */
  create: governedProcedure
    .input(z.object({
      requestId: z.number(),
      employeeId: z.number(),
      projectId: z.number(),
      projectRole: z.string().min(1),
      wbsId: z.number().optional(),
      positionId: z.number().optional(),
      functionId: z.number().optional(),
      allocationPercent: z.number().min(1).max(100).default(100),
      startDate: z.string(),
      endDate: z.string().optional(),
      costRateSource: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // ── ENFORCEMENT: All checks must pass ──
      const { request } = await requireGovernedAssignmentFlow({
        requestId: input.requestId,
        employeeId: input.employeeId,
        projectId: input.projectId,
        actorId: ctx.user.id,
      });

      // HR validation: employee must be eligible
      const eligibility = await validateEmployeeEligibility({
        employeeId: input.employeeId,
        requiredSkill: request.requiredSkill,
        requiredLevel: request.requiredLevel,
      });

      if (!eligibility.valid) {
        await logBridgeAudit({
          actorId: ctx.user.id,
          action: "bridge.enforcement.blocked",
          requestId: input.requestId,
          employeeId: input.employeeId,
          projectId: input.projectId,
          reason: `HR validation failed: ${eligibility.reason}`,
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `HR validation failed: ${eligibility.reason}`,
        });
      }

      // Allocation overflow warning (non-blocking but logged)
      const allocation = await checkAllocationOverflow(input.employeeId, input.allocationPercent);

      // Authority resolution (temporary — OM dependent)
      const authority = resolveAssignmentAuthority({
        actorId: ctx.user.id,
        actorRole: ctx.user.role || "user",
        employeeId: input.employeeId,
        projectId: input.projectId,
      });

      // Create the assignment
      const [assignment] = await db.insert(resourceAssignments).values({
        requestId: input.requestId,
        employeeId: input.employeeId,
        projectId: input.projectId,
        projectRole: input.projectRole,
        wbsId: input.wbsId,
        positionId: input.positionId,
        functionId: input.functionId,
        allocationPercent: input.allocationPercent,
        startDate: input.startDate,
        endDate: input.endDate,
        status: "pending",
        approvedBy: ctx.user.id,
        approvalStatus: "approved",
        costRateSource: input.costRateSource,
        utilizationState: allocation.wouldOverflow ? "over_allocated" : "untracked",
        authorityChain: authority.chain,
      }).returning();

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.assignment.created",
        requestId: input.requestId,
        assignmentId: assignment.id,
        employeeId: input.employeeId,
        projectId: input.projectId,
        metadata: {
          authoritySource: authority.source,
          allocationOverflow: allocation.wouldOverflow,
          currentAllocationTotal: allocation.currentTotal,
        },
      });

      return assignment;
    }),

  /** Activate a pending assignment — pending → active */
  activate: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(resourceAssignments)
        .where(eq(resourceAssignments.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      validateAssignmentTransition(existing.status, "active");

      await db.update(resourceAssignments)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(resourceAssignments.id, input.id));

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.assignment.activated",
        assignmentId: input.id,
        employeeId: existing.employeeId,
        projectId: existing.projectId,
        fromStatus: existing.status,
        toStatus: "active",
      });

      return { success: true };
    }),

  /** Release an active assignment — active → released */
  release: governedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(resourceAssignments)
        .where(eq(resourceAssignments.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      validateAssignmentTransition(existing.status, "released");

      await db.update(resourceAssignments)
        .set({
          status: "released",
          endDate: new Date().toISOString().split("T")[0],
          updatedAt: new Date(),
        })
        .where(eq(resourceAssignments.id, input.id));

      await logBridgeAudit({
        actorId: ctx.user.id,
        action: "bridge.assignment.released",
        assignmentId: input.id,
        employeeId: existing.employeeId,
        projectId: existing.projectId,
        fromStatus: existing.status,
        toStatus: "released",
        reason: input.reason,
      });

      return { success: true };
    }),

  /** List assignments (filtered) */
  list: protectedProcedure
    .input(z.object({
      projectId: z.number().optional(),
      employeeId: z.number().optional(),
      requestId: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.projectId) conditions.push(eq(resourceAssignments.projectId, input.projectId));
      if (input.employeeId) conditions.push(eq(resourceAssignments.employeeId, input.employeeId));
      if (input.requestId) conditions.push(eq(resourceAssignments.requestId, input.requestId));
      if (input.status) conditions.push(eq(resourceAssignments.status, input.status));

      return db
        .select()
        .from(resourceAssignments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(resourceAssignments.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),
});

// ============================================================================
// Root Bridge Router
// ============================================================================

export const workforceAssignmentRouter = router({
  requests: requestRouter,
  hrValidation: hrValidationRouter,
  approval: approvalRouter,
  assignments: assignmentRouter,
});
