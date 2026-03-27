/**
 * PMT Engine — Attachments Router
 * CRUD for file attachments on work items
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmAttachments } from "./attachments-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const attachmentsRouter = router({
  list: protectedProcedure
    .input(z.object({ workItemId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmAttachments)
        .where(and(
          eq(pmAttachments.workItemId, input.workItemId),
          eq(pmAttachments.wsId),
        ))
        .orderBy(desc(pmAttachments.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      workItemId: z.number(),
      fileName: z.string().min(1).max(500),
      fileSize: z.number().min(0),
      mimeType: z.string().optional(),
      storagePath: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [created] = await db.insert(pmAttachments).values({
        workspaceId: wsId,
        workItemId: input.workItemId,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        storagePath: input.storagePath,
        uploadedBy: ctx.user.id,
      }).returning();

      return created;
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(): z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.delete(pmAttachments)
        .where(and(eq(pmAttachments.id, input.id), eq(pmAttachments.wsId)));

      return { success: true };
    }),
});
