/**
 * PMT Engine — Versions Router
 * CRUD for project version / release tracking
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmVersions } from "./versions-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const versionsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmVersions)
        .where(and(
          eq(pmVersions.workspaceId, wsId),
          eq(pmVersions.projectId, input.projectId),
        ))
        .orderBy(desc(pmVersions.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmVersions)
        .where(and(eq(pmVersions.id, input.id), eq(pmVersions.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      status: z.enum(["open", "locked", "closed"]).optional(),
      startDate: z.string().optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmVersions).values({
        workspaceId: wsId,
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        status: input.status,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      status: z.enum(["open", "locked", "closed"]).optional(),
      startDate: z.string().optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, startDate, dueDate, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates };
      if (startDate) setValues.startDate = new Date(startDate);
      if (dueDate) setValues.dueDate = new Date(dueDate);
      await db.update(pmVersions).set(setValues)
        .where(and(eq(pmVersions.id, id), eq(pmVersions.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmVersions)
        .where(and(eq(pmVersions.id, input.id), eq(pmVersions.workspaceId, wsId)));
      return { success: true };
    }),
});
