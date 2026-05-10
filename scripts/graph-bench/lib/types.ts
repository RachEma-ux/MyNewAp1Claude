/**
 * Graph Backend Benchmark Harness — types.
 *
 * Mirrors the V3 Phase 12 load assessor pattern (`scripts/load/lib/types.ts`).
 *
 * ADR: docs/architecture/agent-studio-graph-backend-evaluation-matrix.md
 */

import type { BackendKey, GraphRepository } from "../../../server/agent-studio/services/graph/repository/index.js";

export interface BenchmarkScenarioMeta {
  readonly key: string;
  readonly description: string;
  readonly targetP50Ms: number;
  readonly targetP95Ms: number;
}

export interface BenchmarkScenarioRun {
  (repo: GraphRepository): Promise<{ durationMs: number; resultCount: number }>;
}

export interface BenchmarkScenario extends BenchmarkScenarioMeta {
  run: BenchmarkScenarioRun;
}

export interface ScenarioResult {
  readonly scenarioKey: string;
  readonly backendKey: BackendKey;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly meanMs: number;
  readonly samples: number[];
  readonly resultCount: number;
  readonly passedP50: boolean;
  readonly passedP95: boolean;
}

export interface BenchmarkReport {
  readonly backendKey: BackendKey;
  readonly fixtureSize: {
    readonly notes: number;
    readonly links: number;
    readonly nodes: number;
    readonly edges: number;
  };
  readonly results: ScenarioResult[];
  readonly overallPassed: boolean;
  readonly generatedAt: string;
}
