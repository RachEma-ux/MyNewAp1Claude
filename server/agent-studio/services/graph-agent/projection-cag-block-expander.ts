/**
 * Native Graph Workspace — runtime-trace CAG block edge expander.
 *
 * Phase 14 §6/§7 infrastructure. Final RuntimeTrace edge type in the
 * Phase 14 grammar (closes the set after #467/#468/#469). For a
 * `runtime_trace` projection intent, emits:
 *
 *   (:CAGBlock {id, latestObservedPackVersion})              ← upsert
 *   (:RuntimeTrace)-[:USED_CAG_BLOCK]->(:CAGBlock)
 *
 * Same two-surface pattern:
 *
 *   1. `expandRuntimeCagBlockEdges(runtimeRunId, rows)` — PURE.
 *      One node + one edge per usage row; dedup on cagPackId.
 *
 *   2. `loadRuntimeCagBlockUsagesForRun(runtimeRunId, options)` — ASDB
 *      reader against `ags_cag_block_runtime_usages`.
 *
 * Note: this PR ships the projection-side reader + expander. The CAG
 * resolver-side writer that inserts rows into
 * `ags_cag_block_runtime_usages` is a follow-up, parallel to PRs
 * #464/#465 which wired the trace writers to record projection intents.
 *
 * ADR: docs/architecture/agent-studio-graph-projection-sync.md
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsCagBlockRuntimeUsages } from "../../../../drizzle/tables/agent-studio-graph-promotion.js";
import type {
  ProjectionWrite,
  ProvenanceFields,
} from "../graph/repository/types.js";

export interface RuntimeCagBlockUsageRow {
  readonly cagPackId: number;
  readonly packVersion: number;
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

function cagBlockNodeId(cagPackId: number): string {
  return `cag_block:${cagPackId}`;
}

/**
 * Pure function. Emits one (:CAGBlock) upsert_node + one
 * USED_CAG_BLOCK upsert_edge per usage row. Dedups on cagPackId so
 * multiple invocations of the same pack within a run collapse into
 * one edge.
 */
export function expandRuntimeCagBlockEdges(
  runtimeRunId: number,
  rows: readonly RuntimeCagBlockUsageRow[],
): ProjectionWrite[] {
  const runtimeTraceId = runtimeTraceNodeId(runtimeRunId);
  const writes: ProjectionWrite[] = [];
  const seen = new Set<number>();

  for (const row of rows) {
    if (seen.has(row.cagPackId)) continue;
    seen.add(row.cagPackId);

    const cagNodeId = cagBlockNodeId(row.cagPackId);
    writes.push({
      kind: "upsert_node",
      node: {
        typeKey: "CAGBlock",
        id: cagNodeId,
        sourceId: String(row.cagPackId),
        properties: {
          latestObservedPackVersion: row.packVersion,
        },
        provenance: provenance("cag_capability_pack", String(row.cagPackId)),
      },
    });
    writes.push({
      kind: "upsert_edge",
      edge: {
        typeKey: "USED_CAG_BLOCK",
        id: `used_cag_block:${runtimeRunId}:${row.cagPackId}`,
        sourceNode: { typeKey: "RuntimeTrace", id: runtimeTraceId },
        targetNode: { typeKey: "CAGBlock", id: cagNodeId },
        properties: { packVersion: row.packVersion },
        provenance: provenance(
          "cag_block_usage",
          `${runtimeRunId}:${row.cagPackId}`,
        ),
      },
    });
  }
  return writes;
}

export interface LoadRuntimeCagBlockUsagesOptions {
  readonly getDb?: typeof getAsDb;
}

/**
 * Reader companion. Selects CAG block usages for a run from
 * `ags_cag_block_runtime_usages`. Returns [] when ASDB is unavailable
 * OR when the writer side isn't wired yet (zero rows — the expander
 * then emits zero writes, which is the correct intent shape).
 */
export async function loadRuntimeCagBlockUsagesForRun(
  runtimeRunId: number,
  options: LoadRuntimeCagBlockUsagesOptions = {},
): Promise<readonly RuntimeCagBlockUsageRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      cagPackId: agsCagBlockRuntimeUsages.cagPackId,
      packVersion: agsCagBlockRuntimeUsages.packVersion,
    })
    .from(agsCagBlockRuntimeUsages)
    .where(eq(agsCagBlockRuntimeUsages.runtimeRunId, runtimeRunId));

  return rows as readonly RuntimeCagBlockUsageRow[];
}
