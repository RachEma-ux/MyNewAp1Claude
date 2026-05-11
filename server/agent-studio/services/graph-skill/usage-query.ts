/**
 * Graph Skill Pack — usage-count read helper.
 *
 * Phase 12.5 §7. Read side of the runtime-usage table. The §4/§5
 * recorder writes `ags_graph_skill_runtime_usages` rows when a Skill
 * Pack template serves an agent run; this helper aggregates those
 * rows into per-pack-version counts so the admin UI (or any
 * downstream consumer — Why-This-Answer panel, governance dashboards)
 * can surface "used N times this week".
 *
 * Stateless, DB-aware, injectable for tests. Returns an empty list
 * when ASDB is unavailable (matches the recorder's degrade-silently
 * contract).
 *
 * ADR: docs/architecture/agent-studio-graph-skill-packs.md §1.4
 */

import { and, count, desc, eq, gte, max } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphSkillPacks,
  agsGraphSkillPackVersions,
  agsGraphSkillRuntimeUsages,
} from "../../../../drizzle/tables/agent-studio-graph-skill.js";

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_LIMIT = 100;

export interface UsageCount {
  readonly skillKey: string;
  readonly packId: number;
  readonly packVersionId: number;
  readonly version: string;
  readonly count: number;
  readonly latestUsedAt: Date | null;
}

export interface ListUsageCountsInput {
  /**
   * Look-back window in ms from `now` (or `options.nowMs` for tests).
   * Defaults to 7 days — the "used N times this week" UI shape.
   */
  readonly sinceMs?: number;
  /** Filter to a single pack by `skillKey`. */
  readonly skillKey?: string;
  /** Cap result rows; defaults to 100. */
  readonly limit?: number;
}

export interface ListUsageCountsOptions {
  /** Injection point for tests. Defaults to `getAsDb`. */
  readonly getDb?: typeof getAsDb;
  /** Override "now" for tests so the window is deterministic. */
  readonly nowMs?: number;
}

export async function listUsageCounts(
  input: ListUsageCountsInput = {},
  options: ListUsageCountsOptions = {},
): Promise<UsageCount[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const nowMs = options.nowMs ?? Date.now();
  const windowMs = input.sinceMs ?? DEFAULT_WINDOW_MS;
  const since = new Date(nowMs - windowMs);

  const conditions = [gte(agsGraphSkillRuntimeUsages.createdAt, since)];
  if (input.skillKey) {
    conditions.push(eq(agsGraphSkillPacks.skillKey, input.skillKey));
  }

  const rows = await db
    .select({
      skillKey: agsGraphSkillPacks.skillKey,
      packId: agsGraphSkillPacks.id,
      packVersionId: agsGraphSkillPackVersions.id,
      version: agsGraphSkillPackVersions.version,
      count: count(agsGraphSkillRuntimeUsages.id),
      latestUsedAt: max(agsGraphSkillRuntimeUsages.createdAt),
    })
    .from(agsGraphSkillRuntimeUsages)
    .innerJoin(
      agsGraphSkillPackVersions,
      eq(agsGraphSkillPackVersions.id, agsGraphSkillRuntimeUsages.packVersionId),
    )
    .innerJoin(
      agsGraphSkillPacks,
      eq(agsGraphSkillPacks.id, agsGraphSkillPackVersions.packId),
    )
    .where(and(...conditions))
    .groupBy(
      agsGraphSkillPacks.skillKey,
      agsGraphSkillPacks.id,
      agsGraphSkillPackVersions.id,
      agsGraphSkillPackVersions.version,
    )
    .orderBy(desc(count(agsGraphSkillRuntimeUsages.id)))
    .limit(input.limit ?? DEFAULT_LIMIT);

  return rows.map((r) => ({
    skillKey: r.skillKey,
    packId: r.packId,
    packVersionId: r.packVersionId,
    version: r.version,
    count: Number(r.count),
    latestUsedAt: r.latestUsedAt ? new Date(r.latestUsedAt as unknown as string) : null,
  }));
}
