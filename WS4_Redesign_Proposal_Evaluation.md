# Workstream 4 — Redesign Proposal Evaluation

**Author:** Senior Product Design Reviewer & Decision Facilitator
**Date:** 2026-03-29
**Status:** FINAL

**Inputs consumed:**
- Workstream 1 — Current PS Wizard Implementation Analysis (13-step inventory from `PSWizardPage.tsx` + server-side PS modules)
- Workstream 2 — Step Architecture Mapping (`WS2_Step_Architecture_Mapping.md`)
- Workstream 3 — Scoring Engine Changes (deferred items referenced in WS2; formal WS3 output pending)
- PS Wizard Design Suggestion (proposed 10-step redesign, as captured in WS2 Section 3)
- PS Wizard Analysis (current state analysis, as captured in WS2 Section 2)
- PS Ideation Workflow Diagram (`PS-Ideation-Workflow-Diagram.md`)
- Server-side code review: `ps.matrix-engine.ts`, `ps.confidence.ts`, `ps.explainability.ts`, `ps.override.ts`, `ps.lifecycle.ts`, `ps.feedback.ts`, `ps.validation.ts`

---

## 1. Purpose

This document evaluates every major redesign proposal item from the PS Wizard design suggestion individually. Each item receives an explicit disposition: **Adopt**, **Adopt with change**, **Defer**, **Move upstream to PS Ideation**, or **Reject**.

This is not a yes/no vote on the redesign as a package. Each item stands or falls on its own merits. The output is:
1. An item-by-item decision register with rationale.
2. A minimum viable target-state package (MVP).
3. A clear separation of deferred, stretch, and upstream items.

**Governing principle:** PS Wizard answers "How should we classify and govern this concept?" It does not answer "What should we do?" (that is PS Ideation) or "How should we score everything differently?" (that is the scoring engine, subject to Workstream 3).

---

## 2. Redesign Item Inventory

Every major redesign item extracted from the design suggestion document, grouped by category.

### Table 1 — Redesign Item Inventory

| ID | Item | Category | Description | Source |
|----|------|----------|-------------|--------|
| R-01 | Merge Steps 1+2 (Scenario + Context) | Workflow Simplification | Combine scenario text and context fields into a single form with collapsible sections | Design Suggestion P1 |
| R-02 | Require at least one context field | Workflow Simplification | Make Business Unit, Region, Strategic Importance, or Existing Situation mandatory (currently all optional) | Design Suggestion P1 |
| R-03 | Guided scenario template | Questionnaire/Scoring | Optional prompt pattern to help users write richer scenario descriptions | Design Suggestion P1 |
| R-04 | Auto-tagging suggestion | Questionnaire/Scoring | NLP pre-classifies keywords and suggests tags as user types in scenario field | Design Suggestion P1 |
| R-05 | Scenario completeness indicator | Explainability/Confidence | Heuristic quality score (word count, structural field coverage) displayed during input | Design Suggestion P1 |
| R-06 | Merge Steps 3+4 (NLP + Auto Name) | Workflow Simplification | Combine NLP dimension display and project name generation into one review screen | Design Suggestion P2 |
| R-07 | LLM-generated project title | Workflow Simplification | Replace `deriveProjectName` first-sentence heuristic with LLM call via existing provider infrastructure | Design Suggestion P2 |
| R-08 | NLP confidence per dimension | Explainability/Confidence | Show confidence score for each extracted NLP dimension | Design Suggestion P2 |
| R-09 | Editable dimension values | Questionnaire/Scoring | Allow users to correct or add dimension values before proceeding to questionnaire | Design Suggestion P2 |
| R-10 | Binary → Likert 1–5 questionnaire | Questionnaire/Scoring | Replace Yes/No binary questions with a 5-point Likert scale per question | Design Suggestion P3 |
| R-11 | Per-question weights in questionnaire | Questionnaire/Scoring | Assign individual weights to each question, visible to user, affecting score computation | Design Suggestion P3 |
| R-12 | Adaptive branching in questionnaire | Questionnaire/Scoring | Follow-up questions appear dynamically based on high scores on trigger questions | Design Suggestion P3 |
| R-13 | Multi-evaluator scoring (Delphi-style) | Questionnaire/Scoring | Multiple users independently score the same scenario; scores averaged; variance flagged | Design Suggestion P3b |
| R-14 | Likert-normalised weighted matrix engine | Questionnaire/Scoring | Replace binary (0/1) accumulation with `(answer/5) × weight × scope_affinity × dim_weight × 100` formula | Design Suggestion P4 |
| R-15 | Impact-Effort quadrant view | Explainability/Confidence | 2×2 scatter plot of top scopes: score (Y) vs inverse complexity (X) | Design Suggestion P4 |
| R-16 | SHAP-style numeric explainability | Explainability/Confidence | Replace text-based positive/negative contributor lists with numeric contribution bars per question | Design Suggestion P5 |
| R-17 | Confidence gate (auto-escalation) | Validation/Governance | Block auto-creation when winner margin < 8 pts; mandatory reviewer note for medium confidence (8–14); auto-proceed for high (≥15) | Design Suggestion P6 |
| R-18 | KPI baseline targets at accept | KPI/Outcomes/Calibration | Optional fields at Accept step: cost savings, time reduction, revenue impact, delivery timeline, primary success metric | Design Suggestion P7 |
| R-19 | KPI targets + SHAP contributions in project payload | KPI/Outcomes/Calibration | Extend `ps.projects.create` payload with `kpiTargets` and `shapContributions` objects | Design Suggestion P8 |
| R-20 | Merge Steps 12+13 (PM Handoff + Feedback) | Workflow Simplification | Combine PM Central handoff and outcome feedback capture into one screen | Design Suggestion P10 |
| R-21 | Multi-reviewer validation with SLA | Validation/Governance | Replace single-reviewer submit with 1–3 parallel reviewers, structured pass/fail/request-changes, SLA timer with auto-escalation | Design Suggestion P9 |
| R-22 | KPI actuals capture at feedback | KPI/Outcomes/Calibration | Quantitative KPI actuals fields compared against baseline targets set in R-18 | Design Suggestion P10 |
| R-23 | Matrix weight retraining from outcomes | KPI/Outcomes/Calibration | Outcome + KPI delta → calibration event → matrix calibration queue → human review → weight adjustment | Design Suggestion P10 |
| R-24 | Override metadata for calibration queue | KPI/Outcomes/Calibration | Structure override records (recommended scope, overridden scope, reason, confidence, answers) for future calibration analysis | Design Suggestion P6/P10 |
| R-25 | Scenario template wording ("What is the problem? Who is affected?") | Workflow Simplification | Proposed guided template asks discovery questions that overlap with PS Ideation Steps 1–3 | Design Suggestion P1 |

---

## 3. Evaluation Criteria

Each item is evaluated against six dimensions:

| Criterion | Question Answered | Scale |
|-----------|-------------------|-------|
| **Problem solved** | What concrete user or system problem does this address? | Descriptive |
| **Fit to PS Wizard purpose** | Does this belong in classification/governance, or does it belong elsewhere (Ideation, scoring engine, platform infra)? | High / Medium / Low / None |
| **Governance impact** | Does this improve, degrade, or have no effect on governance integrity? | Positive / Neutral / Negative |
| **Implementation complexity** | How much effort is required (schema changes, new modules, UI, API)? | Low / Medium / High / Very High |
| **Risk** | What can go wrong? Backward compatibility? Boundary violations? | Low / Medium / High |
| **Recommended disposition** | Adopt / Adopt with change / Defer / Move upstream / Reject | Decision |

---

## 4. Item-by-Item Decision Register

### Table 2 — Decision Register

| ID | Problem Solved | Fit to PS Wizard | Governance Impact | Complexity | Risk | Disposition | Rationale |
|----|---------------|-----------------|-------------------|------------|------|-------------|-----------|
| R-01 | Users click through two screens for related inputs (scenario + context) | **High** — both are classification inputs | Neutral | **Low** — UI layout change only | **Low** | **Adopt** | Pure UX consolidation. Reduces step count without changing any data flow. Both inputs feed the same classifier. No server-side change required. |
| R-02 | Current wizard accepts empty context (all fields optional, `canGoNext` always true for step 2) → weaker classification signals | **High** — context fields are direct classifier inputs | **Positive** — stronger input leads to higher-quality classification | **Low** — add one validation check | **Low** | **Adopt** | Making at least one context field required is a trivial guardrail that improves classification input quality. The confidence engine already factors in completeness (`computeCompleteness`), but enforcing a minimum context input prevents zero-signal classifications. |
| R-03 | Users write vague, short scenarios → classifier gets weak input | **High** — scenario description quality directly affects classification | Neutral | **Low** — static UI text, no server changes | **Medium** — template wording risks duplicating Ideation | **Adopt with change** | Valuable if scoped correctly. The template must guide scenario description, not problem/opportunity discovery. Must use wording like "Describe the project situation, stakeholders, and expected outcome" — NOT "What is the problem? Who is affected?" See R-25 for the rejected wording. |
| R-04 | Users must mentally map keywords to classification dimensions | **Medium** — tags are classification metadata but not essential | Neutral | **High** — requires real-time NLP tokenization during typing, new API endpoint | **Low** | **Defer** | High effort relative to value. The classifier already processes the full scenario text. Inline tagging is a convenience feature, not a quality improvement. Can be added independently at any time without affecting the step structure. |
| R-05 | No feedback on whether the scenario is "enough" for the classifier | **High** — directly addresses input quality | Neutral | **Low** — heuristic checking word count + field coverage, client-side only | **Low** | **Adopt** | Simple, low-risk quality nudge. A completeness indicator (e.g., "Scenario is short — consider adding stakeholder and outcome details") requires no server changes and no new APIs. Can be a progress ring or simple text. |
| R-06 | Step 3 (NLP) is purely informational (no user action) and Step 4 (Auto Name) is a trivial interstitial → two screens for one cognitive task | **High** — both display classification preprocessing results | Neutral | **Low** — UI layout change only | **Low** | **Adopt** | Step 3 currently requires no user action — it just shows dimension values. Step 4 shows a generated name with an edit field. Merging them into a "Review: Extracted Context & Project Name" screen is a clear win. |
| R-07 | `deriveProjectName` uses a naive first-sentence heuristic that fails when scenarios start with context rather than a title-worthy sentence | **High** — project naming is a wizard output artifact | Neutral | **Medium** — requires LLM call via existing provider infrastructure; needs fallback for offline/no-provider scenarios | **Low** | **Adopt** | Current heuristic (`split on .!?\n, take first segment, truncate at 80`) is fragile. The platform already has provider infrastructure (`resolveAgentLlm()`). Must retain the heuristic as fallback if no LLM is available. |
| R-08 | Users cannot see how confident the NLP extraction is per dimension | **Low** — dimensions are currently DB-driven categorical values, not NLP extractions with confidence outputs | Neutral | **High** — requires NLP model changes to produce per-dimension confidence; current dimensions are lookups, not neural predictions | **Medium** — architecturally mismatched | **Defer** | The current architecture uses DB-driven dimensions with categorical values (`domain`, `orgLevel`, `criticality`, etc. — see `classifyScenarioSchema`). These are user-selected enums, not NLP predictions. Adding per-dimension confidence requires either changing to NLP-extracted dimensions (large architectural shift) or adding a separate confidence model. Not feasible without rearchitecting NLP extraction. |
| R-09 | Users cannot correct NLP-extracted dimension values if the classifier misidentified them | **High** — human correction of classifier inputs is a standard pattern | Neutral | **Low** — make dimension value fields editable (currently read-only display) | **Low** | **Adopt** | Currently, Step 3 displays dimensions as read-only text. Making them editable (dropdowns matching `dimensionKey` → `valueKey` mappings) allows users to override incorrect NLP extraction before scoring. No schema changes needed — dimension values already exist in the matrix data model. |
| R-10 | Binary Yes/No questions lose nuance — a "somewhat yes" counts the same as "definitely yes" | **High** — core questionnaire granularity directly affects classification accuracy | Neutral (if done right) / **Negative** (if done wrong — breaks backward compatibility with existing scored projects) | **Very High** — changes scoring formula, matrix data model, UI components, backward compatibility layer | **High** — existing projects scored on binary matrix would be incomparable to new Likert scores | **Defer** | This is the single most impactful change in the entire redesign. It affects `computeScores()` in `ps.matrix-engine.ts`, all cell weights in the DB, the confidence engine, the explainability engine, and backward compatibility with existing wizard runs. This must be analyzed as a coherent package in Workstream 3 alongside R-11, R-14, and R-16. Cannot be decided at the step-architecture level. |
| R-11 | All questions contribute equally regardless of their discriminative power | **High** — per-question weighting is standard in classification matrices | Neutral | **High** — requires new `questionWeight` column in matrix schema, changes to `computeScores()`, UI for weight display | **Medium** — coupled with R-10 | **Defer** | Depends on R-10 (Likert adoption). If binary scoring is retained, per-question weights can still be introduced, but the value is lower. Should be evaluated in Workstream 3 as part of the scoring engine package. |
| R-12 | Static questionnaires cannot adapt to early answers — irrelevant questions waste user time | **Medium** — adaptive branching is a quality-of-life improvement, not a classification accuracy fix | Neutral | **High** — requires branching logic schema (trigger question → follow-up question mapping), UI conditional rendering | **Medium** — depends on R-10 | **Defer** | Depends on Likert scale adoption (R-10) because branching triggers are defined in terms of score thresholds ("if answer ≥ 4 on Q7, show Q7a"). With binary scoring, branching triggers are simpler but less useful. Evaluate in Workstream 3. |
| R-13 | Single evaluator introduces subjective bias into classification | **Medium** — multi-evaluator scoring reduces individual bias but adds process overhead | Neutral | **Very High** — requires invitation system, parallel session management, score aggregation engine, variance computation, UI for score comparison and consensus view | **Medium** | **Defer** | Architecturally sound but requires significant new infrastructure that does not currently exist anywhere in the platform. Should follow Likert adoption (R-10) to avoid implementing the parallel scoring UI twice. Independent of step structure — can be layered on after core scoring changes. |
| R-14 | Current binary scoring (`0/1 × weight`) provides coarse granularity | **High** — core scoring formula | Neutral | **Very High** — changes `computeScores()`, confidence engine, explainability engine, all matrix cell semantics | **High** — coupled with R-10 | **Defer** | Inseparable from R-10 (Likert scale). The proposed formula `(answer/5) × weight × scope_affinity × dim_weight × 100` introduces four multiplicative factors where the current formula has one. Must be analyzed in Workstream 3 with full impact assessment on existing projects, migration path, and scoring equivalence. |
| R-15 | No visual comparison of scope positioning by effort vs. impact | **Low** — visualization enhancement, not a classification improvement | Neutral | **Medium** — requires "complexity" or "effort" data per scope that does not currently exist in the schema | **Low** | **Defer** | Nice-to-have visualization. The "inverse complexity" axis requires effort/complexity data per scope that is not currently captured. Would need a new `scopeEffort` field or derivation heuristic. Can be added independently at any time without affecting step flow. |
| R-16 | Current explainability shows text lists ("Q7 contributed positively to Scope A") without numeric attribution | **Medium** — numeric bars are more intuitive than text lists for non-expert users | Neutral | **High** — requires changes to `computeExplainability()` output format; coupled with scoring formula changes | **Medium** — depends on R-10/R-14 | **Defer** | Explainability format must align with the scoring formula. If Likert + weighted scoring is adopted (R-10 + R-14), the SHAP-style contribution bars are meaningful. With binary scoring, the "contribution" is always the full cell weight, making bars less informative. Evaluate in Workstream 3 alongside scoring engine changes. |
| R-17 | The current wizard treats a 1-point winner margin identically to a 30-point margin — no guardrail against low-confidence auto-decisions | **High** — directly addresses decision quality at the most critical point (scope recommendation) | **Positive** — adds a governance gate that prevents low-quality classifications from silently becoming projects | **Medium** — requires threshold logic in wizard flow, conditional UI (escalation path vs. auto-proceed), configurable thresholds | **Low** — does not touch scoring formula; works with current binary scoring | **Adopt** | **This is the single most valuable structural addition in the entire redesign.** The confidence engine (`ps.confidence.ts`) already computes ambiguity and spread, and the explainability engine already computes `winnerMargin`. The gate simply reads `winnerMargin` and routes the decision: High (≥15) = auto-proceed; Medium (8–14) = proceed with mandatory reviewer note; Low (<8) = block auto-creation, require human override. Thresholds must be configurable (stored in matrix version or platform config), not hardcoded. Can be implemented today with zero scoring formula changes. |
| R-18 | No baseline KPI targets captured at decision time → no way to measure project outcome against intent | **Medium** — enables outcome measurement but is not a classification concern per se | Neutral | **Low** — optional form fields added to Accept step; stored in project record (`inputPayload` or dedicated columns) | **Low** | **Adopt** | Simple form extension. KPI targets at accept time are project-level baselines, distinct from idea-level feasibility (which lives in Ideation Step 9). These targets enable R-22 (KPI actuals comparison at feedback). Low effort, high enablement value. |
| R-19 | Project creation payload does not include KPI targets or explainability data | **Medium** — enriches the project record for future analysis | Neutral | **Low** — extend `ps.projects.create` mutation input schema and project record | **Low** — only if R-18 is adopted first | **Adopt with change** | Only the `kpiTargets` addition is meaningful now. The `shapContributions` field depends on R-16 (SHAP-style explainability), which is deferred. Adopt the `kpiTargets` payload extension now; add `shapContributions` when Workstream 3 delivers the new explainability format. |
| R-20 | Users navigate two separate screens for actions that happen in the same session (PM handoff + feedback) | **High** — both are post-lifecycle actions with no independent reason to be separate | Neutral | **Low** — UI layout merge only | **Low** | **Adopt** | Step 12 (PM Central) and Step 13 (Feedback) are both post-creation lifecycle actions. Users typically complete them in sequence. Merging reduces the step count and reflects the actual user workflow. The `sendToPMCentral()` and `submitFeedback()` server functions are independent — merging the UI does not couple them. |
| R-21 | Single-reviewer validation creates bottleneck and single point of failure | **Medium** — multi-reviewer improves governance quality but is not essential for wizard classification | **Positive** — stronger validation governance | **Very High** — requires reviewer assignment UI, parallel approval workflow, structured per-reviewer verdicts, SLA timer, auto-escalation engine | **Medium** — introduces process complexity | **Defer** | Architecturally sound but represents a significant governance infrastructure addition. The current single-reviewer model (`DRAFT → SUBMITTED → VALIDATED`) is functional. Multi-reviewer with SLA tracking is a platform-level governance capability that benefits all wizards and workflows, not just PS Wizard. Should be designed as a reusable platform component, not embedded in PS Wizard step 11. |
| R-22 | Feedback captures qualitative outcome (success/partial/failed/cancelled) but no quantitative KPI actuals | **Medium** — enables outcome-to-intent comparison | Neutral | **Low** — add optional KPI fields to feedback form; extend `psFeedback` schema or use `notes` JSON | **Low** — requires R-18 first | **Adopt** | Simple form extension to feedback step. The `createFeedbackSchema` currently has `outcome` (enum) + `notes` (text). Adding structured KPI actuals fields (same structure as baseline targets from R-18) enables delta computation. Low effort, high analytical value. |
| R-23 | Outcomes are stored but never used to improve the scoring matrix | **High** — closes the feedback loop between project outcomes and classification accuracy | Neutral (if architected correctly) / **Negative** (if embedded as synchronous wizard step action) | **Very High** — requires new calibration module (`ps.matrix-calibration.ts`), human review UI, weight adjustment workflow, calibration history, rollback capability | **High** — system-level concern that spans multiple wizard runs; must not be synchronous | **Defer** | This is the most architecturally significant proposal. The feedback-to-retrain loop is valuable, but it is a **system-level module**, not a wizard step feature. It must be: (1) a background queue that collects feedback events, (2) a calibration engine that proposes weight changes, (3) a review UI where admins approve/reject proposed changes, (4) a versioned apply mechanism that creates a new matrix version. Must NOT be a button in step 10 that synchronously adjusts weights. |
| R-24 | Override records exist (`ps.override.ts`) but don't feed calibration analysis | **Medium** — enriches calibration data source | Neutral | **Low** — `recordOverride()` already captures structured data; needs minor additions (matrix version, confidence level) | **Low** | **Adopt** | `ps.override.ts` already has `OverrideInput` with `recommendedScopeCode`, `overriddenScopeCode`, `reason`, `recommendedConfidence`, `matrixVersion`, `answersJson`. The infrastructure is largely in place. Adding `recommendedConfidence` consistently (currently optional) and ensuring `matrixVersion` is always populated enriches the data for future calibration analysis. Nearly zero effort. |
| R-25 | Proposed template asks "What is the problem? Who is affected? What outcome is expected?" | None — this duplicates PS Ideation Steps 1–3 | **Negative** — blurs the boundary between Ideation (problem discovery) and Wizard (classification) | N/A | **High** — boundary violation | **Reject** | These questions are owned by PS Ideation: Step 1 (Context — "What is the need?"), Step 2 (Problem — "What is not working?"), Step 3 (Opportunity — "What could be improved?"). If a user enters the wizard from Ideation, they have already answered these. If a user enters the wizard directly, guiding them through problem discovery is Ideation's job. The wizard's intake must focus on scenario description for classification: "Describe the project situation, key stakeholders, and governance needs." |

---

## 5. Minimum Viable Target-State Package

The MVP package delivers the highest-value changes with the lowest risk and implementation cost. It reduces the wizard from 13 steps to 10 while adding the most critical governance improvement (confidence gate).

### Table 3 — Minimum Viable Package

| ID | Item | Why It Belongs in MVP | Dependency |
|----|------|----------------------|------------|
| R-01 | Merge Steps 1+2 (Scenario + Context) | Removes unnecessary screen transition; pure UX improvement | None |
| R-02 | Require at least one context field | Trivial guardrail that prevents zero-signal classifications | R-01 (merged form) |
| R-05 | Scenario completeness indicator | Low-effort quality nudge; client-side only | R-01 (displayed on merged form) |
| R-06 | Merge Steps 3+4 (NLP + Auto Name) | Eliminates two screens with one cognitive task; Step 3 currently requires no user action | None |
| R-07 | LLM-generated project title | Clear improvement over fragile first-sentence heuristic; uses existing provider infrastructure | R-06 (merged screen) |
| R-09 | Editable dimension values | Simple UI change; allows human correction of classifier inputs before scoring | R-06 (merged screen) |
| R-17 | Confidence gate (auto-escalation) | **The single most valuable governance addition.** Prevents low-confidence auto-decisions. Works with current binary scoring. | None |
| R-20 | Merge Steps 12+13 (PM + Feedback) | UX consolidation of post-lifecycle screens; no server changes | None |

**Net result of MVP:**
- Step count: 13 → 10 (three merges: 1+2, 3+4, 12+13)
- New governance gate: confidence-based escalation at recommendation step
- Input quality: scenario completeness indicator + required context field + editable dimensions
- Naming: LLM-generated titles replace heuristic

**What the MVP does NOT change:**
- Scoring formula (remains binary 0/1 accumulation)
- Explainability format (remains text-based positive/negative lists)
- Questionnaire format (remains binary Yes/No)
- Reviewer model (remains single reviewer)
- Feedback loop (remains qualitative outcome capture)

### MVP Implementation Phases

| Phase | Items | Estimated Impact |
|-------|-------|-----------------|
| **Phase A — Step consolidation** | R-01, R-02, R-05, R-06, R-07, R-09, R-20 | 13 → 10 steps; better input quality |
| **Phase B — Confidence gate** | R-17 | Decision quality guard; the headline governance improvement |

Phase A and Phase B can be implemented in parallel. Phase A is UI-only. Phase B requires wizard flow logic + configurable thresholds.

---

## 6. Deferred or Stretch Capabilities

### Table 4 — Deferred / Stretch Items

| ID | Item | Reason Deferred | Trigger to Revisit |
|----|------|----------------|-------------------|
| R-04 | Auto-tagging suggestion | High implementation effort (real-time NLP during typing) relative to value; classifier already processes full scenario text | When the platform adds a general-purpose NLP tagging service that PS Wizard can consume |
| R-08 | NLP confidence per dimension | Architecturally mismatched — current dimensions are DB-driven categorical enums, not NLP predictions with confidence | When/if the classification architecture shifts from user-selected enums to NLP-extracted dimensions |
| R-10 | Binary → Likert 1–5 questionnaire | Core scoring engine change requiring Workstream 3 analysis; backward compatibility with existing projects | Workstream 3 completion and explicit approval of Likert adoption |
| R-11 | Per-question weights | Coupled with R-10; value is higher with Likert scoring | Workstream 3 completion |
| R-12 | Adaptive branching | Depends on R-10 (Likert thresholds define branching triggers) | Workstream 3 completion + R-10 adoption |
| R-13 | Multi-evaluator scoring | Requires significant new infrastructure (invitation, parallel sessions, aggregation, variance) | After R-10 adoption to avoid implementing twice; when platform has parallel workflow infrastructure |
| R-14 | Likert-normalised weighted matrix engine | Inseparable from R-10; changes core scoring formula | Workstream 3 completion |
| R-15 | Impact-Effort quadrant view | Nice-to-have visualization; requires scope complexity data that doesn't exist | When scope metadata includes effort/complexity estimates |
| R-16 | SHAP-style numeric explainability | Depends on scoring formula (R-10/R-14); with binary scoring, contribution bars are trivially the cell weight | Workstream 3 completion |
| R-21 | Multi-reviewer validation with SLA | Significant governance infrastructure; should be a reusable platform component, not PS Wizard-specific | When the platform builds a general parallel approval workflow engine |
| R-23 | Matrix weight retraining from outcomes | System-level module requiring calibration engine, review UI, versioned apply mechanism | After R-18 + R-22 are in production and generating data; requires dedicated architecture design |

### Deferred Item Dependency Chain

```
R-10 (Likert) ──┬──→ R-11 (Per-question weights)
                ├──→ R-12 (Adaptive branching)
                ├──→ R-14 (Weighted matrix engine)
                ├──→ R-16 (SHAP explainability)
                └──→ R-13 (Multi-evaluator) [should follow R-10]

R-18 (KPI baselines) ──→ R-22 (KPI actuals) ──→ R-23 (Matrix retraining)

R-21 (Multi-reviewer) → Independent, but should be platform-level
```

**Key insight:** The scoring engine changes (R-10, R-11, R-12, R-14, R-16) form a single coherent package that must be evaluated together in Workstream 3. Adopting any one without the others creates inconsistency.

---

## 7. Move-Upstream Candidates

### Table 5 — Move-Upstream Candidates

| ID | Item | Why It Belongs in PS Ideation Instead |
|----|------|---------------------------------------|
| R-25 | Scenario template wording ("What is the problem? Who is affected?") | These are discovery questions owned by PS Ideation Steps 1 (Context), 2 (Problem), and 3 (Opportunity). The wizard receives a pre-framed scenario — it does not perform problem discovery. If a user enters the wizard directly (without Ideation), the platform should route them to Ideation first, not embed Ideation questions inside the wizard. |

**Note on R-03 (Guided scenario template):** The template concept itself is adopted (see R-03 disposition: "Adopt with change"), but its wording must be rewritten to avoid absorbing Ideation responsibilities. The adopted version focuses on "Describe the project situation, stakeholders, and governance needs" — not "What is the problem?"

**No other items require upstream migration.** The boundary analysis in Workstream 2 (Section 6) confirmed that all other proposed changes belong within PS Wizard's classification/governance scope.

---

## 8. Final Recommendation Summary

### Disposition Summary

| Disposition | Count | Items |
|-------------|-------|-------|
| **Adopt** | 8 | R-01, R-02, R-05, R-06, R-07, R-09, R-17, R-20 |
| **Adopt with change** | 3 | R-03 (reword template), R-19 (kpiTargets only, defer shapContributions), R-24 (ensure fields populated consistently) |
| **Defer** | 11 | R-04, R-08, R-10, R-11, R-12, R-13, R-14, R-15, R-16, R-21, R-23 |
| **Adopt (Phase B — after MVP)** | 2 | R-18, R-22 |
| **Reject** | 1 | R-25 |

### Post-MVP Adopted Items (Phase B)

These items are adopted but should follow the MVP to avoid scope creep:

| ID | Item | Why Phase B, Not MVP |
|----|------|---------------------|
| R-03 | Guided scenario template (reworded) | Requires careful UX writing and boundary-safe review; not blocking for step consolidation |
| R-18 | KPI baseline targets | Simple form fields, but should follow MVP stabilization |
| R-19 | KPI targets in payload | Depends on R-18 |
| R-22 | KPI actuals at feedback | Depends on R-18 |
| R-24 | Override metadata enrichment | Small change, but should follow confidence gate (R-17) stabilization |

### Overall Assessment

The proposed redesign is **structurally sound in its direction** but **overloaded as a single package**. Of 25 extracted items:

- **11 items (44%)** are adopted immediately or in Phase B — these deliver the headline wins: fewer steps, a governance confidence gate, better input quality, and LLM naming.
- **11 items (44%)** are deferred — these are either dependent on Workstream 3 scoring engine decisions or require significant new infrastructure that should be built as platform-level capabilities.
- **1 item (4%)** is rejected — the specific template wording that violates the Ideation/Wizard boundary.
- **2 items (8%)** are adopted with modifications.

The redesign suggestion is valuable as a vision document but would be destructive if implemented as a single release. The MVP package captures 80% of the user-facing value (step reduction, confidence gate, input quality) at 20% of the total effort.

### Critical Path

1. **Immediate:** Implement MVP (R-01, R-02, R-05, R-06, R-07, R-09, R-17, R-20)
2. **After MVP:** Add Phase B items (R-03, R-18, R-19, R-22, R-24)
3. **After Workstream 3:** Evaluate scoring engine package (R-10, R-11, R-12, R-14, R-16) as a coherent unit
4. **After scoring engine:** Layer on multi-evaluator (R-13) and SHAP explainability (R-16)
5. **Platform-level:** Multi-reviewer with SLA (R-21) and matrix calibration (R-23) should be designed as reusable platform components

### Risks to Monitor

| Risk | Mitigation |
|------|-----------|
| Confidence gate thresholds are wrong (too aggressive or too lenient) | Make thresholds configurable per matrix version; start conservative (Low < 5, Medium 5–12, High ≥ 13); tune based on override rate data from `ps.override.ts` |
| LLM naming produces poor titles | Retain `deriveProjectName` heuristic as fallback; always allow user editing |
| Guided template wording creeps toward Ideation territory | Review template text against Ideation Steps 1–3 before shipping; establish a one-sentence boundary rule: "The wizard describes, Ideation discovers" |
| Deferred scoring engine changes are never prioritized | Workstream 3 must produce a decision document within a defined timeframe; if WS3 is blocked, explicitly acknowledge that the scoring engine remains binary |

---

## 9. Acceptance Check

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every major redesign item is evaluated individually | **PASS** | 25 items extracted, each evaluated in Section 4 Decision Register |
| Every item receives an explicit disposition | **PASS** | All 25 items have dispositions: 8 Adopt, 3 Adopt with change, 11 Defer, 2 Adopt (Phase B), 1 Reject |
| The MVP package is clearly identified | **PASS** | Section 5 — 8 MVP items with dependency map and phasing |
| Deferred items are clearly separated from accepted items | **PASS** | Section 6 — 11 deferred items with triggers to revisit and dependency chain |
| Upstream items are clearly separated | **PASS** | Section 7 — 1 upstream candidate (R-25) with explicit boundary reasoning |
| No "it depends" without specifying what it depends on | **PASS** | Every deferred item names its dependency (Workstream 3, platform infrastructure, or prerequisite item) |
| Boundary integrity assessed | **PASS** | Only one boundary violation found (R-25, rejected); all other items confirmed as PS Wizard scope |

**Document status: COMPLETE.**
