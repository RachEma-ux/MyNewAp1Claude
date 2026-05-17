# Code Graph Parser Spike — 2026-05-15

**Track:** T-E of the remaining execution plan (`agent-studio-native-graph-workspace-remaining-execution-plan.md`).
**Roadmap Phase:** 20.5 — Code Graph Parser Spike.
**Status:** Spike scoping. First slice: ADR + parser-strategy decision tree. Subsequent slices add the tree-sitter sample-ingest + performance measurement.
**Decision:** Defer parser execution; ship the strategy decision tree + boundary tests now.

---

## 0. Why a spike

Phase 25 (T-G in the remaining plan) ships the Code Intelligence Graph with 12 node types and 10 edge types — `Repository / Package / File / Class / Function / Method / ApiEndpoint / Service / DbTable / FrontendComponent / ConfigFile / TestFile` + `IMPORTS / CALLS / DECLARES / IMPLEMENTS / DEPENDS_ON / READS_FROM_TABLE / WRITES_TO_TABLE / ROUTES_TO / RENDERS_COMPONENT / TESTS`.

Building this surface naively risks two failure modes:

1. **Parser fragility** — a single tree-sitter grammar that covers TypeScript may not cover Python / Go / Java with the same fidelity. Mixed-language repos (this repo has TS server + TS client + Python data-analysis worker) need either multiple grammars or a unified abstraction.
2. **Performance cliff** — Code graphs grow O(LoC × edges-per-line). A naive ingest of this repo (~150k LoC across TS+Python) could project hundreds of thousands of nodes + millions of edges, blowing Neo4j CE's default heap and exceeding the projection-sync cron's tick budget.

The spike answers: **can we get a useful Code Intelligence Graph out of Neo4j CE for ~150k-LoC repos without triggering the Phase 27 Aura upgrade?**

---

## 1. Three parser strategies — decision tree

| Strategy | Pros | Cons | Carrying cost |
|---|---|---|---|
| **A. Single tree-sitter** — one grammar set (TS / JS / Python / Go / Java), unified emitter | One ingest path; consistent node/edge schema | Tree-sitter grammars vary in fidelity; Python tree-sitter lags on type-resolution; Go module imports need go.mod parsing outside the grammar | Medium — 5 grammars to maintain |
| **B. Per-language AST tools** — TS compiler API for TS/JS, libCST for Python, go/parser for Go | Best fidelity per language; type-resolution included | N emitters to maintain; cross-language edge resolution (TS calls Python via HTTP) requires a separate join layer | High — N parsers + N grammars + cross-edge resolver |
| **C. LLM-driven extraction** — pass file contents to a model, ask for nodes + edges | No parser maintenance; handles any language | Cost per ingest (must batch); non-deterministic; LLM hallucination of edges; expensive re-ingest on file change; cannot test parse-stability byte-for-byte | Low maintenance, high run cost |

**Recommended:** **A** (single tree-sitter) for the spike. Specifically: TypeScript + Python first, the two languages this repo actually uses. If A fails the byte-stability test (Layer 14 from the remaining plan) or the performance gate, fall back to **B** for one language and re-evaluate.

**Rejected immediately:** **C**. The Phase 23 self-correction loop already pays an LLM tax (Semantic Enrichment Agent); doubling it for code-graph ingest is a non-starter on cost grounds, and the hallucination risk inverts the "Postgres source-of-truth" invariant — LLM-extracted edges have no source-row to reconcile against.

---

## 2. Sample-ingest scope (deferred to T-E.2)

When T-E.2 ships, the spike target is this repo's `server/agent-studio/services/extensions/` directory only:

- ~15 files
- Mixed `.ts` / `.test.ts`
- One known import graph (`manifest.ts` → `contracts.ts` → `runtime.ts`) — testable ground truth
- One known call graph (`invokeFromExtension` → `dispatchMcpToolCall` for tool lane, via `runtime.ts`) — provides a test fixture for the dispatcher-boundary edge

This bounded scope answers: **does tree-sitter-typescript identify the right imports + calls + class members + exports?** without taking on the full repo's complexity until the answer is known.

---

## 3. Node/edge model — tentative (T-E.3 finalizes)

Strict subset of Phase 25's 12+10 catalog for the spike:

- **Nodes:** `Repository` / `File` / `Class` / `Function` / `ApiEndpoint` (only when the function is a tRPC procedure handler — detection by `/Procedure.\\.(input\\|mutation\\|query)/` regex over the function body)
- **Edges:** `DECLARES` (File → Class/Function), `IMPORTS` (File → File), `CALLS` (Function → Function), `EXPORTS` (File → Class/Function/named-export)

`Method / Package / Service / DbTable / FrontendComponent / ConfigFile / TestFile / IMPLEMENTS / DEPENDS_ON / READS_FROM_TABLE / WRITES_TO_TABLE / ROUTES_TO / RENDERS_COMPONENT / TESTS` are out of the spike — they enter Phase 25 proper after the spike says "yes."

---

## 4. Performance gate (T-E.4)

Measure for the spike target directory:

- Parse time per file (target: < 50 ms/file, p95)
- Total parse time (target: < 5 s for 15 files)
- Projection time to Neo4j CE (target: < 10 s for full directory)
- Neo4j CE query latency on 5 representative queries:
  1. "What does `manifest.ts` import?" (1-hop IMPORTS traversal)
  2. "What functions does `runtime.ts::invokeFromExtension` call?" (2-hop DECLARES + CALLS)
  3. "Which files declare a Class named `LaneHookFn`?" (label scan)
  4. "Show the call chain from `invokeFromExtension` to `dispatchMcpToolCall`" (variable-depth CALLS)
  5. "Which tests reference `manifest.ts`?" (reverse IMPORTS from `*.test.ts`)

  Target: each < 100 ms p95.

If the spike target meets these, scale to `server/agent-studio/services/` (~120 files) for T-E.5. If that meets the targets, the spike succeeds and Phase 25 T-G.2 is unblocked. If not, Phase 25 T-G.2 either:
- Restricts to TypeScript-only (drops the Python worker from scope), OR
- Triggers Phase 27 Aura upgrade as a hard prerequisite.

---

## 5. Hard-rule compliance for the spike (and downstream T-G.2)

- All parser code lives under `server/agent-studio/services/code-graph/spike/**`. Source-scan test will pin: no tree-sitter imports outside that directory.
- All graph access via `GraphRepository` — even the spike's projection writes.
- Postgres remains source-of-truth — code-graph nodes carry `sourceId = repository:file:span` so drift detection can reconcile.
- No `neo4j-driver` imports outside `services/graph/repository/**`.
- No `process.env.*_API_KEY` reads. Tree-sitter is a local-CPU parse path; no model execution.

---

## 6. Spike PR sequencing

| PR | Scope |
|---|---|
| T-E.1 (#990) | This document + decision tree + boundary placeholder + 1-test source-scan |
| T-E.2 (#1363) | Tree-sitter dep add + 1 emitter (`parse-ts-file.ts`, strict-subset node/edge model per §3) + sample-ingest orchestrator (`run-sample-ingest.ts`) targeting `services/extensions/` per §2; 16-assertion source-scan test (`code-graph-spike-parse-ts-file.test.ts`) locking emitter + sample-ingest + dep wiring; spike-boundary test extended to assert tree-sitter imports live inside the spike tree |
| T-E.3 (this PR) | Parse-time performance measurement (§4 parse-time gates only — projection-time + Neo4j-CE-query-latency gates deferred to T-E.4 because they need Neo4j CE in CI service containers). Measurement test `code-graph-spike-perf-measurement.test.ts` calls T-E.2's `aggregate()` against `services/extensions/`, asserts per-file p95 < 50 ms + total < 5000 ms, logs `[T-E.3]`-tagged metrics to stdout. Decision-recorded doc `agent-studio-code-graph-parser-spike-measurement-2026-05-17.md` names the test as evidence locator + lays out the 3-outcome decision tree (A: both halves PASS / B: parse-only PASS / C: parse FAIL) that T-E.4 picks from. |
| T-E.4 (this PR) | Closes the OTHER half of the §4 gate set — projection-time + query-latency measurement against a live Neo4j 5 CE service container. Workflow `code-graph-spike-measurement.yml` (`workflow_dispatch`) boots Neo4j 5 CE, runs `project-and-measure.ts` (parse `extensions/` → `MERGE`-write nodes+edges → execute the 5 §4 queries × 10 iterations each → compute p95). Asserts projection < 10000 ms + per-query p95 < 100 ms. Spike-only `neo4j-driver` boundary exemption documented in spike README + enforced via updated boundary test (`neo4j-driver` permitted in `code-graph/spike/**`, forbidden everywhere else in `server/agent-studio/services/**` except `services/graph/repository/**`). Measurement doc updated with T-E.4 row containing transcribed numbers. |

---

## 7. Out of scope for this spike

- LLM-driven extraction (strategy C — rejected)
- Python parsing (deferred to post-TypeScript-success)
- Cross-language edge resolution (TS → Python HTTP calls)
- Multi-repo ingestion (the spike target is this repo only)
- Phase 27 Aura upgrade decision (this spike informs that decision; does not make it)

---

## 8. References

- Roadmap §"Phase 20.5 — Code Graph Parser Spike" (canonical phase)
- Roadmap §"Phase 25 — V1.5 Expansion: Institutional, Code, Security, and Recommendation Graphs" (downstream consumer)
- Remaining plan §"T-E — Phase 20.5: Code Graph Parser Spike (3–4 PRs)"
- Remaining plan §"T-G.2 — Code Intelligence Graph (8–10 PRs — gated on T-E)"
- CLAUDE.md "Hard rules" (boundaries the spike preserves)
