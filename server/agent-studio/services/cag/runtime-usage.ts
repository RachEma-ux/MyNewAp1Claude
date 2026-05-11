/**
 * CAG runtime-usage recorder.
 *
 * Phase 14 §6/§7. Inserts a row into `ags_cag_block_runtime_usages`
 * each time the CAG resolver activates a pack for a runtime run. The
 * projection layer (PR #470 expander + #471 drain orchestrator) reads
 * this table to emit `(:RuntimeTrace)-[:USED_CAG_BLOCK]->(:CAGBlock)`
 * edges.
 *
 * Failure mode is non-fatal — same shape as PR #464/#465 trace-writer
 * projection-intent recording. The authoritative CAG pack-event row
 * has already landed; this row is a bookkeeping breadcrumb for the
 * graph projection layer. If ASDB is unavailable or the insert fails,
 * we log and continue.
 */

import { getAsDb } from "../../db/connection.js";
import { agsCagBlockRuntimeUsages } from "../../../../drizzle/tables/agent-studio-graph-promotion.js";

export interface RecordCagBlockRuntimeUsageInput {
  readonly runtimeRunId: number;
  readonly cagPackId: number;
  readonly packVersion: number;
}

export interface RecordCagBlockRuntimeUsageOptions {
  readonly getDb?: typeof getAsDb;
}

/**
 * Best-effort record. Returns `true` when a row was inserted, `false`
 * when ASDB is unavailable. Errors during the insert itself are
 * swallowed and logged so the caller (CAG resolver) cannot be
 * disrupted by a bookkeeping failure.
 */
export async function recordCagBlockRuntimeUsage(
  input: RecordCagBlockRuntimeUsageInput,
  options: RecordCagBlockRuntimeUsageOptions = {},
): Promise<boolean> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return false;

  try {
    await db.insert(agsCagBlockRuntimeUsages).values({
      cagPackId: input.cagPackId,
      packVersion: input.packVersion,
      runtimeRunId: input.runtimeRunId,
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ags-cag] recordCagBlockRuntimeUsage failed (run=${input.runtimeRunId} pack=${input.cagPackId}): ${msg}`,
    );
    return false;
  }
}
