/**
 * GraphRepository public API barrel.
 *
 * The ONLY allowed entry point for graph access from application code.
 *
 * `getGraphRepository()` returns the active singleton based on
 * `GRAPH_BACKEND` env var:
 *   - `test`        → TestGraphRepository (in-memory)
 *   - `postgres`    → PostgresGraphRepository (recursive CTE fallback)
 *   - `neo4j-ce`    → Neo4jCommunityGraphRepository (active backend post Phase 7.5)
 *   - default       → `postgres` for tests, `neo4j-ce` once Phase 1.5 closes
 *
 * Boundary tests (tests/agent-studio/graph-repository-boundary.test.ts):
 *   - No `import` from `neo4j-driver` outside this directory.
 *   - No raw Cypher in non-template code.
 *   - No direct graph-table SQL outside this directory.
 */

export type {
  BackendCapabilities,
  BackendHealth,
  BackendKey,
  BenchmarkResult,
  BenchmarkScenario,
  EdgeIdentity,
  EdgeProperties,
  GraphAlgorithmInput,
  GraphAlgorithmKey,
  GraphAlgorithmRepository,
  GraphAlgorithmResult,
  GraphBackendHealthRepository,
  GraphBenchmarkRepository,
  GraphExplainRepository,
  GraphPermissionRepository,
  GraphProjectionRepository,
  GraphProjectionSyncRepository,
  GraphQueryTemplateRepository,
  GraphRepository,
  GraphTraversalRepository,
  NodeIdentity,
  NodeProperties,
  ProjectionResult,
  ProjectionSyncJobInput,
  ProjectionWrite,
  ProvenanceFields,
  QueryTemplateExecutionInput,
  QueryTemplateExecutionResult,
  RuntimeContext,
  TraversalOptions,
  TraversalPath,
} from "./types.js";

export {
  GraphCapabilityUnsupportedError,
  GraphPermissionDeniedError,
  GraphProjectionDriftError,
  GraphTimeoutError,
} from "./types.js";

export {
  TEST_CAPABILITIES,
  POSTGRES_CAPABILITIES,
  NEO4J_CE_CAPABILITIES,
  MEMGRAPH_CAPABILITIES,
  FALKOR_CAPABILITIES,
  getCapabilities,
  backendSupports,
} from "./capabilities.js";

export { TestGraphRepository } from "./test-graph-repository.js";
export { PostgresGraphRepository } from "./postgres-graph-repository.js";
export { Neo4jCommunityGraphRepository } from "./neo4j-community-graph-repository.js";

import { TestGraphRepository } from "./test-graph-repository.js";
import { PostgresGraphRepository } from "./postgres-graph-repository.js";
import { Neo4jCommunityGraphRepository } from "./neo4j-community-graph-repository.js";
import type { GraphRepository, BackendKey } from "./types.js";

let cachedRepository: GraphRepository | null = null;

/**
 * Returns the active GraphRepository singleton.
 *
 * Selection order:
 *   1. `GRAPH_BACKEND` env var (`test` | `postgres` | `neo4j-ce`).
 *   2. Default: `postgres` (always available).
 *
 * Phase 7.5: change default to `neo4j-ce` once Phase 1.5 backend
 * decision closes positively.
 */
export function getGraphRepository(): GraphRepository {
  if (cachedRepository) return cachedRepository;
  const requested = (process.env.GRAPH_BACKEND ?? "postgres") as BackendKey;

  switch (requested) {
    case "test":
      cachedRepository = new TestGraphRepository();
      break;
    case "neo4j-ce":
      cachedRepository = new Neo4jCommunityGraphRepository({
        endpoint: process.env.NEO4J_URI ?? "bolt://localhost:7687",
        username: process.env.NEO4J_USER ?? "neo4j",
        password: process.env.NEO4J_PASSWORD ?? "neo4j",
        database: process.env.NEO4J_DATABASE ?? "neo4j",
      });
      break;
    case "postgres":
    default:
      cachedRepository = new PostgresGraphRepository();
      break;
  }

  return cachedRepository;
}

/**
 * Test-only: reset the singleton between tests.
 */
export function _resetGraphRepository(): void {
  cachedRepository = null;
}
