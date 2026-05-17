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

**Evidence source:** PR #TBD CI logs — `tests/agent-studio/code-graph-spike-perf-measurement.test.ts` console.log lines tagged `[T-E.3]`.

| Metric | Target | Recorded | Verdict |
|---|---|---|---|
| Files parsed | n/a (informational) | TBD | — |
| Per-file p50 (ms) | n/a (informational) | TBD | — |
| Per-file p95 (ms) | < 50 | TBD | TBD |
| Per-file max (ms) | n/a (informational) | TBD | — |
| Total parse time (ms) | < 5000 | TBD | TBD |
| Node count by type | n/a (correctness) | TBD | — |
| Edge count by type | n/a (correctness) | TBD | — |

**Follow-up:** once #TBD CI logs are captured, a 1-line follow-up PR replaces the `TBD` cells with actual values + sets the `Verdict` column to `PASS` / `FAIL`. The test itself fails loudly on gate violation, so if this PR merges green, the parse-time half of the spike has answered §0's question with "yes" for the parse-time half.

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
- [ ] CI run (this PR) captures actual parse-time numbers in the `test` job log.
- [ ] Follow-up 1-line PR transcribes the captured numbers into §2's `Recorded` column.
- [ ] T-E.4 PR opens with the verdict (Outcome A/B/C) + the actual decision based on the recorded numbers + (for Outcome A/B) the projection/query-latency measurement plan.

---

## 5. Related artifacts

- Spike ADR: `docs/implementation/agent-studio-code-graph-parser-spike-2026.md`
- Spike emitter: `server/agent-studio/services/code-graph/spike/parse-ts-file.ts`
- Spike sample-ingest: `server/agent-studio/services/code-graph/spike/run-sample-ingest.ts`
- Measurement test: `tests/agent-studio/code-graph-spike-perf-measurement.test.ts`
- Spike boundary test: `tests/agent-studio/code-graph-spike-boundary.test.ts`
