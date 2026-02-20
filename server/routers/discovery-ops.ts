/**
 * Discovery Ops — Failure monitoring, rolling stats, promotion workflow.
 *
 * Provides:
 *   - Event logging for every discovery attempt
 *   - Rolling-window per-domain stats
 *   - Promotion candidate auto-creation from triggers
 *   - Status transitions (OPEN → IN_REVIEW → ACCEPTED/REJECTED)
 *   - Material change detector for auto-reopen
 *   - tRPC endpoints for Ops UI
 */

import { z } from "zod";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  providerDiscoveryEvents,
  registryPromotionCandidates,
  registryPatchArtifacts,
} from "../../drizzle/schema";
import type { DiscoverResult } from "./discover-provider";

// ── Event Logging ───────────────────────────────────────────────────

export async function logDiscoveryEvent(
  result: DiscoverResult,
  actorId?: number
): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(providerDiscoveryEvents).values({
      actorId: actorId ?? null,
      domain: result.domain,
      normalizedUrl: result.debug.normalizedUrl,
      status: result.status,
      failureReason: result.failureReason ?? null,
      bestUrl: result.api.bestUrl,
      candidateCount: result.api.candidates.length,
      probeSummary: result.api.candidates
        .filter((c) => c.probe)
        .map((c) => ({
          url: c.url,
          path: c.probe!.path,
          status: c.probe!.status,
          probeType: c.probeType || "unknown",
        })),
      warnings: result.warnings,
      debug: result.debug as any,
    });

    // After logging, evaluate promotion triggers
    await evaluatePromotionTriggers(result.domain);
  } catch (e: any) {
    console.warn(`[DiscoveryOps] Failed to log event: ${e.message}`);
  }
}

// ── Rolling Window Stats ────────────────────────────────────────────

export interface DomainStats {
  domain: string;
  attemptsTotal: number;
  attemptsFailed: number;
  attemptsPartial: number;
  noCandidates: number;
  probeAllFailed: number;
  fetchBlocked: number;
  fetchTimeout: number;
  bestUrlNullRate: number;
  lastAttemptAt: string | null;
}

async function getDomainStats(domain: string, windowDays: number = 7): Promise<DomainStats | null> {
  const db = getDb();
  if (!db) return null;

  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const events = await db
    .select()
    .from(providerDiscoveryEvents)
    .where(
      and(
        eq(providerDiscoveryEvents.domain, domain),
        gte(providerDiscoveryEvents.createdAt, since)
      )
    )
    .orderBy(desc(providerDiscoveryEvents.createdAt));

  if (events.length === 0) return null;

  const total = events.length;
  const failed = events.filter((e) => e.status === "failed").length;
  const partial = events.filter((e) => e.status === "partial").length;
  const noCandidates = events.filter((e) => e.failureReason === "NO_CANDIDATES").length;
  const probeAllFailed = events.filter((e) => e.failureReason === "PROBE_ALL_FAILED").length;
  const fetchBlocked = events.filter((e) => e.failureReason === "SSRF_BLOCKED").length;
  const fetchTimeout = events.filter((e) => e.failureReason === "FETCH_TIMEOUT").length;
  const bestUrlNull = events.filter((e) => !e.bestUrl).length;

  return {
    domain,
    attemptsTotal: total,
    attemptsFailed: failed,
    attemptsPartial: partial,
    noCandidates,
    probeAllFailed,
    fetchBlocked,
    fetchTimeout,
    bestUrlNullRate: total > 0 ? bestUrlNull / total : 0,
    lastAttemptAt: events[0]?.createdAt?.toISOString() ?? null,
  };
}

// ── Promotion Triggers ──────────────────────────────────────────────

interface TriggerResult {
  triggered: boolean;
  type: string | null;
  reason: string | null;
}

async function evaluatePromotionTriggers(domain: string): Promise<TriggerResult> {
  const stats = await getDomainStats(domain, 7);
  if (!stats) return { triggered: false, type: null, reason: null };

  const db = getDb();
  if (!db) return { triggered: false, type: null, reason: null };

  // Safety: skip if registry already covers this domain
  const { findKnownProvider } = await import("../../shared/provider-registry");
  if (findKnownProvider(domain)) return { triggered: false, type: null, reason: null };

  // Safety: skip if mostly SSRF blocked (not a real provider)
  if (stats.fetchBlocked / stats.attemptsTotal >= 0.5) {
    return { triggered: false, type: null, reason: null };
  }

  let triggerType: string | null = null;
  let reason: string | null = null;

  // Trigger A: Repeated hard failures
  if (stats.attemptsTotal >= 5 && stats.attemptsFailed / stats.attemptsTotal >= 0.6) {
    triggerType = "REPEATED_FAILURES";
    reason = `${stats.attemptsFailed}/${stats.attemptsTotal} attempts failed (${Math.round(stats.attemptsFailed / stats.attemptsTotal * 100)}%)`;
  }

  // Trigger B: Can't find API
  if (!triggerType && stats.attemptsTotal >= 5) {
    const cantFindRate = (stats.noCandidates + stats.probeAllFailed) / stats.attemptsTotal;
    if (cantFindRate >= 0.5) {
      triggerType = "NO_API_FOUND";
      reason = `${stats.noCandidates + stats.probeAllFailed}/${stats.attemptsTotal} attempts found no API (${Math.round(cantFindRate * 100)}%)`;
    }
  }

  // Trigger C: Chronic bestUrl null
  if (!triggerType && stats.attemptsTotal >= 8 && stats.bestUrlNullRate >= 0.7) {
    triggerType = "CHRONIC_NULL_BESTURL";
    reason = `bestUrl null in ${Math.round(stats.bestUrlNullRate * 100)}% of ${stats.attemptsTotal} attempts`;
  }

  if (!triggerType) return { triggered: false, type: null, reason: null };

  // Check if candidate already exists
  const existing = await db
    .select()
    .from(registryPromotionCandidates)
    .where(eq(registryPromotionCandidates.domain, domain))
    .limit(1);

  if (existing.length > 0) {
    const candidate = existing[0];
    // Update stats
    await db
      .update(registryPromotionCandidates)
      .set({
        lastSeenAt: new Date(),
        lastDetectedAt: new Date(),
        attemptsTotal: stats.attemptsTotal,
        attemptsFailed: stats.attemptsFailed,
        bestUrlNullRate: String(stats.bestUrlNullRate),
        triggerType,
      })
      .where(eq(registryPromotionCandidates.domain, domain));

    // Check auto-reopen if REJECTED
    if (candidate.status === "REJECTED") {
      await checkAutoReopen(domain, candidate, stats);
    }

    return { triggered: true, type: triggerType, reason };
  }

  // Create new candidate
  await db.insert(registryPromotionCandidates).values({
    domain,
    status: "OPEN",
    triggerType,
    attemptsTotal: stats.attemptsTotal,
    attemptsFailed: stats.attemptsFailed,
    bestUrlNullRate: String(stats.bestUrlNullRate),
  });

  console.log(`[DiscoveryOps] Promotion candidate created: domain=${domain} trigger=${triggerType}`);
  return { triggered: true, type: triggerType, reason };
}

// ── Auto-Reopen Rules ───────────────────────────────────────────────

async function checkAutoReopen(
  domain: string,
  candidate: any,
  stats: DomainStats
): Promise<void> {
  const db = getDb();
  if (!db) return;

  // R2: Cooldown elapsed — 30 days + 5 new attempts + triggers still met
  if (candidate.rejectedAt) {
    const daysSinceReject = (Date.now() - new Date(candidate.rejectedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceReject >= 30 && candidate.attemptsSinceReject >= 5) {
      await db
        .update(registryPromotionCandidates)
        .set({
          status: "OPEN",
          autoReopenedAt: new Date(),
          autoReopenReason: "COOLDOWN_ELAPSED",
          autoReopenEvidence: { daysSinceReject: Math.round(daysSinceReject), attemptsSinceReject: candidate.attemptsSinceReject },
        })
        .where(eq(registryPromotionCandidates.domain, domain));
      console.log(`[DiscoveryOps] Auto-reopened (cooldown): domain=${domain}`);
      return;
    }
  }

  // R3: Material change — bestUrl null rate improved significantly
  if (candidate.rejectSnapshot) {
    const snapshot = candidate.rejectSnapshot as Record<string, any>;
    const prevNullRate = snapshot.bestUrlNullRate ?? 1;
    const improvement = prevNullRate - stats.bestUrlNullRate;
    if (improvement >= 0.4) {
      await db
        .update(registryPromotionCandidates)
        .set({
          status: "OPEN",
          autoReopenedAt: new Date(),
          autoReopenReason: "MATERIAL_CHANGE",
          autoReopenEvidence: {
            type: "BESTURL_NULL_IMPROVED",
            previousRate: prevNullRate,
            currentRate: stats.bestUrlNullRate,
            delta: improvement,
          },
        })
        .where(eq(registryPromotionCandidates.domain, domain));
      console.log(`[DiscoveryOps] Auto-reopened (material change): domain=${domain}`);
    }
  }
}

// ── Material Change Detector ────────────────────────────────────────

export type MaterialChangeType =
  | "SEVERITY_ESCALATION"
  | "BESTURL_NULL_IMPROVED"
  | "BESTURL_NULL_WORSENED"
  | "TOP_CANDIDATE_CHANGED"
  | "PROBE_OK_APPEARED"
  | "FAILURE_REASON_SHIFT";

export interface MaterialChangeDiff {
  hasMaterialChange: boolean;
  reasons: MaterialChangeType[];
  summary: string[];
  deltas: {
    bestUrlNullRateDelta: number;
    failureRateDelta: number;
    noCandidatesRateDelta: number;
    probeAllFailedRateDelta: number;
  };
}

export function detectMaterialChange(
  snapshot: Record<string, any>,
  current: DomainStats
): MaterialChangeDiff {
  const reasons: MaterialChangeType[] = [];
  const summary: string[] = [];

  const prevNullRate = snapshot.bestUrlNullRate ?? 1;
  const nullDelta = current.bestUrlNullRate - prevNullRate;

  const prevFailRate = snapshot.attemptsFailed && snapshot.attemptsTotal
    ? snapshot.attemptsFailed / snapshot.attemptsTotal
    : 1;
  const currFailRate = current.attemptsTotal > 0 ? current.attemptsFailed / current.attemptsTotal : 0;
  const failDelta = currFailRate - prevFailRate;

  const prevNoCandRate = snapshot.noCandidates && snapshot.attemptsTotal
    ? snapshot.noCandidates / snapshot.attemptsTotal
    : 0;
  const currNoCandRate = current.attemptsTotal > 0 ? current.noCandidates / current.attemptsTotal : 0;
  const noCandDelta = currNoCandRate - prevNoCandRate;

  const prevProbeFailRate = snapshot.probeAllFailed && snapshot.attemptsTotal
    ? snapshot.probeAllFailed / snapshot.attemptsTotal
    : 0;
  const currProbeFailRate = current.attemptsTotal > 0 ? current.probeAllFailed / current.attemptsTotal : 0;
  const probeFailDelta = currProbeFailRate - prevProbeFailRate;

  // Check for improvements
  if (nullDelta <= -0.4) {
    reasons.push("BESTURL_NULL_IMPROVED");
    summary.push(`bestUrl null rate improved by ${Math.round(Math.abs(nullDelta) * 100)}pp`);
  }
  if (nullDelta >= 0.3) {
    reasons.push("BESTURL_NULL_WORSENED");
    summary.push(`bestUrl null rate worsened by ${Math.round(nullDelta * 100)}pp`);
  }
  if (failDelta >= 0.3) {
    reasons.push("SEVERITY_ESCALATION");
    summary.push(`Failure rate increased by ${Math.round(failDelta * 100)}pp`);
  }
  if (noCandDelta <= -0.3) {
    reasons.push("TOP_CANDIDATE_CHANGED");
    summary.push(`No-candidates rate improved by ${Math.round(Math.abs(noCandDelta) * 100)}pp`);
  }
  if (Math.abs(failDelta) >= 0.3 || Math.abs(noCandDelta) >= 0.3) {
    reasons.push("FAILURE_REASON_SHIFT");
    summary.push("Failure pattern shifted significantly");
  }

  const hasMaterialChange = reasons.some(
    (r) => r === "SEVERITY_ESCALATION" || r === "BESTURL_NULL_IMPROVED" || r === "PROBE_OK_APPEARED"
  );

  return {
    hasMaterialChange,
    reasons,
    summary,
    deltas: {
      bestUrlNullRateDelta: nullDelta,
      failureRateDelta: failDelta,
      noCandidatesRateDelta: noCandDelta,
      probeAllFailedRateDelta: probeFailDelta,
    },
  };
}

// ── Retention Cleanup ───────────────────────────────────────────────

export async function cleanupOldDiscoveryEvents(retentionDays: number = 30): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  try {
    const result = await db
      .delete(providerDiscoveryEvents)
      .where(sql`${providerDiscoveryEvents.createdAt} < ${cutoff}`);
    const count = (result as any)?.rowCount ?? 0;
    if (count > 0) console.log(`[DiscoveryOps] Cleaned up ${count} events older than ${retentionDays} days`);
    return count;
  } catch (e: any) {
    console.warn(`[DiscoveryOps] Cleanup failed: ${e.message}`);
    return 0;
  }
}

// ── tRPC Router ─────────────────────────────────────────────────────

export const discoveryOpsRouter = router({
  /**
   * Get rolling-window stats for all domains with recent discovery attempts.
   */
  stats: protectedProcedure
    .input(z.object({ windowDays: z.number().int().min(1).max(90).default(7) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const windowDays = input?.windowDays ?? 7;

      const since = new Date();
      since.setDate(since.getDate() - windowDays);

      // Get unique domains with attempts in window
      const domains = await db
        .selectDistinct({ domain: providerDiscoveryEvents.domain })
        .from(providerDiscoveryEvents)
        .where(gte(providerDiscoveryEvents.createdAt, since));

      const stats: DomainStats[] = [];
      for (const { domain } of domains) {
        const s = await getDomainStats(domain, windowDays);
        if (s) stats.push(s);
      }

      return stats.sort((a, b) => b.attemptsTotal - a.attemptsTotal);
    }),

  /**
   * Get stats for a specific domain.
   */
  domainStats: protectedProcedure
    .input(z.object({ domain: z.string(), windowDays: z.number().int().min(1).max(90).default(7) }))
    .query(async ({ input }) => {
      return getDomainStats(input.domain, input.windowDays);
    }),

  /**
   * List promotion candidates with optional status filter.
   */
  candidates: protectedProcedure
    .input(z.object({ status: z.enum(["OPEN", "IN_REVIEW", "ACCEPTED", "REJECTED"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];

      const conditions = input?.status
        ? eq(registryPromotionCandidates.status, input.status)
        : undefined;

      return db
        .select()
        .from(registryPromotionCandidates)
        .where(conditions)
        .orderBy(desc(registryPromotionCandidates.lastSeenAt))
        .limit(100);
    }),

  /**
   * Get a single promotion candidate by domain.
   */
  candidateByDomain: protectedProcedure
    .input(z.object({ domain: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(registryPromotionCandidates)
        .where(eq(registryPromotionCandidates.domain, input.domain))
        .limit(1);

      return rows[0] ?? null;
    }),

  /**
   * Transition candidate to IN_REVIEW.
   */
  markInReview: adminProcedure
    .input(z.object({ domain: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(registryPromotionCandidates)
        .set({
          status: "IN_REVIEW",
          reviewedBy: (ctx as any).user?.id ?? 1,
          reviewedAt: new Date(),
        })
        .where(eq(registryPromotionCandidates.domain, input.domain));

      return { success: true };
    }),

  /**
   * Reject a promotion candidate.
   */
  reject: adminProcedure
    .input(z.object({
      domain: z.string(),
      category: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      // Get current stats for snapshot
      const stats = await getDomainStats(input.domain, 7);

      await db
        .update(registryPromotionCandidates)
        .set({
          status: "REJECTED",
          rejectedBy: (ctx as any).user?.id ?? 1,
          rejectedAt: new Date(),
          rejectCategory: input.category,
          rejectNotes: input.notes ?? null,
          rejectSnapshot: stats as any,
          attemptsSinceReject: 0,
        })
        .where(eq(registryPromotionCandidates.domain, input.domain));

      return { success: true };
    }),

  /**
   * Accept a promotion candidate — creates a patch artifact.
   */
  accept: adminProcedure
    .input(z.object({
      domain: z.string(),
      draftRegistryEntry: z.record(z.unknown()),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      const userId = (ctx as any).user?.id ?? 1;

      // Create patch artifact
      const [patch] = await db
        .insert(registryPatchArtifacts)
        .values({
          createdBy: userId,
          sourceDomain: input.domain,
          draftRegistryEntry: input.draftRegistryEntry,
          notes: input.notes ?? null,
        })
        .returning();

      // Update candidate
      await db
        .update(registryPromotionCandidates)
        .set({
          status: "ACCEPTED",
          acceptedBy: userId,
          acceptedAt: new Date(),
          patchId: patch.id,
          draftRegistryEntry: input.draftRegistryEntry,
        })
        .where(eq(registryPromotionCandidates.domain, input.domain));

      return { success: true, patchId: patch.id };
    }),

  /**
   * Manually reopen a rejected candidate.
   */
  reopen: adminProcedure
    .input(z.object({ domain: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(registryPromotionCandidates)
        .set({
          status: "OPEN",
          autoReopenedAt: new Date(),
          autoReopenReason: "MANUAL",
          autoReopenEvidence: { reason: input.reason || "Manual reopen by admin" },
        })
        .where(eq(registryPromotionCandidates.domain, input.domain));

      return { success: true };
    }),

  /**
   * Get recent discovery events for a domain.
   */
  recentEvents: protectedProcedure
    .input(z.object({ domain: z.string(), limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];

      return db
        .select()
        .from(providerDiscoveryEvents)
        .where(eq(providerDiscoveryEvents.domain, input.domain))
        .orderBy(desc(providerDiscoveryEvents.createdAt))
        .limit(input.limit);
    }),

  /**
   * Get top failure reasons across all domains in the window.
   */
  topFailureReasons: protectedProcedure
    .input(z.object({ windowDays: z.number().int().min(1).max(90).default(7) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];
      const windowDays = input?.windowDays ?? 7;

      const since = new Date();
      since.setDate(since.getDate() - windowDays);

      const events = await db
        .select()
        .from(providerDiscoveryEvents)
        .where(
          and(
            gte(providerDiscoveryEvents.createdAt, since),
            sql`${providerDiscoveryEvents.failureReason} IS NOT NULL`
          )
        );

      const counts: Record<string, number> = {};
      for (const e of events) {
        const reason = e.failureReason || "UNKNOWN";
        counts[reason] = (counts[reason] || 0) + 1;
      }

      return Object.entries(counts)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);
    }),

  /**
   * Get material change diff for a rejected candidate.
   */
  materialChangeDiff: protectedProcedure
    .input(z.object({ domain: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(registryPromotionCandidates)
        .where(eq(registryPromotionCandidates.domain, input.domain))
        .limit(1);

      if (rows.length === 0 || !rows[0].rejectSnapshot) return null;

      const stats = await getDomainStats(input.domain, 7);
      if (!stats) return null;

      return detectMaterialChange(rows[0].rejectSnapshot as Record<string, any>, stats);
    }),

  /**
   * List patch artifacts.
   */
  patches: protectedProcedure
    .input(z.object({ status: z.enum(["PROPOSED", "MERGED", "ABANDONED"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];

      const conditions = input?.status
        ? eq(registryPatchArtifacts.status, input.status)
        : undefined;

      return db
        .select()
        .from(registryPatchArtifacts)
        .where(conditions)
        .orderBy(desc(registryPatchArtifacts.createdAt))
        .limit(50);
    }),

  /**
   * Trigger retention cleanup (admin only).
   */
  cleanup: adminProcedure
    .input(z.object({ retentionDays: z.number().int().min(1).max(365).default(30) }).optional())
    .mutation(async ({ input }) => {
      const count = await cleanupOldDiscoveryEvents(input?.retentionDays ?? 30);
      return { deletedCount: count };
    }),
});
