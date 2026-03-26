/**
 * PS Module — Override Tracking
 *
 * Records when users override the matrix recommendation.
 * Provides analytics: override rate, frequent overrides,
 * override-to-scope patterns for feedback into matrix tuning.
 */

import { eq, and, desc, count, sql } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  psWizardOverrides,
  psWizardRuns,
  type PsWizardOverride,
  type InsertPsWizardOverride,
} from "../../drizzle/tables/ps";

// ── Types ────────────────────────────────────────────────────────────

export interface OverrideInput {
  wizardRunId?: number;
  recommendedScopeCode: string;
  overriddenScopeCode: string;
  reason: string;
  recommendedConfidence?: number;
  matrixVersion?: string;
  answersJson?: Record<string, boolean | string | number>;
}

export interface OverrideRateMetrics {
  totalWizardRuns: number;
  totalOverrides: number;
  overrideRate: number; // 0..100
  last30dOverrides: number;
  last30dWizardRuns: number;
  last30dOverrideRate: number;
}

export interface OverridePattern {
  recommendedScope: string;
  overriddenScope: string;
  count: number;
}

// ── Record Override ─────────────────────────────────────────────────

export async function recordOverride(
  input: OverrideInput,
  actorId: number,
): Promise<PsWizardOverride> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const [created] = await db.insert(psWizardOverrides).values({
    wizardRunId: input.wizardRunId ?? null,
    recommendedScopeCode: input.recommendedScopeCode,
    overriddenScopeCode: input.overriddenScopeCode,
    reason: input.reason,
    recommendedConfidence: input.recommendedConfidence != null
      ? String(input.recommendedConfidence)
      : null,
    matrixVersion: input.matrixVersion ?? null,
    answersJson: input.answersJson ?? null,
    createdBy: actorId,
    createdAt: new Date(),
  }).returning();

  return created;
}

// ── List Overrides ──────────────────────────────────────────────────

export async function listOverrides(
  limit = 50,
): Promise<PsWizardOverride[]> {
  const db = getDb();
  if (!db) return [];

  return db.select().from(psWizardOverrides)
    .orderBy(desc(psWizardOverrides.createdAt))
    .limit(limit);
}

// ── Override Rate ───────────────────────────────────────────────────

export async function getOverrideRate(): Promise<OverrideRateMetrics> {
  const db = getDb();
  if (!db) {
    return {
      totalWizardRuns: 0, totalOverrides: 0, overrideRate: 0,
      last30dOverrides: 0, last30dWizardRuns: 0, last30dOverrideRate: 0,
    };
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [[wizardRow], [overrideRow]] = await Promise.all([
    db.select({
      total: count(),
      last30d: sql<number>`count(*) filter (where ${psWizardRuns.createdAt} >= ${thirtyDaysAgo})`,
    })
    .from(psWizardRuns),

    db.select({
      total: count(),
      last30d: sql<number>`count(*) filter (where ${psWizardOverrides.createdAt} >= ${thirtyDaysAgo})`,
    })
    .from(psWizardOverrides),
  ]);

  const totalWizardRuns = Number(wizardRow?.total ?? 0);
  const totalOverrides = Number(overrideRow?.total ?? 0);
  const last30dWizardRuns = Number(wizardRow?.last30d ?? 0);
  const last30dOverrides = Number(overrideRow?.last30d ?? 0);

  return {
    totalWizardRuns,
    totalOverrides,
    overrideRate: totalWizardRuns > 0
      ? Math.round((totalOverrides / totalWizardRuns) * 10000) / 100
      : 0,
    last30dOverrides,
    last30dWizardRuns,
    last30dOverrideRate: last30dWizardRuns > 0
      ? Math.round((last30dOverrides / last30dWizardRuns) * 10000) / 100
      : 0,
  };
}

// ── Override Patterns ───────────────────────────────────────────────

export async function getOverridePatterns(): Promise<OverridePattern[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db.select({
    recommendedScope: psWizardOverrides.recommendedScopeCode,
    overriddenScope: psWizardOverrides.overriddenScopeCode,
    cnt: count(),
  })
  .from(psWizardOverrides)
  .groupBy(psWizardOverrides.recommendedScopeCode, psWizardOverrides.overriddenScopeCode)
  .orderBy(desc(count()));

  return rows.map((r) => ({
    recommendedScope: r.recommendedScope,
    overriddenScope: r.overriddenScope,
    count: Number(r.cnt),
  }));
}
