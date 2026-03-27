/**
 * PMT Engine — Webhooks Router
 * CRUD + test + fireWebhook utility
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { pmWebhooks } from "./integrations-schema";
import { getShellWorkspaceId } from "./pm-shell";

export const webhooksRouter = router({
  list: protectedProcedure
    
    .query(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmWebhooks)
        .where(eq(pmWebhooks.workspaceId, wsId))
        .orderBy(desc(pmWebhooks.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      url: z.string().url(),
      events: z.array(z.string()),
      secret: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmWebhooks).values({
        workspaceId: wsId,
        name: input.name,
        url: input.url,
        events: input.events,
        secret: input.secret,
      }).returning();
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      url: z.string().url().optional(),
      events: z.array(z.string()).optional(),
      secret: z.string().max(255).optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, ...updates } = input;
      await db.update(pmWebhooks).set(updates)
        .where(and(eq(pmWebhooks.id, id), eq(pmWebhooks.workspaceId, wsId)));
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmWebhooks)
        .where(and(eq(pmWebhooks.id, input.id), eq(pmWebhooks.workspaceId, wsId)));
      return { success: true };
    }),

  test: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await getShellWorkspaceId(ctx.user.id);
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmWebhooks)
        .where(and(eq(pmWebhooks.id, input.id), eq(pmWebhooks.workspaceId, wsId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      const webhook = rows[0];
      try {
        const res = await fetch(webhook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "test", timestamp: new Date().toISOString() }),
        });
        return { success: true, status: res.status };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: message };
      }
    }),
});

/** Fire webhook for a given event to all matching active webhooks */
export async function fireWebhook(workspaceId: number, event: string, payload: Record<string, unknown>) {
  const db = getDb();
  if (!db) return;
  const hooks = await db.select().from(pmWebhooks)
    .where(and(eq(pmWebhooks.workspaceId, workspaceId), eq(pmWebhooks.active, true)));
  for (const hook of hooks) {
    const events = hook.events as string[];
    if (!events.includes(event) && !events.includes("*")) continue;
    try {
      await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
      });
    } catch {
      // Fire-and-forget; swallow errors
    }
  }
}
