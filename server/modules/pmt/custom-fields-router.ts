/**
 * PMT Engine — Custom Fields Router
 * CRUD for custom field definitions and per-work-item values
 */

import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { pmCustomFields, pmCustomValues } from "./custom-fields-schema";

const fieldsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmCustomFields)
        .where(eq(pmCustomFields.workspaceId, input.workspaceId))
        .orderBy(asc(pmCustomFields.position));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      fieldType: z.enum(["text", "number", "date", "list", "user", "bool"]),
      options: z.array(z.string()).optional(),
      required: z.boolean().optional(),
      position: z.number(),
      helpText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmCustomFields).values({
        workspaceId: input.workspaceId,
        name: input.name,
        fieldType: input.fieldType,
        options: input.options,
        required: input.required,
        position: input.position,
        helpText: input.helpText,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "customField.create", targetType: "custom_field", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      name: z.string().min(1).max(255).optional(),
      fieldType: z.enum(["text", "number", "date", "list", "user", "bool"]).optional(),
      options: z.array(z.string()).optional(),
      required: z.boolean().optional(),
      position: z.number().optional(),
      helpText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(pmCustomFields).set(updates)
        .where(and(eq(pmCustomFields.id, id), eq(pmCustomFields.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "customField.update", targetType: "custom_field", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmCustomValues).where(eq(pmCustomValues.fieldId, input.id));
      await db.delete(pmCustomFields)
        .where(and(eq(pmCustomFields.id, input.id), eq(pmCustomFields.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "customField.delete", targetType: "custom_field", targetId: input.id });
      return { success: true };
    }),
});

const valuesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), workItemId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmCustomValues)
        .where(and(
          eq(pmCustomValues.workItemId, input.workItemId),
          eq(pmCustomValues.workspaceId, input.workspaceId),
        ));
    }),

  set: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      workItemId: z.number(),
      fieldId: z.number(),
      value: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Upsert: delete existing then insert
      await db.delete(pmCustomValues).where(and(
        eq(pmCustomValues.workItemId, input.workItemId),
        eq(pmCustomValues.fieldId, input.fieldId),
      ));
      const [created] = await db.insert(pmCustomValues).values({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        fieldId: input.fieldId,
        value: input.value,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "customValue.set", targetType: "custom_value", targetId: created.id, metadata: { workItemId: input.workItemId, fieldId: input.fieldId } });
      return created;
    }),
});

export const customFieldsRouter = router({
  fields: fieldsRouter,
  values: valuesRouter,
});
