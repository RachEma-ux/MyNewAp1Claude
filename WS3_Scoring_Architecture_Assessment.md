# Workstream 3 — Scoring Architecture Assessment

**Author:** Senior Scoring-Systems Architect, Decision-Model Analyst, Governance Reviewer
**Date:** 2026-03-29
**Inputs:** Workstream 2 output (WS2_Step_Architecture_Mapping.md), PSWizardPage.tsx, ps.classifier.ts, ps.matrix-engine.ts, ps.explainability.ts, ps.confidence.ts, ps.override.ts, ps.feedback.ts, ps.evaluation.ts, ps.types.ts, scope-matrix-v1.json, PS-Ideation-Workflow-Diagram.md, ideation-readiness.ts

---

## 1. Purpose

This document provides a rigorous assessment of the PS Wizard scoring architecture, covering:

1. The current implemented scoring model as verified against source code.
2. The proposed redesign scoring model as specified in the design suggestion and confirmed by Workstream 2 disposition register.
3. A clean separation between idea-management scoring (PS Ideation) and wizard classification scoring (PS Wizard).
4. A comparative fit analysis of standard decision-analysis and scoring methods.
5. Governance requirements for confidence, overrides, explainability, and calibration.
6. A recommended scoring direction.

**Scope rule:** This workstream treats scoring as a first-class architectural concern — not a UI feature or a cosmetic upgrade. Changes to the scoring formula, answer scale, weighting scheme, confidence logic, or explainability model are structural changes that affect every downstream consumer: project creation, template resolution, lifecycle transitions, audit trails, override analytics, and evaluation suites.

---

## 2. Current Scoring Baseline

### 2.1 Architecture Overview

The current system has **two classifiers**, but only one is used by the PS Wizard:

| Classifier | File | Used By | Status |
|---|---|---|---|
| Rule-based deterministic classifier | `server/ps/ps.classifier.ts` | Legacy/standalone callers | **Active but not wizard-facing.** 18 hard-coded rules matching dimension enum values. No DB dependency. |
| DB-backed matrix engine | `server/ps/ps.matrix-engine.ts` | **PS Wizard (primary)** | **Active.** DB-driven scopes, questions, cells. Zero hard-coded logic. |

The wizard exclusively uses the DB-backed matrix engine via `trpc.ps.classifyScenario`. The rule-based classifier exists as a separate service and is not invoked by the wizard flow.

### 2.2 Current Scoring Formula

Source: `ps.matrix-engine.ts:170–219` (computeScores function).

```
For each question Q in the active matrix:
  If answer[Q.code] is truthy:
    For each cell C where C.questionId == Q.id:
      scores[C.scopeCode] += C.weight
```

The scoring is a **binary weighted accumulation**:
- Answer truthiness: `boolean true`, non-empty non-"false"/"no"/"0" strings, numbers > 0 → truthy. Everything else → not truthy. (`isAnswerTruthy()`, line 247–255)
- Weight: integer stored per cell in DB (`cells[].weight`). Represents the affinity between a question and a scope.
- Each truthy answer adds the cell weight to the corresponding scope score.
- Scope score = SUM of cell weights for truthy answers.
- Ranking: descending score, alphabetical code tie-break (deterministic).

### 2.3 Current Scoring Baseline Table

| Scoring element | Current state | Verification status | Notes |
|---|---|---|---|
| Answer input type | Binary (Yes/No toggle buttons) | **Verified.** PSWizardPage.tsx:443–455 renders `["Yes", "No"]` buttons; answers stored as string "Yes"/"No" | Answers stored in `AnswerMap = Record<string, string>` |
| Answer truthiness | "Yes" → truthy; "No" → not truthy | **Verified.** `isAnswerTruthy()` in ps.matrix-engine.ts:247 | String "No" is not in the falsy set, but the wizard UI only sets "Yes" or "No"; "No" passes the non-empty check but equals "no" (case-insensitive) → **not truthy** (line 251: `lower !== "no"`). Correct. |
| Cell weight type | Integer, DB-stored per (questionId, scopeId) | **Verified.** LoadedMatrix cells type: `{ questionId: number; scopeId: number; weight: number }` | No per-question weight multiplier. Weight is the raw affinity value. |
| Scope score formula | `SUM(cell.weight) for truthy answers` | **Verified.** ps.matrix-engine.ts:210–217 | Purely additive. No normalisation, no dimension weighting, no answer-magnitude scaling. |
| Ranking method | Descending score, alphabetical tie-break | **Verified.** `rankScopes()` at ps.matrix-engine.ts:227–236 | Deterministic. |
| Top-N display | Top 3 scopes shown in UI | **Verified.** `evaluateMatrixEnriched()` returns `top3 = ranking.slice(0, 3)` | UI shows relative bar chart (score / top score × 100%). |
| Winner margin | `score[#1] - score[#2]` | **Verified.** ps.explainability.ts:50–52 | Displayed in wizard steps 6 and 7. Absolute integer value. |
| Confidence model | Composite: 30% completeness + 30% spread + 40% (1-ambiguity) | **Verified.** ps.confidence.ts:43–46 | Output: 0.0–1.0. Displayed as-is in UI. |
| Confidence: Completeness | `matchedQuestions / totalQuestions` | **Verified.** ps.confidence.ts:63–69 | Fraction of questions answered truthy. |
| Confidence: Spread | Normalised stddev of scope scores / max possible score | **Verified.** ps.confidence.ts:81–99 | Higher spread → more differentiated → better. |
| Confidence: Ambiguity | `1 - (margin / maxPossibleScore)` | **Verified.** ps.confidence.ts:110–129 | 0 = clear winner, 1 = tied. |
| Confidence gate | **None** | **Verified.** No threshold logic anywhere in codebase | All confidence levels proceed identically to project creation. |
| Explainability model | Positive/negative signal lists by question | **Verified.** ps.explainability.ts:31–121 | Positive: questions where winner gained weight. Negative: questions where runner-up gained more than winner. Text-based, no numeric bars. |
| Explainability: Numeric attribution | **Not implemented** | **Verified.** Signals carry `weight` field but UI renders only question labels as text bullets (PSWizardPage.tsx:539–565) | Weight data exists in the engine output but is not displayed. |
| Override system | Captures recommended vs overridden scope, reason, confidence, answers | **Verified.** ps.override.ts:20–28 (OverrideInput type), ps.override.ts:47–68 (recordOverride) | Has analytics: override rate (all-time + 30-day), override patterns (scope→scope frequency). |
| Override → calibration | **Not connected** | **Verified.** Override data is stored but never read by the scoring engine or any calibration process. | Dead-end data. |
| Feedback system | Outcome (success/partial/failed/cancelled) + driftFlag + notes | **Verified.** ps.feedback.ts:19–25 (schema) | Qualitative only. No KPI actuals. No connection to scoring engine. |
| Feedback → retraining | **Not connected** | **Verified.** Feedback is stored but never consumed by any calibration or weight-adjustment process. | Dead-end data. |
| Evaluation suite | Benchmark cases with expected scope, run against matrix version | **Verified.** ps.evaluation.ts:67–175 | Produces pass/fail, confidence, ranking per case. No connection to calibration. |
| Matrix versioning | Supports draft/active/archived versions | **Verified.** ps.types.ts:260–261 | Version comparison, rollback, import/export all implemented. But no automatic version creation from calibration. |
| Scope count | 32 scopes in seed data (scope-matrix-v1.json) | **Verified.** 32 records in seed JSON | Large scope space. Binary scoring must differentiate across 32 candidates. |
| Question presentation | Binary (Yes/No) only | **Verified.** UI renders two toggle buttons per question | `PRESENTATION_TYPES` in ps.types.ts lists ["boolean", "select", "slider", "multi_select", "text"] but only "boolean" is used in practice. |

### 2.4 Critical Observations on Current Scoring

1. **Binary answers lose information.** A question like "Does the project require PMBOK compliance?" answered "Yes" contributes the full cell weight. There is no way to express "somewhat" or "strongly". This means the scoring engine cannot distinguish between a scenario that weakly involves PMBOK and one that is deeply PMBOK-dependent.

2. **No per-question importance weighting.** All questions contribute equally to the scope score (modulo cell weight). A high-stakes question like "Is safety-critical certification required?" has no mechanism to carry more scoring influence than "Does the team use Kanban boards?" — unless the matrix designer manually inflates cell weights for the safety question across all 32 scopes.

3. **Confidence is computed but not acted upon.** The confidence engine produces a meaningful composite score, but nothing in the system uses it as a gate. A 0.51 confidence and a 0.95 confidence produce identical downstream behavior.

4. **Winner margin is displayed but not governed.** A 1-point margin and a 30-point margin are treated identically. Neither triggers escalation, additional review, or caution warnings.

5. **Feedback and override data are dead ends.** Both are captured in structured DB records with analytics queries, but neither feeds back into the scoring engine. This is an incomplete feedback loop.

---

## 3. Proposed Target Scoring Model

Source: Workstream 2 disposition register (D-9, D-10, D-12, D-14, D-15), design suggestion document (referenced by WS2).

### 3.1 Proposed Scoring Formula

```
For each question Q:
  likert_answer = user answer on 1–5 scale
  normalised = likert_answer / 5              → 0.2 to 1.0
  For each cell C where C.questionId == Q.id:
    contribution = normalised × C.weight × question_weight × dim_weight × 100
    scores[C.scopeCode] += contribution
```

Where:
- `likert_answer`: 1 (strongly disagree) to 5 (strongly agree), replacing binary Yes/No
- `question_weight`: per-question importance multiplier (new field)
- `dim_weight`: per-dimension weight applying to all questions in that dimension (new field)
- `C.weight`: scope affinity per cell (existing field, semantics unchanged)
- The `× 100` is a display scaling factor

### 3.2 Proposed Target Scoring Model Table

| Scoring element | Proposed behavior | Source | Complexity | Notes |
|---|---|---|---|---|
| Answer input type | Likert 1–5 scale | Design suggestion, WS2 D-9 | **High** | Requires: UI component change, answer storage schema change (string→number), isAnswerTruthy replacement, backward compatibility for existing projects scored on binary scale |
| Per-question weight | Configurable multiplier per question | Design suggestion, WS2 D-10 | **Medium** | New column on `psMatrixQuestions` table. Default = 1.0 for backward compatibility. Admin UI needed for weight editing. |
| Dimension weight | Configurable multiplier per dimension | Design suggestion | **Medium** | New column on `psMatrixDimensions` table. Requires mapping questions to dimensions (question presentation `dimensionId` field exists but is not used for scoring). |
| Scope affinity | Existing cell weight | Already implemented | **None** | Semantics unchanged. Value represents how strongly a question-scope pair correlates. |
| Normalised scoring formula | `(answer/5) × cell_weight × q_weight × dim_weight × 100` | Design suggestion, WS2 D-12 | **High** | Replaces `computeScores()`. Must handle mixed answer types (Likert + boolean for backward compat). |
| Adaptive branching | Follow-up questions triggered by high scores on specific questions | Design suggestion, WS2 D-10 | **Medium** | Requires question dependency metadata. Only relevant after Likert adoption. |
| SHAP-style explainability | Numeric contribution bars per question showing point attribution to winner | Design suggestion, WS2 D-14 | **Medium** | Replaces text lists. Contribution per question = normalised × weight × scope_affinity. Display as horizontal bar chart. |
| Confidence gate | Winner margin thresholds: High ≥15 pts, Medium 8–14 pts, Low <8 pts | Design suggestion, WS2 D-15 | **Low** | Blocks auto-creation when margin < 8 pts. Requires mandatory reviewer note for medium confidence (8–14). **Can be implemented independently of Likert change.** |
| Multi-evaluator mode | Parallel scoring by 2+ users; averaged scores; variance flagged | Design suggestion, WS2 D-11 | **High** | Requires: invitation system, parallel session management, score aggregation engine, variance computation, score comparison UI. Delphi-inspired. |
| Calibration from feedback | Outcome + KPI delta → calibration event → weight adjustment queue → human review | Design suggestion, WS2 D-20 | **High** | Requires: new `ps.matrix-calibration.ts` module, calibration event schema, review UI, apply/reject workflow. Must be a background queue, not synchronous. |
| KPI baseline targets | Optional fields at Accept step: cost savings, time reduction, revenue impact, timeline, success metric | Design suggestion, WS2 D-17 | **Low** | Simple form fields. Stored in project record. Enables outcome measurement. |
| KPI actuals at feedback | Quantitative actuals compared against baseline targets | Design suggestion, WS2 D-19 | **Low** | Form extension to feedback step. Requires D-17 first. |
| Impact-Effort quadrant | 2×2 plot: score (Y) vs inverse complexity (X) | Design suggestion, WS2 D-13 | **Low** | Visualization only. No scoring logic change. |

---

## 4. Idea-Management Scoring vs Wizard Classification Scoring

### 4.1 Fundamental Distinction

These are two different scoring problems with different inputs, outputs, and decision objectives:

| Attribute | Idea-Management Scoring (PS Ideation) | Wizard Classification Scoring (PS Wizard) |
|---|---|---|
| **Question answered** | "Is this idea worth pursuing?" | "Which PS scope best fits this scenario?" |
| **Input** | Ideas (title + description), multiple candidates | A single selected concept (from ideation) or direct scenario entry |
| **Scoring subjects** | Multiple ideas compared against each other | Multiple scopes compared against one scenario |
| **Evaluator** | Ideation participant(s) | Classification user(s) |
| **Output** | Ranked ideas, screened shortlist | Ranked scopes, recommended scope, confidence |
| **Decision** | Which idea to select as the concept | Which governance/methodology scope to apply |
| **Lifecycle position** | Before wizard (steps 7–9 of ideation) | Inside wizard (steps 5–7) |

### 4.2 Scoring Domain Split Table

| Scoring purpose | Ideation | PS Wizard | Shared | Notes |
|---|---|---|---|---|
| Idea screening (criteria-based) | **Owner** | — | — | Ideation Step 7. Scores ideas against screening criteria (psIdeationScreeningScores table). Not a classification concern. |
| Feasibility rating (High/Medium/Low) | **Owner** | — | — | Ideation Step 9. Quick feasibility checks per idea (psIdeationFeasibilityChecks table). Not a classification concern. |
| Concept selection ranking | **Owner** | — | — | Ideation Step 10. Picks winning idea. Wizard receives the winner; it does not re-rank ideas. |
| Readiness gate (5 blockers + 3 warnings) | **Owner** | — | — | ideation-readiness.ts. Quality gate for wizard handoff. This is a completeness check, not a scoring system. |
| Classification questionnaire scoring | — | **Owner** | — | Wizard Step 5. Binary/Likert answers scored against scope matrix. This is the wizard's core scoring. |
| Scope ranking by weighted matrix | — | **Owner** | — | Wizard Step 6. Scope scores computed from matrix engine. |
| Explainability (positive/negative signals) | — | **Owner** | — | Wizard Step 7. Explains which questions drove the classification result. |
| Confidence computation (spread, completeness, ambiguity) | — | **Owner** | — | Wizard Step 6. Composite metric on classification quality. |
| Winner margin and confidence gate | — | **Owner** | — | Wizard Step 8. Decision quality control on classification output. |
| Override tracking | — | **Owner** | — | Wizard Step 8. Captures when user disagrees with classification result. |
| Outcome feedback | — | **Owner** | — | Wizard Step 13. Records project execution outcome. |
| Feedback → matrix calibration | — | — | **Shared** | Feedback data originates in wizard. Calibration target is the scoring matrix. Must be a separate module (`ps.matrix-calibration.ts`), not embedded in either system. |
| Evaluation suite (benchmark cases) | — | **Owner** | — | Tests matrix accuracy. ps.evaluation.ts. |
| Scope profile / standards mapping | — | **Owner** | — | Maps scopes to PM standards/frameworks (seed data). Not a scoring function but informs what "scope" means. |
| KPI targets and actuals | — | **Owner** | — | Proposed wizard enhancement. Captures project-level metrics for outcome measurement. |

### 4.3 Boundary Integrity Rule

**No ideation scoring method should be imported into the wizard classification engine, and no wizard classification method should be exported to ideation screening.**

Rationale:
- Ideation screening evaluates **idea quality** across competing alternatives. Criteria are strategic: alignment, feasibility, novelty, impact.
- Wizard classification evaluates **scenario fit** against a fixed scope matrix. Criteria are structural: PM standards, governance requirements, delivery methodology, process maturity.
- Using a Likert scale in the wizard does not make it "the same scoring" as ideation. The Likert is a measurement instrument; the scoring domain is different.
- The only legitimate shared scoring artifact is the **calibration feedback loop**, which must be architecturally isolated as a separate module.

---

## 5. Scoring Method Fit Review

### 5.1 Method Fit Table

| Method | Use case | Fit for PS Wizard | Fit for Ideation | Decision | Rationale |
|---|---|---|---|---|---|
| **Weighted Decision Matrix** | Evaluate alternatives against weighted criteria; compute score as SUM(weight × rating) | **Primary fit** | Secondary fit | **Primary for PS Wizard** | This is exactly what the current matrix engine does. The proposed Likert upgrade converts it from a binary decision matrix to a continuous-scale weighted decision matrix. The scope matrix (32 scopes × N questions × cell weights) is a textbook weighted decision matrix. |
| **RICE** (Reach, Impact, Confidence, Effort) | Prioritise features/initiatives by composite score: (R × I × C) / E | Not a fit | Benchmark only | **Reject for PS Wizard** | RICE prioritises items in a backlog. PS Wizard classifies a scenario into a governance scope — it does not prioritise one scenario over another. RICE's "Reach" and "Effort" dimensions have no mapping to scope classification. |
| **ICE** (Impact, Confidence, Ease) | Lightweight prioritisation: I × C × E | Not a fit | Benchmark only | **Reject for PS Wizard** | Same issue as RICE: ICE is a prioritisation tool, not a classification tool. PS Wizard does not rank scenarios against each other. |
| **Pugh Matrix** (Concept Selection) | Compare alternatives against a baseline; score as Better/Same/Worse (+1/0/-1) | Benchmark only | Secondary fit | **Benchmark only for PS Wizard** | Pugh compares alternatives against a reference design. In ideation, this maps naturally to concept selection (Step 10). For wizard classification, the "alternatives" are scopes and the "criteria" are questions, but Pugh's ternary scale (+1/0/-1) is less informative than the current weighted cell approach. The wizard already has a richer scoring model. Pugh is useful only as a conceptual benchmark: "if scores were simpler, this is how it would look." |
| **Stage-Gate** | Governance checkpoints (go/kill/hold/recycle) at predefined milestones | Secondary fit | Not applicable | **Secondary fit for PS Wizard** | Stage-Gate is not a scoring method per se — it is a process governance model. However, the proposed **confidence gate** (D-15) is a Stage-Gate concept: the classification result must pass a confidence threshold before proceeding. The wizard lifecycle already has a gate structure (DRAFT → SUBMITTED → VALIDATED). Adding a confidence gate at the scoring step is a Stage-Gate application. |
| **Delphi Method** | Structured expert consensus through iterative rounds of anonymous scoring | Secondary fit | Not applicable | **Secondary fit for PS Wizard** | The proposed **multi-evaluator mode** (D-11) is Delphi-inspired: multiple users independently score, scores are aggregated, variance is flagged, and outliers may trigger discussion. This is a valid approach for high-stakes classification where a single evaluator's answers might be biased. However, full Delphi (iterative rounds with feedback) is over-engineered for a scope classification wizard. A single-round parallel scoring with variance analysis is sufficient. |
| **SHAP/LIME-style explainability** | Post-hoc attribution of model output to input features | Secondary fit | Not applicable | **Secondary fit for PS Wizard** | SHAP and LIME are designed for black-box ML models where the contribution of each feature to the prediction is not directly observable. The PS Wizard matrix engine is a **fully transparent deterministic model** — every contribution is algebraically derivable from the formula. Calling it "SHAP-style" is a metaphor, not a technical necessity. What is actually needed is **per-question contribution display**: for each question, show `normalised × weight × scope_affinity = contribution_to_winner_score`. This is direct algebraic decomposition, not SHAP. The term "SHAP-style" should be understood as a UX pattern (horizontal bars showing feature contributions), not as a method requiring Shapley value computation. |

### 5.2 Method Fit Summary

| Method | PS Wizard Decision | Ideation Decision |
|---|---|---|
| Weighted Decision Matrix | **Primary fit** | Secondary fit |
| RICE | **Reject** | Benchmark only |
| ICE | **Reject** | Benchmark only |
| Pugh Matrix | Benchmark only | Secondary fit |
| Stage-Gate | Secondary fit (confidence gate) | Not applicable |
| Delphi | Secondary fit (multi-evaluator) | Not applicable |
| SHAP/LIME | Secondary fit (UX pattern only) | Not applicable |

---

## 6. Explainability and Confidence Review

### 6.1 Current Explainability

Source: `ps.explainability.ts`, `PSWizardPage.tsx:529–570`.

| Element | Current state | Assessment |
|---|---|---|
| Positive signals | List of questions where winner scope gained weight | **Correct but incomplete.** Shows which questions helped, but not by how much (weight is computed but not displayed). |
| Negative signals | List of questions where runner-up gained more than winner | **Correct but incomplete.** Same issue: relative weight advantage is computed but not shown. |
| Winner margin | `score[#1] - score[#2]`, displayed as integer | **Correct and useful.** Directly communicates decision strength. |
| Per-question attribution | `ExplainabilitySignal.weight` field carries the numeric contribution | **Available in data, not in UI.** The engine computes it; the frontend ignores it. |
| Contribution direction | Positive (for winner) or negative (for competitor) | **Available in data, not in UI.** Shown as separate text lists, not as a unified attribution chart. |

### 6.2 Proposed Explainability

| Element | Proposed state | Dependency | Effort |
|---|---|---|---|
| Per-question numeric contribution bars | Horizontal bar chart showing each question's point contribution to the winning scope | None — can use current engine output (`ExplainabilitySignal.weight`) | **Low.** Data already exists. UI-only change. |
| Combined positive/negative view | Single chart with bars going left (competitor-favoring) and right (winner-favoring) | None | **Low.** Data already exists in positive/negative signal arrays. |
| Contribution percentage | Show each question's contribution as % of total winner score | None | **Low.** `weight / totalWinnerScore × 100`. |
| "Why not" explanation for non-winners | For each top-3 scope, show which questions it lacked vs winner | None | **Medium.** Requires iterating all questions and comparing cell weights per scope. Algebraically simple but UI needs design. |

**Key finding:** Explainability does not depend on the Likert upgrade. The current binary-weighted engine already produces per-question contribution data. The UI simply does not display it. The first explainability improvement — showing numeric bars — can be implemented immediately with no scoring formula change.

### 6.3 Current Confidence Model

Source: `ps.confidence.ts`.

| Pillar | Formula | Weight | Assessment |
|---|---|---|---|
| Completeness | `matchedQuestions / totalQuestions` | 30% | **Reasonable.** Measures input coverage. Binary: you answered it or you didn't. Under Likert, this should change to "questions with non-neutral answers" (e.g., answer ≠ 3). |
| Spread | `stddev(scores) / maxPossibleScore` | 30% | **Reasonable but sensitive.** With 32 scopes, most will score low, creating high natural spread. This pillar will almost always score well, reducing its discriminating power. |
| Ambiguity | `1 - (margin / maxPossibleScore)` | 40% | **Correctly weighted as dominant.** The margin between #1 and #2 is the most actionable confidence signal. |
| Overall | `0.30 × completeness + 0.30 × spread + 0.40 × (1-ambiguity)` | — | **Structurally sound.** But the output (0.0–1.0 float) is not actionable without threshold-based governance. |

### 6.4 Confidence and Override Table

| Element | Current state | Proposed state | Governance recommendation |
|---|---|---|---|
| Confidence score output | 0.0–1.0 float, displayed as-is | Same computation with updated completeness definition for Likert | Display as label: "High" / "Medium" / "Low" in addition to numeric value. Raw float is useful for analytics but opaque to users. |
| Confidence gate | **None.** All confidence levels proceed to creation. | High (margin ≥15): auto-proceed. Medium (8–14): require reviewer note. Low (<8): block auto-creation, mandate escalation. | **Implement immediately.** This is the single highest-value governance addition. Configurable thresholds, not hardcoded. Store thresholds in matrix configuration (per matrix version). |
| Confidence gate bypass | N/A | Not specified in proposal | Must require admin-level override with reason. Bypass must be logged in override table with `bypassType: "confidence_gate"`. |
| Winner margin display | Absolute integer in UI | Same, with color coding: green (≥15), yellow (8–14), red (<8) | **Implement immediately.** Pure UI change using existing data. |
| Override capture | Recommended scope, overridden scope, reason (text), confidence, matrix version, answers JSON | Same structure with added fields: `overrideType` (enum: scope_override, confidence_bypass), `reviewerNote` | Extend `psWizardOverrides` table. Distinguish between scope overrides and confidence gate bypasses. |
| Override → calibration queue | **Not connected.** Data stored, never read by scoring engine. | Overrides feed calibration queue (proposed D-16/D-20) | Implement as separate module. Each override creates a calibration event. Human reviewer decides whether to adjust cell weights. |
| Override rate monitoring | All-time and 30-day rates computed. Scope→scope patterns tracked. | Same + alerting: flag when override rate > 20% for any scope pair | Add threshold-based alerting. High override rate for a specific scope suggests matrix weights need recalibration. |
| Multi-evaluator variance | N/A | When multiple evaluators score, compute inter-rater variance per question | Variance > 2 on a Likert question (e.g., one rates 1, another rates 4) should flag that question for discussion before finalising. |

---

## 7. Governance Review

### 7.1 Winner Margin Usage

| Governance concern | Current state | Recommended state |
|---|---|---|
| Margin computation | `score[#1] - score[#2]`, integer | No change to computation |
| Margin meaning | Displayed as a number with no governance interpretation | Must be interpreted via configurable thresholds |
| Margin thresholds | None | High confidence: margin ≥ T_high (default 15). Medium: T_low ≤ margin < T_high (default 8–14). Low: margin < T_low (default 8). Thresholds stored per matrix version. |
| Margin action: High | Auto-proceed to project creation | No change. Classification is decisive. |
| Margin action: Medium | Auto-proceed (current, no distinction) | Require reviewer acknowledgment note before proceeding. Note stored in wizard run trace. |
| Margin action: Low | Auto-proceed (current, no distinction) | **Block auto-creation.** Mandatory escalation: manual scope selection by authorized reviewer or senior evaluator. Decision logged as override with `overrideType: "low_confidence_escalation"`. |

### 7.2 Confidence Thresholds

| Threshold | Value (configurable default) | Action | Override allowed? |
|---|---|---|---|
| High confidence | Margin ≥ 15 pts | Auto-proceed | N/A — no restriction to override |
| Medium confidence | 8 ≤ margin < 15 pts | Proceed with mandatory reviewer note | Yes, but note is required and logged |
| Low confidence | Margin < 8 pts | Block auto-creation; escalate to authorized reviewer | Yes, but requires admin-level authorization and structured override record |

### 7.3 Low-Confidence Escalation

When margin < T_low:
1. UI displays red "Low Confidence" banner with explanation: "The top two scopes scored within X points of each other. Manual review is required."
2. Creation button is disabled.
3. An "Escalate for Review" action is available, which:
   a. Creates a pending escalation record (new `psWizardEscalations` table).
   b. Assigns to a designated reviewer (configurable per workspace).
   c. The reviewer can: (i) confirm the recommended scope, (ii) select an alternative scope with reason, or (iii) request re-evaluation with additional context.
4. Once resolved, the wizard proceeds with the reviewer's decision recorded in the audit trail.

### 7.4 Override Handling

| Override scenario | Trigger | Required input | Governance control |
|---|---|---|---|
| User disagrees with recommended scope (any confidence) | User enters override reason in Step 8 | Override reason (text, min 20 chars), alternative scope selection | Override recorded with: recommended scope, overridden scope, reason, confidence at time of override, matrix version, full answers JSON. Override creates calibration event. |
| Low-confidence escalation resolved | Reviewer resolves escalation | Reviewer decision + reason | Reviewer identity recorded. Decision creates both an override record and an escalation resolution record. |
| Confidence gate bypass | Admin overrides low-confidence block | Admin authorization + reason (text, min 50 chars) | Bypass recorded with `overrideType: "confidence_gate_bypass"`. Creates high-priority calibration event. |

### 7.5 Calibration Approval Rules

### 7.5.1 Calibration Table

| Calibration input | Value | Governance control | Recommendation |
|---|---|---|---|
| Override event | Each override (scope disagreement) | Auto-creates calibration event with `source: "override"` | Events queued, not auto-applied. Human review required. |
| Feedback outcome | success/partial/failed/cancelled per project | Auto-creates calibration event with `source: "feedback"` when outcome ≠ expected | Events queued. Only "failed" and "cancelled" outcomes are actionable. |
| KPI delta (proposed) | Actual vs target KPIs at project close-out | Auto-creates calibration event with `source: "kpi_delta"` when delta > threshold | Threshold configurable per KPI type. |
| Evaluation suite regression | Eval case that previously passed now fails after a weight change | **Must block weight application** | Calibration weight changes must pass evaluation suite before activation. If a change causes regression, it requires explicit admin approval. |
| Batch calibration | Accumulated events > threshold (e.g., 10 events for one scope pair) | Auto-flag for batch review | Reviewer sees all events, proposes weight adjustment, runs eval suite, and activates if suite passes. |

### 7.5.2 Calibration Workflow

```
Event occurs (override, feedback, KPI delta)
        │
        ▼
Calibration event created (queued, status: pending)
        │
        ▼
Reviewer opens calibration dashboard
        │
        ├─ Reviews accumulated events per scope
        │
        ├─ Proposes weight adjustment (specific cells)
        │
        ├─ Runs evaluation suite against proposed weights (dry-run)
        │
        ├─ Suite passes? → Apply to new draft matrix version → Activate
        │
        └─ Suite fails? → Require explicit admin override with rationale
                          OR reject the proposed adjustment
```

### 7.5.3 Calibration Governance Rules

1. **No automatic weight changes.** All calibration adjustments require human review and approval.
2. **Evaluation suite must pass.** Any weight change that causes a previously passing benchmark case to fail requires explicit admin override with documented rationale.
3. **Versioned changes.** Calibration creates a new matrix version (draft), not an in-place modification of the active version.
4. **Audit trail.** Every calibration action (propose, approve, reject, apply) is logged with actor, timestamp, before/after weights, and evaluation suite results.
5. **Cool-down period.** After a calibration version is activated, a minimum 14-day observation period is required before the next calibration cycle begins (configurable).

---

## 8. Recommended Scoring Direction

### 8.1 Phased Approach

The scoring upgrade must be phased to manage risk, ensure backward compatibility, and deliver value incrementally. The phases map to WS2's implementation path.

#### Phase A: Governance Gate + Explainability Display (Immediate — No Formula Change)

| Action | Effort | Impact | Dependency |
|---|---|---|---|
| Implement confidence gate (margin thresholds) | Low | **Critical** | None |
| Display per-question numeric contribution bars (use existing ExplainabilitySignal.weight) | Low | High | None |
| Add winner margin color coding (green/yellow/red) | Trivial | Medium | None |
| Structured override capture (add overrideType, reviewerNote fields) | Low | Medium | None |

**Rationale:** These improvements use existing engine data and require no scoring formula change. They deliver the highest governance value per unit of effort. The confidence gate alone prevents the most dangerous failure mode: low-margin auto-decisions.

#### Phase B: Likert Scale + Per-Question Weights (After Phase A)

| Action | Effort | Impact | Dependency |
|---|---|---|---|
| Replace binary Yes/No with Likert 1–5 UI component | Medium | High | Phase A complete |
| Add `questionWeight` column to matrix questions table (default 1.0) | Low | Medium | None |
| Update `computeScores()` to: `(answer/5) × cell_weight × q_weight` | Medium | High | Likert UI + question weight column |
| Update confidence completeness to: "non-neutral answers (≠ 3)" | Low | Low | Likert adoption |
| Backward compatibility: existing projects retain binary scores in their stored `answersJson` | Low | Critical | Must be implemented alongside Likert change |
| Admin UI for question weight editing | Medium | Medium | Question weight column |

**Rationale:** Likert and per-question weights are coupled changes — Likert without weights loses the benefit (all answers scale equally), and weights without Likert are limited (binary × weight still only produces 0 or weight). Implement together.

#### Phase C: Dimension Weights + Calibration Infrastructure (After Phase B)

| Action | Effort | Impact | Dependency |
|---|---|---|---|
| Add `dimensionWeight` column to matrix dimensions table (default 1.0) | Low | Medium | None |
| Map questions to dimensions (use existing `dimensionId` on question presentations) | Medium | Medium | Question-dimension mapping |
| Update scoring formula to include dimension weight | Low | Medium | Dimension weight column + mapping |
| Create `ps.matrix-calibration.ts` module | High | High | Phase B scoring formula |
| Create calibration event schema (`psCalibrationEvents` table) | Medium | Medium | None |
| Create calibration review UI | High | Medium | Calibration module |
| Connect override → calibration event creation | Low | Medium | Calibration event schema |
| Connect feedback → calibration event creation | Low | Medium | Calibration event schema |

#### Phase D: Multi-Evaluator + Advanced Features (Post-Phase C)

| Action | Effort | Impact | Dependency |
|---|---|---|---|
| Multi-evaluator scoring (invitation, parallel sessions, aggregation) | High | Medium | Phase B Likert adoption |
| KPI baseline targets at Accept step | Low | Medium | None |
| KPI actuals at Feedback step | Low | Medium | KPI targets |
| KPI delta → calibration event | Low | Medium | Calibration infrastructure |

### 8.2 What PS Wizard Should Use

| Scoring capability | Recommended | Phase |
|---|---|---|
| **Primary scoring engine** | Weighted decision matrix with Likert 1–5 inputs | Current: binary. Target: Phase B. |
| **Confidence model** | Current three-pillar composite (completeness, spread, ambiguity) with governance thresholds | Current: computed but ungoverned. Target: Phase A adds thresholds. |
| **Confidence gate** | Margin-based thresholds (configurable per matrix version) | **Phase A — implement immediately.** |
| **Explainability** | Per-question numeric contribution bars (algebraic decomposition, not SHAP) | Current: text lists. Target: Phase A adds bars. |
| **Override governance** | Structured capture with type classification and calibration event generation | Current: partial. Target: Phase A + Phase C. |
| **Calibration** | Human-reviewed, evaluation-suite-gated weight adjustments via versioned matrix | Not implemented. Target: Phase C. |
| **Multi-evaluator** | Single-round parallel scoring with variance analysis (simplified Delphi) | Not implemented. Target: Phase D. |

### 8.3 What Should Remain External or Upstream

| Capability | Owner | Reason |
|---|---|---|
| Idea screening scoring (criteria-based filtering) | PS Ideation | Evaluates idea quality, not scope classification. Different scoring domain. |
| Feasibility rating (H/M/L) | PS Ideation | Quick checks per idea, not matrix-based classification. |
| Concept selection ranking | PS Ideation | Picks the winning idea. Wizard receives the result, does not re-rank. |
| RICE/ICE prioritisation | **Neither** (external PM tool concern) | Prioritises backlog items. Not classification. Not ideation screening. |
| Pugh matrix comparison | Ideation (benchmark) | Useful as conceptual benchmark for concept selection. Not a classification tool. |
| Full Delphi (iterative rounds) | **External** | Over-engineered for classification. Single-round parallel scoring is sufficient. |
| SHAP/LIME computation | **External/Reject** | The matrix engine is fully transparent. Shapley values are unnecessary. Use direct algebraic decomposition instead. |
| Rule-based classifier (ps.classifier.ts) | **Legacy/fallback** | Maintained as fallback but not part of the wizard scoring path. Should be deprecated once matrix engine covers all scenarios. |

### 8.4 Final Position

The PS Wizard scoring architecture should be upgraded along a **Weighted Decision Matrix** backbone — from its current binary-input variant to a Likert-input, multi-weight variant with governance gates.

The most impactful immediate change is **not** the Likert upgrade — it is the **confidence gate**. A system that already computes confidence but never acts on it is architecturally incomplete. Adding the gate requires no formula change and delivers immediate governance value.

The Likert upgrade is architecturally sound but must be coupled with per-question weights and backward compatibility. It should follow the confidence gate, not precede it.

Explainability improvements should start by **displaying data that already exists** (ExplainabilitySignal.weight) before introducing new computation methods. The engine already computes per-question contributions; the UI simply hides them.

The calibration feedback loop is the most complex addition and must be designed as an independent module, not embedded in wizard step handlers. It requires the evaluation suite as a safety gate to prevent regression.

---

## 9. Acceptance Check

| Criterion | Status | Evidence |
|---|---|---|
| Current scoring and proposed scoring are clearly separated | **PASS** | Section 2 documents current state from verified source code. Section 3 documents proposed state from design documents. Tables use "Current state" vs "Proposed state" columns. |
| Each benchmark method receives an explicit fit decision | **PASS** | Section 5 evaluates 7 methods (Weighted Decision Matrix, RICE, ICE, Pugh, Stage-Gate, Delphi, SHAP/LIME) with explicit Primary/Secondary/Benchmark/Reject decisions per method. |
| Confidence is addressed | **PASS** | Section 6.3 (current model), Section 6.4 (proposed thresholds), Section 7.2 (governance thresholds), Section 7.3 (low-confidence escalation). |
| Overrides are addressed | **PASS** | Section 6.4 (Confidence and Override Table), Section 7.4 (Override handling with 3 scenarios). |
| Explainability is addressed | **PASS** | Section 6.1 (current), Section 6.2 (proposed), Section 8.3 (SHAP/LIME rejection for direct algebraic decomposition). |
| Calibration is addressed | **PASS** | Section 7.5 (Calibration Table, Workflow, Governance Rules). |
| Final recommendation makes clear what PS Wizard should use and what should remain external | **PASS** | Section 8.2 (what wizard should use: 7 capabilities mapped to phases) and Section 8.3 (what should remain external: 7 capabilities with owners and reasons). |
| Idea-management scoring and wizard classification scoring are separated | **PASS** | Section 4 (full domain split table with 15 entries, each assigned to Ideation, Wizard, or Shared). |
| No unverified engine internals presented as confirmed fact | **PASS** | All current-state claims cite specific source files and line numbers. Proposed-state claims cite design documents and WS2 disposition register. Verification status column in Section 2.3 distinguishes "Verified" (from code) from proposals. |
| Methods rejected where they do not fit | **PASS** | RICE: Reject. ICE: Reject. SHAP/LIME: Reject (as computation method; accepted as UX pattern). Full Delphi: Reject (simplified single-round accepted). |

**Document status: COMPLETE.**
