/**
 * Graph Skill Pack — query-template-run audit recorder.
 *
 * Phase 12.5 §11. Wires the `QueryTemplateRunRecorder` port (defined
 * on the retrieval router) to an ASDB write against
 * `ags_query_template_runs`. One row per `executeTemplate(...)` call
 * — success rows carry `resultCount` + `durationMs`; error rows carry
 * `errorMessage` instead.
 *
 * Responsibilities:
 *   - Resolve `templateKey` → `templateId` (and optionally the most
 *     recent `templateVersionId`) via cached SELECTs against
 *     `ags_query_templates` + `ags_query_template_versions`.
 *   - Insert the row.
 *   - Skip silently when ASDB is unavailable (matches the recorder's
 *     fail-safe contract; the retrieval call never fails).
 *
 * Caching: template-key → ids resolution is cached with a short TTL
 * to avoid round-tripping per call. Same pattern as the §5
 * `createRuntimeUsageRecorder`.
 *
 * ADR: docs/architecture/agent-studio-cypher-query-template-system.md §1.5
 */

import { desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsQueryTemplates,
  agsQueryTemplateVersions,
  agsQueryTemplateRuns,
} from "../../../../drizzle/tables/agent-studio-graph-skill.js";
import type { QueryTemplateRunRecorder } from "../graph/retrieval/retrieval-router.js";

const DEFAULT_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  readonly templateId: number | null;
  readonly templateVersionId: number | null;
  readonly expiresAt: number;
}

export interface CreateQueryTemplateRunRecorderOptions {
  readonly getDb?: typeof getAsDb;
  readonly cacheTtlMs?: number;
}

export function createQueryTemplateRunRecorder(
  options: CreateQueryTemplateRunRecorderOptions = {},
): QueryTemplateRunRecorder {
  const getDb = options.getDb ?? getAsDb;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map<string, CacheEntry>();

  async function resolveTemplateIds(
    templateKey: string,
  ): Promise<{ templateId: number | null; templateVersionId: number | null }> {
    const now = Date.now();
    const cached = cache.get(templateKey);
    if (cached && cached.expiresAt > now) {
      return {
        templateId: cached.templateId,
        templateVersionId: cached.templateVersionId,
      };
    }

    const db = getDb();
    if (!db) {
      return { templateId: null, templateVersionId: null };
    }

    const templateRows = await db
      .select({ id: agsQueryTemplates.id })
      .from(agsQueryTemplates)
      .where(eq(agsQueryTemplates.templateKey, templateKey))
      .limit(1);
    const templateId = templateRows[0]?.id ?? null;

    let templateVersionId: number | null = null;
    if (templateId !== null) {
      const versionRows = await db
        .select({ id: agsQueryTemplateVersions.id })
        .from(agsQueryTemplateVersions)
        .where(eq(agsQueryTemplateVersions.templateId, templateId))
        .orderBy(desc(agsQueryTemplateVersions.id))
        .limit(1);
      templateVersionId = versionRows[0]?.id ?? null;
    }

    cache.set(templateKey, {
      templateId,
      templateVersionId,
      expiresAt: now + cacheTtlMs,
    });
    return { templateId, templateVersionId };
  }

  return async (event) => {
    const db = getDb();
    if (!db) return;

    const { templateId, templateVersionId } = await resolveTemplateIds(
      event.templateKey,
    );
    if (templateId === null) return;

    await db.insert(agsQueryTemplateRuns).values({
      templateId,
      templateVersionId,
      retrievalRunId: event.retrievalRunId ?? null,
      parameters: event.parameters,
      userId: event.userId ?? null,
      durationMs: event.durationMs,
      resultCount: event.status === "success" ? event.resultCount ?? null : null,
      status: event.status,
      errorMessage:
        event.status === "error" ? event.errorMessage ?? null : null,
    });
  };
}
