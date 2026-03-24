/**
 * HR Learning & Development Router — Training, Assignments, History, Certifications
 *
 * Learning operations: training catalog management, mandatory rules,
 * learning assignments with completion tracking, learning history,
 * certification catalog and employee certification lifecycle.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, or, sql, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrTrainingCatalog,
  hrMandatoryTrainingRules,
  hrLearningAssignments,
  hrLearningHistory,
  hrCertifications,
  hrEmployeeCertifications,
} from "../../../drizzle/schema";
import { logHrAudit } from "../audit";
import {
  checkHrAccess,
  requireHrPermission,
  resolveDataScope,
  HR_ACTIONS,
} from "../permissions";

// ============================================================================
// State machines
// ============================================================================

const LEARNING_ASSIGNMENT_STATUS_FLOW: Record<string, string[]> = {
  assigned: ["in_progress", "waived"],
  in_progress: ["completed", "overdue"],
  overdue: ["in_progress", "completed", "waived"],
  completed: [],
  waived: [],
};

const CERTIFICATION_STATUS_FLOW: Record<string, string[]> = {
  active: ["expired", "pending_renewal", "revoked"],
  pending_renewal: ["active", "expired", "revoked"],
  expired: ["pending_renewal", "active"],
  revoked: [],
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

export const hrLearningRouter = router({
  // ============================================================================
  // Training Catalog
  // ============================================================================

  listTraining: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      category: z.string().optional(),
      isMandatory: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.LEARNING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.category) conditions.push(eq(hrTrainingCatalog.category, input.category));
      if (input.isMandatory !== undefined) conditions.push(eq(hrTrainingCatalog.isMandatory, input.isMandatory));
      if (input.isActive !== undefined) conditions.push(eq(hrTrainingCatalog.isActive, input.isActive));

      return db.select().from(hrTrainingCatalog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrTrainingCatalog.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getTraining: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.LEARNING_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrTrainingCatalog)
        .where(eq(hrTrainingCatalog.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Training not found" });
      return row;
    }),

  createTraining: governedProcedure
    .input(z.object({
      code: z.string().max(50).optional(),
      title: z.string().max(300),
      description: z.string().optional(),
      category: z.enum(["technical", "compliance", "leadership", "safety", "soft_skills", "onboarding"]).optional(),
      provider: z.string().max(200).optional(),
      durationHours: z.number().optional(),
      format: z.enum(["online", "classroom", "blended", "self_paced", "webinar"]).default("online"),
      isMandatory: z.boolean().default(false),
      prerequisites: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.LEARNING_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrTrainingCatalog).values({
        ...input,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.training.create",
        metadata: { trainingId: created.id, title: input.title },
      });

      return created;
    }),

  updateTraining: governedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().max(300).optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      provider: z.string().max(200).optional(),
      durationHours: z.number().optional(),
      format: z.string().optional(),
      isMandatory: z.boolean().optional(),
      isActive: z.boolean().optional(),
      prerequisites: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.LEARNING_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { id, ...fields } = input;
      await db.update(hrTrainingCatalog).set({
        ...fields,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      }).where(eq(hrTrainingCatalog.id, id));

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.training.update",
        metadata: { trainingId: id, changes: Object.keys(fields) },
      });

      return { success: true };
    }),

  // ============================================================================
  // Mandatory Training Rules
  // ============================================================================

  listMandatoryRules: protectedProcedure
    .input(z.object({
      trainingId: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.LEARNING_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.trainingId) conditions.push(eq(hrMandatoryTrainingRules.trainingId, input.trainingId));
      if (input.isActive !== undefined) conditions.push(eq(hrMandatoryTrainingRules.isActive, input.isActive));

      return db.select().from(hrMandatoryTrainingRules)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrMandatoryTrainingRules.createdAt));
    }),

  createMandatoryRule: governedProcedure
    .input(z.object({
      trainingId: z.number(),
      targetType: z.enum(["all", "org_unit", "worker_type", "position"]),
      targetValue: z.string().max(100).optional(),
      dueDays: z.number().default(30),
      recurringMonths: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.LEARNING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrMandatoryTrainingRules).values({
        ...input,
        createdBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.training.mandatory_rule.create",
        metadata: { ruleId: created.id, trainingId: input.trainingId },
      });

      return created;
    }),

  // ============================================================================
  // Learning Assignments
  // ============================================================================

  listAssignments: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      workerId: z.number().optional(),
      trainingId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Scope-aware: employee sees own assignments, manager/hrbp/admin sees all
      const scope = await resolveDataScope(
        ctx.user,
        HR_ACTIONS.LEARNING_READ,
        undefined,
        HR_ACTIONS.LEARNING_READ_SELF,
      );
      if (scope.scope === "none") return [];

      const db = getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input.workerId) conditions.push(eq(hrLearningAssignments.workerId, input.workerId));
      if (input.trainingId) conditions.push(eq(hrLearningAssignments.trainingId, input.trainingId));
      if (input.status) conditions.push(eq(hrLearningAssignments.status, input.status));

      // Apply scope narrowing
      if (scope.scope === "self") {
        conditions.push(eq(hrLearningAssignments.workerId, scope.workerId));
      }

      return db.select().from(hrLearningAssignments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrLearningAssignments.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getAssignment: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveDataScope(
        ctx.user,
        HR_ACTIONS.LEARNING_READ,
        undefined,
        HR_ACTIONS.LEARNING_READ_SELF,
      );
      if (scope.scope === "none") throw new TRPCError({ code: "FORBIDDEN", message: "HR permission denied: learning read" });

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrLearningAssignments)
        .where(eq(hrLearningAssignments.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Learning assignment not found" });

      // Verify scope access
      if (scope.scope === "self" && row.workerId !== scope.workerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this assignment" });
      }

      return row;
    }),

  assignTraining: governedProcedure
    .input(z.object({
      workerId: z.number(),
      trainingId: z.number(),
      dueDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.LEARNING_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrLearningAssignments).values({
        ...input,
        assignedBy: ctx.user.id,
        status: "assigned",
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.learning.assign",
        metadata: { assignmentId: created.id, trainingId: input.trainingId },
      });

      return created;
    }),

  updateAssignmentStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      score: z.number().min(0).max(100).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.LEARNING_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrLearningAssignments)
        .where(eq(hrLearningAssignments.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      validateTransition(current.status, input.status, LEARNING_ASSIGNMENT_STATUS_FLOW, "learning assignment");

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };
      if (input.status === "in_progress" && !current.startedAt) {
        updates.startedAt = new Date();
      }
      if (input.status === "completed") {
        updates.completedAt = new Date();
      }
      if (input.score !== undefined) updates.score = input.score;
      if (input.notes) updates.notes = input.notes;

      await db.update(hrLearningAssignments).set(updates)
        .where(eq(hrLearningAssignments.id, input.id));

      // Record in learning history on completion
      if (input.status === "completed") {
        const [training] = await db.select().from(hrTrainingCatalog)
          .where(eq(hrTrainingCatalog.id, current.trainingId)).limit(1);

        await db.insert(hrLearningHistory).values({
          workerId: current.workerId,
          trainingId: current.trainingId,
          trainingTitle: training?.title ?? `Training #${current.trainingId}`,
          completedAt: new Date(),
          score: input.score,
        });
      }

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: current.workerId,
        action: `hr.learning.assignment.${input.status}`,
        metadata: { assignmentId: input.id, from: current.status, to: input.status },
      });

      return { success: true };
    }),

  // ============================================================================
  // Learning History
  // ============================================================================

  listHistory: protectedProcedure
    .input(z.object({
      workerId: z.number().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      // Scope-aware: employee sees own history, manager/hrbp/admin sees all
      const scope = await resolveDataScope(
        ctx.user,
        HR_ACTIONS.LEARNING_READ,
        undefined,
        HR_ACTIONS.LEARNING_READ_SELF,
      );
      if (scope.scope === "none") return [];

      const db = getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input.workerId) conditions.push(eq(hrLearningHistory.workerId, input.workerId));

      // Apply scope narrowing
      if (scope.scope === "self") {
        conditions.push(eq(hrLearningHistory.workerId, scope.workerId));
      }

      return db.select().from(hrLearningHistory)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrLearningHistory.completedAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // ============================================================================
  // Certifications Catalog
  // ============================================================================

  listCertifications: protectedProcedure
    .input(z.object({
      isActive: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.CERTIFICATION_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.isActive !== undefined) conditions.push(eq(hrCertifications.isActive, input.isActive));

      return db.select().from(hrCertifications)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(hrCertifications.name);
    }),

  getCertification: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.CERTIFICATION_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db.select().from(hrCertifications)
        .where(eq(hrCertifications.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Certification not found" });
      return row;
    }),

  createCertification: governedProcedure
    .input(z.object({
      code: z.string().max(50).optional(),
      name: z.string().max(200),
      description: z.string().optional(),
      issuingBody: z.string().max(200).optional(),
      validityMonths: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.CERTIFICATION_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrCertifications).values(input).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.certification.create",
        metadata: { certId: created.id, name: input.name },
      });

      return created;
    }),

  // ============================================================================
  // Employee Certifications
  // ============================================================================

  listEmployeeCertifications: protectedProcedure
    .input(z.object({
      workerId: z.number().optional(),
      certificationId: z.number().optional(),
      status: z.string().optional(),
      expiringBefore: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Scope-aware: employee sees own certifications, manager/hrbp/admin sees all
      const scope = await resolveDataScope(
        ctx.user,
        HR_ACTIONS.CERTIFICATION_READ,
        undefined,
        HR_ACTIONS.LEARNING_READ_SELF,
      );
      if (scope.scope === "none") return [];

      const db = getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input.workerId) conditions.push(eq(hrEmployeeCertifications.workerId, input.workerId));
      if (input.certificationId) conditions.push(eq(hrEmployeeCertifications.certificationId, input.certificationId));
      if (input.status) conditions.push(eq(hrEmployeeCertifications.status, input.status));
      if (input.expiringBefore) conditions.push(lte(hrEmployeeCertifications.expiryDate, input.expiringBefore));

      // Apply scope narrowing
      if (scope.scope === "self") {
        conditions.push(eq(hrEmployeeCertifications.workerId, scope.workerId));
      }

      return db.select().from(hrEmployeeCertifications)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrEmployeeCertifications.createdAt));
    }),

  assignCertification: governedProcedure
    .input(z.object({
      workerId: z.number(),
      certificationId: z.number(),
      obtainedDate: z.string().optional(),
      expiryDate: z.string().optional(),
      certificateRef: z.string().max(500).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.CERTIFICATION_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrEmployeeCertifications).values({
        ...input,
        status: "active",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.certification.assign",
        metadata: { empCertId: created.id, certificationId: input.certificationId },
      });

      return created;
    }),

  updateEmployeeCertificationStatus: governedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string(),
      renewalDate: z.string().optional(),
      expiryDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.CERTIFICATION_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [current] = await db.select().from(hrEmployeeCertifications)
        .where(eq(hrEmployeeCertifications.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Employee certification not found" });

      validateTransition(current.status, input.status, CERTIFICATION_STATUS_FLOW, "employee certification");

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      };
      if (input.renewalDate) updates.renewalDate = input.renewalDate;
      if (input.expiryDate) updates.expiryDate = input.expiryDate;
      if (input.notes) updates.notes = input.notes;

      await db.update(hrEmployeeCertifications).set(updates)
        .where(eq(hrEmployeeCertifications.id, input.id));

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: current.workerId,
        action: `hr.certification.employee.${input.status}`,
        metadata: { empCertId: input.id, from: current.status, to: input.status },
      });

      return { success: true };
    }),

  // ============================================================================
  // Expiring Certifications Query
  // ============================================================================

  listExpiringCertifications: protectedProcedure
    .input(z.object({
      withinDays: z.number().min(1).max(365).default(90),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.CERTIFICATION_READ);
      const db = getDb();
      if (!db) return [];

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.withinDays);
      const cutoffStr = cutoff.toISOString().split("T")[0];

      return db.select().from(hrEmployeeCertifications)
        .where(and(
          eq(hrEmployeeCertifications.status, "active"),
          lte(hrEmployeeCertifications.expiryDate, cutoffStr),
        ))
        .orderBy(hrEmployeeCertifications.expiryDate);
    }),

  // ============================================================================
  // Learning Summary
  // ============================================================================

  summary: protectedProcedure.query(async ({ ctx }) => {
    await checkHrAccess(ctx.user, HR_ACTIONS.LEARNING_READ);
    const db = getDb();
    if (!db) return { totalTraining: 0, activeAssignments: 0, overdueAssignments: 0, expiringCerts: 0 };

    const [trainingCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrTrainingCatalog)
      .where(eq(hrTrainingCatalog.isActive, true));

    const [activeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrLearningAssignments)
      .where(or(
        eq(hrLearningAssignments.status, "assigned"),
        eq(hrLearningAssignments.status, "in_progress"),
      ));

    const [overdueCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrLearningAssignments)
      .where(eq(hrLearningAssignments.status, "overdue"));

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 90);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const [expiringCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hrEmployeeCertifications)
      .where(and(
        eq(hrEmployeeCertifications.status, "active"),
        lte(hrEmployeeCertifications.expiryDate, cutoffStr),
      ));

    return {
      totalTraining: trainingCount?.count ?? 0,
      activeAssignments: activeCount?.count ?? 0,
      overdueAssignments: overdueCount?.count ?? 0,
      expiringCerts: expiringCount?.count ?? 0,
    };
  }),
});
