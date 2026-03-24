/**
 * HR Role Definitions Router — Canonical, versioned, effective-dated role-definition lifecycle
 *
 * Implements the full role-definition lifecycle per the HR Role Definition Framework:
 * - Create / update drafts
 * - Submit for review
 * - Request changes / approve
 * - Publish / schedule effective date
 * - Supersede / retire
 * - Position linkage
 * - Version comparison
 * - Visibility-controlled reads with field masking
 * - Audit logging for sensitive operations
 *
 * All reads are protected. All mutations are governed + audited.
 * Restricted fields are masked based on caller's HR role.
 */

import { z } from "zod";
import { eq, and, desc, asc, or, ilike, isNull, sql, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import {
  hrRoleDefinitions,
  hrRoleDefinitionVersions,
  hrRoleDefinitionReviews,
  hrPositionRoleLinks,
  hrPositions,
  hrOrgUnits,
  hrJobFamilies,
  hrJobLevels,
  hrWorkerProfiles,
} from "../../../drizzle/schema";
import { logHrAudit, logSensitiveRead, logStatusChange } from "../audit";
import {
  requireHrPermission,
  checkHrAccess,
  HR_ACTIONS,
  maskRoleDefRestrictedFields,
  maskRoleDefManagerFields,
  type HrRole,
  preventSelfApproval,
  getWorkerIdForUser,
  getHrRoleForUser,
  hasPermission,
} from "../permissions";
import {
  isValidRoleDefTransition,
  ROLE_DEF_VERSION_STATUSES,
  ROLE_DEF_VISIBILITY_CLASSES,
  ROLE_DEF_CHANGE_TYPES,
  ROLE_DEF_REVIEW_OUTCOMES,
} from "@shared/hr-role-definitions";

// ============================================================================
// Zod schemas for input validation
// ============================================================================

const stringArraySchema = z.array(z.string()).optional();

const roleDefContentSchema = z.object({
  title: z.string().min(1).max(300),
  purposeSummary: z.string().optional(),
  reportsToDescription: z.string().max(300).optional(),
  reportsToRoleDefinitionId: z.number().optional(),
  directReportsScope: z.string().optional(),
  locationScope: z.string().max(300).optional(),
  employmentType: z.string().max(50).optional(),
  accountabilities: stringArraySchema,
  decisionRightsIndependent: stringArraySchema,
  decisionRightsRecommend: stringArraySchema,
  decisionRightsEscalate: stringArraySchema,
  boundariesInScope: stringArraySchema,
  boundariesOutOfScope: stringArraySchema,
  escalationTriggers: stringArraySchema,
  collaborationInterfaces: stringArraySchema,
  requiredTechnicalSkills: stringArraySchema,
  requiredBehavioralSkills: stringArraySchema,
  requiredEducation: stringArraySchema,
  requiredExperience: stringArraySchema,
  preferredQualifications: stringArraySchema,
  successMetrics: stringArraySchema,
  visibilityClass: z.enum(ROLE_DEF_VISIBILITY_CLASSES as unknown as [string, ...string[]]).default("public_internal"),
  sensitivityNotes: z.string().optional(),
  complianceNotes: z.string().optional(),
  sodConstraints: z.string().optional(),
  compensationNotes: z.string().optional(),
  successionNotes: z.string().optional(),
  restructuringNotes: z.string().optional(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
  nextReviewAt: z.string().optional(),
  changeReason: z.string().optional(),
  changeType: z.enum(ROLE_DEF_CHANGE_TYPES as unknown as [string, ...string[]]).default("material"),
});

// ============================================================================
// Field masking based on HR role
// ============================================================================

function applyRoleDefMasking(record: Record<string, unknown>, hrRole: HrRole): Record<string, unknown> {
  let result = { ...record };
  // Employees and managers: mask restricted HR fields
  if (hrRole === "employee" || hrRole === "manager") {
    result = maskRoleDefRestrictedFields(result);
  }
  // Employees only: also mask manager-visible fields
  if (hrRole === "employee") {
    result = maskRoleDefManagerFields(result);
  }
  return result;
}

// ============================================================================
// Router
// ============================================================================

export const hrRoleDefinitionRouter = router({
  // ========================================================================
  // QUERIES
  // ========================================================================

  /** List role definitions with current version info, filtered and paginated */
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      orgUnitId: z.number().optional(),
      jobFamilyId: z.number().optional(),
      jobLevelId: z.number().optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const hrRole = await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_READ);
      const db = getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input.status) conditions.push(eq(hrRoleDefinitions.status, input.status));
      if (input.orgUnitId) conditions.push(eq(hrRoleDefinitions.orgUnitId, input.orgUnitId));
      if (input.jobFamilyId) conditions.push(eq(hrRoleDefinitions.jobFamilyId, input.jobFamilyId));
      if (input.jobLevelId) conditions.push(eq(hrRoleDefinitions.jobLevelId, input.jobLevelId));
      if (input.search) {
        const q = `%${input.search}%`;
        conditions.push(
          or(ilike(hrRoleDefinitions.title, q), ilike(hrRoleDefinitions.roleCode, q))
        );
      }

      const rows = await db
        .select({
          id: hrRoleDefinitions.id,
          roleCode: hrRoleDefinitions.roleCode,
          title: hrRoleDefinitions.title,
          orgUnitId: hrRoleDefinitions.orgUnitId,
          jobFamilyId: hrRoleDefinitions.jobFamilyId,
          jobLevelId: hrRoleDefinitions.jobLevelId,
          status: hrRoleDefinitions.status,
          currentVersionId: hrRoleDefinitions.currentVersionId,
          updatedAt: hrRoleDefinitions.updatedAt,
          // Join current version for status and visibility
          currentVersionStatus: hrRoleDefinitionVersions.status,
          visibilityClass: hrRoleDefinitionVersions.visibilityClass,
          effectiveFrom: hrRoleDefinitionVersions.effectiveFrom,
        })
        .from(hrRoleDefinitions)
        .leftJoin(
          hrRoleDefinitionVersions,
          eq(hrRoleDefinitions.currentVersionId, hrRoleDefinitionVersions.id)
        )
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(hrRoleDefinitions.updatedAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  /** Get a single role definition with its current effective version */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const hrRole = await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [roleDef] = await db.select().from(hrRoleDefinitions)
        .where(eq(hrRoleDefinitions.id, input.id)).limit(1);
      if (!roleDef) throw new TRPCError({ code: "NOT_FOUND", message: "Role definition not found" });

      let currentVersion = null;
      if (roleDef.currentVersionId) {
        const [ver] = await db.select().from(hrRoleDefinitionVersions)
          .where(eq(hrRoleDefinitionVersions.id, roleDef.currentVersionId)).limit(1);
        if (ver) {
          currentVersion = applyRoleDefMasking(ver as Record<string, unknown>, hrRole);
        }
      }

      return { ...roleDef, currentVersion };
    }),

  /** Get a specific version by ID with masking */
  getVersion: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const hrRole = await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [version] = await db.select().from(hrRoleDefinitionVersions)
        .where(eq(hrRoleDefinitionVersions.id, input.versionId)).limit(1);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      // Audit sensitive reads
      if (version.visibilityClass !== "public_internal" && version.visibilityClass !== "team_visible") {
        await logSensitiveRead({
          actorId: ctx.user.id,
          domain: "role_definition",
          targetWorkerId: undefined,
          recordCount: 1,
        });
      }

      return applyRoleDefMasking(version as Record<string, unknown>, hrRole);
    }),

  /** Get all versions for a role definition (history) */
  listVersions: protectedProcedure
    .input(z.object({ roleDefinitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_READ);
      const db = getDb();
      if (!db) return [];

      return db.select({
        id: hrRoleDefinitionVersions.id,
        versionNumber: hrRoleDefinitionVersions.versionNumber,
        status: hrRoleDefinitionVersions.status,
        changeType: hrRoleDefinitionVersions.changeType,
        changeReason: hrRoleDefinitionVersions.changeReason,
        effectiveFrom: hrRoleDefinitionVersions.effectiveFrom,
        effectiveTo: hrRoleDefinitionVersions.effectiveTo,
        createdAt: hrRoleDefinitionVersions.createdAt,
        approvedAt: hrRoleDefinitionVersions.approvedAt,
        publishedAt: hrRoleDefinitionVersions.publishedAt,
        title: hrRoleDefinitionVersions.title,
        visibilityClass: hrRoleDefinitionVersions.visibilityClass,
      })
        .from(hrRoleDefinitionVersions)
        .where(eq(hrRoleDefinitionVersions.roleDefinitionId, input.roleDefinitionId))
        .orderBy(desc(hrRoleDefinitionVersions.versionNumber));
    }),

  /** Compare two versions side-by-side */
  compareVersions: protectedProcedure
    .input(z.object({ versionIdA: z.number(), versionIdB: z.number() }))
    .query(async ({ ctx, input }) => {
      const hrRole = await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_READ);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [verA] = await db.select().from(hrRoleDefinitionVersions)
        .where(eq(hrRoleDefinitionVersions.id, input.versionIdA)).limit(1);
      const [verB] = await db.select().from(hrRoleDefinitionVersions)
        .where(eq(hrRoleDefinitionVersions.id, input.versionIdB)).limit(1);

      if (!verA || !verB) throw new TRPCError({ code: "NOT_FOUND", message: "One or both versions not found" });

      const maskedA = applyRoleDefMasking(verA as Record<string, unknown>, hrRole);
      const maskedB = applyRoleDefMasking(verB as Record<string, unknown>, hrRole);

      // Compute differences
      const compareFields = [
        "title", "purposeSummary", "reportsToDescription", "directReportsScope",
        "locationScope", "employmentType", "accountabilities",
        "decisionRightsIndependent", "decisionRightsRecommend", "decisionRightsEscalate",
        "boundariesInScope", "boundariesOutOfScope", "escalationTriggers",
        "collaborationInterfaces", "requiredTechnicalSkills", "requiredBehavioralSkills",
        "requiredEducation", "requiredExperience", "preferredQualifications",
        "successMetrics", "visibilityClass",
      ];

      const differences = compareFields
        .filter((field) => JSON.stringify(maskedA[field]) !== JSON.stringify(maskedB[field]))
        .map((field) => ({
          field,
          valueA: maskedA[field] ?? null,
          valueB: maskedB[field] ?? null,
        }));

      return {
        versionA: { id: verA.id, versionNumber: verA.versionNumber, status: verA.status },
        versionB: { id: verB.id, versionNumber: verB.versionNumber, status: verB.status },
        differences,
      };
    }),

  /** Search role definitions (full-text-like) */
  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_READ);
      const db = getDb();
      if (!db) return [];

      const q = `%${input.query}%`;
      return db.select({
        id: hrRoleDefinitions.id,
        roleCode: hrRoleDefinitions.roleCode,
        title: hrRoleDefinitions.title,
        status: hrRoleDefinitions.status,
      })
        .from(hrRoleDefinitions)
        .where(or(
          ilike(hrRoleDefinitions.title, q),
          ilike(hrRoleDefinitions.roleCode, q),
        ))
        .orderBy(hrRoleDefinitions.title)
        .limit(input.limit);
    }),

  /** List versions pending review (review queue) */
  reviewQueue: protectedProcedure
    .query(async ({ ctx }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_REVIEW);
      const db = getDb();
      if (!db) return [];

      return db.select({
        versionId: hrRoleDefinitionVersions.id,
        roleDefinitionId: hrRoleDefinitionVersions.roleDefinitionId,
        versionNumber: hrRoleDefinitionVersions.versionNumber,
        title: hrRoleDefinitionVersions.title,
        changeType: hrRoleDefinitionVersions.changeType,
        changeReason: hrRoleDefinitionVersions.changeReason,
        status: hrRoleDefinitionVersions.status,
        createdAt: hrRoleDefinitionVersions.createdAt,
        ownerId: hrRoleDefinitionVersions.ownerId,
        roleCode: hrRoleDefinitions.roleCode,
      })
        .from(hrRoleDefinitionVersions)
        .innerJoin(hrRoleDefinitions, eq(hrRoleDefinitionVersions.roleDefinitionId, hrRoleDefinitions.id))
        .where(eq(hrRoleDefinitionVersions.status, "in_review"))
        .orderBy(asc(hrRoleDefinitionVersions.createdAt));
    }),

  /** Get position links for a role definition */
  listPositionLinks: protectedProcedure
    .input(z.object({ roleDefinitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_READ);
      const db = getDb();
      if (!db) return [];

      return db.select({
        id: hrPositionRoleLinks.id,
        positionId: hrPositionRoleLinks.positionId,
        roleDefinitionId: hrPositionRoleLinks.roleDefinitionId,
        isActive: hrPositionRoleLinks.isActive,
        linkedAt: hrPositionRoleLinks.linkedAt,
        positionCode: hrPositions.positionCode,
        positionTitle: hrPositions.title,
        positionStatus: hrPositions.status,
      })
        .from(hrPositionRoleLinks)
        .innerJoin(hrPositions, eq(hrPositionRoleLinks.positionId, hrPositions.id))
        .where(and(
          eq(hrPositionRoleLinks.roleDefinitionId, input.roleDefinitionId),
          eq(hrPositionRoleLinks.isActive, true),
        ))
        .orderBy(hrPositions.positionCode);
    }),

  // ========================================================================
  // MUTATIONS
  // ========================================================================

  /** Create a new role definition with initial draft version */
  createDraft: governedProcedure
    .input(z.object({
      roleCode: z.string().min(1).max(80),
      title: z.string().min(1).max(300),
      orgUnitId: z.number().optional(),
      jobFamilyId: z.number().optional(),
      jobLevelId: z.number().optional(),
      content: roleDefContentSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_DRAFT);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Create the stable identity record
      const [roleDef] = await db.insert(hrRoleDefinitions).values({
        tenantId: "default",
        roleCode: input.roleCode,
        title: input.title,
        orgUnitId: input.orgUnitId,
        jobFamilyId: input.jobFamilyId,
        jobLevelId: input.jobLevelId,
        status: "active",
        createdBy: ctx.user.id,
      }).returning();

      // Create the initial draft version
      const [version] = await db.insert(hrRoleDefinitionVersions).values({
        roleDefinitionId: roleDef.id,
        versionNumber: 1,
        status: "draft",
        changeType: input.content.changeType ?? "material",
        changeReason: input.content.changeReason ?? "Initial creation",
        title: input.content.title,
        purposeSummary: input.content.purposeSummary,
        reportsToDescription: input.content.reportsToDescription,
        reportsToRoleDefinitionId: input.content.reportsToRoleDefinitionId,
        directReportsScope: input.content.directReportsScope,
        locationScope: input.content.locationScope,
        employmentType: input.content.employmentType,
        accountabilities: input.content.accountabilities,
        decisionRightsIndependent: input.content.decisionRightsIndependent,
        decisionRightsRecommend: input.content.decisionRightsRecommend,
        decisionRightsEscalate: input.content.decisionRightsEscalate,
        boundariesInScope: input.content.boundariesInScope,
        boundariesOutOfScope: input.content.boundariesOutOfScope,
        escalationTriggers: input.content.escalationTriggers,
        collaborationInterfaces: input.content.collaborationInterfaces,
        requiredTechnicalSkills: input.content.requiredTechnicalSkills,
        requiredBehavioralSkills: input.content.requiredBehavioralSkills,
        requiredEducation: input.content.requiredEducation,
        requiredExperience: input.content.requiredExperience,
        preferredQualifications: input.content.preferredQualifications,
        successMetrics: input.content.successMetrics,
        visibilityClass: input.content.visibilityClass,
        sensitivityNotes: input.content.sensitivityNotes,
        complianceNotes: input.content.complianceNotes,
        sodConstraints: input.content.sodConstraints,
        compensationNotes: input.content.compensationNotes,
        successionNotes: input.content.successionNotes,
        restructuringNotes: input.content.restructuringNotes,
        effectiveFrom: input.content.effectiveFrom,
        effectiveTo: input.content.effectiveTo,
        nextReviewAt: input.content.nextReviewAt,
        ownerId: ctx.user.id,
        createdBy: ctx.user.id,
      }).returning();

      // Set current version on the identity record
      await db.update(hrRoleDefinitions)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(eq(hrRoleDefinitions.id, roleDef.id));

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.roledef.create",
        category: "mutation",
        metadata: { roleDefinitionId: roleDef.id, versionId: version.id, roleCode: input.roleCode },
      });

      return { roleDefinition: roleDef, version };
    }),

  /** Update an existing draft version (only drafts and changes_requested are editable) */
  updateDraft: governedProcedure
    .input(z.object({
      versionId: z.number(),
      content: roleDefContentSchema.partial(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_DRAFT);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [version] = await db.select().from(hrRoleDefinitionVersions)
        .where(eq(hrRoleDefinitionVersions.id, input.versionId)).limit(1);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      // Only drafts and changes_requested versions are editable
      if (version.status !== "draft" && version.status !== "changes_requested") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot edit version in status: ${version.status}. Only draft and changes_requested versions are editable.`,
        });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(input.content)) {
        if (value !== undefined) {
          updates[key] = value;
        }
      }

      await db.update(hrRoleDefinitionVersions)
        .set(updates)
        .where(eq(hrRoleDefinitionVersions.id, input.versionId));

      // Update parent title if title changed
      if (input.content.title) {
        await db.update(hrRoleDefinitions)
          .set({ title: input.content.title, updatedAt: new Date() })
          .where(eq(hrRoleDefinitions.id, version.roleDefinitionId));
      }

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.roledef.update_draft",
        category: "mutation",
        metadata: { versionId: input.versionId, fields: Object.keys(input.content) },
      });

      return { success: true };
    }),

  /** Create a new version (for changes to published/effective roles) */
  createNewVersion: governedProcedure
    .input(z.object({
      roleDefinitionId: z.number(),
      changeType: z.enum(ROLE_DEF_CHANGE_TYPES as unknown as [string, ...string[]]),
      changeReason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_DRAFT);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [roleDef] = await db.select().from(hrRoleDefinitions)
        .where(eq(hrRoleDefinitions.id, input.roleDefinitionId)).limit(1);
      if (!roleDef) throw new TRPCError({ code: "NOT_FOUND", message: "Role definition not found" });

      // Get max version number
      const [maxVer] = await db.select({ maxVn: sql<number>`COALESCE(MAX(${hrRoleDefinitionVersions.versionNumber}), 0)` })
        .from(hrRoleDefinitionVersions)
        .where(eq(hrRoleDefinitionVersions.roleDefinitionId, input.roleDefinitionId));

      const newVersionNumber = (maxVer?.maxVn ?? 0) + 1;

      // Copy content from current version if exists
      let baseContent: Record<string, unknown> = {};
      if (roleDef.currentVersionId) {
        const [current] = await db.select().from(hrRoleDefinitionVersions)
          .where(eq(hrRoleDefinitionVersions.id, roleDef.currentVersionId)).limit(1);
        if (current) {
          const { id, versionNumber, status, createdAt, updatedAt, createdBy, approvedAt, publishedAt, approvedById, publishedById, reviewedById, lastReviewedAt, supersededById, ...content } = current;
          baseContent = content;
        }
      }

      const [version] = await db.insert(hrRoleDefinitionVersions).values({
        ...baseContent,
        roleDefinitionId: input.roleDefinitionId,
        versionNumber: newVersionNumber,
        status: "draft",
        changeType: input.changeType,
        changeReason: input.changeReason,
        ownerId: ctx.user.id,
        createdBy: ctx.user.id,
      } as any).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.roledef.new_version",
        category: "mutation",
        metadata: { roleDefinitionId: input.roleDefinitionId, versionId: version.id, versionNumber: newVersionNumber },
      });

      return version;
    }),

  /** Submit a draft for review */
  submitForReview: governedProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_SUBMIT);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [version] = await db.select().from(hrRoleDefinitionVersions)
        .where(eq(hrRoleDefinitionVersions.id, input.versionId)).limit(1);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      if (!isValidRoleDefTransition(version.status as any, "in_review")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from '${version.status}' to 'in_review'`,
        });
      }

      await db.update(hrRoleDefinitionVersions)
        .set({ status: "in_review", updatedAt: new Date() })
        .where(eq(hrRoleDefinitionVersions.id, input.versionId));

      await logStatusChange({
        actorId: ctx.user.id,
        domain: "role_definition",
        entityId: input.versionId,
        fromStatus: version.status,
        toStatus: "in_review",
      });

      return { success: true };
    }),

  /** Request changes on a version under review */
  requestChanges: governedProcedure
    .input(z.object({
      versionId: z.number(),
      comments: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_REVIEW);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [version] = await db.select().from(hrRoleDefinitionVersions)
        .where(eq(hrRoleDefinitionVersions.id, input.versionId)).limit(1);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      if (!isValidRoleDefTransition(version.status as any, "changes_requested")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot request changes on version in status: ${version.status}`,
        });
      }

      await db.update(hrRoleDefinitionVersions)
        .set({ status: "changes_requested", reviewedById: ctx.user.id, lastReviewedAt: new Date(), updatedAt: new Date() })
        .where(eq(hrRoleDefinitionVersions.id, input.versionId));

      // Create review record
      await db.insert(hrRoleDefinitionReviews).values({
        versionId: input.versionId,
        reviewerId: ctx.user.id,
        outcome: "changes_requested",
        comments: input.comments,
      });

      await logStatusChange({
        actorId: ctx.user.id,
        domain: "role_definition",
        entityId: input.versionId,
        fromStatus: version.status,
        toStatus: "changes_requested",
      });

      return { success: true };
    }),

  /** Approve a version under review */
  approve: governedProcedure
    .input(z.object({
      versionId: z.number(),
      comments: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_APPROVE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [version] = await db.select().from(hrRoleDefinitionVersions)
        .where(eq(hrRoleDefinitionVersions.id, input.versionId)).limit(1);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      if (!isValidRoleDefTransition(version.status as any, "approved")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot approve version in status: ${version.status}`,
        });
      }

      // Prevent self-approval
      const actorWorkerId = await getWorkerIdForUser(ctx.user.id);
      preventSelfApproval(ctx.user.id, version.ownerId ?? undefined, actorWorkerId, "role definition approval");

      await db.update(hrRoleDefinitionVersions)
        .set({
          status: "approved",
          approvedById: ctx.user.id,
          approvedAt: new Date(),
          reviewedById: ctx.user.id,
          lastReviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(hrRoleDefinitionVersions.id, input.versionId));

      await db.insert(hrRoleDefinitionReviews).values({
        versionId: input.versionId,
        reviewerId: ctx.user.id,
        outcome: "approved",
        comments: input.comments ?? null,
      });

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.roledef.approve",
        category: "approval",
        metadata: { versionId: input.versionId, roleDefinitionId: version.roleDefinitionId },
      });

      return { success: true };
    }),

  /** Publish an approved version */
  publish: governedProcedure
    .input(z.object({
      versionId: z.number(),
      effectiveFrom: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_PUBLISH);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [version] = await db.select().from(hrRoleDefinitionVersions)
        .where(eq(hrRoleDefinitionVersions.id, input.versionId)).limit(1);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      if (!isValidRoleDefTransition(version.status as any, "published")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot publish version in status: ${version.status}. Only approved versions can be published.`,
        });
      }

      const effectiveDate = input.effectiveFrom || new Date().toISOString().split("T")[0];
      const isFuture = new Date(effectiveDate) > new Date();
      const newStatus = isFuture ? "published" : "effective";

      // Supersede the previously effective version for this role definition
      const [prevEffective] = await db.select().from(hrRoleDefinitionVersions)
        .where(and(
          eq(hrRoleDefinitionVersions.roleDefinitionId, version.roleDefinitionId),
          or(
            eq(hrRoleDefinitionVersions.status, "effective"),
            eq(hrRoleDefinitionVersions.status, "published"),
          ),
          ne(hrRoleDefinitionVersions.id, input.versionId),
        ))
        .limit(1);

      if (prevEffective) {
        await db.update(hrRoleDefinitionVersions)
          .set({
            status: "superseded",
            effectiveTo: effectiveDate,
            supersededById: input.versionId,
            updatedAt: new Date(),
          })
          .where(eq(hrRoleDefinitionVersions.id, prevEffective.id));
      }

      await db.update(hrRoleDefinitionVersions)
        .set({
          status: newStatus,
          effectiveFrom: effectiveDate,
          publishedAt: new Date(),
          publishedById: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(hrRoleDefinitionVersions.id, input.versionId));

      // Update the identity record's current version
      await db.update(hrRoleDefinitions)
        .set({ currentVersionId: input.versionId, updatedAt: new Date() })
        .where(eq(hrRoleDefinitions.id, version.roleDefinitionId));

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.roledef.publish",
        category: "status_change",
        metadata: {
          versionId: input.versionId,
          roleDefinitionId: version.roleDefinitionId,
          effectiveFrom: effectiveDate,
          scheduledFuture: isFuture,
        },
      });

      return { success: true, effectiveFrom: effectiveDate, scheduled: isFuture };
    }),

  /** Retire a role definition */
  retire: governedProcedure
    .input(z.object({
      roleDefinitionId: z.number(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_RETIRE);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [roleDef] = await db.select().from(hrRoleDefinitions)
        .where(eq(hrRoleDefinitions.id, input.roleDefinitionId)).limit(1);
      if (!roleDef) throw new TRPCError({ code: "NOT_FOUND", message: "Role definition not found" });

      // Block retirement if active position links exist
      const activeLinks = await db.select({ id: hrPositionRoleLinks.id })
        .from(hrPositionRoleLinks)
        .where(and(
          eq(hrPositionRoleLinks.roleDefinitionId, input.roleDefinitionId),
          eq(hrPositionRoleLinks.isActive, true),
        ))
        .limit(1);

      if (activeLinks.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot retire role definition with active position links. Unlink positions first.",
        });
      }

      // Retire the entity
      await db.update(hrRoleDefinitions)
        .set({ status: "retired", updatedAt: new Date() })
        .where(eq(hrRoleDefinitions.id, input.roleDefinitionId));

      // Retire the current effective version if any
      if (roleDef.currentVersionId) {
        const [curVer] = await db.select().from(hrRoleDefinitionVersions)
          .where(eq(hrRoleDefinitionVersions.id, roleDef.currentVersionId)).limit(1);
        if (curVer && (curVer.status === "effective" || curVer.status === "published")) {
          await db.update(hrRoleDefinitionVersions)
            .set({ status: "retired", effectiveTo: new Date().toISOString().split("T")[0], updatedAt: new Date() })
            .where(eq(hrRoleDefinitionVersions.id, roleDef.currentVersionId));
        }
      }

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.roledef.retire",
        category: "status_change",
        metadata: { roleDefinitionId: input.roleDefinitionId, reason: input.reason },
      });

      return { success: true };
    }),

  /** Link a position to an approved active role definition */
  linkPosition: governedProcedure
    .input(z.object({
      positionId: z.number(),
      roleDefinitionId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_LINK_POSITION);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify role definition is active with a published/effective version
      const [roleDef] = await db.select().from(hrRoleDefinitions)
        .where(eq(hrRoleDefinitions.id, input.roleDefinitionId)).limit(1);
      if (!roleDef) throw new TRPCError({ code: "NOT_FOUND", message: "Role definition not found" });
      if (roleDef.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only link active role definitions to positions" });
      }

      // Verify position exists
      const [position] = await db.select().from(hrPositions)
        .where(eq(hrPositions.id, input.positionId)).limit(1);
      if (!position) throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });

      // Deactivate any existing active link for this position
      await db.update(hrPositionRoleLinks)
        .set({ isActive: false, unlinkedAt: new Date(), unlinkedBy: ctx.user.id })
        .where(and(
          eq(hrPositionRoleLinks.positionId, input.positionId),
          eq(hrPositionRoleLinks.isActive, true),
        ));

      // Create new link
      const [link] = await db.insert(hrPositionRoleLinks).values({
        positionId: input.positionId,
        roleDefinitionId: input.roleDefinitionId,
        linkedBy: ctx.user.id,
      }).returning();

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.roledef.link_position",
        category: "assignment",
        metadata: { positionId: input.positionId, roleDefinitionId: input.roleDefinitionId },
      });

      return link;
    }),

  /** Unlink a position from a role definition */
  unlinkPosition: governedProcedure
    .input(z.object({ linkId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_LINK_POSITION);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [link] = await db.select().from(hrPositionRoleLinks)
        .where(eq(hrPositionRoleLinks.id, input.linkId)).limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Link not found" });

      await db.update(hrPositionRoleLinks)
        .set({ isActive: false, unlinkedAt: new Date(), unlinkedBy: ctx.user.id })
        .where(eq(hrPositionRoleLinks.id, input.linkId));

      await logHrAudit({
        actorId: ctx.user.id,
        action: "hr.roledef.unlink_position",
        category: "assignment",
        metadata: { linkId: input.linkId, positionId: link.positionId, roleDefinitionId: link.roleDefinitionId },
      });

      return { success: true };
    }),

  /** Get reviews for a version */
  listReviews: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireHrPermission(ctx.user, HR_ACTIONS.ROLE_DEF_READ);
      const db = getDb();
      if (!db) return [];

      return db.select().from(hrRoleDefinitionReviews)
        .where(eq(hrRoleDefinitionReviews.versionId, input.versionId))
        .orderBy(desc(hrRoleDefinitionReviews.reviewedAt));
    }),

  // ========================================================================
  // SELF-SERVICE — Employee reads their own role definition
  // ========================================================================

  /**
   * Get the role definition linked to the calling user's current position.
   *
   * Resolution chain:
   *   user → workerId (via hr_role_assignments) → workerProfile.primaryPositionId
   *   → active hrPositionRoleLinks → hrRoleDefinitions + current version
   *
   * Requires ROLE_DEF_READ_SELF (employee-level). Returns the role definition
   * with employee-level masking applied (restricted + manager fields nulled).
   */
  getMyRoleDefinition: protectedProcedure
    .query(async ({ ctx }) => {
      const hrRole = await getHrRoleForUser(ctx.user);
      // Employees need ROLE_DEF_READ_SELF; managers+ can use ROLE_DEF_READ
      if (!hasPermission(hrRole, HR_ACTIONS.ROLE_DEF_READ_SELF) &&
          !hasPermission(hrRole, HR_ACTIONS.ROLE_DEF_READ)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "HR permission denied: hr.roledef.read.self" });
      }

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Step 1: Resolve caller's worker ID
      const workerId = await getWorkerIdForUser(ctx.user.id);
      if (!workerId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No HR worker profile linked to your account",
        });
      }

      // Step 2: Get worker's primary position
      const [worker] = await db
        .select({ primaryPositionId: hrWorkerProfiles.primaryPositionId })
        .from(hrWorkerProfiles)
        .where(eq(hrWorkerProfiles.id, workerId))
        .limit(1);

      if (!worker?.primaryPositionId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No position assigned to your worker profile",
        });
      }

      // Step 3: Find active position → role-definition link
      const [link] = await db
        .select({
          roleDefinitionId: hrPositionRoleLinks.roleDefinitionId,
        })
        .from(hrPositionRoleLinks)
        .where(
          and(
            eq(hrPositionRoleLinks.positionId, worker.primaryPositionId),
            eq(hrPositionRoleLinks.isActive, true),
          )
        )
        .limit(1);

      if (!link) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No role definition linked to your current position",
        });
      }

      // Step 4: Fetch role definition + current version
      const [roleDef] = await db
        .select()
        .from(hrRoleDefinitions)
        .where(eq(hrRoleDefinitions.id, link.roleDefinitionId))
        .limit(1);

      if (!roleDef) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Role definition not found" });
      }

      let currentVersion = null;
      if (roleDef.currentVersionId) {
        const [ver] = await db
          .select()
          .from(hrRoleDefinitionVersions)
          .where(eq(hrRoleDefinitionVersions.id, roleDef.currentVersionId))
          .limit(1);
        if (ver) {
          currentVersion = applyRoleDefMasking(ver as Record<string, unknown>, hrRole);
        }
      }

      return { ...roleDef, currentVersion };
    }),
});
