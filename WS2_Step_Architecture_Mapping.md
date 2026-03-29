# Workstream 2 — Step Architecture Mapping

**Author:** Senior Workflow Architect & Product Systems Analyst
**Date:** 2026-03-29
**Inputs:** PSWizardPage.tsx (implementation truth), ps_wizard_analysis.md, ps_wizard_design_suggestion.md, PS-Ideation-Workflow-Diagram.md, server-side PS module files (ps.classifier.ts, ps.matrix-engine.ts, ps.explainability.ts, ps.confidence.ts, ps.lifecycle.ts, ps.project.ts, ps.validation.ts)

---

## 1. Purpose

This document maps the structural architecture of three systems:

1. **The current 13-step PS Wizard** — as implemented in `PSWizardPage.tsx` and verified against server-side code.
2. **The proposed 10-step redesign** — as described in `ps_wizard_design_suggestion.md`.
3. **The upstream 11-step PS Ideation workflow** — as documented in `PS-Ideation-Workflow-Diagram.md` and implemented in the PSIdeation module.

The objective is to determine which proposed changes belong inside PS Wizard, which belong upstream in PS Ideation, and which should be deferred or rejected — ensuring the boundary between ideation (idea discovery, evaluation, concept selection) and classification/commit (scenario classification into a PS scope, project creation, lifecycle) is never violated.

**Key architectural principle:** PS Ideation answers "What should we do?" PS Wizard answers "How should we classify and govern it?" These are distinct concerns. Merging them creates a system that tries to do everything and does nothing well.

---

## 2. Current Step Inventory

Source: `PSWizardPage.tsx` lines 39–53 (STEP_LABELS), lines 121–165 (canGoNext + navigation), lines 169–258 (handlers), lines 266–896 (rendering).

| # | Current Step | Purpose | Phase | Current Status |
|---|-------------|---------|-------|----------------|
| 1 | Scenario | Free-text textarea (≤5000 chars) describing the project scenario | Intake | **Implemented.** Validation: `scenario.trim().length > 0`. No guided template. |
| 2 | Context | Structured fields: Business Unit, Region, Strategic Importance, Existing Situation | Intake | **Implemented.** No required fields — `canGoNext` always true for step 2 (line 123). |
| 3 | NLP Analysis | Displays DB-driven classification dimensions from active matrix; shows scenario preview and extracted context signals | Intake | **Implemented.** No AI call — purely informational display of `matrixData.dimensions`. No user action required. |
| 4 | Auto Name | Derives project name from first sentence of scenario (≤80 chars via `deriveProjectName`); user-editable | Intake | **Implemented.** Naive heuristic: split on `.!?\n`, take first segment, truncate at word boundary. |
| 5 | Questions | Renders DB-driven Yes/No binary questions from active matrix version | AI Scoring | **Implemented.** Binary toggle buttons per question. Clicking "Classify" triggers `handleRunClassification()`. |
| 6 | Scoring | Displays Top 3 ranked scopes with scores, relative bar charts, winner margin, confidence label | AI Scoring | **Implemented.** Data comes from `classifyScenario` mutation result. |
| 7 | Explainability | Lists positive contributors and negative/missing contributors from classification result | AI Scoring | **Implemented.** Displays `recommendation.explainability.positiveContributors` and `negativeContributors` as text lists. No numeric attribution. |
| 8 | Recommendation | Shows recommended scope (label + code + matrix version); offers optional override textarea | Decision | **Implemented.** Override reason stored in local state; displayed in Accept step and persisted if provided. |
| 9 | Accept | Full summary review: name, scenario preview, BU/region, selected scope, confidence, matrix version, questions answered, decision trace, override reason | Decision | **Implemented.** Decision trace is a machine-readable audit string. No e-signature. |
| 10 | Create PS Project | Calls `trpc.ps.projects.create` with full payload; stores wizard run trace + creates project in DRAFT status | Lifecycle | **Implemented.** Navigation locked after this step (`prevStep` disabled for step > 10). Template bundle resolved server-side via `resolveTemplateBundle()`. |
| 11 | Validation | Displays project status badge; "Submit for Validation" button calls `trpc.ps.lifecycle.submit` (DRAFT → SUBMITTED) | Lifecycle | **Implemented.** Shows validation note if present. Single-reviewer model. |
| 12 | PM Central | Displays project status and PM project ID; "Send to PM Central" button calls `trpc.ps.lifecycle.sendToPM` | Lifecycle | **Implemented.** Blocked if project is still DRAFT. Transitions to SENT_TO_PM. |
| 13 | Feedback | Records outcome (success/partial/failed/cancelled) + optional notes via `trpc.ps.feedback.create`; "Skip & Go to List" option | Lifecycle | **Implemented.** Outcomes stored but not used for matrix retraining. Navigates to `/ps/list` on completion. |

**Server-side lifecycle state machine** (from `ps.lifecycle.ts`):
```
DRAFT → SUBMITTED → VALIDATED → PUBLISHED
                               → SENT_TO_PM
                  → REJECTED
```

---

## 3. Proposed Step Inventory

Source: `ps_wizard_design_suggestion.md`, Part 1 — Step mapping table and step-by-step design specification.

| # | Proposed Step | Purpose | Source (replaces) | Notes |
|---|--------------|---------|-------------------|-------|
| 1 | Scenario + Context | Merge steps 1+2 into single form with collapsible sections | Old steps 1+2 | Adds guided scenario template, auto-tagging suggestion, scenario completeness indicator. At least one context field now required. |
| 2 | NLP + Smart Name | Merge steps 3+4; NLP extraction and LLM-generated title displayed on one review screen | Old steps 3+4 | Replaces `deriveProjectName` heuristic with LLM call. Adds NLP confidence display per dimension. Adds user-editable dimension values. |
| 3 | Smart Questionnaire | Replace binary Yes/No with Likert 1–5 scale; per-question weights; adaptive branching | Old step 5 | **Major scoring change** — deferred to Workstream 3 for deep analysis. |
| 3b | Multi-evaluator (optional) | Parallel scoring by multiple users with averaged scores | **New capability** | Delphi-inspired. Requires new server infrastructure (invitation system, score aggregation, variance display). |
| 4 | Weighted Matrix Engine | Likert-normalised scoring (0.0–1.0); Impact-Effort quadrant view | Old step 6 | **Scoring engine change** — deferred to Workstream 3. |
| 5 | XAI Explainability | SHAP-style numeric contribution bars replacing text lists | Old step 7 | **Scoring presentation change** — deferred to Workstream 3. |
| 6 | Recommendation + Confidence Gate | Adds automatic low-confidence escalation based on winner margin thresholds | Old step 8 | **New capability**: blocks auto-creation when margin < 8 pts. Adds mandatory reviewer note for medium confidence. |
| 7 | Accept + Confirm | Adds KPI baseline targets at confirmation | Old step 9 | KPI fields: cost savings, time reduction, revenue impact, delivery timeline, primary success metric. |
| 8 | Create Project | Unchanged project creation | Old step 10 | Adds `kpiTargets` and `shapContributions` to payload. |
| 9 | Validate + Multi-reviewer | Parallel multi-reviewer with SLA tracking | Old step 11 | 1–3 reviewers, structured pass/fail/request-changes per reviewer, SLA timer with auto-escalation. |
| 10 | PM Handoff + Outcomes → Retrain | Merges PM handoff and feedback; captures KPI actuals; outcome feeds matrix calibration queue | Old steps 12+13 | **New capability**: feedback loop → matrix weight calibration. |

---

## 4. Upstream Ideation Boundary Inventory

Source: `PS-Ideation-Workflow-Diagram.md`, `PSIdeationPage.tsx`, `ideation-readiness.ts`, `ideation-conversion.ts`.

The PS Ideation module is a complete 11-step workflow that runs **before** the PS Wizard. Its output is a ConceptPackage handed off via the readiness engine. The wizard must not absorb ideation responsibilities.

| # | Ideation Responsibility | Why It Is Upstream | Related Source |
|---|------------------------|--------------------|----------------|
| I-1 | Context of the Project (drivers, triggers, need) | Ideation step 1. Defines why a project is needed. PS Wizard receives a ready scenario — it does not discover the need. | `ContextDefinitionToolPanel`, `ContextTranslatorPanel` |
| I-2 | Problem Definition (what is not working, who is impacted, consequences) | Ideation step 2. Problem framing is idea-stage work, not classification. | `ProblemDefinitionToolPanel` |
| I-3 | Opportunity Definition (what could be improved, value, strategic advantage) | Ideation step 3. Opportunity framing precedes any scoring. | `OpportunityDefinitionToolPanel` |
| I-4 | Guiding "What If?" Question | Ideation step 4. Creative prompt that guides divergent thinking. | `GuidingWhatIfToolPanel` |
| I-5 | Idea Generation (brainstorming, idea list) | Ideation step 5. Divergent idea creation. Not a wizard concern. | `IdeaGenerationToolPanel`, `psIdeationIdeas` table |
| I-6 | Idea Clustering & Theming | Ideation step 6. Grouping and pattern recognition across ideas. | `ClusteringAndThemingToolPanel`, `psIdeationThemes` table |
| I-7 | Initial Screening (criteria-based filtering) | Ideation step 7. Evaluates ideas against screening criteria. | `InitialScreeningToolPanel`, `psIdeationScreeningScores` table |
| I-8 | Scenario Exploration ("What if" scenarios per idea) | Ideation step 8. Explores implications of top ideas. | `ScenarioExplorationToolPanel`, `psIdeationScenarios` table |
| I-9 | Quick Feasibility Checks | Ideation step 9. Technical/resource/timeline feasibility per idea. | `FeasibilityCheckToolPanel`, `psIdeationFeasibilityChecks` table |
| I-10 | Concept Selection (pick winning idea + rationale) | Ideation step 10. Selects the concept to pursue. | `ConceptSelectionToolPanel` |
| I-11 | One-Page Summary | Ideation step 11. Executive summary of ideation outcome. | `OnePageSummaryToolPanel` |
| I-H | Readiness Check + ConceptPackage + Handoff | Boundary layer. Evaluates 5 blockers + 3 warnings. Produces ConceptPackage for wizard consumption. Lifecycle: `concept_selected → ready_for_wizard → converted`. | `ideation-readiness.ts`, `ideation-conversion.ts`, `PSIdeationConvertPage.tsx` |

**Critical boundary rule:** The ConceptPackage is the formal contract between Ideation and Wizard. Any capability that belongs to idea discovery, idea evaluation, or concept selection belongs upstream. The wizard receives a selected concept and classifies it into a PS scope.

---

## 5. Current-to-Proposed Step Transition Matrix

| Current Step(s) | Proposed Step | Responsibility Change | Boundary Risk | Notes |
|----------------|---------------|----------------------|---------------|-------|
| 1 (Scenario) + 2 (Context) | P1: Scenario + Context | **Merged.** Two screens → one form with collapsible sections. | None | Pure UX consolidation. No responsibility shift. |
| — | P1 addition: Guided scenario template | **Introduced.** Optional prompt pattern for richer descriptions. | **LOW — monitor.** Guided templates could overlap with Ideation Step 1 (Context of the Project). If templates ask "What is the problem? Who is affected?" this duplicates Ideation Steps 1–3. | Must be scoped to scenario description quality, not problem/opportunity discovery. |
| — | P1 addition: Auto-tagging suggestion | **Introduced.** NLP pre-classifies keywords and suggests tags as user types. | None | Tags are classification metadata, appropriate for wizard. |
| — | P1 addition: Scenario completeness indicator | **Introduced.** Heuristic quality score (word count, field coverage). | None | Input quality feedback. Appropriate for wizard. |
| 3 (NLP) + 4 (Auto Name) | P2: NLP + Smart Name | **Merged.** Two screens → one review screen. | None | Pure UX consolidation. |
| — | P2 upgrade: LLM-generated title | **Improved.** Replaces `deriveProjectName` heuristic with LLM call. | None | Better naming. No boundary issue. |
| — | P2 addition: NLP confidence per dimension | **Introduced.** Shows confidence score per extracted dimension. | None | Classification metadata. Appropriate for wizard. |
| — | P2 addition: Editable dimension values | **Introduced.** Users can correct/add dimension values before questionnaire. | None | Allows human correction of NLP extraction. Appropriate. |
| 5 (Questions) | P3: Smart Questionnaire | **Upgraded.** Binary → Likert 1–5, per-question weights, adaptive branching. | None | **Scoring change — Workstream 3 scope.** Step structure is the same; input granularity changes. |
| — | P3b: Multi-evaluator (optional) | **Introduced.** Parallel scoring by multiple users. | None | New infrastructure (invitation, aggregation). Appropriate for wizard classification. |
| 6 (Scoring) | P4: Weighted Matrix Engine | **Upgraded.** Binary scoring → Likert-normalised scoring. Impact-Effort quadrant. | None | **Scoring change — Workstream 3 scope.** |
| 7 (Explainability) | P5: XAI Explainability | **Upgraded.** Text contributor lists → SHAP-style numeric bars. | None | **Scoring presentation change — Workstream 3 scope.** |
| 8 (Recommendation) | P6: Recommendation + Confidence Gate | **Upgraded.** Adds mandatory confidence gate that blocks low-margin decisions. | None | New decision logic. Appropriate for wizard. |
| 9 (Accept) | P7: Accept + Confirm | **Upgraded.** Adds KPI baseline target fields. | **LOW — monitor.** KPI target capture at accept time is appropriate. But if KPIs are also tracked in Ideation (feasibility checks), ensure no duplication. | KPIs here are project-level targets, not idea-level feasibility. Distinct concern. |
| 10 (Create) | P8: Create Project | **Unchanged** with minor payload additions (`kpiTargets`, `shapContributions`). | None | No structural change. |
| 11 (Validation) | P9: Validate + Multi-reviewer | **Upgraded.** Single reviewer → 1–3 parallel reviewers with SLA timer. | None | Process improvement. Appropriate for wizard lifecycle. |
| 12 (PM Central) + 13 (Feedback) | P10: PM Handoff + Outcomes → Retrain | **Merged + Upgraded.** Adds KPI actuals capture, outcome-weighted retraining signal, matrix calibration queue. | **MEDIUM — watch.** Matrix retraining is a system-level concern that spans multiple wizard runs. Must be implemented as a separate calibration module, not embedded in step 10's UI handler. | The feedback-to-retrain loop is architecturally sound but must be a background queue, not a synchronous step action. |

---

## 6. Boundary Assignment Table

Every responsibility from both the current wizard and the proposed redesign is assigned to exactly one owner.

| # | Responsibility | Recommended Owner | Reason |
|---|---------------|-------------------|--------|
| B-1 | Problem discovery and framing | **PS Ideation** | Ideation Steps 1–3 own this. The wizard receives a pre-framed scenario. |
| B-2 | Opportunity identification | **PS Ideation** | Ideation Step 3. Not a classification concern. |
| B-3 | Idea generation and brainstorming | **PS Ideation** | Ideation Step 5. Divergent thinking is upstream of classification. |
| B-4 | Idea screening and filtering | **PS Ideation** | Ideation Step 7. Screening criteria are ideation-level, not wizard-level. |
| B-5 | Concept selection | **PS Ideation** | Ideation Step 10. The wizard does not choose which concept to pursue. |
| B-6 | Scenario text capture | **PS Wizard** | Step 1. The wizard needs a scenario to classify. When coming from Ideation, this is pre-populated from the ConceptPackage. |
| B-7 | Organizational context capture | **PS Wizard** | Step 2. Business Unit, Region, Strategic Importance are classification inputs, not ideation outputs. |
| B-8 | Guided scenario template | **PS Wizard** (with constraint) | Appropriate if scoped to "help the user describe the scenario clearly." Must NOT duplicate Ideation's problem/opportunity/context discovery. Template prompts like "What is the problem?" cross the boundary — use "Describe the project situation" instead. |
| B-9 | NLP dimension extraction | **PS Wizard** | Step 3. Dimensions are classification constructs tied to the scoring matrix. |
| B-10 | Project name generation | **PS Wizard** | Step 4. Naming is a wizard output artifact. |
| B-11 | Classification questionnaire | **PS Wizard** | Step 5. Binary or Likert — this is the wizard's core scoring input. |
| B-12 | Multi-evaluator scoring | **PS Wizard** | Proposed Step 3b. Multiple evaluators assess classification fit, not idea quality. |
| B-13 | Weighted matrix scoring engine | **PS Wizard** | Step 6. Core classification logic. |
| B-14 | Explainability reporting | **PS Wizard** | Step 7. Explains classification result. |
| B-15 | Scope recommendation | **PS Wizard** | Step 8. The wizard's primary output. |
| B-16 | Confidence gate (auto-escalation) | **PS Wizard** | Proposed Step 6. Decision quality control within classification. |
| B-17 | Override capture and audit | **PS Wizard** | Step 8. Overrides are classification-level decisions. |
| B-18 | Accept / decision trace | **PS Wizard** | Step 9. Audit trail for classification decision. |
| B-19 | KPI baseline targets | **PS Wizard** | Proposed Step 7. Project-level targets set at commit time. Distinct from Ideation feasibility checks (idea-level). |
| B-20 | Project creation with template bundle | **PS Wizard** | Step 10. Creates the formal PS project record. |
| B-21 | Validation / review workflow | **PS Wizard** | Step 11. Post-creation governance. |
| B-22 | PM Central handoff | **PS Wizard** | Step 12. Lifecycle transition. |
| B-23 | Outcome feedback capture | **PS Wizard** | Step 13. Records project execution result. |
| B-24 | Matrix weight retraining from feedback | **Shared — requires explicit architecture** | Proposed Step 10 addition. The feedback data originates in PS Wizard (B-23), but the retraining target is the scoring matrix used across all wizard runs. This must be a **separate calibration module** (e.g., `ps.matrix-calibration.ts`) that reads feedback data and proposes weight changes for human review. It must NOT be embedded as a synchronous action in the wizard step handler. |
| B-25 | Readiness evaluation + ConceptPackage | **Shared — explicit handoff** | The readiness engine (`ideation-readiness.ts`) runs in Ideation context. The ConceptPackage is consumed by the wizard. The handoff is already well-implemented via `PSIdeationConvertPage.tsx`. |
| B-26 | Auto-tagging suggestion at intake | **PS Wizard** | Proposed P1 addition. Tags classify the scenario, not the idea. |
| B-27 | Scenario completeness indicator | **PS Wizard** | Proposed P1 addition. Input quality feedback for classification. |
| B-28 | NLP confidence per dimension | **PS Wizard** | Proposed P2 addition. Classification metadata. |
| B-29 | Editable dimension values | **PS Wizard** | Proposed P2 addition. Human correction of classification inputs. |
| B-30 | SLA-tracked multi-reviewer validation | **PS Wizard** | Proposed P9 enhancement. Post-creation governance improvement. |

---

## 7. Step Disposition Register

| # | Step / Capability | Current State | Proposed Redesign | Recommended Disposition | Severity | Reason |
|---|------------------|---------------|-------------------|------------------------|----------|--------|
| D-1 | Steps 1+2 merge (Scenario + Context) | Two separate screens, no required context fields | Single form, collapsible sections, ≥1 context field required | **Improve inside PS Wizard** | P2 — Medium | Pure UX improvement. Reduces click-through friction. Low risk. Making one context field required is a sensible guardrail. |
| D-2 | Steps 3+4 merge (NLP + Auto Name) | Two separate screens; step 3 informational only, step 4 naive heuristic | Single review screen; LLM-generated title | **Improve inside PS Wizard** | P2 — Medium | UX consolidation. LLM naming is a clear improvement over first-sentence heuristic. Step 3 currently adds no user action — merging is justified. |
| D-3 | Guided scenario template | Does not exist | Optional prompt pattern at step 1 | **Improve inside PS Wizard** (with boundary constraint) | P3 — Low | Acceptable if prompts focus on scenario description quality ("Describe the project situation, expected outcome, stakeholders"). Must NOT ask ideation-discovery questions ("What is the problem? What could be improved?") — those belong to Ideation Steps 1–3. |
| D-4 | Auto-tagging suggestion | Does not exist | NLP pre-classifies keywords, suggests tags as user types | **Defer** | P4 — Low | Nice-to-have. Requires real-time NLP classification during input. High implementation effort relative to value. Not architecturally necessary. |
| D-5 | Scenario completeness indicator | Does not exist | Heuristic quality score (word count, field coverage) | **Improve inside PS Wizard** | P3 — Low | Simple heuristic. Low effort, low risk. Nudges richer input. |
| D-6 | LLM-generated project title | Naive first-sentence heuristic (`deriveProjectName`) | LLM call generating professional title | **Improve inside PS Wizard** | P2 — Medium | Current heuristic fails when scenarios open with context rather than an imperative sentence. LLM naming via existing provider infrastructure is straightforward. |
| D-7 | NLP confidence per dimension | Does not exist | Confidence score per extracted dimension | **Defer** | P4 — Low | Requires NLP model changes to produce per-dimension confidence. Current matrix dimensions are DB-driven categorical values, not NLP extractions with confidence. Architecturally mismatched with current approach. |
| D-8 | Editable dimension values | Dimensions displayed read-only | Users can correct/add dimension values before questionnaire | **Improve inside PS Wizard** | P3 — Low | Simple UI change. Allows human correction of NLP extraction. No architectural risk. |
| D-9 | Binary → Likert 1–5 questionnaire | Binary Yes/No per question | Likert 1–5 scale with per-question weights | **Defer to Workstream 3** | P1 — High | This is the most impactful scoring engine change. Requires deep analysis of scoring formula, weight calibration, backward compatibility with existing projects, and matrix data model changes. Cannot be decided at the step-architecture level. |
| D-10 | Adaptive branching in questionnaire | Does not exist | Follow-up questions shown based on high scores on trigger questions | **Defer to Workstream 3** | P2 — Medium | Depends on Likert scale adoption (D-9). Cannot be evaluated independently. |
| D-11 | Multi-evaluator scoring | Single user answers all questions | Multiple users score independently; scores averaged; variance flagged | **Defer** | P3 — Low | Architecturally sound but requires significant new infrastructure: invitation system, parallel session management, score aggregation, variance computation, UI for score comparison. High effort. Should follow Likert adoption (D-9) to avoid implementing twice. |
| D-12 | Likert-normalised weighted matrix engine | Binary (0/1) weight accumulation per scope | `(answer/5) × weight × scope_affinity × dim_weight × 100` | **Defer to Workstream 3** | P1 — High | Core scoring formula change. Requires Workstream 3 analysis. |
| D-13 | Impact-Effort quadrant view | Does not exist | 2×2 plot of top scopes: score (Y) vs inverse complexity (X) | **Defer** | P4 — Low | Visualization enhancement. Nice-to-have. No structural impact. Can be added independently at any time. |
| D-14 | SHAP-style numeric explainability | Text lists of positive/negative contributors | Numeric contribution bars with point attribution per question | **Defer to Workstream 3** | P2 — Medium | Explainability format depends on scoring formula. Must follow Likert/weight decisions. |
| D-15 | Confidence gate (auto-escalation) | No confidence gate; all margins proceed equally | Winner margin thresholds: High ≥15, Medium 8–14, Low <8 → blocks auto-creation | **Improve inside PS Wizard** | P1 — High | This is the most valuable structural addition. The current design treats a 1-point margin identically to a 30-point margin. A confidence gate is standard practice (Stage-Gate go/no-go). Can be implemented independently of scoring formula changes. Thresholds should be configurable, not hardcoded. |
| D-16 | Override → calibration queue | Override reason captured in text but not used | Overrides tagged and queued for matrix weight calibration | **Improve inside PS Wizard** (partial) | P2 — Medium | Capturing override metadata (recommended scope, overridden scope, reason) in a structured record is straightforward — `ps.override.ts` already exists. The calibration queue is a separate module (see D-20). |
| D-17 | KPI baseline targets at accept | Does not exist | Optional KPI fields: cost savings, time reduction, revenue impact, timeline, success metric | **Improve inside PS Wizard** | P3 — Low | Simple form fields added to Accept step. Stored in project record. Low effort, enables outcome measurement (D-19). |
| D-18 | Multi-reviewer validation with SLA | Single-reviewer submit | 1–3 parallel reviewers with SLA timer and auto-escalation | **Defer** | P3 — Low | Significant infrastructure: reviewer assignment, parallel approval workflow, SLA tracking, escalation rules. Not architecturally necessary for wizard flow. Can be layered on later. |
| D-19 | KPI actuals capture at feedback | Qualitative 4-state outcome + notes only | Quantitative KPI actuals compared against baseline targets | **Improve inside PS Wizard** | P3 — Low | Simple form extension to feedback step. Requires D-17 (baseline targets) to be implemented first. |
| D-20 | Matrix weight retraining from outcomes | Outcomes stored but not used | Outcome + KPI delta → calibration event → matrix calibration queue → human review → weight adjustment | **Defer** | P2 — Medium | Architecturally sound but requires a new calibration module (`ps.matrix-calibration.ts`), a review UI, and a calibration apply workflow. Must NOT be embedded in the wizard step handler. This is a system-level concern, not a step-level concern. |
| D-21 | Steps 12+13 merge (PM + Feedback) | Two separate screens | One screen with PM handoff + outcome capture | **Improve inside PS Wizard** | P3 — Low | UX consolidation. Both steps are post-lifecycle actions. Merging is justified — feedback and PM handoff are often done in the same session. |
| D-22 | Scenario template overlap with Ideation | Not applicable | Proposed template asks "What is the problem? Who is affected? What outcome is expected?" | **Reject the specific template wording** | P1 — High | These questions duplicate Ideation Steps 1–3 (Context, Problem, Opportunity). If a user comes from Ideation, they have already answered these. If a user enters the wizard directly, guiding them through problem/opportunity discovery is Ideation's job, not the wizard's. The template must be reworded to focus on scenario description: "Describe the project situation, key stakeholders, and expected governance needs." |

---

## 8. Architectural Conclusion

### Is the redesign structurally sound?

**Yes, with qualifications.** The proposed 10-step redesign is structurally sound in its overall direction but overloads PS Wizard with three categories of concern that must be separated:

#### What should be adopted now (PS Wizard improvements)

1. **Steps 1+2 merge** (D-1) — Removes unnecessary screen transition. Low risk.
2. **Steps 3+4 merge** (D-2) — Eliminates a pure-information step and a trivial interstitial.
3. **LLM project naming** (D-6) — Clear improvement over first-sentence heuristic.
4. **Confidence gate** (D-15) — The single most valuable structural addition. Prevents low-confidence auto-decisions. Can be implemented with current binary scoring.
5. **Override metadata capture** (D-16 partial) — Structured override records enable future calibration analysis.
6. **Steps 12+13 merge** (D-21) — UX consolidation of post-lifecycle screens.
7. **Scenario completeness indicator** (D-5) — Simple heuristic, low effort.
8. **Editable dimension values** (D-8) — Allows human correction of NLP input.

These changes reduce the wizard from 13 steps to 10 steps (after merges) while adding a critical confidence gate. **Net result: fewer steps, better decision quality.**

#### What must be deferred to Workstream 3 (scoring engine changes)

1. **Binary → Likert 1–5** (D-9)
2. **Per-question weights** (D-10)
3. **Likert-normalised scoring formula** (D-12)
4. **SHAP-style numeric explainability** (D-14)

These are coupled changes that affect the core scoring engine. They must be analysed as a coherent package in Workstream 3, including backward compatibility with existing projects scored on the binary matrix.

#### What must be deferred (high-effort infrastructure)

1. **Multi-evaluator scoring** (D-11) — Significant new infrastructure. Should follow Likert adoption.
2. **Multi-reviewer validation with SLA** (D-18) — Governance enhancement, not core flow.
3. **Matrix retraining from outcomes** (D-20) — System-level module, not a wizard step.
4. **Auto-tagging** (D-4) — Nice-to-have, high effort.
5. **NLP confidence per dimension** (D-7) — Architecturally mismatched with current DB-driven dimensions.
6. **Impact-Effort quadrant** (D-13) — Visualization enhancement, can be added anytime.

#### What must be rejected

1. **Scenario template wording that duplicates Ideation** (D-22) — The proposed template ("What is the problem? Who is affected?") directly overlaps with Ideation Steps 1–3. This must be reworded to avoid boundary violation. The wizard's intake should focus on "describe the project situation for classification" not "discover the problem and opportunity."

### Boundary integrity assessment

The redesign **preserves boundary integrity** in all structural changes. The only boundary violation is in the specific wording of the proposed scenario template (D-22), which is easily corrected. No proposed step moves ideation responsibilities into the wizard or vice versa. The ConceptPackage handoff remains the clean boundary between the two systems.

### Recommended implementation path

| Priority | Items | Net Step Impact |
|----------|-------|----------------|
| Phase A (immediate) | D-1, D-2, D-5, D-6, D-8, D-15, D-21 | 13 → 10 steps |
| Phase B (after Phase A) | D-3 (reworded), D-16, D-17, D-19 | Same 10 steps, richer data |
| Phase C (Workstream 3) | D-9, D-10, D-12, D-14 | Same 10 steps, upgraded scoring |
| Phase D (post-Workstream 3) | D-11, D-18, D-20 | Same 10 steps, advanced governance |
| Rejected | D-22 (specific template wording) | N/A |

---

## 9. Acceptance Check

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every current step (1–13) appears in at least one structured table | **PASS** | Section 2 (all 13 steps), Section 5 (transition matrix maps all 13). |
| Every proposed step (P1–P10 + P3b) appears in at least one structured table | **PASS** | Section 3 (all 11 proposed entries), Section 5 (all mapped). |
| Ideation responsibilities are explicitly separated from PS Wizard responsibilities | **PASS** | Section 4 (12 ideation responsibilities listed), Section 6 (30 boundary assignments with explicit owners). |
| Every step-level change has a disposition outcome | **PASS** | Section 7 (22 disposition entries, each with Keep/Improve/Defer/Reject). |
| Document clearly answers whether the redesign is structurally sound | **PASS** | Section 8: "Yes, with qualifications" — followed by four categorized action groups and a recommended implementation path. |
| No vague phrases like "probably belongs here" without rationale | **PASS** | Every boundary assignment and disposition includes explicit reasoning. |
| Boundary violation D-22 explicitly flagged | **PASS** | Section 7 D-22: "Reject the specific template wording" with rationale. |

**Document status: COMPLETE.**
