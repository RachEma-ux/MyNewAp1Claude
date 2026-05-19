/**
 * GraphRepository public API barrel.
 *
 * The ONLY allowed entry point for graph access from application code.
 *
 * `getGraphRepository()` returns the active singleton based on
 * `GRAPH_BACKEND` env var:
 *   - `test`        → TestGraphRepository (in-memory)
 *   - `postgres`    → AsdbPostgresGraphRepository (Phase 7 Drizzle-backed
 *                     real impl; wired 2026-05-19, replacing the 176-LoC
 *                     skeleton that returned `{nodes:[], edges:[]}`)
 *   - `neo4j-ce`    → Neo4jCommunityGraphRepository (active backend post Phase 7.5)
 *   - `memgraph`    → MemgraphGraphRepository (read-only Bolt path)
 *   - default       → `postgres` (always available; no driver install required)
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
export { AsdbPostgresGraphRepository } from "./postgres-graph-repository-asdb.js";
export { Neo4jCommunityGraphRepository } from "./neo4j-community-graph-repository.js";
export { MemgraphGraphRepository } from "./memgraph-graph-repository.js";

import { TestGraphRepository } from "./test-graph-repository.js";
import { AsdbPostgresGraphRepository } from "./postgres-graph-repository-asdb.js";
import { Neo4jCommunityGraphRepository } from "./neo4j-community-graph-repository.js";
import { MemgraphGraphRepository } from "./memgraph-graph-repository.js";
import type { GraphRepository, BackendKey } from "./types.js";

let cachedRepository: GraphRepository | null = null;

/**
 * Returns the active GraphRepository singleton.
 *
 * Selection order:
 *   1. `GRAPH_BACKEND` env var (`test` | `postgres` | `neo4j-ce` | `memgraph`).
 *   2. Default: `postgres` (always available; no driver install required).
 *
 * The postgres path uses `AsdbPostgresGraphRepository` (the real
 * Drizzle-backed implementation over `ags_graph_nodes` /
 * `ags_graph_edges`). Wired 2026-05-19 — prior to that the
 * 176-LoC skeleton was the wired class and returned empty results
 * on every read.
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
    case "memgraph":
      // Fallback path per `agent-studio-active-graph-backend-decision.md`
      // §3. Read-only Bolt query paths (health / localGraph /
      // neighborhood / shortestPath / executeTemplate) implemented;
      // the default driver factory dynamically imports `neo4j-driver`
      // on first call so processes that do not select this backend
      // pay zero cost. Projection writes stay no-op (Postgres = SoT).
      cachedRepository = new MemgraphGraphRepository({
        endpoint: process.env.MEMGRAPH_URI ?? "bolt://localhost:7687",
        username: process.env.MEMGRAPH_USER ?? "memgraph",
        password: process.env.MEMGRAPH_PASSWORD ?? "",
        database: process.env.MEMGRAPH_DATABASE ?? "memgraph",
        // driverFactory omitted → default lazy loader resolves on first use.
      });
      break;
    case "postgres":
    default:
      cachedRepository = new AsdbPostgresGraphRepository();
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
