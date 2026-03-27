/**
 * PMT Engine — Git References Router
 * Link git branches, PRs, commits to work items
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmGitReferences } from "./integrations-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const gitRouter = router({
  list: protectedProcedure
    .input(z.object({ workItemId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(pmGitReferences.workspaceId, wsId)];
      if (input.workItemId) conditions.push(eq(pmGitReferences.workItemId, input.workItemId));
      return db.select().from(pmGitReferences)
        .where(and(...conditions))
        .orderBy(desc(pmGitReferences.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      workItemId: z.number(),
      provider: z.string().max(20),
      refType: z.string().max(20),
      refId: z.string().max(255),
      refUrl: z.string(),
      refTitle: z.string().optional(),
      refState: z.string().max(30).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmGitReferences).values({
        workspaceId: wsId,
        workItemId: input.workItemId,
        provider: input.provider,
        refType: input.refType,
        refId: input.refId,
        refUrl: input.refUrl,
        refTitle: input.refTitle,
        refState: input.refState,
      }).returning();
      return created;
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmGitReferences)
        .where(and(eq(pmGitReferences.id, input.id), eq(pmGitReferences.workspaceId, wsId)));
      return { success: true };
    }),
});
