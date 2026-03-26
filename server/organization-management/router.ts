/**
 * Organization Management — tRPC Router
 *
 * All OM CRUD and lifecycle operations under `organizationManagement.*`.
 * Every mutation uses governedProcedure + audit logging.
 * Every read uses protectedProcedure.
 *
 * Sub-routers:
 * - legalEntities — company/subsidiary CRUD
 * - orgUnits — department/division/team CRUD + hierarchy
 * - jobs — job definition CRUD
 * - positions — position CRUD + lifecycle
 * - reporting — reporting relationship CRUD
 * - costCenters — cost center CRUD
 * - structureVersions — draft/publish/version model
 * - authority — authority chain queries (read-only)
 * - audit — audit log queries (read-only)
 */

import { z } from "zod";
import { eq, and, desc, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getDb } from "../db/connection";
import {
  omLegalEntities,
  omOrgUnits,
  omJobs,
  omPositions,
  omReportingRelationships,
  omCostCenters,
  omStructureVersions,
  omAuditLog,
  omOrgTemplates,
} from "../../drizzle/tables/organization-management";
import {
  validateLegalEntityTransition,
  validateOrgUnitTransition,
  validateJobTransition,
  validatePositionTransition,
  validateReportingTransition,
  validateCostCenterTransition,
  validateStructureVersionTransition,
} from "./lifecycle";
import {
  requireAcyclicOrgUnit,
  requireAcyclicReporting,
  requireAcyclicCostCenter,
  requireAcyclicLegalEntity,
  requireOrgUnitNotFrozen,
  requirePositionOperable,
} from "./enforcement";
import {
  validateOrgUnitRef,
  validateJobRef,
  validatePositionRef,
  validateLegalEntityRef,
  validateCostCenterRef,
} from "./validation";
import { logOmAudit } from "./audit";
import { resolveOmAuthority, getAuthorityChain } from "./authority";
import { logActivity } from "../modules/registry";

// ============================================================================
// Legal Entities Sub-Router
// ============================================================================

const legalEntitiesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(omLegalEntities)
        .where(eq(omLegalEntities.workspaceId, input.workspaceId))
        .orderBy(asc(omLegalEntities.name));
    }),

  get: protectedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [entity] = await db.select().from(omLegalEntities)
        .where(and(eq(omLegalEntities.id, input.id), eq(omLegalEntities.workspaceId, input.workspaceId)))
        .limit(1);
      if (!entity) throw new TRPCError({ code: "NOT_FOUND", message: "Legal entity not found" });
      return entity;
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(200),
      type: z.enum(["company", "subsidiary", "branch", "holding"]).default("company"),
      parentEntityId: z.number().optional(),
      country: z.string().max(100).optional(),
      registrationNumber: z.string().max(100).optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      if (input.parentEntityId) {
        await validateLegalEntityRef(input.workspaceId, input.parentEntityId);
      }

      const [created] = await db.insert(omLegalEntities).values({
        workspaceId: input.workspaceId,
        code: input.code,
        name: input.name,
        type: input.type,
        parentEntityId: input.parentEntityId,
        country: input.country,
        registrationNumber: input.registrationNumber,
        metadata: input.metadata,
        createdBy: ctx.user.id,
      }).returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "legal_entity.create",
        entityType: "legal_entity",
        entityId: created.id,
        newValue: { code: input.code, name: input.name, type: input.type },
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "legal_entity.create",
        targetType: "legal_entity",
        targetId: created.id,
      });

      return created;
    }),

  update: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      name: z.string().min(1).max(200).optional(),
      type: z.enum(["company", "subsidiary", "branch", "holding"]).optional(),
      parentEntityId: z.number().nullable().optional(),
      country: z.string().max(100).nullable().optional(),
      registrationNumber: z.string().max(100).nullable().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omLegalEntities)
        .where(and(eq(omLegalEntities.id, input.id), eq(omLegalEntities.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Legal entity not found" });

      if (input.parentEntityId != null) {
        await validateLegalEntityRef(input.workspaceId, input.parentEntityId);
        await requireAcyclicLegalEntity(input.workspaceId, input.id, input.parentEntityId);
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.type !== undefined) updates.type = input.type;
      if (input.parentEntityId !== undefined) updates.parentEntityId = input.parentEntityId;
      if (input.country !== undefined) updates.country = input.country;
      if (input.registrationNumber !== undefined) updates.registrationNumber = input.registrationNumber;
      if (input.metadata !== undefined) updates.metadata = input.metadata;

      const [updated] = await db.update(omLegalEntities)
        .set(updates)
        .where(eq(omLegalEntities.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "legal_entity.update",
        entityType: "legal_entity",
        entityId: input.id,
        previousValue: { name: existing.name, type: existing.type },
        newValue: updates,
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "legal_entity.update",
        targetType: "legal_entity",
        targetId: input.id,
      });

      return updated;
    }),

  changeStatus: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      status: z.enum(["active", "inactive", "dissolved"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omLegalEntities)
        .where(and(eq(omLegalEntities.id, input.id), eq(omLegalEntities.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Legal entity not found" });

      validateLegalEntityTransition(existing.status, input.status);

      const [updated] = await db.update(omLegalEntities)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(omLegalEntities.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "legal_entity.status_change",
        entityType: "legal_entity",
        entityId: input.id,
        previousValue: { status: existing.status },
        newValue: { status: input.status },
        category: "status_change",
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "legal_entity.status_change",
        targetType: "legal_entity",
        targetId: input.id,
        metadata: { from: existing.status, to: input.status },
      });

      return updated;
    }),
});

// ============================================================================
// Org Units Sub-Router
// ============================================================================

const orgUnitsRouter = router({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      parentId: z.number().nullable().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(omOrgUnits.workspaceId, input.workspaceId)];
      if (input.status) conditions.push(eq(omOrgUnits.status, input.status));

      return db.select().from(omOrgUnits)
        .where(and(...conditions))
        .orderBy(asc(omOrgUnits.level), asc(omOrgUnits.name));
    }),

  get: protectedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [unit] = await db.select().from(omOrgUnits)
        .where(and(eq(omOrgUnits.id, input.id), eq(omOrgUnits.workspaceId, input.workspaceId)))
        .limit(1);
      if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "Org unit not found" });
      return unit;
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(200),
      type: z.enum(["department", "division", "team", "business_unit", "group"]).default("department"),
      parentOrgUnitId: z.number().optional(),
      legalEntityId: z.number().optional(),
      costCenterId: z.number().optional(),
      managerPositionId: z.number().optional(),
      level: z.number().default(0),
      effectiveFrom: z.string().optional(),
      effectiveTo: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      if (input.parentOrgUnitId) await validateOrgUnitRef(input.workspaceId, input.parentOrgUnitId);
      if (input.legalEntityId) await validateLegalEntityRef(input.workspaceId, input.legalEntityId);
      if (input.costCenterId) await validateCostCenterRef(input.workspaceId, input.costCenterId);
      if (input.managerPositionId) await validatePositionRef(input.workspaceId, input.managerPositionId);

      const [created] = await db.insert(omOrgUnits).values({
        workspaceId: input.workspaceId,
        code: input.code,
        name: input.name,
        type: input.type,
        parentOrgUnitId: input.parentOrgUnitId,
        legalEntityId: input.legalEntityId,
        costCenterId: input.costCenterId,
        managerPositionId: input.managerPositionId,
        level: input.level,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        metadata: input.metadata,
        createdBy: ctx.user.id,
      }).returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "org_unit.create",
        entityType: "org_unit",
        entityId: created.id,
        newValue: { code: input.code, name: input.name, type: input.type },
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "org_unit.create",
        targetType: "org_unit",
        targetId: created.id,
      });

      return created;
    }),

  update: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      name: z.string().min(1).max(200).optional(),
      type: z.enum(["department", "division", "team", "business_unit", "group"]).optional(),
      parentOrgUnitId: z.number().nullable().optional(),
      legalEntityId: z.number().nullable().optional(),
      costCenterId: z.number().nullable().optional(),
      managerPositionId: z.number().nullable().optional(),
      level: z.number().optional(),
      effectiveFrom: z.string().nullable().optional(),
      effectiveTo: z.string().nullable().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omOrgUnits)
        .where(and(eq(omOrgUnits.id, input.id), eq(omOrgUnits.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Org unit not found" });

      if (input.parentOrgUnitId != null) {
        await validateOrgUnitRef(input.workspaceId, input.parentOrgUnitId);
        await requireAcyclicOrgUnit(input.workspaceId, input.id, input.parentOrgUnitId);
      }
      if (input.legalEntityId != null) await validateLegalEntityRef(input.workspaceId, input.legalEntityId);
      if (input.costCenterId != null) await validateCostCenterRef(input.workspaceId, input.costCenterId);
      if (input.managerPositionId != null) await validatePositionRef(input.workspaceId, input.managerPositionId);

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.type !== undefined) updates.type = input.type;
      if (input.parentOrgUnitId !== undefined) updates.parentOrgUnitId = input.parentOrgUnitId;
      if (input.legalEntityId !== undefined) updates.legalEntityId = input.legalEntityId;
      if (input.costCenterId !== undefined) updates.costCenterId = input.costCenterId;
      if (input.managerPositionId !== undefined) updates.managerPositionId = input.managerPositionId;
      if (input.level !== undefined) updates.level = input.level;
      if (input.effectiveFrom !== undefined) updates.effectiveFrom = input.effectiveFrom;
      if (input.effectiveTo !== undefined) updates.effectiveTo = input.effectiveTo;
      if (input.metadata !== undefined) updates.metadata = input.metadata;

      const isReparent = input.parentOrgUnitId !== undefined && input.parentOrgUnitId !== existing.parentOrgUnitId;

      const [updated] = await db.update(omOrgUnits)
        .set(updates)
        .where(eq(omOrgUnits.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: isReparent ? "org_unit.reparent" : "org_unit.update",
        entityType: "org_unit",
        entityId: input.id,
        previousValue: { name: existing.name, parentOrgUnitId: existing.parentOrgUnitId },
        newValue: updates,
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: isReparent ? "org_unit.reparent" : "org_unit.update",
        targetType: "org_unit",
        targetId: input.id,
      });

      return updated;
    }),

  changeStatus: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      status: z.enum(["active", "inactive", "frozen", "archived"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omOrgUnits)
        .where(and(eq(omOrgUnits.id, input.id), eq(omOrgUnits.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Org unit not found" });

      validateOrgUnitTransition(existing.status, input.status);

      const [updated] = await db.update(omOrgUnits)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(omOrgUnits.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "org_unit.status_change",
        entityType: "org_unit",
        entityId: input.id,
        previousValue: { status: existing.status },
        newValue: { status: input.status },
        category: "status_change",
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "org_unit.status_change",
        targetType: "org_unit",
        targetId: input.id,
        metadata: { from: existing.status, to: input.status },
      });

      return updated;
    }),
});

// ============================================================================
// Jobs Sub-Router
// ============================================================================

const jobsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), family: z.string().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(omJobs.workspaceId, input.workspaceId)];
      if (input.family) conditions.push(eq(omJobs.family, input.family));
      return db.select().from(omJobs)
        .where(and(...conditions))
        .orderBy(asc(omJobs.family), asc(omJobs.levelRank));
    }),

  get: protectedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [job] = await db.select().from(omJobs)
        .where(and(eq(omJobs.id, input.id), eq(omJobs.workspaceId, input.workspaceId)))
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return job;
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      code: z.string().min(1).max(50),
      title: z.string().min(1).max(200),
      family: z.string().max(100).optional(),
      level: z.string().max(50).optional(),
      levelRank: z.number().default(0),
      description: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(omJobs).values({
        workspaceId: input.workspaceId,
        code: input.code,
        title: input.title,
        family: input.family,
        level: input.level,
        levelRank: input.levelRank,
        description: input.description,
        metadata: input.metadata,
        createdBy: ctx.user.id,
      }).returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "job.create",
        entityType: "job",
        entityId: created.id,
        newValue: { code: input.code, title: input.title, family: input.family },
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "job.create",
        targetType: "job",
        targetId: created.id,
      });

      return created;
    }),

  update: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      title: z.string().min(1).max(200).optional(),
      family: z.string().max(100).nullable().optional(),
      level: z.string().max(50).nullable().optional(),
      levelRank: z.number().optional(),
      description: z.string().nullable().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omJobs)
        .where(and(eq(omJobs.id, input.id), eq(omJobs.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = input.title;
      if (input.family !== undefined) updates.family = input.family;
      if (input.level !== undefined) updates.level = input.level;
      if (input.levelRank !== undefined) updates.levelRank = input.levelRank;
      if (input.description !== undefined) updates.description = input.description;
      if (input.metadata !== undefined) updates.metadata = input.metadata;

      const [updated] = await db.update(omJobs)
        .set(updates)
        .where(eq(omJobs.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "job.update",
        entityType: "job",
        entityId: input.id,
        previousValue: { title: existing.title, family: existing.family },
        newValue: updates,
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "job.update",
        targetType: "job",
        targetId: input.id,
      });

      return updated;
    }),

  changeStatus: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      status: z.enum(["active", "deprecated", "retired"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omJobs)
        .where(and(eq(omJobs.id, input.id), eq(omJobs.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

      validateJobTransition(existing.status, input.status);

      const [updated] = await db.update(omJobs)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(omJobs.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "job.status_change",
        entityType: "job",
        entityId: input.id,
        previousValue: { status: existing.status },
        newValue: { status: input.status },
        category: "status_change",
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "job.status_change",
        targetType: "job",
        targetId: input.id,
        metadata: { from: existing.status, to: input.status },
      });

      return updated;
    }),
});

// ============================================================================
// Positions Sub-Router
// ============================================================================

const positionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      orgUnitId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(omPositions.workspaceId, input.workspaceId)];
      if (input.orgUnitId) conditions.push(eq(omPositions.orgUnitId, input.orgUnitId));
      if (input.status) conditions.push(eq(omPositions.status, input.status));
      return db.select().from(omPositions)
        .where(and(...conditions))
        .orderBy(asc(omPositions.title));
    }),

  get: protectedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [pos] = await db.select().from(omPositions)
        .where(and(eq(omPositions.id, input.id), eq(omPositions.workspaceId, input.workspaceId)))
        .limit(1);
      if (!pos) throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });
      return pos;
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      positionCode: z.string().min(1).max(50),
      title: z.string().min(1).max(200),
      jobId: z.number().optional(),
      orgUnitId: z.number().optional(),
      reportsToPositionId: z.number().optional(),
      legalEntityId: z.number().optional(),
      costCenterId: z.number().optional(),
      budgeted: z.boolean().default(true),
      headcountLimit: z.number().default(1),
      status: z.enum(["vacant", "filled", "frozen", "temporary"]).default("vacant"),
      effectiveFrom: z.string().optional(),
      effectiveTo: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      if (input.jobId) await validateJobRef(input.workspaceId, input.jobId);
      if (input.orgUnitId) {
        await validateOrgUnitRef(input.workspaceId, input.orgUnitId);
        await requireOrgUnitNotFrozen(input.workspaceId, input.orgUnitId);
      }
      if (input.reportsToPositionId) await validatePositionRef(input.workspaceId, input.reportsToPositionId);
      if (input.legalEntityId) await validateLegalEntityRef(input.workspaceId, input.legalEntityId);
      if (input.costCenterId) await validateCostCenterRef(input.workspaceId, input.costCenterId);

      const [created] = await db.insert(omPositions).values({
        workspaceId: input.workspaceId,
        positionCode: input.positionCode,
        title: input.title,
        jobId: input.jobId,
        orgUnitId: input.orgUnitId,
        reportsToPositionId: input.reportsToPositionId,
        legalEntityId: input.legalEntityId,
        costCenterId: input.costCenterId,
        budgeted: input.budgeted,
        headcountLimit: input.headcountLimit,
        status: input.status,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        metadata: input.metadata,
        createdBy: ctx.user.id,
      }).returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "position.create",
        entityType: "position",
        entityId: created.id,
        newValue: { positionCode: input.positionCode, title: input.title, orgUnitId: input.orgUnitId },
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "position.create",
        targetType: "position",
        targetId: created.id,
      });

      return created;
    }),

  update: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      title: z.string().min(1).max(200).optional(),
      jobId: z.number().nullable().optional(),
      orgUnitId: z.number().nullable().optional(),
      reportsToPositionId: z.number().nullable().optional(),
      legalEntityId: z.number().nullable().optional(),
      costCenterId: z.number().nullable().optional(),
      budgeted: z.boolean().optional(),
      headcountLimit: z.number().optional(),
      effectiveFrom: z.string().nullable().optional(),
      effectiveTo: z.string().nullable().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omPositions)
        .where(and(eq(omPositions.id, input.id), eq(omPositions.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });

      await requirePositionOperable(input.workspaceId, input.id);

      if (input.jobId != null) await validateJobRef(input.workspaceId, input.jobId);
      if (input.orgUnitId != null) {
        await validateOrgUnitRef(input.workspaceId, input.orgUnitId);
        await requireOrgUnitNotFrozen(input.workspaceId, input.orgUnitId);
      }
      if (input.reportsToPositionId != null) {
        await validatePositionRef(input.workspaceId, input.reportsToPositionId);
        await requireAcyclicReporting(input.workspaceId, input.id, input.reportsToPositionId);
      }
      if (input.legalEntityId != null) await validateLegalEntityRef(input.workspaceId, input.legalEntityId);
      if (input.costCenterId != null) await validateCostCenterRef(input.workspaceId, input.costCenterId);

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = input.title;
      if (input.jobId !== undefined) updates.jobId = input.jobId;
      if (input.orgUnitId !== undefined) updates.orgUnitId = input.orgUnitId;
      if (input.reportsToPositionId !== undefined) updates.reportsToPositionId = input.reportsToPositionId;
      if (input.legalEntityId !== undefined) updates.legalEntityId = input.legalEntityId;
      if (input.costCenterId !== undefined) updates.costCenterId = input.costCenterId;
      if (input.budgeted !== undefined) updates.budgeted = input.budgeted;
      if (input.headcountLimit !== undefined) updates.headcountLimit = input.headcountLimit;
      if (input.effectiveFrom !== undefined) updates.effectiveFrom = input.effectiveFrom;
      if (input.effectiveTo !== undefined) updates.effectiveTo = input.effectiveTo;
      if (input.metadata !== undefined) updates.metadata = input.metadata;

      // Determine audit action
      let action = "position.update";
      if (input.orgUnitId !== undefined && input.orgUnitId !== existing.orgUnitId) action = "position.reassign_org_unit";
      if (input.jobId !== undefined && input.jobId !== existing.jobId) action = "position.reassign_job";
      if (input.reportsToPositionId !== undefined && input.reportsToPositionId !== existing.reportsToPositionId) action = "position.change_reporting";

      const [updated] = await db.update(omPositions)
        .set(updates)
        .where(eq(omPositions.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action,
        entityType: "position",
        entityId: input.id,
        previousValue: { orgUnitId: existing.orgUnitId, jobId: existing.jobId, reportsToPositionId: existing.reportsToPositionId },
        newValue: updates,
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action,
        targetType: "position",
        targetId: input.id,
      });

      return updated;
    }),

  changeStatus: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      status: z.enum(["vacant", "filled", "frozen", "temporary", "closed"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omPositions)
        .where(and(eq(omPositions.id, input.id), eq(omPositions.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });

      validatePositionTransition(existing.status, input.status);

      const [updated] = await db.update(omPositions)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(omPositions.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "position.status_change",
        entityType: "position",
        entityId: input.id,
        previousValue: { status: existing.status },
        newValue: { status: input.status },
        category: "status_change",
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "position.status_change",
        targetType: "position",
        targetId: input.id,
        metadata: { from: existing.status, to: input.status },
      });

      return updated;
    }),
});

// ============================================================================
// Reporting Relationships Sub-Router
// ============================================================================

const reportingRouter = router({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      positionId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(omReportingRelationships.workspaceId, input.workspaceId)];
      if (input.positionId) conditions.push(eq(omReportingRelationships.positionId, input.positionId));
      return db.select().from(omReportingRelationships)
        .where(and(...conditions))
        .orderBy(desc(omReportingRelationships.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      positionId: z.number(),
      reportsToPositionId: z.number(),
      type: z.enum(["direct", "dotted", "functional"]).default("direct"),
      isPrimary: z.boolean().default(true),
      effectiveFrom: z.string().optional(),
      effectiveTo: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await validatePositionRef(input.workspaceId, input.positionId);
      await validatePositionRef(input.workspaceId, input.reportsToPositionId);
      await requireAcyclicReporting(input.workspaceId, input.positionId, input.reportsToPositionId);

      const [created] = await db.insert(omReportingRelationships).values({
        workspaceId: input.workspaceId,
        positionId: input.positionId,
        reportsToPositionId: input.reportsToPositionId,
        type: input.type,
        isPrimary: input.isPrimary,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        metadata: input.metadata,
        createdBy: ctx.user.id,
      }).returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "reporting.create",
        entityType: "reporting_relationship",
        entityId: created.id,
        newValue: { positionId: input.positionId, reportsToPositionId: input.reportsToPositionId, type: input.type },
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "reporting.create",
        targetType: "reporting_relationship",
        targetId: created.id,
      });

      return created;
    }),

  changeStatus: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      status: z.enum(["active", "inactive", "ended"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omReportingRelationships)
        .where(and(eq(omReportingRelationships.id, input.id), eq(omReportingRelationships.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Reporting relationship not found" });

      validateReportingTransition(existing.status, input.status);

      const [updated] = await db.update(omReportingRelationships)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(omReportingRelationships.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "reporting.status_change",
        entityType: "reporting_relationship",
        entityId: input.id,
        previousValue: { status: existing.status },
        newValue: { status: input.status },
        category: "status_change",
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "reporting.status_change",
        targetType: "reporting_relationship",
        targetId: input.id,
        metadata: { from: existing.status, to: input.status },
      });

      return updated;
    }),
});

// ============================================================================
// Cost Centers Sub-Router
// ============================================================================

const costCentersRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(omCostCenters)
        .where(eq(omCostCenters.workspaceId, input.workspaceId))
        .orderBy(asc(omCostCenters.name));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(200),
      legalEntityId: z.number().optional(),
      parentCostCenterId: z.number().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      if (input.legalEntityId) await validateLegalEntityRef(input.workspaceId, input.legalEntityId);
      if (input.parentCostCenterId) await validateCostCenterRef(input.workspaceId, input.parentCostCenterId);

      const [created] = await db.insert(omCostCenters).values({
        workspaceId: input.workspaceId,
        code: input.code,
        name: input.name,
        legalEntityId: input.legalEntityId,
        parentCostCenterId: input.parentCostCenterId,
        metadata: input.metadata,
        createdBy: ctx.user.id,
      }).returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "cost_center.create",
        entityType: "cost_center",
        entityId: created.id,
        newValue: { code: input.code, name: input.name },
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "cost_center.create",
        targetType: "cost_center",
        targetId: created.id,
      });

      return created;
    }),

  update: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      name: z.string().min(1).max(200).optional(),
      legalEntityId: z.number().nullable().optional(),
      parentCostCenterId: z.number().nullable().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omCostCenters)
        .where(and(eq(omCostCenters.id, input.id), eq(omCostCenters.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Cost center not found" });

      if (input.parentCostCenterId != null) {
        await validateCostCenterRef(input.workspaceId, input.parentCostCenterId);
        await requireAcyclicCostCenter(input.workspaceId, input.id, input.parentCostCenterId);
      }
      if (input.legalEntityId != null) await validateLegalEntityRef(input.workspaceId, input.legalEntityId);

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.legalEntityId !== undefined) updates.legalEntityId = input.legalEntityId;
      if (input.parentCostCenterId !== undefined) updates.parentCostCenterId = input.parentCostCenterId;
      if (input.metadata !== undefined) updates.metadata = input.metadata;

      const [updated] = await db.update(omCostCenters)
        .set(updates)
        .where(eq(omCostCenters.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "cost_center.update",
        entityType: "cost_center",
        entityId: input.id,
        previousValue: { name: existing.name },
        newValue: updates,
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "cost_center.update",
        targetType: "cost_center",
        targetId: input.id,
      });

      return updated;
    }),

  changeStatus: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      id: z.number(),
      status: z.enum(["active", "inactive", "closed"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omCostCenters)
        .where(and(eq(omCostCenters.id, input.id), eq(omCostCenters.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Cost center not found" });

      validateCostCenterTransition(existing.status, input.status);

      const [updated] = await db.update(omCostCenters)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(omCostCenters.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "cost_center.status_change",
        entityType: "cost_center",
        entityId: input.id,
        previousValue: { status: existing.status },
        newValue: { status: input.status },
        category: "status_change",
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "cost_center.status_change",
        targetType: "cost_center",
        targetId: input.id,
        metadata: { from: existing.status, to: input.status },
      });

      return updated;
    }),
});

// ============================================================================
// Structure Versions Sub-Router — Draft/Publish model
// ============================================================================

const structureVersionsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(omStructureVersions)
        .where(eq(omStructureVersions.workspaceId, input.workspaceId))
        .orderBy(desc(omStructureVersions.versionNumber));
    }),

  get: protectedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [ver] = await db.select().from(omStructureVersions)
        .where(and(eq(omStructureVersions.id, input.id), eq(omStructureVersions.workspaceId, input.workspaceId)))
        .limit(1);
      if (!ver) throw new TRPCError({ code: "NOT_FOUND", message: "Structure version not found" });
      return ver;
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(200),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Auto-increment version number
      const existing = await db.select({ versionNumber: omStructureVersions.versionNumber })
        .from(omStructureVersions)
        .where(eq(omStructureVersions.workspaceId, input.workspaceId))
        .orderBy(desc(omStructureVersions.versionNumber))
        .limit(1);
      const nextVersion = (existing[0]?.versionNumber ?? 0) + 1;

      const [created] = await db.insert(omStructureVersions).values({
        workspaceId: input.workspaceId,
        versionNumber: nextVersion,
        name: input.name,
        description: input.description,
        status: "draft",
        createdBy: ctx.user.id,
      }).returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "structure_version.create",
        entityType: "structure_version",
        entityId: created.id,
        newValue: { versionNumber: nextVersion, name: input.name },
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "structure_version.create",
        targetType: "structure_version",
        targetId: created.id,
      });

      return created;
    }),

  publish: governedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omStructureVersions)
        .where(and(eq(omStructureVersions.id, input.id), eq(omStructureVersions.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Structure version not found" });

      validateStructureVersionTransition(existing.status, "published");

      // Supersede any currently published versions
      const publishedVersions = await db.select().from(omStructureVersions)
        .where(and(
          eq(omStructureVersions.workspaceId, input.workspaceId),
          eq(omStructureVersions.status, "published"),
        ));

      for (const pv of publishedVersions) {
        await db.update(omStructureVersions)
          .set({ status: "superseded", updatedAt: new Date() })
          .where(eq(omStructureVersions.id, pv.id));
      }

      // Capture structural snapshot
      const orgUnits = await db.select().from(omOrgUnits)
        .where(eq(omOrgUnits.workspaceId, input.workspaceId));
      const positions = await db.select().from(omPositions)
        .where(eq(omPositions.workspaceId, input.workspaceId));
      const jobs = await db.select().from(omJobs)
        .where(eq(omJobs.workspaceId, input.workspaceId));

      const snapshot = {
        capturedAt: new Date().toISOString(),
        orgUnitCount: orgUnits.length,
        positionCount: positions.length,
        jobCount: jobs.length,
        orgUnits: orgUnits.map(u => ({ id: u.id, code: u.code, name: u.name, status: u.status })),
        positions: positions.map(p => ({ id: p.id, positionCode: p.positionCode, title: p.title, status: p.status })),
        jobs: jobs.map(j => ({ id: j.id, code: j.code, title: j.title, status: j.status })),
      };

      const [published] = await db.update(omStructureVersions)
        .set({
          status: "published",
          snapshot,
          publishedAt: new Date(),
          publishedBy: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(omStructureVersions.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "structure_version.publish",
        entityType: "structure_version",
        entityId: input.id,
        newValue: { versionNumber: existing.versionNumber, orgUnitCount: orgUnits.length, positionCount: positions.length },
        category: "structure_publish",
      });
      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "om",
        actorId: ctx.user.id,
        action: "structure_version.publish",
        targetType: "structure_version",
        targetId: input.id,
      });

      return published;
    }),

  archive: governedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db.select().from(omStructureVersions)
        .where(and(eq(omStructureVersions.id, input.id), eq(omStructureVersions.workspaceId, input.workspaceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Structure version not found" });

      validateStructureVersionTransition(existing.status, "archived");

      const [archived] = await db.update(omStructureVersions)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(omStructureVersions.id, input.id))
        .returning();

      await logOmAudit({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "structure_version.archive",
        entityType: "structure_version",
        entityId: input.id,
        previousValue: { status: existing.status },
        newValue: { status: "archived" },
        category: "status_change",
      });

      return archived;
    }),
});

// ============================================================================
// Authority Sub-Router — Read-only authority chain queries
// ============================================================================

const authorityRouter = router({
  resolve: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      targetPositionId: z.number().optional(),
      targetOrgUnitId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return resolveOmAuthority({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        actorRole: ctx.user.role || "user",
        targetPositionId: input.targetPositionId,
        targetOrgUnitId: input.targetOrgUnitId,
      });
    }),

  chain: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      positionId: z.number(),
      maxDepth: z.number().default(20),
    }))
    .query(async ({ input }) => {
      return getAuthorityChain(input.workspaceId, input.positionId, input.maxDepth);
    }),
});

// ============================================================================
// Audit Sub-Router — Read-only audit log queries
// ============================================================================

const auditRouter = router({
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      entityType: z.string().optional(),
      action: z.string().optional(),
      limit: z.number().min(1).max(500).default(50),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(omAuditLog.workspaceId, input.workspaceId)];
      if (input.entityType) conditions.push(eq(omAuditLog.entityType, input.entityType));
      if (input.action) conditions.push(eq(omAuditLog.action, input.action));
      return db.select().from(omAuditLog)
        .where(and(...conditions))
        .orderBy(desc(omAuditLog.createdAt))
        .limit(input.limit);
    }),
});

// ============================================================================
// OM Settings Sub-Router
// ============================================================================

const settingsRouter = router({
  get: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async () => {
      return {
        module: "om",
        version: "1.0.0",
        features: {
          legalEntities: true,
          orgUnits: true,
          jobs: true,
          positions: true,
          reporting: true,
          costCenters: true,
          structureVersions: true,
          authority: true,
          audit: true,
        },
      };
    }),
});

// ============================================================================
// Templates Sub-Router — Reusable org structure blueprints
// ============================================================================

const templatesRouter = router({
  list: protectedProcedure
    .input(z.object({ structureModel: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [];
      if (input?.structureModel) {
        conditions.push(eq(omOrgTemplates.structureModel, input.structureModel));
      }
      return db.select().from(omOrgTemplates)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(omOrgTemplates.name));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [tpl] = await db.select().from(omOrgTemplates)
        .where(eq(omOrgTemplates.id, input.id))
        .limit(1);
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return tpl;
    }),
});

// ============================================================================
// Composed OM Router
// ============================================================================

export const organizationManagementRouter = router({
  legalEntities: legalEntitiesRouter,
  orgUnits: orgUnitsRouter,
  jobs: jobsRouter,
  positions: positionsRouter,
  reporting: reportingRouter,
  costCenters: costCentersRouter,
  structureVersions: structureVersionsRouter,
  authority: authorityRouter,
  audit: auditRouter,
  settings: settingsRouter,
  templates: templatesRouter,
});
