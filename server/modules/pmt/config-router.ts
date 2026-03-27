/**
 * PMT Engine — Config Router
 * CRUD for statuses, types, and workflow transitions
 */

import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmStatuses, pmTypes, pmWorkflows } from "./config-schema";
import { getShellWorkspaceId } from "./pm-shell";

const statusesRouter = router({
  list: protectedProcedure
    
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmStatuses)
        .where(eq(pmStatuses.wsId))
        .orderBy(asc(pmStatuses.position));
    }),

  create: governedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      color: z.string().min(4).max(7),
      isClosed: z.boolean().optional(),
      isDefault: z.boolean().optional(),
      position: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmStatuses).values({
        workspaceId: wsId,
        name: input.name,
        color: input.color,
        isClosed: input.isClosed,
        isDefault: input.isDefault,
        position: input.position,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100).optional(),
      color: z.string().min(4).max(7).optional(),
      isClosed: z.boolean().optional(),
      isDefault: z.boolean().optional(),
      position: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmStatuses).set(updates)
        .where(and(eq(pmStatuses.id, id), eq(pmStatuses.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmStatuses)
        .where(and(eq(pmStatuses.id, input.id), eq(pmStatuses.wsId)));
      return { success: true };
    }),
});

const typesRouter = router({
  list: protectedProcedure
    
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmTypes)
        .where(eq(pmTypes.wsId))
        .orderBy(asc(pmTypes.position));
    }),

  create: governedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      color: z.string().max(7).optional(),
      icon: z.string().max(50).optional(),
      isDefault: z.boolean().optional(),
      isMilestone: z.boolean().optional(),
      position: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmTypes).values({
        workspaceId: wsId,
        name: input.name,
        color: input.color,
        icon: input.icon,
        isDefault: input.isDefault,
        isMilestone: input.isMilestone,
        position: input.position,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100).optional(),
      color: z.string().max(7).optional(),
      icon: z.string().max(50).optional(),
      isDefault: z.boolean().optional(),
      isMilestone: z.boolean().optional(),
      position: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmTypes).set(updates)
        .where(and(eq(pmTypes.id, id), eq(pmTypes.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmTypes)
        .where(and(eq(pmTypes.id, input.id), eq(pmTypes.wsId)));
      return { success: true };
    }),
});

const workflowsRouter = router({
  list: protectedProcedure
    .input(z.object({ typeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmWorkflows.wsId)];
      if (input.typeId) conditions.push(eq(pmWorkflows.typeId, input.typeId));
      return db.select().from(pmWorkflows).where(and(...conditions));
    }),

  create: governedProcedure
    .input(z.object({
      typeId: z.number(),
      fromStatusId: z.number(),
      toStatusId: z.number(),
      roleId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmWorkflows).values({
        workspaceId: wsId,
        typeId: input.typeId,
        fromStatusId: input.fromStatusId,
        toStatusId: input.toStatusId,
        roleId: input.roleId,
      }).returning();
      return created;
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmWorkflows)
        .where(and(eq(pmWorkflows.id, input.id), eq(pmWorkflows.wsId)));
      return { success: true };
    }),
});

export const configRouter = router({
  statuses: statusesRouter,
  types: typesRouter,
  workflows: workflowsRouter,
});
