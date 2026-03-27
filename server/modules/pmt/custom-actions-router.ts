/**
 * PMT Engine — Custom Actions Router
 * CRUD + execute custom actions on tasks
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmCustomActions } from "./integrations-schema";
import { tasks } from "./schema";
import { getShellWorkspaceId } from "./pm-shell";

export const customActionsRouter = router({
  list: protectedProcedure
    
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmCustomActions)
        .where(eq(pmCustomActions.workspaceId, wsId))
        .orderBy(pmCustomActions.position);
    }),

  create: governedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      conditions: z.record(z.string(), z.unknown()),
      changes: z.record(z.string(), z.unknown()),
      position: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmCustomActions).values({
        workspaceId: wsId,
        name: input.name,
        description: input.description,
        conditions: input.conditions,
        changes: input.changes,
        position: input.position,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      conditions: z.record(z.string(), z.unknown()).optional(),
      changes: z.record(z.string(), z.unknown()).optional(),
      position: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmCustomActions).set(updates)
        .where(and(eq(pmCustomActions.id, id), eq(pmCustomActions.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmCustomActions)
        .where(and(eq(pmCustomActions.id, input.id), eq(pmCustomActions.workspaceId, wsId)));
      return { success: true };
    }),

  execute: governedProcedure
    .input(z.object({ id: z.number(), taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmCustomActions)
        .where(and(eq(pmCustomActions.id, input.id), eq(pmCustomActions.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Custom action not found" });
      const changes = rows[0].changes as Record<string, unknown>;
      const setValues: Record<string, unknown> = { ...changes, updatedAt: new Date() };
      if (changes.status === "done") setValues.completedAt = new Date();
      await db.update(tasks).set(setValues)
        .where(and(eq(tasks.id, input.taskId), eq(tasks.workspaceId, wsId)));
      return { success: true };
    }),
});
