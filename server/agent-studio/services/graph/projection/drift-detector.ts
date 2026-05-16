/**
 * Graph Projection Drift Detector.
 *
 * Phase 1.7 / 7.5 / 21. Periodically compares Postgres source-of-truth row
 * counts vs Neo4j projection state. Emits drift events for remediation.
 *
 * ADR: docs/architecture/agent-studio-graph-projection-sync.md §2.7
 */

import type { GraphRepository } from "../repository/index.js";

/**
 * Closed-taxonomy drift classification. Promoted to a tuple-derived
 * constant at T-G.39 so it.each-style lockstep tests can enumerate
 * every value and the metadata table below can drive operator UX.
 */
export const DRIFT_CLASSES = [
  "missing_in_neo4j",
  "extra_in_neo4j",
  "stale_version",
  "permission_leak",
] as const;
export type DriftClass = (typeof DRIFT_CLASSES)[number];

// ============================================================================
// Per-drift-class operator-facing metadata (T-G.39)
// ============================================================================

export type DriftClassSeverity = "warning" | "critical";

export interface DriftClassMetadata {
  /** Display label rendered in the projection-drift admin panel. */
  readonly label: string;
  /** Short operator-facing description of what this drift class means
   *  and how it arises in practice. */
  readonly description: string;
  /** Severity bucket — `permission_leak` is `critical` (security signal);
   *  the other three are `warning` (eventual-consistency signals). */
  readonly severity: DriftClassSeverity;
  /** Whether this drift class indicates a security-relevant divergence
   *  (true for `permission_leak` only — surfaces rows that exist in
   *  Neo4j but should be hidden by Postgres-side permission filters). */
  readonly isSecurityRelevant: boolean;
}

export const DRIFT_CLASS_METADATA: Readonly<
  Record<DriftClass, DriftClassMetadata>
> = {
  missing_in_neo4j: {
    label: "Missing in Neo4j",
    description:
      "Postgres has a row but the projection layer hasn't materialized it into Neo4j yet — usually a transient lag the next projection run resolves.",
    severity: "warning",
    isSecurityRelevant: false,
  },
  extra_in_neo4j: {
    label: "Extra in Neo4j",
    description:
      "Neo4j has a node that no longer exists in Postgres source-of-truth — a leftover from a delete that didn't propagate.",
    severity: "warning",
    isSecurityRelevant: false,
  },
  stale_version: {
    label: "Stale Version",
    description:
      "Both Postgres and Neo4j have the row but Neo4j's `latestVersionId` is behind Postgres — needs a re-project to catch up.",
    severity: "warning",
    isSecurityRelevant: false,
  },
  permission_leak: {
    label: "Permission Leak",
    description:
      "Neo4j has a node visible to a user-role that Postgres permission filters would hide. Security-relevant; investigate immediately.",
    severity: "critical",
    isSecurityRelevant: true,
  },
};

export function getDriftClassMetadata(c: DriftClass): DriftClassMetadata {
  return DRIFT_CLASS_METADATA[c];
}

export interface DriftEvent {
  readonly driftClass: DriftClass;
  readonly sourceId: string;
  readonly details: Record<string, unknown>;
}

export interface DriftReport {
  readonly scope: string;
  readonly scannedAt: string;
  readonly events: DriftEvent[];
  readonly summary: {
    readonly totalScanned: number;
    readonly driftCount: number;
    readonly permissionLeakCount: number;
  };
}

export interface SourceRowCount {
  readonly typeKey: string;
  readonly count: number;
}

export interface DriftDetectorInput {
  readonly scope: string;
  readonly sourceCounts: SourceRowCount[];
  readonly sampleSourceIds: { typeKey: string; id: string; latestVersionId: string }[];
}

export class DriftDetector {
  constructor(private readonly repository: GraphRepository) {}

  async scan(input: DriftDetectorInput): Promise<DriftReport> {
    const events: DriftEvent[] = [];
    let totalScanned = 0;
    let permissionLeakCount = 0;

    for (const sample of input.sampleSourceIds) {
      totalScanned++;
      const explained = await this.repository.explainNode(`${sample.typeKey.toLowerCase()}:${sample.id}`, { userRole: "admin" });
      if (!explained) {
        events.push({
          driftClass: "missing_in_neo4j",
          sourceId: sample.id,
          details: { typeKey: sample.typeKey, latestVersionId: sample.latestVersionId },
        });
        continue;
      }
      const projVersion = explained.provenance.sourceVersionId;
      if (projVersion && projVersion !== sample.latestVersionId) {
        events.push({
          driftClass: "stale_version",
          sourceId: sample.id,
          details: {
            typeKey: sample.typeKey,
            postgresVersion: sample.latestVersionId,
            neo4jVersion: projVersion,
          },
        });
      }
      if (explained.provenance.governanceStatus === "hidden") {
        const visible = await this.repository.isVisibleToUser(`${sample.typeKey.toLowerCase()}:${sample.id}`, {
          userRole: "reader",
        });
        if (visible) {
          permissionLeakCount++;
          events.push({
            driftClass: "permission_leak",
            sourceId: sample.id,
            details: { typeKey: sample.typeKey, governanceStatus: "hidden" },
          });
        }
      }
    }

    return {
      scope: input.scope,
      scannedAt: new Date().toISOString(),
      events,
      summary: {
        totalScanned,
        driftCount: events.length,
        permissionLeakCount,
      },
    };
  }
}
