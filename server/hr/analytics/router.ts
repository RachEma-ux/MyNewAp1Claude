/**
 * HR Analytics & Reporting Router (Phase 6 Hardened)
 *
 * Report definitions, metric snapshots, dashboard data, and reminders.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrReportDefinitions,
  hrMetricSnapshots,
  hrWorkerProfiles,
  hrIncidentReports,
  hrGrievances,
  hrComplianceObligations,
  hrRiskItems,
  hrLeaveRequests,
  hrLearningAssignments,
  hrPerformanceReviews,
  hrEmployeeCertifications,
  hrAuditLog,
} from "../../../drizzle/schema";
import { logHrAudit } from "../audit";
import { checkHrAccess, requireHrPermission, HR_ACTIONS } from "../permissions";
import { getAllReminders } from "../jobs/reminders";

export const hrAnalyticsRouter = router({
  // ============================================================================
  // Dashboard Summary — Aggregate HR metrics from real data
  // ============================================================================

  getDashboardSummary: protectedProcedure.query(async ({ ctx }) => {
    await checkHrAccess(ctx.user, HR_ACTIONS.ANALYTICS_READ);
    const db = getDb();
    if (!db) return {
      totalWorkers: 0, activeWorkers: 0, onLeave: 0, terminated: 0,
      openIncidents: 0, openGrievances: 0, complianceItems: 0, openRisks: 0,
      pendingLeave: 0, overdueTraining: 0, pendingReviews: 0, expiringCerts: 0,
    };

    const [workerCounts] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${hrWorkerProfiles.status} = 'active')`,
      onLeave: sql<number>`count(*) filter (where ${hrWorkerProfiles.status} = 'on_leave')`,
      terminated: sql<number>`count(*) filter (where ${hrWorkerProfiles.status} = 'terminated')`,
    }).from(hrWorkerProfiles);

    const [incidentCount] = await db.select({
      count: sql<number>`count(*)`,
    }).from(hrIncidentReports).where(
      sql`${hrIncidentReports.status} not in ('resolved', 'closed')`
    );

    const [grievanceCount] = await db.select({
      count: sql<number>`count(*)`,
    }).from(hrGrievances).where(
      sql`${hrGrievances.status} not in ('resolved', 'dismissed', 'withdrawn', 'closed')`
    );

    const [complianceCount] = await db.select({
      count: sql<number>`count(*)`,
    }).from(hrComplianceObligations).where(eq(hrComplianceObligations.status, "non_compliant"));

    const [riskCount] = await db.select({
      count: sql<number>`count(*)`,
    }).from(hrRiskItems).where(
      sql`${hrRiskItems.status} not in ('mitigated', 'closed')`
    );

    // Phase 5 — Additional operational metrics
    const [pendingLeave] = await db.select({
      count: sql<number>`count(*)`,
    }).from(hrLeaveRequests).where(eq(hrLeaveRequests.status, "pending"));

    const [overdueTraining] = await db.select({
      count: sql<number>`count(*)`,
    }).from(hrLearningAssignments).where(
      and(
        sql`${hrLearningAssignments.status} in ('assigned', 'in_progress')`,
        sql`${hrLearningAssignments.dueDate} IS NOT NULL`,
        sql`${hrLearningAssignments.dueDate} < CURRENT_DATE`,
      )
    );

    const [pendingReviews] = await db.select({
      count: sql<number>`count(*)`,
    }).from(hrPerformanceReviews).where(
      sql`${hrPerformanceReviews.status} in ('pending', 'self_review', 'manager_review')`
    );

    const [expiringCerts] = await db.select({
      count: sql<number>`count(*)`,
    }).from(hrEmployeeCertifications).where(
      and(
        eq(hrEmployeeCertifications.status, "active"),
        sql`${hrEmployeeCertifications.expiryDate} IS NOT NULL`,
        sql`${hrEmployeeCertifications.expiryDate} <= CURRENT_DATE + 30`,
      )
    );

    return {
      totalWorkers: workerCounts?.total ?? 0,
      activeWorkers: workerCounts?.active ?? 0,
      onLeave: workerCounts?.onLeave ?? 0,
      terminated: workerCounts?.terminated ?? 0,
      openIncidents: incidentCount?.count ?? 0,
      openGrievances: grievanceCount?.count ?? 0,
      complianceItems: complianceCount?.count ?? 0,
      openRisks: riskCount?.count ?? 0,
      pendingLeave: pendingLeave?.count ?? 0,
      overdueTraining: overdueTraining?.count ?? 0,
      pendingReviews: pendingReviews?.count ?? 0,
      expiringCerts: expiringCerts?.count ?? 0,
    };
  }),

  // ============================================================================
  // Workforce Breakdown — Worker type and category distribution
  // ============================================================================

  getWorkforceBreakdown: protectedProcedure.query(async ({ ctx }) => {
    await checkHrAccess(ctx.user, HR_ACTIONS.ANALYTICS_READ);
    const db = getDb();
    if (!db) return { byType: [], byCategory: [], byStatus: [] };

    const byType = await db.select({
      workerType: hrWorkerProfiles.workerType,
      count: sql<number>`count(*)::int`,
    }).from(hrWorkerProfiles)
      .groupBy(hrWorkerProfiles.workerType);

    const byCategory = await db.select({
      category: hrWorkerProfiles.employmentCategory,
      count: sql<number>`count(*)::int`,
    }).from(hrWorkerProfiles)
      .groupBy(hrWorkerProfiles.employmentCategory);

    const byStatus = await db.select({
      status: hrWorkerProfiles.status,
      count: sql<number>`count(*)::int`,
    }).from(hrWorkerProfiles)
      .groupBy(hrWorkerProfiles.status);

    return { byType, byCategory, byStatus };
  }),

  // ============================================================================
  // Reminders — Due-date alerts across all HR domains
  // ============================================================================

  getReminders: protectedProcedure.query(async ({ ctx }) => {
    await checkHrAccess(ctx.user, HR_ACTIONS.ANALYTICS_READ);
    return getAllReminders();
  }),

  // ============================================================================
  // Report Definitions
  // ============================================================================

  listReportDefinitions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      category: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ANALYTICS_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.category) conditions.push(eq(hrReportDefinitions.category, input.category));
      if (input.isActive !== undefined) conditions.push(eq(hrReportDefinitions.isActive, input.isActive));
      return db.select().from(hrReportDefinitions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrReportDefinitions.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  createReportDefinition: governedProcedure
    .input(z.object({
      name: z.string().max(200),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      reportType: z.enum(["standard", "custom", "scheduled"]).default("standard"),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ANALYTICS_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrReportDefinitions).values({
        ...input, isActive: true, createdBy: ctx.user.id, updatedBy: ctx.user.id,
      }).returning();
      await logHrAudit({ actorId: ctx.user.id, action: "hr.analytics.report.create", metadata: { reportId: created.id } });
      return created;
    }),

  updateReportDefinition: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().max(200).optional(),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ANALYTICS_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...data } = input;
      const [updated] = await db.update(hrReportDefinitions).set({ ...data, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrReportDefinitions.id, id)).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Report definition not found" });
      await logHrAudit({ actorId: ctx.user.id, action: "hr.analytics.report.update", metadata: { reportId: id } });
      return updated;
    }),

  // ============================================================================
  // Metric Snapshots
  // ============================================================================

  listMetricSnapshots: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      metricName: z.string().optional(),
      metricCategory: z.string().optional(),
      periodFrom: z.string().optional(),
      periodTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ANALYTICS_READ);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.metricName) conditions.push(eq(hrMetricSnapshots.metricName, input.metricName));
      if (input.metricCategory) conditions.push(eq(hrMetricSnapshots.metricCategory, input.metricCategory));
      if (input.periodFrom) conditions.push(gte(hrMetricSnapshots.periodStart, input.periodFrom));
      if (input.periodTo) conditions.push(lte(hrMetricSnapshots.periodEnd, input.periodTo));
      return db.select().from(hrMetricSnapshots)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrMetricSnapshots.periodStart))
        .limit(input.limit).offset(input.offset);
    }),

  createMetricSnapshot: governedProcedure
    .input(z.object({
      metricName: z.string().max(100),
      metricCategory: z.enum(["headcount", "attrition", "diversity", "engagement", "compliance", "time"]),
      value: z.string().max(100),
      unit: z.enum(["count", "percent", "currency", "days", "ratio"]).optional(),
      periodStart: z.string(),
      periodEnd: z.string(),
      dimensions: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ANALYTICS_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrMetricSnapshots).values(input).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.analytics.metric.create",
        metadata: { metricId: created.id, name: input.metricName },
      });
      return created;
    }),

  // ============================================================================
  // Role Assignment Management (Phase 4 — Access Controls)
  // ============================================================================

  listRoleAssignments: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      userId: z.number().optional(),
      hrRole: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ANALYTICS_MANAGE);
      const db = getDb();
      if (!db) return [];
      const { hrRoleAssignments } = await import("../../../drizzle/schema");
      const conditions = [];
      if (input.userId) conditions.push(eq(hrRoleAssignments.userId, input.userId));
      if (input.hrRole) conditions.push(eq(hrRoleAssignments.hrRole, input.hrRole));
      if (input.isActive !== undefined) conditions.push(eq(hrRoleAssignments.isActive, input.isActive));
      return db.select().from(hrRoleAssignments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrRoleAssignments.createdAt))
        .limit(input.limit).offset(input.offset);
    }),

  createRoleAssignment: governedProcedure
    .input(z.object({
      userId: z.number(),
      workerId: z.number().optional(),
      hrRole: z.enum(["employee", "manager", "hrbp", "admin", "workspace_admin"]),
      scope: z.enum(["global", "org_unit", "workspace"]).default("global"),
      scopeId: z.number().optional(),
      expiresAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ANALYTICS_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { hrRoleAssignments } = await import("../../../drizzle/schema");
      const [created] = await db.insert(hrRoleAssignments).values({
        ...input,
        isActive: true,
        assignedBy: ctx.user.id,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      }).returning();
      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.role_assignment.create",
        metadata: { assignmentId: created.id, userId: input.userId, hrRole: input.hrRole, scope: input.scope },
      });
      return created;
    }),

  updateRoleAssignment: governedProcedure
    .input(z.object({
      id: z.number(),
      isActive: z.boolean().optional(),
      hrRole: z.enum(["employee", "manager", "hrbp", "admin", "workspace_admin"]).optional(),
      scope: z.enum(["global", "org_unit", "workspace"]).optional(),
      scopeId: z.number().nullable().optional(),
      expiresAt: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ANALYTICS_MANAGE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { hrRoleAssignments } = await import("../../../drizzle/schema");
      const { id, ...updates } = input;
      const values: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (updates.expiresAt !== undefined) {
        values.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
      }
      const [updated] = await db.update(hrRoleAssignments)
        .set(values)
        .where(eq(hrRoleAssignments.id, id)).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Role assignment not found" });
      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.role_assignment.update",
        metadata: { assignmentId: id, changes: Object.keys(updates) },
      });
      return updated;
    }),

  // ============================================================================
  // Unified Audit Log Query
  // ============================================================================

  listAuditLog: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
      actorId: z.number().optional(),
      targetWorkerId: z.number().optional(),
      action: z.string().optional(),
      actionPrefix: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ANALYTICS_MANAGE);
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input.actorId) conditions.push(eq(hrAuditLog.actorId, input.actorId));
      if (input.targetWorkerId) conditions.push(eq(hrAuditLog.targetWorkerId, input.targetWorkerId));
      if (input.action) conditions.push(eq(hrAuditLog.action, input.action));
      if (input.actionPrefix) conditions.push(sql`${hrAuditLog.action} LIKE ${input.actionPrefix + '%'}`);
      if (input.dateFrom) conditions.push(gte(hrAuditLog.createdAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(hrAuditLog.createdAt, new Date(input.dateTo)));
      return db.select().from(hrAuditLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrAuditLog.createdAt))
        .limit(input.limit).offset(input.offset);
    }),
});
