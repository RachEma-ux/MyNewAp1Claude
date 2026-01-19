/**
 * Agent Promotions Router
 * 
 * Approval workflows for agent promotion to governed state
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { agents, promotionRequests, agentHistory } from "../../drizzle/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { getFeatureFlags } from "../../features/agents-create/utils/feature-flags";

export const agentsPromotionsRouter = router({
  /**
   * POST /promotions/requests - Create promotion request
   */
  createRequest: protectedProcedure
    .input(
      z.object({
        agentId: z.number(),
        approvers: z.array(z.string()), // User IDs
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const flags = getFeatureFlags();

      if (!flags.approvals.enabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Approvals are disabled. Use direct promotion.",
        });
      }

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.openId;

      // Load agent
      const agentResults = await db
        .select()
        .from(agents)
        .where(and(
          eq(agents.id, input.agentId),
          eq(agents.status, "sandbox")
        ))
        .limit(1);

      const agent = agentResults[0];

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sandbox agent not found",
        });
      }

      // Check for active incident freeze
      const activeIncidents = await checkActiveIncidents(db);
      if (activeIncidents.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Promotion frozen due to active incident",
          cause: activeIncidents,
        });
      }

      // Create promotion request
      const now = new Date();

      const [inserted] = await db.insert(promotionRequests).values({
        agentId: input.agentId,
        requestedBy: ctx.user.id,
        approvers: input.approvers,
        status: "pending",
        notes: input.notes,
        slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h SLA
      }).returning();

      return { id: inserted.id, status: "pending" };
    }),

  /**
   * GET /promotions/requests - List promotion requests
   */
  listRequests: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected", "executed"]).optional(),
        approverId: z.string().optional(),
        agentId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const conditions: any[] = [];

      if (input.status) {
        conditions.push(eq(promotionRequests.status, input.status as any));
      }

      if (input.agentId) {
        conditions.push(eq(promotionRequests.agentId, input.agentId));
      }

      // Filter by approver (check if user is in approvers list)
      let requests = await db
        .select()
        .from(promotionRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(promotionRequests.createdAt));

      if (input.approverId) {
        requests = requests.filter((req) => {
          const approversList = req.approvers as string[] | null;
          return approversList && approversList.includes(input.approverId);
        });
      }

      return requests;
    }),

  /**
   * GET /promotions/requests/:id - Get promotion request details
   */
  getRequest: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [request] = await db
        .select()
        .from(promotionRequests)
        .where(eq(promotionRequests.id, input.id))
        .limit(1);

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Promotion request not found",
        });
      }

      // Load agent details
      const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, request.agentId))
        .limit(1);

      return { ...request, agent };
    }),

  /**
   * POST /promotions/requests/:id/approve - Approve promotion request
   */
  approve: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.openId;

      // Load request
      const [request] = await db
        .select()
        .from(promotionRequests)
        .where(eq(promotionRequests.id, input.id))
        .limit(1);

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Promotion request not found",
        });
      }

      if (request.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Request is not pending",
        });
      }

      // Check if user is an approver
      const approversList = request.approvers as string[] | null;
      if (!approversList || !approversList.includes(userId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not an approver for this request",
        });
      }

      // Update request
      const now = new Date();

      await db
        .update(promotionRequests)
        .set({
          status: "approved",
          approvedBy: ctx.user.id,
          approvedAt: now,
          approvalComment: input.comment,
          updatedAt: now,
        })
        .where(eq(promotionRequests.id, input.id));

      // Record event
      await db.insert(agentHistory).values({
        agentId: request.agentId,
        eventType: "promotion_approved",
        actorId: ctx.user.id,
        description: input.comment || "Promotion approved",
        metadata: { requestId: input.id },
      });

      return { success: true };
    }),

  /**
   * POST /promotions/requests/:id/reject - Reject promotion request
   */
  reject: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        reason: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.openId;

      // Load request
      const [request] = await db
        .select()
        .from(promotionRequests)
        .where(eq(promotionRequests.id, input.id))
        .limit(1);

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Promotion request not found",
        });
      }

      if (request.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Request is not pending",
        });
      }

      // Check if user is an approver
      const approversList = request.approvers as string[] | null;
      if (!approversList || !approversList.includes(userId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not an approver for this request",
        });
      }

      // Update request
      const now = new Date();

      await db
        .update(promotionRequests)
        .set({
          status: "rejected",
          rejectedBy: ctx.user.id,
          rejectedAt: now,
          rejectionReason: input.reason,
          updatedAt: now,
        })
        .where(eq(promotionRequests.id, input.id));

      // Record event
      await db.insert(agentHistory).values({
        agentId: request.agentId,
        eventType: "promotion_rejected",
        actorId: ctx.user.id,
        description: input.reason,
        metadata: { requestId: input.id },
      });

      return { success: true };
    }),

  /**
   * POST /promotions/requests/:id/execute - Execute approved promotion
   */
  execute: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const userId = ctx.user.openId;

      // Load request
      const [request] = await db
        .select()
        .from(promotionRequests)
        .where(eq(promotionRequests.id, input.id))
        .limit(1);

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Promotion request not found",
        });
      }

      if (request.status !== "approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Request is not approved",
        });
      }

      // Check for active incident freeze
      const activeIncidents = await checkActiveIncidents(db);
      if (activeIncidents.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Promotion frozen due to active incident",
          cause: activeIncidents,
        });
      }

      // Load agent
      const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, request.agentId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }

      // Execute promotion (same logic as direct promote)
      // ... (reuse logic from agents-control-plane.ts promote endpoint)

      // Update request
      const now = new Date();

      await db
        .update(promotionRequests)
        .set({
          status: "executed",
          executedAt: now,
          updatedAt: now,
        })
        .where(eq(promotionRequests.id, input.id));

      return { success: true };
    }),

  /**
   * GET /promotions/requests/:id/events - Get timeline feed
   */
  getEvents: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Load request
      const [request] = await db
        .select()
        .from(promotionRequests)
        .where(eq(promotionRequests.id, input.id))
        .limit(1);

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Promotion request not found",
        });
      }

      // Load history events for this agent
      const events = await db
        .select()
        .from(agentHistory)
        .where(eq(agentHistory.agentId, request.agentId))
        .orderBy(desc(agentHistory.createdAt));

      return events;
    }),
});

// ============================================================================
// HELPERS
// ============================================================================

async function checkActiveIncidents(db: any): Promise<any[]> {
  // Mock implementation - check incidents table
  // In production, query incidents table for active incidents
  return [];
}
