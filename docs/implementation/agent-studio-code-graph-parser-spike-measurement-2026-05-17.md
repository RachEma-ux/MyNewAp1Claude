# Code Graph Parser Spike — measurement run 2026-05-17

**Track:** T-E of the remaining execution plan.
**Roadmap Phase:** 20.5 — Code Graph Parser Spike.
**Predecessor doc:** `docs/implementation/agent-studio-code-graph-parser-spike-2026.md` (ADR + decision tree + §4 performance gates).
**Predecessor PRs:** #990 (T-E.1 ADR + boundary), #1363 (T-E.2 emitter + sample-ingest).
**This PR:** T-E.3 — measurement test + decision-recorded doc.

---

## 0. What this doc is

The §4 performance gates from the spike ADR need numbers. T-E.2 exported `aggregate()` from the sample-ingest orchestrator so a separate measurement pass could call it without re-implementing the file walk + per-file timing. T-E.3 adds the measurement test that calls `aggregate()` against `services/extensions/` (the §2 spike target) and asserts the §4 gates.

The measurement test (`tests/agent-studio/code-graph-spike-perf-measurement.test.ts`) is the canonical evidence locator. Its CI run captures actual numbers via `console.log` lines tagged `[T-E.3]`. This doc transcribes those numbers + records the spike-pass / spike-fail verdict + names the T-E.4 follow-up shape.

---

## 1. §4 gates being measured

| Gate | Target | Measured by |
|---|---|---|
| Per-file parse time p95 | < 50 ms | `code-graph-spike-perf-measurement.test.ts` |
| Total parse time | < 5000 ms (for ~15 files) | `code-graph-spike-perf-measurement.test.ts` |
| Projection time to Neo4j CE | < 10000 ms (full directory) | **DEFERRED** — requires Neo4j CE in CI service container |
| Neo4j CE query latency p95 (5 representative queries) | < 100 ms each | **DEFERRED** — same reason |

**Why parse-time half ships first:** the parse-time gate is necessary (the spike can't succeed if parsing already exceeds 50 ms/file p95 — projection adds cost, doesn't subtract it). T-E.4 wires Neo4j CE projection + query measurement separately because that infrastructure (Neo4j as a CI service) isn't in place today.

---

## 2. Recorded results

**Evidence source:** GitHub Actions run [25989137260](https://github.com/RachEma-ux/MyNewAp1Claude/actions/runs/25989137260) (workflow_dispatch on `te3-code-graph-spike-perf-measurement` @ `02143176`, 2026-05-17 11:09 UTC, ubuntu-latest, Node 20). Workflow `run-tests.yml` with input `test_path=tests/agent-studio/code-graph-spike-perf-measurement.test.ts`. Console.log lines tagged `[T-E.3]` transcribed verbatim below.

| Metric | Target | Recorded | Verdict |
|---|---|---|---|
| Files parsed | n/a (informational) | 14 | — |
| Per-file p50 (ms) | n/a (informational) | 0.73 | — |
| Per-file p95 (ms) | < 50 | **2.02** | **PASS** (25× margin) |
| Per-file max (ms) | n/a (informational) | 3.97 | — |
| Total parse time (ms) | < 5000 | **15.12** | **PASS** (330× margin) |
| Node count by type | n/a (correctness) | File=14, Function=40, Class=4 | — |
| Edge count by type | n/a (correctness) | IMPORTS=30, DECLARES=44, CALLS=202, EXPORTS=87 | — |

**Verdict: parse-time half of the §4 performance gate PASSES.** Both gates clear by >25× margin — the spike's parse-time hypothesis is comprehensively validated for the §2 sample-ingest scope. The Phase 25 prerequisite question §0 ("can we get a useful Code Intelligence Graph out of Neo4j CE for ~150k-LoC repos without triggering the Phase 27 Aura upgrade?") is half-answered with "yes — parse-time scales generously." The other half (projection + query latency) remains for T-E.4.

**Correctness cross-checks:**
- File node count (14) matches files-parsed count → no silent file-skip in the walker.
- DECLARES edge count (44) matches `Function (40) + Class (4)` → every declaration emits a DECLARES edge.
- IMPORTS edge count (30) at ~2 imports/file is consistent with `extensions/`'s tight import surface.
- CALLS count (202) at ~14 calls/file is consistent with the dispatcher-routing pattern (each lane-hook + tool-invocation site contributes call edges).

**Margin observation:** the 25× / 330× margins on a 14-file corpus suggest the §4 gate is easily met at the spike target's scale. The T-E.4 follow-up (or T-E.5 scale-up to `services/`) should retest at ~120 files to confirm the margin holds an order of magnitude up.

---

## 3. Decision tree (per spike doc §4)

Three outcomes — the operator picks one in the T-E.4 follow-up based on the §2 measurement above + the §3 projection/query measurement when it's wired:

### Outcome A — both halves PASS (parse + projection)

→ Spike succeeds. Phase 25 T-G.2 unblocked. Open T-G.2 with this measurement doc cited as evidence. Scale measurement to `server/agent-studio/services/` (~120 files) for T-E.5 before greenlighting full repo ingest.

### Outcome B — parse-time PASS, projection FAIL

→ Spike partially succeeds. Phase 25 scope reduces: either drop the Python worker from scope OR trigger Phase 27 Aura upgrade as a hard prerequisite (per spike doc §4 fallback). Open T-E.4 as a "scope reduction recommendation" doc PR.

### Outcome C — parse-time FAIL

→ Spike fails. Phase 25 scope is uncertain. Open T-E.4 as a "spike-failed addendum" doc PR. Strategy options to evaluate:
- Switch to per-language AST tools (strategy B from the ADR's decision tree) — higher carrying cost but better fidelity per language.
- Defer Code Intelligence Graph indefinitely; ship Phase 25 minus the code-graph component.

---

## 4. Test plan

- [x] Measurement test (`code-graph-spike-perf-measurement.test.ts`) added; asserts both parse-time gates; logs `[T-E.3]`-tagged metrics to stdout.
- [x] Workflow_dispatch run on `te3-code-graph-spike-perf-measurement` (run 25989137260) captured actual parse-time numbers via the `Run additional tests` step (`run-tests.yml` `test_path` input).
- [x] §2 `Recorded` column transcribed verbatim from the captured run.
- [ ] T-E.4 PR opens with the verdict (Outcome A/B/C) + the actual decision based on the recorded numbers + (for Outcome A/B) the projection/query-latency measurement plan. **Recommended outcome: B for now** (parse-time PASS) pending projection measurement; revise to **A** once T-E.4 ships Neo4j projection + query-latency measurement and both pass.

**Note on CI coverage gap discovered during T-E.3:** the regular `test` job in `run-tests.yml` only runs `tests/contracts/`, `tests/governance/`, `tests/integration/ai-types/`, `tests/integration/runtime-db/`, and one runtime-governance E2E file. The `tests/agent-studio/` directory (where the spike measurement test lives, along with ~100 other source-scan tests) is **not** in the per-PR test job; the only way to run those in CI is via `workflow_dispatch` with a `test_path` input, as done here. Future T-E.4 (or a separate CI-coverage PR) may want to add `tests/agent-studio/code-graph-spike-*` to the per-PR test job so spike regressions surface automatically on every PR rather than requiring an operator dispatch.

---

## 6. T-E.4 — projection + query-latency measurement (live Neo4j 5 CE)

Closes the other half of the §4 gate set. Spike-only `neo4j-driver`
exemption documented in `spike/README.md` + enforced in
`code-graph-spike-boundary.test.ts`; production paths (`services/
graph/repository/**` + `modules/kgia/**`) remain the only non-spike
locations where `neo4j-driver` may appear.

### 6.1 §4 gates being measured (the other half)

| Gate | Target | Measured by |
|---|---|---|
| Projection time to Neo4j CE | < 10000 ms (~15 files) | `server/agent-studio/services/code-graph/spike/project-and-measure.ts` (driven by `.github/workflows/code-graph-spike-measurement.yml`) |
| Per-query latency p95 (5 representative queries) | < 100 ms each | same script — runs each query × 10 iterations |

The 5 queries from spike doc §4:

1. Q1 — "What does `manifest.ts` import?" (1-hop IMPORTS)
2. Q2 — "What does `runtime.ts::invokeFromExtension` call?" (2-hop DECLARES + CALLS)
3. Q3 — "Which files declare a Class named `LaneHookFn`?" (label scan)
4. Q4 — "Call chain from `invokeFromExtension` to `dispatchMcpToolCall`" (shortestPath, variable-depth CALLS)
5. Q5 — "Which tests reference `manifest.ts`?" (reverse IMPORTS from `*.test.ts`)

### 6.2 Recorded results

**Evidence source:** GitHub Actions workflow `code-graph-spike-measurement.yml` run #TBD on `te4-code-graph-spike-projection-measurement` @ TBD-SHA. Console.log lines tagged `[T-E.4]` transcribed verbatim below.

| Metric | Target | Recorded | Verdict |
|---|---|---|---|
| Projection time (ms) | < 10000 | TBD | TBD |
| Q1 p95 (ms) | < 100 | TBD | TBD |
| Q2 p95 (ms) | < 100 | TBD | TBD |
| Q3 p95 (ms) | < 100 | TBD | TBD |
| Q4 p95 (ms) | < 100 | TBD | TBD |
| Q5 p95 (ms) | < 100 | TBD | TBD |

**Verdict (T-E.4 isolated, post-dispatch transcription):** TBD.

**Combined verdict (T-E.3 + T-E.4 → §3 decision tree):**
- If T-E.4 verdict is **PASS** → Outcome A (parse + projection both PASS); Phase 25 T-G.2 unblocked; scale measurement to `services/` (~120 files) for T-E.5.
- If T-E.4 verdict is **FAIL** (projection >= 10s OR any query p95 >= 100ms) → Outcome B (parse-only PASS); Phase 25 scope reduction per §4 fallback (drop Python OR trigger Phase 27 Aura) OR defer Phase 25 code-graph entirely.

---

## 7. Related artifacts

- Spike ADR: `docs/implementation/agent-studio-code-graph-parser-spike-2026.md`
- Spike emitter: `server/agent-studio/services/code-graph/spike/parse-ts-file.ts`
- Spike sample-ingest: `server/agent-studio/services/code-graph/spike/run-sample-ingest.ts`
- Spike projection + measurement: `server/agent-studio/services/code-graph/spike/project-and-measure.ts`
- Parse-time measurement test: `tests/agent-studio/code-graph-spike-perf-measurement.test.ts`
- Spike boundary test: `tests/agent-studio/code-graph-spike-boundary.test.ts`
- Projection-time measurement workflow: `.github/workflows/code-graph-spike-measurement.yml`
