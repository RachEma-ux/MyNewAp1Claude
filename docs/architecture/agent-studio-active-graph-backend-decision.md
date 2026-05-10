# Agent Studio — Active Graph Backend Decision — ADR

**Owner:** Agent Studio module + Operations
**Phase:** Native Graph Workspace MVP 0 — Phase 1.5 (Backend Decision Gate)
**Status:** **Adopted (provisional)** — locked decision pending live benchmark results.
**Authority:** Phase 1.5 closure artifact. Closes G3 of the execution plan. Authorizes Phase 7+ work to begin.

---

## 1. Decision

**Promote Neo4j Community Edition as the active dedicated graph backend for Native Graph Workspace MVP 2 onward.**

This decision is **architecture-driven** because live benchmark execution requires Neo4j infrastructure that is not available in the current execution environment. The decision is gated on **operator-side benchmark validation** before Phase 7.5 (active backend implementation) ships to staging.

If operator-side benchmarks invalidate the decision, the alternates ranked below take effect.

## 2. Decision rationale

### 2.1 Repository state evidence (collected 2026-05-10)

- **Existing KGIA Neo4j integration:** `server/modules/kgia/infrastructure/neo4j-adapter.ts` is already a stub awaiting `neo4j-driver` integration. Promoting Neo4j CE harvests this investment rather than discarding it.
- **Existing GraphRAG control plane:** `drizzle/tables/graphrag.ts` already declares `graphrag_sources`, `graphrag_sync_runs`, `graphrag_index_runs`, `graphrag_query_runs`, `graphrag_artifact_registry`. Neo4j CE projection complements these existing tables; does not replace them.
- **Existing KGRA Agent:** `server/kgra-agent/` runs against RAGDB.`kgra_entities` / `kgra_relationships` (Postgres). Neo4j CE projection of these tables enables typed graph traversal that Postgres recursive-CTE struggles with at depth-3+ scale.
- **Existing UI scaffolding:** `client/src/pages/kgia/` houses 6 pages (workbench, sources, benchmarks, governance, oversight) designed against Neo4j-backed sources.

### 2.2 Architectural fit

Per `agent-studio-graph-backend-evaluation-matrix.md`:

| Criterion | Postgres baseline | Neo4j CE (expected) |
|---|---|---|
| Depth-3 permission-aware traversal | High risk at scale | Strong (native Cypher) |
| Cypher template support | None | Native |
| Query explain | EXPLAIN | PROFILE/EXPLAIN |
| Graph algorithms | None | Native (APOC + GDS subset) |
| Production upgrade path | N/A | Aura / Enterprise |
| Existing investment | Existing (CTE) | Existing (KGIA stub) |

The architectural delta favors Neo4j CE for traversal-heavy workloads. Postgres remains the source of truth for app records (notes, governance, runtime traces) per `agent-studio-postgres-neo4j-responsibility-split.md`.

### 2.3 Why not Postgres-only

Native Graph Workspace targets 250k graph edges at MVP scale. Postgres recursive-CTE traversal has known p95 risk at depth-3 with permission filtering. Without a dedicated backend, advanced graph features (impact analysis, runtime trace path, GraphRAG expansion) face latency cliffs.

### 2.4 Why not Memgraph / FalkorDB at MVP

- Memgraph has Cypher dialect compatibility risk against Phase 12.5 templates and adds operational complexity.
- FalkorDB targets low-latency Redis-anchored use cases; its Cypher subset risks template compatibility.
- Both remain **secondary candidates** if operator benchmarks invalidate Neo4j CE.

## 3. Conditional fallback ranking

If operator benchmarks fail Neo4j CE on any of the targets in `agent-studio-native-graph-workspace-performance-targets.md`, fall back in this order:

1. **Memgraph** — re-run benchmark suite. If it passes targets, promote.
2. **Postgres recursive-CTE only** — accept depth-2 cap; defer depth-3 features to a future hardening phase.
3. **FalkorDB** — only if benchmarked superior to both above.
4. **Block Phase 7+ advanced graph work** — surface decision artifact for human review. MVP 1 (workspace foundation) continues since it does not depend on the active backend.

## 4. Operator-side validation requirements

Before Phase 7.5 ships to staging, operator must:

1. Stand up Neo4j CE locally via `docker-compose.graph.yml` (defined in `agent-studio-neo4j-community-edition-graph-backend.md`).
2. Generate the 10k-note / 100k-link / 50k-node / 250k-edge fixture via `scripts/graph-bench/` (Phase 1.4 harness).
3. Run benchmark suite against `Neo4jCommunityGraphRepository` (Phase 7.5 wires the real driver).
4. Compare p50/p95 against `agent-studio-native-graph-workspace-performance-targets.md`.
5. Record results under `docs/evidence/graph-backend/2026-MM-DD-neo4j-ce-benchmark/`.
6. If pass: this ADR transitions Status from "Adopted (provisional)" to "Adopted (validated)".
7. If fail: trigger fallback per §3.

## 5. Provisional artifact bypass

**Why this decision proceeds without live benchmark in MVP 0:**

The execution plan defines G3 (backend decision) as the gate that unblocks Phase 7+. Without **some** decision, MVP 0 cannot close and MVP 1+ blocks indefinitely. The operator-runbook closure pattern (precedent: V3 Phase 12 load assessor) authorizes architecture-driven default decisions when:
- Live infra is unavailable in execution context.
- The default decision is architecturally justified (existing KGIA stub, KGRA `kgra_*` tables, depth-3 traversal risk on Postgres).
- A clear operator validation path is documented.
- A clear fallback path exists if operator validation invalidates the default.

This ADR meets all four conditions.

## 6. What this unblocks

- **Phase 1.6** ontology / constraints / ER work (already in-flight).
- **Phase 1.7** projection sync architecture.
- **Phase 7** typed graph store using `Neo4jCommunityGraphRepository` skeleton.
- **Phase 7.5** active Neo4j CE wiring (operator-validated).
- **Phase 8 / 9** graph view UI work.
- **Phase 10–14** runtime references / promotion / GraphRAG / Graph Agent.

## 7. What this does NOT unblock until validation

- Phase 7.5 production deployment (gated on benchmark pass).
- Phase 27 Neo4j Enterprise / Aura migration assessment (deferred).

## 8. Acceptance

- [x] Architecture-driven default decision recorded.
- [x] Conditional fallback ranking documented.
- [x] Operator-side validation requirements defined.
- [x] Evidence directory pattern established.
- [ ] Operator runs Phase 1.4 benchmark suite against Neo4j CE.
- [ ] Benchmark results recorded under `docs/evidence/graph-backend/`.
- [ ] Status transitions to "Adopted (validated)" or fallback triggers.

## 9. Evidence

- `server/modules/kgia/infrastructure/neo4j-adapter.ts` (existing stub).
- `server/kgra-agent/` (existing reasoning pipeline using `kgra_*` tables).
- `drizzle/tables/graphrag.ts` (existing GraphRAG control plane).
- `client/src/pages/kgia/*` (existing UI scaffolding).
- Companion: `agent-studio-graph-backend-evaluation-matrix.md`.
- Companion: `agent-studio-neo4j-community-edition-graph-backend.md`.
- Companion: `agent-studio-graph-repository-and-backend-strategy.md`.
- Companion: `agent-studio-native-graph-workspace-performance-targets.md`.
