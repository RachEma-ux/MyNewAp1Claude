/**
 * HR Analytics & Reporting Router
 *
 * Report definitions, metric snapshots, and dashboard data.
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
} from "../../../drizzle/schema";
import { logHrAudit } from "../audit";

export const hrAnalyticsRouter = router({
  // ============================================================================
  // Dashboard Summary — Aggregate HR metrics
  // ============================================================================

  getDashboardSummary: protectedProcedure.query(async () => {
    const db = getDb();
    if (!db) return {
      totalWorkers: 0, activeWorkers: 0, openIncidents: 0,
      openGrievances: 0, complianceItems: 0, openRisks: 0,
    };

    const [workerCounts] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${hrWorkerProfiles.status} = 'active')`,
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

    return {
      totalWorkers: workerCounts?.total ?? 0,
      activeWorkers: workerCounts?.active ?? 0,
      openIncidents: incidentCount?.count ?? 0,
      openGrievances: grievanceCount?.count ?? 0,
      complianceItems: complianceCount?.count ?? 0,
      openRisks: riskCount?.count ?? 0,
    };
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
    .query(async ({ input }) => {
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
      config: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
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
      config: z.record(z.unknown()).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
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
    .query(async ({ input }) => {
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
      dimensions: z.record(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(hrMetricSnapshots).values(input).returning();
      await logHrAudit({
        actorId: ctx.user.id, action: "hr.analytics.metric.create",
        metadata: { metricId: created.id, name: input.metricName },
      });
      return created;
    }),
});
