# T-G.4 — Recommendation Service closure ledger

**Date:** 2026-05-17
**Track:** T-G.4 of `agent-studio-native-graph-workspace-remaining-execution-plan.md`
**Scope:** Thin-shell `RecommendationService` runtime + GraphRAG-backed candidate fetcher composing the existing assembler (`assembleRecommendationResponse`) and `GraphRetrievalRouter`. Closes the "rank + reason + graph path + source citations + confidence + permission status" output contract across the 8-kind closed taxonomy.
**Plan footprint:** Estimated 3–4 PRs; **shipped in 2 substantive PRs + 1 closure**: #1387 + #1388 + this PR.

---

## 0. Executive summary

T-G.4 is the **third arc this session**, following T-G.2 (Code Intelligence Graph, 7 PRs) and T-G.3 (Security/DevSecOps Graph Lens, 6 PRs). Two structural differences from T-G.2 / T-G.3 shaped the arc:

1. **No ingestion pipeline.** Recommendation is a **query/rank/reason-emitting service** that composes existing graph retrieval; no `cve-feed/` / `parser/` / `persistence/` / `projection/` quadrant. The contracts, assembler, and runtime were all pre-existing or new thin shells.
2. **No new operator UI affordance.** The service is consumed by other services (agents, lens runners) and emits structured output. The 5-precedent menu's (t) "generic-by-shape UI affordance" did not apply at this layer.

These two differences collapsed the natural arc size from 6–7 PRs to **2 substantive PRs**:

- **T-G.4.1** wired the thin-shell runtime over the pre-existing assembler.
- **T-G.4.2** wired the production GraphRAG fetcher over `GraphRetrievalRouter` with safety-event-driven permission classification.

The arc validated that:

- Precedent **(p) skeleton-first** still applies but compresses into a single PR when the contract surface is already shipped — the runtime + fetcher were assembled in one slice each.
- Precedent **(q) SoT INSIDE domain** applies as a *boundary discipline rather than a directory shape*: the runtime doesn't import the router; the fetcher injects it as a factory dependency. The "SoT" here is GraphRAG's pre-existing retrieval surface, not a new Postgres table.
- Precedent **(r) closed-taxonomy** applies to the 8-kind `RecommendationKind` enum and is preserved as a `DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS` exhaustive `Record<RecommendationKind, …>`.
- Precedent **(s) explicit-narrow under `strict: false`** did not surface (no new `**/services/**`-excluded files pulled in via new entry points).
- Precedent **(t) generic-by-shape UI** did not apply — no new UI in this arc.

**One NEW precedent surfaced this arc:**
- **(u) "Query-service shape — thin shell over assembler + injected fetcher":** when an arc emits a query/rank/reason envelope rather than projecting graph state, the natural shape is: contracts (shipped) → assembler (shipped) → thin runtime that composes both → injected fetcher with the production wiring. Tests partition cleanly across `*-runtime.test.ts` (compose-only) and `*-fetcher.test.ts` (mapper + transform + boundary).

**Zero deferred items. Zero silently-deferred items. All hard rules ✅ on every PR.**

| Sub-slice | PR | Shape | Precedents applied |
|-----------|----|-------|---------------------|
| T-G.4.1 thin-shell runtime | #1387 | `createRecommendationService` over pre-existing assembler | (p)(s applied negatively — no narrow needed) |
| T-G.4.2 GraphRAG fetcher | #1388 | `createGraphRagCandidateFetcher` over `GraphRetrievalRouter` + safety-event classification | (q)(r) + introduces (u) |
| T-G.4.3 closure ledger | this | This doc + standing-pattern menu refresh | — |

---

## 1. Per-PR closure ledger

### T-G.4.1 — Recommendation Service runtime (#1387)

**Shipped:**
- `server/agent-studio/services/recommendation/runtime/recommendation-service.ts` — `RecommendationService { recommend(request): Promise<RecommendationResponse> }` shell.
- `RecommendationCandidateFetchFn` boundary contract: `(request) => Promise<ReadonlyArray<RecommendationCandidate>>`.
- `createRecommendationService({ fetchCandidates })` factory; `recommend` calls `fetchCandidates(request)` then `assembleRecommendationResponse(candidates, { request })`.
- `runtime/public-api.ts` barrel.
- 12 tests in `tg-4-1-recommendation-runtime.test.ts` — 4 source-scan + 8 behavioral (single-call-per-request, empty-response, confidence-desc rank, minConfidence filter, limit truncation, redacted sentinel + count, hidden drop + count, kind passthrough).

**Precedent application:**
- **(p) Skeleton-first** — collapsed into a single PR because the assembler was already shipped; the runtime was the only new artifact.

**Boundary discipline:**
- No `neo4j-driver` / drizzle / `dispatchMcpToolCall` / openrouter / `process.env` reads.
- No direct GraphRAG router import (caller wires it via `fetchCandidates` injection — preserving the assembler's "pure decision logic" invariant from T-G.8).

### T-G.4.2 — GraphRAG-backed candidate fetcher (#1388)

**Shipped:**
- `server/agent-studio/services/recommendation/runtime/graphrag-candidate-fetcher.ts` with:
  - `RecommendationGraphRouter` minimal interface — tests inject stubs without building the full router + `GraphRepository`.
  - `defaultRecommendationKindMapper` mapping each `RecommendationKind` to a `graphrag_traversal` input anchored on `request.anchor.id`, over-fetched 3x (runtime truncates after rank-sort), with kind-specific `preferTemplateKeys` hints.
  - `DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS` — exhaustive `Record<RecommendationKind, ReadonlyArray<string>>` (closed-taxonomy lock).
  - `classifyBlockPermissionStatus(blockId, safetyEvents)` deriving `"hidden" | "redacted" | "visible"` from the safety-event stream (`governance_hidden`/`governance_archived` → hidden; `permission_denied` → redacted; else → visible).
  - `defaultBlockScorer` (fixed 0.7 baseline; override via factory `score` option).
  - `transformBlocksToCandidates(output, { kind, score? })` producing `RecommendationCandidate[]` with citations + graphPath + confidence + permission status.
  - `createGraphRagCandidateFetcher({ router, kindMapper?, score? })` factory matching `RecommendationCandidateFetchFn`.
- 17 tests in `tg-4-2-graphrag-candidate-fetcher.test.ts` — 8 source-scan + 9 behavioral (mapper shape, permission classification across all 3 outcomes, transform with default + custom scorer, end-to-end composition with `createRecommendationService` including redacted/hidden flow-through).

**Precedent application:**
- **(q) SoT INSIDE domain** — applied at boundary discipline rather than directory shape: the fetcher imports `GraphRetrievalRouter` types only; the router instance is factory-injected. GraphRAG's pre-existing retrieval surface IS the SoT.
- **(r) Closed-taxonomy** — `DEFAULT_RECOMMENDATION_KIND_TEMPLATE_HINTS` keyed by `RecommendationKind` is the exhaustive registry equivalent.

**Surfaces precedent (u) — Query-service shape** (see §3).

### T-G.4.3 — Closure ledger (this PR)

**Shipped:**
- This document.
- Standing-pattern menu refresh in `agent-studio-native-graph-workspace-remaining-execution-plan.md` §9.5 noting T-G.4 as the third arc (and the first **query-service-shaped** arc).
- New precedent **(u)** added to the precedent menu.

---

## 2. Hard-rule compliance audit

| Rule | T-G.4.1 | T-G.4.2 |
|------|---------|---------|
| Postgres = source of truth | n/a | n/a (consumes GraphRAG router; no direct DB) |
| GraphRepository sole graph access | ✅ (no direct router) | ✅ (router injected as boundary type only) |
| MCP dispatcher chokepoint | ✅ | ✅ |
| OpenRouter sole model-execution path | ✅ | ✅ |
| Closed taxonomies validated + source-scan locked | ✅ (kind passthrough) | ✅ (8-kind template-hints `Record`) |
| No `process.env.*_API_KEY` reads | ✅ | ✅ |
| Approval / governance reuse | n/a (assembler owns redaction/hidden) | ✅ (safety-event-driven permission classification) |

---

## 3. Precedent-application audit (NEW this arc)

T-G.4 surfaced **one new** standing pattern:

### (u) Query-service shape — thin shell over assembler + injected fetcher

**Shape:**
- Contracts file (`RecommendationKind`, `Request`, `Response`, `Candidate`) — pre-existing or shipped first.
- Assembler (`assembleRecommendationResponse`) — pure decision logic over `(candidates, { request })`.
- Runtime thin shell — `create<X>Service({ fetch<Y> })` that composes fetcher → assembler.
- Production fetcher — `create<Y>Fetcher({ <dependency> })` returning the boundary-typed fetch fn.

**When to apply:**
- Arc emits a **query/rank/reason envelope** rather than projecting graph state.
- The retrieval source is pre-existing (GraphRAG, MCP, KB) — no new ingestion pipeline.
- Permission/redaction is **derived from a per-result event stream** (safety events, governance events) rather than enforced at runner-install time.

**Tests partition naturally:**
- `<X>-runtime.test.ts` — compose-only (mock fetcher returns hard-coded candidates; assert assembler decision logic flows through).
- `<Y>-fetcher.test.ts` — mapper + transform + boundary (mock dependency returns hard-coded retrieval output; assert candidate shape + permission classification).
- Existing `<X>-assemble-response.test.ts` continues to cover decision logic — no duplication.

**Why it matters:**
- Collapses what looks like a 6–7 PR arc into 2 substantive PRs when contracts + assembler pre-exist.
- Future arcs of this shape (next-action service, expert-routing service) can be sized at 2 PRs + closure.

**Contrast with (q):**
- Precedent (q) "SoT INSIDE domain" assumes a 3-quadrant directory shape (ingestion / persistence / projection).
- Precedent (u) is the **query-side analog** — boundary discipline still applies (router injected, not imported), but the directory shape is **runtime/ alone**.

---

## 4. Mortgage on the next arc

T-G.4 completes the Recommendation Service sub-arc. Per the remaining-execution-plan:

**T-G as a whole acceptance:**
- [x] Institutional Memory Lens works _(prior arc)_
- [x] Code Intelligence Graph ingestion (T-G.2) _(closed 2026-05-17)_
- [x] Security Graph Lens works (T-G.3) _(closed 2026-05-17)_
- [x] Recommendation service pattern works (T-G.4) _(this closure)_
- [ ] Impact analysis can traverse institutional / code / security graphs _(infrastructure shipped via Phase 7.5c impact-templates + T-G.2/3 projections; end-to-end traversal test deferred to T-G aggregate closure)_
- [ ] Neo4j CE performance acceptable OR upgrade trigger fires _(tracked in T-H.2)_
- [x] Permission rules enforced _(approver-only T-G.3.5 + safety-event-driven T-G.4.2)_

**Remaining T-G work (not in this arc):**
- T-G aggregate closure ledger documenting end-to-end impact-analysis traversal across the 3 graph kinds.
- Optional operator-facing tRPC router exposing `recommendation.*` procedures (not in the spec; would be a follow-up if any UI surface needs direct consumption).

**T-G.4 alone fully closes the "Recommendation service pattern works" acceptance criterion.**

---

## 5. PR ledger

| PR | Title | Merge commit |
|----|-------|--------------|
| #1387 | T-G.4.1: Recommendation Service runtime (thin shell over assembler) | `63ed53b3` |
| #1388 | T-G.4.2: GraphRAG-backed Recommendation candidate fetcher | _(this arc)_ |
| _(this)_ | T-G.4.3: closure ledger + standing-pattern menu refresh | _(this PR)_ |

---

## 6. Session aggregate (2026-05-17)

This closure marks **19 PRs end-to-end in one session** across **three complete sub-arcs**:

| Arc | PRs | Status |
|-----|-----|--------|
| Phase 7.5 unblock | #1371-#1373 (3) | ✅ closed |
| T-G.2 Code Intelligence Graph | #1374-#1380 (7) | ✅ closed |
| T-G.3 Security/DevSecOps Graph | #1381-#1386 (6) | ✅ closed |
| T-G.4 Recommendation Service | #1387-#1388 + this (3) | ✅ closed (this) |
| **Session total** | **19 PRs** | **4 arcs closed** |

The 19-PR session validates:
1. The Phase 7.5 production Neo4j stack as ready to host new graph kinds (T-G.2/3 both shipped projections via `GraphRepository` without new adapter work).
2. The 5 T-G.2 precedents `(p)–(t)` as a reusable arc template (T-G.3 shipped line-for-line without new precedents).
3. The arc shape is **directly tied to whether the work emits / projects state vs. queries existing state** — the new precedent (u) named this asymmetry.
4. Continuous autonomous execution under the standing mandate without operator intervention.

The combined precedent menu after this arc:
- (p) skeleton-first factory-throws
- (q) SoT INSIDE domain (ingestion/persistence/projection split)
- (r) 6-touch-point closed-taxonomy extension
- (s) previously-excluded inclusion strictness gap
- (t) generic-by-shape UI affordance
- **(u) query-service shape — thin shell over assembler + injected fetcher** (NEW this arc)
