/**
 * PS Feedback — Repository + Service
 *
 * Captures execution feedback after project delivery,
 * linked to both PS project and (optional) PM project.
 */

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  psFeedback,
  type PsFeedback,
  type InsertPsFeedback,
} from "../../drizzle/tables/ps";

// ── Validation Schemas ──────────────────────────────────────────────────

export const createFeedbackSchema = z.object({
  psProjectId: z.number().int().positive(),
  pmProjectId: z.number().int().positive().optional(),
  outcome: z.enum(["success", "partial", "failed", "cancelled"]),
  driftFlag: z.boolean().default(false),
  notes: z.string().optional(),
});

export const listFeedbackSchema = z.object({
  psProjectId: z.number().int().positive().optional(),
}).optional().default({});

export const getFeedbackSchema = z.object({
  id: z.number().int().positive(),
});

// ── Repository ──────────────────────────────────────────────────────────

export async function createFeedback(data: InsertPsFeedback): Promise<PsFeedback> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psFeedback).values({
    ...data,
    createdAt: new Date(),
  }).returning();
  return created;
}

export async function getFeedbackById(id: number): Promise<PsFeedback | null> {
  const db = getDb();
  if (!db) return null;
  const [found] = await db.select().from(psFeedback)
    .where(eq(psFeedback.id, id))
    .limit(1);
  return found ?? null;
}

export async function listFeedbackByProject(psProjectId?: number): Promise<PsFeedback[]> {
  const db = getDb();
  if (!db) return [];
  if (psProjectId) {
    return db.select().from(psFeedback)
      .where(eq(psFeedback.psProjectId, psProjectId))
      .orderBy(desc(psFeedback.createdAt));
  }
  return db.select().from(psFeedback)
    .orderBy(desc(psFeedback.createdAt));
}

// ── Service ─────────────────────────────────────────────────────────────

export async function submitFeedback(
  input: z.infer<typeof createFeedbackSchema>,
): Promise<PsFeedback> {
  return createFeedback({
    psProjectId: input.psProjectId,
    pmProjectId: input.pmProjectId ?? null,
    outcome: input.outcome,
    driftFlag: input.driftFlag ? 1 : 0,
    notes: input.notes ?? null,
  });
}
