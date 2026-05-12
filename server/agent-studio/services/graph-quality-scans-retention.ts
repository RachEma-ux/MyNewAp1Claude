/**
 * Graph Quality Scans — retention sweep service.
 *
 * Phase 22 follow-up #657. The `ags_graph_quality_scans` table
 * accumulates one row per quality scanner execution;
 * `ags_graph_quality_findings` adds many per-finding rows. No
 * retention before this PR — both tables grow unbounded with every
 * scan triggered by the operator UI or the autonomous quality
 * agent loop.
 *
 * Pattern mirrors `simulation-runs-retention.ts` (#649) and
 * `test-runs-retention.ts` (#653) on a 2-table cascade. Differences:
 *   - Findings table has an explicit FK constraint
 *     (`agsGraphQualityFindings.scanId.references(scans.id)`) with
 *     no `.onDelete()` specifier — Drizzle generates NO ACTION /
 *     RESTRICT, so application-level child-first deletion is
 *     required (matches the canonical pattern across all retention
 *     services).
 *   - Filter shape uses `scanKind` (varchar) instead of agentId.
 *     scanKind is the scanner identifier (e.g. "orphan-detector",
 *     "broken-citation-detector") — operators sweeping one
 *     scanner's history while preserving others pass a single value
 *     or set.
 *   - `status` union differs from runs: `pending` / `running` /
 *     `completed` / `failed` / `cancelled`. Default terminal
 *     statuses: `completed` / `failed` / `cancelled`.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getAsDb } from "../db/connection.js";
import {
  agsGraphQualityScans,
  agsGraphQualityFindings,
} from "../../../drizzle/tables/agent-studio-graph-quality.js";

export type GraphQualityScanStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** Default terminal statuses pruned by a sweep. */
const DEFAULT_TERMINAL_STATUSES: readonly GraphQualityScanStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

const ZERO_RESULT: PruneOldGraphQualityScansResult = {
  deletedScansCount: 0,
  deletedFindingsCount: 0,
};

export interface PruneOldGraphQualityScansInput {
  /** Cutoff — scans with `createdAt < olderThan` are eligible. */
  readonly olderThan: Date;
  /**
   * Restrict to these terminal statuses. Default:
   * `["completed", "failed", "cancelled"]`. `pending` + `running`
   * never swept — those are in-flight.
   *
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly statuses?: readonly GraphQualityScanStatus[];
  /**
   * Restrict to one scanner kind (`eq`) or a set (`inArray`).
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly scanKind?: string | readonly string[];
  /**
   * Restrict to one scope (`eq`) or a set (`inArray`). `scope` is
   * the optional scope identifier (e.g. workspace, source-kind).
   * Empty array short-circuits BEFORE the ASDB probe.
   */
  readonly scope?: string | readonly string[];
}

export interface PruneOldGraphQualityScansResult {
  readonly deletedScansCount: number;
  readonly deletedFindingsCount: number;
}

export interface PruneOldGraphQualityScansOptions {
  readonly getDb?: typeof getAsDb;
}

export async function pruneOldGraphQualityScans(
  input: PruneOldGraphQualityScansInput,
  options: PruneOldGraphQualityScansOptions = {},
): Promise<PruneOldGraphQualityScansResult> {
  if (Array.isArray(input.statuses) && input.statuses.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.scanKind) && input.scanKind.length === 0) {
    return ZERO_RESULT;
  }
  if (Array.isArray(input.scope) && input.scope.length === 0) {
    return ZERO_RESULT;
  }

  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return ZERO_RESULT;

  const statuses = input.statuses ?? DEFAULT_TERMINAL_STATUSES;
  const filters = [
    lt(agsGraphQualityScans.createdAt, input.olderThan),
    inArray(agsGraphQualityScans.status, statuses as GraphQualityScanStatus[]),
  ];
  const scanKindInput = input.scanKind;
  if (scanKindInput !== undefined) {
    if (Array.isArray(scanKindInput)) {
      filters.push(inArray(agsGraphQualityScans.scanKind, scanKindInput));
    } else {
      filters.push(eq(agsGraphQualityScans.scanKind, scanKindInput as string));
    }
  }
  const scopeInput = input.scope;
  if (scopeInput !== undefined) {
    if (Array.isArray(scopeInput)) {
      filters.push(inArray(agsGraphQualityScans.scope, scopeInput));
    } else {
      filters.push(eq(agsGraphQualityScans.scope, scopeInput as string));
    }
  }

  const candidates = await db
    .select({ id: agsGraphQualityScans.id })
    .from(agsGraphQualityScans)
    .where(and(...filters));

  if (candidates.length === 0) {
    return ZERO_RESULT;
  }

  const scanIds = candidates.map((r) => Number(r.id));

  // Cascade-delete findings (children) first — the FK is declared
  // without onDelete(), so Drizzle generates NO ACTION / RESTRICT.
  // Deleting parent first would fail FK constraint.
  const deletedFindings = await db
    .delete(agsGraphQualityFindings)
    .where(inArray(agsGraphQualityFindings.scanId, scanIds))
    .returning({ id: agsGraphQualityFindings.id });

  const deletedScans = await db
    .delete(agsGraphQualityScans)
    .where(inArray(agsGraphQualityScans.id, scanIds))
    .returning({ id: agsGraphQualityScans.id });

  return {
    deletedScansCount: deletedScans.length,
    deletedFindingsCount: deletedFindings.length,
  };
}
