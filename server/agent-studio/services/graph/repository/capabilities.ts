/**
 * Backend capability registry.
 *
 * Each backend declares its capabilities. Application code that requires
 * a capability must check before invoking — gracefully degrade or reject
 * if absent.
 *
 * ADR: docs/architecture/agent-studio-graph-repository-and-backend-strategy.md §2.3
 */

import type { BackendCapabilities, BackendKey } from "./types.js";

const ALL_FALSE: BackendCapabilities = Object.freeze({
  supportsCypher: false,
  supportsGql: false,
  supportsRecursiveTraversal: false,
  supportsGraphAlgorithms: false,
  supportsVectorIndex: false,
  supportsFullTextIndex: false,
  supportsPermissionFilterPushdown: false,
  supportsMaterializedPaths: false,
  supportsQueryExplain: false,
  supportsBatchProjection: false,
  supportsTemporalQueries: false,
  supportsStreamingResults: false,
  supportsCommunityEditionLimitations: false,
  supportsEnterpriseUpgradePath: false,
});

/**
 * In-memory test backend — supports everything an interface needs to type-check.
 * Behavior is governed by the test fixture, not the capability flags.
 */
export const TEST_CAPABILITIES: BackendCapabilities = Object.freeze({
  ...ALL_FALSE,
  supportsCypher: false,
  supportsRecursiveTraversal: true,
  supportsPermissionFilterPushdown: true,
  supportsBatchProjection: true,
});

/**
 * Postgres baseline — recursive CTE traversal, app-level permissions.
 */
export const POSTGRES_CAPABILITIES: BackendCapabilities = Object.freeze({
  ...ALL_FALSE,
  supportsRecursiveTraversal: true,
  supportsPermissionFilterPushdown: false, // app-level only
  supportsQueryExplain: true,
  supportsFullTextIndex: true, // tsvector
  supportsBatchProjection: true,
  supportsTemporalQueries: true,
});

/**
 * Neo4j Community Edition — Cypher, graph algorithms (subset), no clustering.
 */
export const NEO4J_CE_CAPABILITIES: BackendCapabilities = Object.freeze({
  ...ALL_FALSE,
  supportsCypher: true,
  supportsRecursiveTraversal: true,
  supportsGraphAlgorithms: true, // APOC subset; full GDS in Enterprise
  supportsVectorIndex: true, // Neo4j 5.x
  supportsFullTextIndex: true,
  supportsPermissionFilterPushdown: false, // CE limitation; app-level
  supportsMaterializedPaths: true,
  supportsQueryExplain: true,
  supportsBatchProjection: true,
  supportsTemporalQueries: false, // basic; full temporal in Enterprise
  supportsStreamingResults: true,
  supportsCommunityEditionLimitations: true,
  supportsEnterpriseUpgradePath: true,
});

/**
 * Memgraph — Cypher-compatible, in-memory.
 * Skeleton-only unless promoted by Phase 1.5.
 */
export const MEMGRAPH_CAPABILITIES: BackendCapabilities = Object.freeze({
  ...ALL_FALSE,
  supportsCypher: true,
  supportsRecursiveTraversal: true,
  supportsGraphAlgorithms: true,
  supportsFullTextIndex: true,
  supportsQueryExplain: true,
  supportsBatchProjection: true,
  supportsStreamingResults: true,
});

/**
 * FalkorDB — Cypher subset over Redis.
 * Skeleton-only unless promoted.
 */
export const FALKOR_CAPABILITIES: BackendCapabilities = Object.freeze({
  ...ALL_FALSE,
  supportsCypher: true,
  supportsRecursiveTraversal: true,
  supportsBatchProjection: true,
});

const REGISTRY: Record<BackendKey, BackendCapabilities> = Object.freeze({
  test: TEST_CAPABILITIES,
  postgres: POSTGRES_CAPABILITIES,
  "neo4j-ce": NEO4J_CE_CAPABILITIES,
  memgraph: MEMGRAPH_CAPABILITIES,
  falkor: FALKOR_CAPABILITIES,
});

export function getCapabilities(backendKey: BackendKey): BackendCapabilities {
  return REGISTRY[backendKey];
}

export function backendSupports(
  backendKey: BackendKey,
  capability: keyof BackendCapabilities,
): boolean {
  return REGISTRY[backendKey][capability];
}
