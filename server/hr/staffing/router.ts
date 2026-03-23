/**
 * HR Staffing Router — Workspace assignments, skills, certifications
 *
 * Manages the bridge between HR workers and workspaces.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, or, ilike, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrWorkspaceAssignments,
  hrWorkerProfiles,
  hrPeople,
  hrWorkerSkills,
  hrWorkerCertifications,
} from "../../../drizzle/schema";
import { logHrAudit } from "../audit";

export const hrStaffingRouter = router({
  listWorkspaceAssignments: protectedProcedure
    .input(z.object({
      workspaceId: z.number().optional(),
      workerId: z.number().optional(),
      roleCode: z.string().optional(),
      approvalStatus: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.workspaceId) conditions.push(eq(hrWorkspaceAssignments.workspaceId, input.workspaceId));
      if (input.workerId) conditions.push(eq(hrWorkspaceAssignments.workerId, input.workerId));
      if (input.roleCode) conditions.push(eq(hrWorkspaceAssignments.roleCode, input.roleCode));
      if (input.approvalStatus) conditions.push(eq(hrWorkspaceAssignments.approvalStatus, input.approvalStatus));
      // Only active assignments (no end date or future end date)
      conditions.push(or(isNull(hrWorkspaceAssignments.endDate), sql`${hrWorkspaceAssignments.endDate} >= CURRENT_DATE`));

      return db
        .select({
          id: hrWorkspaceAssignments.id,
          workspaceId: hrWorkspaceAssignments.workspaceId,
          workerId: hrWorkspaceAssignments.workerId,
          roleCode: hrWorkspaceAssignments.roleCode,
          allocationPct: hrWorkspaceAssignments.allocationPct,
          assignmentType: hrWorkspaceAssignments.assignmentType,
          startDate: hrWorkspaceAssignments.startDate,
          endDate: hrWorkspaceAssignments.endDate,
          isPrimary: hrWorkspaceAssignments.isPrimary,
          approvalStatus: hrWorkspaceAssignments.approvalStatus,
          displayName: hrPeople.displayName,
          employeeNumber: hrWorkerProfiles.employeeNumber,
        })
        .from(hrWorkspaceAssignments)
        .innerJoin(hrWorkerProfiles, eq(hrWorkspaceAssignments.workerId, hrWorkerProfiles.id))
        .innerJoin(hrPeople, eq(hrWorkerProfiles.personId, hrPeople.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrWorkspaceAssignments.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  searchEligibleWorkers: protectedProcedure
    .input(z.object({
      query: z.string().optional(),
      skillName: z.string().optional(),
      workerType: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];

      const conditions = [eq(hrWorkerProfiles.status, "active")];
      if (input.workerType) conditions.push(eq(hrWorkerProfiles.workerType, input.workerType));

      let query = db
        .select({
          workerId: hrWorkerProfiles.id,
          displayName: hrPeople.displayName,
          employeeNumber: hrWorkerProfiles.employeeNumber,
          workerType: hrWorkerProfiles.workerType,
          primaryEmail: hrPeople.primaryEmail,
        })
        .from(hrWorkerProfiles)
        .innerJoin(hrPeople, eq(hrWorkerProfiles.personId, hrPeople.id));

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

      return query
        .where(and(...conditions))
        .limit(input.limit);
    }),

  assignWorker: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      workerId: z.number(),
      roleCode: z.enum(["member", "lead", "reviewer", "observer"]).default("member"),
      allocationPct: z.number().min(0).max(100).default(100),
      assignmentType: z.enum(["primary", "secondary", "temporary"]).default("primary"),
      startDate: z.string(),
      endDate: z.string().optional(),
      isPrimary: z.boolean().default(false),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify worker exists and is active
      const [worker] = await db.select().from(hrWorkerProfiles)
        .where(eq(hrWorkerProfiles.id, input.workerId)).limit(1);
      if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "Worker not found" });
      if (worker.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Worker is not active" });
      }

      const [created] = await db.insert(hrWorkspaceAssignments).values({
        ...input,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        workspaceId: input.workspaceId,
        targetWorkerId: input.workerId,
        action: "hr.assignment.create",
        metadata: { roleCode: input.roleCode, allocationPct: input.allocationPct },
      });

      return created;
    }),

  updateAssignment: governedProcedure
    .input(z.object({
      id: z.number(),
      roleCode: z.string().optional(),
      allocationPct: z.number().min(0).max(100).optional(),
      approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
      endDate: z.string().nullable().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { id, ...updates } = input;
      await db.update(hrWorkspaceAssignments)
        .set({ ...updates, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrWorkspaceAssignments.id, id));

      const [assignment] = await db.select().from(hrWorkspaceAssignments)
        .where(eq(hrWorkspaceAssignments.id, id)).limit(1);

      await logHrAudit({
        actorId: ctx.user.id,
        workspaceId: assignment?.workspaceId,
        targetWorkerId: assignment?.workerId,
        action: "hr.assignment.update",
        metadata: { assignmentId: id, changes: Object.keys(updates) },
      });

      return { success: true };
    }),

  endAssignment: governedProcedure
    .input(z.object({
      id: z.number(),
      endDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const effectiveEndDate = input.endDate || new Date().toISOString().split("T")[0];

      const [assignment] = await db.select().from(hrWorkspaceAssignments)
        .where(eq(hrWorkspaceAssignments.id, input.id)).limit(1);
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      await db.update(hrWorkspaceAssignments)
        .set({ endDate: effectiveEndDate, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrWorkspaceAssignments.id, input.id));

      await logHrAudit({
        actorId: ctx.user.id,
        workspaceId: assignment.workspaceId,
        targetWorkerId: assignment.workerId,
        action: "hr.assignment.end",
        metadata: { assignmentId: input.id, endDate: effectiveEndDate },
      });

      return { success: true };
    }),

  listSkills: protectedProcedure
    .input(z.object({ workerId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];

      if (input.workerId) {
        return db.select().from(hrWorkerSkills)
          .where(eq(hrWorkerSkills.workerId, input.workerId))
          .orderBy(hrWorkerSkills.skillName);
      }
      // Return distinct skill names for lookup
      return db.selectDistinct({ skillName: hrWorkerSkills.skillName })
        .from(hrWorkerSkills)
        .orderBy(hrWorkerSkills.skillName);
    }),

  listCertifications: protectedProcedure
    .input(z.object({ workerId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];

      if (input.workerId) {
        return db.select().from(hrWorkerCertifications)
          .where(eq(hrWorkerCertifications.workerId, input.workerId))
          .orderBy(hrWorkerCertifications.certificationName);
      }
      return db.selectDistinct({ certificationName: hrWorkerCertifications.certificationName })
        .from(hrWorkerCertifications)
        .orderBy(hrWorkerCertifications.certificationName);
    }),
});
