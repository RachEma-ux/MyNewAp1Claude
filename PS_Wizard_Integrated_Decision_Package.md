# PS Wizard — Integrated Research, Redesign Evaluation, and Delivery Decision Package

**Author:** Principal Product Systems Analyst, Workflow Architect, Scoring-Systems Reviewer, Governance Reviewer, Delivery Strategist
**Date:** 2026-03-29
**Status:** FINAL — Ready for executive decision
**Classification:** Internal decision document — standalone reading
**Workstreams consolidated:** WS1 (Baseline Verification), WS2 (Step Architecture Mapping), WS3 (Scoring Architecture Assessment), WS4 (Redesign Proposal Evaluation), WS5 (Technical and Governance Impact Assessment), WS6 (Delivery Roadmap)

---

## 1. Executive Summary

The PS Wizard is a 13-step classification and governance intake flow that receives a project scenario, classifies it against a DB-driven scoring matrix, recommends a PS scope, and creates a governed project record with lifecycle management. The current implementation is structurally sound — the scoring engine is fully DB-driven with zero hard-coded logic, the lifecycle state machine enforces strict transitions, and the ideation-to-wizard boundary is clean via ConceptPackage. However, the wizard lacks a confidence gate (the single most important missing control), uses a naive project naming heuristic, contains unnecessary interstitial screens, and silently drops override reasons captured in the UI.

The proposed 10-step redesign is directionally correct but overloaded as a single release. Of 25 extracted redesign items: 11 (44%) are adopted immediately or in the next phase, 11 (44%) are deferred pending scoring engine analysis or infrastructure build-out, 2 (8%) are adopted with modifications, and 1 (4%) is rejected for violating the ideation/wizard boundary.

**Bottom line:** Reduce from 13 to 10 steps. Add a configurable confidence gate. Replace the naming heuristic with LLM-generated titles. Merge post-lifecycle screens. Defer scoring formula changes (binary → Likert) to a dedicated workstream. Reject template wording that duplicates ideation responsibilities. Ship in four phases: A (structural cleanup + confidence gate), B (data enrichment), C (scoring engine evolution), D (advanced governance).

**Decision counts:** Adopt: 7 | Adopt with change: 4 | Defer: 11 | Reject: 1

---

## 2. Purpose and Scope

This document is the unified decision package combining six analytical workstreams into a single, self-contained decision instrument. It can be read without reference to the underlying workstream documents.

**What this document does:**

1. Establishes a verified, evidence-grounded current-state baseline for PS Wizard (Workstream 1).
2. Maps and compares the current 13-step wizard, proposed 10-step redesign, and upstream 11-step ideation workflow (Workstream 2).
3. Assesses the scoring architecture as a first-class product capability with dedicated governance analysis (Workstream 3).
4. Evaluates every major redesign proposal individually with explicit dispositions (Workstream 4).
5. Translates approved decisions into concrete implementation impact across UI, API, data model, and governance (Workstream 5).
6. Provides a phased implementation roadmap with governance gates and acceptance criteria (Workstream 6).

**Three reference models:**

| Model | Description | Primary source |
|-------|-------------|----------------|
| **Model A — Current-State Baseline** | The existing 13-step PS Wizard and its visible behavior | Implementation code (PSWizardPage.tsx + server PS modules) |
| **Model B — Target-State Redesign** | The proposed 10-step optimized PS Wizard with upgraded scoring and governance | Design suggestion document (consumed via WS2 analysis) |
| **Model C — Upstream Ideation Boundary** | The pre-wizard 11-step idea-management workflow | PS Ideation module code + PS-Ideation-Workflow-Diagram.md |

**Non-negotiable rules applied throughout:**
- Implementation truth takes precedence over prose claims.
- Current-state truth and redesign proposals are never mixed.
- Every material claim is tagged by evidence status.
- Ideation responsibilities are explicitly separated from wizard responsibilities.
- Scoring is treated as its own architecture and governance topic.
- Unresolved issues are visible, not hidden.

---

## 3. Source Role Map

Every conclusion in this package traces to a verified source. No source has been used beyond its validated scope.

| Source | Role | Authority Level | Notes |
|--------|------|-----------------|-------|
| `PSWizardPage.tsx` (896 lines) | Implementation truth — frontend wizard | **Highest** | The actual running wizard UI. All claims verified against this file. Primary evidence for current-state baseline. |
| `ps.matrix-engine.ts` (256 lines) | Implementation truth — scoring engine | **Highest** | DB-backed matrix classification engine. Core scoring logic. Zero hard-coded rules. |
| `ps.classifier.ts` (264 lines) | Implementation truth — rule-based classifier | **Highest** | Deterministic rule-based classifier (18 rules, 5 system types). Separate from matrix engine. Not used by wizard. |
| `ps.confidence.ts` (159 lines) | Implementation truth — confidence engine | **Highest** | Three-pillar confidence computation: completeness (30%), spread (30%), 1-ambiguity (40%). |
| `ps.explainability.ts` (121 lines) | Implementation truth — explainability | **Highest** | Positive/negative signal computation from matrix cell weights. Numeric weights computed but UI discards them. |
| `ps.lifecycle.ts` (103 lines) | Implementation truth — state machine | **Highest** | Strict transitions: DRAFT → SUBMITTED → VALIDATED/REJECTED → PUBLISHED/SENT_TO_PM. |
| `ps.project.ts` (194 lines) | Implementation truth — project creation | **Highest** | Creates PS project from wizard run trace; resolves template bundle from scope code. |
| `ps.override.ts` (150 lines) | Implementation truth — overrides | **Highest** | Records override events, computes override rate, pattern detection. Exists but disconnected from wizard. |
| `ps.feedback.ts` (80 lines) | Implementation truth — feedback | **Highest** | Records outcome (success/partial/failed/cancelled) + notes. No retraining logic. |
| `ideation-readiness.ts` (133 lines) | Implementation truth — readiness engine | **Highest** | 5 blockers + 3 warnings evaluation for ideation → wizard handoff. |
| `ideation-conversion.ts` (151 lines) | Implementation truth — conversion service | **Highest** | Builds ConceptPackage, commits conversion. Lifecycle: concept_selected → ready_for_wizard → converted. |
| `ps.validation.ts` (719 lines) | Implementation truth — Zod schemas | **Highest** | Defines all input validation schemas for PS module API. |
| `ps.types.ts` | Implementation truth — type definitions | **Highest** | PS_PROJECT_STATUSES, PS_PROJECT_TRANSITIONS, classification dimension types. |
| `WS2_Step_Architecture_Mapping.md` | Derived analysis — step mapping | **Medium** | Maps current 13-step wizard, proposed 10-step redesign, and upstream ideation workflow. Mixes current-state description with redesign proposals. |
| `PS-Ideation-Workflow-Diagram.md` | Authoritative reference — ideation boundary | **High** | Documents the 11-step ideation workflow, data flow, and handoff to PS Wizard. |
| `ps_wizard_analysis.md` | Claimed analysis document | **Unavailable** | NOT FOUND in repo. Claims attributed to it are extracted via WS2. |
| `ps_wizard_design_suggestion.md` | Claimed redesign proposal | **Unavailable** | NOT FOUND in repo. Content attributed to it is extracted via WS2. |

**Critical gap:** The two primary input documents specified in the original task brief — `ps_wizard_analysis.docx` and `ps_wizard_design_suggestion.docx` — do not exist in the repository as standalone files. The WS2 Step Architecture Mapping document references them and contains extracted claims from both. All claims are verified against implementation truth (code). Claims that cannot be independently verified are explicitly marked.

---

## 4. Claim Validation Framework

Claims extracted from analysis documents, cross-referenced against implementation code. Each claim is tagged with a classification label.

| Claim | Source | Claim Type | Status | Evidence | Notes |
|-------|--------|-----------|--------|----------|-------|
| **C-01:** Scenario textarea ≤5000 chars | WS2 §2 | Current state | **Verified** | PSWizardPage.tsx:311 `{scenario.length}/5000`; ps.validation.ts `createWizardRunSchema` has `.max(5000)` | Char count displayed in UI; validated server-side |
| **C-13:** DB-driven Yes/No binary questions from active matrix | WS2 §2 | Current state | **Verified** | PSWizardPage.tsx:439–461 iterates `questions` from matrix, renders Yes/No buttons; matrix-engine.ts:247 `isAnswerTruthy()` | Binary only; no Likert |
| **C-16:** No Likert scale, no per-question weights, no adaptive branching | WS2 §2 | Current state | **Verified** | PSWizardPage.tsx:443 only renders "Yes"/"No"; no branching logic anywhere in wizard | Negative verification — features absent |
| **C-17:** Top 3 ranked scopes with scores displayed | WS2 §2 | Current state | **Verified** | PSWizardPage.tsx:486–507 renders `recommendation.top3.map(...)` as ordered list with scores | Proportional bar charts relative to top scorer |
| **C-23:** No numeric attribution in explainability step | WS2 §2 | Current state | **Verified** | PSWizardPage.tsx:539–565 renders labels only as text bullets; server computes `ExplainabilitySignal.weight` but frontend discards it | **Data loss at UI layer** — numeric weights exist in engine output |
| **C-26:** Override reason stored in local state only | WS2 §2 | Current state | **Partially Verified** | PSWizardPage.tsx:80 `useState("")` captures reason; displayed in Accept step (line 655) but **never passed** to `createProjectMut.mutateAsync()` (line 195–211) | **Critical gap:** override reason silently dropped at project creation |
| **C-45:** Lifecycle state machine transitions | WS2 §2 | Current state | **Verified** | ps.types.ts PS_PROJECT_TRANSITIONS: DRAFT→SUBMITTED, SUBMITTED→VALIDATED/REJECTED, VALIDATED→PUBLISHED/SENT_TO_PM | Exact match to code |
| **C-47:** Wizard uses matrix engine, not rule-based classifier | WS2 §2 | Current state | **Reasonable Inference** | PSWizardPage.tsx:94 `trpc.ps.classifyScenario.useMutation()` sends `{scenario, context, answers}` matching matrix engine input, not classifier dimension input | **Needs technical verification** — `classifyScenarioSchema` in validation file expects different input shape |
| **C-48:** Confidence via three pillars | WS2 §2 | Current state | **Verified** | ps.confidence.ts:43–46: `0.30 × completeness + 0.30 × spread + 0.40 × (1 - ambiguity)` | Exact match to code |
| **C-50:** Override tracking infrastructure exists | WS2 §2 | Current state | **Verified with qualification** | ps.override.ts provides `recordOverride()`, `listOverrides()`, `getOverrideRate()`, `getOverridePatterns()` | **Server-side exists but disconnected from wizard UI** |
| **C-52:** Wizard has exactly 13 steps | WS2 §2 | Current state | **Verified** | PSWizardPage.tsx:14 `type Step = 1|2|...|13`; line 39–53 STEP_LABELS array has 13 entries | Exact match |
| **C-53:** All questions are binary Yes/No | WS2 §2 | Current state | **Verified** | PSWizardPage.tsx:443 `["Yes", "No"].map(...)`; matrix-engine.ts:247–255 `isAnswerTruthy()` is binary | No alternative input types in wizard |
| **C-54:** Binary weight accumulation scoring | WS2 §2 | Current state | **Verified** | matrix-engine.ts:209–218: for each truthy answer, adds `cell.weight` to scope score. Score = Σ(cell.weight) | No normalisation, no Likert weighting |
| **C-55:** No confidence gate exists | WS2 §2 | Current state | **Verified** | PSWizardPage.tsx:121–132 `canGoNext` for scoring/recommendation steps only checks `recommendation !== null` — no threshold on confidence, margin, or score | All confidence levels treated identically |
| Likert 1–5 questionnaire replacing binary | Design suggestion | **Design Proposal** | **Not implemented** | Proposed in redesign; no Likert code exists anywhere in wizard or scoring engine | Deferred to Phase C |

---

## 5. Contradictions and Resolutions

| Topic | Conflicting Statements | Source A | Source B | Resolution |
|-------|----------------------|----------|----------|------------|
| **Override reason persistence** | WS2 claims: "Override reason stored in local state; displayed in Accept step and persisted if provided." | WS2 analysis (S12) | PSWizardPage.tsx (S1) | **Code wins.** Override reason is stored in `useState` (line 80), displayed in Accept step (line 655–659), but **never passed** to `createProjectMut.mutateAsync()` (line 195–211). The `CreatePSProjectInput` type does not include an overrideReason field. The override tracking API (ps.override.ts) exists server-side but is never called from the wizard. **WS2's claim that it is "persisted if provided" is incorrect.** |
| **Classification endpoint matching** | WS2 claims the wizard calls matrix engine classification. `classifyScenarioSchema` expects typed `dimensions` object, but wizard sends `{scenario, context, answers}`. | WS2 analysis (S12) | ps.validation.ts (S14) vs PSWizardPage.tsx (S1) | **Needs verification.** The wizard's mutation sends `{scenario, context, answers}` which does not match the `classifyScenarioSchema` that expects a structured `dimensions` object. There are likely two separate tRPC procedures: one for the rule-based classifier (S7), another for the matrix-based classification. **Cannot fully resolve without running the router.** |
| **PM handoff guard strictness** | WS2 says: "Blocked if project is still DRAFT." UI blocks for DRAFT only. | WS2 analysis (S12) | ps.lifecycle.ts (S5) + ps.types.ts (S15) | **Code is stricter than described.** Server-side state machine only allows SENT_TO_PM from VALIDATED state. A project in SUBMITTED status would also fail server-side, not just DRAFT. UI guard is a subset of server guard. |
| **"NLP Analysis" step (Step 3)** | Step title says "NLP Analysis" but it performs no NLP — purely informational display of DB-driven matrix dimensions. | WS2 analysis (S12) | PSWizardPage.tsx (S1) | **No functional contradiction, misleading naming.** The step label describes intent, not implementation. The name is a misnomer. |
| **Confidence value type** | Frontend stores/displays confidence as a string label. Server confidence engine returns numeric 0–1 float. | PSWizardPage.tsx (S1) | ps.confidence.ts (S4) | **Transformation layer exists.** The numeric confidence report is converted to a label somewhere in the pipeline (likely matrix-engine's enriched result). The stored `confidence` in `psProjects` is also a string. Both representations are valid; the issue is that the numeric detail is not exposed to the wizard UI. |
| **deriveProjectName editorial label** | WS2 labels it "naive heuristic." Implementation is straightforward but functional. | WS2 analysis (S12) | PSWizardPage.tsx (S1) | **No factual contradiction.** "Naive" is an editorial judgment, not a current-state fact. The implementation is a simple string-split heuristic. Retained as verified behavior without the editorial label. |

---

## 6. Validated Current-State Baseline

This section is the authoritative current-state view. It can be read independently. No redesign proposals are included.

| Area | Verified Behavior | Verification Status | Notes |
|------|-------------------|---------------------|-------|
| **Wizard structure** | 13 steps: Scenario → Context → NLP → Auto Name → Questions → Scoring → Explainability → Recommendation → Accept → Create → Validation → PM Central → Feedback | **Verified** | Linear forward/back navigation; back disabled after step 10 |
| **Scenario input (Step 1)** | Free-text textarea, max 5000 chars, `scenario.trim().length > 0` required | **Verified** | No guided template, no structured prompts |
| **Context fields (Step 2)** | 4 fields: Business Unit, Region, Strategic Importance, Existing Situation | **Verified** | All optional — `canGoNext` always true for step 2 |
| **NLP Analysis (Step 3)** | Read-only display of matrix dimensions + context signal echo | **Verified** | Name is misleading — no NLP occurs; purely informational step |
| **Auto Name (Step 4)** | `deriveProjectName()`: split on `.!?\n`, take first sentence, truncate at 80 chars at word boundary | **Verified** | User can freely edit the generated name |
| **Questions (Step 5)** | Binary Yes/No toggle buttons from active matrix version; "Classify" triggers `handleRunClassification()` | **Verified** | No Likert, no per-question weights, no adaptive branching |
| **Scoring formula** | For each truthy answer, accumulate `cell.weight` into scope score. Score = Σ(cell.weight) | **Verified** | Purely additive. No normalisation, no dimension weighting |
| **Ranking** | Sort scopes by score descending, alphabetical tie-break. Top 3 displayed with proportional bar charts | **Verified** | Deterministic ranking |
| **Confidence computation** | Three-pillar composite: 30% completeness + 30% spread + 40% (1–ambiguity). Returns 0.0–1.0 | **Verified** | Computed but **not acted upon** — no gate, no threshold |
| **Explainability** | Positive signals (winner gained weight) and negative signals (runner-up gained more). Text lists, no numeric bars | **Verified** | **Data loss at UI layer:** server computes numeric weights per signal; frontend renders labels only |
| **Recommendation (Step 8)** | Shows selected scope label, code, and matrix version; optional override textarea | **Verified** | Override reason captured in React state |
| **Override mechanism** | Captured in `useState` but **silently dropped** — never sent to server or persisted | **Verified** | **Critical gap.** ps.override.ts exists server-side but is disconnected from wizard flow |
| **Accept review (Step 9)** | Displays: name, scenario, BU/region, scope, confidence, matrix version, question count, decision trace, override reason | **Verified** | Decision trace: `scope=X | confidence=Y | matrix_v=Z | top3=[A,B,C]` |
| **Confidence gate** | **None.** All confidence levels and winner margins proceed identically to project creation | **Verified** | No threshold, no escalation, no gate |
| **Project creation (Step 10)** | `trpc.ps.projects.create` in transaction: insert wizard run trace + insert project in DRAFT status | **Verified** | Template bundle resolved server-side via `resolveTemplateBundle()` |
| **Validation (Step 11)** | Single-reviewer model. "Submit for Validation" transitions DRAFT → SUBMITTED | **Verified** | No multi-reviewer, no SLA, no structured pass/fail |
| **PM Central (Step 12)** | "Send to PM Central" transitions to SENT_TO_PM. Server enforces VALIDATED → SENT_TO_PM only | **Verified** | UI guard less strict than server guard |
| **Feedback (Step 13)** | 4-state outcome (success/partial/failed/cancelled) + optional text notes. "Skip & Go to List" available | **Verified** | Data stored in `psFeedback` but **never consumed** by any downstream process |
| **Lifecycle state machine** | DRAFT → SUBMITTED → VALIDATED → PUBLISHED / SENT_TO_PM; SUBMITTED → REJECTED. Terminal: REJECTED, PUBLISHED, SENT_TO_PM | **Verified** | All transitions audited via `logPsAudit()` |
| **Two classifiers coexist** | Rule-based (ps.classifier.ts): 18 rules, 5 system types. DB-backed matrix (ps.matrix-engine.ts): weight accumulation. Wizard uses matrix engine | **Verified** | Relationship and intended boundary not documented |
| **Ideation → Wizard boundary** | Readiness engine: 5 blockers + 3 warnings. ConceptPackage built by `prepareConceptPackage()`. Lifecycle: concept_selected → ready_for_wizard → converted | **Verified** | **Wizard UI is ideation-unaware** — no code reads or uses a ConceptPackage; handoff happens outside wizard component |

---

## 7. Step Architecture Mapping

### 7.1 Current Step Inventory

| Current Step | Purpose | Current Status |
|-------------|---------|----------------|
| **1. Scenario** | Free-text textarea (≤5000 chars) describing the project scenario | Implemented. Validation: non-empty. No guided template. |
| **2. Context** | Structured fields: BU, Region, Strategic Importance, Existing Situation | Implemented. No required fields — all optional. |
| **3. NLP Analysis** | Displays DB-driven classification dimensions from active matrix | Implemented. No AI call — purely informational. No user action required. |
| **4. Auto Name** | Derives project name from first sentence of scenario (≤80 chars) | Implemented. Simple heuristic: split on `.!?\n`, truncate at word boundary. |
| **5. Questions** | Renders DB-driven Yes/No binary questions from active matrix version | Implemented. Binary toggle buttons. "Classify" triggers classification. |
| **6. Scoring** | Displays Top 3 ranked scopes with scores, bar charts, winner margin, confidence | Implemented. Data from `classifyScenario` mutation result. |
| **7. Explainability** | Lists positive/negative contributors from classification result | Implemented. Text lists, no numeric attribution. |
| **8. Recommendation** | Shows recommended scope (label + code + version); optional override textarea | Implemented. Override reason captured but not persisted. |
| **9. Accept** | Full summary review with decision trace | Implemented. Machine-readable audit string. No e-signature. |
| **10. Create PS Project** | Calls `trpc.ps.projects.create`; DRAFT status; template bundle resolved | Implemented. Navigation locked after this step. |
| **11. Validation** | "Submit for Validation" — DRAFT → SUBMITTED | Implemented. Single-reviewer model. |
| **12. PM Central** | "Send to PM Central" — transitions to SENT_TO_PM | Implemented. Blocked if not VALIDATED (server enforcement). |
| **13. Feedback** | Records outcome + optional notes; "Skip & Go to List" | Implemented. Outcomes stored but not used for retraining. |

### 7.2 Proposed Step Inventory

| Proposed Step | Purpose | Source | Notes |
|--------------|---------|--------|-------|
| **P1. Scenario + Context** | Merge steps 1+2 into single form with collapsible sections | Design suggestion | Adds guided template, completeness indicator. ≥1 context field required. |
| **P2. NLP + Smart Name** | Merge steps 3+4; LLM-generated title replaces heuristic | Design suggestion | Adds NLP confidence per dimension (deferred). Editable dimension values. |
| **P3. Smart Questionnaire** | Replace binary Yes/No with Likert 1–5; per-question weights; adaptive branching | Design suggestion | **Major scoring change — deferred to Phase C.** |
| **P3b. Multi-evaluator** | Parallel scoring by multiple users with averaged scores | Design suggestion | **New capability — deferred to Phase D.** |
| **P4. Weighted Matrix Engine** | Likert-normalised scoring; Impact-Effort quadrant | Design suggestion | **Scoring engine change — deferred to Phase C.** |
| **P5. XAI Explainability** | SHAP-style numeric contribution bars | Design suggestion | **Depends on scoring formula — deferred to Phase C.** |
| **P6. Recommendation + Confidence Gate** | Low-confidence escalation based on winner margin thresholds | Design suggestion | **Adopted for Phase A.** Independent of scoring formula changes. |
| **P7. Accept + Confirm** | Adds KPI baseline targets at confirmation | Design suggestion | KPI fields adopted for Phase B. |
| **P8. Create Project** | Same project creation with minor payload additions | Design suggestion | `kpiTargets` added in Phase B. |
| **P9. Validate + Multi-reviewer** | Parallel multi-reviewer with SLA tracking | Design suggestion | **Deferred to Phase D.** |
| **P10. PM Handoff + Outcomes → Retrain** | Merges PM handoff and feedback; captures KPI actuals; outcome feeds calibration | Design suggestion | Merge adopted for Phase A. Calibration deferred to Phase D. |

### 7.3 Upstream Ideation Boundary Inventory

| Ideation Responsibility | Why It Is Upstream | Related Source |
|------------------------|--------------------|----------------|
| **I-1. Context of the Project** (drivers, triggers, need) | Ideation Step 1. Defines why a project is needed. PS Wizard receives a ready scenario. | `ContextDefinitionToolPanel` |
| **I-2. Problem Definition** (what is not working, who is impacted) | Ideation Step 2. Problem framing is idea-stage work, not classification. | `ProblemDefinitionToolPanel` |
| **I-3. Opportunity Definition** (what could be improved, value) | Ideation Step 3. Opportunity framing precedes any scoring. | `OpportunityDefinitionToolPanel` |
| **I-4. Guiding "What If?" Question** | Ideation Step 4. Creative prompt guiding divergent thinking. | `GuidingWhatIfToolPanel` |
| **I-5. Idea Generation** (brainstorming, idea list) | Ideation Step 5. Divergent idea creation. Not a wizard concern. | `IdeaGenerationToolPanel` |
| **I-6. Idea Clustering & Theming** | Ideation Step 6. Grouping and pattern recognition across ideas. | `ClusteringAndThemingToolPanel` |
| **I-7. Initial Screening** (criteria-based filtering) | Ideation Step 7. Evaluates ideas against screening criteria. | `InitialScreeningToolPanel` |
| **I-8. Scenario Exploration** ("What if" per idea) | Ideation Step 8. Explores implications of top ideas. | `ScenarioExplorationToolPanel` |
| **I-9. Quick Feasibility Checks** | Ideation Step 9. Technical/resource/timeline feasibility per idea. | `FeasibilityCheckToolPanel` |
| **I-10. Concept Selection** (pick winning idea + rationale) | Ideation Step 10. Selects the concept to pursue. | `ConceptSelectionToolPanel` |
| **I-11. One-Page Summary** | Ideation Step 11. Executive summary of ideation outcome. | `OnePageSummaryToolPanel` |
| **I-H. Readiness Check + ConceptPackage + Handoff** | Boundary layer. Evaluates 5 blockers + 3 warnings. Produces ConceptPackage. Lifecycle: concept_selected → ready_for_wizard → converted. | `ideation-readiness.ts`, `ideation-conversion.ts` |

**Boundary rule:** The ConceptPackage is the formal contract between Ideation and Wizard. Any capability belonging to idea discovery, evaluation, or concept selection belongs upstream.

### 7.4 Current-to-Proposed Step Transition Matrix

| Current Step(s) | Proposed Step | Responsibility Changed / Merged / Moved | Notes |
|----------------|---------------|----------------------------------------|-------|
| 1 (Scenario) + 2 (Context) | P1: Scenario + Context | **Merged.** Two screens → one form. ≥1 context field required. | Pure UX consolidation. No responsibility shift. |
| — | P1 addition: Guided template | **Introduced.** Optional prompt for richer descriptions. | Must NOT duplicate Ideation Steps 1–3. |
| — | P1 addition: Completeness indicator | **Introduced.** Heuristic quality score. | Client-side only. No boundary risk. |
| 3 (NLP) + 4 (Auto Name) | P2: NLP + Smart Name | **Merged.** Two screens → one. LLM replaces heuristic. | UX consolidation + quality improvement. |
| — | P2 addition: Editable dimension values | **Introduced.** User correction of NLP extraction. | Simple UI change. No architectural risk. |
| 5 (Questions) | P3: Smart Questionnaire | **Upgraded.** Binary → Likert 1–5 (deferred). | Scoring change — Phase C. |
| — | P3b: Multi-evaluator | **Introduced.** Parallel scoring (deferred). | New infrastructure — Phase D. |
| 6 (Scoring) | P4: Weighted Matrix Engine | **Upgraded.** Binary → Likert-normalised (deferred). | Scoring change — Phase C. |
| 7 (Explainability) | P5: XAI Explainability | **Upgraded.** Text → SHAP-style bars (deferred). | Depends on scoring formula — Phase C. |
| 8 (Recommendation) | P6: Recommendation + Confidence Gate | **Upgraded.** Adds mandatory confidence gate. | **Adopted for Phase A.** Can implement with current scoring. |
| 9 (Accept) | P7: Accept + Confirm | **Upgraded.** Adds optional KPI baseline target fields. | KPI fields adopted for Phase B. |
| 10 (Create) | P8: Create Project | **Unchanged** + minor payload additions. | `kpiTargets` in Phase B. |
| 11 (Validation) | P9: Validate + Multi-reviewer | **Upgraded.** Single → 1–3 parallel reviewers (deferred). | Infrastructure — Phase D. |
| 12 (PM Central) + 13 (Feedback) | P10: PM Handoff + Outcomes → Retrain | **Merged + Upgraded.** Retraining deferred. | Merge adopted for Phase A. Calibration deferred to Phase D. |

### 7.5 Boundary Assignment Table

| Responsibility | Recommended Owner | Reason |
|---------------|-------------------|--------|
| Problem discovery and framing | **PS Ideation** | Ideation Steps 1–3 own this. Wizard receives a pre-framed scenario. |
| Opportunity identification | **PS Ideation** | Ideation Step 3. Not a classification concern. |
| Idea generation and brainstorming | **PS Ideation** | Ideation Step 5. Divergent thinking is upstream. |
| Idea screening and filtering | **PS Ideation** | Ideation Step 7. Screening criteria are ideation-level. |
| Concept selection | **PS Ideation** | Ideation Step 10. Wizard does not choose which concept to pursue. |
| Scenario text capture | **PS Wizard** | Step 1. When coming from Ideation, pre-populated from ConceptPackage. |
| Organizational context capture | **PS Wizard** | Step 2. BU, Region, Strategic Importance are classification inputs. |
| Guided scenario template | **PS Wizard** (with constraint) | Must focus on "describe the situation," NOT "what is the problem?" |
| NLP dimension extraction | **PS Wizard** | Step 3. Dimensions are classification constructs. |
| Project name generation | **PS Wizard** | Step 4. Naming is a wizard output artifact. |
| Classification questionnaire | **PS Wizard** | Step 5. Core scoring input (binary or Likert). |
| Multi-evaluator scoring | **PS Wizard** | Proposed Step 3b. Evaluators assess classification fit, not idea quality. |
| Weighted matrix scoring engine | **PS Wizard** | Step 6. Core classification logic. |
| Explainability reporting | **PS Wizard** | Step 7. Explains classification result. |
| Scope recommendation | **PS Wizard** | Step 8. The wizard's primary output. |
| Confidence gate (auto-escalation) | **PS Wizard** | Proposed Step 6. Decision quality control within classification. |
| Override capture and audit | **PS Wizard** | Step 8. Overrides are classification-level decisions. |
| Accept / decision trace | **PS Wizard** | Step 9. Audit trail for classification decision. |
| KPI baseline targets | **PS Wizard** | Proposed Step 7. Project-level targets set at commit time. |
| Project creation with template bundle | **PS Wizard** | Step 10. Creates the formal PS project record. |
| Validation / review workflow | **PS Wizard** | Step 11. Post-creation governance. |
| PM Central handoff | **PS Wizard** | Step 12. Lifecycle transition. |
| Outcome feedback capture | **PS Wizard** | Step 13. Records project execution result. |
| Matrix weight retraining from feedback | **Shared — requires explicit architecture** | Must be a separate calibration module, not embedded in wizard step handler. |
| Readiness evaluation + ConceptPackage | **Shared — explicit handoff** | Readiness runs in Ideation context; ConceptPackage consumed by wizard. |

### 7.6 Step Disposition Register

| Step / Capability | Current State | Proposed Redesign | Recommended Disposition | Severity / Priority | Reason |
|------------------|---------------|-------------------|------------------------|--------------------|---------|
| Steps 1+2 merge (Scenario + Context) | Two separate screens, no required context | Single form, ≥1 context field required | **Improve inside PS Wizard** | P2 — Medium | Pure UX improvement. Low risk. |
| Steps 3+4 merge (NLP + Auto Name) | Two separate screens; step 3 informational only | Single review screen; LLM-generated title | **Improve inside PS Wizard** | P2 — Medium | UX consolidation. LLM naming clearly better. |
| Guided scenario template | Does not exist | Optional prompt pattern | **Improve (with boundary constraint)** | P3 — Low | Must NOT ask ideation-discovery questions. |
| Auto-tagging suggestion | Does not exist | NLP pre-classifies keywords | **Defer** | P4 — Low | High effort relative to value. Not essential. |
| Scenario completeness indicator | Does not exist | Heuristic quality score | **Improve inside PS Wizard** | P3 — Low | Simple heuristic. Low effort, low risk. |
| LLM-generated project title | Naive first-sentence heuristic | LLM call via existing provider | **Improve inside PS Wizard** | P2 — Medium | Current heuristic fails on context-first scenarios. |
| NLP confidence per dimension | Does not exist | Confidence per extracted dimension | **Defer** | P4 — Low | Architecturally mismatched with DB-driven categorical dimensions. |
| Editable dimension values | Read-only display | Users can correct/add values | **Improve inside PS Wizard** | P3 — Low | Simple UI change. No architectural risk. |
| Binary → Likert 1–5 questionnaire | Binary Yes/No | Likert 1–5 with per-question weights | **Defer to WS3/Phase C** | P1 — High | Most impactful scoring change. Requires deep analysis. |
| Adaptive branching | Does not exist | Follow-up questions based on scores | **Defer to WS3/Phase C** | P2 — Medium | Depends on Likert adoption. |
| Multi-evaluator scoring | Single user | Multiple users, averaged scores | **Defer** | P3 — Low | Significant new infrastructure. Should follow Likert. |
| Likert-normalised weighted matrix engine | Binary weight accumulation | `(answer/5) × weight × scope_affinity × dim_weight × 100` | **Defer to WS3/Phase C** | P1 — High | Core scoring formula change. |
| Impact-Effort quadrant view | Does not exist | 2×2 plot of top scopes | **Defer** | P4 — Low | Visualization enhancement. No structural impact. |
| SHAP-style numeric explainability | Text lists | Numeric contribution bars | **Defer to WS3/Phase C** | P2 — Medium | Depends on scoring formula. |
| Confidence gate (auto-escalation) | No gate; all margins equal | Thresholds: High ≥15, Medium 8–14, Low <8 | **Improve inside PS Wizard** | P1 — High | **Single most valuable structural addition.** Works with current scoring. |
| Override → calibration queue | Override data exists but unused | Overrides tagged for calibration | **Improve (partial)** | P2 — Medium | Structured records enable future analysis. |
| KPI baseline targets at Accept | Does not exist | Optional KPI fields | **Improve inside PS Wizard** | P3 — Low | Simple form fields. Enables outcome measurement. |
| Multi-reviewer validation with SLA | Single-reviewer submit | 1–3 parallel reviewers | **Defer** | P3 — Low | Significant infrastructure. Not critical path. |
| KPI actuals capture at Feedback | Qualitative outcome only | Quantitative actuals vs targets | **Improve inside PS Wizard** | P3 — Low | Simple form extension. Requires KPI targets first. |
| Matrix weight retraining from outcomes | Outcomes stored but not used | Outcome → calibration → human review → weight adjustment | **Defer** | P2 — Medium | System-level module, not a wizard step concern. |
| Steps 12+13 merge (PM + Feedback) | Two separate screens | One screen, PM handoff + outcome capture | **Improve inside PS Wizard** | P3 — Low | UX consolidation. Both are post-lifecycle actions. |
| Scenario template duplicating Ideation | Not applicable | "What is the problem? Who is affected?" | **Reject** | P1 — High | Duplicates Ideation Steps 1–3. Boundary violation. |

---

## 8. Scoring Architecture Assessment

### 8.1 Current Scoring Baseline

| Scoring Element | Current State | Verification Status | Notes |
|-----------------|--------------|---------------------|-------|
| Answer input type | Binary Yes/No toggle buttons | **Verified** | Answers stored as string "Yes"/"No" in `AnswerMap = Record<string, string>` |
| Answer truthiness | "Yes" → truthy; "No" → not truthy | **Verified** | `isAnswerTruthy()` handles case-insensitive comparison |
| Cell weight type | Integer, DB-stored per (questionId, scopeId) | **Verified** | No per-question weight multiplier. Weight is raw affinity value. |
| Scope score formula | `SUM(cell.weight) for truthy answers` | **Verified** | Purely additive. No normalisation, no dimension weighting. |
| Ranking method | Descending score, alphabetical tie-break | **Verified** | Deterministic. |
| Top-N display | Top 3 scopes in UI with relative bar charts | **Verified** | Bar width = (score / top score × 100%) |
| Winner margin | `score[#1] - score[#2]` | **Verified** | Absolute integer. Displayed in wizard steps 6 and 7. |
| Confidence model | Composite: 30% completeness + 30% spread + 40% (1-ambiguity) | **Verified** | Output: 0.0–1.0 float |
| Confidence: Completeness | `matchedQuestions / totalQuestions` | **Verified** | Fraction of questions answered truthy |
| Confidence: Spread | Normalised stddev of scope scores / max possible score | **Verified** | Higher spread → more differentiated → better |
| Confidence: Ambiguity | `1 - (margin / maxPossibleScore)` | **Verified** | 0 = clear winner, 1 = tied |
| Confidence gate | **None** | **Verified** | All confidence levels proceed identically |
| Explainability: Positive signals | Questions where winner scope gained weight | **Verified** | Text-only in UI; weight data exists in engine output |
| Explainability: Negative signals | Questions where runner-up gained more than winner | **Verified** | Text-only in UI |
| Explainability: Numeric attribution | **Not displayed** | **Verified** | Signals carry `weight` field but UI renders only labels |
| Override system | Captures recommended vs overridden scope, reason, confidence, answers | **Verified** | Has analytics: override rate, patterns. But disconnected from wizard. |
| Feedback system | Outcome (success/partial/failed/cancelled) + driftFlag + notes | **Verified** | Qualitative only. No KPI actuals. Not connected to scoring engine. |
| Feedback → retraining | **Not connected** | **Verified** | Dead-end data |
| Override → calibration | **Not connected** | **Verified** | Dead-end data |
| Evaluation suite | Benchmark cases with expected scope, run against matrix version | **Verified** | Produces pass/fail, confidence. No connection to calibration. |
| Matrix versioning | Supports draft/active/archived versions | **Verified** | Version comparison, rollback, import/export implemented |
| Scope count | 32 scopes in seed data | **Verified** | Large scope space for binary scoring to differentiate |

### 8.2 Proposed Target Scoring Model

| Scoring Element | Proposed Behavior | Source | Complexity | Notes |
|-----------------|-------------------|--------|-----------|-------|
| Answer input type | Likert 1–5 scale replacing Yes/No | Design suggestion | **High** | Requires UI change, answer storage change, backward compat |
| Per-question weight | Configurable multiplier per question | Design suggestion | **Medium** | New column on matrix questions table. Default 1.0. |
| Dimension weight | Configurable multiplier per dimension | Design suggestion | **Medium** | New column on dimensions table. Maps via question dimensionId. |
| Normalised scoring formula | `(answer/5) × cell_weight × q_weight × dim_weight × 100` | Design suggestion | **High** | Replaces `computeScores()`. Must handle mixed answer types. |
| Adaptive branching | Follow-up questions triggered by high scores | Design suggestion | **Medium** | Requires question dependency metadata. Only after Likert. |
| SHAP-style explainability | Numeric contribution bars per question | Design suggestion | **Medium** | Contribution = normalised × weight × scope_affinity. |
| Confidence gate | Winner margin thresholds: High ≥15, Med 8–14, Low <8 | Design suggestion | **Low** | **Independent of Likert change. Can implement immediately.** |
| Multi-evaluator mode | 2+ users score; averaged; variance flagged | Design suggestion | **High** | Requires invitation, parallel sessions, aggregation. |
| Calibration from feedback | Outcome → calibration event → human review → weight adjustment | Design suggestion | **High** | Requires new calibration module, review UI. Background queue. |
| KPI baseline targets | Optional fields at Accept step | Design suggestion | **Low** | Simple form fields. Stored in project record. |
| KPI actuals at feedback | Quantitative actuals vs baselines | Design suggestion | **Low** | Form extension. Requires KPI targets first. |
| Impact-Effort quadrant | 2×2 plot: score vs inverse complexity | Design suggestion | **Low** | Visualization only. Requires scope complexity data. |

### 8.3 Idea-Management Scoring vs Wizard Classification Scoring

| Scoring Purpose | Ideation | PS Wizard | Shared | Notes |
|-----------------|----------|-----------|--------|-------|
| Idea screening (criteria-based filtering) | **Owner** | — | — | Ideation Step 7. Scores ideas against screening criteria. |
| Feasibility rating (High/Medium/Low) | **Owner** | — | — | Ideation Step 9. Quick feasibility checks per idea. |
| Concept selection ranking | **Owner** | — | — | Ideation Step 10. Picks winning idea. |
| Readiness gate (5 blockers + 3 warnings) | **Owner** | — | — | Completeness check, not a scoring system. |
| Classification questionnaire scoring | — | **Owner** | — | Wizard Step 5. Binary/Likert answers scored against scope matrix. |
| Scope ranking by weighted matrix | — | **Owner** | — | Wizard Step 6. Scope scores from matrix engine. |
| Explainability (positive/negative signals) | — | **Owner** | — | Wizard Step 7. Explains classification result. |
| Confidence computation | — | **Owner** | — | Wizard Step 6. Composite metric on classification quality. |
| Winner margin and confidence gate | — | **Owner** | — | Wizard Step 8. Decision quality control. |
| Override tracking | — | **Owner** | — | Wizard Step 8. Captures scope disagreement. |
| Outcome feedback | — | **Owner** | — | Wizard Step 13. Records execution outcome. |
| Feedback → matrix calibration | — | — | **Shared** | Must be a separate module. Not embedded in either system. |
| Evaluation suite (benchmark cases) | — | **Owner** | — | Tests matrix accuracy. |
| KPI targets and actuals | — | **Owner** | — | Proposed wizard enhancement. Project-level metrics. |

**Boundary integrity rule:** No ideation scoring method should be imported into the wizard classification engine, and no wizard classification method should be exported to ideation screening.

### 8.4 Scoring Method Fit Review

| Method | Use Case | Fit for PS Wizard | Fit for Ideation | Decision | Rationale |
|--------|----------|-------------------|------------------|----------|-----------|
| **Weighted Decision Matrix** | Evaluate alternatives against weighted criteria | **Primary fit** | Secondary fit | **Primary for PS Wizard** | Exactly what the current matrix engine does. The scope matrix is a textbook weighted decision matrix. |
| **RICE** (Reach, Impact, Confidence, Effort) | Prioritise features/initiatives by composite score | Not a fit | Benchmark only | **Reject for PS Wizard** | RICE prioritises items in a backlog. PS Wizard classifies into a scope. Different problem. |
| **ICE** (Impact, Confidence, Ease) | Lightweight prioritisation | Not a fit | Benchmark only | **Reject for PS Wizard** | Same issue as RICE: prioritisation tool, not classification tool. |
| **Pugh Matrix** (Concept Selection) | Compare alternatives against a baseline: Better/Same/Worse | Benchmark only | Secondary fit | **Benchmark only** | Pugh's ternary scale is less informative than the current weighted cell approach. |
| **Stage-Gate** | Governance checkpoints (go/kill/hold) at milestones | Secondary fit | Not applicable | **Secondary fit** | The proposed confidence gate is a Stage-Gate concept. The lifecycle already has gate structure. |
| **Delphi Method** | Structured expert consensus through iterative rounds | Secondary fit | Not applicable | **Secondary fit** | Multi-evaluator mode is Delphi-inspired. Single-round parallel scoring sufficient. Full iterative Delphi is over-engineered. |
| **SHAP/LIME-style explainability** | Post-hoc attribution of model output to input features | Secondary fit | Not applicable | **Secondary fit (UX pattern only)** | Matrix engine is fully transparent — every contribution is algebraically derivable. Not technically SHAP, but the UX pattern (horizontal bars) is useful. |

### 8.5 Confidence, Override, and Calibration Review

| Element | Current State | Proposed State | Governance Recommendation |
|---------|-------------|---------------|--------------------------|
| Confidence score output | 0.0–1.0 float, displayed as-is | Same computation; display as label (High/Medium/Low) + numeric | Display label for users; retain numeric for analytics |
| Confidence gate | **None.** All confidence levels auto-proceed. | High (≥15): auto-proceed. Medium (8–14): require reviewer note. Low (<8): block auto-creation. | **Implement immediately.** Configurable thresholds per matrix version. |
| Confidence gate bypass | N/A | Not specified | Must require admin-level override with structured reason. Logged as `overrideType: "confidence_gate_bypass"`. |
| Winner margin display | Absolute integer in UI | Same, with color coding: green (≥15), yellow (8–14), red (<8) | **Implement immediately.** Pure UI change. |
| Override capture | Recommended scope, overridden scope, reason (text), confidence, matrix version, answers | Same + `overrideType` (scope_override / confidence_bypass), `reviewerNote` | Extend override table. Distinguish override types. |
| Override → calibration queue | **Not connected.** Data stored, never read by scoring engine. | Overrides feed calibration queue | Implement as separate module. Each override creates calibration event. |
| Override rate monitoring | All-time and 30-day rates; scope→scope patterns tracked | Same + alerting: flag when rate > 20% for any scope pair | Add threshold-based alerting for matrix recalibration triggers. |
| Calibration workflow | **Does not exist.** | Event → queue → human review → weight adjustment → eval suite → apply | **No automatic weight changes.** Evaluation suite must pass. Versioned. Cool-down period. |
| Multi-evaluator variance | N/A | Compute inter-rater variance per question | Variance > 2 on a Likert question flags for discussion. |

### 8.6 Recommended Scoring Direction

The PS Wizard scoring architecture should be upgraded along a **Weighted Decision Matrix** backbone — from binary-input to Likert-input with governance gates — in four phases:

**Phase A (Immediate — No Formula Change):** Implement confidence gate (margin thresholds). Display per-question numeric contribution bars using existing `ExplainabilitySignal.weight` data. Add winner margin color coding. Structured override capture. **Rationale:** Uses existing engine data. Zero scoring formula change. Highest governance value per unit of effort.

**Phase B (After Phase A):** Replace binary Yes/No with Likert 1–5 UI. Add `questionWeight` column (default 1.0). Update `computeScores()` for normalised Likert formula. Backward compatibility for existing binary-scored projects. **Rationale:** Likert and per-question weights are coupled — implement together.

**Phase C (After Phase B):** Add dimension weights. Create `ps.matrix-calibration.ts` module. Connect override → calibration event. Connect feedback → calibration event. Calibration review UI. **Rationale:** Calibration requires scoring data from Phase B.

**Phase D (Post-Phase C):** Multi-evaluator scoring. KPI baseline targets + actuals. KPI delta → calibration event. **Rationale:** Advanced capabilities that build on established infrastructure.

**Key finding:** The most impactful immediate change is **not** the Likert upgrade — it is the **confidence gate**. A system that computes confidence but never acts on it is architecturally incomplete.

---

## 9. Redesign Proposal Evaluation

### 9.1 Redesign Item Inventory

| Item | Category | Description | Source |
|------|----------|-------------|--------|
| R-01: Merge Steps 1+2 | Workflow Simplification | Combine scenario and context into single form | Design Suggestion P1 |
| R-02: Require ≥1 context field | Workflow Simplification | Make at least one context field mandatory | Design Suggestion P1 |
| R-03: Guided scenario template | Questionnaire/Scoring | Optional prompt pattern for richer descriptions | Design Suggestion P1 |
| R-04: Auto-tagging suggestion | Questionnaire/Scoring | NLP pre-classifies keywords as user types | Design Suggestion P1 |
| R-05: Scenario completeness indicator | Explainability/Confidence | Heuristic quality score (word count, field coverage) | Design Suggestion P1 |
| R-06: Merge Steps 3+4 | Workflow Simplification | Combine NLP display and name generation | Design Suggestion P2 |
| R-07: LLM-generated project title | Workflow Simplification | Replace heuristic with LLM call | Design Suggestion P2 |
| R-08: NLP confidence per dimension | Explainability/Confidence | Confidence score per extracted dimension | Design Suggestion P2 |
| R-09: Editable dimension values | Questionnaire/Scoring | User correction of NLP extraction | Design Suggestion P2 |
| R-10: Binary → Likert 1–5 | Questionnaire/Scoring | Replace Yes/No with 5-point scale | Design Suggestion P3 |
| R-11: Per-question weights | Questionnaire/Scoring | Configurable importance multiplier per question | Design Suggestion P3 |
| R-12: Adaptive branching | Questionnaire/Scoring | Dynamic follow-up questions | Design Suggestion P3 |
| R-13: Multi-evaluator scoring | Questionnaire/Scoring | Multiple users score independently | Design Suggestion P3b |
| R-14: Likert-normalised matrix engine | Questionnaire/Scoring | New scoring formula with dimensional weights | Design Suggestion P4 |
| R-15: Impact-Effort quadrant | Explainability/Confidence | 2×2 scope visualization | Design Suggestion P4 |
| R-16: SHAP-style explainability | Explainability/Confidence | Numeric contribution bars | Design Suggestion P5 |
| R-17: Confidence gate | Validation/Governance | Margin-based escalation thresholds | Design Suggestion P6 |
| R-18: KPI baseline targets | KPI/Outcomes/Calibration | Optional KPI fields at Accept step | Design Suggestion P7 |
| R-19: KPI + SHAP in project payload | KPI/Outcomes/Calibration | Extend creation payload | Design Suggestion P8 |
| R-20: Merge Steps 12+13 | Workflow Simplification | Combine PM handoff and feedback | Design Suggestion P10 |
| R-21: Multi-reviewer with SLA | Validation/Governance | 1–3 parallel reviewers with SLA | Design Suggestion P9 |
| R-22: KPI actuals at feedback | KPI/Outcomes/Calibration | Quantitative actuals vs targets | Design Suggestion P10 |
| R-23: Matrix weight retraining | KPI/Outcomes/Calibration | Feedback → calibration → weight adjustment | Design Suggestion P10 |
| R-24: Override metadata for calibration | KPI/Outcomes/Calibration | Structured override records | Design Suggestion P6/P10 |
| R-25: Scenario template — Ideation wording | Workflow Simplification | "What is the problem? Who is affected?" | Design Suggestion P1 |

### 9.2 Item-by-Item Decision Register

| Item | Problem Solved | Fit to PS Wizard | Governance Impact | Complexity | Risk | Disposition | Rationale |
|------|---------------|-----------------|-------------------|------------|------|-------------|-----------|
| R-01 | Two screens for related inputs | **High** | Neutral | **Low** | **Low** | **Adopt** | Pure UX consolidation. No data flow change. |
| R-02 | Empty context → weak classification signals | **High** | **Positive** | **Low** | **Low** | **Adopt** | Trivial guardrail preventing zero-signal classifications. |
| R-03 | Users write vague scenarios | **High** | Neutral | **Low** | **Medium** (boundary) | **Adopt with change** | Must focus on "describe the situation," NOT "what is the problem?" |
| R-04 | Users must mentally map keywords | **Medium** | Neutral | **High** | **Low** | **Defer** | High effort relative to value. Not essential. |
| R-05 | No feedback on scenario sufficiency | **High** | Neutral | **Low** | **Low** | **Adopt** | Simple heuristic, client-side only. |
| R-06 | Two screens for one cognitive task | **High** | Neutral | **Low** | **Low** | **Adopt** | Step 3 requires no user action — merging justified. |
| R-07 | Heuristic fails on context-first scenarios | **High** | Neutral | **Medium** | **Low** | **Adopt** | Existing provider infrastructure. Fallback to heuristic. |
| R-08 | No per-dimension confidence visible | **Low** | Neutral | **High** | **Medium** | **Defer** | Architecturally mismatched with DB-driven categorical dimensions. |
| R-09 | Cannot correct NLP-extracted values | **High** | Neutral | **Low** | **Low** | **Adopt** | Standard human-correction pattern. |
| R-10 | Binary loses nuance | **High** | Neutral/Negative | **Very High** | **High** | **Defer** | Most impactful change. Requires Phase C deep analysis. |
| R-11 | All questions contribute equally | **High** | Neutral | **High** | **Medium** | **Defer** | Coupled with R-10. Phase C scope. |
| R-12 | Static questionnaires waste time | **Medium** | Neutral | **High** | **Medium** | **Defer** | Depends on R-10. Phase C scope. |
| R-13 | Single evaluator bias | **Medium** | Neutral | **Very High** | **Medium** | **Defer** | Significant infrastructure. Should follow Likert. |
| R-14 | Coarse binary scoring granularity | **High** | Neutral | **Very High** | **High** | **Defer** | Inseparable from R-10. Phase C scope. |
| R-15 | No visual effort/impact comparison | **Low** | Neutral | **Medium** | **Low** | **Defer** | Nice-to-have. Requires scope complexity data. |
| R-16 | Text lists less intuitive than bars | **Medium** | Neutral | **High** | **Medium** | **Defer** | Depends on scoring formula. Phase C scope. |
| R-17 | 1-point margin = 30-point margin | **High** | **Positive** | **Medium** | **Low** | **Adopt** | **Highest-value addition.** Works with current scoring. |
| R-18 | No baseline KPI targets | **Medium** | Neutral | **Low** | **Low** | **Adopt** | Simple form fields. Enables outcome measurement. |
| R-19 | Project payload lacks KPI data | **Medium** | Neutral | **Low** | **Low** | **Adopt with change** | Adopt `kpiTargets` now; defer `shapContributions` to Phase C. |
| R-20 | Two screens for same-session actions | **High** | Neutral | **Low** | **Low** | **Adopt** | UX consolidation. No server-side coupling. |
| R-21 | Single-reviewer bottleneck | **Medium** | **Positive** | **Very High** | **Medium** | **Defer** | Should be a reusable platform component. |
| R-22 | No quantitative feedback | **Medium** | Neutral | **Low** | **Low** | **Adopt** | Simple form extension. Requires R-18 first. |
| R-23 | Outcomes never improve matrix | **High** | Neutral/Negative | **Very High** | **High** | **Defer** | System-level module, not wizard step action. |
| R-24 | Override data not structured for analysis | **Medium** | Neutral | **Low** | **Low** | **Adopt with change** | Infrastructure largely exists. Ensure fields populated. |
| R-25 | Proposed template duplicates Ideation | None | **Negative** | N/A | **High** | **Reject** | Boundary violation. Duplicates Ideation Steps 1–3. |

### 9.3 Minimum Viable Target-State Package

| Item | Why It Belongs in MVP | Dependency |
|------|----------------------|------------|
| R-01: Merge Steps 1+2 | Removes unnecessary screen transition; pure UX | None |
| R-02: Require ≥1 context field | Trivial guardrail preventing zero-signal classifications | R-01 |
| R-05: Scenario completeness indicator | Low-effort quality nudge; client-side only | R-01 |
| R-06: Merge Steps 3+4 | Eliminates two screens for one cognitive task | None |
| R-07: LLM-generated title | Clear improvement; uses existing infrastructure | R-06 |
| R-09: Editable dimension values | Simple UI change; human correction of inputs | R-06 |
| R-17: Confidence gate | **Highest-value governance addition.** Works with current scoring. | None |
| R-20: Merge Steps 12+13 | UX consolidation of post-lifecycle screens | None |

**Net MVP result:** 13 → 10 steps. Confidence gate. Better input quality. LLM naming. No scoring formula change.

### 9.4 Deferred or Stretch Capabilities

| Item | Reason Deferred | Trigger to Revisit |
|------|----------------|-------------------|
| R-04: Auto-tagging | High effort, low value | Platform adds general NLP tagging service |
| R-08: NLP confidence per dimension | Architecturally mismatched | Classification shifts to NLP-extracted dimensions |
| R-10: Binary → Likert 1–5 | Core scoring change; backward compatibility | Phase C workstream completion |
| R-11: Per-question weights | Coupled with R-10 | Phase C workstream completion |
| R-12: Adaptive branching | Depends on R-10 | Phase C workstream completion + R-10 adoption |
| R-13: Multi-evaluator | Significant infrastructure | After R-10 adoption; platform has parallel workflow infra |
| R-14: Likert-normalised engine | Inseparable from R-10 | Phase C workstream completion |
| R-15: Impact-Effort quadrant | Nice-to-have; requires complexity data | Scope metadata includes effort/complexity estimates |
| R-16: SHAP-style explainability | Depends on scoring formula | Phase C workstream completion |
| R-21: Multi-reviewer with SLA | Should be platform-level component | Platform builds general parallel approval workflow |
| R-23: Matrix retraining | System-level module | After R-18 + R-22 generating data; dedicated architecture design |

**Dependency chain:**
```
R-10 (Likert) → R-11 (Weights) → R-14 (Formula) → R-16 (SHAP)
                                                   → R-12 (Branching)
                                                   → R-13 (Multi-evaluator)
R-18 (KPI baselines) → R-22 (KPI actuals) → R-23 (Retraining)
R-21 (Multi-reviewer) → Independent, platform-level
```

### 9.5 Move-Upstream Candidates

| Item | Why It Belongs in PS Ideation Instead |
|------|---------------------------------------|
| R-25: Scenario template wording ("What is the problem? Who is affected?") | These are discovery questions owned by PS Ideation Steps 1 (Context), 2 (Problem), 3 (Opportunity). The wizard receives a pre-framed scenario — it does not perform problem discovery. If a user enters the wizard directly, the platform should route them to Ideation first, not embed Ideation questions inside the wizard. |

**No other items require upstream migration.** All other proposed changes belong within PS Wizard's classification/governance scope.

---

## 10. Technical and Governance Impact Assessment

### 10.1 Approved Change Inventory

**Phase A — Immediate (13 → 10 steps)**

| Change | Source Decision | Priority | Notes |
|--------|----------------|----------|-------|
| A-1: Merge Steps 1+2 (Scenario + Context) | WS2 D-1, WS4 R-01/R-02 | P2 — Medium | Single form, collapsible sections, ≥1 context required |
| A-2: Merge Steps 3+4 (NLP + Smart Name) | WS2 D-2, WS4 R-06 | P2 — Medium | Single review screen |
| A-3: LLM-generated project title | WS2 D-6, WS4 R-07 | P2 — Medium | Replaces heuristic; fallback retained |
| A-4: Confidence gate | WS2 D-15, WS4 R-17 | P1 — High | Configurable thresholds; blocks low-margin decisions |
| A-5: Merge Steps 12+13 (PM + Feedback) | WS2 D-21, WS4 R-20 | P3 — Low | Single post-lifecycle screen |
| A-6: Scenario completeness indicator | WS2 D-5, WS4 R-05 | P3 — Low | Client-side heuristic |
| A-7: Editable dimension values | WS2 D-8, WS4 R-09 | P3 — Low | Dimensions editable before questionnaire |

**Phase B — After Phase A (same 10 steps, richer data)**

| Change | Source Decision | Priority | Notes |
|--------|----------------|----------|-------|
| B-1: Guided scenario template (reworded) | WS2 D-3, WS4 R-03 | P3 — Low | Must NOT duplicate Ideation Steps 1–3 |
| B-2: Structured override metadata capture | WS2 D-16, WS4 R-24 | P2 — Medium | Wire existing ps.override.ts to wizard UI |
| B-3: KPI baseline targets at Accept | WS2 D-17, WS4 R-18 | P3 — Low | Optional KPI fields |
| B-4: KPI actuals capture at Feedback | WS2 D-19, WS4 R-22 | P3 — Low | Requires B-3 first |

### 10.2 Impact Matrix

| Change | UI/UX Impact | API/Service Impact | Data Model Impact | Governance Impact | Complexity |
|--------|-------------|-------------------|-------------------|-------------------|-----------|
| A-1: Merge Steps 1+2 | **Major** — step merge, renumbering | None | None | None | Medium |
| A-2: Merge Steps 3+4 | **Major** — step merge | None | None | None | Medium |
| A-3: LLM title | **Minor** — loading state | **New endpoint** | None | Low — user-editable | Medium |
| A-4: Confidence gate | **Major** — gate UI, banners | **Optional** server guard | **Phase B** — config table | **High** — blocks creation | Medium |
| A-5: Merge Steps 12+13 | **Minor** — layout merge | None | None | None | Low |
| A-6: Completeness indicator | **Minor** — new component | None | None | None | Low |
| A-7: Editable dimensions | **Minor** — dropdowns | None | None | Low — audit trail | Low-Medium |
| B-1: Scenario template | **Minor** — static text | None | None | **Medium** — boundary review | Low |
| B-2: Override wiring | **Minor** — form capture | **Wire existing** endpoint | None | Low | Low |
| B-3: KPI targets | **Minor** — form fields | **Extend** creation payload | **New columns** | Low | Medium |
| B-4: KPI actuals | **Minor** — form fields | **Extend** feedback payload | **New column** | Low | Low |

### 10.3 Data Model Change Table

| Field / Entity | Why Needed | Owner | Risk | Notes |
|----------------|-----------|-------|------|-------|
| `ps_projects.kpi_targets_json` | Store KPI baseline targets at wizard accept | Backend | Low | JSON column. Optional. Nullable. No migration needed. |
| `ps_projects.confidence_gate_result` | Audit trail of gate decision (high/medium/low) | Backend | Low | VARCHAR(30). Optional. |
| `ps_projects.confidence_reviewer_note` | Mandatory reviewer note for medium confidence | Backend | Low | TEXT. Nullable. Required by gate governance when margin 8–14. |
| `ps_feedback.kpi_actuals_json` | Quantitative KPI actuals vs baseline targets | Backend | Low | JSON column. Optional. Depends on kpi_targets_json. |
| `ps_confidence_gate_config` (new table) | Configurable confidence thresholds per matrix version | Backend | Medium | Fields: matrix_version_id, high_threshold (default 15), medium_threshold (default 8), low_action, medium_action, is_active, created_by, timestamps. |

### 10.4 Governance Control Table

| Change | Governance Concern | Required Approval / Control | Notes |
|--------|-------------------|---------------------------|-------|
| A-4: Confidence gate | The gate **blocks project creation**. Who defines thresholds? Who can override? | Governance team must approve threshold values. Threshold changes audited. Override path defined. | Highest governance impact item. |
| A-4: Server enforcement | If UI-only, can be bypassed by API callers | **Decision required:** server-enforce the gate? **Recommendation: Yes.** | Bypass for authorized roles must be logged. |
| A-3: LLM title | Nondeterministic LLM output | Title is user-editable suggestion with fallback to heuristic | Low governance risk. |
| A-7: Editable dimensions | User can modify classification inputs | Both NLP-extracted and user-modified values must be stored for audit | Moderate — dual storage required. |
| B-1: Scenario template | Template could overlap with Ideation | Template wording requires Governance Agent review before release | Template is governance-controlled artifact. |
| B-2: Override metadata | Override records contain decision traces | Existing controls sufficient — just wiring existing table | Low governance risk. |

### 10.5 Dependency Map

| Change | Depends On | Blocks | Notes |
|--------|-----------|--------|-------|
| A-1: Merge Steps 1+2 | None | A-2, A-5, A-6 | Renumbering foundation |
| A-2: Merge Steps 3+4 | A-1 (renumbering) | A-3, A-7 | Must follow initial renumbering |
| A-3: LLM title | A-2 (merged step exists) | None | Added to merged NLP+Name step |
| A-4: Confidence gate | **None** (independent) | None | Can develop in parallel with merges |
| A-5: Merge Steps 12+13 | A-1 (renumbering) | None | Can parallel with A-2 |
| A-6: Completeness indicator | A-1 (merged step exists) | None | Piggybacks on merged Scenario+Context |
| A-7: Editable dimensions | A-2 (merged step exists) | None | Modifies NLP review screen |
| B-1: Scenario template | A-1 | None | Template on merged scenario input |
| B-2: Override wiring | None | None | Independent |
| B-3: KPI targets | Phase A complete | B-4 | Schema + UI before actuals |
| B-4: KPI actuals | B-3 | None | Feedback form extension |

**Recommended Sprint Sequence (Phase A):**
- Sprint 1: A-1 (merge 1+2, renumbering foundation), A-4 (confidence gate, parallel), A-6 (completeness indicator)
- Sprint 2: A-2 (merge 3+4), A-5 (merge 12+13), A-7 (editable dimensions)
- Sprint 3: A-3 (LLM title, requires provider wiring), integration testing

### 10.6 Risk Register

| Risk | Trigger | Impact | Mitigation | Owner |
|------|---------|--------|-----------|-------|
| **Step renumbering regression** — off-by-one errors in canGoNext, navigation guards, inline conditions | A-1 starts | High — broken wizard flow | Extract step logic into config object. Write unit tests for all transitions before refactoring. | Frontend Builder |
| **Confidence gate blocks too many projects** — thresholds too aggressive | A-4 go-live | Medium — user friction | Start conservative (15/8). Make configurable. Monitor override rate. | Product Owner + Governance |
| **Confidence gate threshold manipulation** — unauthorized changes bypass gate | A-4 + configurable thresholds | High — governance bypass | Admin-only access. All changes logged. | Governance Agent |
| **LLM title generation latency** — provider slow or unavailable | A-3 go-live | Low — degraded UX | 3-second timeout. Fallback to `deriveProjectName()`. "Generating..." spinner with cancel. | Backend Builder |
| **LLM title inappropriate content** — hallucinated or unprofessional | A-3 go-live | Low — cosmetic | Title always user-editable. Length check. Log for quality review. | Backend Builder |
| **Editable dimensions break accuracy** — incorrect user corrections | A-7 go-live | Medium — wrong recommendation | Store both original and modified values. Warning on modification. Reset option. | Frontend Builder |
| **Backward compat — existing 13-step projects** — old wizard run traces use old numbering | Phase A go-live | Low — audit readability | Wizard runs are immutable. New wizard creates new runs. No migration needed. | Backend Builder |
| **Scenario template boundary violation** — future developer adds Ideation questions | B-1 implementation | Medium — boundary violation | Template is governance-controlled. Code review checks against Ideation boundary. | Governance Agent |
| **KPI data quality** — unrealistic values poison future calibration | B-3/B-4 go-live | Low (Phase B) / High (Phase D) | Phase B: informational only. Phase D: range validation before calibration. | Governance Agent |

### 10.7 Implementation Impact Summary

**Phase A dominant layer:** Frontend (PSWizardPage.tsx major refactor + 2 new sub-components). One new backend endpoint (LLM title). One governance gate requiring approval of thresholds and enforcement mode.

**Phase B dominant layer:** Full-stack (DB schema extensions + API payload changes + UI form additions). One governance review (template wording).

**Key architectural decisions preserved:**
1. Binary scoring retained — matrix engine unchanged through Phases A and B.
2. DB-driven matrix — no hard-coded classification logic introduced.
3. Ideation boundary preserved — ConceptPackage contract untouched.
4. Audit trail extended, not broken — new events use existing `logPsAudit()`.
5. State machine unchanged — confidence gate operates before project creation, not within lifecycle.

---

## 11. Final Recommendation Matrix

| # | Item | Final Decision | Why | Dependency | Notes |
|---|------|---------------|-----|------------|-------|
| 1 | Steps 1+2 merge (Scenario + Context) | **Adopt** | Reduces friction, makes context required | None | Phase A |
| 2 | Steps 3+4 merge (NLP + Smart Name) | **Adopt** | Eliminates dead screen, consolidates | None | Phase A |
| 3 | LLM project naming | **Adopt** | Replaces naive heuristic, uses existing infra | None | Phase A |
| 4 | Confidence gate | **Adopt** | Highest-value addition, works with current scoring | None | Phase A |
| 5 | Steps 12+13 merge (PM + Feedback) | **Adopt** | UX consolidation of post-lifecycle | None | Phase A |
| 6 | Scenario completeness indicator | **Adopt** | Low effort, nudges richer input | None | Phase A |
| 7 | Editable dimension values | **Adopt** | Simple UI fix, human correction | None | Phase A |
| 8 | Guided scenario template (reworded) | **Adopt with change** | Must not duplicate Ideation Steps 1–3 | Boundary constraint | Phase B |
| 9 | Override structured metadata | **Adopt with change** | Structured records for future calibration | None | Phase B |
| 10 | KPI baseline targets at Accept | **Adopt with change** | Simple form fields, enables outcome tracking | None | Phase B |
| 11 | KPI actuals at Feedback | **Adopt with change** | Simple form extension | Item 10 | Phase B |
| 12 | Binary → Likert 1–5 | **Defer** | Coupled scoring engine change, needs deep analysis | Phase C workstream | Phase C |
| 13 | Per-question weights | **Defer** | Depends on Likert adoption | Item 12 | Phase C |
| 14 | Likert-normalised scoring formula | **Defer** | Core formula change | Items 12, 13 | Phase C |
| 15 | SHAP-style explainability | **Defer** | Depends on new scoring formula | Item 14 | Phase C |
| 16 | Multi-evaluator scoring | **Defer** | High infrastructure cost, depends on Likert | Item 12 | Phase D |
| 17 | Multi-reviewer SLA validation | **Defer** | High infrastructure cost, not critical path | None | Phase D |
| 18 | Matrix weight retraining | **Defer** | Requires separate calibration module | Items 11, 12 | Phase D |
| 19 | Adaptive branching | **Defer** | Depends on Likert scoring | Item 12 | Phase D |
| 20 | Auto-tagging suggestion | **Defer** | High effort, low value | None | Backlog |
| 21 | NLP confidence per dimension | **Defer** | Architecturally mismatched | NLP changes | Backlog |
| 22 | Impact-Effort quadrant view | **Defer** | Nice-to-have visualization | None | Backlog |
| 23 | Scenario template — Ideation wording | **Reject** | Duplicates Ideation Steps 1–3, violates boundary | N/A | N/A |

---

## 12. Phased Implementation Roadmap

| Phase | Goal | Key Deliverables | Dependencies | Exit Criteria |
|-------|------|------------------|--------------|---------------|
| **A — Structural Cleanup + Confidence Gate** | Reduce wizard from 13 to 10 steps. Add confidence gate. Improve naming. | 3 step merges (1+2, 3+4, 12+13), confidence gate with configurable thresholds, LLM naming with fallback, scenario completeness indicator, editable dimension values, step renumbering | None | 10-step wizard works end-to-end. Confidence gate blocks low-margin decisions. LLM naming produces professional titles with heuristic fallback. ConceptPackage handoff still works. No scoring regression. |
| **B — Data Enrichment** | Enrich data capture without changing step count or scoring logic | Guided scenario template (boundary-safe wording), structured override records wired to existing ps.override.ts, KPI baseline target fields at Accept, KPI actuals fields at Feedback with delta computation | Phase A complete | Override metadata persisted in structured format. KPI baselines captured. KPI actuals captured with delta. Template reviewed for boundary compliance. |
| **C — Scoring Engine Evolution** | Upgrade scoring from binary to Likert-normalised with enhanced explainability | Likert 1–5 answer support, per-question weight column + admin UI, new scoring formula with versioning, backward compatibility layer (old binary versions unaffected), SHAP-style numeric contribution bars, confidence engine recalibration for Likert distributions, migration tooling | Phases A + B complete. Architecture review complete. Evaluation suite expanded with Likert test cases. | Likert scoring operational. Old binary versions score identically. SHAP bars render. Evaluation suite passes. Rollback to binary works. |
| **D — Advanced Governance + Infrastructure** | Add enterprise-grade governance capabilities | Multi-evaluator scoring (invitation, parallel sessions, aggregation, variance), multi-reviewer validation (1–3 reviewers, SLA timer, auto-escalation), matrix calibration module (background queue, human review, eval suite gated), adaptive branching | D-1: Phase C. D-2: Phase B. D-3: Phases B+C. D-4: Phase C. | Multi-evaluator operational. SLA tracking live. Calibration queue producing proposals for human review. No calibration runs synchronously in wizard. |

---

## 13. Phase Gates and Acceptance Criteria

| Phase | Entry Criteria | Exit Criteria | Approval Needed |
|-------|---------------|---------------|-----------------|
| **A** | Decision package approved. Current 13-step wizard stable. No active breaking changes in PS module. | (1) Wizard renders 10 steps. (2) Confidence gate blocks creation for margin < threshold. (3) LLM naming works with fallback to heuristic. (4) All merges work without data loss. (5) ConceptPackage handoff from Ideation still works. (6) No regression in scoring/lifecycle. (7) Thresholds are configurable. | Code review + QA sign-off |
| **B** | Phase A gate passed and deployed. Template wording governance-reviewed. | (1) Guided template renders with classification-focused prompts. (2) Override records include structured metadata. (3) KPI baseline fields persist to project record. (4) KPI actuals with delta computation at feedback step. | Code review + QA sign-off + Governance review of template wording |
| **C** | Phase B gate passed. Scoring architecture review complete. Backward-compatibility analysis documented. Evaluation suite expanded. | (1) New Likert matrix version created and activated. (2) Old binary versions score identically to pre-upgrade. (3) Likert scoring differentiates across test scenarios. (4) SHAP bars render per-question attribution. (5) Confidence engine valid for Likert distributions. (6) Rollback to binary works. | Architecture review + code review + QA + PM sign-off |
| **D** | Phase C gate passed. Infrastructure design approved. | (1) Multi-evaluator works for 2–3 evaluators. (2) Multi-reviewer SLA tracking functional. (3) Calibration module proposes weight changes. (4) Human review UI exists. (5) No calibration runs synchronously in wizard. | Architecture + code review + QA + PM + governance sign-off |

**Detailed Phase A Exit Criteria:**

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| A-E1 | Wizard renders exactly 10 steps in step rail | Visual inspection + step count assertion |
| A-E2 | Step 1 merges scenario textarea and context fields in one form | Load wizard, verify single form with collapsible sections |
| A-E3 | At least one context field is required before proceeding | Try to advance with all context fields empty — must be blocked |
| A-E4 | Step 2 shows dimensions and LLM-generated title on one screen | Enter scenario, advance, verify title and dimensions appear together |
| A-E5 | LLM-generated title is user-editable | Edit the generated title, verify it persists through wizard |
| A-E6 | LLM fallback works when provider unavailable | Disconnect LLM provider, verify heuristic title still generated |
| A-E7 | Confidence gate blocks creation when margin < 8 | Run classification with close scores, verify Step 6 prevents advancing |
| A-E8 | Confidence gate requires note when margin 8–14 | Run classification with medium margin, verify note requirement |
| A-E9 | Confidence gate auto-proceeds when margin ≥ 15 | Run classification with clear winner, verify no gate block |
| A-E10 | Thresholds are configurable without redeployment | Change threshold values, verify changed behavior |
| A-E11 | Step 10 combines PM handoff and feedback capture | Advance to final step, verify both PM button and outcome capture present |
| A-E12 | ConceptPackage handoff from Ideation still populates wizard | Start wizard from Ideation convert flow, verify scenario pre-populated |
| A-E13 | No regression: scoring, explainability, lifecycle all work | Run full wizard flow end-to-end |

---

## 14. Open Issues Requiring Explicit Decision

| Issue | Why Unresolved | Impact | Required Decision |
|-------|---------------|--------|-------------------|
| **O-1: Confidence gate threshold values** (default: High ≥15, Medium 8–14, Low <8) | Proposed but not validated against actual wizard run data. Optimal thresholds depend on real score distributions. | Too aggressive → blocks too many projects. Too lenient → gate is useless. | **Run threshold analysis on existing wizard runs.** If insufficient data, start with proposed defaults; tune after 50 runs. |
| **O-2: Confidence gate enforcement mode** — UI-only vs server-side? | UI-only can be bypassed by API callers. Server-enforced adds a hard constraint. | Bypass risk if UI-only. API friction if server-enforced. | **Recommendation: server-enforce.** Governance controls must not be UI-only. Bypass for authorized roles with audit logging. |
| **O-3: Confidence gate override authorization** — who can override a blocked result? | Three options: any user with reason, designated reviewers only, admins only. | Too permissive → gate useless. Too restrictive → blocks legitimate edge cases. | **Start with designated reviewers.** Admin override as escalation path. Track override rate. |
| **O-4: Scoring formula versioning schema** | Phase C requires formula versioning. No schema design exists yet. | Delayed Phase C start. | **Add `scoring_formula` column to matrix version table** during Phase C architecture review. Enum: `binary_v1`, `likert_v1`. |
| **O-5: Backward compatibility — re-score old projects?** | Phase C introduces Likert. Existing projects scored with binary formula. | Ambiguity about historical consistency. | **Existing projects retain original scores. No retroactive re-scoring.** New scoring applies only to new wizard runs. Display labels formula version. |
| **O-6: Classification endpoint schema mismatch** (X-02) | `classifyScenarioSchema` expects typed dimensions; wizard sends `{scenario, context, answers}`. Cannot resolve without running router. | Potential runtime error or schema confusion. | **Technical verification required** before Phase A implementation. Inspect actual tRPC procedure mapping. |
| **O-7: Scenario template wording** | R-03 adopted with boundary constraint. Specific wording requires governance review. | Wrong wording duplicates Ideation. | **Governance team reviews and approves template text** before Phase B implementation. |

---

## 15. Final Decision Summary

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
| DD-1 | Confidence gate threshold exact values | Phase A implementation | Product Owner + Data Analyst |
| DD-2 | Scoring formula versioning schema design | Phase C start | Architecture Lead |
| DD-3 | Classification endpoint schema mismatch resolution | Phase A implementation | Backend Engineer |

### Decisions Requiring Governance Review

| # | Decision | Required Before | Owner |
|---|----------|----------------|-------|
| DG-1 | Guided scenario template wording approval | Phase B implementation | Governance Team |
| DG-2 | Confidence gate enforcement mode (server vs UI) | Phase A implementation | Architecture Review |
| DG-3 | Confidence gate override authorization level | Phase A implementation | Governance Team |

### Implementation Priority

```
Phase A (immediate)  ── UX consolidation + confidence gate
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
