# Agent Studio — Native Graph Workspace Performance Targets — ADR

**Owner:** Agent Studio module + Operations
**Phase:** Native Graph Workspace MVP 0 — Phase 1
**Status:** Adopted

---

## 1. MVP scale targets

10,000 notes / 100,000 links / 50,000 graph nodes / 250,000 graph edges / 10,000 runtime traces / 1,000 decision traces / 1,000 graph skill references / 500 golden questions.

## 2. Latency targets

| Benchmark | p50 target | p95 target |
|---|---|---|
| Open note (5,000 words + 50 links) | 300 ms | 800 ms |
| Refresh backlinks (100 links) | 500 ms | 1,500 ms |
| Project note update to Neo4j CE | 500 ms | 2,000 ms |
| Render local graph depth 2 (≤500 nodes) | 700 ms | 2,000 ms |
| Permission-aware depth-3 Neo4j traversal | 900 ms | 2,500 ms |
| Search across 10k notes | 300 ms | 1,200 ms |
| GraphRAG retrieval (graph + notes) | 800 ms | 2,500 ms |
| Cypher query template execution | 300 ms | 1,200 ms |
| Runtime trace graph load | 500 ms | 1,500 ms |
| Graph Agent Lite cited answer | 2,500 ms | 8,000 ms |
| Entity resolution candidate scan | 1,000 ms | 4,000 ms |
| Full Neo4j projection rebuild | scheduled (no interactive target) | — |

## 3. Regression policy

- Phase 20 ships benchmark suite under `scripts/graph-bench/`.
- Phase 21 wires benchmark CI to fail on p95 regression > 20% from baseline.
- Each backend (Postgres / Neo4j CE / Memgraph) reports separately.
- Failures require explicit waiver in PR description.

## 4. Acceptance

- [x] Targets locked.
- [ ] Phase 20 benchmark suite ships.
- [ ] Phase 21 benchmark CI ships.
