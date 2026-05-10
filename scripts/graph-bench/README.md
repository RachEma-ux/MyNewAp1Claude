# Graph Backend Benchmark Harness

**Phase:** Native Graph Workspace MVP 0 — Phase 1.4
**Closure artifact for:** Phase 1.5 backend decision gate
**Status:** Skeleton + operator runbook (mirrors `scripts/load/` pattern)

---

## Purpose

Generate a 10k-note / 100k-link / 50k-node / 250k-edge fixture, run a fixed benchmark scenario set against each candidate `GraphRepository` backend (Postgres / Neo4j CE / Memgraph / FalkorDB), and emit a markdown report comparing p50/p95 against `agent-studio-native-graph-workspace-performance-targets.md`.

This harness is operator-driven. The Native Graph Workspace MVP 0 ships the harness + scenario library; operator runs against staging infra.

## Layout

```
scripts/graph-bench/
├── README.md                       — this file
├── lib/
│   ├── types.ts                    — BenchmarkScenario, BenchmarkReport, etc.
│   ├── fixtures.ts                 — fixture generators (notes, links, entities)
│   ├── scenarios.ts                — scenario library (depth-1/2/3, impact, trace, etc.)
│   ├── runner.ts                   — runs scenarios against a repository
│   └── reporter.ts                 — markdown report formatter
├── run-benchmark.ts                — CLI entry point
└── compare-backends.ts             — multi-backend comparison report
```

## Operator runbook

### 1. Pre-flight

```bash
# Ensure docker compose is available
docker compose version

# Bring up Neo4j CE locally
docker compose -f docker-compose.graph.yml up -d  # Phase 7.5 ships this file

# Verify health
curl http://localhost:7474
```

### 2. Generate fixture

```bash
GRAPH_BACKEND=postgres pnpm tsx scripts/graph-bench/generate-fixture.ts --notes 10000 --links 100000
```

Fixture writes to ASDB tables (`ags_vault_*`, `ags_graph_*`).

### 3. Run benchmark per backend

```bash
# Postgres baseline
GRAPH_BACKEND=postgres pnpm tsx scripts/graph-bench/run-benchmark.ts \
  --scenarios all \
  --iterations 30 \
  --output docs/evidence/graph-backend/2026-MM-DD-postgres-baseline/

# Neo4j CE
GRAPH_BACKEND=neo4j-ce \
  NEO4J_URI=bolt://localhost:7687 \
  NEO4J_USER=neo4j \
  NEO4J_PASSWORD=devpassword \
  pnpm tsx scripts/graph-bench/run-benchmark.ts \
  --scenarios all \
  --iterations 30 \
  --output docs/evidence/graph-backend/2026-MM-DD-neo4j-ce/

# Optional: Memgraph
GRAPH_BACKEND=memgraph pnpm tsx scripts/graph-bench/run-benchmark.ts \
  --scenarios all \
  --iterations 30 \
  --output docs/evidence/graph-backend/2026-MM-DD-memgraph/
```

### 4. Compare results

```bash
pnpm tsx scripts/graph-bench/compare-backends.ts \
  docs/evidence/graph-backend/2026-MM-DD-postgres-baseline/ \
  docs/evidence/graph-backend/2026-MM-DD-neo4j-ce/ \
  --output docs/evidence/graph-backend/2026-MM-DD-comparison/comparison.md
```

### 5. Record decision

If Neo4j CE passes all targets in `agent-studio-native-graph-workspace-performance-targets.md`:
- Update `docs/architecture/agent-studio-active-graph-backend-decision.md` Status to "Adopted (validated)".
- Append evidence reference.

If fail:
- Trigger fallback per §3 of the backend decision ADR.

## Scenarios (defined in `lib/scenarios.ts`)

| Key | Description | Target p95 |
|---|---|---|
| `note_open` | Open note with 5,000 words + 50 links | 800 ms |
| `backlinks_refresh` | Refresh backlinks after saving 100-link note | 1,500 ms |
| `note_projection_to_neo4j` | Project a note update | 2,000 ms |
| `local_graph_depth_2` | Render depth-2 local graph (≤500 nodes) | 2,000 ms |
| `permission_aware_depth_3` | Depth-3 traversal with permission filter | 2,500 ms |
| `search_10k_notes` | Full-text search across 10k notes | 1,200 ms |
| `graphrag_retrieval` | Hybrid graph + note retrieval | 2,500 ms |
| `cypher_template` | Cypher query template execution | 1,200 ms |
| `runtime_trace_load` | Runtime trace graph load (10k traces) | 1,500 ms |
| `entity_resolution_scan` | Entity resolution candidate scan | 4,000 ms |

## Status (current execution)

- **Skeleton:** READY (this file + lib/ stubs documented in continuation state).
- **Live execution:** **deferred to operator** — requires Neo4j CE deployment + 10k+ row Postgres fixture, both unavailable in MVP 0 execution environment.

The Phase 1.5 backend decision (`agent-studio-active-graph-backend-decision.md`) proceeds with **architecture-driven default** (promote Neo4j CE) and gates Phase 7.5 production deployment on operator-side benchmark validation.
