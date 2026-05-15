# Agent Studio Native Graph Workspace — Remaining Execution Plan

**Authored:** 2026-05-15
**Author:** Claude Opus 4.7 (autonomous V1+ execution authority)
**Repository:** `RachEma-ux/MyNewAp1Claude` · main @ `7d97d10c`
**Parent docs:**
- Canonical roadmap: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
- V1+ successor plan: `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md`
- Strict audit (binary classification): `docs/implementation/agent-studio-native-graph-workspace-strict-audit-2026-05-13.md`

This document supersedes nothing — it is an additive "what's left" execution plan covering the work between today's main (`7d97d10c`, post-PR #983) and the original roadmap's Phase 28 closure.

---

## 0. Status snapshot (where we are)

| Layer | State |
|---|---|
| MVP 0–4 strict audit | **14 FULLY · 1 PARTIALLY · 6 NOT IMPLEMENTED** (1 = operator-action, 5 = intentional deferral, 1 = V1+ plan placeholder) |
| V1+ plan — 10 phases | All opened; 13.5 FULLY; 15/16/17/18/19/J/MR-1/CRDT/OL-1 all deep in β/γ/δ |
| V1+ plan ledger | Drift — stops at PR #969; **#970–#983 (this session's 14 PRs) unrecorded** |
| Forward roadmap (20.5 / 23 agent runtime / 24 Bases & Lenses / 25 institutional-code-security / 26 advanced) | **Untouched** — the next genuinely new-territory candidates |
| CLAUDE.md Non-Build List | Contradicted on three axes (CRDT, offline, multi-region) by V1+ shipments — needs reconciliation |

---

## 1. Tracks (what "remaining" means)

The remaining work splits cleanly into seven tracks. They are deliberately ordered: each later track depends on or benefits from at least one earlier one.

| # | Track | Status | Est. PRs | Why this position |
|---|---|---|---|---|
| **T-A** | Doc-drift reconciliation | Required — blocks honest reporting | 2–3 | Lowest cost, unblocks tracker → audit consistency for everything else |
| **T-B** | V1+ saturation finish-out (β/γ/δ tails + MVP item 1 G3 evidence) | Tail work on opened phases | 6–10 | Closes the easiest-to-finish loose ends before opening new territory |
| **T-C** | CLAUDE.md Non-Build List reconciliation | Required — text says "out of scope" but code says shipped | 1 | Must precede any audit doc that claims those phases as legitimate |
| **T-D** | Phase 23 — Graph Quality Agent runtime + Semantic Enrichment + self-correction loop | New territory; detection-only today | 12–18 | First genuinely new phase; data model already exists for retention panels |
| **T-E** | Phase 20.5 — Code Graph Parser Spike | Decision-gate phase | 3–4 | Cheap; decides whether T-G (institutional/code/security) is achievable |
| **T-F** | Phase 24 — Full V1 Expansion: Bases MVP, Lens registry, Impact Analysis Lens | New territory | 14–20 | After Phase 23 detection feeds the Quality Lens; after the rate/age/distinct gauges arc establishes the in-render aggregate pattern |
| **T-G** | Phase 25 — Institutional / Code / Security / Recommendation graphs | Conditional on T-E result | 18–25 | Largest new surface; gated by T-E spike outcome |
| **T-H** | Phase 26 / 27 — V2 advanced (plugin framework, advanced GraphRAG, Aura upgrade) | V2.x scope | 20+ | Out of the autonomous-execution mandate's natural scope; needs operator approval |
| **T-I** | Phase 28 — Governance / Evaluation / Hardening (cross-cutting) | Continuous | n/a | Runs alongside T-D through T-G; not a discrete track |

**Total estimated PRs in autonomous scope (T-A through T-G): 56–80.**

---

## 2. Track-by-track plan

### T-A — Doc-drift reconciliation (2–3 PRs)

**Goal:** Reporting docs reflect main as of `7d97d10c` (post-#983).

**Acceptance criteria:**
1. `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` §6.1 ledger appended with rows for #970–#983 (14 rows). Each row: PR # / phase / one-paragraph scope / merge SHA.
2. `chatgpt-graph-workspace-progress-tracker.md` §7 table refreshed to include #970–#983.
3. `agent-studio-native-graph-workspace-continuation-state.md` "Next material work" paragraph rewritten to remove items that have shipped (MR caller-migration sub-arc, concrete lane hooks, App.tsx call site, y-protocols framing all done).
4. Memory file `~/.claude/projects/-root/memory/project_v1_plus_session_2026_05_15.md` already updated through #983 — no change needed; cross-link added to plan §6.1 header.

**First PR (T-A.1):** Single doc-only PR appending the 14 ledger rows + tracker refresh + continuation-state freshness pass.

**Dependencies:** None.

**Risk:** None — doc-only.

---

### T-B — V1+ saturation finish-out (6–10 PRs)

**Goal:** Close the tail-end loose ends on the 10 V1+ phases before opening new ones.

**Items remaining:**
1. **MVP item 1 (G3 Neo4j CE live benchmark) — operator-action only.** Code path is complete. Plan: trigger `graph-bench-neo4j-ce.yml workflow_dispatch`, commit the evidence under `docs/evidence/graph-backend/`. This is *not* an autonomous PR — it requires an operator to dispatch the workflow. **Plan deliverable: one-pager runbook for the operator + one PR that adds the evidence file once the run completes.**
2. **CRDT-γ-3 finish:** y-protocols framing in transport (the continuation-state doc named this as next material work; verify if shipped — last record I have is #791 framing transport wire-up. If unshipped, ship.)
3. **MR caller-migration tail:** the `getAsDb` caller inventory was shipped (#794) and #797/#798 migrated two callers. Inventory the remaining unmigrated callers; ship a closing batch.
4. **Concrete extension lane hooks:** the 18-β registry shipped (#768); concrete hooks for `retrieve` / `assemble` / `compose` lanes did not. Ship one PR per lane.
5. **App.tsx/main.tsx OL bootstrap call site with real tRPC mutations:** the OL-9 mutation router (#785) + OL-6 bootstrap composer (#779) + NV-1 deleteNote endpoint (#780) make this trivially small; one PR.
6. **Phase 16 saved-views Lens registry preview:** wires the saved-view → graph lens projection that Phase 24 needs. One PR.

**Acceptance criteria per item:** PR-V1-XXX with source-scan boundary tests + caller integration tests.

**Estimated:** 6–10 PRs.

**Dependencies:** T-A (so the ledger isn't stale before adding more rows).

**Risk:** Low — extending shipped surfaces.

---

### T-C — CLAUDE.md Non-Build List reconciliation (1 PR)

**Goal:** The CLAUDE.md "Non-Build List" still lists CRDT, offline, multi-region as deferred. The V1+ plan shipped first slices of all three. The text is dishonest.

**Acceptance criteria:**
1. CLAUDE.md §"Native Graph Workspace — Non-Build List (MVP 0–4)" updated to:
   - Move CRDT / offline / multi-region out of the unconditional Non-Build List
   - Mark them "V1+ plan scope — first slices shipped 2026-05-13; full hardening in V2.0 per the V1+ plan"
   - Keep the **MVP-0-4 boundary** language intact (this isn't license to expand MVP scope)
2. Add a forward pointer to the V1+ plan + this remaining-plan doc.
3. The "Hard rules" list (GraphRepository, Postgres SoT, MCP dispatcher, OpenRouter) untouched — those are eternal.

**First PR (T-C.1):** Single CLAUDE.md edit + a 1-test source-scan that asserts the eternal hard rules text is preserved verbatim (mortgages against accidental removal).

**Dependencies:** None.

**Risk:** Low — doc-only. Slightly higher than T-A because CLAUDE.md is load-bearing for future-Claude behavior; an inaccurate edit propagates wrong rules into every future session.

---

### T-D — Phase 23: Graph Quality Agent + Semantic Enrichment + Self-Correction loop (12–18 PRs)

**Goal:** Turn the existing detection-only graph quality surface into a governed proposal → approval → reproject loop.

**Today (what exists):**
- `ags_graph_quality_*` retention panels (PR-AT-6) — UI for cleaning up scan results
- `ags_graph_correction_*` retention panels (PR-AT-6) — UI for cleaning up correction proposals
- Drift detection cron (PR-AT-3) — writes drift events; does NOT auto-resolve
- Graph change proposals + decisions + audit events tables exist
- ApprovalSteps gate adapter exists (#776 AS-1) — re-usable for correction approval

**What's NOT shipped:**
- Graph Quality Agent runtime (the agent that *runs scans and emits proposals*)
- Semantic Enrichment Agent runtime (the LLM-driven proposer)
- The proposal-creation pipeline (detection → evidence + confidence → governance row)
- The approval → Postgres SoT mutation → Neo4j reprojection chain
- Golden-question failure → correction-proposal hook

**Sub-arc breakdown:**

#### T-D.1 — Quality Agent detection runtime (3–4 PRs)
- New file `server/agent-studio/services/graph-quality/quality-agent.ts` — runs orphan-node / duplicate-entity / missing-required-property / stale-fact / weak-description / projection-drift scans.
- Each scan emits a `GraphQualityFinding` row into `ags_graph_quality_findings`.
- Quality Agent does NOT mutate the graph — proposal creation only.
- Cron entry-point at `*/30 * * * *`; manual-trigger tRPC procedure for operators.
- Source-scan: no `neo4j-driver` import outside `services/graph/repository/**`.

#### T-D.2 — Correction-proposal pipeline (3 PRs)
- Service that converts a finding into a `GraphCorrectionProposal` row with evidence + confidence.
- Reuses ApprovalSteps gate (#776) — composer pattern from `composeGovernanceGates` (#784).
- Per proposal kind (entity_merge / entity_split / projection_correction / description_enrichment), wire a typed input schema.

#### T-D.3 — Semantic Enrichment Agent (3–4 PRs)
- LLM-driven — must route through OpenRouter Model Access only (boundary tested).
- Source-backed: every enrichment proposal cites the source note version.
- Confidence threshold gate (config-driven; default 0.8); below-threshold proposals are auto-rejected.
- Reuses the Phase 13.5 agentic loop bounded-iteration scaffold.

#### T-D.4 — Approve → SoT mutation → reproject chain (3–4 PRs)
- On `correction_proposal.status = approved`, mutate Postgres source-of-truth row.
- Trigger a `graph-projection-sync` rerun for the affected scope.
- Write an `ags_graph_correction_audit_event` row.
- Reject path writes audit row + leaves SoT untouched.

#### T-D.5 — Golden-question failure → correction loop (2–3 PRs)
- When the Phase 12 GraphRAG router answers wrong on a golden question, emit a correction proposal targeted at the implicated graph fact(s).
- Closes the "self-correcting" loop in the roadmap §0 product vision.

**Acceptance criteria for T-D as a whole:**
- [ ] Graph quality scan runs (cron + manual)
- [ ] Duplicate entities detected
- [ ] Stale graph facts detected
- [ ] Projection drift detected (already done — PR-AT-3 — extended to propose corrections)
- [ ] Missing required properties detected
- [ ] Semantic enrichment proposals created
- [ ] Both agents create proposals only (no direct graph mutation — source-scan tested)
- [ ] Human/governance approval required before SoT mutation
- [ ] Approved correction reprojects to Neo4j CE
- [ ] Approved + rejected paths both auditable
- [ ] Golden-question failure creates correction proposal

**Dependencies:**
- Phase 11.5 proposal/approval surface (done)
- Phase 14 runtime trace + drift cron (done)
- Phase 13.5 agentic loop (done — reused for Semantic Enrichment)
- ApprovalSteps gate (done — #776)
- `composeGovernanceGates` (done — #784)

**Risk:** Medium. The autonomous-mutation surface is the highest-leverage abuse surface in the system. Source-scan boundary tests are non-negotiable. Per CLAUDE.md hard rules: graph mutations only through Phase 11.5 proposal/approval.

**Governance:** Touch with Reviewer + Governance both.

---

### T-E — Phase 20.5: Code Graph Parser Spike (3–4 PRs)

**Goal:** Determine whether Code Intelligence Graph (T-G prerequisite) is achievable.

**Acceptance criteria:**
- [ ] `docs/implementation/agent-studio-code-graph-parser-spike-2026.md` — spike report
- [ ] Sample repo ingestion attempt with tree-sitter (TypeScript + Python at minimum)
- [ ] Parser strategy documented: single tree-sitter vs per-language AST tools vs LLM-driven
- [ ] Code node/edge model validated: `Repository` / `File` / `Class` / `Function` / `ApiEndpoint` / `IMPORTS` / `CALLS` / `DECLARES` / `IMPLEMENTS` / `DEPENDS_ON`
- [ ] Performance measurement: ingest this repo, measure parse time + projection time + Neo4j CE query latency on 5 representative impact-analysis queries
- [ ] **Decision:** proceed with T-G Code Intelligence Graph, defer, or revise scope

**First PR (T-E.1):** Doc + tree-sitter dependency add (under spike, not production). Source-scan test ensuring tree-sitter is not imported outside `services/code-graph/spike/`.

**Dependencies:** None.

**Risk:** Low (spike). Decision outcome determines T-G scope.

---

### T-F — Phase 24: Full V1 Expansion (14–20 PRs)

**Goal:** After T-D's detection→proposal→reproject loop closes, build the user-facing lens surface that makes the graph visible to operators in ways beyond the per-table admin panels.

**Sub-arc breakdown:**

#### T-F.1 — Lens Registry primitive (3 PRs)
- `services/graph-lens/registry.ts` — registers named lenses with: id, label, layout, default-filter, governance-scope.
- 8 lens kinds (closed taxonomy): `RAG` / `RAC` / `CAG` / `GraphSkill` / `MCP` / `Governance` / `Runtime` / `InstitutionalMemory`.
- Source-scan test: no lens may import `neo4j-driver` directly; all queries route through `GraphRepository`.

#### T-F.2 — Bases MVP (4–5 PRs)
- Database-view-style filtered note browser.
- New tables: `agsBases`, `agsBaseFilters`, `agsBaseColumns`.
- UI: `client/src/modules/agent-studio/pages/BasesPage.tsx`.
- Reuses the saved-view sharing + versioning model (Phase 16-α/β/γ shipped).
- Per-base permission-aware re-materialization (re-run viewer's filter; no snapshot leak).

#### T-F.3 — Impact Analysis Lens (3–4 PRs)
- 7 impact types from roadmap §"Phase 24": `KnowledgeImpact` / `RuntimeImpact` / `CodeImpact` / `SecurityImpact` / `GovernanceImpact` / `ToolImpact` / `WorkflowImpact`.
- Each impact type is a parameterized Cypher template registered in `ags_query_templates`.
- UI: pick a starting node + impact type, render the impact subgraph.
- Permission-aware: hidden nodes pruned post-traversal.

#### T-F.4 — Quality Lens (2 PRs)
- Reads from T-D's `ags_graph_quality_findings` + `ags_graph_correction_proposals`.
- Visual surface for operators to triage findings.
- Approve/reject buttons inline.

#### T-F.5 — Runtime Lens / Decision-Trace Lens (2 PRs)
- Reads from `agsRuntimeRuns` + `graphAgentDecisionTrace`.
- Per-run flame-graph view of decision steps (reuses the slowest-step gauge from #982 + step-kind distribution from #983).

**Acceptance criteria for T-F as a whole:**
- [ ] Lens registry exists with 8 closed-taxonomy kinds
- [ ] Bases MVP works (create / share / version)
- [ ] Impact Analysis works for all 7 impact types using Neo4j CE
- [ ] Quality Lens triages T-D findings
- [ ] Runtime Lens / Decision-Trace Lens uses the existing trace tables
- [ ] All lens queries route through GraphRepository (source-scan)
- [ ] Permission post-filtering applied everywhere

**Dependencies:**
- T-A doc-drift (so the new ledger appends honestly)
- T-D Phase 23 detection runtime (Quality Lens needs the findings)
- Phase 13.5 (already done — Runtime Lens uses the trace)
- `ags_query_templates` registry (done)

**Risk:** Medium — lens registry is a new public-API surface and the wrong shape now is costly later. Closed-taxonomy + ADR for lens-kind extension rules.

---

### T-G — Phase 25: Institutional / Code / Security / Recommendation graphs (18–25 PRs)

**Goal:** Add the 4 enterprise-grade graph lenses beyond notes + runtime.

**Conditional on T-E spike outcome.** If the spike shows tree-sitter parser strategy is viable, proceed with all four sub-arcs. If not, defer the Code Intelligence sub-arc and ship the other three.

#### T-G.1 — Institutional Memory Lens (5–6 PRs)
- Node types: `Person` / `Team` / `Project` / `System` / `Service` / `Decision` / `Policy` / `Workflow` / `Document` / `Outcome` / `Responsibility` / `TimelineEvent` / `GovernanceRecord`
- Each maps to existing tables where possible (`Person` → `users`, `Workflow` → `workflows`, `Decision` → `agsApprovalSteps`, etc.)
- New projection sync jobs per node type
- Lens-specific Cypher templates

#### T-G.2 — Code Intelligence Graph (8–10 PRs — gated on T-E)
- Node types: `Repository` / `Package` / `File` / `Class` / `Function` / `Method` / `ApiEndpoint` / `Service` / `DbTable` / `FrontendComponent` / `ConfigFile` / `TestFile`
- Edges: `IMPORTS` / `CALLS` / `DECLARES` / `IMPLEMENTS` / `DEPENDS_ON` / `READS_FROM_TABLE` / `WRITES_TO_TABLE` / `ROUTES_TO` / `RENDERS_COMPONENT` / `TESTS`
- Ingestion: from this repo + N additional repos operator chooses
- Re-ingestion cron

#### T-G.3 — Security / DevSecOps Graph Lens (4–5 PRs)
- Node types: `CVE` / `SecurityFinding` / `Component` / `Package` / `Service` / `Environment` / `Owner` / `CustomerExposure` / `Policy` / `Control`
- Path: `CVE → Package → Component → Service → Environment → Owner → CustomerExposure`
- External data ingestion: NVD CVE feed (read-only)
- Permission-scoped: security findings are not workspace-public

#### T-G.4 — Recommendation Service (3–4 PRs)
- Pattern: recommend relevant notes / CAG blocks / Graph Skill Packs / tools / policies / workflows / experts / next actions
- Output: rank + reason + graph path + source citations + confidence + permission status
- Reuses the GraphRAG router (done)

**Acceptance criteria for T-G as a whole:**
- [ ] Institutional Memory Lens works
- [ ] Code Intelligence Graph ingestion (or recorded decision to defer)
- [ ] Security Graph Lens works
- [ ] Recommendation service pattern works
- [ ] Impact analysis can traverse institutional / code / security graphs
- [ ] Neo4j CE performance acceptable OR upgrade trigger fires (→ Track T-H)
- [ ] Permission rules enforced

**Dependencies:** T-D (Quality Agent), T-E (Code spike), T-F (Lens registry).

**Risk:** High. Largest new surface. CE performance may bite — could trigger T-H.

---

### T-H — Phase 26 / 27: V2 advanced + Neo4j Enterprise/Aura upgrade (20+ PRs)

**Out of autonomous-execution scope today.** Listed here for completeness.

#### T-H.1 — Plugin framework (8+ PRs)
- Governed plugin manifest + signing + sandbox
- Plugin → MCP dispatcher boundary (no direct dispatcher import)
- Plugin lifecycle: install / approve / disable / revoke (already implemented for extensions — same scaffolding)

#### T-H.2 — Neo4j Enterprise / Aura upgrade (6+ PRs)
- Trigger conditions documented (already done — `agent-studio-neo4j-aura-upgrade-path.md`)
- Migration runbook execution (existed at PR-V1-1 + #748)
- Aura provisioning + dual-write window + cutover + verification

#### T-H.3 — Advanced GraphRAG / Multi-agent / Cross-workspace (6+ PRs)
- Bounded multi-agent loop atop the agentic surface (#737)
- Cross-workspace permission boundary tests (highest-risk surface in the entire system)

**Dependencies:** T-D, T-F, T-G.

**Risk:** Highest. Plugin framework is third-party-code execution surface; cross-workspace GraphRAG is the strongest permission-leak surface. Both gate on operator approval.

**Governance:** Both phases require operator opt-in before autonomous execution begins.

---

### T-I — Phase 28: Cross-cutting Governance / Evaluation / Hardening

Not a standalone track — interleaves with T-D through T-G. Specifically:

- **Per-PR governance scans:** every new lens / agent / mutation path adds a source-scan integrity test.
- **Continuous golden-question execution:** the Phase 12 evaluator runs in CI on every PR that touches retrieval / agent / Neo4j repository code.
- **Performance gates:** p95 latency regression detection on `graph-bench-neo4j-ce.yml`.
- **Audit-trail completeness:** every mutation produces an `ags_*_audit_event` row; source-scan test verifies the row creation.

These are operating *rules* applied to T-D..T-G PRs, not a discrete sub-arc.

---

## 3. Cross-cutting hard rules (apply to every PR in this plan)

These extend the V1+ plan §3 and CLAUDE.md hard rules. Source-scan tested on every relevant PR.

| Rule | Applies to |
|---|---|
| Provider credentials flow through `withProviderCredential` (Plan v3 D1) — never `process.env.*_API_KEY` reads | T-D.3 (LLM-driven enrichment), T-G.3 (CVE feed ingestion) |
| Postgres = source of truth; Neo4j projections are derived | All of T-D, T-F.3, T-G |
| Graph mutations only through Phase 11.5 proposal/approval | All of T-D — non-negotiable |
| GraphRepository sole graph access; no `neo4j-driver` outside `services/graph/repository/**` | All of T-F, T-G |
| MCP dispatcher chokepoint | All agent runtimes in T-D, T-G.4 |
| OpenRouter sole model-execution path | T-D.3, T-G.4 |
| Bounded agentic loops; max-iterations + governance flag | T-D.3, T-H.3 |
| Closed taxonomies (lens kinds, impact types, node types) — source-scan with contract anchor | T-F, T-G |
| ADR before code for any new boundary | T-D agent runtimes, T-F lens registry, T-G new lenses |

---

## 4. Test layers added

The V1+ plan added Layer 10 (adaptive-loop boundary) + Layer 11 (cross-region routing). This plan adds:

| Layer | What it tests | Lands in |
|---|---|---|
| **Layer 12 — proposal-only invariance** | Quality Agent + Semantic Enrichment never mutate the graph; mutations only flow through approval | T-D |
| **Layer 13 — lens permission-leak** | Property-based: for any hidden node, no lens reveals it (count / citation / path / preview) | T-F |
| **Layer 14 — code-graph parse stability** | Tree-sitter parse output for the spike sample repo is byte-stable across runs | T-E |
| **Layer 15 — impact-analysis permission-aware traversal** | Impact subgraphs honor viewer permission post-filter even when an unprivileged node appears in the path | T-F.3, T-G |

---

## 5. Risk register

| Risk | Track | Mitigation |
|---|---|---|
| Quality Agent emits unsafe correction (auto-deletes valid graph fact) | T-D | Proposal-only invariance (Layer 12). Mutations gated by ApprovalSteps. Confidence threshold for auto-rejection. |
| Lens permission leak | T-F | Property-based tests (Layer 13). Permission post-filter after every traversal. |
| Code Graph parser produces unstable output | T-E | Spike-only; byte-stable test (Layer 14). Defer T-G.2 if parser unstable. |
| Cross-workspace recommendation leaks data | T-G.4 | Tenant-scoped retrieval cap. Permission-aware ranking. |
| Neo4j CE limits bite during T-G ingestion | T-G | Phase 27 runbook already exists. T-H.2 trigger. |
| Plugin framework executes untrusted code | T-H.1 | Out of autonomous scope. Operator approval gate. |

---

## 6. PR sequencing recommendation

Recommended order (acknowledging the autonomous-execution mandate's preference for continuous shipment):

1. **T-A** (2–3 PRs) — doc-drift, day 1
2. **T-C** (1 PR) — CLAUDE.md reconciliation, day 1
3. **T-B** (6–10 PRs) — saturation finish-out, days 1–3
4. **T-E** (3–4 PRs) — Code Graph spike, days 2–4 (parallelizable with T-D)
5. **T-D** (12–18 PRs) — Phase 23 Quality Agent, days 3–10
6. **T-F** (14–20 PRs) — Phase 24 Bases + Lens + Impact, days 6–14 (Quality Lens depends on T-D landing)
7. **T-G** (18–25 PRs) — Phase 25 Institutional/Code/Security, days 12–22 (gated on T-E result)
8. **T-H** (20+ PRs) — V2 advanced + Aura migration — defer pending operator approval

**Total in autonomous scope: ~60–80 PRs over an estimated 3-week burst at the current shipping cadence (~30 PRs/day at admin-saturation density; ~5–10 PRs/day at new-territory density).**

---

## 7. What this plan deliberately does NOT cover

- **Plugin framework execution** (T-H.1) — operator approval required before autonomous build
- **Neo4j Aura migration** (T-H.2) — operator approval + paid infrastructure provisioning required
- **Multi-region rollout** (V2.0 production deployment, separate from MR-1 code shipments) — operator approval required
- **Real-time collaboration full hardening** (CRDT-δ+) — V2.0 scope per CLAUDE.md; the code is there but production deployment needs operator opt-in
- **Offline mode full operator rollout** — same as CRDT; code is there, deployment isn't
- **Code Intelligence ingestion of repos other than this one** — operator selection of additional repos required

---

## 8. Final-state success criteria

When this plan completes, the following must hold:

- [ ] Strict-audit doc shows **21 FULLY / 0 PARTIALLY / 0 NOT IMPLEMENTED** (or honest reclassification of any deferred items)
- [ ] V1+ plan ledger reflects current main
- [ ] CLAUDE.md text matches code reality
- [ ] All 28 roadmap phases either FULLY IMPLEMENTED or have a documented deferral with named trigger conditions
- [ ] Layer 10–15 test suites all green in CI
- [ ] Golden question suite passes ≥95% (operator-configurable threshold)
- [ ] Performance benchmarks meet documented p95 targets
- [ ] All cross-cutting hard rules source-scan tested in CI

---

## 9. Authority and process

This plan is executed under the standing autonomous mandate captured in:
- `~/.claude/projects/-root/memory/feedback_native_graph_workspace_continuing_rule.md`
- `~/.claude/projects/-root/memory/feedback_no_pause_summaries.md`
- `~/.claude/projects/-root/memory/feedback_full_autonomous_execution.md`

Tracks T-A through T-G can ship autonomously. Tracks T-H sub-arcs require explicit operator approval before execution begins. Any track may be re-prioritized or descoped by operator instruction at any turn.

---

## 10. References

- Roadmap: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
- V1+ plan: `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md`
- Strict audit: `docs/implementation/agent-studio-native-graph-workspace-strict-audit-2026-05-13.md`
- Tracker: `docs/implementation/chatgpt-graph-workspace-progress-tracker.md`
- Continuation state: `docs/implementation/agent-studio-native-graph-workspace-continuation-state.md`
- Phase 27 upgrade ADR: `docs/architecture/agent-studio-neo4j-aura-upgrade-path.md`
- Multi-region ADR: `docs/architecture/agent-studio-multi-region.md`
- CRDT ADR: `docs/architecture/agent-studio-realtime-collab-crdt.md`
- Offline ADR: `docs/architecture/agent-studio-offline-local-first.md`
- Agentic GraphRAG ADR: `docs/architecture/agent-studio-agentic-graphrag.md`
- CLAUDE.md (architectural authority + hard rules)
- AGENTS.md (operating order)
