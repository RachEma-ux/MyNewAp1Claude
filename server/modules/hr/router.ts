/**
 * HR Workspace Module Router — Workspace-consumable HR surface
 *
 * Provides workspace-scoped staff queries and assignment mutations.
 * All procedures require workspace access + HR module enabled.
 * Other modules should consume HR through this router, never direct table reads.
 */

import { z } from "zod";
import { eq, and, desc, or, ilike, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { requireWorkspaceAccess } from "../../workspace/workspace-guards";
import {
  hrWorkspaceAssignments,
  hrWorkerProfiles,
  hrPeople,
} from "../../../drizzle/schema";
import { logHrAudit } from "../../hr/audit";
import { requireHrPermission, HR_ACTIONS } from "../../hr/permissions";

export const hrModuleRouter = router({
  /** List staff assigned to a workspace */
  listStaff: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      roleCode: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "hr");
      const db = getDb();
      if (!db) return [];

      const conditions = [
        eq(hrWorkspaceAssignments.workspaceId, input.workspaceId),
        or(isNull(hrWorkspaceAssignments.endDate), sql`${hrWorkspaceAssignments.endDate} >= CURRENT_DATE`),
      ];
      if (input.roleCode) conditions.push(eq(hrWorkspaceAssignments.roleCode, input.roleCode));

      return db
        .select({
          assignmentId: hrWorkspaceAssignments.id,
          workerId: hrWorkspaceAssignments.workerId,
          roleCode: hrWorkspaceAssignments.roleCode,
          allocationPct: hrWorkspaceAssignments.allocationPct,
          assignmentType: hrWorkspaceAssignments.assignmentType,
          startDate: hrWorkspaceAssignments.startDate,
          endDate: hrWorkspaceAssignments.endDate,
          isPrimary: hrWorkspaceAssignments.isPrimary,
          displayName: hrPeople.displayName,
          employeeNumber: hrWorkerProfiles.employeeNumber,
          workerType: hrWorkerProfiles.workerType,
        })
        .from(hrWorkspaceAssignments)
        .innerJoin(hrWorkerProfiles, eq(hrWorkspaceAssignments.workerId, hrWorkerProfiles.id))
        .innerJoin(hrPeople, eq(hrWorkerProfiles.personId, hrPeople.id))
        .where(and(...conditions))
        .orderBy(desc(hrWorkspaceAssignments.createdAt))
        .limit(input.limit);
    }),

  /** Search eligible workers for assignment */
  searchWorkers: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      query: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "hr");
      const db = getDb();
      if (!db) return [];

      const conditions = [eq(hrWorkerProfiles.status, "active")];
      if (input.query) {
        const q = `%${input.query}%`;
        conditions.push(
          or(
            ilike(hrPeople.displayName, q),
            ilike(hrPeople.primaryEmail, q),
            ilike(hrWorkerProfiles.employeeNumber, q),
          )!
        );
      }

      return db
        .select({
          workerId: hrWorkerProfiles.id,
          displayName: hrPeople.displayName,
          employeeNumber: hrWorkerProfiles.employeeNumber,
          workerType: hrWorkerProfiles.workerType,
          primaryEmail: hrPeople.primaryEmail,
        })
        .from(hrWorkerProfiles)
        .innerJoin(hrPeople, eq(hrWorkerProfiles.personId, hrPeople.id))
        .where(and(...conditions))
        .limit(input.limit);
    }),

  /** Assign a worker to this workspace */
  assignWorker: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      workerId: z.number(),
      roleCode: z.enum(["member", "lead", "reviewer", "observer"]).default("member"),
      allocationPct: z.number().min(0).max(100).default(100),
      startDate: z.string(),
      endDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "hr");
      await requireHrPermission(ctx.user, HR_ACTIONS.STAFFING_ASSIGN);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrWorkspaceAssignments).values({
        ...input,
        assignmentType: "primary",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "hr",
        actorId: ctx.user.id,
        action: "hr.staff.assign",
        targetType: "worker",
        targetId: input.workerId,
        metadata: { roleCode: input.roleCode },
      });
      await logHrAudit({
        actorId: ctx.user.id,
        workspaceId: input.workspaceId,
        targetWorkerId: input.workerId,
        action: "hr.workspace.assignment.create",
        metadata: { roleCode: input.roleCode, allocationPct: input.allocationPct },
      });

      return created;
    }),

  /** End a workspace assignment */
  endAssignment: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      assignmentId: z.number(),
      endDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "hr");
      await requireHrPermission(ctx.user, HR_ACTIONS.STAFFING_END);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const effectiveEndDate = input.endDate || new Date().toISOString().split("T")[0];

      const [assignment] = await db.select().from(hrWorkspaceAssignments)
        .where(and(
          eq(hrWorkspaceAssignments.id, input.assignmentId),
          eq(hrWorkspaceAssignments.workspaceId, input.workspaceId),
        )).limit(1);

      if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      await db.update(hrWorkspaceAssignments)
        .set({ endDate: effectiveEndDate, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrWorkspaceAssignments.id, input.assignmentId));

      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "hr",
        actorId: ctx.user.id,
        action: "hr.staff.unassign",
        targetType: "worker",
        targetId: assignment.workerId,
        metadata: { assignmentId: input.assignmentId, endDate: effectiveEndDate },
      });
      await logHrAudit({
        actorId: ctx.user.id,
        workspaceId: input.workspaceId,
        targetWorkerId: assignment.workerId,
        action: "hr.workspace.assignment.end",
        metadata: { assignmentId: input.assignmentId, endDate: effectiveEndDate },
      });

      return { success: true };
    }),

  /** Get workspace coverage summary */
  getWorkspaceCoverage: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "hr");
      const db = getDb();
      if (!db) return { total: 0, byRole: {} };

      const rows = await db
        .select({
          roleCode: hrWorkspaceAssignments.roleCode,
          count: sql<number>`count(*)::int`,
        })
        .from(hrWorkspaceAssignments)
        .where(and(
          eq(hrWorkspaceAssignments.workspaceId, input.workspaceId),
          or(isNull(hrWorkspaceAssignments.endDate), sql`${hrWorkspaceAssignments.endDate} >= CURRENT_DATE`),
        ))
        .groupBy(hrWorkspaceAssignments.roleCode);

      const byRole: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        byRole[r.roleCode] = r.count;
        total += r.count;
      }

      return { total, byRole };
    }),
});
