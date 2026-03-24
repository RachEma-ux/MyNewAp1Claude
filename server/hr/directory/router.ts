/**
 * HR Directory Router — Employee directory CRUD
 *
 * Provides list, search, get, create, update for the employee directory.
 * All reads are protected, all writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, or, ilike, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { hrPeople, hrWorkerProfiles, hrEmploymentRecords } from "../../../drizzle/schema";
import { logHrAudit, logSensitiveRead } from "../audit";
import {
  maskDirectoryFields,
  checkHrAccess,
  requireHrPermission,
  resolveDataScope,
  HR_ACTIONS,
} from "../permissions";

export const hrDirectoryRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      workerType: z.string().optional(),
      orgUnitId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Scope-aware: employee sees self, manager sees team, hrbp/admin sees all
      const scope = await resolveDataScope(
        ctx.user,
        HR_ACTIONS.DIRECTORY_READ,
        HR_ACTIONS.DIRECTORY_READ_TEAM,
        HR_ACTIONS.DIRECTORY_READ_SELF,
      );
      if (scope.scope === "none") return [];

      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.status) conditions.push(eq(hrWorkerProfiles.status, input.status));
      if (input.workerType) conditions.push(eq(hrWorkerProfiles.workerType, input.workerType));
      if (input.orgUnitId) conditions.push(eq(hrWorkerProfiles.homeOrgUnitId, input.orgUnitId));

      // Apply scope narrowing
      if (scope.scope === "self") {
        conditions.push(eq(hrWorkerProfiles.id, scope.workerId));
      } else if (scope.scope === "team") {
        conditions.push(sql`${hrWorkerProfiles.id} = ANY(${scope.workerIds})`);
      }

      const rows = await db
        .select({
          workerId: hrWorkerProfiles.id,
          personId: hrPeople.id,
          displayName: hrPeople.displayName,
          firstName: hrPeople.firstName,
          lastName: hrPeople.lastName,
          primaryEmail: hrPeople.primaryEmail,
          employeeNumber: hrWorkerProfiles.employeeNumber,
          workerType: hrWorkerProfiles.workerType,
          employmentCategory: hrWorkerProfiles.employmentCategory,
          homeOrgUnitId: hrWorkerProfiles.homeOrgUnitId,
          primaryPositionId: hrWorkerProfiles.primaryPositionId,
          status: hrWorkerProfiles.status,
        })
        .from(hrWorkerProfiles)
        .innerJoin(hrPeople, eq(hrWorkerProfiles.personId, hrPeople.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrPeople.displayName))
        .limit(input.limit)
        .offset(input.offset);

      return rows.map(maskDirectoryFields);
    }),

  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      // Scope-aware: employee can search but only sees self, manager sees team, hrbp/admin sees all
      const scope = await resolveDataScope(
        ctx.user,
        HR_ACTIONS.DIRECTORY_READ,
        HR_ACTIONS.DIRECTORY_READ_TEAM,
        HR_ACTIONS.DIRECTORY_READ_SELF,
      );
      if (scope.scope === "none") return [];

      const db = getDb();
      if (!db) return [];

      const q = `%${input.query}%`;

      const conditions: any[] = [
        or(
          ilike(hrPeople.displayName, q),
          ilike(hrPeople.primaryEmail, q),
          ilike(hrPeople.firstName, q),
          ilike(hrPeople.lastName, q),
          ilike(hrWorkerProfiles.employeeNumber, q),
        ),
      ];

      // Apply scope narrowing
      if (scope.scope === "self") {
        conditions.push(eq(hrWorkerProfiles.id, scope.workerId));
      } else if (scope.scope === "team") {
        conditions.push(sql`${hrWorkerProfiles.id} = ANY(${scope.workerIds})`);
      }

      const rows = await db
        .select({
          workerId: hrWorkerProfiles.id,
          displayName: hrPeople.displayName,
          primaryEmail: hrPeople.primaryEmail,
          employeeNumber: hrWorkerProfiles.employeeNumber,
          workerType: hrWorkerProfiles.workerType,
          status: hrWorkerProfiles.status,
        })
        .from(hrWorkerProfiles)
        .innerJoin(hrPeople, eq(hrWorkerProfiles.personId, hrPeople.id))
        .where(and(...conditions))
        .limit(input.limit);

      return rows.map(maskDirectoryFields);
    }),

  getById: protectedProcedure
    .input(z.object({ workerId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Scope-aware: employee can view self, manager sees team, hrbp/admin sees all
      const scope = await resolveDataScope(
        ctx.user,
        HR_ACTIONS.DIRECTORY_READ,
        HR_ACTIONS.DIRECTORY_READ_TEAM,
        HR_ACTIONS.DIRECTORY_READ_SELF,
      );
      if (scope.scope === "none") throw new TRPCError({ code: "FORBIDDEN", message: "HR permission denied: directory read" });

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify scope access
      if (scope.scope === "self" && input.workerId !== scope.workerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this worker profile" });
      }
      if (scope.scope === "team" && !scope.workerIds.includes(input.workerId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this worker profile" });
      }

      const rows = await db
        .select({
          workerId: hrWorkerProfiles.id,
          personId: hrPeople.id,
          displayName: hrPeople.displayName,
          firstName: hrPeople.firstName,
          lastName: hrPeople.lastName,
          preferredName: hrPeople.preferredName,
          primaryEmail: hrPeople.primaryEmail,
          employeeNumber: hrWorkerProfiles.employeeNumber,
          workerType: hrWorkerProfiles.workerType,
          employmentCategory: hrWorkerProfiles.employmentCategory,
          homeOrgUnitId: hrWorkerProfiles.homeOrgUnitId,
          primaryPositionId: hrWorkerProfiles.primaryPositionId,
          managerWorkerId: hrWorkerProfiles.managerWorkerId,
          status: hrWorkerProfiles.status,
          personStatus: hrPeople.status,
        })
        .from(hrWorkerProfiles)
        .innerJoin(hrPeople, eq(hrWorkerProfiles.personId, hrPeople.id))
        .where(eq(hrWorkerProfiles.id, input.workerId))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Worker not found" });
      return maskDirectoryFields(rows[0]);
    }),

  getSummary: protectedProcedure
    .query(async ({ ctx }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.DIRECTORY_READ);
      const db = getDb();
      if (!db) return { total: 0, active: 0, onLeave: 0, terminated: 0 };

      const rows = await db
        .select({
          status: hrWorkerProfiles.status,
          count: sql<number>`count(*)::int`,
        })
        .from(hrWorkerProfiles)
        .groupBy(hrWorkerProfiles.status);

      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.status] = r.count;

      return {
        total: Object.values(counts).reduce((a, b) => a + b, 0),
        active: counts["active"] ?? 0,
        onLeave: counts["on_leave"] ?? 0,
        terminated: counts["terminated"] ?? 0,
      };
    }),

  create: governedProcedure
    .input(z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      displayName: z.string().min(1).max(200),
      primaryEmail: z.string().email().max(255),
      preferredName: z.string().max(100).optional(),
      primaryPhone: z.string().max(50).optional(),
      workerType: z.enum(["employee", "contractor", "intern", "consultant"]).default("employee"),
      employeeNumber: z.string().max(50).optional(),
      employmentCategory: z.string().max(50).default("full_time"),
      homeOrgUnitId: z.number().optional(),
      primaryPositionId: z.number().optional(),
      managerWorkerId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.DIRECTORY_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Create person
      const [person] = await db.insert(hrPeople).values({
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        primaryEmail: input.primaryEmail,
        preferredName: input.preferredName,
        primaryPhone: input.primaryPhone,
      }).returning();

      // Create worker profile
      const [worker] = await db.insert(hrWorkerProfiles).values({
        personId: person.id,
        workerType: input.workerType,
        employeeNumber: input.employeeNumber,
        employmentCategory: input.employmentCategory,
        homeOrgUnitId: input.homeOrgUnitId,
        primaryPositionId: input.primaryPositionId,
        managerWorkerId: input.managerWorkerId,
      }).returning();

      // Create initial employment record
      await db.insert(hrEmploymentRecords).values({
        workerId: worker.id,
        employmentStatus: "active",
        contractType: "permanent",
        startDate: new Date().toISOString().split("T")[0],
        effectiveFrom: new Date().toISOString().split("T")[0],
      });

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: worker.id,
        action: "hr.worker.create",
        metadata: { displayName: input.displayName, email: input.primaryEmail },
      });

      return { personId: person.id, workerId: worker.id };
    }),

  update: governedProcedure
    .input(z.object({
      workerId: z.number(),
      displayName: z.string().max(200).optional(),
      preferredName: z.string().max(100).optional(),
      primaryEmail: z.string().email().max(255).optional(),
      workerType: z.enum(["employee", "contractor", "intern", "consultant"]).optional(),
      employmentCategory: z.string().max(50).optional(),
      status: z.string().max(30).optional(),
      homeOrgUnitId: z.number().nullable().optional(),
      primaryPositionId: z.number().nullable().optional(),
      managerWorkerId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.DIRECTORY_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Get current worker to find personId
      const [worker] = await db.select().from(hrWorkerProfiles)
        .where(eq(hrWorkerProfiles.id, input.workerId)).limit(1);
      if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "Worker not found" });

      // Update person fields
      const personUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.displayName) personUpdates.displayName = input.displayName;
      if (input.preferredName !== undefined) personUpdates.preferredName = input.preferredName;
      if (input.primaryEmail) personUpdates.primaryEmail = input.primaryEmail;
      if (Object.keys(personUpdates).length > 1) {
        await db.update(hrPeople).set(personUpdates).where(eq(hrPeople.id, worker.personId));
      }

      // Update worker profile fields
      const workerUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.workerType) workerUpdates.workerType = input.workerType;
      if (input.employmentCategory) workerUpdates.employmentCategory = input.employmentCategory;
      if (input.status) workerUpdates.status = input.status;
      if (input.homeOrgUnitId !== undefined) workerUpdates.homeOrgUnitId = input.homeOrgUnitId;
      if (input.primaryPositionId !== undefined) workerUpdates.primaryPositionId = input.primaryPositionId;
      if (input.managerWorkerId !== undefined) workerUpdates.managerWorkerId = input.managerWorkerId;
      if (Object.keys(workerUpdates).length > 1) {
        await db.update(hrWorkerProfiles).set(workerUpdates).where(eq(hrWorkerProfiles.id, input.workerId));
      }

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.worker.update",
        metadata: { changes: Object.keys(input).filter(k => k !== "workerId") },
      });

      return { success: true };
    }),

  getAssignments: protectedProcedure
    .input(z.object({ workerId: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.DIRECTORY_READ);
      const db = getDb();
      if (!db) return [];

      const { hrWorkspaceAssignments } = await import("../../../drizzle/schema");
      return db.select().from(hrWorkspaceAssignments)
        .where(eq(hrWorkspaceAssignments.workerId, input.workerId))
        .orderBy(desc(hrWorkspaceAssignments.createdAt));
    }),

  // ============================================================================
  // HR Letters & Certificates (Phase 4 — Employee Records expansion)
  // ============================================================================

  listLetters: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      workerId: z.number().optional(),
      letterType: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.DIRECTORY_READ);
      const db = getDb();
      if (!db) return [];

      const { hrLetters } = await import("../../../drizzle/schema");
      const conditions = [];
      if (input.workerId) conditions.push(eq(hrLetters.workerId, input.workerId));
      if (input.letterType) conditions.push(eq(hrLetters.letterType, input.letterType));
      if (input.status) conditions.push(eq(hrLetters.status, input.status));

      return db.select().from(hrLetters)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrLetters.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getLetter: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.DIRECTORY_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { hrLetters } = await import("../../../drizzle/schema");
      const rows = await db.select().from(hrLetters).where(eq(hrLetters.id, input.id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found" });

      await logSensitiveRead({ actorId: ctx.user.id, domain: "letter", recordCount: 1 });
      return rows[0];
    }),

  createLetter: governedProcedure
    .input(z.object({
      workerId: z.number(),
      letterType: z.string().min(1).max(100),
      title: z.string().min(1).max(300),
      description: z.string().optional(),
      referenceNumber: z.string().max(100).optional(),
      issueDate: z.string().optional(),
      expiryDate: z.string().optional(),
      templateId: z.string().max(100).optional(),
      documentRef: z.string().max(500).optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.DIRECTORY_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { hrLetters } = await import("../../../drizzle/schema");
      const [created] = await db.insert(hrLetters).values({
        ...input,
        status: "draft",
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        targetWorkerId: input.workerId,
        action: "hr.letter.create",
        metadata: { letterId: created.id, letterType: input.letterType, title: input.title },
      });

      return created;
    }),

  updateLetter: governedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().max(300).optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      issueDate: z.string().optional(),
      expiryDate: z.string().optional(),
      documentRef: z.string().max(500).optional(),
      issuedBy: z.number().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.DIRECTORY_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { hrLetters } = await import("../../../drizzle/schema");
      const { id, ...updates } = input;
      const [updated] = await db.update(hrLetters)
        .set({ ...updates, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(hrLetters.id, id)).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found" });

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.letter.update",
        metadata: { letterId: id, changes: Object.keys(updates) },
      });

      return updated;
    }),
});
