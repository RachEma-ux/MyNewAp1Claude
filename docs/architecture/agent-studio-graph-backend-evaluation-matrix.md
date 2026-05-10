# Agent Studio — Graph Backend Evaluation Matrix — ADR

**Owner:** Agent Studio module + Operations
**Phase:** Native Graph Workspace MVP 0 — Phase 1.5 prep
**Status:** Adopted
**Authority:** Defines candidate backends and the evaluation criteria.

---

## 1. Candidates

| Backend | Role | MVP scope |
|---|---|---|
| **Postgres** (recursive CTE over `ags_graph_*`) | Source of truth for app records; shallow graph fallback | Always active as fallback |
| **Neo4j Community Edition** | Default dedicated graph backend candidate | Active after Phase 1.5 promotion |
| **Memgraph** | Secondary benchmark candidate; in-memory C++ Cypher engine | Skeleton only unless promoted |
| **FalkorDB** | Optional low-latency Redis-anchored graph engine | Skeleton only unless promoted |
| **Neo4j Enterprise / Aura** | Future production hardening | Phase 27 |
| **CodeGraph** (separate concept) | Code intelligence layer; not a graph DB backend | Phase 20.5 / 25 |

## 2. Evaluation criteria

| Criterion | Weight | Postgres | Neo4j CE (expected) | Memgraph (expected) | FalkorDB (expected) |
|---|---|---|---|---|---|
| Depth-1/2 traversal latency | High | Acceptable | Strong | Strong | Strong |
| Depth-3 permission-aware traversal | Critical | Risky | Strong | Strong | Strong |
| Impact-analysis traversal | Critical | Risky | Strong | Strong | Strong |
| Runtime trace path loading | High | Risky | Strong | Strong | Strong |
| Cypher template support | High | None (raw SQL) | Native | Native | Cypher subset |
| Read-only Text2Cypher safety | High | N/A | Strong | Strong | Strong |
| Graph algorithm support (shortest path, centrality, community) | Medium | None | Native (APOC + GDS subset in CE) | Strong | Limited |
| Vector index | Medium | pgvector (deferred) | Native (5.x) | Native | Limited |
| Full-text index | Medium | tsvector | Native | Native | Limited |
| Permission filter pushdown | Medium | App-level | App-level | App-level | App-level |
| Query explain | Medium | EXPLAIN | PROFILE/EXPLAIN | EXPLAIN | EXPLAIN |
| Batch projection throughput | High | Strong (native SQL) | Strong | Strong | Medium |
| Streaming results | Medium | Cursor | Native | Native | Medium |
| MCP / server ecosystem maturity | Medium | Mature | Mature | Growing | New |
| Operational complexity | High | Already operated | Medium (single instance) | Medium | Low (Redis-anchored) |
| Hosting complexity | Medium | None (existing) | Docker / Aura | Docker / cloud | Redis cluster |
| Cost (MVP) | High | Free | Free CE | Free | Free |
| Migration complexity | Medium | None (existing) | Low (additive) | Medium | Medium |
| Developer ergonomics | Medium | SQL familiar | Cypher learning curve | Cypher familiar | Cypher subset |
| Community Edition vs Enterprise gap | High | N/A | Significant (clustering, RBAC, online backup) | Smaller | N/A |
| Production upgrade path | High | N/A | Aura / Enterprise | Memgraph Cloud | FalkorDB Cloud |

## 3. Selection rule

```
1. If Postgres meets all p95 targets in Phase 1.4 benchmark:
     keep Postgres as active backend; defer Neo4j CE.
2. Else if Neo4j CE meets all p95 targets in Phase 1.4 benchmark:
     promote Neo4j CE as active backend (default expected outcome).
3. Else if Memgraph meets all p95 targets in Phase 1.4 benchmark:
     promote Memgraph as active backend; document why CE failed.
4. Else:
     block Phase 7+ work; surface decision artifact for human review.
     Continue MVP 1 (workspace foundation) which does not depend on
     active backend.
```

## 4. Phase 1.4 benchmark scenarios

Mandatory:
- Depth-1 traversal (10k notes / 100k links)
- Depth-2 traversal
- Depth-3 traversal
- Permission-aware filtering
- Impact analysis (find all dependents within depth-3 of a node)
- Runtime trace graph load (10k traces)
- Projection sync throughput
- Cypher template execution baseline

Optional:
- Graph algorithm benchmarks (shortest path, centrality)
- Vector + graph hybrid retrieval

## 5. Memgraph waiver path

Memgraph evaluation may be deferred / waived if:
- Local Docker Memgraph image fails to start in dev env.
- Cypher dialect compatibility with Phase 12.5 templates is unclear.
- Time budget for Phase 1.4 spike is exhausted.

Waiver requires explicit note in `docs/architecture/agent-studio-active-graph-backend-decision.md` with rationale and follow-up trigger conditions.

## 6. Neo4j Aura Agent reference

Neo4j Aura Agent is evaluated as architectural **reference**, not dependency. See `agent-studio-neo4j-aura-agent-reference-architecture.md`. Custom Agent Studio Graph Agent Lite is the chosen path because of integration coupling with existing CAG / RAC / MCP / OpenRouter / governance / runtime-trace surfaces.

## 7. Acceptance

- [x] Candidate set defined.
- [x] Evaluation criteria locked.
- [x] Selection rule defined.
- [x] Memgraph waiver path defined.
- [ ] Phase 1.4 benchmark scenarios run; results captured under `docs/evidence/graph-backend/`.
- [ ] Phase 1.5 backend decision artifact merged.

## 8. Evidence

- Companion: `agent-studio-graph-repository-and-backend-strategy.md`.
- Companion: `agent-studio-neo4j-community-edition-graph-backend.md`.
- Companion: `agent-studio-active-graph-backend-decision.md` (Phase 1.5 output).
- KGIA's existing Neo4j adapter informs CE evaluation cost.
