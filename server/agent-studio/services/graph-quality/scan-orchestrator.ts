/**
 * Graph Quality scan orchestrator.
 *
 * Phase 23 §1. Runs registered scanners against the graph repository
 * and persists findings into ASDB. Each scanner is a pure function
 * over a (nodes, edges) sample plus a callback to record findings.
 *
 * Scan lifecycle:
 *   1. Open a row in `ags_graph_quality_scans` with status="running"
 *   2. For each registered scanner kind requested, sample the graph
 *      and pass the sample to the scanner.
 *   3. Findings emitted by the scanner are inserted into
 *      `ags_graph_quality_findings`.
 *   4. Flip status="completed" (or "failed"), stamp `findingsCount`.
 *
 * Phase 23 ships scanners incrementally; this PR adds the orchestrator
 * + scanner registry + first scanner (`orphan_node`). Subsequent PRs
 * add duplicate_entity, missing_property, stale_node, drift, etc.
 *
 * ADR: docs/architecture/agent-studio-graph-correction-strategy.md
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphQualityFindings,
  agsGraphQualityScans,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import type { GraphRepository } from "../graph/repository/index.js";
import type {
  EdgeIdentity,
  NodeIdentity,
} from "../graph/repository/types.js";

export interface QualityFinding {
  readonly findingClass: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly sourceTypeKey?: string;
  readonly sourceId?: string;
  readonly details?: Record<string, unknown>;
}

export interface QualityScanSample {
  readonly nodes: readonly NodeIdentity[];
  readonly edges: readonly EdgeIdentity[];
  readonly truncated: boolean;
}

export type QualityScanner = (
  sample: QualityScanSample,
) => readonly QualityFinding[];

export interface QualityScannerRegistration {
  readonly scanKind: string;
  readonly run: QualityScanner;
}

export interface RunQualityScanInput {
  readonly scanKind: string;
  readonly scope?: string;
  readonly sampleSize?: number;
}

export interface RunQualityScanOptions {
  readonly registry?: readonly QualityScannerRegistration[];
  readonly repository: GraphRepository;
  readonly getDb?: typeof getAsDb;
}

export interface RunQualityScanResult {
  readonly scanId: number | null;
  readonly status: "completed" | "failed" | "skipped";
  readonly findingsCount: number;
  readonly errorMessage?: string;
}

const DEFAULT_SAMPLE_SIZE = 5000;

export class UnknownScanKindError extends Error {
  constructor(kind: string) {
    super(`No scanner registered for scanKind="${kind}"`);
    this.name = "UnknownScanKindError";
  }
}

/**
 * Opens a scan row, runs the registered scanner, persists findings,
 * closes the scan row. Returns a summary. ASDB-null → status="skipped"
 * with scanId=null (the caller is the operator UI; a missing ASDB
 * is reported, not a thrown error).
 */
export async function runQualityScan(
  input: RunQualityScanInput,
  options: RunQualityScanOptions,
): Promise<RunQualityScanResult> {
  const getDb = options.getDb ?? getAsDb;
  const registry = options.registry ?? [];
  const scanner = registry.find((r) => r.scanKind === input.scanKind);
  if (!scanner) throw new UnknownScanKindError(input.scanKind);

  const db = getDb();
  if (!db) {
    return { scanId: null, status: "skipped", findingsCount: 0 };
  }

  const inserted = await db
    .insert(agsGraphQualityScans)
    .values({
      scanKind: input.scanKind,
      scope: input.scope ?? null,
      startedAt: new Date(),
      status: "running",
    })
    .returning({ id: agsGraphQualityScans.id });
  const scanId = inserted[0]?.id;
  if (!scanId) {
    return {
      scanId: null,
      status: "failed",
      findingsCount: 0,
      errorMessage: "Failed to insert scan row",
    };
  }

  try {
    const sample = await options.repository.globalGraphSample(
      {
        maxDepth: 1,
        maxResults: input.sampleSize ?? DEFAULT_SAMPLE_SIZE,
      },
      {},
    );
    const findings = scanner.run({
      nodes: sample.nodes,
      edges: sample.edges,
      truncated: sample.truncated,
    });

    if (findings.length > 0) {
      await db.insert(agsGraphQualityFindings).values(
        findings.map((f) => ({
          scanId,
          findingClass: f.findingClass,
          severity: f.severity,
          sourceTypeKey: f.sourceTypeKey ?? null,
          sourceId: f.sourceId ?? null,
          details: f.details ?? null,
        })),
      );
    }

    await db
      .update(agsGraphQualityScans)
      .set({
        status: "completed",
        completedAt: new Date(),
        findingsCount: findings.length,
      })
      .where(eq(agsGraphQualityScans.id, scanId));

    return { scanId, status: "completed", findingsCount: findings.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(agsGraphQualityScans)
      .set({
        status: "failed",
        completedAt: new Date(),
      })
      .where(eq(agsGraphQualityScans.id, scanId));
    return {
      scanId,
      status: "failed",
      findingsCount: 0,
      errorMessage: msg,
    };
  }
}
