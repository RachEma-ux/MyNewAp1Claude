/**
 * HR Employee Relations Router (Phase 6 Hardened)
 *
 * Policies, policy acknowledgements, grievances, disciplinary actions,
 * and workplace investigations. Sensitive data with confidentiality controls.
 *
 * All reads enforce HR permission checks and role-aware masking.
 * Privileged users (hrbp/admin) see unmasked data.
 * All writes are governed + audited with permission enforcement.
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrPolicies,
  hrPolicyAcknowledgements,
  hrGrievances,
  hrDisciplinaryActions,
  hrInvestigations,
} from "../../../drizzle/schema";
import { logHrAudit, logSensitiveRead, logStatusChange } from "../audit";
import { checkHrAccess, requireHrPermission, maskRelationsFields, HR_ACTIONS } from "../permissions";

// ============================================================================
// State machines
// ============================================================================

const POLICY_STATUS_FLOW: Record<string, string[]> = {
  draft: ["published"],
  published: ["archived", "superseded"],
  archived: [],
  superseded: [],
};

const GRIEVANCE_STATUS_FLOW: Record<string, string[]> = {
  filed: ["under_review", "dismissed", "withdrawn"],
  under_review: ["investigating", "resolved", "escalated", "dismissed"],
  investigating: ["resolved", "escalated", "dismissed"],
  resolved: ["closed"],
  dismissed: ["closed"],
  escalated: ["investigating", "resolved"],
  withdrawn: [],
  closed: [],
};

const DISCIPLINARY_STATUS_FLOW: Record<string, string[]> = {
  active: ["appealed", "expired", "completed"],
  appealed: ["active", "overturned"],
  expired: [],
  overturned: [],
  completed: [],
};

const INVESTIGATION_STATUS_FLOW: Record<string, string[]> = {
  opened: ["in_progress", "cancelled"],
  in_progress: ["pending_review", "cancelled"],
  pending_review: ["closed_substantiated", "closed_unsubstantiated", "closed_inconclusive", "in_progress"],
  closed_substantiated: [],
  closed_unsubstantiated: [],
  closed_inconclusive: [],
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

export const hrRelationsRouter = router({
  // ============================================================================
  // Policies
  // ============================================================================

  listPolicies: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.POLICY_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(hrPolicies.status, input.status));
      if (input.category) conditions.push(eq(hrPolicies.category, input.category));
      return db.select().from(hrPolicies)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrPolicies.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  getPolicy: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.POLICY_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(hrPolicies).where(eq(hrPolicies.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found" });
      return row;
    }),

  createPolicy: governedProcedure
    .input(z.object({
      code: z.string().max(50).optional(),
      title: z.string().max(300),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      content: z.string().optional(),
      effectiveFrom: z.string().optional(),
      requiresAcknowledgement: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.POLICY_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrPolicies).values({
        ...input, status: "draft", version: 1, createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.relations.policy.create", metadata: { policyId: created.id } });
      return created;
    }),

  transitionPolicy: governedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.POLICY_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrPolicies).where(eq(hrPolicies.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found" });
      validateTransition(existing.status, input.status, POLICY_STATUS_FLOW, "policy");
      const updates: Record<string, unknown> = { status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() };
      if (input.status === "published") updates.publishedAt = new Date();
      const [updated] = await db.update(hrPolicies).set(updates).where(eq(hrPolicies.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.relations.policy.transition",
        metadata: { policyId: input.id, from: existing.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, domain: "relations.policy", entityId: input.id, fromStatus: existing.status, toStatus: input.status });
      return updated;
    }),

  // ============================================================================
  // Policy Acknowledgements
  // ============================================================================

  listPolicyAcknowledgements: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      policyId: z.number().optional(),
      workerId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.POLICY_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.policyId) conditions.push(eq(hrPolicyAcknowledgements.policyId, input.policyId));
      if (input.workerId) conditions.push(eq(hrPolicyAcknowledgements.workerId, input.workerId));
      if (input.status) conditions.push(eq(hrPolicyAcknowledgements.status, input.status));
      return db.select().from(hrPolicyAcknowledgements)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrPolicyAcknowledgements.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  acknowledgePolicy: governedProcedure
    .input(z.object({ policyId: z.number(), workerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.POLICY_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrPolicyAcknowledgements).values({
        policyId: input.policyId, workerId: input.workerId,
        status: "acknowledged", acknowledgedAt: new Date(),
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: input.workerId,
        action: "hr.relations.policy.acknowledge", metadata: { policyId: input.policyId },
      });
      return created;
    }),

  // ============================================================================
  // Grievances
  // ============================================================================

  listGrievances: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      severity: z.string().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { masked } = await checkHrAccess(ctx.user, HR_ACTIONS.RELATIONS_READ, HR_ACTIONS.RELATIONS_READ_SENSITIVE);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(hrGrievances.status, input.status));
      if (input.severity) conditions.push(eq(hrGrievances.severity, input.severity));
      if (input.category) conditions.push(eq(hrGrievances.category, input.category));
      const results = await db.select().from(hrGrievances)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrGrievances.createdAt))
        .limit(input.limit).offset(input.offset);
      await logSensitiveRead({ actorId: ctx.user.id, domain: "relations.grievance", recordCount: results.length });
      return masked ? results.map((r) => maskRelationsFields(r as Record<string, unknown>)) : results;
    }),

  getGrievance: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const { masked } = await checkHrAccess(ctx.user, HR_ACTIONS.RELATIONS_READ, HR_ACTIONS.RELATIONS_READ_SENSITIVE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(hrGrievances).where(eq(hrGrievances.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Grievance not found" });
      await logSensitiveRead({ actorId: ctx.user.id, domain: "relations.grievance", recordCount: 1 });
      return masked ? maskRelationsFields(row as Record<string, unknown>) : row;
    }),

  createGrievance: governedProcedure
    .input(z.object({
      filedByWorkerId: z.number(),
      againstWorkerId: z.number().optional(),
      category: z.enum(["harassment", "discrimination", "bullying", "unfair_treatment", "safety", "policy_violation", "other"]),
      subject: z.string().max(300),
      description: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      isConfidential: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RELATIONS_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrGrievances).values({
        ...input, status: "filed", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: input.filedByWorkerId,
        action: "hr.relations.grievance.create", metadata: { grievanceId: created.id },
      });
      return created;
    }),

  transitionGrievance: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      assignedToId: z.number().optional(),
      resolutionNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RELATIONS_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrGrievances).where(eq(hrGrievances.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Grievance not found" });
      validateTransition(existing.status, input.status, GRIEVANCE_STATUS_FLOW, "grievance");
      const updates: Record<string, unknown> = {
        status: input.status, updatedBy: ctx.user.id, updatedAt: new Date(),
      };
      if (input.assignedToId) updates.assignedToId = input.assignedToId;
      if (input.resolutionNotes) updates.resolutionNotes = input.resolutionNotes;
      if (input.status === "resolved" || input.status === "closed") updates.resolvedAt = new Date();
      const [updated] = await db.update(hrGrievances).set(updates).where(eq(hrGrievances.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.relations.grievance.transition",
        metadata: { grievanceId: input.id, from: existing.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, domain: "relations.grievance", entityId: input.id, fromStatus: existing.status, toStatus: input.status });
      return updated;
    }),

  // ============================================================================
  // Disciplinary Actions
  // ============================================================================

  listDisciplinaryActions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      workerId: z.number().optional(),
      status: z.string().optional(),
      type: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { masked } = await checkHrAccess(ctx.user, HR_ACTIONS.RELATIONS_READ, HR_ACTIONS.RELATIONS_READ_SENSITIVE);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.workerId) conditions.push(eq(hrDisciplinaryActions.workerId, input.workerId));
      if (input.status) conditions.push(eq(hrDisciplinaryActions.status, input.status));
      if (input.type) conditions.push(eq(hrDisciplinaryActions.type, input.type));
      const results = await db.select().from(hrDisciplinaryActions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrDisciplinaryActions.createdAt))
        .limit(input.limit).offset(input.offset);
      await logSensitiveRead({ actorId: ctx.user.id, domain: "relations.disciplinary", recordCount: results.length });
      return masked ? results.map((r) => maskRelationsFields(r as Record<string, unknown>)) : results;
    }),

  createDisciplinaryAction: governedProcedure
    .input(z.object({
      workerId: z.number(),
      type: z.enum(["verbal_warning", "written_warning", "final_warning", "suspension", "termination", "pip"]),
      reason: z.string(),
      description: z.string().optional(),
      issuedByWorkerId: z.number().optional(),
      issuedAt: z.string().optional(),
      expiresAt: z.string().optional(),
      relatedGrievanceId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RELATIONS_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrDisciplinaryActions).values({
        ...input, status: "active", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: input.workerId,
        action: "hr.relations.disciplinary.create", metadata: { actionId: created.id, type: input.type },
      });
      return created;
    }),

  transitionDisciplinaryAction: governedProcedure
    .input(z.object({ id: z.number(), status: z.string(), appealNotes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RELATIONS_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrDisciplinaryActions).where(eq(hrDisciplinaryActions.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Disciplinary action not found" });
      validateTransition(existing.status, input.status, DISCIPLINARY_STATUS_FLOW, "disciplinary action");
      const updates: Record<string, unknown> = { status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() };
      if (input.appealNotes) updates.appealNotes = input.appealNotes;
      const [updated] = await db.update(hrDisciplinaryActions).set(updates).where(eq(hrDisciplinaryActions.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, targetWorkerId: existing.workerId,
        action: "hr.relations.disciplinary.transition",
        metadata: { actionId: input.id, from: existing.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, targetWorkerId: existing.workerId, domain: "relations.disciplinary", entityId: input.id, fromStatus: existing.status, toStatus: input.status });
      return updated;
    }),

  // ============================================================================
  // Investigations
  // ============================================================================

  listInvestigations: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { masked } = await checkHrAccess(ctx.user, HR_ACTIONS.RELATIONS_READ, HR_ACTIONS.RELATIONS_READ_SENSITIVE);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(hrInvestigations.status, input.status));
      if (input.category) conditions.push(eq(hrInvestigations.category, input.category));
      const results = await db.select().from(hrInvestigations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrInvestigations.createdAt))
        .limit(input.limit).offset(input.offset);
      await logSensitiveRead({ actorId: ctx.user.id, domain: "relations.investigation", recordCount: results.length });
      return masked ? results.map((r) => maskRelationsFields(r as Record<string, unknown>)) : results;
    }),

  createInvestigation: governedProcedure
    .input(z.object({
      title: z.string().max(300),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      relatedGrievanceId: z.number().optional(),
      investigatorId: z.number().optional(),
      subjectWorkerId: z.number().optional(),
      isConfidential: z.boolean().default(true),
      startedAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RELATIONS_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrInvestigations).values({
        ...input, status: "opened", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.relations.investigation.create",
        metadata: { investigationId: created.id },
      });
      return created;
    }),

  transitionInvestigation: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      findings: z.string().optional(),
      recommendation: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RELATIONS_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrInvestigations).where(eq(hrInvestigations.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found" });
      validateTransition(existing.status, input.status, INVESTIGATION_STATUS_FLOW, "investigation");
      const updates: Record<string, unknown> = { status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() };
      if (input.findings) updates.findings = input.findings;
      if (input.recommendation) updates.recommendation = input.recommendation;
      if (input.status.startsWith("closed_")) updates.completedAt = new Date().toISOString().slice(0, 10);
      const [updated] = await db.update(hrInvestigations).set(updates).where(eq(hrInvestigations.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.relations.investigation.transition",
        metadata: { investigationId: input.id, from: existing.status, to: input.status },
      });
      await logStatusChange({ actorId: ctx.user.id, domain: "relations.investigation", entityId: input.id, fromStatus: existing.status, toStatus: input.status });
      return updated;
    }),
});
