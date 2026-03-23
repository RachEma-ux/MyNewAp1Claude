/**
 * HR Compliance & Risk Router
 *
 * Incident reports, compliance obligations, compliance evidence,
 * and HR risk register. All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrIncidentReports,
  hrComplianceObligations,
  hrComplianceEvidence,
  hrRiskItems,
} from "../../../drizzle/schema";
import { logHrAudit, logSensitiveRead } from "../audit";
import {
  checkHrAccess,
  requireHrPermission,
  HR_ACTIONS,
} from "../permissions";

// ============================================================================
// State machines
// ============================================================================

const INCIDENT_STATUS_FLOW: Record<string, string[]> = {
  reported: ["under_investigation", "action_required", "closed"],
  under_investigation: ["action_required", "resolved", "closed"],
  action_required: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

const OBLIGATION_STATUS_FLOW: Record<string, string[]> = {
  active: ["compliant", "non_compliant", "under_review", "waived", "expired"],
  compliant: ["active", "under_review", "expired"],
  non_compliant: ["active", "under_review"],
  under_review: ["active", "compliant", "non_compliant", "waived"],
  waived: [],
  expired: [],
};

const RISK_STATUS_FLOW: Record<string, string[]> = {
  identified: ["assessing", "accepted", "closed"],
  assessing: ["mitigating", "accepted", "closed"],
  mitigating: ["mitigated", "accepted", "closed"],
  accepted: ["mitigating", "closed"],
  mitigated: ["closed"],
  closed: [],
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

export const hrComplianceRouter = router({
  // ============================================================================
  // Incident Reports
  // ============================================================================

  listIncidentReports: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      severity: z.string().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.INCIDENT_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(hrIncidentReports.status, input.status));
      if (input.severity) conditions.push(eq(hrIncidentReports.severity, input.severity));
      if (input.category) conditions.push(eq(hrIncidentReports.category, input.category));
      return db.select().from(hrIncidentReports)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrIncidentReports.incidentDate))
        .limit(input.limit).offset(input.offset);
    }),

  getIncidentReport: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.INCIDENT_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(hrIncidentReports).where(eq(hrIncidentReports.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Incident report not found" });
      await logSensitiveRead({ actorId: ctx.user.id, domain: "compliance.incident", entityId: input.id, fields: ["description", "rootCause", "correctiveAction"] });
      return row;
    }),

  createIncidentReport: governedProcedure
    .input(z.object({
      title: z.string().max(300),
      description: z.string(),
      category: z.enum(["safety", "injury", "near_miss", "environmental", "security", "data_breach", "policy_violation", "other"]),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      incidentDate: z.string(),
      location: z.string().max(300).optional(),
      reportedByWorkerId: z.number().optional(),
      affectedWorkerId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.INCIDENT_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrIncidentReports).values({
        ...input, status: "reported", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.compliance.incident.create",
        metadata: { incidentId: created.id, severity: input.severity },
      });
      return created;
    }),

  transitionIncidentReport: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      assignedToId: z.number().optional(),
      rootCause: z.string().optional(),
      correctiveAction: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.INCIDENT_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrIncidentReports).where(eq(hrIncidentReports.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Incident report not found" });
      validateTransition(existing.status, input.status, INCIDENT_STATUS_FLOW, "incident report");
      const updates: Record<string, unknown> = { status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() };
      if (input.assignedToId) updates.assignedToId = input.assignedToId;
      if (input.rootCause) updates.rootCause = input.rootCause;
      if (input.correctiveAction) updates.correctiveAction = input.correctiveAction;
      if (input.status === "resolved" || input.status === "closed") updates.resolvedAt = new Date();
      const [updated] = await db.update(hrIncidentReports).set(updates).where(eq(hrIncidentReports.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.compliance.incident.transition",
        metadata: { incidentId: input.id, from: existing.status, to: input.status },
      });
      return updated;
    }),

  // ============================================================================
  // Compliance Obligations
  // ============================================================================

  listComplianceObligations: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.COMPLIANCE_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(hrComplianceObligations.status, input.status));
      if (input.category) conditions.push(eq(hrComplianceObligations.category, input.category));
      return db.select().from(hrComplianceObligations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrComplianceObligations.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  createComplianceObligation: governedProcedure
    .input(z.object({
      title: z.string().max(300),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      regulation: z.string().max(200).optional(),
      dueDate: z.string().optional(),
      recurringMonths: z.number().optional(),
      ownerId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.COMPLIANCE_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrComplianceObligations).values({
        ...input, status: "active", createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.compliance.obligation.create", metadata: { obligationId: created.id } });
      return created;
    }),

  transitionComplianceObligation: governedProcedure
    .input(z.object({ id: z.number(), status: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.COMPLIANCE_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrComplianceObligations).where(eq(hrComplianceObligations.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Compliance obligation not found" });
      validateTransition(existing.status, input.status, OBLIGATION_STATUS_FLOW, "compliance obligation");
      const updates: Record<string, unknown> = {
        status: input.status, updatedBy: ctx.user.id, updatedAt: new Date(),
        lastReviewedAt: new Date(),
      };
      if (input.notes) updates.notes = input.notes;
      const [updated] = await db.update(hrComplianceObligations).set(updates).where(eq(hrComplianceObligations.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.compliance.obligation.transition",
        metadata: { obligationId: input.id, from: existing.status, to: input.status },
      });
      return updated;
    }),

  // ============================================================================
  // Compliance Evidence
  // ============================================================================

  listComplianceEvidence: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      obligationId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.COMPLIANCE_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.obligationId) conditions.push(eq(hrComplianceEvidence.obligationId, input.obligationId));
      return db.select().from(hrComplianceEvidence)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrComplianceEvidence.recordedAt))
        .limit(input.limit).offset(input.offset);
    }),

  createComplianceEvidence: governedProcedure
    .input(z.object({
      obligationId: z.number().optional(),
      title: z.string().max(300),
      description: z.string().optional(),
      evidenceType: z.enum(["document", "screenshot", "report", "attestation", "other"]).optional(),
      documentRef: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.COMPLIANCE_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrComplianceEvidence).values({
        ...input, recordedBy: ctx.user.id, recordedAt: new Date(),
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.compliance.evidence.create", metadata: { evidenceId: created.id } });
      return created;
    }),

  // ============================================================================
  // HR Risk Register
  // ============================================================================

  listRiskItems: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.RISK_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.status) conditions.push(eq(hrRiskItems.status, input.status));
      if (input.category) conditions.push(eq(hrRiskItems.category, input.category));
      return db.select().from(hrRiskItems)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrRiskItems.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  getRiskItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.RISK_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(hrRiskItems).where(eq(hrRiskItems.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Risk item not found" });
      return row;
    }),

  createRiskItem: governedProcedure
    .input(z.object({
      title: z.string().max(300),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      likelihood: z.enum(["low", "medium", "high", "very_high"]).default("medium"),
      impact: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      ownerId: z.number().optional(),
      mitigationPlan: z.string().optional(),
      mitigationDueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RISK_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const likelihoodScore = { low: 1, medium: 2, high: 3, very_high: 4 }[input.likelihood] ?? 2;
      const impactScore = { low: 1, medium: 2, high: 3, critical: 4 }[input.impact] ?? 2;
      const [created] = await db.insert(hrRiskItems).values({
        ...input, status: "identified", riskScore: likelihoodScore * impactScore,
        createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.compliance.risk.create", metadata: { riskId: created.id } });
      return created;
    }),

  transitionRiskItem: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      mitigationPlan: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.RISK_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(hrRiskItems).where(eq(hrRiskItems.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Risk item not found" });
      validateTransition(existing.status, input.status, RISK_STATUS_FLOW, "risk item");
      const updates: Record<string, unknown> = { status: input.status, updatedBy: ctx.user.id, updatedAt: new Date() };
      if (input.mitigationPlan) updates.mitigationPlan = input.mitigationPlan;
      const [updated] = await db.update(hrRiskItems).set(updates).where(eq(hrRiskItems.id, input.id)).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.compliance.risk.transition",
        metadata: { riskId: input.id, from: existing.status, to: input.status },
      });
      return updated;
    }),
});
