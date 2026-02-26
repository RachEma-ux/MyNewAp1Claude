/**
 * PMT Engine — Attachments Router
 * CRUD for file attachments on work items
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { pmAttachments } from "./attachments-schema";

export const attachmentsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), workItemId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmAttachments)
        .where(and(
          eq(pmAttachments.workItemId, input.workItemId),
          eq(pmAttachments.workspaceId, input.workspaceId),
        ))
        .orderBy(desc(pmAttachments.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      workItemId: z.number(),
      fileName: z.string().min(1).max(500),
      fileSize: z.number().min(0),
      mimeType: z.string().optional(),
      storagePath: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(pmAttachments).values({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        storagePath: input.storagePath,
        uploadedBy: ctx.user.id,
      }).returning();

      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "pmt",
        actorId: ctx.user.id,
        action: "attachment.create",
        targetType: "attachment",
        targetId: created.id,
        metadata: { workItemId: input.workItemId, fileName: input.fileName },
      });
      return created;
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.delete(pmAttachments)
        .where(and(eq(pmAttachments.id, input.id), eq(pmAttachments.workspaceId, input.workspaceId)));

      await logActivity({
        workspaceId: input.workspaceId,
        moduleKey: "pmt",
        actorId: ctx.user.id,
        action: "attachment.delete",
        targetType: "attachment",
        targetId: input.id,
      });
      return { success: true };
    }),
});
