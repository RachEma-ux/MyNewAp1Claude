/**
 * PMT Engine — Webhooks Router
 * CRUD + test + fireWebhook utility
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { pmWebhooks } from "./integrations-schema";

export const webhooksRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmWebhooks)
        .where(eq(pmWebhooks.workspaceId, input.workspaceId))
        .orderBy(desc(pmWebhooks.createdAt));
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      url: z.string().url(),
      events: z.array(z.string()),
      secret: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmWebhooks).values({
        workspaceId: input.workspaceId,
        name: input.name,
        url: input.url,
        events: input.events,
        secret: input.secret,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "webhook.create", targetType: "webhook", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      name: z.string().min(1).max(255).optional(),
      url: z.string().url().optional(),
      events: z.array(z.string()).optional(),
      secret: z.string().max(255).optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(pmWebhooks).set(updates)
        .where(and(eq(pmWebhooks.id, id), eq(pmWebhooks.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "webhook.update", targetType: "webhook", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmWebhooks)
        .where(and(eq(pmWebhooks.id, input.id), eq(pmWebhooks.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "webhook.delete", targetType: "webhook", targetId: input.id });
      return { success: true };
    }),

  test: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmWebhooks)
        .where(and(eq(pmWebhooks.id, input.id), eq(pmWebhooks.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      const webhook = rows[0];
      try {
        const res = await fetch(webhook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "test", workspaceId: input.workspaceId, timestamp: new Date().toISOString() }),
        });
        await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "webhook.test", targetType: "webhook", targetId: input.id });
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
        body: JSON.stringify({ event, workspaceId, payload, timestamp: new Date().toISOString() }),
      });
    } catch {
      // Fire-and-forget; swallow errors
    }
  }
}
