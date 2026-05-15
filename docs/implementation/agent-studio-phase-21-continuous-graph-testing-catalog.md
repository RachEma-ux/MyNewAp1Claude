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
| `roadmap-phase-22-acceptance-coverage.test.ts` | Cross-cutting — locks the roadmap doc's Phase 22 acceptance checklist against actual shipped LIVE emissions | T-I.20 / #1041 |
| `scanner-metadata-coverage.test.ts` | `services/graph-quality/scanner-metadata` — operator introspection metadata symmetry with `QUALITY_SCANNER_REGISTRY` + `FINDING_CLASS_TO_PROPOSAL_KIND` | T-D.7 / #1044 |
| `security-graph-severity-helpers.test.ts` | `services/security-graph/contracts` — severity rank + comparator + sort-desc + most-severe helpers | T-G.12 / #1045 |
| `failure-state-summarize.test.ts` | `services/failure-states/contracts` — `summarizeFailureStateOccurrences` stable-shape aggregator (byKind / byCategory / bySeverity / byRecoverable) | T-I.23 / #1046 |
| `recommendation-summarize.test.ts` | `services/recommendation/contracts` — `summarizeRecommendationResponse` (visible / redacted / fullyHidden + mean/min/max confidence on visible only) | T-G.13 / #1047 |
| `institutional-memory-coverage-summary.test.ts` | `services/institutional-memory/contracts` — `summarizeInstitutionalMemoryCoverage` (mapped/unmapped/coveragePercent for the 13-type taxonomy) | T-G.14 / #1048 |
| `security-graph-finding-summary.test.ts` | `services/security-graph/contracts` — `summarizeSecurityFindings` (bySeverity / byCanonicalPathStep / mostSevereIndex) | T-G.15 / #1049 |
| `code-graph-summarize.test.ts` | `services/code-graph/contracts/code-intelligence-contracts` — `summarizeCodeGraph` (nodesByType / edgesByType / unknown counts) | T-G.16 / #1050 |
| `graph-algorithm-coverage.test.ts` | `services/graph-algorithm/contracts` — `summarizeGraphAlgorithmCoverage` (byBackendSupport / availableOnCe / triggersAuraUpgrade / cePercent) | T-G.17 / #1051 |
| `graph-lens-registry-summary.test.ts` | `services/graph-lens/registry` — `summarizeGraphLensRegistry` (byKind / byLayout / byGovernanceScope) | T-F.9 / #1052 |
| `canonical-failure-state-annotations.test.ts` | `services/failure-states/observability-bridge` — `getCanonicalFailureStateAnnotations` (extracted stamp helper for non-bridge callers) | T-I.24 / #1053 |
| `impact-analysis-result-summary.test.ts` | `services/graph-lens/impact-analysis-contracts` — `summarizeImpactAnalysisResult` (visible/hidden node + edge counts + depth histogram + maxObservedDepth + truncated passthrough) | T-F.10 / #1054 |
| `lens-snapshot-summary.test.ts` | `services/graph-lens/runner-contract` — `summarizeLensSnapshot` (visible/hidden node + edge counts + per-typeKey histograms + truncated passthrough) | T-F.11 / #1055 |
| `failure-state-event-list-summary.test.ts` | `services/failure-states/observability-bridge` — `summarizeFailureStateEventList` (closed-taxonomy vs free-form classification + occurrence summary + distinctSourceKinds + oldestAt/newestAt) | T-I.25 / #1056 |
| `quality-finding-list-summary.test.ts` | `services/graph-quality/scanner-metadata` — `summarizeQualityFindings` (byScanKind / bySeverity / byCategory + unknownScanKindCount drift signal) | T-D.8 / #1057 |
| `extract-failure-state-annotations.test.ts` | `services/failure-states/observability-bridge` — `extractFailureStateAnnotations` (inverse of `getCanonicalFailureStateAnnotations`; round-trip + severity-override validation) | T-I.26 / #1058 |
| `recommendation-candidate-list-summary.test.ts` | `services/recommendation/assemble-response` — `summarizeRecommendationCandidates` (pre-assemble diagnostic over raw candidate list with confidence-floor classification) | T-G.18 / #1059 |
| `security-graph-impact-path-helpers.test.ts` | `services/security-graph/contracts` — `getCanonicalImpactPathToStep` + `getCanonicalImpactSubPath` + `getCanonicalImpactDistance` (3 path-walk helpers complementing the existing from/next/previous suite) | T-G.19 / #1060 |
| `security-graph-validation-summary.test.ts` | `services/security-graph/contracts` — `summarizeImpactPathValidationOutcomes` (ok/failed + 4-key stable-shape failedByReason rollup) | T-G.20 / #1061 |
| `quality-finding-severity-helpers.test.ts` | `services/graph-quality/scanner-metadata` — qualitySeverityRank + compareQualitySeverity + sortQualityFindingsBySeverityDesc + getMostSevereQualityFinding (mirror of T-G.12 for the 4-key quality taxonomy) | T-D.9 / #1062 |
| `failure-state-severity-helpers.test.ts` | `services/failure-states/contracts` — failureStateSeverityRank + compareFailureStateSeverity + sortFailureStateItemsBySeverityDesc + getMostSevereFailureStateItem (mirror of T-G.12/T-D.9 for the 3-key info/warning/critical taxonomy) | T-I.27 / #1063 |
| `failure-state-category-severity-matrix.test.ts` | `services/failure-states/contracts` — `buildFailureStateCategorySeverityMatrix` (2D category × severity heat-map matrix; stable-shape on both axes) | T-I.28 / #1064 |
| `annotate-rows-with-failure-state.test.ts` | `services/failure-states/observability-bridge` — `annotateRowsWithFailureState` (batch wrapper around extractFailureStateAnnotations; preserves row reference; null for free-form) | T-I.29 / #1065 |
| `code-graph-cardinality-summary.test.ts` | `services/code-graph/contracts/code-intelligence-contracts` — `summarizeCodeGraphCardinality` (oneToOne / oneToMany / manyToMany counts over edge-type constraints) | T-G.21 / #1066 |
| `institutional-memory-projection-summary.test.ts` | `services/institutional-memory/project-node` — `summarizeInstitutionalMemoryProjectionResult` (projected/skipped + 4-key stable-shape reason axis + projectedPercent) + new exported `INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS` constant | T-G.22 / #1067 |
| `lens-runner-registry-coverage.test.ts` | `services/graph-lens/runner-contract` — `summarizeLensRunnerRegistry` (registeredKinds / missingKinds list / coveragePercent over the runtime runner registry) | T-F.12 / #1068 |
| `finding-class-for-proposal-kind.test.ts` | `services/graph-quality/finding-to-proposal` — `findingClassForProposalKind` (inverse lookup of FINDING_CLASS_TO_PROPOSAL_KIND; null for review_* fallbacks or unknown kinds) | T-D.10 / #1069 |
| `failure-state-row-collection-helpers.test.ts` | `services/failure-states/observability-bridge` — `partitionRowsByFailureState` + `groupRowsByFailureStateKind` (collection helpers over raw observability rows) | T-I.30 / #1070 |
| `recommendation-kind-metadata.test.ts` | `services/recommendation/contracts` — `RECOMMENDATION_KIND_METADATA` (8-entry per-kind operator label + description; symmetry with RECOMMENDATION_KINDS) | T-G.23 / #1071 |
| `graph-lens-kind-metadata.test.ts` | `services/graph-lens/contracts` — `GRAPH_LENS_KIND_METADATA` (8-entry per-kind operator label + description for the lens-kind taxonomy) | T-F.13 / #1072 |
| `security-graph-node-type-metadata.test.ts` | `services/security-graph/contracts` — `SECURITY_GRAPH_NODE_TYPE_METADATA` (10-entry per-type operator label + description for the cve/finding/component/package/service/environment/owner/customer_exposure/policy/control taxonomy) | T-G.24 / #1073 |
| `code-graph-node-type-metadata.test.ts` | `services/code-graph/contracts/code-intelligence-contracts` — `CODE_GRAPH_NODE_TYPE_METADATA` (12-entry per-type operator label + description for the repository/package/file/class/function/method/api_endpoint/service/db_table/frontend_component/config_file/test_file taxonomy) | T-G.25 / #1074 |
| `institutional-memory-node-type-metadata.test.ts` | `services/institutional-memory/contracts` — `INSTITUTIONAL_MEMORY_NODE_TYPE_METADATA` (13-entry per-type operator label + description for the person/team/project/system/service/decision/policy/workflow/document/outcome/responsibility/timeline_event/governance_record taxonomy) | T-G.26 / #1075 |
| `impact-analysis-kind-metadata.test.ts` | `services/graph-lens/impact-analysis-contracts` — `IMPACT_ANALYSIS_KIND_METADATA` (7-entry per-kind operator label + description for the knowledge/runtime/code/security/governance/tool/workflow impact taxonomy) | T-F.14 / #1076 |
| `failure-state-category-metadata.test.ts` | `services/failure-states/contracts` — `FAILURE_STATE_CATEGORY_METADATA` (5-entry per-category operator label + description for the infrastructure/governance/retrieval/agent/runtime taxonomy) | T-I.31 / #1077 |
| `failure-state-severity-metadata.test.ts` | `services/failure-states/contracts` — `FAILURE_STATE_SEVERITY_METADATA` (3-entry per-severity operator label + description + operatorAction {monitor/investigate/escalate} for info/warning/critical) | T-I.32 / #1078 |
| `recommendation-permission-status-metadata.test.ts` | `services/recommendation/contracts` — `RECOMMENDATION_PERMISSION_STATUS_METADATA` (3-entry per-status label + description + rendered boolean for visible/redacted/hidden) | T-G.27 / #1079 |
| `graph-lens-layout-metadata.test.ts` | `services/graph-lens/contracts` — `GRAPH_LENS_LAYOUT_METADATA` (5-entry per-layout label + description for force_directed/tree/matrix/timeline/dependency_path) | T-F.15 / #1080 |
| `graph-lens-governance-scope-metadata.test.ts` | `services/graph-lens/contracts` — `GRAPH_LENS_GOVERNANCE_SCOPE_METADATA` (4-entry per-scope label + description + restrictiveness {open/members_only/approvers_only/admin_only}) | T-F.16 / #1081 |
| `graph-algorithm-backend-support-metadata.test.ts` | `services/graph-algorithm/contracts` — `GRAPH_ALGORITHM_BACKEND_SUPPORT_METADATA` (4-entry per-level label + description + runsOnCe boolean for neo4j_ce_native/neo4j_ce_via_apoc/gds_required/approximation_required) | T-G.28 / #1082 |
| `quality-scanner-category-metadata.test.ts` | `services/graph-quality/scanner-metadata` — `QUALITY_SCANNER_CATEGORY_METADATA` (5-entry per-category label + description for provenance/structure/freshness/deduplication/topology); promotes the previously union-only `QualityScannerCategory` to a tuple-derived export | T-D.11 / #1083 |
| `security-finding-severity-metadata.test.ts` | `services/security-graph/contracts` — `SECURITY_FINDING_SEVERITY_METADATA` (5-entry per-severity label + description + cvssRange + operatorAction {informational/monitor/schedule_patch/patch_soon/patch_now}) | T-G.29 / #1084 |
| `code-graph-edge-type-metadata.test.ts` | `services/code-graph/contracts/code-intelligence-contracts` — `CODE_GRAPH_EDGE_TYPE_METADATA` (10-entry per-edge-type label + description for imports/calls/declares/implements/depends_on/reads_from_table/writes_to_table/routes_to/renders_component/tests) | T-G.30 / #1085 |
| `graph-algorithm-kind-metadata.test.ts` | `services/graph-algorithm/contracts` — `GRAPH_ALGORITHM_KIND_METADATA` (8-entry per-algorithm label + operatorIntent + closed-taxonomy `category` UI grouping over centrality/community/similarity/path_analysis/impact_analysis) | T-G.31 / #1086 |
| `institutional-memory-skip-reason-metadata.test.ts` | `services/institutional-memory/project-node` — `INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA` (4-entry per-reason label + description + remediation + classification {taxonomy_gap / source_row_defect / source_schema_drift}) | T-G.32 / #1087 |
| `graph-algorithm-preflight-decision-metadata.test.ts` | `services/graph-algorithm/contracts` — `GRAPH_ALGORITHM_PREFLIGHT_DECISION_METADATA` (4-entry per-decision label + description + runnable + showUpgradeBanner booleans); union→tuple promotion of `GraphAlgorithmPreflightDecision` | T-G.33 / #1088 |
| `impact-path-validation-reason-metadata.test.ts` | `services/security-graph/contracts` — `IMPACT_PATH_VALIDATION_REASON_METADATA` (4-entry per-reason label + description + remediation + classification {caller_input_error / structural_violation}) | T-G.34 / #1089 |
| `failure-state-label.test.ts` | `services/failure-states/contracts` — per-state `label` field added to `FAILURE_STATE_METADATA` for all 25 closed-taxonomy states + `getFailureStateLabel` accessor | T-I.33 / #1090 |
| `quality-proposal-kind-metadata.test.ts` | `services/graph-quality/finding-to-proposal` — `QUALITY_PROPOSAL_KIND_METADATA` (10-entry per-proposal label + description + automationClass {one_click_safe / review_required / investigation_only} + mutatesGraph boolean); promotes proposal kinds to a closed taxonomy with `isQualityProposalKind` guard | T-D.12 / #1091 |
| `graphrag-retrieval-method-metadata.test.ts` | `services/rac/planner-mode` — `GRAPHRAG_RETRIEVAL_METHOD_METADATA` (5-entry per-method label + description + costClass {low/medium/high} + invokesLlm boolean for local/global/traversal/text2cypher/algorithm) | T-A.6 / #1092 |
| `rac-planner-mode-metadata.test.ts` | `services/rac/planner-mode` — `RAC_PLANNER_MODE_METADATA` (15-entry per-mode label + description + family + reserved boolean) + `RAC_PLANNER_MODE_FAMILIES` 6-family taxonomy (no_retrieval / cag_only / knowledge_retrieval / hybrid_cag / graphrag_pure / graphrag_hybrid) | T-A.7 / #1093 |
| `rac-source-type-metadata.test.ts` | `services/rac/sources/types` — `RAC_SOURCE_TYPE_METADATA` (7-entry per-source-type label + description + retrievalMechanism {precompiled / vector / graph / external_api / structured} + requiresEmbeddings boolean) + `RAC_SOURCE_RETRIEVAL_MECHANISMS` 5-family taxonomy | T-A.8 / #1094 |
| `rac-retrieval-health-status-metadata.test.ts` | `services/rac/ingestion/types` — `RAC_RETRIEVAL_HEALTH_STATUS_METADATA` (4-entry per-status label + description + attemptRetrieval + notifyOperator booleans); union→tuple promotion of `RacRetrievalHealthStatus` | T-A.9 / #1095 |
| `rac-owner-module-metadata.test.ts` | `services/rac/sources/types` — `RAC_OWNER_MODULE_METADATA` (4-entry per-owner-module label + description + firstParty boolean for agentStudio/dataAnalysis/projectsSystem/external); union→tuple promotion of `RacOwnerModule` | T-A.10 / #1096 |
| `publish-target-type-metadata.test.ts` | `services/publish-targets/types` — `PUBLISH_TARGET_TYPE_METADATA` (3-entry per-target-type label + description + internalDestination + requiresProviderConnection booleans for staging_env/remote_vault/external_kb) | T-E.1 / #1097 |
| `publish-execution-status-metadata.test.ts` | `services/publish-targets/types` — `PUBLISH_EXECUTION_STATUS_METADATA` (4-entry per-status label + description + terminal + successful booleans for pending/in_flight/succeeded/failed) | T-E.2 / #1098 |
| `publish-governance-decision-metadata.test.ts` | `services/publish-targets/types` — `GOVERNANCE_DECISION_METADATA` (3-entry per-decision label + description + executorBranch {runs_pusher / stages_ledger_only / blocks_pusher} + requiresHumanApproval boolean for approved/pending/rejected) | T-E.3 / #1099 |
| `agentic-planner-action-kind-metadata.test.ts` | `services/graph-agent/agentic-planner-contract` — `AGENTIC_PLANNER_ACTION_KIND_METADATA` (3-entry per-action-kind label + description + terminatesLoop + producesAnswer booleans for retrieve/answer/stop) | T-G.35 / #1100 |
| `saved-view-visibility-metadata.test.ts` | `services/vault/saved-views-visibility` — `SAVED_VIEW_VISIBILITY_METADATA` (2-entry per-visibility label + description + visibleToOthers boolean for personal/workspace_shared) | T-V.1 / #1101 |
| `realtime-doc-deny-reason-metadata.test.ts` | `services/vault/realtime-doc-authorize` — `REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA` (3-entry per-reason label + description + remediation + classification {auth_required / policy_denial / transient_failure} for missing_user_id/not_a_vault_member/vault_membership_lookup_failed) | T-B.1 / #1102 |
| `export-eligibility-gate-metadata.test.ts` | `services/export-eligibility` — `EXPORT_ELIGIBILITY_GATE_METADATA` (10-entry per-gate label + description + concern {governance / metadata_completeness / provider_binding / idempotency / runtime_readiness} + operatorFixable boolean) | T-E.4 / #1103 |
| `canvas-node-kind-metadata.test.ts` | `services/canvas/types` — `CANVAS_NODE_KIND_METADATA` (4-entry per-node-kind label + description + isReference + evaluatesAtRender booleans for note_ref/embedded_query/free_text/image_ref) | T-C.1 / #1104 |
| `attachment-mime-class-metadata.test.ts` | `services/vault/attachment-library` — `ATTACHMENT_MIME_CLASS_METADATA` (6-entry per-class label + description + previewable + displayBucket {media / documents / other} for image/video/audio/document/archive/other) | T-V.2 / #1105 |
| `publish-request-state-metadata.test.ts` | `services/retention/lifecycle-state-vocab` — `PUBLISH_REQUEST_STATE_METADATA` (7-entry per-state label + description + outcome {awaiting / accepted / declined / withdrawn / obsolete / terminal_failure} + terminal boolean; mirrors `PUBLISH_REQUEST_TERMINAL_STATES`) | T-L.1 / #1106 |
| `approval-step-state-metadata.test.ts` | `services/retention/lifecycle-state-vocab` — `APPROVAL_STEP_STATE_METADATA` (7-entry per-state label + description + outcome {awaiting / accepted / declined / skipped / expired / cancelled / obsolete} + terminal boolean; mirrors `APPROVAL_STEP_TERMINAL_STATES`) | T-L.2 / #1107 |
| `note-promotion-state-metadata.test.ts` | `services/retention/lifecycle-state-vocab` — `NOTE_PROMOTION_STATE_METADATA` (8-entry per-state label + description + outcome {in_progress / accepted / declined / reverted / cancelled / obsolete} + terminal boolean; mirrors `NOTE_PROMOTION_TERMINAL_STATES`) | T-L.3 / #1108 |
| `extension-governance-status-metadata.test.ts` | `services/extensions/contracts` — `EXTENSION_GOVERNANCE_STATUS_METADATA` (5-entry per-status label + description + invocable + lifecycle {awaiting_decision / active / dormant / revoked} for pending_approval/approved/rejected/disabled/revoked) | T-X.1 / #1109 |
| `extension-capability-lane-metadata.test.ts` | `services/extensions/contracts` — `EXTENSION_CAPABILITY_LANE_METADATA` (4-entry per-lane label + description + invokesTools + pipelineOrder 1..4 for retrieve/assemble/compose/tool) | T-X.2 / #1110 |
| `extension-capability-check-metadata.test.ts` | `services/extensions/contracts` — `EXTENSION_CAPABILITY_CHECK_METADATA` (4-entry per-check label + description + proceeds + denialReason {null / manifest_mismatch / governance_revoked / operator_disabled}) | T-X.3 / #1111 |
| `graph-health-alert-key-metadata.test.ts` | `services/graph/health-alert` — `GRAPH_HEALTH_ALERT_KEY_METADATA` (3-entry per-key label + description + defaultSeverity + recoverable boolean for graph_health_latency_high/graph_health_degraded/graph_health_unavailable) | T-H.1 / #1112 |
| `realtime-doc-frame-type-metadata.test.ts` | `services/vault/realtime-doc-framing` — `REALTIME_DOC_FRAME_TYPE_METADATA` (3-entry per-frame-type label + description + recognized + wireCodepoint for sync/awareness/unknown) | T-B.2 / #1113 |
| `canvas-projection-event-row-kind-metadata.test.ts` | `services/canvas/projection-events-drain-row-projector` — `CANVAS_PROJECTION_EVENT_ROW_KIND_METADATA` (2-entry per-kind label + description + referencesCurrentNote + isLinkAdd booleans for note_reference_changed/note_reference_removed) | T-C.2 / #1114 |
| `runtime-config-block-metadata.test.ts` | `services/runtime/config-schema-version` — `RUNTIME_CONFIG_BLOCK_METADATA` (9-entry per-block label + description + domain {agent_behavior / knowledge_access / tool_orchestration / governance / scheduling_and_status}) | T-R.1 / #1115 |
| `browse-sort-key-metadata.test.ts` | `services/vault/attachment-library` — `BROWSE_SORT_KEY_METADATA` (2-entry per-sort-key label + description + sortColumn {createdAt / byteSize} + ascending boolean for created_at_desc/size_desc) | T-V.3 / #1116 |
| `security-impact-path-step-metadata.test.ts` | `services/security-graph/contracts` — `SECURITY_GRAPH_CANONICAL_IMPACT_PATH_STEP_METADATA` (7-entry per-step stepIndex + label + narrative + isOrigin + isTerminal booleans for cve/package/component/service/environment/owner/customer_exposure) | T-G.36 / #1117 |
| `ags-lifecycle-state-metadata.test.ts` | `shared/constants` — `AGS_LIFECYCLE_STATE_METADATA` (11-entry per-state label + description + phase {in_development / under_validation / blocked / release_candidate / active / retired} + runnable boolean) | T-S.1 / #1118 |
| `ags-agent-class-metadata.test.ts` | `shared/constants` — `AGS_AGENT_CLASS_METADATA` (6-entry per-class label + description + invokesOtherAgents + recommendedAutonomyFloor for assistant/specialist/orchestrator/automation/researcher/auditor) | T-S.2 / #1119 |
| `ags-autonomy-level-metadata.test.ts` | `shared/constants` — `AGS_AUTONOMY_LEVEL_METADATA` (4-entry per-level label + description + rank 0-3 + requiresHumanApproval + runsContinuously booleans for manual/supervised/semi_autonomous/autonomous) | T-S.3 / #1120 |
| `ags-environment-metadata.test.ts` | `shared/constants` — `AGS_ENVIRONMENT_METADATA` (4-entry per-env label + description + rank 0-3 + customerFacing + persistent booleans for draft/sandbox/staging/production) | T-S.4 / #1121 |
| `ags-governance-verdict-metadata.test.ts` | `shared/constants` — `AGS_GOVERNANCE_VERDICT_METADATA` (3-entry per-verdict label + description + allowsPromotion + requiresOperatorAttention booleans for pass/warning/blocked) | T-S.5 / #1122 |
| `ags-memory-type-metadata.test.ts` | `shared/constants` — `AGS_MEMORY_TYPE_METADATA` (5-entry per-type label + description + persistsAcrossSessions + scope {single_agent / cross_agent} for session/persistent/episodic/preference/shared) | T-S.6 / #1123 |
| `ags-visibility-metadata.test.ts` | `shared/constants` — `AGS_VISIBILITY_METADATA` (4-entry per-visibility label + description + rank 0-3 + external boolean for private/team/org/public) | T-S.7 / #1124 |
| `ags-run-status-metadata.test.ts` | `shared/constants` — `AGS_RUN_STATUS_METADATA` (5-entry per-status label + description + terminal + successful booleans for queued/running/completed/failed/cancelled) | T-S.8 / #1125 |
| `ags-test-verdict-metadata.test.ts` | `shared/constants` — `AGS_TEST_VERDICT_METADATA` (4-entry per-verdict label + description + countedAsPass + executed booleans for pass/fail/skipped/error) | T-S.9 / #1126 |
| `ags-mcp-status-metadata.test.ts` | `shared/constants` — `AGS_MCP_STATUS_METADATA` (4-entry per-status label + description + dispatchable + errorState booleans for pending/connected/disconnected/error) | T-S.10 / #1127 |
| `ags-permission-mode-metadata.test.ts` | `shared/constants` — `AGS_PERMISSION_MODE_METADATA` (5-entry per-mode label + description + allowsToolExecution + promptsOnDangerous + requiresBypassFlag booleans for default/acceptEdits/bypassPermissions/plan/dontAsk) | T-S.11 / #1128 |

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
