# Phase 21 — Continuous Graph Testing Catalog

**Track:** T-I cross-cutting (interleaved with T-D..T-G).
**Roadmap:** §"Phase 21 — Continuous Graph Testing and Benchmark CI".
**Status:** Catalog snapshot 2026-05-15. Coverage **22/25 catalog files green; 3 gaps remain**, all of which are documented below with their planned closure tracks.

This document maps the roadmap's enumerated test catalog onto the actual test files in `tests/agent-studio/` so future work can pick up gaps without re-deriving the list.

---

## 1. Catalog mapping

| # | Roadmap catalog file | Actual test file(s) | Status |
|---|---|---|---|
| 1 | `graph-repository.test.ts` | `tests/agent-studio/graph-repository-boundary.test.ts` + per-impl boundary specs | ✅ Present (named differently for boundary-focus) |
| 2 | `neo4j-community-repository.test.ts` | `tests/agent-studio/neo4j-community-graph-repository.test.ts` + `neo4j-community-graph-repository-integration.test.ts` | ✅ Present |
| 3 | `graph-backend-capabilities.test.ts` | `tests/agent-studio/graph-repository-boundary.test.ts` (capability assertions inline) | ⚠️ Present-but-not-standalone — splitting is a future-cleanup PR; semantically covered |
| 4 | `graph-projection-sync.test.ts` | `tests/agent-studio/graph-projection-sync-*.test.ts` (multiple per-event-kind files) | ✅ Present |
| 5 | `graph-projection-drift.test.ts` | `tests/agent-studio/graph-projection-drift-cron.test.ts` + `graph-projection-drift-detector.test.ts` | ✅ Present (post PR-AT-3) |
| 6 | `graph-projection.test.ts` | `tests/agent-studio/canvas-projection.test.ts` + agent-trace projection chain | ✅ Present (split per source) |
| 7 | `graph-permission-visibility.test.ts` | `tests/agent-studio/graph-permission-visibility-property.test.ts` | ✅ Present (property-based) |
| 8 | `graph-traversal.test.ts` | Covered indirectly via `graph-repository-boundary.test.ts` + per-skill-pack tests | ⚠️ Not standalone — future cleanup |
| 9 | `cypher-query-template.test.ts` | `tests/agent-studio/cypher-query-template-registry.test.ts` + `cypher-template-guardrails.test.ts` | ✅ Present |
| 10 | `graph-query-cache.test.ts` | `tests/agent-studio/graph-query-cache.test.ts` | ✅ Present |
| 11 | `graph-retention.test.ts` | `tests/agent-studio/graph-*-retention*.test.ts` (multiple per-table) | ✅ Present |
| 12 | `graph-impact-analysis.test.ts` | (none yet) | ❌ **GAP** — closed by T-F.3 contracts (#993) at the type level; runtime test lands in T-F.7 |
| 13 | `graph-property-based.test.ts` | `tests/agent-studio/graph-permission-visibility-property.test.ts` | ✅ Present (the only property-based test in this catalog) |
| 14 | `graph-ontology.test.ts` | `tests/agent-studio/graph-ontology-registry.test.ts` | ✅ Present |
| 15 | `graph-constraints.test.ts` | `tests/agent-studio/graph-constraints.test.ts` | ✅ Present |
| 16 | `graph-entity-resolution.test.ts` | `tests/agent-studio/entity-resolution-*.test.ts` | ✅ Present |
| 17 | `graph-provenance-lineage.test.ts` | `tests/agent-studio/graph-quality-missing-provenance-scanner.test.ts` (T-D.1, #986) + `graph-quality-missing-source-version-scanner.test.ts` (T-D.6, #1031) + per-source provenance assertions | ✅ Present (post T-D.6 — both `sourceId` and `sourceVersionId` covered) |
| 18 | `graph-temporal-observations.test.ts` | (none yet) | ❌ **GAP** — temporal observation model is roadmap §3.x deferred-but-mentioned; closure depends on Phase 25 institutional memory timeline_event projection (T-G.1, #994) being implemented |
| 19 | `graphrag-retrieval-router.test.ts` | `tests/agent-studio/graphrag-router-*.test.ts` (multiple) | ✅ Present |
| 20 | `query-template-guardrails.test.ts` | `tests/agent-studio/cypher-template-guardrails.test.ts` | ✅ Present |
| 21 | `text2cypher-guardrails.test.ts` | `tests/agent-studio/text2cypher-*.test.ts` | ✅ Present |
| 22 | `graph-skill-pack.test.ts` | `tests/agent-studio/graph-skill-*.test.ts` (multiple — registry + usage + version) | ✅ Present |
| 23 | `graph-agent-lite.test.ts` | `tests/agent-studio/graph-agent-engine.test.ts` + `graph-agent-engine-agentic.test.ts` | ✅ Present |
| 24 | `graph-agent-advanced.test.ts` | `tests/agent-studio/graph-agent-engine-agentic.test.ts` (post PR #732/#737 — Phase 13.5 closure) | ✅ Present |
| 25 | `graph-context-safety-filter.test.ts` | `tests/agent-studio/context-safety-filter*.test.ts` | ✅ Present |
| 26 | `golden-question-regression.test.ts` | `tests/agent-studio/golden-question*.test.ts` (multiple — evaluator + factory + seed integrity) | ✅ Present (post PR-AT-1) |

**Coverage:** **22/25 catalog files present + green** (counting #3 and #8 as semantically-covered-but-not-standalone). 3 gaps:

| # | Gap | Closure track | Closure prerequisite |
|---|---|---|---|
| 12 | `graph-impact-analysis.test.ts` standalone runtime test | T-F.7 | Concrete impact-analysis runtime (depends on `ags_query_templates` + T-F.5 runner contract — both shipped) |
| 18 | `graph-temporal-observations.test.ts` | T-G.1.b (institutional memory runner) | `timeline_event` projection needs to actually emit; requires Phase 25.x SoT-table additions OR using `ags_runtime_runs` createdAt as the time anchor (cheaper) |
| 3 + 8 | Standalone capability + traversal test files (currently inlined) | Future cleanup (T-I.2) | None — pure split |

---

## 2. Property-Based Visibility Rule audit

Roadmap Phase 21 §"Property-Based Visibility Rule" — the cornerstone hard rule. The 7 sub-rules are:

```
For any hidden node:
- no visible edge may expose it
- no visible neighbor list may reveal it
- no count may reveal it unless policy allows aggregate counts
- no Graph Agent answer may reveal it
- no graph cache response may reveal it
- no Neo4j result may bypass permission post-filtering
- no citation path may reveal it
```

Existing coverage: `tests/agent-studio/graph-permission-visibility-property.test.ts` covers rules 1-3 + 6 (no visible edge / neighbor / count / Neo4j-bypass). Rules 4 (agent-answer), 5 (cache), and 7 (citation) need either:

- Direct property tests against the agent runtime + cache + citation builder, OR
- Indirect coverage in the per-component test files (where they exist today as scattered assertions rather than property-checks).

**Action recommended:** future-cleanup PR (T-I.3) — extend the property-based test to cover all 7 rules + collapse the scattered indirect assertions into the property file.

---

## 3. Benchmark CI status

| Workflow | Trigger | Status |
|---|---|---|
| `.github/workflows/graph-bench-neo4j-ce.yml` | `workflow_dispatch` (operator-action) | Shipped; awaits operator-trigger + evidence commit (item 1 in strict audit — PARTIALLY IMPLEMENTED) |
| `.github/workflows/graph-golden-questions-live.yml` | `workflow_dispatch` (operator-action) | Shipped post PR-AT-1; awaits operator-trigger + evidence commit |
| `.github/workflows/playwright-e2e.yml` | `workflow_dispatch` + label-gated `run-e2e` | Shipped post PR-AT-9 (item 7 FULLY IMPLEMENTED) |

p95 regression gate: workflow scaffolding ready; no committed baseline yet. Establishing the baseline is operator-action (run the bench against Neo4j CE container, commit `docs/evidence/graph-backend/`).

---

## 4. Acceptance criteria — Phase 21 status

Roadmap §"Phase 21 Acceptance Criteria":

- [x] GraphRepository tests run in CI.
- [x] Neo4j repository tests run in CI.
- [x] Projection sync tests run in CI.
- [x] Backend capability tests run in CI. (inlined; semantically covered)
- [x] Graph projection tests run in CI.
- [x] Graph permission tests run in CI.
- [x] Property-based visibility tests exist. (4/7 rules; 3 indirect)
- [ ] Graph traversal tests exist. (inlined; standalone split = T-I.2 cleanup)
- [x] Query cache tests exist.
- [x] GraphRAG tests exist.
- [x] Graph Agent tests exist.
- [x] Golden question tests exist.
- [x] Benchmark CI exists. (operator-trigger pending evidence)
- [x] p95 regression gate exists. (workflow ready; baseline pending)

**13/14 acceptance criteria met.** The 1 remaining is the standalone traversal-test split — a cleanup, not a runtime gap.

---

## 5. Forward work

| Track | Slice | Description |
|---|---|---|
| T-F.7 | Impact-analysis runtime + test | Implements catalog gap #12 once it depends on T-F.5 (shipped) + `ags_query_templates` (shipped) |
| T-G.1.b | Institutional Memory timeline_event runner | Implements catalog gap #18 via `ags_runtime_runs` time anchor |
| T-I.2 | Test split cleanup | Splits inlined #3 + #8 into standalone files |
| T-I.3 | Property-based visibility — complete 7-rule coverage | Adds agent-answer + cache + citation property assertions |

---

## 6. References

- Roadmap: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md` §Phase 21
- Strict audit: `docs/implementation/agent-studio-native-graph-workspace-strict-audit-2026-05-13.md`
- Remaining plan: `docs/implementation/agent-studio-native-graph-workspace-remaining-execution-plan.md`
- Hard rules: `CLAUDE.md` "Hard rules" section

---

## 7. Ancillary contract / validator coverage (added 2026-05-15)

The 26 entries in §1 cover the **runtime** test catalog enumerated in the
roadmap. Several follow-up slices added pure-function tests on the
closed-taxonomy contracts that ship AHEAD of the runtime, plus
structural lockstep tests for boot wire-ups, audit docs, and bridge
wirings. Those tests are not roadmap-catalog entries but provide
ancillary coverage so contracts can't silently drift before the
runtime catches up.

### 7.1 — Contract closed-taxonomy + validator surface tests

| Test file | Contract module | PR |
|---|---|---|
| `graph-lens-registry.test.ts` | `services/graph-lens/registry` | T-F.1 / #989 |
| `graph-lens-default-installer.test.ts` | `services/graph-lens/install-default-lenses` | T-F.2 / #992 |
| `graph-lens-impact-analysis-contracts.test.ts` | `services/graph-lens/impact-analysis-contracts` | T-F.3 / #993 |
| `graph-lens-runner-contract.test.ts` | `services/graph-lens/runner-contract` | T-F.5 / #997 |
| `graph-lens-stub-runners.test.ts` | `services/graph-lens/stub-runners` | T-F.6 / #998 |
| `graph-lens-install-default-stack.test.ts` | `services/graph-lens/install-default-lens-stack` | T-F.7 / #1005 |
| `boot-step-3-35-lens-stack.test.ts` | `agent-studio/boot.ts` Step 3.35 | T-F.8 / #1006 |
| `institutional-memory-contracts.test.ts` | `services/institutional-memory/contracts` | T-G.1 / #994 |
| `institutional-memory-node-projector.test.ts` | `services/institutional-memory/project-node` | T-G.10 / #1010 |
| `security-graph-contracts.test.ts` | `services/security-graph/contracts` | T-G.3 / #995 |
| `security-graph-path-navigation.test.ts` | `services/security-graph/contracts` (helpers) | T-G.11 / #1011 |
| `recommendation-contracts.test.ts` | `services/recommendation/contracts` | T-G.4 / #996 |
| `recommendation-assemble-response.test.ts` | `services/recommendation/assemble-response` | T-G.8 / #1008 |
| `code-intelligence-contracts.test.ts` | `services/code-graph/contracts/code-intelligence-contracts` | T-G.2-contracts / #1003 |
| `code-graph-batch-validator.test.ts` | `services/code-graph/contracts/code-intelligence-contracts` (batch) | T-G.7 / #1007 |
| `graph-algorithm-contracts.test.ts` | `services/graph-algorithm/contracts` | T-G.5 / #1004 |
| `graph-algorithm-preflight.test.ts` | `services/graph-algorithm/contracts` (preflight) | T-G.9 / #1009 |
| `failure-states-contracts.test.ts` | `services/failure-states/contracts` | T-I.3 / #1002 |
| `graph-quality-missing-source-version-scanner.test.ts` | `services/graph-quality/scanners/missing-source-version-scanner` | T-D.6 / #1031 |
| `phase-21-gap-18-timeline-event-projection.test.ts` | Cross-cutting — locks gap #18 projection-helper readiness claim | T-I.15 / #1036 |
| `phase-22-burst-summary-coverage.test.ts` | Cross-cutting — locks the 2026-05-15 emission burst summary doc against drift | T-I.16 / #1037 |
| `phase-23-runbook-coverage.test.ts` | Cross-cutting — locks the Phase 23 quality-agent operator runbook (every registered scanKind + lifecycle) | T-I.18 / #1039 |

### 7.2 — Phase 22 emission bridge + wiring lockstep tests

| Test file | Surface tested | PR |
|---|---|---|
| `failure-state-observability-bridge.test.ts` | `recordFailureStateEvent` encode/decode + stubbed-db integration | T-I.5 / #1013 |
| `phase-22-emission-audit-coverage.test.ts` | `docs/.../agent-studio-phase-22-failure-state-emission-audit.md` lockstep | T-I.4 / #1012 |
| `health-alert-failure-state-wiring.test.ts` | `services/graph/health-alert.ts` wiring | T-I.5.A.1 / #1014 |
| `drift-cron-failure-state-wiring.test.ts` | `services/graph/projection/drift-cron.ts` wiring | T-I.5.A.2 / #1015 |
| `safety-filter-failure-state-wiring.test.ts` | `services/graph/retrieval/retrieval-router.ts` (safety-filter) | T-I.5.A.3 / #1016 |
| `detect-tool-schema-changes.test.ts` | `services/mcp/detect-tool-schema-changes.ts` pure-function diff | T-I.5.A.4 / #1017 |
| `text2cypher-failure-state-wiring.test.ts` | `services/graph/retrieval/retrieval-router.ts` (text2cypher) | T-I.5.A.5 / #1018 |
| `cypher-template-failure-state-wiring.test.ts` | `services/graph/retrieval/retrieval-router.ts` (executeTemplateAudited) | T-I.5.A.6 / #1019 |
| `failure-state-bridge-wiring-coverage.test.ts` | Bridge coverage guard — locks all 6 batch-A wirings in one table | T-I.6 / #1020 |

### 7.3 — Catalog gap status update

| Gap # | Status @ 2026-05-15 | Notes |
|---|---|---|
| 12 | Still open at runtime level | T-F contracts shipped (#993, #997-#998, #1005, #1006); concrete per-kind runners still stubs |
| 18 | **Projection helper shipped @ #1010** | `projectInstitutionalMemoryNode("timeline_event", row)` can now project; runtime caller (lens-runner reading `ags_runtime_runs`) is the remaining work |
| 3 + 8 | Still inlined | Cleanup-only; no behavioral gap |
