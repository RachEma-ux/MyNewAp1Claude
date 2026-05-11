/**
 * Graph Skill Pack — runtime-usage recorder.
 *
 * Phase 12.5 §5. Wires the `GraphRetrievalUsageRecorder` port (Phase
 * 12.5 §4) to an ASDB write against `ags_graph_skill_runtime_usages`.
 *
 * Responsibilities:
 *   - Resolve `packKey` (= `agsGraphSkillPacks.skillKey`) to the latest
 *     `agsGraphSkillPackVersions.id` (FK target on the usage table).
 *   - Insert one usage row per fired event.
 *   - Short-circuit silently when the event has no `runtimeRunId`
 *     (table column is `NOT NULL`) or when ASDB is unavailable
 *     (dev/test environments without the dedicated database).
 *
 * Caching: pack-key → version-id lookups are cached with a short TTL
 * to avoid round-tripping per retrieval. Cache is internal to the
 * returned recorder so each callsite gets independent state.
 *
 * ADR: docs/architecture/agent-studio-graph-skill-packs.md §1.4
 */

import { desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphSkillPacks,
  agsGraphSkillPackVersions,
  agsGraphSkillRuntimeUsages,
} from "../../../../drizzle/tables/agent-studio-graph-skill.js";
import type { GraphRetrievalUsageRecorder } from "../graph/retrieval/retrieval-router.js";

const DEFAULT_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  readonly packVersionId: number | null;
  readonly expiresAt: number;
}

export interface CreateRuntimeUsageRecorderOptions {
  /**
   * Injection point for tests. Defaults to `getAsDb` from the ASDB
   * connection module. Returning `null` causes the recorder to silently
   * no-op — matches the dev fallback when ASDB is not provisioned.
   */
  readonly getDb?: typeof getAsDb;
  /** TTL for the pack-key → version-id cache. Defaults to 60s. */
  readonly cacheTtlMs?: number;
}

export function createRuntimeUsageRecorder(
  options: CreateRuntimeUsageRecorderOptions = {},
): GraphRetrievalUsageRecorder {
  const getDb = options.getDb ?? getAsDb;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map<string, CacheEntry>();

  async function resolvePackVersionId(skillKey: string): Promise<number | null> {
    const now = Date.now();
    const cached = cache.get(skillKey);
    if (cached && cached.expiresAt > now) return cached.packVersionId;

    const db = getDb();
    if (!db) return null;

    const rows = await db
      .select({ versionId: agsGraphSkillPackVersions.id })
      .from(agsGraphSkillPackVersions)
      .innerJoin(
        agsGraphSkillPacks,
        eq(agsGraphSkillPackVersions.packId, agsGraphSkillPacks.id),
      )
      .where(eq(agsGraphSkillPacks.skillKey, skillKey))
      .orderBy(desc(agsGraphSkillPackVersions.createdAt))
      .limit(1);

    const packVersionId = rows[0]?.versionId ?? null;
    cache.set(skillKey, { packVersionId, expiresAt: now + cacheTtlMs });
    return packVersionId;
  }

  return async (event) => {
    if (event.runtimeRunId === undefined) return;
    const db = getDb();
    if (!db) return;
    const packVersionId = await resolvePackVersionId(event.packKey);
    if (packVersionId === null) return;
    // Phase 12.5 §12 — persist the template-run audit row ids the
    // router collected via the §11 recorder. `null` when no template
    // executed (e.g. local/global graph modes that bypass templates).
    const queryTemplateRunIds =
      event.queryTemplateRunIds && event.queryTemplateRunIds.length > 0
        ? event.queryTemplateRunIds
        : null;
    await db.insert(agsGraphSkillRuntimeUsages).values({
      packVersionId,
      runtimeRunId: event.runtimeRunId,
      queryTemplateRunIds,
    });
  };
}
