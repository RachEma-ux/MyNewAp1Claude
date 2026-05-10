# Agent Studio Native Graph Workspace — Execution Plan

> **Companion to:** `docs/implementation/agent-studio-native-graph-workspace-roadmap.md` (the canonical 28-phase roadmap, authored 2026-05-10).
>
> **Purpose:** the roadmap describes *what* to build. This document describes *how to execute it* — sequencing, parallelism, decision gates, agent assignment, integration with existing Agent Studio plans, risk register, and concrete first PRs.
>
> **Scope boundary:** this plan ends at MVP 4 closure (Graph Agent Lite live, golden questions passing). V1 / V1.5 / V2 sequencing is sketched but not detailed — those tiers get their own execution plan when the project reaches MVP 4 closure.

---

## 1. Anchor: where we start

### 1.1 What is already done (do not re-plan)

- **Roadmap V3 (Runtime Hardening) — COMPLETE @ `c7d1d29`.** All 7 DoD gates closed across 20 PRs (#383–#404). Production-ready + reference-grade tiers achieved. The runtime is observable, fail-closed, certifiable, and evidence-backed.
- **Phase 11b-3 (Runtime UI surfaces) — deferred.** Native Graph Workspace Phase 14 + Phase 24 lens work supersedes its scope. See `docs/implementation/runtime-hardening-v3-phase-11b-3-deferral.md`.
- **Existing systems to NOT duplicate** (per new-roadmap §Phase 0): existing CAG capability packs, MCP dispatcher, OpenRouter model access, governance/approval scaffolding, runtime trace store, RAC source registry, agent runtime, code-architecture features.
- **Operative engineering patterns** (already proven in V3 and earlier cycles): doc-block + lockstep tests, parallel-flow source-scan, audit-as-starting-point, pause-and-surface, sibling-field schema versioning, assessor + operator-runbook closure shape.

### 1.2 What this project must integrate with (extends, does not replace)

| Existing system | New project's relationship |
|---|---|
| `agsRuntimeRuns` (V3 observability) | Native Graph Workspace **projects this into Neo4j CE** (Phase 14 — runtime trace graph). Continues to be Postgres source-of-truth. |
| Existing CAG capability packs | **Source-of-truth stays Postgres / existing CAG store.** Phase 0.5 adds projection-only into Neo4j CE. Phase 10 adds source-note reference edge. |
| MCP dispatcher | **Untouched runtime contract.** Graph Agent must route through it (Phase 13). |
| OpenRouter model access | **Untouched contract.** Graph Agent calls through approved path (Phase 13). |
| Governance/approval scaffolding | **Extended, not replaced.** Promotion workflows (Phase 11), graph change proposals (Phase 11.5), correction/enrichment proposals (Phase 23) all run through existing scaffolding. |
| `agsRuntimeRuns` SLO doc (`docs/operations/agent-studio-runtime-slo.md`) | **Becomes baseline.** New roadmap Phase 20 (performance benchmarks) extends but does not contradict the V3 SLO contract. |

### 1.3 Open authority question (must resolve before MVP 0)

The user has previously granted autonomous execution authority for several arcs (PMB Phase 27–41, RAC cycles 4–8, Roadmap V3). **This new project has no such authority yet.** Each phase / sub-phase will require explicit user direction until that's granted. Recommended first user decision: scope of autonomous authority for MVP 0 (architecture decisions only) vs. broader scope.

---

## 2. Critical Path

The 28 phases are **not 28 sequential steps**. Many run in parallel. The critical path — the phases that must complete before everything else — is:

```
Phase 0 — Repository Reconciliation
    ↓
Phase 0.5 — Existing Data Migration Plan
    ↓
Phase 1.x — ADRs (1.1, 1.2, 1.3) + Backend Strategy
    ↓
Phase 1.4 — Backend Benchmark Spike
    ↓
Phase 1.5 — Backend Decision Gate ◀─── HARD STOP — blocks Phase 7+
    ↓
Phase 1.6 + 1.7 — Ontology + Projection Sync architecture
    ↓
Phase 2 + 2.5 — Vault core + lock UX (Track A; can parallel-run with Track B)
    ↓
Phase 3–6 — Editor / Properties / Links / Search (Track A)
    ↓
Phase 7 + 7.5 — Typed graph store + Neo4j CE active backend (Track B/C synth)
    ↓
Phase 8 + 9 — Graph views + governance-aware visibility
    ↓
Phase 10 — Lightweight runtime references (Track G)
    ↓
Phase 11 + 11.5 — Promotion + graph change workflows
    ↓
Phase 12 — GraphRAG retrieval (Track E)
    ↓
Phase 12.5 — Graph Skill Packs (Track E/F)
    ↓
Phase 13 — Graph Agent Lite ◀─── MVP 4 milestone
    ↓
Phase 13.5 + 14 — Agentic GraphRAG + trace graph
    ↓
Phase 20 + 21 + 22 + 23 — Benchmarks / continuous tests / feedback / quality
    ↓
[V1 / V1.5 / V2 — separate execution plans]
```

**Decision gates** (capitalized below) are hard stops where downstream work cannot start until a documented decision passes.

---

## 3. Decision Gates

| Gate | Phase | Blocks | Decision Output |
|---|---|---|---|
| **G1: Reconciliation Closed** | 0 | All implementation | Non-build list signed off; module boundaries documented |
| **G2: Architecture Frozen** | 1.1–1.3 | Phase 7+ | All §5 ADRs merged; GraphRepository interface frozen |
| **G3: Backend Decision** | 1.5 | Phase 7+ (advanced graph) | `agent-studio-active-graph-backend-decision.md` records Neo4j CE promotion or Memgraph fallback |
| **G4: Ontology Locked** | 1.6 | Phase 7 | Node/edge type registry + constraint registry merged |
| **G5: Projection Sync Ready** | 1.7 + 7.5 | Phase 8+ (graph views) | Initial + incremental projection working in dev env |
| **G6: Active Backend Live** | 7.5 | Phase 8+ | `Neo4jCommunityGraphRepository` health check green; permission filter pushdown verified |
| **G7: Promotion Governance Live** | 11 | Phase 12+ | Note-version-pinned bindings; rollback works; CAG/Graph Skill source references functional |
| **G8: GraphRAG Permissions Verified** | 12 | Phase 13 | Property-based visibility tests passing; context safety filter live |
| **G9: Graph Agent Boundary Verified** | 13 | Phase 13.5 | MCP dispatcher boundary intact; no graph mutation by agent; Why-This-Answer panel working |
| **G10: MVP-4 Closure** | 13 + 14 + 20–23 | V1 expansion | Golden questions pass; benchmarks within targets; correction proposal flow tested |

**G3 (Backend Decision) is the most important gate.** A wrong call here invalidates Phase 7+. The default is "promote Neo4j CE" but the gate must be earned by passing the §1.4 benchmark spike. Plan time and infra accordingly — **do not start Phase 7 until G3 closes.**

---

## 4. Track Parallelism

The roadmap defines tracks A–J (§4.10). They map onto execution like this:

```
                                 G3
                                  │
                                  ▼
Time →   ─────[ MVP 0 ]─────[ MVP 1 ]─────[ MVP 2 ]─────[ MVP 3 ]─────[ MVP 4 ]──→
                                                                            │
Track A  ────────────────────[2,2.5,3,4,5,6]                                │
  Workspace                                                                 │
                                                                            │
Track B  [1.2,1.3,1.4,1.5]──────────[7.5]                                   │
  Backend                                                                   │
                                                                            │
Track C  [1.6,1.7]─────────────────────────[7,8,9]                          │
  Typed Graph                                                               │
                                                                            │
Track D  ─────────────────────────────────────────[Phase 25 — V1.5]         │
  Inst. Memory                                                              │
                                                                            │
Track E  ────────────────────────────────────────────[12,12.5]              │
  GraphRAG                                                                  │
                                                                            │
Track F  ──────────────────────────────────────────────────[13,13.5]────────┤
  Graph Agent                                                               │
                                                                            │
Track G  ────────────────────────────────────────[10,11,11.5]               │
  Runtime Binding                                                           │
                                                                            │
Track H  ─────────────────────────────────────────────────[20,21,22,23]─────┤
  Eval / Self-Correct                                                       │
                                                                            ▼
Track I  ─── deferred to V1 / V2 execution plans                       MVP-4 closure
Track J  ─── deferred to V2 / production-hardening plan
```

**Parallelism rules:**

- **MVP 0** is documentation-heavy (ADRs + benchmark spike). Track B (backend strategy) and Track C (ontology/projection-sync architecture) can run in parallel, but G3 (backend decision) must close before Track A's Phase 7+ starts.
- **MVP 1** Track A (workspace foundation, Phases 2–6) runs largely independently of Track B once G3 closes, as long as graph features are stubbed via `TestGraphRepository`.
- **MVP 2** Track B (Neo4j CE active) and Track C (typed graph store) **must converge before Phase 8.** Plan a sync point at G6.
- **MVP 3** Track G (runtime binding) depends on Track A finishing Phase 6 (search/command palette) and Track C finishing Phase 9 (governance-aware views).
- **MVP 4** Track E (GraphRAG) and Track F (Graph Agent) can develop in parallel once G7 closes, but Track F integration tests need Track E's retrieval router live.

---

## 5. MVP 0 Execution — concrete first PRs

**Goal:** close G1 + G2 + G3. Documentation, architecture, and benchmark only. **No production code beyond `TestGraphRepository`, `PostgresGraphRepository` baseline, and `Neo4jCommunityGraphRepository` skeleton + benchmark harness.**

| # | Phase | PR title (proposed) | Outputs |
|---|---|---|---|
| 1 | 0 | `docs(graph-workspace): repository reconciliation + non-build list` | `agent-studio-native-graph-workspace.md`, `native-graph-workspace-delta.md`, `agent-studio-graph-agent-integration-boundaries.md`, `agent-studio-postgres-neo4j-responsibility-split.md` |
| 2 | 0.5 | `docs(graph-workspace): existing data migration + projection plan` | Existing artifact mapping, projection rules, migration table data model |
| 3 | 1.1 | `docs(graph-workspace): KG/GraphRAG/Graph Agent taxonomy ADR` | `agent-studio-kg-graphrag-graph-agent-taxonomy.md` |
| 4 | 1.2 | `docs(graph-workspace): GraphRepository + backend strategy ADR` | `agent-studio-graph-repository-and-backend-strategy.md` + interface skeleton |
| 5 | 1.3 | `docs(graph-workspace): Neo4j CE backend architecture ADR` | `agent-studio-neo4j-community-edition-graph-backend.md` |
| 6 | 1.5-prep | `docs(graph-workspace): backend evaluation matrix + Aura reference ADRs` | `agent-studio-graph-backend-evaluation-matrix.md`, `agent-studio-neo4j-aura-agent-reference-architecture.md` |
| 7 | 1.4 | `feat(graph-workspace): backend benchmark harness — Postgres baseline` | `scripts/graph-bench/` (mirrors `scripts/load/` shape from V3 Phase 12) |
| 8 | 1.4 | `feat(graph-workspace): backend benchmark harness — Neo4j CE` | Adds Neo4j CE candidate to harness |
| 9 | 1.4 | `feat(graph-workspace): backend benchmark harness — Memgraph (optional)` | Adds Memgraph candidate or explicitly waives |
| 10 | 1.4 | `chore(graph-workspace): run benchmark spike + capture results` | `docs/evidence/graph-backend/2026-MM-DD-spike-results/` |
| 11 | **1.5** | **`docs(graph-workspace): backend decision gate — Neo4j CE promotion`** | **`agent-studio-active-graph-backend-decision.md` ◀── G3** |
| 12 | 1.6 | `docs(graph-workspace): ontology + constraints + provenance + ER ADRs` | 5 ADRs (`graph-ontology-registry`, `graph-constraint-registry`, `entity-resolution`, `graph-provenance-lineage`, `temporal-observation-model`) |
| 13 | 1.7 | `docs(graph-workspace): projection sync architecture ADR` | `agent-studio-graph-projection-sync.md` |
| 14 | 1 (rest) | `docs(graph-workspace): remaining MVP-0 ADRs (markdown profile, metadata, promotion semantics, query templates, skill packs, agent runtime, safety filter, locks, feedback, retention, perf targets, layout, query cache)` | 15+ ADRs from §5/§6 — likely 3–4 PRs by topic cluster |

**Sequencing within MVP 0:**

- PRs #1–6 in **first wave** (Track B architecture decisions; can run in parallel because each writes a separate file).
- PRs #7–10 in **second wave** (benchmark spike; sequential because each depends on harness extension).
- PR #11 is **the gate**. Until it merges, do not start MVP 1 Track C work that depends on backend choice.
- PRs #12–14 in **third wave** (post-G3 architecture; can run in parallel).

**Estimated effort:** MVP 0 is roughly 14–20 PRs and 2–4 weeks of calendar time, dominated by the benchmark spike (PRs #7–10). It's all documentation + harness; no risk to production code.

---

## 6. MVP 1 — Workspace Foundation

**Goal:** ship the durable Markdown vault. **No graph features beyond `TestGraphRepository` stubs and Phase 5 link extraction (Postgres-only, projection deferred to MVP 2).**

PR clustering (target 1–2 PRs per phase; bundle small phases):

| Cluster | Phases | Approx PRs |
|---|---|---|
| Vault core | 2 + 2.5 | 3–4 |
| Editor | 3 | 2–3 |
| Properties / metadata | 4 | 2 |
| Wikilinks / backlinks | 5 | 2 |
| Search / quick switcher / palette | 6 | 2–3 |

**Total MVP 1:** ~12–14 PRs, ~3–6 weeks.

**Cross-cutting requirements** (carry from V3 patterns):

- Every new table → Drizzle reconciler `ALTER TABLE ADD COLUMN IF NOT EXISTS` boot path.
- Every new server boundary → Layer 8 source-scan test in `tests/agent-studio/`.
- Every governance-relevant change → doc-block + lockstep test (see V3 cycle-5/6/7/8 lessons).
- New runtime endpoints emit to `agsRuntimeRuns` (V3 observability columns) + extend with workspace-specific fields.

**Parallel work in MVP 1:** Track B can continue building `Neo4jCommunityGraphRepository` skeleton + projection sync stubs in parallel — they don't ship to production yet but are ready for MVP 2.

---

## 7. MVP 2 — Neo4j CE Typed Graph Foundation

**Goal:** activate Neo4j CE as the dedicated graph backend; close G5 + G6.

**Key risk:** projection sync correctness. If projection drifts, every downstream feature (graph views, GraphRAG, Graph Agent) inherits the bug. Mitigations:

- **Property-based projection tests** before any projection job ships (mirrors V3 Layer 8 pattern).
- **Drift detection runs in CI** from day one (Phase 21 testing infra must exist by MVP 2 close, not deferred).
- **Projection snapshot rebuild** must be fully automated and tested.

**Phase 7 vs 7.5 distinction:** Phase 7 ships the typed graph metadata (Postgres) + `TestGraphRepository`-backed projections; Phase 7.5 swaps `Neo4jCommunityGraphRepository` in as the active backend. **Do not skip Phase 7.** Shipping straight to Phase 7.5 risks coupling features to Neo4j-specific behavior — Phase 7 enforces the abstraction.

**MVP 2 PR clustering:**

| Cluster | Phases | Approx PRs |
|---|---|---|
| Typed graph store + projections (Postgres-only, repo-stubbed) | 7 | 3–4 |
| Active Neo4j CE backend swap | 7.5 | 4–5 |
| Local + global graph views | 8 | 3 |
| Graph customization + governance-aware visibility | 9 | 2–3 |

**Total MVP 2:** ~12–15 PRs, ~3–5 weeks.

---

## 8. MVP 3 — Runtime Traceability and Promotion

**Goal:** make notes operational; close G7.

**Coupling risk:** Phase 11 (promotion) touches existing CAG and MCP runtime paths. **Pause-and-surface discipline applies** (V3 carry-forward pattern): if a promotion path collides with existing CAG runtime contract, surface to user before adapting. Don't quietly "adapt" canonical contracts.

**Phase 10 (lightweight references) must ship before Phase 11.** Reference ≠ promotion is a hard semantic boundary; users will misuse the system if promotion lands without the reference distinction live first.

**MVP 3 PR clustering:**

| Cluster | Phases | Approx PRs |
|---|---|---|
| Lightweight CAG/Graph Skill → source note refs | 10 | 2 |
| Promotion workflows (per asset type) | 11 | 5–7 (one per promotion type, bundled where shape matches) |
| Graph change proposals + entity merge/split | 11.5 | 3–4 |

**Total MVP 3:** ~10–13 PRs, ~3–5 weeks.

---

## 9. MVP 4 — GraphRAG and Graph Agent Lite

**Goal:** close G8 + G9 + G10. This is the headline milestone.

**Critical sequencing within MVP 4:**

```
Phase 12 retrieval router (with permission/safety filter)
    ↓ G8
Phase 12.5 Graph Skill Packs + Cypher templates
    ↓
Phase 13 Graph Agent Lite (uses Phase 12 retrieval + Phase 12.5 templates)
    ↓ G9
Phase 14 Runtime trace graph + decision trace projection
    ↓
Phase 20 + 21 — benchmark + continuous test infra (extends MVP 2 base)
    ↓
Phase 22 + 23 — feedback states + quality/correction loop
    ↓ G10
Golden questions pass — MVP 4 CLOSED
```

**MVP 4 PR clustering:**

| Cluster | Phases | Approx PRs |
|---|---|---|
| GraphRAG router + retrieval components | 12 | 4–5 |
| Graph Skill Packs + Cypher templates | 12.5 | 3 |
| Graph Agent Lite + Why-This-Answer | 13 | 4–5 |
| Runtime/decision trace graph + retention | 14 | 3 |
| Benchmark harness + continuous tests | 20 + 21 | 3–4 |
| Failure-state feedback + quality/correction | 22 + 23 | 4–5 |

**Phase 13.5 (Agentic GraphRAG)** is **deferred to V1**. Phase 13 is "Graph Agent Lite" intentionally — overbuilding adaptive planning in MVP risks the G9 boundary verification.

**Phase 15–19** (templates, attachments, saved views, Canvas strategy, sync/publish strategy) are **partly deferred and partly woven in**:

- Phase 15 templates → bundle with MVP 1 Phase 4 (frontmatter)
- Phase 15 attachments → bundle with MVP 1 Phase 5 (links/embeds)
- Phase 15 import/export MVP → MVP 4 (need it for runtime trace export)
- Phase 16 saved views → MVP 4 cluster
- Phase 17 Canvas strategy → MVP 0 ADR
- Phase 18 extension framework → MVP 0 ADR
- Phase 19 sync/publish → MVP 0 ADR

**Total MVP 4:** ~21–25 PRs, ~5–8 weeks.

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Backend benchmark fails Neo4j CE | Medium | High (blocks Phase 7+) | Pre-staged Memgraph candidate; explicit fallback path in §1.5 ADR |
| Projection drift undetected | High | Critical (silent graph bugs) | Property-based tests + drift detection in CI from MVP 2 day 1 |
| Permission filter pushdown leak | Medium | Critical (security) | Property-based visibility tests (V3 Phase 21 pattern); pen-test per gate |
| Phase 11 promotion conflicts with existing CAG | High | Medium (rework) | Pause-and-surface; do not silently adapt canonical CAG contract |
| Neo4j CE single-instance failure in production | Low (in MVP) | Medium | Phase 27 upgrade path documented; CE limits in admin docs |
| Cypher template injection | Medium | High (security) | Guarded Text2Cypher = read-only; query templates via parameter schema only; CI blocker on mutation |
| Graph Agent bypasses MCP dispatcher | Low (architecture forbids) | Critical | Phase 28 CI blocker + boundary tests every PR touching Graph Agent |
| Build-and-discard on UI surfaces | Medium | Medium (wasted effort) | Defer Phase 11b-3-style polish until V1; lens UI lands once, in Phase 24 |
| Authority scope unclear | High (today) | High (blocks autonomous execution) | First action: user defines authority scope for MVP 0 |
| Token/context exhaustion during long PRs | Medium | Low (slows velocity) | Use Agent tool for parallel research; avoid bundling >5 phases in one PR |
| Termux dev env quirks (npm cmd-shim, port registry) | Medium | Low (developer-time) | Memory has runbooks (`reference_termux_*`, `feedback_dev_env_*`) |

---

## 11. Testing & CI Strategy

**Layered testing model** (extends the V3 Layer 1–8 pattern):

| Layer | What it tests | Lands in |
|---|---|---|
| Layer 1 — type | tsc, drizzle reconciler | Every PR |
| Layer 2 — unit | per-module logic | Every PR |
| Layer 3 — integration | DB-backed flows | Per cluster |
| Layer 3c — runtime | tRPC + governance flows (V3 carry) | Per cluster |
| Layer 4 — e2e (deferred for now) | Browser flows | V1 |
| Layer 5 — golden questions | GraphRAG correctness | MVP 4 + ongoing |
| Layer 6 — property-based visibility | hidden-node leak detection | MVP 2 + ongoing |
| Layer 7 — projection drift | Postgres ↔ Neo4j consistency | MVP 2 + ongoing |
| Layer 8 — source-scan | boundary invariants (V3 carry) | Every PR touching boundaries |
| Layer 9 — benchmark | p50/p95 regression gate | MVP 4 + ongoing |

**CI blockers** (per Phase 28 governance) are **non-negotiable from Phase 7 onward**. Add each blocker as the corresponding feature ships, not retroactively.

**Test data fixtures:** §1.4 specifies a 10k-note / 100k-link target dataset. Build that fixture **once in MVP 0** (during the benchmark spike) and reuse it through MVP 4. It feeds backend benchmarks, projection drift tests, GraphRAG eval, and the golden-question suite.

---

## 12. Integration with Existing Plans

### 12.1 Phase 11b-3 carry-over

When Phase 14 (runtime trace graph) and Phase 24 (lens work) plans firm up, fold the deferred 11b-3 scope in as a carry-over note inside those phase plans. **Do not maintain 11b-3 as a separate plan.** See `runtime-hardening-v3-phase-11b-3-deferral.md` for the disposition.

### 12.2 Existing Modular Refactor (PR #75 KGRA Agent capsule final)

The new project shares acronym overlap (KGRA = Knowledge Graph + Reasoning Agent ≈ Graph Agent). Phase 0 reconciliation must **explicitly map** the existing KGRA capsule against the new Graph Agent runtime to avoid duplication. Likely outcome: existing KGRA primitives become Graph Agent components rather than parallel surfaces.

### 12.3 PMB / RAC cycle work

PMB Plan v3 cleanup arc is COMPLETE (Phase 41). RAC cycles 4–8 are COMPLETE. Neither has standing follow-ups in scope of this project. The Phase 0 inspection step ("Inspect existing RAC prompt composer / runtime path") should reference `project_cycle_8_complete.md` and `project_pmb_phase_41_complete.md` as authoritative for current state.

### 12.4 Data Analysis RTLM hardening (open follow-up)

There is a known canonical follow-up: "Data Analysis RTLM hardening: GraphRAG subdomain ownership, DB ownership, worker contract, and Digital HQ/AWI visibility." This **may overlap** with the new project's GraphRAG and graph backend tracks. Phase 0 reconciliation must check whether Data Analysis RTLM should consume or re-implement against the new Graph Agent + Neo4j CE infrastructure. Likely answer: consume.

---

## 13. Open questions for the user

These need answers before MVP 0 PR #1 can ship.

1. **Authority scope.** Autonomous execution authority for MVP 0 architecture decisions only? Or broader scope through MVP 4? Roadmap V3 had full autonomy; this project has none yet.
2. **Neo4j CE hosting.** Local-only dev (Docker) for MVP 0 benchmark spike, or pre-stage a managed Aura Free / staging instance for projection-sync testing?
3. **Memgraph candidate.** Include in benchmark spike, or explicitly waive at G3 unless Neo4j CE fails?
4. **Track J production hardening.** Confirm out-of-scope until Neo4j CE limits actually bite in production (per §Phase 27).
5. **Existing KGRA capsule disposition.** Keep + integrate, or explicitly deprecate in favor of new Graph Agent? Phase 0 inspection must answer.
6. **Existing Data Analysis RTLM disposition.** Consume new GraphRAG infra or stay independent? Likely consume.
7. **Calendar pacing.** Is this a "as fast as possible" arc (V3-style continuous execution) or a "ship MVP 0 then pause for review" arc?

---

## 14. First concrete action

If this execution plan is approved:

**MVP 0 PR #1 — `docs(graph-workspace): repository reconciliation + non-build list`**

Scope:

- Read AGENTS.md and existing module manifests (`docs/AI_TYPES_MODULE_COMMUNICATION.md`, `docs/agent-studio/`, `server/agent-studio/`, `client/src/App.tsx`)
- Inspect existing CAG / RAC / MCP / governance / runtime trace surfaces
- Inspect OpenRouter model access path
- Produce four docs:
  - `docs/architecture/agent-studio-native-graph-workspace.md` (top-level overview)
  - `docs/implementation/native-graph-workspace-delta.md` (gap analysis)
  - `docs/architecture/agent-studio-graph-agent-integration-boundaries.md`
  - `docs/architecture/agent-studio-postgres-neo4j-responsibility-split.md`
- Update `CLAUDE.md` with non-build list

**Acceptance:** all G1 acceptance checkboxes (§Phase 0 of the roadmap) tick.

**Estimated effort:** 1 day single-PR. No production code. Sets the contract for everything downstream.
