# Agent Studio — GraphRepository and Backend Strategy — ADR

**Owner:** Agent Studio module + KGIA + Operations
**Phase:** Native Graph Workspace MVP 0 — Phase 1.2
**Status:** Adopted
**Authority:** Locks the GraphRepository abstraction. Every graph operation must go through this interface; no direct neo4j-driver / SQL graph queries outside repository / query template registry.

---

## 1. Problem statement

Existing graph access is fragmented:
- KGIA has a stub Neo4j adapter (`server/modules/kgia/infrastructure/neo4j-adapter.ts`).
- KGRA reads `kgra_entities` / `kgra_relationships` directly via Drizzle.
- GraphRAG worker (Python) hits its own data plane.

Adding Neo4j CE without consolidation would create a fourth ungoverned access path.

## 2. Decision

### 2.1 GraphRepository interface (mandatory boundary)

```typescript
// server/agent-studio/services/graph/repository/types.ts

export interface GraphRepository
  extends GraphTraversalRepository,
          GraphProjectionRepository,
          GraphProjectionSyncRepository,
          GraphQueryTemplateRepository,
          GraphAlgorithmRepository,
          GraphPermissionRepository,
          GraphExplainRepository,
          GraphBenchmarkRepository,
          GraphBackendHealthRepository {
  readonly backendKey: BackendKey;
  readonly capabilities: BackendCapabilities;
}
```

Sub-interfaces:

```typescript
GraphTraversalRepository       // localGraph, globalGraph, neighborhood, expandFrom
GraphProjectionRepository      // upsertNode, upsertEdge, deleteNode, deleteEdge
GraphProjectionSyncRepository  // applyProjectionJob, snapshot, drift detection
GraphQueryTemplateRepository   // executeTemplate(templateId, params, runtimeCtx)
GraphAlgorithmRepository       // shortestPath, centrality, similarity (read-only)
GraphPermissionRepository      // filterByPermissions, isVisibleToUser
GraphExplainRepository         // explainPath, explainNode, explainEdge
GraphBenchmarkRepository       // runBenchmark(scenario, dataset)
GraphBackendHealthRepository   // health(): { status, latencyMs, errors }
```

### 2.2 Backend implementations

```
GraphRepository
├── PostgresGraphRepository       — shallow fallback over ags_graph_*; ALWAYS available
├── Neo4jCommunityGraphRepository  — active backend (wraps KGIA adapter)
├── MemgraphGraphRepository        — benchmark candidate (skeleton only unless adopted)
├── FalkorDbGraphRepository        — benchmark candidate (skeleton only unless adopted)
└── TestGraphRepository            — in-memory; used by tests + dev-mode UI before Neo4j is wired
```

### 2.3 Capability registry

```typescript
export interface BackendCapabilities {
  readonly supportsCypher: boolean;
  readonly supportsGql: boolean;
  readonly supportsRecursiveTraversal: boolean;
  readonly supportsGraphAlgorithms: boolean;
  readonly supportsVectorIndex: boolean;
  readonly supportsFullTextIndex: boolean;
  readonly supportsPermissionFilterPushdown: boolean;
  readonly supportsMaterializedPaths: boolean;
  readonly supportsQueryExplain: boolean;
  readonly supportsBatchProjection: boolean;
  readonly supportsTemporalQueries: boolean;
  readonly supportsStreamingResults: boolean;
  readonly supportsCommunityEditionLimitations: boolean;
  readonly supportsEnterpriseUpgradePath: boolean;
}
```

Each backend declares its capabilities. Application code that requires a capability must check via `repository.capabilities.X` before invoking — gracefully degrade or reject if absent.

### 2.4 Backend selection

Selection order at boot (per-environment):
1. Read env var `GRAPH_BACKEND` (`neo4j-ce` | `postgres` | `memgraph` | `falkor` | `test`).
2. If unset, default to `postgres` for tests + dev fixture mode, `neo4j-ce` once Phase 1.5 closes.
3. Selected backend instantiated as singleton; injected via `getGraphRepository()`.

### 2.5 Forbidden imports (source-scan tested)

Outside `server/agent-studio/services/graph/repository/**`:
- No `import` from `neo4j-driver`.
- No `import` from `bolt`, `neogma`, `falkor-driver`, `memgraph-cypher-driver`.
- No raw Cypher string in non-template code (template registry is the only escape hatch).
- No direct `db.execute(sql\`MATCH ...\`)` against graph tables outside repository.

Inside KGIA (`server/modules/kgia/`): unchanged. KGIA's existing Neo4j adapter is the foundation for `Neo4jCommunityGraphRepository`. The repository wraps KGIA, not the other way around.

## 3. Backend promotion strategy

```
Default decision (Phase 1.5):
  Promote Neo4j CE as active backend unless benchmark fails.

Decision rules:
  Postgres remains active backend ONLY IF it passes:
    - depth-3 permission-aware traversal p95 target
    - runtime trace graph loading p95 target
    - impact analysis p95 target
    - query cache correctness tests
    - permission leakage tests
    - projection rebuild tests

  Neo4j CE becomes active backend IF it passes:
    - depth-3 traversal target
    - permission-aware traversal target
    - runtime trace path target
    - projection sync target
    - Cypher query template target
    - GraphRAG expansion target
    - backend health / degraded-mode requirements

  If Neo4j CE fails, Memgraph may be evaluated.
  Postgres is always available as shallow fallback.
```

Decision artifact: `docs/architecture/agent-studio-active-graph-backend-decision.md`.

## 4. Test strategy

| Test | Phase | Scope |
|---|---|---|
| Source-scan: forbidden imports | every PR after Phase 1.2 | `tests/agent-studio/graph-repository-boundary.test.ts` |
| Capability matrix correctness | Phase 1.2 | each backend's declared capabilities match real behavior |
| Property-based visibility | Phase 7 | hidden source records produce no Neo4j leak |
| Projection drift correctness | Phase 7.5 | drift events fire when synthetic skew is introduced |
| Cypher mutation blocked | Phase 12.5 | guarded Text2Cypher rejects MERGE / CREATE / DELETE outside approved templates |
| Performance regression | Phase 20 | p95 within targets (`agent-studio-native-graph-workspace-performance-targets.md`) |

## 5. Consequences

**Positive:**
- Single boundary; future backend swap (Memgraph, Aura) does not require app-code changes.
- Source-scan tests prevent silent backend coupling.
- KGIA's existing investment in Neo4j adapter is preserved + hardened.

**Negative / risks:**
- Initial implementation cost — every backend needs full sub-interface impl (or `unsupported` capability + clear error).
- Capability registry can drift from actual behavior — capability matrix correctness tests are mandatory.

## 6. Acceptance

- [ ] `GraphRepository` interface lands in `server/agent-studio/services/graph/repository/types.ts`.
- [ ] `TestGraphRepository` lands and passes capability matrix correctness test.
- [ ] `PostgresGraphRepository` baseline lands.
- [ ] `Neo4jCommunityGraphRepository` skeleton lands; Phase 7.5 hardens.
- [ ] Source-scan test enforces no forbidden imports.
- [ ] Backend selection at boot via `GRAPH_BACKEND` env var.

## 7. Evidence

- KGIA Neo4j adapter: `server/modules/kgia/infrastructure/neo4j-adapter.ts`.
- KGIA query planner: `server/modules/kgia/domain/query-planner.ts`.
- Existing `tests/agent-studio/dispatcher-layering-coverage.test.ts` (boundary test pattern).
- V3 Phase 4.5 boundary-lint pattern: `scripts/check-runtime-boundaries.ts`.
