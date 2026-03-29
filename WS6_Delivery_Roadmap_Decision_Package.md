# Workstream 6 — Delivery Roadmap and Decision Package for PS Wizard

**Author:** Principal Delivery Strategist
**Date:** 2026-03-29
**Status:** FINAL — Decision-ready
**Classification:** Internal decision document — standalone reading

---

## 1. Executive Summary

This document is the final integrated decision package for the PS Wizard redesign. It consolidates the validated outputs of five prior workstreams into a single accountable reference that can be read without returning to the source documents.

**Core finding:** The PS Wizard is architecturally sound in its current 13-step form. The proposed 10-step redesign is structurally valid with qualifications. The redesign can be executed in four phases that separate quick UX wins from deep scoring engine changes and advanced governance infrastructure.

**Key decisions:**

1. **Adopt** the step merges (13 → 10 steps) — pure UX consolidation, low risk.
2. **Adopt** a configurable confidence gate — the single highest-value structural addition.
3. **Adopt** LLM-powered project naming — replaces a naive heuristic with existing infrastructure.
4. **Defer** Likert 1–5 scoring, per-question weights, and SHAP-style explainability to a dedicated scoring engine workstream — these are coupled changes that require backward-compatibility analysis.
5. **Defer** multi-evaluator scoring and multi-reviewer SLA validation — significant new infrastructure, not critical path.
6. **Reject** scenario template wording that duplicates PS Ideation responsibilities — the wizard classifies; it does not discover problems or opportunities.
7. **Preserve** the PS Ideation → ConceptPackage → PS Wizard boundary — no change needed.

**Net outcome:** Fewer wizard steps, better decision quality, no boundary violations, clear path from quick wins to deep engine changes.

---

## 2. Source Role Map

Every input document used in this decision package is listed below with its role and trust status.

| # | Source | Role in Decision Package | Trust Status | Notes |
|---|--------|--------------------------|--------------|-------|
| S-1 | `PSWizardPage.tsx` (lines 1–896) | Implementation truth for current 13-step wizard | **Verified** — code-level audit complete | Primary evidence for current-state baseline |
| S-2 | `ps.matrix-engine.ts` | Scoring engine truth — DB-backed, zero hardcoded logic | **Verified** | Deterministic scoring, alphabetical tie-breaking |
| S-3 | `ps.classifier.ts` | Rule-based dimension-to-type classifier | **Verified** | 15+ rules, dimension-driven, no ML |
| S-4 | `ps.confidence.ts` | Confidence engine — 3-pillar model (spread, completeness, ambiguity) | **Verified** | Weighted composite: 30%/30%/40% |
| S-5 | `ps.explainability.ts` | Explainability engine — positive/negative signal lists | **Verified** | Text-based contributor lists, no numeric attribution |
| S-6 | `ps.lifecycle.ts` | PS project lifecycle state machine | **Verified** | DRAFT→SUBMITTED→VALIDATED→PUBLISHED/SENT_TO_PM; REJECTED path |
| S-7 | `WS2_Step_Architecture_Mapping.md` | Step architecture analysis — maps current, proposed, and upstream steps | **Verified** — self-acceptance-checked | Primary evidence for step disposition decisions |
| S-8 | `PS-Ideation-Workflow-Diagram.md` | 11-step ideation workflow + handoff boundary | **Verified** against code | Defines upstream boundary |
| S-9 | `WS Wizard — Governance-First Design.md` | Governance-first wizard design specification | **Verified** | Defines the wizard-as-intake-pipeline model |
| S-10 | `ws-wizard-compliance-checklist.md` | Wizard compliance matrix and promotion gates | **Verified** | Defines minimum evidence requirements |
| S-11 | `audit2.md` (Workspaces) | Fresh compliance audit — scored 8.75/10 | **Verified** — 15 claims checked against code | Residual gaps: returnToDraft, content re-check, purposeType |
| S-12 | `ImplimentationAudit Report.md` | Original compliance audit — 12/12 steps pass | **Verified** by audit2 cross-check | Trustworthy with one minor omission |
| S-13 | `ws-governance-roadmap.md` | 10-phase governance-first implementation roadmap | **Verified** | Phases 1–5 complete, phases 6–10 in progress |
| S-14 | `Phase2-Comparison.md` | Phase 2 delivery verification — 48/48 items | **Verified** | Governance Center, Digital HQ, audit, middleware all delivered |
| S-15 | `ps_wizard_design_suggestion.md` (referenced in S-7) | Proposed 10-step redesign specification | **Consumed via S-7** | Original proposal — analysed in WS2, not directly available as separate file |
| S-16 | Server PS module files (ps.override.ts, ps.feedback.ts, ps.validation.ts, ps.templates.ts, ps.repository.ts) | Supporting server-side evidence | **Verified** | Override capture, feedback storage, template resolution |

---

## 3. Validated Current-State Baseline

### 3.1 PS Wizard — Current Architecture

The PS Wizard is a 13-step sequential flow implemented in `PSWizardPage.tsx`. It receives a scenario (free-text or pre-populated from PS Ideation via ConceptPackage), classifies it against a DB-driven scoring matrix, recommends a PS scope, and creates a project with lifecycle governance.

**Step inventory (verified against code):**

| # | Step | Phase | Purpose | Implementation Status |
|---|------|-------|---------|----------------------|
| 1 | Scenario | Intake | Free-text textarea (≤5000 chars) | Implemented. Validation: non-empty. |
| 2 | Context | Intake | BU, Region, Strategic Importance, Existing Situation | Implemented. No required fields. |
| 3 | NLP Analysis | Intake | Display DB-driven classification dimensions | Implemented. Informational only — no user action. |
| 4 | Auto Name | Intake | Derive project name from first sentence | Implemented. Naive heuristic (split on `.!?\n`). |
| 5 | Questions | AI Scoring | Binary Yes/No questions from active matrix | Implemented. Clicking "Classify" triggers scoring. |
| 6 | Scoring | AI Scoring | Top 3 ranked scopes with scores and confidence | Implemented. Data from `classifyScenario` mutation. |
| 7 | Explainability | AI Scoring | Positive/negative contributor lists | Implemented. Text lists, no numeric attribution. |
| 8 | Recommendation | Decision | Recommended scope + optional override | Implemented. Override reason stored in local state. |
| 9 | Accept | Decision | Full summary review with decision trace | Implemented. Machine-readable audit string. |
| 10 | Create PS Project | Lifecycle | Creates project in DRAFT status | Implemented. Template bundle resolved server-side. |
| 11 | Validation | Lifecycle | Submit for validation (DRAFT → SUBMITTED) | Implemented. Single-reviewer model. |
| 12 | PM Central | Lifecycle | Send to PM Central (→ SENT_TO_PM) | Implemented. Blocked if still DRAFT. |
| 13 | Feedback | Lifecycle | Record outcome + optional notes | Implemented. Outcomes stored, not used for retraining. |

### 3.2 Scoring Engine — Current Architecture

| Component | File | Architecture | Key Characteristic |
|-----------|------|-------------|-------------------|
| Matrix Engine | `ps.matrix-engine.ts` | DB-backed, version-controlled | Loads scopes, questions, cells, dimensions from active matrix version. Binary (0/1) weight accumulation per scope. |
| Classifier | `ps.classifier.ts` | Rule-based, deterministic | 15+ rules test dimension values, vote for system type. No ML, no probabilistic logic. |
| Confidence Engine | `ps.confidence.ts` | 3-pillar composite | Spread (30%), Completeness (30%), (1-Ambiguity) (40%). Output: 0.0–1.0. |
| Explainability | `ps.explainability.ts` | Signal-based | Positive signals = questions where winner gained weight. Negative = questions where competitor gained more. Text output. |

### 3.3 PS Ideation Boundary — Current Architecture

The PS Ideation module is an 11-step workflow that runs **before** the PS Wizard. Its output is a ConceptPackage delivered via the readiness engine (`ideation-readiness.ts`).

**Boundary contract:** ConceptPackage is the formal handoff point. Ideation answers "What should we do?" Wizard answers "How should we classify and govern it?" The boundary is clean and well-implemented via `PSIdeationConvertPage.tsx` + `ideation-conversion.ts`.

### 3.4 Lifecycle State Machine

```
DRAFT → SUBMITTED → VALIDATED → PUBLISHED
                               → SENT_TO_PM
                  → REJECTED
```

### 3.5 Known Gaps in Current State

| # | Gap | Severity | Source |
|---|-----|----------|--------|
| G-1 | No confidence gate — 1-point margin treated identically to 30-point margin | High | WS2 analysis |
| G-2 | Naive project naming heuristic fails on context-first scenarios | Medium | WS2 D-6 |
| G-3 | Steps 1+2 are separate screens with no required context fields | Low | WS2 D-1 |
| G-4 | Steps 3+4 are separate screens; step 3 has no user action | Low | WS2 D-2 |
| G-5 | Steps 12+13 are separate screens for post-lifecycle actions | Low | WS2 D-21 |
| G-6 | Feedback outcomes stored but not used for matrix calibration | Medium | WS2 D-20 |
| G-7 | Override reason captured as free text, no structured metadata | Medium | WS2 D-16 |
| G-8 | No KPI baseline targets at commit time | Low | WS2 D-17 |
| G-9 | Explainability uses text lists, not numeric attribution | Low | WS2 D-14 |

---

## 4. Approved Target-State Direction

### 4.1 Wizard Step Structure

The target state reduces the wizard from 13 steps to 10 steps through three merges, while adding a confidence gate that improves decision quality.

**Target step map:**

| # | Target Step | Source Steps | Change Type |
|---|------------|-------------|-------------|
| 1 | Scenario + Context | Old 1 + 2 | Merge — single form with collapsible sections. ≥1 context field required. |
| 2 | NLP + Smart Name | Old 3 + 4 | Merge — single review screen. LLM-generated title replaces heuristic. |
| 3 | Questionnaire | Old 5 | Unchanged structure (binary). Likert deferred. |
| 4 | Scoring | Old 6 | Unchanged. Weighted matrix deferred. |
| 5 | Explainability | Old 7 | Unchanged. SHAP-style deferred. |
| 6 | Recommendation + Confidence Gate | Old 8 | Upgraded — configurable confidence thresholds block low-margin auto-decisions. |
| 7 | Accept + Confirm | Old 9 | Upgraded — optional KPI baseline target fields added. |
| 8 | Create PS Project | Old 10 | Unchanged with minor payload additions. |
| 9 | Validation | Old 11 | Unchanged. Multi-reviewer deferred. |
| 10 | PM Handoff + Feedback | Old 12 + 13 | Merge — single screen. Outcome-to-calibration queue deferred. |

### 4.2 Scoring Engine Direction

The scoring engine remains binary (0/1) in the immediate term. The Likert 1–5 upgrade, per-question weights, normalised scoring formula, and SHAP-style explainability are deferred to a dedicated scoring engine workstream (Phase C) that must include:

- Backward compatibility analysis for existing projects scored on binary matrix
- Migration path for existing matrix versions
- Scoring formula validation with test data
- Rollback strategy

### 4.3 Boundary Direction

No changes to the PS Ideation → PS Wizard boundary. The ConceptPackage contract remains the formal handoff. The wizard must not absorb ideation responsibilities.

---

## 5. Final Step Architecture Recommendation

### 5.1 Recommendation Summary

**Adopt the 10-step target structure** with the three merges and confidence gate. This reduces friction (3 fewer screens), adds decision quality control (confidence gate), and improves naming (LLM title generation) — all without changing the scoring engine or violating boundary rules.

### 5.2 Detailed Dispositions

| # | Capability | Disposition | Priority | Rationale |
|---|-----------|-------------|----------|-----------|
| D-1 | Steps 1+2 merge (Scenario + Context) | **ADOPT** | P2 | Pure UX consolidation. Removes unnecessary screen transition. Making one context field required is a sensible guardrail. |
| D-2 | Steps 3+4 merge (NLP + Smart Name) | **ADOPT** | P2 | Eliminates pure-information step and trivial interstitial. Single review screen. |
| D-3 | Guided scenario template | **ADOPT WITH CHANGE** | P3 | Must NOT duplicate Ideation Steps 1–3. Template must focus on "Describe the project situation" not "What is the problem?" |
| D-4 | Auto-tagging suggestion | **DEFER** | P4 | Nice-to-have. High effort relative to value. Not architecturally necessary. |
| D-5 | Scenario completeness indicator | **ADOPT** | P3 | Simple heuristic (word count, field coverage). Low effort, low risk. |
| D-6 | LLM-generated project title | **ADOPT** | P2 | Clear improvement over first-sentence heuristic. Leverages existing LLM provider infrastructure. |
| D-7 | NLP confidence per dimension | **DEFER** | P4 | Architecturally mismatched — current dimensions are DB-driven categorical values, not NLP extractions with confidence. |
| D-8 | Editable dimension values | **ADOPT** | P3 | Simple UI change. Allows human correction of NLP extraction. No architectural risk. |
| D-9 | Binary → Likert 1–5 questionnaire | **DEFER** | P1 | Most impactful scoring engine change. Requires deep analysis of scoring formula, weight calibration, backward compatibility. |
| D-10 | Adaptive branching in questionnaire | **DEFER** | P2 | Depends on Likert adoption (D-9). Cannot be evaluated independently. |
| D-11 | Multi-evaluator scoring | **DEFER** | P3 | Requires invitation system, parallel sessions, score aggregation. Should follow Likert to avoid implementing twice. |
| D-12 | Likert-normalised scoring formula | **DEFER** | P1 | Core formula change. Must be analysed as part of scoring engine workstream. |
| D-13 | Impact-Effort quadrant view | **DEFER** | P4 | Visualization enhancement. No structural impact. Can be added independently. |
| D-14 | SHAP-style numeric explainability | **DEFER** | P2 | Explainability format depends on scoring formula. Must follow Likert/weight decisions. |
| D-15 | Confidence gate (auto-escalation) | **ADOPT** | P1 | Highest-value structural addition. Prevents low-confidence auto-decisions. Configurable thresholds. Works with current binary scoring. |
| D-16 | Override → structured metadata | **ADOPT** | P2 | Structured override records (recommended scope, overridden scope, reason). Enables future calibration analysis. |
| D-17 | KPI baseline targets at accept | **ADOPT** | P3 | Simple form fields added to Accept step. Enables outcome measurement (D-19). |
| D-18 | Multi-reviewer validation with SLA | **DEFER** | P3 | Significant infrastructure. Not architecturally necessary for wizard flow. |
| D-19 | KPI actuals capture at feedback | **ADOPT** | P3 | Simple form extension. Requires D-17 first. |
| D-20 | Matrix weight retraining from outcomes | **DEFER** | P2 | Requires separate calibration module. Must NOT be embedded in wizard step handler. |
| D-21 | Steps 12+13 merge (PM + Feedback) | **ADOPT** | P3 | UX consolidation. Post-lifecycle actions on single screen. |
| D-22 | Scenario template wording duplicating Ideation | **REJECT** | P1 | Duplicates Ideation Steps 1–3. Template must be reworded to classification-focused prompts. |

### 5.3 Boundary Constraint

The guided scenario template (D-3) is approved with the following mandatory constraint:

- **Allowed prompts:** "Describe the project situation," "What is the expected outcome," "Who are the key stakeholders"
- **Prohibited prompts:** "What is the problem?", "Who is affected?", "What could be improved?" — these belong to Ideation Steps 1–3

---

## 6. Final Scoring Architecture Recommendation

### 6.1 Immediate State (Phases A–B)

**No scoring engine changes.** The current binary (0/1) matrix engine, confidence engine, and explainability engine remain unchanged. The confidence gate (D-15) operates on top of the existing scoring output — it inspects the winner margin from the current formula and enforces configurable thresholds.

**Confidence gate specification:**

| Confidence Band | Winner Margin | Wizard Behavior |
|----------------|---------------|-----------------|
| High | ≥ 15 points | Auto-proceed to Accept step |
| Medium | 8–14 points | Proceed with mandatory reviewer note at Accept |
| Low | < 8 points | Block auto-creation; require manual escalation or second evaluation |

Thresholds must be configurable (stored in matrix version metadata or system config), not hardcoded.

### 6.2 Future State (Phase C — Scoring Engine Workstream)

The following changes are deferred to a dedicated scoring engine workstream:

| Change | Current | Target | Migration Concern |
|--------|---------|--------|-------------------|
| Answer format | Binary Yes/No | Likert 1–5 | Existing projects with binary answers must remain queryable. New matrix versions use Likert; old versions remain binary. |
| Scoring formula | `Σ (answer × cell_weight)` where answer ∈ {0,1} | `Σ ((answer/5) × cell_weight × scope_affinity × dim_weight) × 100` | Formula must be versioned per matrix. Old formula for old versions, new formula for new versions. |
| Explainability | Text contributor lists | Numeric SHAP-style bars with point attribution | Depends on new formula producing meaningful per-question point contributions. |
| Per-question weights | Equal weight (cell weight only) | Configurable per-question importance weight | Requires matrix admin UI for weight assignment. |

**Non-negotiable constraints for Phase C:**

1. Existing projects scored on binary matrix must not be retroactively re-scored.
2. New and old matrix versions must coexist.
3. The scoring formula must be stored as part of the matrix version record.
4. A rollback path must exist (revert to binary formula by activating an old matrix version).

### 6.3 Post-Phase-C State (Phase D)

These build on the Likert scoring engine:

| Change | Dependency | Notes |
|--------|-----------|-------|
| Multi-evaluator scoring | Likert (D-9) | Avoid implementing binary multi-eval then re-implementing for Likert. |
| Matrix weight calibration from outcomes | Likert (D-9) + KPI actuals (D-19) | Calibration module reads feedback data, proposes weight changes for human review. Must be a background queue, not a synchronous wizard action. |
| Adaptive branching | Likert (D-9) | Follow-up questions shown based on high Likert scores on trigger questions. |

---

## 7. Final Recommendation Matrix

| # | Item | Final Decision | Why | Dependency | Phase |
|---|------|---------------|-----|------------|-------|
| 1 | Steps 1+2 merge | **Adopt** | Reduces friction, no risk | None | A |
| 2 | Steps 3+4 merge | **Adopt** | Eliminates dead screen, consolidates | None | A |
| 3 | LLM project naming | **Adopt** | Replaces naive heuristic, uses existing infra | None | A |
| 4 | Confidence gate | **Adopt** | Highest-value addition, works with current scoring | None | A |
| 5 | Steps 12+13 merge | **Adopt** | UX consolidation of post-lifecycle | None | A |
| 6 | Scenario completeness indicator | **Adopt** | Low effort, nudges richer input | None | A |
| 7 | Editable dimension values | **Adopt** | Simple UI fix, allows human correction | None | A |
| 8 | Guided scenario template (reworded) | **Adopt with change** | Must not duplicate Ideation Steps 1–3 | Boundary constraint | B |
| 9 | Override structured metadata | **Adopt with change** | Structured records for future calibration | None | B |
| 10 | KPI baseline targets | **Adopt** | Simple form fields, enables outcome tracking | None | B |
| 11 | KPI actuals at feedback | **Adopt** | Simple form extension | D-17 (item 10) | B |
| 12 | Binary → Likert 1–5 | **Defer** | Coupled scoring engine change, needs deep analysis | Phase C workstream | C |
| 13 | Per-question weights | **Defer** | Depends on Likert adoption | Item 12 | C |
| 14 | Likert-normalised scoring formula | **Defer** | Core formula change | Item 12 | C |
| 15 | SHAP-style explainability | **Defer** | Depends on new scoring formula | Item 14 | C |
| 16 | Multi-evaluator scoring | **Defer** | High infrastructure cost, depends on Likert | Item 12 | D |
| 17 | Multi-reviewer SLA validation | **Defer** | High infrastructure cost, not critical path | None | D |
| 18 | Matrix weight retraining | **Defer** | Requires separate calibration module | Items 11, 12 | D |
| 19 | Adaptive branching | **Defer** | Depends on Likert scoring | Item 12 | D |
| 20 | Auto-tagging suggestion | **Defer** | High effort, low value | None | D |
| 21 | NLP confidence per dimension | **Defer** | Architecturally mismatched with current approach | Phase C NLP changes | D |
| 22 | Impact-Effort quadrant view | **Defer** | Nice-to-have visualization | None | D |
| 23 | Scenario template — Ideation wording | **Reject** | Duplicates Ideation Steps 1–3, violates boundary | N/A | N/A |

---

## 8. Phased Implementation Roadmap

### Phase A — Quick Wins (UX Consolidation + Confidence Gate)

| Attribute | Value |
|-----------|-------|
| **Goal** | Reduce wizard from 13 to 10 steps. Add confidence gate. Improve naming. |
| **Estimated scope** | 1 page refactor (PSWizardPage.tsx) + 1 new server endpoint (confidence thresholds) |
| **Risk level** | Low |

**Key deliverables:**

1. Merge Steps 1+2 into single Scenario+Context form with collapsible sections. Make ≥1 context field required.
2. Merge Steps 3+4 into single NLP+SmartName review screen. Replace `deriveProjectName` with LLM call via existing provider infrastructure.
3. Add configurable confidence gate to Recommendation step — block auto-creation when winner margin < 8 points.
4. Merge Steps 12+13 into single PM Handoff+Feedback screen.
5. Add scenario completeness indicator (word count, field coverage heuristic).
6. Make dimension values editable in NLP step.

**Dependencies:** None — all changes work with current binary scoring engine.

### Phase B — Data Enrichment (Metadata + KPIs)

| Attribute | Value |
|-----------|-------|
| **Goal** | Capture richer metadata at decision and feedback stages. Enable future calibration. |
| **Estimated scope** | Form field additions + server payload extensions |
| **Risk level** | Low |

**Key deliverables:**

1. Add guided scenario template (reworded per boundary constraint — no Ideation overlap).
2. Capture structured override metadata: recommended scope code, overridden scope code, reason, timestamp.
3. Add optional KPI baseline targets at Accept step: cost savings, time reduction, revenue impact, delivery timeline, primary success metric.
4. Add optional KPI actuals capture at Feedback step with delta computation against baselines.

**Dependencies:** Phase A complete.

### Phase C — Scoring Engine Upgrade (Likert + Weights + XAI)

| Attribute | Value |
|-----------|-------|
| **Goal** | Upgrade the scoring engine from binary to Likert with per-question weights and numeric explainability. |
| **Estimated scope** | Matrix schema changes + scoring formula + migration tooling + admin UI |
| **Risk level** | Medium-High |

**Key deliverables:**

1. Extend matrix schema to support Likert 1–5 answers and per-question weights.
2. Implement new scoring formula: `(answer/5) × weight × scope_affinity × dim_weight × 100`.
3. Version the formula per matrix version — old binary versions retain old formula.
4. Implement SHAP-style numeric explainability with per-question point attribution bars.
5. Build migration tooling: ability to create new Likert matrix version from existing binary version.
6. Update confidence engine calibration for Likert score distributions.
7. Provide rollback path: reactivate old binary matrix version to revert.

**Dependencies:** Phase A + B complete. Dedicated workstream with architecture review.

### Phase D — Advanced Governance + Infrastructure

| Attribute | Value |
|-----------|-------|
| **Goal** | Add multi-evaluator scoring, multi-reviewer validation, matrix calibration, and advanced visualizations. |
| **Estimated scope** | Multiple new modules, invitation system, calibration queue |
| **Risk level** | Medium |

**Key deliverables:**

1. Multi-evaluator scoring: invitation system, parallel scoring sessions, score aggregation, variance display.
2. Multi-reviewer validation with SLA: 1–3 reviewers, structured pass/fail/request-changes, SLA timer, auto-escalation.
3. Matrix calibration module (`ps.matrix-calibration.ts`): reads feedback+KPI data, proposes weight adjustments for human review. Background queue, not synchronous wizard action.
4. Adaptive branching in questionnaire based on Likert scores.
5. Auto-tagging suggestion at intake.
6. NLP confidence per dimension (requires NLP model changes).
7. Impact-Effort quadrant visualization.

**Dependencies:** Phase C complete for items 1, 3, 4, 6. Items 2, 5, 7 can begin after Phase B.

### Roadmap Table

| Phase | Goal | Key Deliverables | Dependencies | Exit Criteria |
|-------|------|-----------------|--------------|---------------|
| **A** | UX consolidation + confidence gate | 3 step merges, confidence gate, LLM naming, completeness indicator, editable dimensions | None | 10-step wizard works end-to-end. Confidence gate blocks low-margin decisions. LLM naming produces professional titles. |
| **B** | Data enrichment | Scenario template, structured overrides, KPI baselines, KPI actuals | Phase A | Override metadata persisted in structured format. KPI baselines captured at accept. KPI actuals captured at feedback with delta computation. |
| **C** | Scoring engine upgrade | Likert answers, per-question weights, new formula, SHAP explainability, migration tooling | Phases A + B. Architecture review. | New Likert matrix version scores correctly. Old binary versions unaffected. SHAP bars render per-question attribution. Rollback works. |
| **D** | Advanced governance | Multi-evaluator, multi-reviewer, calibration module, adaptive branching, auto-tagging | Phase C for items 1,3,4,6. Phase B for items 2,5,7. | Multi-evaluator scores averaged with variance flags. Calibration queue proposes weight changes for human review. SLA-tracked reviews work. |

---

## 9. Phase Gates and Acceptance Criteria

### Phase Gate Table

| Phase | Entry Criteria | Exit Criteria | Approval Needed |
|-------|---------------|---------------|-----------------|
| **A** | Decision package approved. Current 13-step wizard is stable. No active breaking changes in PS module. | (1) Wizard renders 10 steps, not 13. (2) Confidence gate blocks creation when margin < threshold. (3) LLM naming produces titles for 5 test scenarios. (4) All three merges work without data loss. (5) Existing ConceptPackage handoff from Ideation still works. | Code review + QA sign-off |
| **B** | Phase A exit criteria met. Phase A deployed. | (1) Guided scenario template renders with classification-focused prompts (no Ideation overlap). (2) Override records include structured metadata (recommended scope, overridden scope, reason). (3) KPI baseline fields appear at Accept step and persist to project record. (4) KPI actuals fields appear at Feedback step with delta computation. | Code review + QA sign-off |
| **C** | Phase B exit criteria met. Scoring engine architecture review complete. Backward compatibility analysis documented. Test data prepared. | (1) New Likert matrix version can be created and activated. (2) Old binary matrix versions score identically to pre-upgrade. (3) New Likert scoring produces differentiated results across test scenarios. (4) SHAP bars render per-question point attribution. (5) Confidence engine produces valid outputs for Likert distributions. (6) Rollback to binary matrix version works. | Architecture review + code review + QA sign-off + PM sign-off |
| **D** | Phase C exit criteria met. Infrastructure design for multi-evaluator and calibration approved. | (1) Multi-evaluator invitation and scoring flow works for 2–3 evaluators. (2) Multi-reviewer validation with SLA tracking works. (3) Calibration module proposes weight changes from feedback data. (4) Human review UI for calibration proposals exists. (5) No calibration action runs synchronously in the wizard. | Architecture review + code review + QA sign-off + PM sign-off + governance sign-off |

### Detailed Exit Criteria — Phase A (Highest Priority)

Because Phase A is the immediate next action, its exit criteria are specified in full:

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| A-1 | Wizard renders exactly 10 steps in step rail | Visual inspection + step count assertion |
| A-2 | Step 1 (Scenario+Context) merges scenario textarea and context fields in one form | Load wizard, verify single form with collapsible sections |
| A-3 | At least one context field is required before proceeding | Try to advance with all context fields empty — blocked |
| A-4 | Step 2 (NLP+SmartName) shows dimensions and LLM-generated title on one screen | Enter scenario, advance to step 2, verify title and dimensions appear together |
| A-5 | LLM-generated title is editable | Edit the generated title and verify it persists through wizard |
| A-6 | Confidence gate blocks creation when winner margin < 8 | Run classification with close scores, verify step 6 prevents advancing to Create |
| A-7 | Confidence gate shows mandatory note field when margin is 8–14 | Run classification with medium margin, verify note requirement |
| A-8 | Step 10 (PM+Feedback) combines PM handoff and feedback capture | Advance to final step, verify both PM button and outcome capture on same screen |
| A-9 | Scenario completeness indicator shows quality feedback | Type short scenario, see low indicator; type detailed scenario, see high indicator |
| A-10 | Dimension values are editable in NLP step | Click a dimension value, edit it, verify change persists to questionnaire |
| A-11 | ConceptPackage handoff from Ideation still populates wizard | Start wizard from Ideation convert flow, verify scenario is pre-populated |
| A-12 | No regression in existing scoring/explainability/lifecycle | Run full wizard flow, verify scoring, explainability, project creation, lifecycle transitions all work |

---

## 10. Open Issues Requiring Explicit Decision

| # | Issue | Why Unresolved | Impact if Left Open | Required Decision |
|---|-------|---------------|--------------------|--------------------|
| O-1 | Confidence gate thresholds (High ≥15, Medium 8–14, Low <8) — are these the right numbers? | Thresholds proposed in design suggestion but not validated against real project data. | If thresholds are wrong, too many projects get blocked (too strict) or too few are caught (too loose). | **Decision needed before Phase A:** Validate thresholds against 20+ historical wizard runs OR make thresholds configurable and start with proposed values. Recommend: **start configurable, default to proposed values, tune after 50 runs.** |
| O-2 | LLM provider for project naming — which model? | Multiple LLM providers exist in the platform (OpenAI, Anthropic, Ollama, llama.cpp). No decision on which to use for naming. | Wrong provider choice could cause latency or unavailability. | **Decision needed before Phase A:** Use `resolveAgentLlm()` from existing catalog infrastructure (already used by Context Translator). Recommend: **reuse existing resolution path — no new provider decision needed.** |
| O-3 | `returnToDraft` not admin-gated in WS Wizard | Flagged in audit2 (Section 7). Any authenticated user can return `archived→draft`, bypassing the admin-only archive gate. | An archived workspace could be un-archived without admin approval. Low-probability but governance gap. | **Decision needed (WS Wizard, not PS Wizard):** Add admin check to `returnToDraft` for `archived→draft` transition. Allow non-admin for `rejected→draft`. |
| O-4 | Scoring formula versioning schema — how to store formula identifier? | Phase C requires formula versioning per matrix version. No schema design exists yet. | Delayed Phase C start. | **Decision needed before Phase C:** Add `scoringFormula` enum or identifier column to matrix version table. Design during Phase C architecture review. |
| O-5 | Backward compatibility — re-score old projects? | Phase C introduces Likert scoring. Existing projects were scored with binary formula. | If not decided, ambiguity about whether old projects show "outdated" scoring in their history. | **Decision:** Existing projects retain their original scores. No retroactive re-scoring. New scoring applies only to new wizard runs with new matrix versions. |

---

## 11. Final Decision Summary

### Decisions Made

| # | Decision | Status | Authority |
|---|----------|--------|-----------|
| 1 | PS Wizard reduces from 13 to 10 steps via three merges (1+2, 3+4, 12+13) | **APPROVED** | Workstream 2 analysis — no structural risk |
| 2 | Configurable confidence gate added to Recommendation step | **APPROVED** | Workstream 2 analysis — highest-value addition |
| 3 | LLM-powered project naming replaces first-sentence heuristic | **APPROVED** | Workstream 2 analysis — leverages existing infrastructure |
| 4 | Scoring engine remains binary for Phases A–B; Likert upgrade in Phase C | **APPROVED** | Coupled changes require dedicated workstream with architecture review |
| 5 | PS Ideation → ConceptPackage → PS Wizard boundary preserved | **APPROVED** | Workstream 2 Section 6 — boundary integrity confirmed |
| 6 | Scenario template wording duplicating Ideation is rejected | **APPROVED** | Workstream 2 D-22 — boundary violation |
| 7 | Existing projects are not retroactively re-scored after Phase C | **APPROVED** | Prevents data integrity issues |
| 8 | Matrix calibration must be a separate module, not a wizard step action | **APPROVED** | System-level concern, not step-level concern |
| 9 | Confidence gate thresholds start configurable with proposed defaults | **RECOMMENDED** | Needs validation against historical data; recommend tune after 50 runs |
| 10 | Phase A is the immediate next action; Phases B–D follow sequentially | **APPROVED** | Dependency chain is linear and well-defined |

### Implementation Priority

```
Phase A (immediate) ─── UX consolidation + confidence gate
     │
     ▼
Phase B (after A)   ─── Data enrichment + structured metadata
     │
     ▼
Phase C (after B)   ─── Scoring engine upgrade (dedicated workstream)
     │
     ▼
Phase D (after C)   ─── Advanced governance + infrastructure
```

### What This Package Authorizes

- **Phase A work may begin immediately** upon approval of this package.
- **Phase B work may begin** after Phase A exit criteria are met.
- **Phase C requires a separate architecture review** before implementation begins.
- **Phase D requires Phase C completion** and a separate infrastructure design review.

### What This Package Does Not Authorize

- Reopening the PS Ideation boundary design.
- Embedding matrix calibration logic in wizard step handlers.
- Retroactive re-scoring of existing projects.
- Scenario template wording that duplicates Ideation discovery questions.

---

**Document status: COMPLETE.**
**Ready for executive review and Phase A authorization.**
