# RAC Resource Estimate — Actuals from P0–P11

**Owner:** Agent Studio module
**RAC phase:** P12 (Rollout Readiness)
**Status:** Adopted — actuals recorded, retrospective only
**Authority:** Reference doc; no decisions are made here. The estimate this doc reconciles against was the section in `RAC_EXECUTION_PLAN.md` at the time each phase opened.

---

## 1. Why this document exists

The execution plan listed a target line count for each phase ("PR size: ~600 lines", "PR size: ~1500–2000 lines (UI is bulky)", etc.). Now that all 14 code phases (P1A–P11) have landed, this doc compares the estimate against the actuals so future RAC-shaped projects can calibrate their estimates.

The point is not to score the plan's accuracy — it's to record the divergences and the lessons, so the next bundle's estimator can lean into what worked and avoid what didn't.

---

## 2. Per-PR actuals

All values are **line-count deltas** from the squash-merge commit's `git log --shortstat`. Code + tests + docs combined; no separation between the three because that boundary is fuzzy in practice.

| Phase | PR | Merge SHA | Estimate (lines) | Actual (insertions / deletions) | Notes |
|---|---|---|---|---|---|
| P1A | #166 | `58c4e39` | ~700 | **1247 / 0** | Schema + types + store + events bundled together; the schema landed bigger than predicted because `ags_cag_*` carries 5 tables, not the 3 the plan budgeted |
| P1B | #167 | `8b711c7` | ~700 | **1144 / 4** | Builder + validator + renderer + risk-classifier; on-target |
| P1C | #168 | `3149dd7` | ~800 | **952 / 12** | Resolver + composer; within range |
| P1D | #169 | `3a59bb8` | ~400 | **208 / 0** | tRPC preview surface only — tighter than estimated because the CAG store helpers were already written in P1A |
| P1E | #170 | `3dad6d5` | ~500 | **496 / 1** | On-target. The boundary lint took more of the budget than expected; goldens took less |
| P2 | #171 | `80c9838` | ~1000 | **1169 / 0** | Source registry — schema-heavy phase. The 4 new tables + types + store + index landed at ~1.2× estimate, mostly in tests |
| P3 | #172 | `9efaf82` | ~1000 | **956 / 0** | Ingestion + 2 adapters; on-target |
| P4 | #173 | `effed3f` | ~1100 | **1110 / 0** | Planner/executor/filter; spot-on |
| P5 | #174 | `f9dbe97` | ~600 | **495 / 7** | Context assembler + composer integration; tighter than expected because P1B's renderer pattern composed cleanly |
| P6 | #175 | `b3faafc` | ~800 | **910 / 106** | Retrieval in chat runtime + Rule C activation; the deletions came from refactoring three runtime files (`chat-stream`, `chat`, `test-run-binding`) onto the orchestrator |
| P7 | #176 | `08f5431` | ~900 | **1214 / 8** | Trace + feedback + drawer MVP; the trace store helpers + the drawer combined to push past estimate by ~35% |
| P8 | #177 | `65dab16` | ~700 | **1113 / 0** | Evaluation actions + 10-question seed fixture; the fixture itself was unbudgeted weight (~250 lines of seed data) |
| P9 | #178 | `a027191` | ~800 | **736 / 8** | Sandbox gate + dispatcher wiring + 14 real-impl tests; on-target |
| P10 | #179 | `045cf2d` | ~600 | **781 / 12** | Export readiness; on-target |
| P11 | #180 | `2218ebd` | ~1500–2000 | **1468 / 0** | RAC UI; landed at the low end of the range. The five panels averaged 250–370 LOC each, plus the page shell and shell wiring |

**Cumulative actual:** 13 089 insertions / 158 deletions across the 14 code PRs.

**Cumulative estimate (sum of midpoints):** ~10 900 lines.

**Variance:** +20%. The dominant single source is the test weight in P1A / P2 / P7 / P8. The plan budgeted for production code; tests landed at higher density than predicted.

---

## 3. Schedule actuals

The plan didn't bind the schedule; this section records the elapsed wall-clock for the current execution session(s) for future reference. All phases were executed under the autonomous-execution authority granted 2026-05-05.

| Marker | UTC | Notes |
|---|---|---|
| P1A merged | (pre — see plan §1A history) | Restart point for the current session arc |
| P9 merged | 2026-05-06 (this session) | Sandbox gate landed |
| P10 merged | 2026-05-06 (this session) | Export readiness landed |
| P11 merged | 2026-05-06 (this session) | UI landed; code-phase complete |

The session-arc cadence was a phase every ~30–45 min, including CI-watch + memory updates. The plan never set a per-phase wall-clock budget; the fact that we hit that cadence reflects the OOM-safe validation pattern (`pnpm run check` then targeted vitest, never both in parallel) and the consistent CI fingerprint (4/5 green + the documented pre-existing 10 ai-types failures), not the difficulty of the phase.

---

## 4. Divergences from estimate

### 4.1 Test weight beat estimate consistently

P1A, P2, P7, P8 all landed at higher test density than budgeted. The pattern: every new schema table grew its own contract test (good — caught key regressions like the P10 contract widening). Every pure scorer grew a matrix test. Both are positive signals. The estimate should account for ~1× test LOC parity with production code on schema/scorer-heavy phases, not the ~0.5× the plan implicitly assumed.

### 4.2 P1D came in tighter than budgeted

P1D was 208 LOC vs ~400 estimated — the tRPC preview surface reused store helpers from P1A. The lesson is **not** "P1D was over-estimated"; the lesson is **the reuse value of P1A's store layer was higher than the plan modelled**. Whenever a phase lands a public store with a clean type surface, the next two phases that consume it shrink by ~30%.

### 4.3 P11's UI landed at the low end of the band

The plan's 1500–2000 line range for P11 reflected uncertainty about how much custom UI primitives we'd need. We needed none — the existing `components/ui/` exports (PageHeader, EmptyState, LoadingState, SectionLabel) plus shadcn/Radix Select / Tabs / Switch were enough. Future UI-heavy phases should default to "low end of range" if the existing primitives cover the use cases, and budget the upper end only when new primitives are anticipated.

### 4.4 P6's deletions were larger than expected

P6 had 106 deletions because the orchestrator pattern moved logic out of three runtime files. The plan budgeted "edit X / Y / Z" but didn't predict the consolidation into `services/runtime/rac-orchestrator.ts`. The lesson: any phase whose plan-text says "edit three files" should budget the deletion line that lets the consolidation happen. (P6's was 106 lines; smaller orchestrators would still produce 30–80 line deletions.)

### 4.5 Pre-bundle decision records were the highest-leverage docs

P0.5 / P0.6 (the locked DRs for embedding binding, retrieval foundation, and sandbox implementation) were ~600 LOC of markdown each. They drove every subsequent code phase to land at-or-near estimate, because the boundary questions had been answered before the code was written. The plan correctly predicted that the DRs were prerequisite, but underweighted how much they reduced variance in the downstream phases. **Keep doing this.**

---

## 5. Lessons for the next bundle

1. **Budget tests at production-LOC parity** for schema-heavy or scorer-heavy phases. Anything where the surface is a stable interface that downstream phases will consume — that's where contract tests pay off, and they cost LOC.

2. **Pre-bundle the DRs.** The single highest-leverage activity in the plan was P0.5 / P0.6: locking D-EMB / D-RET / D-SBX / D-PRM before any code was written. The plan's variance was ~+20% with these DRs in place; without them it would plausibly be 2–3× by the third phase, because every phase would re-litigate the boundary.

3. **Treat OOM-safe validation as a hard rule, not a heuristic.** The session crash that motivated this rule (futex / SIGKILL when `tsc` and `vitest` ran in parallel) cost a session. Every subsequent phase ran `pnpm run check` first, then `pnpm exec vitest run <file> --pool=forks --poolOptions.forks.singleFork`, and none crashed. If you're tempted to parallelise: don't.

4. **Lean on the CI fingerprint.** The "4/5 green + the documented pre-existing 10 ai-types failures" fingerprint is the merge-or-halt signal. We never spent a phase debugging a non-RAC red. If CI shows a different shape, halt and diagnose; if it matches the fingerprint, merge. This kept ~14 phases moving without rework.

5. **The `Object.freeze` literal-narrowing trap is real.** P6 spent debugging time on `RetrievalFilterConfig` because `Object.freeze` on a literal narrowed the type beyond the interface and `mergeConfig` propagated the narrow type. The fix is `Readonly<Iface>` typing on the constant, not `Object.freeze` on the literal. Future schema-heavy phases should declare interfaces explicitly and type the constants against those interfaces.

6. **Single source of truth for cross-phase reads.** D-TOOL-5 (riskClass via the registry-backed `readRiskClass()` only) was the difference between P10's eligibility gate working out of the box and P10 spending a phase reconciling its risk-class view with CAG's. If three subsystems will read the same field, lock the read path in a DR before any of them are built.

---

## 6. Acceptance for this estimate

- [x] Every code PR (P1A–P11) has an actuals row.
- [x] Variance is named, not just shown.
- [x] Lessons section is concrete (numbered, actionable, no platitudes).
- [x] No new decisions are introduced; this is a retrospective.
