/**
 * Graph Projection Drift Detector.
 *
 * Phase 1.7 / 7.5 / 21. Periodically compares Postgres source-of-truth row
 * counts vs Neo4j projection state. Emits drift events for remediation.
 *
 * ADR: docs/architecture/agent-studio-graph-projection-sync.md §2.7
 */

import type { GraphRepository } from "../repository/index.js";

export type DriftClass = "missing_in_neo4j" | "extra_in_neo4j" | "stale_version" | "permission_leak";

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
