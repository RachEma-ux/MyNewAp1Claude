/**
 * PMT Tools Router — CRUD for all PM tool entities + sidebar summary
 *
 * Risks, issues, decisions, action items, meetings, deliverables,
 * status updates, work logs, budget items, and sidebar summary endpoint.
 */

import { z } from "zod";
import { eq, and, desc, sql, lt, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { projects, tasks } from "./schema";
import {
  pmtRisks, pmtIssues, pmtDecisions, pmtActionItems,
  pmtMeetings, pmtDeliverables, pmtStatusUpdates,
  pmtWorkLogs, pmtBudgetItems,
} from "./tools-schema";
import { pmtGateRequests, pmtChangeRequests } from "./governance-schema";

// ── Risks ───────────────────────────────────────────────────────────────────

const risksRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtRisks)
        .where(eq(pmtRisks.projectId, input.projectId))
        .orderBy(desc(pmtRisks.updatedAt));
    }),
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      category: z.string().optional(),
      probability: z.string().optional(),
      impact: z.string().optional(),
      mitigationPlan: z.string().optional(),
      ownerId: z.number().optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const probMap: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
      const impMap: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
      const riskScore = (probMap[input.probability || "medium"] || 3) * (impMap[input.impact || "medium"] || 3);
      const [created] = await db.insert(pmtRisks).values({
        ...input,
        riskScore,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        createdBy: ctx.user.id,
      }).returning();
      return created;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), title: z.string().optional(), description: z.string().optional(), status: z.string().optional(), probability: z.string().optional(), impact: z.string().optional(), mitigationPlan: z.string().optional(), contingencyPlan: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmtRisks).set({ ...updates, updatedAt: new Date() }).where(eq(pmtRisks.id, id));
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmtRisks).where(eq(pmtRisks.id, input.id));
      return { success: true };
    }),
});

// ── Issues ──────────────────────────────────────────────────────────────────

const issuesRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtIssues)
        .where(eq(pmtIssues.projectId, input.projectId))
        .orderBy(desc(pmtIssues.updatedAt));
    }),
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      severity: z.string().optional(),
      assigneeId: z.number().optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmtIssues).values({
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        reportedBy: ctx.user.id,
      }).returning();
      return created;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), title: z.string().optional(), description: z.string().optional(), status: z.string().optional(), severity: z.string().optional(), resolution: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (input.status === "resolved" || input.status === "closed") setValues.resolvedAt = new Date();
      await db.update(pmtIssues).set(setValues).where(eq(pmtIssues.id, id));
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmtIssues).where(eq(pmtIssues.id, input.id));
      return { success: true };
    }),
});

// ── Decisions ───────────────────────────────────────────────────────────────

const decisionsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtDecisions)
        .where(eq(pmtDecisions.projectId, input.projectId))
        .orderBy(desc(pmtDecisions.createdAt));
    }),
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      context: z.string().optional(),
      decision: z.string().min(1),
      rationale: z.string().optional(),
      alternatives: z.array(z.string()).optional(),
      impact: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmtDecisions).values({
        ...input,
        createdBy: ctx.user.id,
      }).returning();
      return created;
    }),
  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(pmtDecisions).set({ status: "approved", decidedBy: ctx.user.id, decidedAt: new Date() }).where(eq(pmtDecisions.id, input.id));
      return { success: true };
    }),
});

// ── Action Items ────────────────────────────────────────────────────────────

const actionItemsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtActionItems)
        .where(eq(pmtActionItems.projectId, input.projectId))
        .orderBy(desc(pmtActionItems.updatedAt));
    }),
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      source: z.string().optional(),
      sourceId: z.number().optional(),
      assigneeId: z.number().optional(),
      priority: z.string().optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmtActionItems).values({
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        createdBy: ctx.user.id,
      }).returning();
      return created;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), title: z.string().optional(), status: z.string().optional(), assigneeId: z.number().optional(), dueDate: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, dueDate, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (dueDate) setValues.dueDate = new Date(dueDate);
      if (input.status === "done") setValues.completedAt = new Date();
      await db.update(pmtActionItems).set(setValues).where(eq(pmtActionItems.id, id));
      return { success: true };
    }),
});

// ── Meetings ────────────────────────────────────────────────────────────────

const meetingsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtMeetings)
        .where(eq(pmtMeetings.projectId, input.projectId))
        .orderBy(desc(pmtMeetings.scheduledAt));
    }),
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().min(1).max(500),
      meetingType: z.string().optional(),
      agenda: z.string().optional(),
      scheduledAt: z.string().optional(),
      duration: z.number().optional(),
      attendees: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmtMeetings).values({
        ...input,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        createdBy: ctx.user.id,
      }).returning();
      return created;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), title: z.string().optional(), agenda: z.string().optional(), minutes: z.string().optional(), status: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmtMeetings).set({ ...updates, updatedAt: new Date() }).where(eq(pmtMeetings.id, id));
      return { success: true };
    }),
});

// ── Deliverables ────────────────────────────────────────────────────────────

const deliverablesRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtDeliverables)
        .where(eq(pmtDeliverables.projectId, input.projectId))
        .orderBy(desc(pmtDeliverables.updatedAt));
    }),
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1).max(500),
      description: z.string().optional(),
      deliverableType: z.string().optional(),
      acceptanceCriteria: z.string().optional(),
      assigneeId: z.number().optional(),
      reviewerId: z.number().optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmtDeliverables).values({
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      }).returning();
      return created;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), status: z.string().optional(), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (input.status === "accepted") setValues.acceptedAt = new Date();
      if (input.status === "submitted") setValues.submittedAt = new Date();
      await db.update(pmtDeliverables).set(setValues).where(eq(pmtDeliverables.id, id));
      return { success: true };
    }),
});

// ── Status Updates ──────────────────────────────────────────────────────────

const statusUpdatesRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtStatusUpdates)
        .where(eq(pmtStatusUpdates.projectId, input.projectId))
        .orderBy(desc(pmtStatusUpdates.createdAt));
    }),
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      period: z.string().min(1),
      overallHealth: z.string().optional(),
      scheduleHealth: z.string().optional(),
      budgetHealth: z.string().optional(),
      scopeHealth: z.string().optional(),
      summary: z.string().optional(),
      accomplishments: z.string().optional(),
      planned: z.string().optional(),
      blockers: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmtStatusUpdates).values({
        ...input,
        createdBy: ctx.user.id,
      }).returning();
      return created;
    }),
});

// ── Budget ──────────────────────────────────────────────────────────────────

const budgetRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmtBudgetItems)
        .where(eq(pmtBudgetItems.projectId, input.projectId))
        .orderBy(desc(pmtBudgetItems.createdAt));
    }),
  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1).max(255),
      category: z.string().optional(),
      planned: z.number(),
      actual: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmtBudgetItems).values(input).returning();
      return created;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), actual: z.number().optional(), forecast: z.number().optional(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmtBudgetItems).set({ ...updates, updatedAt: new Date() }).where(eq(pmtBudgetItems.id, id));
      return { success: true };
    }),
});

// ── Next action logic (per lifecycle state) ──────────────────────────────────

const NEXT_ACTION_MAP: Record<string, { label: string; route: string } | null> = {
  draft_shell: { label: "Submit Intake", route: "gates" },
  intake_review: { label: "Evaluate G0", route: "gates" },
  planning: { label: "Submit Plan Gate", route: "gates" },
  plan_gate_pending: { label: "Evaluate G1", route: "gates" },
  authorized: { label: "Start Execution", route: "tasks" },
  executing: { label: "Track Progress", route: "follow-ups" },
  control_hold: { label: "Resolve Freeze", route: "freeze-holds" },
  change_pending: { label: "Evaluate G2", route: "gates" },
  closing: { label: "Submit Close Gate", route: "gates" },
  close_gate_pending: { label: "Evaluate G4", route: "gates" },
  closed: null,
  rejected: null,
  archived: null,
};

const NEXT_GATE_MAP: Record<string, string | null> = {
  draft_shell: "G0",
  intake_review: "G0",
  planning: "G1",
  plan_gate_pending: "G1",
  authorized: "G3",
  executing: "G3",
  control_hold: "G3",
  change_pending: "G2",
  closing: "G4",
  close_gate_pending: "G4",
  closed: null,
  rejected: null,
  archived: null,
};

// ── Sidebar Summary (aggregation endpoint) ──────────────────────────────────

const sidebarSummaryRouter = router({
  get: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return null;
      const pid = input.projectId;
      const now = new Date();

      // Parallel count queries
      const [
        projectRows,
        overdueTaskRows,
        pendingGateRows,
        highRiskRows,
        openIssueRows,
        pendingChangeRows,
        openActionRows,
        pendingDeliverableRows,
        allGateRows,
      ] = await Promise.all([
        db.select().from(projects).where(eq(projects.id, pid)).limit(1),
        db.select({ count: sql<number>`count(*)` }).from(tasks)
          .where(and(eq(tasks.projectId, pid), lt(tasks.dueDate, now), ne(tasks.status, "done"))),
        db.select({ count: sql<number>`count(*)` }).from(pmtGateRequests)
          .where(and(eq(pmtGateRequests.projectId, pid), eq(pmtGateRequests.status, "pending"))),
        db.select({ count: sql<number>`count(*)` }).from(pmtRisks)
          .where(and(eq(pmtRisks.projectId, pid), eq(pmtRisks.status, "open"), eq(pmtRisks.impact, "high"))),
        db.select({ count: sql<number>`count(*)` }).from(pmtIssues)
          .where(and(eq(pmtIssues.projectId, pid), eq(pmtIssues.status, "open"))),
        db.select({ count: sql<number>`count(*)` }).from(pmtChangeRequests)
          .where(and(eq(pmtChangeRequests.projectId, pid), eq(pmtChangeRequests.status, "submitted"))),
        db.select({ count: sql<number>`count(*)` }).from(pmtActionItems)
          .where(and(eq(pmtActionItems.projectId, pid), ne(pmtActionItems.status, "done"), ne(pmtActionItems.status, "cancelled"))),
        db.select({ count: sql<number>`count(*)` }).from(pmtDeliverables)
          .where(and(eq(pmtDeliverables.projectId, pid), eq(pmtDeliverables.status, "pending"))),
        db.select().from(pmtGateRequests)
          .where(eq(pmtGateRequests.projectId, pid))
          .orderBy(desc(pmtGateRequests.createdAt)),
      ]);

      const project = projectRows[0];
      if (!project) return null;

      const state = project.status || "draft_shell";
      const freezeActive = state === "control_hold";

      // Compute governance summary
      const nextGate = NEXT_GATE_MAP[state] || null;
      const gates = allGateRows.map((g: any) => ({
        gateId: g.gateId,
        status: g.status,
        evaluatedAt: g.evaluatedAt,
      }));
      const passed = gates.filter((g: any) => g.status === "passed").length;
      const failed = gates.filter((g: any) => g.status === "failed").length;
      const total = gates.length;
      const score = total > 0 ? Math.max(0, 100 - (failed * 20)) : 100;
      const trend = failed > 0 ? "down" : passed > 0 ? "up" : "flat";

      // Next action
      const nextAction = NEXT_ACTION_MAP[state] || null;

      return {
        projectId: pid,
        projectName: project.name,
        projectState: state,
        riskLevel: project.riskLevel,
        // Counts
        overdueTasksCount: Number(overdueTaskRows[0]?.count ?? 0),
        approvalsPendingCount: Number(pendingGateRows[0]?.count ?? 0),
        highRisksCount: Number(highRiskRows[0]?.count ?? 0),
        openIssuesCount: Number(openIssueRows[0]?.count ?? 0),
        changesPendingCount: Number(pendingChangeRows[0]?.count ?? 0),
        openActionItemsCount: Number(openActionRows[0]?.count ?? 0),
        pendingDeliverablesCount: Number(pendingDeliverableRows[0]?.count ?? 0),
        // Governance
        freezeActive,
        governance: {
          nextGate,
          gates,
          freeze: { active: freezeActive, reason: freezeActive ? "G3 compliance failure" : null },
          scorecard: { score, trend },
        },
        // Next action CTA
        nextAction,
      };
    }),
});

// ── Export ───────────────────────────────────────────────────────────────────

export const toolsRouter = router({
  risks: risksRouter,
  issues: issuesRouter,
  decisions: decisionsRouter,
  actionItems: actionItemsRouter,
  meetings: meetingsRouter,
  deliverables: deliverablesRouter,
  statusUpdates: statusUpdatesRouter,
  budget: budgetRouter,
  sidebarSummary: sidebarSummaryRouter,
});
