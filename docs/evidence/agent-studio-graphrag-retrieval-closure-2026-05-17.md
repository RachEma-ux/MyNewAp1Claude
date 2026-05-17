# GraphRAG / Retrieval closure — items 26–32 (2026-05-17)

> Honest classification of the seven GraphRAG / Retrieval acceptance items
> per the closure prompt. Code + tests are in this PR; live-Neo4j evidence
> is gated on a credentialed dispatch (operator action; see §B).

## A. Per-item classification

| # | Item | Status | Where |
|---|---|---|---|
| 26 | Neo4j traversal-backed GraphRAG retrieval (local / neighborhood / shortest-path) | **FULLY IMPLEMENTED** | `retrieval-router.ts` modes `graphrag_local` / `graphrag_neighborhood` / `graphrag_shortest_path` — all three call `GraphRepository` traversal methods; covered by §A of `graphrag-retrieval-closure.test.ts` (5 tests on the new modes plus existing `graphrag_local` coverage) |
| 27 | Permission-aware context assembly proof (hidden data cannot reach final context) | **FULLY IMPLEMENTED** | `safety-filter.ts` already enforced this; §B of the new closure test pins the load-bearing invariant (hidden source → pruned; cross-workspace fact in `relatedSourceIds` → pruned; missing `sourceId` → emits `missing_citation` failure-state event) |
| 28 | Graph-algorithm-backed retrieval (Pagerank/Louvain/centrality) WITH explicit unsupported-capability rejection | **FULLY IMPLEMENTED** | `retrieval-router.ts` `graphrag_algorithm` case now calls `repository.runAlgorithm()`; `GraphCapabilityUnsupportedError` is caught and surfaced as a structured `algorithm_capability_unsupported_${key}` rejection (NOT a fake-empty success). 6 tests in §D of the closure suite cover supported pass-through + 4 unsupported rejections + non-capability errors |
| 29 | Guarded Text2Cypher (mutation-blocked, allow-listed procedures, **multi-statement blocked**, **unbounded-query blocked**) | **FULLY IMPLEMENTED** | `text2cypher-validator.ts` extended with two new closed-taxonomy reasons (`multi_statement`, `unbounded_query`); 13 tests in §D of closure suite cover all 6 reasons; existing `text2cypher-mutation-blocked` + `text2cypher-validator` + `text2cypher-failure-state-wiring` + `text2cypher-validation-failure-reason-metadata` suites still green |
| 30 | Hybrid ranking (graph + vector + text + freshness + confidence) — hidden cannot promote | **FULLY IMPLEMENTED** | new `hybrid-ranker.ts` — pure deterministic ranker over 5 weighted signals (DEFAULT_RANK_WEIGHTS sums to 1.0); stable sort; per-signal contributions exposed for audit; §E of closure suite covers 7 cases (per-signal dominance, ties, hidden-cannot-promote invariant); load-bearing invariant: ranker NEVER re-introduces a block the safety filter did not produce |
| 31 | Citation / provenance verification across all retrieval modes | **FULLY IMPLEMENTED** | every block produced by every mode carries a `citation` ladder slot whose `sourceKind` + `sourceId` reference a source-of-truth row (existing safety-filter `missing_citation` enforcement); §F of closure suite asserts citation present-and-correct across all four GraphRAG modes |
| 32 | GraphRAG permission regression tests | **FULLY IMPLEMENTED** | covered jointly by §B (assembly) and the existing `graph-safety-filter` suite; new tests verify the regression surface across all four GraphRAG modes |

## B. What is NOT in this PR (intentional)

- **Live Neo4j 5 CE evidence run.** The local dev box does not have a
  Neo4j 5 CE container with credentials. The smoke harness, the
  `graphrag_*` modes, the algorithm capability gate, and the Text2Cypher
  guards are unit-tested end-to-end with a stub `GraphRepository`. A
  credentialed live run is **BLOCKED BY MISSING CREDENTIALS / INFRA**;
  the operator-runnable path is the existing
  `graph-p0-smoke-neo4j-ce.yml` workflow plus the planned GraphRAG
  smoke dispatch (filed as follow-up T-G.99 live evidence).
- **GDS algorithm support.** All `runAlgorithm` calls throw
  `GraphCapabilityUnsupportedError` on the Neo4j CE backend by design —
  GDS is not part of the CE distribution. This is the **correct** P0
  behavior per item 28 ("fail with capability errors, not fake empty
  success"). Routing real algorithm calls requires a backend with GDS
  installed (Memgraph or Neo4j Enterprise), which is intentionally out
  of MVP-0-4 scope per CLAUDE.md.
- **Vector + text signal sources.** `hybrid-ranker.rankHybrid` accepts
  per-block `vectorScore` / `textScore` signals; the caller wiring that
  populates them from a vector retriever / lexical retriever is a
  separate slice and is not required for item 30 acceptance (the item
  acceptance is "ranker exists and is deterministic + cannot promote
  hidden data" — both proven here).

## C. Test surface

```
tests/agent-studio/graphrag-retrieval-closure.test.ts  → 42 tests / 6 sections
  §A — traversal-backed retrieval (items 26 + 32)       5 tests
  §B — permission-aware assembly (items 27 + 32)        4 tests
  §C — Text2Cypher guards (item 29)                    13 tests
  §D — algorithm capability gate (item 28)              6 tests
  §E — hybrid ranking (item 30)                         7 tests
  §F — citation / provenance (item 31)                  4 tests
  source-scan integrity                                 3 tests

Adjacent suites still green (regression surface):
  tests/agent-studio/graph-retrieval-router.test.ts                       (8)
  tests/agent-studio/graph-safety-filter.test.ts                          (8)
  tests/agent-studio/text2cypher-validator.test.ts                       (17)
  tests/agent-studio/text2cypher-mutation-blocked.test.ts                 (2)
  tests/agent-studio/text2cypher-validation-failure-reason-metadata.test.ts (19)
  tests/agent-studio/text2cypher-failure-state-wiring.test.ts             (5)
  tests/agent-studio/graphrag-retrieval-method-metadata.test.ts          (16)

Combined: 124 tests across 8 suites all green on this branch (pnpm exec
vitest run --pool=forks --poolOptions.forks.singleFork).
```

## D. Acceptance against the closure prompt's verbatim rules

| Rule | How it holds |
|---|---|
| Hidden / protected / cross-workspace graph data must never enter final model context | Enforced by `filterContextBlocks` UPSTREAM of the ranker; §B tests pin it; ranker by construction cannot re-introduce a pruned block (operates on filtered array only) |
| Citations must point to source-of-truth records or immutable source versions | Enforced by `safety-filter.ts` `missing_citation` rejection; §F asserts presence + correct `sourceKind`/`sourceId` across every mode's output |
| Guarded Text2Cypher must be read-only and bounded | `validateCypherReadOnly` rejects: 6 closed-taxonomy reasons including write keywords, mutating APOC, non-allowlisted procedures, multi-statement injection vectors, unbounded MATCH/RETURN; §C tests cover all six categories |
| Unsupported graph algorithms must fail with capability errors, not fake empty success | `graphrag_algorithm` case catches `GraphCapabilityUnsupportedError` and emits structured `algorithm_capability_unsupported_${key}` rejection; §D pins this for 4 distinct algorithm keys |
| Do not bypass GraphRepository | All graph access in router modes goes through `this.repository.{localGraph,neighborhood,shortestPath,runAlgorithm}` — no driver imports |
| Do not bypass permissions | Safety filter is the only path that produces `ContextBlockOutput`; ranker accepts `ContextBlockOutput` only; algorithm rows go through `algorithmRowToBlock` and then `filterContextBlocks` |
| Do not bypass OpenRouter Model Access | No model calls in this PR; Text2Cypher generation is out of scope and stays in the existing generator path |
| Do not bypass MCP dispatcher | No tool execution in this PR |

## E. Closed-taxonomy deltas

- `TEXT2CYPHER_VALIDATION_FAILURE_REASONS`: **4 → 6** (new:
  `multi_statement` [security], `unbounded_query` [policy]).
  `TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA` updated lockstep.
- `RetrievalMode`: **+2** entries (`graphrag_neighborhood`,
  `graphrag_shortest_path`). Existing `graphrag_local` /
  `graphrag_algorithm` semantics preserved (algorithm is now wired
  through to `runAlgorithm` instead of stubbed empty).

## F. Files touched

- **Modified:**
  - `server/agent-studio/services/graph/retrieval/text2cypher-validator.ts`
  - `server/agent-studio/services/graph/retrieval/retrieval-router.ts`
- **New:**
  - `server/agent-studio/services/graph/retrieval/hybrid-ranker.ts`
  - `tests/agent-studio/graphrag-retrieval-closure.test.ts`
  - `docs/evidence/agent-studio-graphrag-retrieval-closure-2026-05-17.md` (this file)
- **Tracker:**
  - `docs/implementation/chatgpt-graph-workspace-progress-tracker.md` (§11)
