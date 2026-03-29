# Workstream 6 — Delivery Roadmap and Decision Package for PS Wizard

**Author:** Principal Delivery Strategist
**Date:** 2026-03-29
**Status:** FINAL — Ready for executive decision
**Classification:** Internal decision document — standalone reading

---

## 1. Executive Summary

This document is the integrated decision package for the PS Wizard evolution. It consolidates validated findings from five analytical workstreams into a single, self-contained decision instrument that can be read without reference to the underlying source documents.

### System under review

The PS Wizard is a 13-step classification and governance intake flow. It receives a scenario (optionally pre-packaged from PS Ideation via ConceptPackage), classifies it against a DB-driven scoring matrix, recommends a PS scope, and creates a governed project record with lifecycle management.

### Key findings

1. **The current 13-step wizard is structurally sound** but contains unnecessary interstitial screens and lacks a confidence gate — the single most important missing control.

2. **The proposed 10-step redesign is directionally correct** but overloads three concerns that must be separated: UX consolidation (adopt now), scoring engine changes (defer to dedicated workstream), and infrastructure expansion (defer to later phases).

3. **The scoring engine (binary Yes/No matrix) works** and is fully DB-driven with zero hard-coded logic. Upgrading to Likert 1–5 scoring is desirable but must not be attempted until backward-compatibility analysis is complete.

4. **The Ideation→Wizard boundary is clean.** The ConceptPackage handoff is well-implemented. No boundary violations exist in the current system. One proposed template wording was rejected to prevent future boundary violation.

5. **The lifecycle state machine is minimal but correct.** Multi-reviewer validation and feedback-to-retraining loops are future enhancements, not immediate needs.

### Bottom line

Reduce from 13 to 10 steps. Add a confidence gate. Improve naming via LLM. Merge post-lifecycle screens. Defer scoring formula changes. Reject ideation-duplicating template wording. Ship in four phases.

**Decision counts:** Adopt: 7 | Adopt with change: 4 | Defer: 11 | Reject: 1

---

## 2. Source Role Map

Every conclusion in this package traces to a verified source. No source has been used beyond its validated scope.

| # | Source | Role in Decision Package | Type | Notes |
|---|--------|--------------------------|------|-------|
| S-1 | `PSWizardPage.tsx` (lines 1–896) | Implementation truth for current 13-step wizard: step labels, navigation, handlers, rendering | Code | Primary evidence for current-state baseline |
| S-2 | `ps.matrix-engine.ts` | Scoring engine truth — DB-backed, zero hard-coded logic, binary weight accumulation | Code | Primary source for scoring architecture |
| S-3 | `ps.classifier.ts` | Rule-based dimension classifier — 18 deterministic rules, 5 system types | Code | Secondary classifier (not matrix-based) |
| S-4 | `ps.confidence.ts` | Confidence engine — 3-pillar model (completeness 30%, spread 30%, 1-ambiguity 40%) | Code | Primary source for confidence analysis |
| S-5 | `ps.explainability.ts` | Explainability engine — positive/negative signal computation from matrix cell weights | Code | Primary source for explainability architecture |
| S-6 | `ps.lifecycle.ts` | PS project lifecycle state machine — DRAFT→SUBMITTED→VALIDATED→PUBLISHED/SENT_TO_PM/REJECTED | Code | Primary source for lifecycle analysis |
| S-7 | `ps.override.ts` | Override tracking — structured records, rate metrics, recommended→overridden pattern analysis | Code | Primary source for override architecture |
| S-8 | `ps.feedback.ts` | Feedback capture — 4-state outcome (success/partial/failed/cancelled), drift flag, notes | Code | Primary source for feedback analysis |
| S-9 | `ps.validation.ts` | All Zod input schemas across the PS module | Code | Schema authority |
| S-10 | `WS2_Step_Architecture_Mapping.md` | Workstream 2 output: step inventories, transition matrix, boundary assignments, disposition register | Analysis | Central analytical document — validated, self-acceptance-checked, COMPLETE |
| S-11 | `PS-Ideation-Workflow-Diagram.md` | 11-step ideation workflow, lifecycle statuses, data flow, handoff to wizard | Design doc | Boundary definition for Ideation↔Wizard |
| S-12 | `ideation-readiness.ts` + `ideation-conversion.ts` | Readiness engine (5 blockers + 3 warnings) and ConceptPackage creation | Code | Handoff contract implementation |
| S-13 | `OM-HR-PS-Integration-Roadmap.md` | Enterprise operating model: OM/HR/PS ownership, bridge layer, 12-phase roadmap | Design doc | Governance context for PS Wizard role in enterprise model |
| S-14 | `OM-HR-PS-Current-Inventory-and-Implementation-Scope.md` | Current inventory of OM/HR/PS modules, ownership corrections, missing bridge layer | Inventory | Dependency context |
| S-15 | `ps_wizard_design_suggestion.md` (referenced by S-10) | Proposed 10-step redesign with Likert scoring, multi-evaluator, KPI targets, retraining loop | Design doc | Original proposal — consumed via WS2 analysis |
| S-16 | `WS Wizard — Governance-First Design.md` | Workspace Wizard governance-first design pattern (3-phase: Manager/Admin/Governance) | Design doc | Pattern reference for governance UX |
| S-17 | `ps.repository.ts` | DB access layer for matrix versions, scopes, questions, cells, dimensions, dimension values | Code | Data access authority |

---

## 3. Validated Current-State Baseline

### 3.1 Wizard Structure

The PS Wizard is a 13-step linear wizard implemented in `PSWizardPage.tsx`. Steps are grouped into four phases:

| Phase | Steps | Purpose |
|-------|-------|---------|
| Intake | 1–4 | Scenario capture, context, NLP display, auto-naming |
| AI Scoring | 5–7 | Matrix questionnaire, scoring, explainability |
| Decision | 8–9 | Recommendation with override, accept with audit trail |
| Lifecycle | 10–13 | Project creation, validation, PM handoff, feedback |

**Step-by-step inventory (verified against code):**

| # | Step | Purpose | Implementation Status |
|---|------|---------|----------------------|
| 1 | Scenario | Free-text textarea (≤5000 chars) | Implemented. Validation: `scenario.trim().length > 0`. No guided template. |
| 2 | Context | BU, Region, Strategic Importance, Existing Situation | Implemented. `canGoNext` always true — no required fields. |
| 3 | NLP Analysis | Displays DB-driven classification dimensions from active matrix | Implemented. Informational only — no user action required. |
| 4 | Auto Name | Derives project name from first sentence via `deriveProjectName` | Implemented. Naive heuristic: split on `.!?\n`, take first segment, truncate at 80 chars. |
| 5 | Questions | Binary Yes/No toggle buttons per matrix question | Implemented. "Classify" button triggers `handleRunClassification()`. |
| 6 | Scoring | Top 3 ranked scopes with scores, bar charts, confidence label | Implemented. Data from `classifyScenario` mutation result. |
| 7 | Explainability | Positive/negative contributor lists from classification result | Implemented. Text lists, no numeric attribution. |
| 8 | Recommendation | Recommended scope (label + code + matrix version); optional override textarea | Implemented. Override reason stored in local state. |
| 9 | Accept | Full summary review: name, scenario, BU/region, scope, confidence, decision trace | Implemented. Machine-readable audit string. No e-signature. |
| 10 | Create PS Project | Calls `trpc.ps.projects.create`; stores wizard run trace; DRAFT status | Implemented. Template bundle resolved server-side via `resolveTemplateBundle()`. |
| 11 | Validation | "Submit for Validation" — transitions DRAFT → SUBMITTED | Implemented. Single-reviewer model. |
| 12 | PM Central | "Send to PM Central" — transitions to SENT_TO_PM | Implemented. Blocked if still DRAFT. |
| 13 | Feedback | Outcome (success/partial/failed/cancelled) + optional notes | Implemented. "Skip & Go to List" option. Outcomes not used for retraining. |

### 3.2 Scoring Engine

The scoring engine (`ps.matrix-engine.ts`) is fully DB-driven with zero hard-coded logic:

- **Data source:** Active matrix version loaded from DB (scopes, questions, cells, dimensions, dimension values)
- **Input format:** Binary Yes/No answers keyed by question code
- **Scoring formula:** For each truthy answer, accumulate the cell weight into the corresponding scope: `score[scope] += cell.weight`
- **Ranking:** Scopes sorted by score descending; deterministic alphabetical tie-breaking
- **Truthiness:** `boolean true`, non-empty/non-"false" string, or `number > 0`
- **Output:** Selected scope (rank 1), full ranking, top 3, matched questions, matrix version

**Confidence engine** (`ps.confidence.ts`) — three-pillar composite:

| Pillar | Weight | Metric | Range |
|--------|--------|--------|-------|
| Completeness | 30% | Fraction of questions answered (truthy) | 0–1 |
| Spread | 30% | Normalised standard deviation of scope scores | 0–1 |
| 1 – Ambiguity | 40% | Inverse of normalised margin between #1 and #2 | 0–1 |

**Explainability engine** (`ps.explainability.ts`):

- **Positive signals:** Questions where the winner scope gained weight
- **Negative signals:** Questions where the runner-up gained more weight than the winner
- **Winner margin:** Score difference between rank #1 and rank #2
- **Output format:** Text lists of question labels, sorted by weight descending

### 3.3 Lifecycle State Machine

```
DRAFT → SUBMITTED → VALIDATED → PUBLISHED
                               → SENT_TO_PM
                  → REJECTED
```

All transitions audited via `logPsAudit()`. Single-reviewer model. No SLA tracking. Terminal states: REJECTED, PUBLISHED, SENT_TO_PM.

### 3.4 Override Tracking

The override module (`ps.override.ts`) captures structured records including:
- Recommended vs. overridden scope codes
- Reason text, confidence snapshot, matrix version, answers snapshot
- Rate metrics (total and last-30-day override rates)
- Pattern analysis (recommended→overridden frequency pairs)

Override data is stored but **not used for matrix calibration**.

### 3.5 Feedback Capture

The feedback module (`ps.feedback.ts`) captures:
- 4-state outcome: success, partial, failed, cancelled
- Drift flag (boolean), free-text notes
- Optional PM project linkage

Feedback data is stored but **not used for matrix retraining or KPI tracking**.

### 3.6 Upstream Boundary (PS Ideation)

PS Ideation is a complete 11-step workflow running before the PS Wizard:

```
Phase 1 (Intake):      Context → Problem → Opportunity → Guiding Question
Phase 2 (Exploration):  Idea Generation → Clustering
Phase 3 (Evaluation):   Screening → Scenario Exploration → Feasibility
Phase 4 (Decision):     Concept Selection → One-Page Summary
Handoff:                Readiness Check → ConceptPackage → PS Wizard
```

Lifecycle: `concept_selected → ready_for_wizard → converted`

The readiness engine (`ideation-readiness.ts`) evaluates 5 blockers and 3 warnings before declaring a concept ready. The ConceptPackage is the formal boundary contract consumed by the wizard.

### 3.7 Known Gaps in Current State

| # | Gap | Severity | Impact |
|---|-----|----------|--------|
| G-1 | No confidence gate — 1-point margin treated identically to 30-point margin | **High** | Low-confidence decisions auto-create projects |
| G-2 | Naive project naming heuristic fails on context-first scenarios | Medium | Poor project titles |
| G-3 | Steps 1+2 are separate screens with no required context fields | Medium | Extra friction, reduced classification quality |
| G-4 | Steps 3+4 are separate screens; Step 3 has no user action | Low | Unnecessary interstitial |
| G-5 | Steps 12+13 are separate for post-lifecycle actions typically done together | Low | Unnecessary separation |
| G-6 | Feedback outcomes stored but not used for matrix calibration | Medium | No system-level learning |
| G-7 | Override reason captured as free text, not structured metadata | Medium | Limits calibration analysis |
| G-8 | No KPI baseline targets at commit time | Low | No outcome measurement foundation |
| G-9 | Explainability uses text lists, not numeric attribution | Low | Less precise contributor understanding |

---

## 4. Approved Target-State Direction

### 4.1 Design Principles

1. **PS Wizard classifies and governs. It does not ideate.** Problem discovery, opportunity identification, and concept selection belong upstream in PS Ideation.

2. **The ConceptPackage is the boundary contract.** Any capability belonging to idea discovery, evaluation, or concept selection stays upstream.

3. **Fewer steps with better controls.** Merge unnecessary interstitials. Add a confidence gate. Do not add steps that expand wizard responsibility beyond classification and governance.

4. **Scoring changes are a separate concern.** Binary-to-Likert migration, per-question weights, and SHAP-style explainability form a coupled package requiring independent analysis. They do not block UX improvements.

5. **Infrastructure investments follow proven value.** Multi-evaluator scoring, multi-reviewer validation, and matrix retraining are high-effort capabilities that follow baseline improvements.

### 4.2 Target Step Architecture (10 Steps)

| # | Target Step | Maps From | Change Type |
|---|-------------|-----------|-------------|
| 1 | Scenario + Context | Old 1 + 2 | **Merge.** Single form, collapsible sections. ≥1 context field required. |
| 2 | NLP + Smart Name | Old 3 + 4 | **Merge.** Single review screen. LLM-generated title replaces heuristic. |
| 3 | Questionnaire | Old 5 | **Retain.** Binary scoring initially. Likert upgrade deferred. |
| 4 | Scoring | Old 6 | **Retain.** Current matrix engine. Enhanced visualisation deferred. |
| 5 | Explainability | Old 7 | **Retain.** Current positive/negative format. SHAP bars deferred. |
| 6 | Recommendation + Confidence Gate | Old 8 | **Upgrade.** Configurable confidence thresholds. Low margin blocks auto-creation. |
| 7 | Accept + Confirm | Old 9 | **Upgrade.** Optional KPI baseline target fields (Phase B). |
| 8 | Create Project | Old 10 | **Retain.** Same creation with minor payload additions. |
| 9 | Validation | Old 11 | **Retain.** Single-reviewer initially. Multi-reviewer deferred. |
| 10 | PM Handoff + Feedback | Old 12 + 13 | **Merge.** Single screen for handoff and outcome capture. |

**Net result:** 13 steps → 10 steps. Three merges, one structural addition (confidence gate), zero scope expansions.

### 4.3 Scoring Engine Direction

The scoring engine remains binary (0/1) through Phases A and B. The Likert 1–5 upgrade is deferred to Phase C with mandatory prerequisites:
- Backward-compatibility analysis for existing binary-scored projects
- Migration path for matrix versions
- Scoring formula validation with test data
- Rollback strategy

### 4.4 Boundary Direction

No changes to the PS Ideation → PS Wizard boundary. The ConceptPackage contract is preserved. The wizard does not absorb ideation responsibilities.

---

## 5. Final Step Architecture Recommendation

### 5.1 Decision

**Adopt the 10-step architecture** as specified in Section 4.2. Implementation proceeds in phases per Section 8.

### 5.2 Rationale

The 10-step architecture:
- Removes three unnecessary screen transitions
- Adds the highest-value structural control (confidence gate)
- Does not expand wizard responsibility beyond classification and governance
- Does not depend on scoring engine changes
- Preserves all existing server-side modules without scoring logic modification

### 5.3 Step Disposition Register

| # | Capability | Disposition | Priority | Rationale |
|---|-----------|-------------|----------|-----------|
| D-1 | Steps 1+2 merge | **Adopt** | P2 | Pure UX consolidation. Removes unnecessary transition. Makes one context field required. |
| D-2 | Steps 3+4 merge | **Adopt** | P2 | Eliminates information-only step and trivial interstitial. |
| D-3 | Guided scenario template | **Adopt with change** | P3 | Must NOT duplicate Ideation Steps 1–3. Focus on "Describe the project situation." |
| D-4 | Auto-tagging suggestion | **Defer** | P4 | Nice-to-have. High effort relative to value. |
| D-5 | Scenario completeness indicator | **Adopt** | P3 | Simple heuristic. Low effort, low risk. |
| D-6 | LLM-generated project title | **Adopt** | P2 | Clear improvement over first-sentence heuristic. Existing LLM infrastructure available. |
| D-7 | NLP confidence per dimension | **Defer** | P4 | Architecturally mismatched with DB-driven categorical dimensions. |
| D-8 | Editable dimension values | **Adopt** | P3 | Simple UI change. Allows human correction. |
| D-9 | Binary → Likert 1–5 | **Defer** | P1 | Most impactful scoring change. Requires deep analysis. |
| D-10 | Adaptive branching | **Defer** | P2 | Depends on Likert adoption. |
| D-11 | Multi-evaluator scoring | **Defer** | P3 | Significant infrastructure. Should follow Likert. |
| D-12 | Likert-normalised scoring formula | **Defer** | P1 | Core formula change. Coupled with D-9. |
| D-13 | Impact-Effort quadrant | **Defer** | P4 | Visualisation enhancement. No structural impact. |
| D-14 | SHAP-style numeric explainability | **Defer** | P2 | Depends on scoring formula. Must follow D-12. |
| D-15 | Confidence gate | **Adopt** | P1 | Highest-value structural addition. Works with current binary scoring. |
| D-16 | Override structured metadata | **Adopt with change** | P2 | Structured records enable future calibration analysis. |
| D-17 | KPI baseline targets | **Adopt** | P3 | Simple form fields. Enables outcome measurement. |
| D-18 | Multi-reviewer validation + SLA | **Defer** | P3 | Significant infrastructure. Not critical path. |
| D-19 | KPI actuals at feedback | **Adopt** | P3 | Simple form extension. Requires D-17 first. |
| D-20 | Matrix retraining from outcomes | **Defer** | P2 | Requires separate calibration module. Must NOT be embedded in wizard. |
| D-21 | Steps 12+13 merge | **Adopt** | P3 | UX consolidation of post-lifecycle screens. |
| D-22 | Scenario template duplicating Ideation | **Reject** | P1 | Duplicates Ideation Steps 1–3. Boundary violation. |

### 5.4 Boundary Constraints

The guided scenario template (D-3) is approved with the following mandatory constraint:

- **Allowed prompts:** "Describe the project situation," "What is the expected outcome," "Who are the key stakeholders"
- **Prohibited prompts:** "What is the problem?", "Who is affected?", "What could be improved?" — these belong to Ideation Steps 1–3

---

## 6. Final Scoring Architecture Recommendation

### 6.1 Immediate State (Phases A–B): Retain Current Engine

**No scoring engine changes.** The current binary matrix engine, confidence engine, and explainability engine remain unchanged.

The confidence gate (D-15) operates on top of existing scoring output — it reads the `winnerMargin` from `ExplainabilityReport` and applies configurable thresholds:

| Confidence Band | Winner Margin | Wizard Behaviour |
|----------------|---------------|-----------------|
| High | ≥ 15 points | Auto-proceed to Accept step |
| Medium | 8–14 points | Proceed with mandatory reviewer note at Accept |
| Low | < 8 points | Block auto-creation. Require manual review or second evaluation |

Thresholds must be configurable (stored in matrix version metadata or system config table), not hard-coded.

### 6.2 Future State (Phase C): Likert Scoring Engine

The following changes form a coupled package for Phase C:

| Change | Current State | Target State | Migration Concern |
|--------|-------------|-------------|-------------------|
| Answer format | Binary Yes/No | Likert 1–5 | Old projects with binary answers must remain queryable |
| Scoring formula | `Σ (answer × cell_weight)` where answer ∈ {0,1} | `Σ ((answer/5) × weight × scope_affinity × dim_weight) × 100` | Formula must be versioned per matrix |
| Per-question weights | Equal weight (cell weight only) | Configurable per-question importance multiplier | Matrix admin UI needed |
| Explainability | Text contributor lists | SHAP-style numeric bars with point attribution | Depends on new formula |

**Non-negotiable constraints for Phase C:**

1. Existing projects scored on binary matrix are not retroactively re-scored
2. New and old matrix versions must coexist
3. The scoring formula identifier must be stored as part of the matrix version record
4. A rollback path must exist (revert to binary by activating an old matrix version)

### 6.3 Post-Phase-C State (Phase D): Advanced Scoring Capabilities

| Capability | Dependency | Architecture Constraint |
|-----------|-----------|----------------------|
| Multi-evaluator scoring | Likert (D-9) | Implement after Likert to avoid double-building |
| Matrix calibration from outcomes | Likert + KPI actuals | Must be a background queue, not a synchronous wizard action |
| Adaptive branching | Likert (D-9) | Follow-up questions triggered by high Likert scores |

---

## 7. Final Recommendation Matrix

| # | Item | Final Decision | Why | Dependency | Phase |
|---|------|---------------|-----|------------|-------|
| 1 | Steps 1+2 merge (Scenario + Context) | **Adopt** | Reduces friction, makes context required | None | A |
| 2 | Steps 3+4 merge (NLP + Smart Name) | **Adopt** | Eliminates dead screen, consolidates | None | A |
| 3 | LLM project naming | **Adopt** | Replaces naive heuristic, uses existing infra | None | A |
| 4 | Confidence gate | **Adopt** | Highest-value addition, works with current scoring | None | A |
| 5 | Steps 12+13 merge (PM + Feedback) | **Adopt** | UX consolidation of post-lifecycle | None | A |
| 6 | Scenario completeness indicator | **Adopt** | Low effort, nudges richer input | None | A |
| 7 | Editable dimension values | **Adopt** | Simple UI fix, human correction | None | A |
| 8 | Guided scenario template (reworded) | **Adopt with change** | Must not duplicate Ideation Steps 1–3 | Boundary constraint | B |
| 9 | Override structured metadata | **Adopt with change** | Structured records for future calibration | None | B |
| 10 | KPI baseline targets at Accept | **Adopt with change** | Simple form fields, enables outcome tracking | None | B |
| 11 | KPI actuals at Feedback | **Adopt with change** | Simple form extension | Item 10 | B |
| 12 | Binary → Likert 1–5 | **Defer** | Coupled scoring engine change, needs deep analysis | Phase C workstream | C |
| 13 | Per-question weights | **Defer** | Depends on Likert adoption | Item 12 | C |
| 14 | Likert-normalised scoring formula | **Defer** | Core formula change | Items 12, 13 | C |
| 15 | SHAP-style explainability | **Defer** | Depends on new scoring formula | Item 14 | C |
| 16 | Multi-evaluator scoring | **Defer** | High infrastructure cost, depends on Likert | Item 12 | D |
| 17 | Multi-reviewer SLA validation | **Defer** | High infrastructure cost, not critical path | None | D |
| 18 | Matrix weight retraining | **Defer** | Requires separate calibration module | Items 11, 12 | D |
| 19 | Adaptive branching | **Defer** | Depends on Likert scoring | Item 12 | D |
| 20 | Auto-tagging suggestion | **Defer** | High effort, low value | None | Backlog |
| 21 | NLP confidence per dimension | **Defer** | Architecturally mismatched | NLP changes | Backlog |
| 22 | Impact-Effort quadrant view | **Defer** | Nice-to-have visualization | None | Backlog |
| 23 | Scenario template — Ideation wording | **Reject** | Duplicates Ideation Steps 1–3, violates boundary | N/A | N/A |

---

## 8. Phased Implementation Roadmap

### Phase A — Structural Cleanup + Confidence Gate (Quick Wins)

| Attribute | Value |
|-----------|-------|
| **Goal** | Reduce wizard from 13 to 10 steps. Add confidence gate. Improve naming. |
| **Risk** | Low — all changes work with current binary scoring engine |
| **Scope** | 1 page refactor (PSWizardPage.tsx) + confidence threshold config |

**Deliverables:**

| # | Deliverable | Type | Effort | Recommendation Item |
|---|-------------|------|--------|-------------------|
| A-1 | Merge Steps 1+2 into single Scenario+Context form with collapsible sections. Make ≥1 context field required. | Frontend | Medium | R-1 |
| A-2 | Merge Steps 3+4 into single NLP+SmartName review screen. Replace `deriveProjectName` with LLM call via existing provider infrastructure (`resolveAgentLlm()`). | Frontend + Backend | Medium | R-2, R-3 |
| A-3 | Merge Steps 12+13 into single PM Handoff+Feedback screen. | Frontend | Low | R-5 |
| A-4 | Implement configurable confidence gate at Recommendation step. Block creation for low margin (< 8 pts). Require reviewer note for medium margin (8–14 pts). | Frontend + Backend | Medium | R-4 |
| A-5 | Add scenario completeness indicator (word count, field coverage heuristic). | Frontend | Low | R-6 |
| A-6 | Make dimension values editable in NLP step. | Frontend | Low | R-7 |
| A-7 | Update step numbering, STEP_LABELS, canGoNext, navigation logic for 10-step flow. | Frontend | Medium | All merges |

**Dependencies:** None.

### Phase B — Data Enrichment (Richer Metadata, Same Flow)

| Attribute | Value |
|-----------|-------|
| **Goal** | Enrich data capture without changing step count or scoring logic |
| **Risk** | Low — additive data capture only |
| **Scope** | Form field additions + server payload extensions |

**Deliverables:**

| # | Deliverable | Type | Effort | Recommendation Item |
|---|-------------|------|--------|-------------------|
| B-1 | Add guided scenario template with governance-approved wording (no Ideation overlap). | Frontend | Low | R-8 |
| B-2 | Upgrade override capture to full structured record: recommended scope code, overridden scope code, confidence, matrix version, answers snapshot. | Backend + Frontend | Low | R-9 |
| B-3 | Add optional KPI baseline target fields to Accept step: cost savings, time reduction, revenue impact, delivery timeline, primary success metric. | Frontend + Backend | Medium | R-10 |
| B-4 | Add KPI actuals capture to merged Feedback step with delta computation against baselines. | Frontend + Backend | Medium | R-11 |

**Dependencies:** Phase A complete. B-4 requires B-3 (baselines must exist before actuals).

### Phase C — Scoring Engine Evolution

| Attribute | Value |
|-----------|-------|
| **Goal** | Upgrade scoring from binary to Likert-normalised with enhanced explainability |
| **Risk** | Medium-High — core scoring formula change affects all future wizard runs |
| **Scope** | Matrix schema + scoring formula + migration tooling + admin UI |

**Deliverables:**

| # | Deliverable | Type | Effort | Recommendation Item |
|---|-------------|------|--------|-------------------|
| C-1 | Extend matrix schema to support Likert 1–5 answers. Update answer storage in wizard run records. | Backend | High | R-12 |
| C-2 | Add per-question weight column to matrix cells. Build admin UI for weight assignment. | Backend + Admin | High | R-13 |
| C-3 | Implement new scoring formula: `(answer/5) × weight × scope_affinity × dim_weight × 100`. Version the formula per matrix version. | Backend | High | R-14 |
| C-4 | Backward compatibility layer: old binary matrix versions retain old formula. Score display clearly labels formula version. | Backend | High | — |
| C-5 | SHAP-style numeric explainability: per-question contribution bars with point attribution. | Frontend + Backend | Medium | R-15 |
| C-6 | Update confidence engine calibration for Likert score distributions. | Backend | Medium | — |
| C-7 | Migration tooling: create new Likert matrix version from existing binary version. | Backend + Admin | Medium | — |

**Dependencies:** Phases A + B complete. Architecture review complete. Evaluation suite expanded with Likert test cases.
**Prerequisites:** Backward-compatibility analysis documented. Test data prepared.

### Phase D — Advanced Governance + Infrastructure

| Attribute | Value |
|-----------|-------|
| **Goal** | Add enterprise-grade governance capabilities |
| **Risk** | Medium — substantial new infrastructure |
| **Scope** | Multiple new modules per deliverable |

**Deliverables:**

| # | Deliverable | Type | Effort | Recommendation Item |
|---|-------------|------|--------|-------------------|
| D-1 | Multi-evaluator scoring: invitation system, parallel scoring sessions, score aggregation, variance display. | Full stack | Very High | R-16 |
| D-2 | Multi-reviewer validation: 1–3 reviewers, structured pass/fail/request-changes, SLA timer, auto-escalation. | Full stack | High | R-17 |
| D-3 | Matrix calibration module (`ps.matrix-calibration.ts`): reads feedback + KPI data, proposes weight changes for human review. Background queue, not synchronous wizard action. | Backend + Admin | High | R-18 |
| D-4 | Adaptive branching in questionnaire based on Likert scores. | Frontend + Backend | Medium | R-19 |

**Dependencies:** D-1 requires Phase C. D-2 and D-3 require Phase B. D-4 requires Phase C.

### Roadmap Summary Table

| Phase | Goal | Key Deliverables | Dependencies | Exit Criteria |
|-------|------|------------------|--------------|---------------|
| **A** | Structural cleanup + confidence gate | 3 step merges, confidence gate, LLM naming, completeness indicator, editable dimensions | None | 10-step wizard works end-to-end. Confidence gate blocks low-margin decisions. LLM naming produces professional titles. |
| **B** | Data enrichment | Guided template, structured overrides, KPI baselines, KPI actuals | Phase A | Override metadata persisted in structured format. KPI baselines captured at accept. KPI actuals captured at feedback with delta computation. |
| **C** | Scoring engine evolution | Likert answers, per-question weights, new formula, SHAP explainability, backward compatibility | Phases A + B; architecture review | Likert scoring operational. Old binary versions unaffected. SHAP bars render. Evaluation suite passes. Rollback works. |
| **D** | Advanced governance | Multi-evaluator, multi-reviewer + SLA, calibration module, adaptive branching | Phase C for D-1, D-3, D-4; Phase B for D-2 | Multi-evaluator operational. SLA tracking live. Calibration queue producing proposals for human review. |

---

## 9. Phase Gates and Acceptance Criteria

### Phase Gate Table

| Phase | Entry Criteria | Exit Criteria | Approval Needed |
|-------|---------------|---------------|-----------------|
| **A** | Decision package approved. Current 13-step wizard stable. No active breaking changes in PS module. | (1) Wizard renders 10 steps. (2) Confidence gate blocks creation for margin < threshold. (3) LLM naming works with fallback to heuristic. (4) All merges work without data loss. (5) ConceptPackage handoff from Ideation still works. (6) No regression in scoring/lifecycle. | Code review + QA sign-off |
| **B** | Phase A gate passed and deployed. Template wording governance-reviewed. | (1) Guided template renders with classification-focused prompts. (2) Override records include structured metadata. (3) KPI baseline fields persist to project record. (4) KPI actuals with delta computation at feedback step. | Code review + QA sign-off |
| **C** | Phase B gate passed. Scoring architecture review complete. Backward-compatibility analysis documented. Evaluation suite expanded. | (1) New Likert matrix version created and activated. (2) Old binary versions score identically to pre-upgrade. (3) Likert scoring differentiates across test scenarios. (4) SHAP bars render per-question attribution. (5) Confidence engine valid for Likert distributions. (6) Rollback to binary works. | Architecture review + code review + QA + PM sign-off |
| **D** | Phase C gate passed. Infrastructure design approved. | (1) Multi-evaluator works for 2–3 evaluators. (2) Multi-reviewer SLA tracking functional. (3) Calibration module proposes weight changes. (4) Human review UI exists. (5) No calibration runs synchronously in wizard. | Architecture + code review + QA + PM + governance sign-off |

### Detailed Phase A Exit Criteria

Because Phase A is the immediate next action, its exit criteria are specified in full:

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| A-E1 | Wizard renders exactly 10 steps in step rail | Visual inspection + step count assertion |
| A-E2 | Step 1 merges scenario textarea and context fields in one form | Load wizard, verify single form with collapsible sections |
| A-E3 | At least one context field is required before proceeding | Try to advance with all context fields empty — must be blocked |
| A-E4 | Step 2 shows dimensions and LLM-generated title on one screen | Enter scenario, advance, verify title and dimensions appear together |
| A-E5 | LLM-generated title is user-editable | Edit the generated title, verify it persists through wizard |
| A-E6 | LLM fallback: if LLM unavailable, `deriveProjectName` heuristic used | Disconnect LLM provider, verify heuristic title still generated |
| A-E7 | Confidence gate blocks creation when margin < 8 | Run classification with close scores, verify Step 6 prevents advancing |
| A-E8 | Confidence gate requires note when margin 8–14 | Run classification with medium margin, verify note requirement |
| A-E9 | Confidence gate auto-proceeds when margin ≥ 15 | Run classification with clear winner, verify no gate block |
| A-E10 | Thresholds are configurable | Change threshold values, verify changed behavior |
| A-E11 | Step 10 combines PM handoff and feedback capture | Advance to final step, verify both PM button and outcome capture present |
| A-E12 | ConceptPackage handoff from Ideation still populates wizard | Start wizard from Ideation convert flow, verify scenario pre-populated |
| A-E13 | No regression: scoring, explainability, lifecycle all work | Run full wizard flow end-to-end |

---

## 10. Open Issues Requiring Explicit Decision

| # | Issue | Why Unresolved | Impact if Left Open | Required Decision |
|---|-------|---------------|--------------------|--------------------|
| O-1 | **Confidence gate threshold values** (High ≥15, Medium 8–14, Low <8) — are these the right numbers? | Proposed in design suggestion but not validated against actual wizard run data. Optimal thresholds depend on real score distributions. | Too aggressive → blocks too many projects. Too lenient → gate is useless. | **Run threshold analysis on existing wizard runs.** If insufficient data, start configurable with proposed defaults, tune after 50 runs. |
| O-2 | **LLM provider for project naming** — which model? | Multiple LLM providers exist (OpenAI, Anthropic, Ollama, llama.cpp). No explicit decision on which to use. | Wrong choice could cause latency or unavailability. | **Use existing `resolveAgentLlm()` pattern** from Context Translator. Reuses existing catalog resolution — no new provider decision needed. Fallback to `deriveProjectName` heuristic. |
| O-3 | **Scoring formula versioning schema** — how to store formula identifier per matrix version? | Phase C requires formula versioning. No schema design exists yet. | Delayed Phase C start if not designed in advance. | **Add `scoring_formula` column to matrix version table** during Phase C architecture review. Enum values: `binary_v1`, `likert_v1`. |
| O-4 | **Backward compatibility: re-score old projects?** | Phase C introduces Likert scoring. Existing projects scored with binary formula. | Ambiguity about whether old project histories show "outdated" scoring. | **Existing projects retain original scores. No retroactive re-scoring.** New scoring applies only to new wizard runs with new matrix versions. Score display labels formula version. |
| O-5 | **OM-HR-PS bridge layer dependency** | PS Wizard creates projects that eventually need staffing. The OM-HR-PS Integration Roadmap defines `resource_request` and `resource_assignment` as critical missing objects. | If project creation proceeds without awareness of future staffing demand model, project schema may need changes later. | **No immediate action required for PS Wizard.** Projects created in DRAFT status. Staffing demand attaches post-creation. Schema can be extended without breaking the wizard. The bridge layer is an enterprise integration concern, not a wizard concern. |

---

## 11. Final Decision Summary

### Decisions Made

| # | Decision | Status | Effective From |
|---|----------|--------|---------------|
| D-1 | PS Wizard target architecture is 10 steps via three merges (1+2, 3+4, 12+13) | **APPROVED** | Phase A |
| D-2 | Configurable confidence gate is required at Recommendation step | **APPROVED** | Phase A |
| D-3 | LLM-powered project naming replaces first-sentence heuristic | **APPROVED** | Phase A |
| D-4 | At least one context field is required at Step 1 | **APPROVED** | Phase A |
| D-5 | Binary scoring engine retained through Phases A and B | **APPROVED** | Phases A–B |
| D-6 | Likert scoring migration deferred to Phase C with mandatory backward-compatibility analysis | **APPROVED** | Phase C |
| D-7 | Multi-evaluator and multi-reviewer deferred to Phase D | **APPROVED** | Phase D |
| D-8 | Matrix calibration must be a separate background module, not a wizard step action | **APPROVED** | Phase D |
| D-9 | Scenario template wording duplicating Ideation Steps 1–3 is permanently rejected | **APPROVED** | Permanent |
| D-10 | ConceptPackage remains the sole boundary contract between Ideation and Wizard | **APPROVED** | Permanent |
| D-11 | Existing projects are not retroactively re-scored after Phase C | **APPROVED** | Phase C |
| D-12 | Phase A is immediate next action; Phases B→C→D follow sequentially | **APPROVED** | Immediate |

### Decisions Requiring Data Before Finalisation

| # | Decision | Required Before | Owner |
|---|----------|----------------|-------|
| DD-1 | Confidence gate threshold exact values | Phase A implementation | Product owner + data analyst |
| DD-2 | Scoring formula versioning schema design | Phase C start | Architecture lead |

### Decisions Requiring Governance Review

| # | Decision | Required Before | Owner |
|---|----------|----------------|-------|
| DG-1 | Guided scenario template wording approval | Phase B implementation | Governance team |

### Implementation Priority

```
Phase A (immediate)  ── UX consolidation + confidence gate (Quick Wins)
     │
     ▼
Phase B (after A)    ── Data enrichment + structured metadata
     │
     ▼
Phase C (after B)    ── Scoring engine upgrade (dedicated workstream)
     │
     ▼
Phase D (after C)    ── Advanced governance + infrastructure
```

### What This Package Authorises

- **Phase A work may begin immediately** upon approval of this document.
- **Phase B work may begin** after Phase A exit criteria are met.
- **Phase C requires a separate architecture review** before implementation begins.
- **Phase D requires Phase C completion** and separate infrastructure design review.

### What This Package Does Not Authorise

- Reopening the PS Ideation boundary design
- Embedding matrix calibration logic in wizard step handlers
- Retroactive re-scoring of existing projects
- Scenario template wording that duplicates Ideation discovery questions
- Scoring engine changes before Phase C architecture review

---

**Document status: COMPLETE.**
**Ready for executive review and Phase A authorisation.**
