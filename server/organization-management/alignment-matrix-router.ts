/**
 * Alignment Matrix Router — Governed matrix management + wizard integration
 *
 * Sub-namespaces:
 * - versions: matrix version lifecycle (create/publish/archive)
 * - types: column definitions (structure types)
 * - attributes: row definitions
 * - cells: type × attribute value intersections
 * - wizard: bootstrap + selection management for OM wizard
 */

import { z } from "zod";
import { eq, and, asc, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getDb } from "../db/connection";
import {
  omAlignmentMatrixVersions,
  omAlignmentTypes,
  omAlignmentAttributes,
  omAlignmentCells,
  omStructureAlignmentSelections,
  omStructureVersions,
} from "../../drizzle/tables/organization-management";
import {
  validateAlignmentMatrixVersionRef,
  validateAlignmentTypeRef,
  validateAlignmentAttributeRef,
  requireSingleActiveAlignmentMatrixVersion,
  requireStructureVersionDraft,
  requireSelectionValueAllowed,
  requireCompleteAlignmentMatrixVersion,
} from "./validation";
import { logOmAudit } from "./audit";
import { logActivity } from "../modules/registry";

// ============================================================================
// Versions — Matrix version lifecycle
// ============================================================================

const versionsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(omAlignmentMatrixVersions)
        .where(eq(omAlignmentMatrixVersions.workspaceId, input.workspaceId))
        .orderBy(desc(omAlignmentMatrixVersions.createdAt));
    }),

  getActive: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return null;
      const [ver] = await db.select().from(omAlignmentMatrixVersions)
        .where(and(eq(omAlignmentMatrixVersions.workspaceId, input.workspaceId), eq(omAlignmentMatrixVersions.status, "active")))
        .limit(1);
      return ver ?? null;
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
      const [created] = await db.insert(omAlignmentMatrixVersions).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        status: "draft",
        createdBy: ctx.user.id,
      }).returning();
      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_matrix_version.create", entityType: "alignment_matrix_version", entityId: created.id, newValue: { name: input.name } });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "om", actorId: ctx.user.id, action: "alignment_matrix_version.create", targetType: "alignment_matrix_version", targetId: created.id });
      return created;
    }),

  publish: governedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(omAlignmentMatrixVersions)
        .where(and(eq(omAlignmentMatrixVersions.id, input.id), eq(omAlignmentMatrixVersions.workspaceId, input.workspaceId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
      if (existing.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft versions can be published" });
      await requireCompleteAlignmentMatrixVersion(input.workspaceId, input.id);
      // Supersede any currently active versions
      const activeVersions = await db.select().from(omAlignmentMatrixVersions)
        .where(and(eq(omAlignmentMatrixVersions.workspaceId, input.workspaceId), eq(omAlignmentMatrixVersions.status, "active")));
      for (const av of activeVersions) {
        await db.update(omAlignmentMatrixVersions).set({ status: "superseded", updatedAt: new Date() }).where(eq(omAlignmentMatrixVersions.id, av.id));
      }
      const [published] = await db.update(omAlignmentMatrixVersions)
        .set({ status: "active", publishedAt: new Date(), publishedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(omAlignmentMatrixVersions.id, input.id)).returning();
      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_matrix_version.publish", entityType: "alignment_matrix_version", entityId: input.id, newValue: { status: "active" }, category: "structure_publish" });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "om", actorId: ctx.user.id, action: "alignment_matrix_version.publish", targetType: "alignment_matrix_version", targetId: input.id });
      return published;
    }),

  archive: governedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(omAlignmentMatrixVersions)
        .where(and(eq(omAlignmentMatrixVersions.id, input.id), eq(omAlignmentMatrixVersions.workspaceId, input.workspaceId))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Matrix version not found" });
      const [archived] = await db.update(omAlignmentMatrixVersions)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(omAlignmentMatrixVersions.id, input.id)).returning();
      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_matrix_version.archive", entityType: "alignment_matrix_version", entityId: input.id, previousValue: { status: existing.status }, newValue: { status: "archived" } });
      return archived;
    }),
});

// ============================================================================
// Types — Column definitions (structure types)
// ============================================================================

const typesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), matrixVersionId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(omAlignmentTypes)
        .where(and(eq(omAlignmentTypes.matrixVersionId, input.matrixVersionId), eq(omAlignmentTypes.workspaceId, input.workspaceId)))
        .orderBy(asc(omAlignmentTypes.sortOrder));
    }),

  create: governedProcedure
    .input(z.object({ workspaceId: z.number(), matrixVersionId: z.number(), code: z.string().min(1).max(50), label: z.string().min(1).max(200), description: z.string().optional(), sortOrder: z.number().default(0) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await validateAlignmentMatrixVersionRef(input.workspaceId, input.matrixVersionId);
      const [created] = await db.insert(omAlignmentTypes).values({
        workspaceId: input.workspaceId, matrixVersionId: input.matrixVersionId, code: input.code, label: input.label, description: input.description, sortOrder: input.sortOrder, isActive: true, createdBy: ctx.user.id,
      }).returning();
      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_type.create", entityType: "alignment_type", entityId: created.id, newValue: { code: input.code, label: input.label } });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "om", actorId: ctx.user.id, action: "alignment_type.create", targetType: "alignment_type", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number(), label: z.string().min(1).max(200).optional(), description: z.string().nullable().optional(), sortOrder: z.number().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.label !== undefined) updates.label = input.label;
      if (input.description !== undefined) updates.description = input.description;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (input.isActive !== undefined) updates.isActive = input.isActive;
      const [updated] = await db.update(omAlignmentTypes).set(updates).where(and(eq(omAlignmentTypes.id, input.id), eq(omAlignmentTypes.workspaceId, input.workspaceId))).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Alignment type not found" });
      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_type.update", entityType: "alignment_type", entityId: input.id, newValue: updates });
      return updated;
    }),
});

// ============================================================================
// Attributes — Row definitions
// ============================================================================

const attributesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), matrixVersionId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(omAlignmentAttributes)
        .where(and(eq(omAlignmentAttributes.matrixVersionId, input.matrixVersionId), eq(omAlignmentAttributes.workspaceId, input.workspaceId)))
        .orderBy(asc(omAlignmentAttributes.sortOrder));
    }),

  create: governedProcedure
    .input(z.object({ workspaceId: z.number(), matrixVersionId: z.number(), code: z.string().min(1).max(100), label: z.string().min(1).max(200), description: z.string().optional(), sortOrder: z.number().default(0) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await validateAlignmentMatrixVersionRef(input.workspaceId, input.matrixVersionId);
      const [created] = await db.insert(omAlignmentAttributes).values({
        workspaceId: input.workspaceId, matrixVersionId: input.matrixVersionId, code: input.code, label: input.label, description: input.description, sortOrder: input.sortOrder, isActive: true, createdBy: ctx.user.id,
      }).returning();
      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_attribute.create", entityType: "alignment_attribute", entityId: created.id, newValue: { code: input.code, label: input.label } });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "om", actorId: ctx.user.id, action: "alignment_attribute.create", targetType: "alignment_attribute", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({ workspaceId: z.number(), id: z.number(), label: z.string().min(1).max(200).optional(), description: z.string().nullable().optional(), sortOrder: z.number().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.label !== undefined) updates.label = input.label;
      if (input.description !== undefined) updates.description = input.description;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (input.isActive !== undefined) updates.isActive = input.isActive;
      const [updated] = await db.update(omAlignmentAttributes).set(updates).where(and(eq(omAlignmentAttributes.id, input.id), eq(omAlignmentAttributes.workspaceId, input.workspaceId))).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Alignment attribute not found" });
      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_attribute.update", entityType: "alignment_attribute", entityId: input.id, newValue: updates });
      return updated;
    }),
});

// ============================================================================
// Cells — Type × Attribute intersection values
// ============================================================================

const cellsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), matrixVersionId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(omAlignmentCells)
        .where(and(eq(omAlignmentCells.matrixVersionId, input.matrixVersionId), eq(omAlignmentCells.workspaceId, input.workspaceId)));
    }),

  upsert: governedProcedure
    .input(z.object({ workspaceId: z.number(), matrixVersionId: z.number(), typeId: z.number(), attributeId: z.number(), valueText: z.string().min(1), valueCode: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await validateAlignmentTypeRef(input.workspaceId, input.matrixVersionId, input.typeId);
      await validateAlignmentAttributeRef(input.workspaceId, input.matrixVersionId, input.attributeId);
      // Check if cell exists
      const [existing] = await db.select().from(omAlignmentCells)
        .where(and(eq(omAlignmentCells.matrixVersionId, input.matrixVersionId), eq(omAlignmentCells.typeId, input.typeId), eq(omAlignmentCells.attributeId, input.attributeId))).limit(1);
      if (existing) {
        const [updated] = await db.update(omAlignmentCells)
          .set({ valueText: input.valueText, valueCode: input.valueCode, updatedAt: new Date() })
          .where(eq(omAlignmentCells.id, existing.id)).returning();
        await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_cell.upsert", entityType: "alignment_cell", entityId: existing.id, previousValue: { valueText: existing.valueText }, newValue: { valueText: input.valueText } });
        return updated;
      }
      const [created] = await db.insert(omAlignmentCells).values({
        workspaceId: input.workspaceId, matrixVersionId: input.matrixVersionId, typeId: input.typeId, attributeId: input.attributeId, valueText: input.valueText, valueCode: input.valueCode, createdBy: ctx.user.id,
      }).returning();
      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_cell.upsert", entityType: "alignment_cell", entityId: created.id, newValue: { valueText: input.valueText } });
      return created;
    }),

  bulkUpsert: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      matrixVersionId: z.number(),
      cells: z.array(z.object({ typeId: z.number(), attributeId: z.number(), valueText: z.string().min(1), valueCode: z.string().optional() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let upserted = 0;
      for (const cell of input.cells) {
        const [existing] = await db.select().from(omAlignmentCells)
          .where(and(eq(omAlignmentCells.matrixVersionId, input.matrixVersionId), eq(omAlignmentCells.typeId, cell.typeId), eq(omAlignmentCells.attributeId, cell.attributeId))).limit(1);
        if (existing) {
          await db.update(omAlignmentCells).set({ valueText: cell.valueText, valueCode: cell.valueCode, updatedAt: new Date() }).where(eq(omAlignmentCells.id, existing.id));
        } else {
          await db.insert(omAlignmentCells).values({ workspaceId: input.workspaceId, matrixVersionId: input.matrixVersionId, typeId: cell.typeId, attributeId: cell.attributeId, valueText: cell.valueText, valueCode: cell.valueCode, createdBy: ctx.user.id });
        }
        upserted++;
      }
      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_cell.bulk_upsert", entityType: "alignment_cell", newValue: { count: upserted } });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "om", actorId: ctx.user.id, action: "alignment_cell.bulk_upsert", targetType: "alignment_cell", metadata: { count: upserted } });
      return { upserted };
    }),
});

// ============================================================================
// Wizard — Bootstrap + selection management
// ============================================================================

const wizardRouter = router({
  bootstrap: protectedProcedure
    .input(z.object({ workspaceId: z.number(), structureVersionId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Get active matrix version (try workspace-scoped, fall back to global ws=0)
      let [activeVersion] = await db.select().from(omAlignmentMatrixVersions)
        .where(and(eq(omAlignmentMatrixVersions.workspaceId, input.workspaceId), eq(omAlignmentMatrixVersions.status, "active")))
        .limit(1);
      if (!activeVersion) {
        [activeVersion] = await db.select().from(omAlignmentMatrixVersions)
          .where(and(eq(omAlignmentMatrixVersions.workspaceId, 0), eq(omAlignmentMatrixVersions.status, "active")))
          .limit(1);
      }
      if (!activeVersion) {
        return { activeMatrixVersion: null, types: [], attributes: [], cellsByType: {}, optionsByAttribute: {}, selectedTypeId: null, selections: [] };
      }

      const types = await db.select().from(omAlignmentTypes)
        .where(and(eq(omAlignmentTypes.matrixVersionId, activeVersion.id), eq(omAlignmentTypes.isActive, true)))
        .orderBy(asc(omAlignmentTypes.sortOrder));

      const attributes = await db.select().from(omAlignmentAttributes)
        .where(and(eq(omAlignmentAttributes.matrixVersionId, activeVersion.id), eq(omAlignmentAttributes.isActive, true)))
        .orderBy(asc(omAlignmentAttributes.sortOrder));

      const cells = await db.select().from(omAlignmentCells)
        .where(eq(omAlignmentCells.matrixVersionId, activeVersion.id));

      // Build cellsByType and optionsByAttribute
      const typeCodeMap: Record<number, string> = {};
      for (const t of types) typeCodeMap[t.id] = t.code;
      const attrCodeMap: Record<number, string> = {};
      for (const a of attributes) attrCodeMap[a.id] = a.code;

      const cellsByType: Record<string, Record<string, { valueText: string; valueCode: string | null }>> = {};
      const optionsByAttribute: Record<string, Array<{ valueText: string; valueCode: string | null }>> = {};

      for (const t of types) cellsByType[t.code] = {};
      for (const a of attributes) optionsByAttribute[a.code] = [];

      for (const c of cells) {
        const typeCode = typeCodeMap[c.typeId];
        const attrCode = attrCodeMap[c.attributeId];
        if (typeCode && attrCode) {
          cellsByType[typeCode][attrCode] = { valueText: c.valueText, valueCode: c.valueCode };
        }
      }

      // Build unique options per attribute
      for (const a of attributes) {
        const seen = new Set<string>();
        for (const c of cells) {
          if (c.attributeId === a.id && !seen.has(c.valueText)) {
            seen.add(c.valueText);
            optionsByAttribute[a.code].push({ valueText: c.valueText, valueCode: c.valueCode });
          }
        }
      }

      // Get selections if structureVersionId provided
      let selectedTypeId: number | null = null;
      let selections: Array<{ attributeId: number; attributeCode: string; selectedValueText: string; source: string }> = [];

      if (input.structureVersionId) {
        const [sv] = await db.select({ selectedStructureTypeId: omStructureVersions.selectedStructureTypeId })
          .from(omStructureVersions).where(eq(omStructureVersions.id, input.structureVersionId)).limit(1);
        selectedTypeId = sv?.selectedStructureTypeId ?? null;

        const selRows = await db.select().from(omStructureAlignmentSelections)
          .where(eq(omStructureAlignmentSelections.structureVersionId, input.structureVersionId));
        selections = selRows.map(s => ({
          attributeId: s.attributeId,
          attributeCode: attrCodeMap[s.attributeId] ?? "",
          selectedValueText: s.selectedValueText,
          source: s.source,
        }));
      }

      return {
        activeMatrixVersion: { id: activeVersion.id, name: activeVersion.name, status: activeVersion.status },
        types: types.map(t => ({ id: t.id, code: t.code, label: t.label, sortOrder: t.sortOrder })),
        attributes: attributes.map(a => ({ id: a.id, code: a.code, label: a.label, sortOrder: a.sortOrder })),
        cellsByType,
        optionsByAttribute,
        selectedTypeId,
        selections,
      };
    }),

  applyTypeDefaults: governedProcedure
    .input(z.object({ workspaceId: z.number(), structureVersionId: z.number(), selectedTypeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await requireStructureVersionDraft(input.workspaceId, input.structureVersionId);

      // Resolve active matrix version (workspace-scoped or global)
      let [activeVersion] = await db.select().from(omAlignmentMatrixVersions)
        .where(and(eq(omAlignmentMatrixVersions.workspaceId, input.workspaceId), eq(omAlignmentMatrixVersions.status, "active"))).limit(1);
      if (!activeVersion) {
        [activeVersion] = await db.select().from(omAlignmentMatrixVersions)
          .where(and(eq(omAlignmentMatrixVersions.workspaceId, 0), eq(omAlignmentMatrixVersions.status, "active"))).limit(1);
      }
      if (!activeVersion) throw new TRPCError({ code: "BAD_REQUEST", message: "No active alignment matrix version" });

      // Validate type exists
      const [selectedType] = await db.select().from(omAlignmentTypes)
        .where(and(eq(omAlignmentTypes.id, input.selectedTypeId), eq(omAlignmentTypes.matrixVersionId, activeVersion.id))).limit(1);
      if (!selectedType) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected type not found in active matrix" });

      // Write type + matrix ref onto structure version
      await db.update(omStructureVersions).set({
        alignmentMatrixVersionId: activeVersion.id,
        selectedStructureTypeId: input.selectedTypeId,
        updatedAt: new Date(),
      }).where(eq(omStructureVersions.id, input.structureVersionId));

      // Delete existing selections for this version
      await db.delete(omStructureAlignmentSelections)
        .where(eq(omStructureAlignmentSelections.structureVersionId, input.structureVersionId));

      // Get all active attributes
      const attributes = await db.select().from(omAlignmentAttributes)
        .where(and(eq(omAlignmentAttributes.matrixVersionId, activeVersion.id), eq(omAlignmentAttributes.isActive, true)));

      // Get cells for selected type
      const cells = await db.select().from(omAlignmentCells)
        .where(and(eq(omAlignmentCells.matrixVersionId, activeVersion.id), eq(omAlignmentCells.typeId, input.selectedTypeId)));

      const cellMap: Record<number, string> = {};
      for (const c of cells) cellMap[c.attributeId] = c.valueText;

      // Insert one selection per attribute
      for (const attr of attributes) {
        const valueText = cellMap[attr.id];
        if (!valueText) continue;
        await db.insert(omStructureAlignmentSelections).values({
          workspaceId: input.workspaceId,
          structureVersionId: input.structureVersionId,
          matrixVersionId: activeVersion.id,
          selectedTypeId: input.selectedTypeId,
          attributeId: attr.id,
          selectedValueText: valueText,
          source: "matrix_default",
          createdBy: ctx.user.id,
        });
      }

      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_selection.apply_defaults", entityType: "alignment_selection", entityId: input.structureVersionId, newValue: { selectedTypeId: input.selectedTypeId, typeCode: selectedType.code } });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "om", actorId: ctx.user.id, action: "alignment_selection.apply_defaults", targetType: "structure_version", targetId: input.structureVersionId });

      return { applied: attributes.length, typeCode: selectedType.code };
    }),

  setOverride: governedProcedure
    .input(z.object({ workspaceId: z.number(), structureVersionId: z.number(), attributeId: z.number(), selectedValueText: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await requireStructureVersionDraft(input.workspaceId, input.structureVersionId);

      // Get the version's matrix ref
      const [sv] = await db.select({ matrixVersionId: omStructureVersions.alignmentMatrixVersionId, selectedTypeId: omStructureVersions.selectedStructureTypeId })
        .from(omStructureVersions).where(eq(omStructureVersions.id, input.structureVersionId)).limit(1);
      if (!sv?.matrixVersionId) throw new TRPCError({ code: "BAD_REQUEST", message: "No matrix version linked to this structure version" });

      await requireSelectionValueAllowed(input.workspaceId, sv.matrixVersionId, input.attributeId, input.selectedValueText);

      // Upsert selection
      const [existing] = await db.select().from(omStructureAlignmentSelections)
        .where(and(eq(omStructureAlignmentSelections.structureVersionId, input.structureVersionId), eq(omStructureAlignmentSelections.attributeId, input.attributeId))).limit(1);

      if (existing) {
        await db.update(omStructureAlignmentSelections)
          .set({ selectedValueText: input.selectedValueText, source: "manual_override", updatedBy: ctx.user.id, updatedAt: new Date() })
          .where(eq(omStructureAlignmentSelections.id, existing.id));
      } else {
        await db.insert(omStructureAlignmentSelections).values({
          workspaceId: input.workspaceId, structureVersionId: input.structureVersionId, matrixVersionId: sv.matrixVersionId, selectedTypeId: sv.selectedTypeId!, attributeId: input.attributeId, selectedValueText: input.selectedValueText, source: "manual_override", createdBy: ctx.user.id,
        });
      }

      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_selection.override", entityType: "alignment_selection", entityId: input.structureVersionId, newValue: { attributeId: input.attributeId, selectedValueText: input.selectedValueText } });
      return { ok: true };
    }),

  clearOverride: governedProcedure
    .input(z.object({ workspaceId: z.number(), structureVersionId: z.number(), attributeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await requireStructureVersionDraft(input.workspaceId, input.structureVersionId);

      const [sv] = await db.select({ matrixVersionId: omStructureVersions.alignmentMatrixVersionId, selectedTypeId: omStructureVersions.selectedStructureTypeId })
        .from(omStructureVersions).where(eq(omStructureVersions.id, input.structureVersionId)).limit(1);
      if (!sv?.matrixVersionId || !sv.selectedTypeId) throw new TRPCError({ code: "BAD_REQUEST", message: "No matrix/type linked" });

      // Get default value from matrix
      const [cell] = await db.select().from(omAlignmentCells)
        .where(and(eq(omAlignmentCells.matrixVersionId, sv.matrixVersionId), eq(omAlignmentCells.typeId, sv.selectedTypeId), eq(omAlignmentCells.attributeId, input.attributeId))).limit(1);

      if (cell) {
        await db.update(omStructureAlignmentSelections)
          .set({ selectedValueText: cell.valueText, source: "matrix_default", updatedBy: ctx.user.id, updatedAt: new Date() })
          .where(and(eq(omStructureAlignmentSelections.structureVersionId, input.structureVersionId), eq(omStructureAlignmentSelections.attributeId, input.attributeId)));
      }

      await logOmAudit({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "alignment_selection.clear_override", entityType: "alignment_selection", entityId: input.structureVersionId, newValue: { attributeId: input.attributeId } });
      return { ok: true };
    }),

  listSelections: protectedProcedure
    .input(z.object({ workspaceId: z.number(), structureVersionId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(omStructureAlignmentSelections)
        .where(and(eq(omStructureAlignmentSelections.structureVersionId, input.structureVersionId), eq(omStructureAlignmentSelections.workspaceId, input.workspaceId)));
    }),
});

// ============================================================================
// Composed Alignment Matrix Router
// ============================================================================

export const alignmentMatrixRouter = router({
  versions: versionsRouter,
  types: typesRouter,
  attributes: attributesRouter,
  cells: cellsRouter,
  wizard: wizardRouter,
});
