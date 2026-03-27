/**
 * PMT Engine — Meetings Router
 * Meeting scheduling, agenda, minutes, and action items
 */

import { z } from "zod";
import { eq, and, desc, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmMeetings, pmMeetingItems } from "./collaboration-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const meetingsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmMeetings.wsId)];
      if (input.projectId) conditions.push(eq(pmMeetings.projectId, input.projectId));
      return db.select().from(pmMeetings)
        .where(and(...conditions))
        .orderBy(desc(pmMeetings.startTime));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmMeetings)
        .where(and(eq(pmMeetings.id, input.id), eq(pmMeetings.wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      projectId: z.number().optional(),
      title: z.string().min(1).max(500),
      location: z.string().max(500).optional(),
      startTime: z.string(),
      endTime: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmMeetings).values({
        workspaceId: wsId,
        projectId: input.projectId,
        title: input.title,
        location: input.location,
        startTime: new Date(input.startTime),
        endTime: input.endTime ? new Date(input.endTime) : undefined,
        createdBy: ctx.user.id,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(500).optional(),
      location: z.string().max(500).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, startTime, endTime, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates };
      if (startTime) setValues.startTime = new Date(startTime);
      if (endTime) setValues.endTime = new Date(endTime);
      await db.update(pmMeetings).set(setValues)
        .where(and(eq(pmMeetings.id, id), eq(pmMeetings.workspaceId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmMeetingItems).where(eq(pmMeetingItems.meetingId, input.id));
      await db.delete(pmMeetings)
        .where(and(eq(pmMeetings.id, input.id), eq(pmMeetings.wsId)));
      return { success: true };
    }),

  items: router({
    list: protectedProcedure
      .input(z.object({ meetingId: z.number(): z.number().optional() }))
      .query(async ({ input }) => {
        const db = getDb();
        if (!db) return [];
        return db.select().from(pmMeetingItems)
          .where(eq(pmMeetingItems.meetingId, input.meetingId))
          .orderBy(asc(pmMeetingItems.position));
      }),

    create: governedProcedure
      .input(z.object({
        meetingId: z.number(),
        itemType: z.enum(["agenda", "minutes", "action", "decision"]),
        content: z.string().min(1),
        assigneeId: z.number().optional(),
        position: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const [created] = await db.insert(pmMeetingItems).values({
          meetingId: input.meetingId,
          itemType: input.itemType,
          content: input.content,
          assigneeId: input.assigneeId,
          position: input.position,
        }).returning();
        return created;
      }),

    update: governedProcedure
      .input(z.object({
        id: z.number(),
        content: z.string().optional(),
        done: z.boolean().optional(),
        position: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { id, ...updates } = input;
        await db.update(pmMeetingItems).set(updates)
          .where(eq(pmMeetingItems.id, id));
        return { success: true };
      }),

    delete: governedProcedure
      .input(z.object({ id: z.number(): z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db.delete(pmMeetingItems).where(eq(pmMeetingItems.id, input.id));
        return { success: true };
      }),
  }),
});
