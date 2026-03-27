/**
 * PMT Engine — Custom Fields Router
 * CRUD for custom field definitions and per-work-item values
 */

import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmCustomFields, pmCustomValues } from "./custom-fields-schema";
import { getShellWorkspaceId } from "./pm-shell";

const fieldsRouter = router({
  list: protectedProcedure
    
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmCustomFields)
        .where(eq(pmCustomFields.wsId))
        .orderBy(asc(pmCustomFields.position));
    }),

  create: governedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      fieldType: z.enum(["text", "number", "date", "list", "user", "bool"]),
      options: z.array(z.string()).optional(),
      required: z.boolean().optional(),
      position: z.number(),
      helpText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmCustomFields).values({
        workspaceId: wsId,
        name: input.name,
        fieldType: input.fieldType,
        options: input.options,
        required: input.required,
        position: input.position,
        helpText: input.helpText,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      fieldType: z.enum(["text", "number", "date", "list", "user", "bool"]).optional(),
      options: z.array(z.string()).optional(),
      required: z.boolean().optional(),
      position: z.number().optional(),
      helpText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmCustomFields).set(updates)
        .where(and(eq(pmCustomFields.id, id), eq(pmCustomFields.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmCustomValues).where(eq(pmCustomValues.fieldId, input.id));
      await db.delete(pmCustomFields)
        .where(and(eq(pmCustomFields.id, input.id), eq(pmCustomFields.wsId)));
      return { success: true };
    }),
});

const valuesRouter = router({
  list: protectedProcedure
    .input(z.object({ workItemId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmCustomValues)
        .where(and(
          eq(pmCustomValues.workItemId, input.workItemId),
          eq(pmCustomValues.wsId),
        ));
    }),

  set: governedProcedure
    .input(z.object({
      workItemId: z.number(),
      fieldId: z.number(),
      value: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Upsert: delete existing then insert
      await db.delete(pmCustomValues).where(and(
        eq(pmCustomValues.workItemId, input.workItemId),
        eq(pmCustomValues.fieldId, input.fieldId),
      ));
      const [created] = await db.insert(pmCustomValues).values({
        workspaceId: wsId,
        workItemId: input.workItemId,
        fieldId: input.fieldId,
        value: input.value,
      }).returning();
      return created;
    }),
});

export const customFieldsRouter = router({
  fields: fieldsRouter,
  values: valuesRouter,
});
