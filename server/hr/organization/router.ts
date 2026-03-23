/**
 * HR Organization Router — Org Units, Positions, Job Families/Levels
 *
 * Provides org tree, unit CRUD, position management.
 * Reads are protected, writes are governed + audited.
 */

import { z } from "zod";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrOrgUnits,
  hrPositions,
  hrJobFamilies,
  hrJobLevels,
  hrWorkerProfiles,
} from "../../../drizzle/schema";
import { logHrAudit } from "../audit";
import {
  checkHrAccess,
  requireHrPermission,
  HR_ACTIONS,
} from "../permissions";

export const hrOrganizationRouter = router({
  listOrgUnits: protectedProcedure
    .input(z.object({
      parentId: z.number().nullable().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ORGANIZATION_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.parentId !== undefined) {
        conditions.push(
          input.parentId === null
            ? isNull(hrOrgUnits.parentOrgUnitId)
            : eq(hrOrgUnits.parentOrgUnitId, input.parentId)
        );
      }
      if (input.status) conditions.push(eq(hrOrgUnits.status, input.status));

      return db.select().from(hrOrgUnits)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(hrOrgUnits.name);
    }),

  getOrgUnit: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ORGANIZATION_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(hrOrgUnits).where(eq(hrOrgUnits.id, input.id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Org unit not found" });
      return rows[0];
    }),

  getOrgTree: protectedProcedure
    .query(async ({ ctx }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ORGANIZATION_READ);
      const db = getDb();
      if (!db) return [];

      const units = await db.select().from(hrOrgUnits)
        .where(eq(hrOrgUnits.status, "active"))
        .orderBy(hrOrgUnits.name);

      // Build tree structure
      const map = new Map<number, typeof units[0] & { children: typeof units }>();
      const roots: (typeof units[0] & { children: typeof units })[] = [];

      for (const u of units) {
        map.set(u.id, { ...u, children: [] });
      }
      for (const u of units) {
        const node = map.get(u.id)!;
        if (u.parentOrgUnitId && map.has(u.parentOrgUnitId)) {
          map.get(u.parentOrgUnitId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }
      return roots;
    }),

  createOrgUnit: governedProcedure
    .input(z.object({
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(200),
      type: z.enum(["department", "division", "team", "business_unit"]).default("department"),
      parentOrgUnitId: z.number().optional(),
      managerWorkerId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ORGANIZATION_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrOrgUnits).values(input).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.orgunit.create",
        metadata: { code: input.code, name: input.name },
      });

      return created;
    }),

  listPositions: protectedProcedure
    .input(z.object({
      orgUnitId: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ORGANIZATION_READ);
      const db = getDb();
      if (!db) return [];

      const conditions = [];
      if (input.orgUnitId) conditions.push(eq(hrPositions.orgUnitId, input.orgUnitId));
      if (input.status) conditions.push(eq(hrPositions.status, input.status));

      return db.select().from(hrPositions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(hrPositions.title)
        .limit(input.limit)
        .offset(input.offset);
    }),

  getPosition: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ORGANIZATION_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(hrPositions).where(eq(hrPositions.id, input.id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });
      return rows[0];
    }),

  createPosition: governedProcedure
    .input(z.object({
      positionCode: z.string().min(1).max(50),
      title: z.string().min(1).max(200),
      jobFamilyId: z.number().optional(),
      jobLevelId: z.number().optional(),
      orgUnitId: z.number().optional(),
      reportsToPositionId: z.number().optional(),
      headcountLimit: z.number().min(1).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ORGANIZATION_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(hrPositions).values(input).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.position.create",
        metadata: { positionCode: input.positionCode, title: input.title },
      });

      return created;
    }),

  updatePosition: governedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().max(200).optional(),
      orgUnitId: z.number().nullable().optional(),
      jobFamilyId: z.number().nullable().optional(),
      jobLevelId: z.number().nullable().optional(),
      status: z.string().optional(),
      filled: z.boolean().optional(),
      headcountLimit: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ORGANIZATION_WRITE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { id, ...updates } = input;
      await db.update(hrPositions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(hrPositions.id, id));

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.position.update",
        metadata: { positionId: id, changes: Object.keys(updates) },
      });

      return { success: true };
    }),

  listJobFamilies: protectedProcedure
    .query(async ({ ctx }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ORGANIZATION_READ);
      const db = getDb();
      if (!db) return [];
      return db.select().from(hrJobFamilies).orderBy(hrJobFamilies.name);
    }),

  listJobLevels: protectedProcedure
    .query(async ({ ctx }) => {
      await checkHrAccess(ctx.user, HR_ACTIONS.ORGANIZATION_READ);
      const db = getDb();
      if (!db) return [];
      return db.select().from(hrJobLevels).orderBy(hrJobLevels.rank);
    }),
});
