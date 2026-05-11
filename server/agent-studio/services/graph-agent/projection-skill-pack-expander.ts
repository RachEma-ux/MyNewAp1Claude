/**
 * Native Graph Workspace — runtime-trace skill-pack edge expander.
 *
 * Phase 14 §6/§7 infrastructure. Companion to the step expander
 * (PR #467). For a `runtime_trace` projection-intent row, emits:
 *
 *   (:GraphSkillPack {id, latestObservedVersion, skillKey})   ← upsert (idempotent)
 *   (:RuntimeTrace)-[:USED_GRAPH_SKILL]->(:GraphSkillPack)
 *
 * Split into two surfaces (same shape as PR #467):
 *
 *   1. `expandRuntimeSkillPackEdges(runtimeRunId, rows)` — PURE.
 *      One upsert_node + one upsert_edge per usage row.
 *
 *   2. `loadRuntimeSkillPackUsagesForRun(runtimeRunId, options)` — ASDB
 *      reader. JOINs `ags_graph_skill_runtime_usages` →
 *      `ags_graph_skill_pack_versions` → `ags_graph_skill_packs`
 *      to fetch (packId, version, skillKey) per usage. Dedup is intent-
 *      level: the same pack version used many times in a run still
 *      produces one edge (same id).
 *
 * ADR: docs/architecture/agent-studio-graph-projection-sync.md
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphSkillPacks,
  agsGraphSkillPackVersions,
  agsGraphSkillRuntimeUsages,
} from "../../../../drizzle/tables/agent-studio-graph-skill.js";
import type {
  ProjectionWrite,
  ProvenanceFields,
} from "../graph/repository/types.js";

export interface RuntimeSkillPackUsageRow {
  readonly packId: number;
  readonly skillKey: string;
  readonly packVersionId: number;
  readonly version: string;
}

function provenance(
  sourceType: string,
  sourceId: string,
): ProvenanceFields {
  return {
    sourceType,
    sourceId,
    lineageStatus: "derived",
    governanceStatus: "active",
  };
}

function runtimeTraceNodeId(runtimeRunId: number): string {
  return `runtime_trace:${runtimeRunId}`;
}

function graphSkillPackNodeId(packId: number): string {
  return `graph_skill_pack:${packId}`;
}

/**
 * Pure function. Emits one (:GraphSkillPack) upsert_node + one
 * USED_GRAPH_SKILL upsert_edge per usage row. Duplicates on
 * (runtimeRunId, packId) collapse — caller should dedup at read time,
 * but stable ids make replays idempotent regardless.
 */
export function expandRuntimeSkillPackEdges(
  runtimeRunId: number,
  rows: readonly RuntimeSkillPackUsageRow[],
): ProjectionWrite[] {
  const runtimeTraceId = runtimeTraceNodeId(runtimeRunId);
  const writes: ProjectionWrite[] = [];
  const seen = new Set<number>();

  for (const row of rows) {
    if (seen.has(row.packId)) continue;
    seen.add(row.packId);

    const packNodeId = graphSkillPackNodeId(row.packId);
    writes.push({
      kind: "upsert_node",
      node: {
        typeKey: "GraphSkillPack",
        id: packNodeId,
        sourceId: String(row.packId),
        properties: {
          skillKey: row.skillKey,
          latestObservedVersion: row.version,
          latestObservedVersionId: row.packVersionId,
        },
        provenance: provenance("graph_skill_pack", String(row.packId)),
      },
    });
    writes.push({
      kind: "upsert_edge",
      edge: {
        typeKey: "USED_GRAPH_SKILL",
        id: `used_graph_skill:${runtimeRunId}:${row.packId}`,
        sourceNode: { typeKey: "RuntimeTrace", id: runtimeTraceId },
        targetNode: { typeKey: "GraphSkillPack", id: packNodeId },
        properties: {
          packVersionId: row.packVersionId,
          version: row.version,
        },
        provenance: provenance(
          "graph_skill_usage",
          `${runtimeRunId}:${row.packId}`,
        ),
      },
    });
  }
  return writes;
}

export interface LoadRuntimeSkillPackUsagesOptions {
  readonly getDb?: typeof getAsDb;
}

/**
 * Reader companion. Selects skill-pack usages for a run, joined with
 * pack-versions + packs to pull packKey + version into one row.
 * Returns [] when ASDB is unavailable.
 */
export async function loadRuntimeSkillPackUsagesForRun(
  runtimeRunId: number,
  options: LoadRuntimeSkillPackUsagesOptions = {},
): Promise<readonly RuntimeSkillPackUsageRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      packId: agsGraphSkillPackVersions.packId,
      skillKey: agsGraphSkillPacks.skillKey,
      packVersionId: agsGraphSkillRuntimeUsages.packVersionId,
      version: agsGraphSkillPackVersions.version,
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
    .where(eq(agsGraphSkillRuntimeUsages.runtimeRunId, runtimeRunId));

  return rows as readonly RuntimeSkillPackUsageRow[];
}
