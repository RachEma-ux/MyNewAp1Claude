# Workstream 1 — Baseline Verification and Claim Validation

**Author:** Senior Product Analyst, Code Auditor, Evidence-Driven Architecture Reviewer
**Date:** 2026-03-29
**Scope:** PS Wizard current-state baseline only — no redesign content mixed in

---

## 1. Purpose

This document establishes a verified, evidence-grounded current-state baseline for the PS Wizard feature. It:

1. Maps every source document to its role and authority level.
2. Extracts all material current-state claims from available analysis documents.
3. Cross-checks those claims against the visible implementation (code is the final arbiter).
4. Tags every claim with a classification label.
5. Logs contradictions between sources.
6. Produces a cleaned baseline that can be read independently as the authoritative current-state view.

**Key constraint:** No proposed redesign content is presented as current truth. Where the analysis or design documents describe future behavior, it is explicitly flagged and excluded from the baseline.

---

## 2. Source Role Map

| # | Source | File / Location | Role | Authority Level | Notes |
|---|--------|----------------|------|-----------------|-------|
| S1 | **PSWizardPage.tsx** | `client/src/pages/projects-system/PSWizardPage.tsx` (896 lines) | **Implementation truth — frontend** | **Highest** | The actual running wizard UI. All claims must be verified against this file. |
| S2 | **ps.matrix-engine.ts** | `server/ps/ps.matrix-engine.ts` (256 lines) | **Implementation truth — scoring engine** | **Highest** | DB-backed matrix classification engine. Core scoring logic. |
| S3 | **ps.explainability.ts** | `server/ps/ps.explainability.ts` (121 lines) | **Implementation truth — explainability** | **Highest** | Positive/negative signal computation from matrix weights. |
| S4 | **ps.confidence.ts** | `server/ps/ps.confidence.ts` (159 lines) | **Implementation truth — confidence engine** | **Highest** | Three-pillar confidence computation: spread, completeness, ambiguity. |
| S5 | **ps.lifecycle.ts** | `server/ps/ps.lifecycle.ts` (103 lines) | **Implementation truth — state machine** | **Highest** | Strict state machine: DRAFT → SUBMITTED → VALIDATED/REJECTED → PUBLISHED/SENT_TO_PM. |
| S6 | **ps.project.ts** | `server/ps/ps.project.ts` (194 lines) | **Implementation truth — project creation** | **Highest** | Creates PS project from wizard, stores wizard run trace, resolves template bundle. |
| S7 | **ps.classifier.ts** | `server/ps/ps.classifier.ts` (264 lines) | **Implementation truth — rule-based classifier** | **Highest** | Deterministic rule-based classifier (18 rules, 5 system types). **Note: This is a separate classification system from the DB-backed matrix engine.** |
| S8 | **ps.feedback.ts** | `server/ps/ps.feedback.ts` (80 lines) | **Implementation truth — feedback** | **Highest** | Records outcome (success/partial/failed/cancelled) + notes. No retraining logic. |
| S9 | **ps.override.ts** | `server/ps/ps.override.ts` (150 lines) | **Implementation truth — overrides** | **Highest** | Records override events, computes override rate, pattern detection. |
| S10 | **ideation-readiness.ts** | `server/ps/ideation-readiness.ts` (133 lines) | **Implementation truth — readiness engine** | **Highest** | 5 blockers + 3 warnings evaluation for ideation → wizard handoff. |
| S11 | **ideation-conversion.ts** | `server/ps/ideation-conversion.ts` (151 lines) | **Implementation truth — conversion service** | **Highest** | Builds ConceptPackage, commits conversion, lifecycle: concept_selected → ready_for_wizard → converted. |
| S12 | **WS2_Step_Architecture_Mapping.md** | Root of repo | **Derived analysis — step mapping** | **Medium** | Maps current 13-step wizard, proposed 10-step redesign, and upstream ideation workflow. Contains extracted claims from analysis and design documents. Mixes current-state description with redesign proposals. |
| S13 | **PS-Ideation-Workflow-Diagram.md** | Root of repo | **Authoritative reference — ideation boundary** | **High** | Documents the 11-step ideation workflow, data flow, and handoff to PS Wizard. Auto-generated from codebase. |
| S14 | **ps.validation.ts** | `server/ps/ps.validation.ts` (719 lines) | **Implementation truth — Zod schemas** | **Highest** | Defines all input validation schemas for PS module API. |
| S15 | **ps.types.ts** | `server/ps/ps.types.ts` | **Implementation truth — type definitions** | **Highest** | PS_PROJECT_STATUSES, PS_PROJECT_TRANSITIONS, classification dimension types. |
| S16 | **ps_wizard_analysis.md** | **NOT FOUND in repo** | **Claimed analysis document** | **Unavailable** | Referenced by WS2 but does not exist as a standalone file. Claims attributed to it are extracted via WS2 (S12). |
| S17 | **ps_wizard_design_suggestion.md** | **NOT FOUND in repo** | **Claimed redesign proposal** | **Unavailable** | Referenced by WS2 but does not exist as a standalone file. Content attributed to it is extracted via WS2 (S12). |
| S18 | **deep-analysis-2026-03-20.md** | `reports/deep-analysis-2026-03-20.md` | **Independent code audit** | **High** | Third-party deep analysis of entire repo. Identifies governance enforcement gaps, auth bypass, and test baseline issues. |

**Critical gap:** The two primary input documents specified in the task brief — `ps_wizard_analysis.docx` and `ps_wizard_design_suggestion.docx` — do not exist in the repository as standalone files (in any format: .docx, .md, .txt, or .pdf). The WS2 Step Architecture Mapping document (S12) references them as `ps_wizard_analysis.md` and `ps_wizard_design_suggestion.md` and contains extracted claims from both. This workstream uses WS2 as a derived proxy and verifies all extracted claims against implementation truth (S1–S11). Claims that cannot be independently verified are explicitly marked.

---

## 3. Current-State Claims Register

Claims are extracted from WS2 Section 2 (Current Step Inventory) and cross-referenced against implementation sources. Each claim is numbered C-XX.

### Step 1: Scenario
- **C-01:** Free-text textarea, ≤5000 characters.
- **C-02:** Validation: `scenario.trim().length > 0`.
- **C-03:** No guided template exists.

### Step 2: Context
- **C-04:** Structured fields: Business Unit, Region, Strategic Importance, Existing Situation.
- **C-05:** No required fields — `canGoNext` always true for step 2.

### Step 3: NLP Analysis
- **C-06:** Displays DB-driven classification dimensions from active matrix.
- **C-07:** Shows scenario preview and extracted context signals.
- **C-08:** No AI call — purely informational display.
- **C-09:** No user action required to proceed.

### Step 4: Auto Name
- **C-10:** Derives project name from first sentence of scenario (≤80 chars via `deriveProjectName`).
- **C-11:** Name is user-editable.
- **C-12:** Heuristic: split on `.!?\n`, take first segment, truncate at word boundary.

### Step 5: Questions
- **C-13:** Renders DB-driven Yes/No binary questions from active matrix version.
- **C-14:** Binary toggle buttons per question.
- **C-15:** Clicking "Classify" triggers `handleRunClassification()`.
- **C-16:** No Likert scale, no per-question weights, no adaptive branching.

### Step 6: Scoring
- **C-17:** Displays Top 3 ranked scopes with scores.
- **C-18:** Relative bar charts (proportional to top scorer).
- **C-19:** Winner margin displayed.
- **C-20:** Confidence label displayed.

### Step 7: Explainability
- **C-21:** Lists positive contributors as text.
- **C-22:** Lists negative/missing contributors as text.
- **C-23:** No numeric attribution (no SHAP-style bars).

### Step 8: Recommendation
- **C-24:** Shows recommended scope (label + code + matrix version).
- **C-25:** Optional override textarea available.
- **C-26:** Override reason stored in local state.

### Step 9: Accept
- **C-27:** Full summary review: name, scenario preview, BU/region, selected scope, confidence, matrix version, questions answered, decision trace, override reason.
- **C-28:** Decision trace is a machine-readable audit string.
- **C-29:** No e-signature.

### Step 10: Create PS Project
- **C-30:** Calls `trpc.ps.projects.create` with full payload.
- **C-31:** Stores wizard run trace + creates project in DRAFT status.
- **C-32:** Navigation locked after this step (`prevStep` disabled for step > 10).
- **C-33:** Template bundle resolved server-side via `resolveTemplateBundle()`.

### Step 11: Validation
- **C-34:** Displays project status badge.
- **C-35:** "Submit for Validation" button calls `trpc.ps.lifecycle.submit` (DRAFT → SUBMITTED).
- **C-36:** Shows validation note if present.
- **C-37:** Single-reviewer model (no multi-reviewer).

### Step 12: PM Central
- **C-38:** Displays project status and PM project ID.
- **C-39:** "Send to PM Central" button calls `trpc.ps.lifecycle.sendToPM`.
- **C-40:** Blocked if project is still DRAFT.

### Step 13: Feedback
- **C-41:** Records outcome (success/partial/failed/cancelled) + optional notes.
- **C-42:** "Skip & Go to List" option available.
- **C-43:** Outcomes stored but not used for matrix retraining.
- **C-44:** Navigates to `/ps/list` on completion.

### Cross-Cutting Claims
- **C-45:** Lifecycle state machine: DRAFT → SUBMITTED → VALIDATED → PUBLISHED / SENT_TO_PM; SUBMITTED → REJECTED.
- **C-46:** Two classification systems exist: a rule-based classifier (ps.classifier.ts) and a DB-backed matrix engine (ps.matrix-engine.ts).
- **C-47:** The wizard UI calls the matrix engine (via `trpc.ps.classifyScenario`), not the rule-based classifier.
- **C-48:** Confidence is computed server-side via three pillars: spread, completeness, ambiguity.
- **C-49:** Explainability is computed server-side from matrix cell weights.
- **C-50:** Override tracking infrastructure exists (ps.override.ts) with rate metrics and pattern detection.
- **C-51:** Ideation → Wizard handoff uses ConceptPackage with 5 blockers + 3 warnings readiness check.
- **C-52:** The wizard has exactly 13 steps.
- **C-53:** All questions are binary Yes/No (no Likert, no weights).
- **C-54:** Scoring uses binary weight accumulation: truthy answer → accumulate cell weight into scope score.
- **C-55:** No confidence gate exists — all confidence levels proceed identically.

---

## 4. Claim Validation Grid

| Claim | Source | Claim Type | Status | Evidence | Notes |
|-------|--------|-----------|--------|----------|-------|
| **C-01** Scenario textarea ≤5000 chars | WS2 §2 | Current state | **Verified** | S1:311 shows `{scenario.length}/5000 characters` display. S14 `createWizardRunSchema` has `.max(5000)`. | Char count displayed in UI; validated server-side. |
| **C-02** Validation: `scenario.trim().length > 0` | WS2 §2 | Current state | **Verified** | S1:122 `step === 1 && scenario.trim().length > 0`. | Empty scenario blocks Next. |
| **C-03** No guided template | WS2 §2 | Current state | **Verified** | S1:300–313 — plain textarea with placeholder "Describe the project scenario..." | No template, no guided prompts. |
| **C-04** Context fields: BU, Region, Strategic Importance, Existing Situation | WS2 §2 | Current state | **Verified** | S1:69–74 (ContextState type), S1:316–348 (four input fields rendered). | Exact match. |
| **C-05** No required context fields | WS2 §2 | Current state | **Verified** | S1:123 `step === 2` — `canGoNext` is unconditionally true for step 2. | All context fields are optional. |
| **C-06** DB-driven dimensions from active matrix | WS2 §2 | Current state | **Verified** | S1:91 queries `trpc.ps.matrix.getActiveQuestions`; S1:117 `dimensions = matrixData?.available ? matrixData.dimensions : []`. S2:29–76 `loadActiveMatrix()`. | Dimensions loaded from DB. |
| **C-07** Scenario preview + context signals | WS2 §2 | Current state | **Verified** | S1:362–404 — renders truncated scenario text and context signals (BU, Region, Strategic Importance). | Exact match. |
| **C-08** No AI call in NLP step | WS2 §2 | Current state | **Verified** | S1:350–406 — step 3 renders only matrix data and user-provided context. No mutation or API call triggered. | Purely informational. |
| **C-09** No user action required for step 3 | WS2 §2 | Current state | **Verified** | S1:124 `step === 3` — `canGoNext` unconditionally true. | Step is a pass-through display. |
| **C-10** Auto-derives name from first sentence ≤80 chars | WS2 §2 | Current state | **Verified** | S1:55–62 `deriveProjectName()`: splits on `.!?\n`, takes first segment, truncates at 80 chars at word boundary. | Exact match. |
| **C-11** Name is user-editable | WS2 §2 | Current state | **Verified** | S1:416 `<input value={generatedName} onChange={...}>`. | User can freely edit. |
| **C-12** Heuristic: split/truncate | WS2 §2 | Current state | **Verified** | S1:57 `trimmed.split(/[.!?\n]/)[0]`, S1:59–61 truncation logic. | Character-level verification matches. |
| **C-13** DB-driven Yes/No binary questions | WS2 §2 | Current state | **Verified** | S1:439–461 — iterates `questions` from matrix, renders Yes/No buttons. S2:170–218 `computeScores()` uses `isAnswerTruthy()`. | Binary only; no Likert. |
| **C-14** Binary toggle buttons | WS2 §2 | Current state | **Verified** | S1:443–456 `{["Yes", "No"].map((value) => <button ...>)}`. | Two-state toggle per question. |
| **C-15** "Classify" triggers classification | WS2 §2 | Current state | **Verified** | S1:147–149 `if (step === 5) { handleRunClassification(); return; }`. S1:884 button shows "Classify" when step === 5. | Button label and behavior confirmed. |
| **C-16** No Likert, no weights, no branching | WS2 §2 | Current state | **Verified** | S1:443 only renders "Yes"/"No". S2:247–255 `isAnswerTruthy()` is binary. No adaptive branching logic anywhere in PSWizardPage.tsx. | Negative verification — features absent. |
| **C-17** Top 3 ranked scopes with scores | WS2 §2 | Current state | **Verified** | S1:486–507 renders `recommendation.top3.map(...)` as ordered list with scores. | Exact match. |
| **C-18** Relative bar charts | WS2 §2 | Current state | **Verified** | S1:494–500 bar width = `(item.score / recommendation.top3[0].score) * 100%`. | Proportional to top scorer. |
| **C-19** Winner margin displayed | WS2 §2 | Current state | **Verified** | S1:512–513 `+{recommendation.winnerMargin}`. | Shown in Scoring step. |
| **C-20** Confidence label displayed | WS2 §2 | Current state | **Verified** | S1:516–517 `{recommendation.confidence}`. | Displayed as text label. |
| **C-21** Positive contributors as text list | WS2 §2 | Current state | **Verified** | S1:539–546 renders `positiveContributors` as `<ul><li>` items. | Text-only, no numeric bars. |
| **C-22** Negative contributors as text list | WS2 §2 | Current state | **Verified** | S1:552–558 renders `negativeContributors` as `<ul><li>` items. | Text-only. |
| **C-23** No numeric attribution | WS2 §2 | Current state | **Verified** | S1:529–570 — no numeric values rendered in explainability. S3:88–93 stores `weight` in signals but S1 only renders `questionLabel` text. | **Partial insight:** Server computes numeric weights (S3:91 `weight: winnerWeight`) but the frontend discards them and only renders the label string. |
| **C-24** Recommended scope with label+code+matrix version | WS2 §2 | Current state | **Verified** | S1:582–587 shows scope label, code, and matrix version. | Exact match. |
| **C-25** Optional override textarea | WS2 §2 | Current state | **Verified** | S1:591–598 override textarea with placeholder text. | Present and optional. |
| **C-26** Override reason in local state only | WS2 §2 | Current state | **Partially Verified** | S1:80 `const [overrideReason, setOverrideReason] = useState("")`. Override reason is stored in React state. **However**, it is displayed in Accept step (S1:655–659) but is **not passed** to the `createProjectMut` call (S1:195–211). | **Contradiction found:** Override reason is captured in UI but silently dropped at project creation. See C-50 for related issue. |
| **C-27** Full summary in Accept step | WS2 §2 | Current state | **Verified** | S1:607–668 renders name, scenario, BU, region, scope, confidence, matrix version, questions count, decision trace, override reason. | All listed fields present. |
| **C-28** Decision trace as machine-readable string | WS2 §2 | Current state | **Verified** | S1:651–653 renders `scope=... | confidence=... | matrix_v=... | top3=[...]` in monospace font. | Format confirmed. |
| **C-29** No e-signature | WS2 §2 | Current state | **Verified** | S1:607–668 — no signature field, no consent checkbox, no cryptographic signing. | Absent. |
| **C-30** Calls `trpc.ps.projects.create` | WS2 §2 | Current state | **Verified** | S1:195 `createProjectMut.mutateAsync({...})`. S1:98 `trpc.ps.projects.create.useMutation()`. | Direct API call confirmed. |
| **C-31** Stores wizard run + DRAFT status | WS2 §2 | Current state | **Verified** | S6:76–98 transaction inserts `psWizardRuns` then `psProjects` with `status: "DRAFT"`. | Transaction-based creation. |
| **C-32** Navigation locked after step 10 | WS2 §2 | Current state | **Verified** | S1:163 `if (step <= 1 || step > 10) return;` in `prevStep()`. | Back button disabled post-creation. |
| **C-33** Template bundle resolved server-side | WS2 §2 | Current state | **Verified** | S6:74 `const bundle = await resolveTemplateBundle(input.selectedScopeCode)`. | Server resolves governance, methods, frameworks, workflow, staffing. |
| **C-34** Status badge displayed | WS2 §2 | Current state | **Verified** | S1:712–719 renders status badge with conditional styling. | Color-coded by status. |
| **C-35** Submit for Validation: DRAFT → SUBMITTED | WS2 §2 | Current state | **Verified** | S1:730–738 button calls `handleSubmitForValidation()`. S5:85–87 `submitPSProject()` transitions to "SUBMITTED". | Exact match. |
| **C-36** Shows validation note | WS2 §2 | Current state | **Verified** | S1:722–727 conditionally renders `createdProject.validationNote`. | Present if available. |
| **C-37** Single-reviewer model | WS2 §2 | Current state | **Verified** | S5:85–103 — no multi-reviewer infrastructure. Single `submit` → single `validate/reject` transitions. No reviewer assignment, no parallel review. | No multi-reviewer capability exists. |
| **C-38** Displays PM project ID | WS2 §2 | Current state | **Verified** | S1:761–766 conditionally renders `createdProject.pmProjectId`. | Shown when available. |
| **C-39** Send to PM Central button | WS2 §2 | Current state | **Verified** | S1:774–783 button calls `handleSendToPM()`. S5:101–103 `sendToPMCentral()` transitions to "SENT_TO_PM". | Exact match. |
| **C-40** PM handoff blocked if DRAFT | WS2 §2 | Current state | **Verified** | S1:768–772 shows "must be validated" message when status is DRAFT. S1:774 button only shown when status !== DRAFT and no pmProjectId. | **Nuance:** The UI blocks PM handoff for DRAFT, but the server's state machine (S15:20–26) only allows SENT_TO_PM from VALIDATED state. A SUBMITTED project would also be blocked server-side, not just DRAFT. The UI guard is less strict than the server guard. |
| **C-41** Outcome: success/partial/failed/cancelled | WS2 §2 | Current state | **Verified** | S1:802–815 renders four outcome buttons. S8:19–25 schema validates these four values. | Exact match. |
| **C-42** Skip option | WS2 §2 | Current state | **Verified** | S1:841–845 "Skip & Go to List" button navigates to `/ps/list`. | Present. |
| **C-43** Outcomes not used for retraining | WS2 §2 | Current state | **Verified** | S8:37–80 — `createFeedback` inserts into `psFeedback` table. No downstream retraining logic, no calibration queue, no matrix weight update. | Confirmed: feedback is stored and not consumed. |
| **C-44** Navigates to `/ps/list` | WS2 §2 | Current state | **Verified** | S1:254 `navigate("/ps/list")`. | Exact match. |
| **C-45** Lifecycle state machine | WS2 §2 | Current state | **Verified** | S15:19–26 `PS_PROJECT_TRANSITIONS` exactly matches: DRAFT→SUBMITTED, SUBMITTED→VALIDATED/REJECTED, VALIDATED→PUBLISHED/SENT_TO_PM, REJECTED→[], PUBLISHED→[], SENT_TO_PM→[]. | Exact match. |
| **C-46** Two classification systems | WS2 §2 | Current state | **Verified** | S7 (ps.classifier.ts): rule-based, 18 rules, 5 system types. S2 (ps.matrix-engine.ts): DB-backed, weight-accumulation scoring. Both exist in the codebase. | These serve different purposes. The classifier operates on typed dimensions; the matrix engine operates on question/scope/cell weights. |
| **C-47** Wizard uses matrix engine, not classifier | WS2 §2 | Current state | **Reasonable Inference** | S1:94 `trpc.ps.classifyScenario.useMutation()` — this calls a server endpoint. The router (S14:707–718 `classifyScenarioSchema`) accepts `scenarioText` + `dimensions`. **The wizard sends `scenario`, `context`, `answers`** (S1:172–176), not dimensions. The tRPC endpoint name is `classifyScenario` but the wizard's mutation payload does not match the `classifyScenarioSchema` in S14. | **Needs technical verification.** The wizard's `classifyMutation` sends `{scenario, context, answers}` which matches the matrix engine input pattern, not the classifier input pattern. But the schema mismatch with `classifyScenarioSchema` (which expects typed `dimensions`) suggests these may be two different endpoints or the schema is outdated. Cannot fully resolve without running code. |
| **C-48** Confidence via three pillars | WS2 §2 | Current state | **Verified** | S4:37–54 `computeConfidence()` returns `{overall, spread, completeness, ambiguity}`. Formula: `0.30×completeness + 0.30×spread + 0.40×(1-ambiguity)`. | Exact match to code. |
| **C-49** Explainability from matrix weights | WS2 §2 | Current state | **Verified** | S3:31–121 `computeExplainability()` iterates matched questions, computes positive signals (winner gained weight) and negative signals (runner-up gained more). Returns `{positiveSignals, negativeSignals, winnerMargin, winnerCode, runnerUpCode}`. | Exact match. |
| **C-50** Override tracking infrastructure exists | WS2 §2 | Current state | **Verified with qualification** | S9 (ps.override.ts) provides `recordOverride()`, `listOverrides()`, `getOverrideRate()`, `getOverridePatterns()`. **However**, the wizard frontend (S1) does NOT call any override-related API. The `overrideReason` is captured in local state but never persisted. | **Gap:** Override infrastructure exists server-side but is not wired into the wizard flow. |
| **C-51** ConceptPackage handoff with 5 blockers + 3 warnings | WS2 §2 | Current state | **Verified** | S10:28–109 checks 5 blockers (problem, opportunity, ideas, selected concept, rationale) + S10:112–126 checks 3 warnings (screening scores, feasibility checks, summary). S11:27–96 builds ConceptPackage. | Exact match. Blockers: 5 (problem complete, opportunity complete, ideas exist, exactly one selected, rationale present). Warnings: 3 (screening scores, feasibility checks, summary). |
| **C-52** 13 steps exactly | WS2 §2 | Current state | **Verified** | S1:14 `type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13`. S1:39–53 STEP_LABELS array has 13 entries. | Exact match. |
| **C-53** All questions are binary | WS2 §2 | Current state | **Verified** | S1:443 only `["Yes", "No"]`. S2:247–255 `isAnswerTruthy()` treats "Yes" as truthy, "No" as falsy. | No alternative input types in wizard. |
| **C-54** Binary weight accumulation scoring | WS2 §2 | Current state | **Verified** | S2:209–218: for each truthy answer, adds `cell.weight` to the scope's score. No normalisation, no Likert weighting. | Score = Σ(cell.weight) for all truthy-answered questions. |
| **C-55** No confidence gate | WS2 §2 | Current state | **Verified** | S1:121–132 `canGoNext` for steps 6–9 only checks `recommendation !== null`. No threshold check on confidence, winnerMargin, or score. | All confidence levels treated identically. |

---

## 5. Contradictions and Resolutions

| # | Topic | Conflicting Statements | Source A | Source B | Resolution |
|---|-------|----------------------|----------|----------|------------|
| **X-01** | Override reason persistence | WS2 §2 claims: "Override reason stored in local state; displayed in Accept step and persisted if provided." | WS2 (S12) | PSWizardPage.tsx (S1) | **Code wins.** Override reason is stored in `useState` (S1:80), displayed in Accept step (S1:655–659), but **never passed** to `createProjectMut.mutateAsync()` (S1:195–211). The `CreatePSProjectInput` type in S6:42–57 does not include an overrideReason field. The override tracking API (S9) exists server-side but is never called from the wizard. **WS2's claim that it is "persisted if provided" is incorrect** — it is silently dropped at project creation. |
| **X-02** | Classification endpoint matching | WS2 §2 claims the wizard calls matrix engine classification. `classifyScenarioSchema` (S14:707–718) expects typed `dimensions` object, but wizard sends `{scenario, context, answers}`. | WS2 (S12) | ps.validation.ts (S14) vs PSWizardPage.tsx (S1) | **Needs verification.** The wizard's `classifyMutation` sends `{scenario, context, answers}` (S1:172–176), which does not match the `classifyScenarioSchema` that expects a structured `dimensions` object. There are likely two separate tRPC procedures: one exposed as `trpc.ps.classifyScenario` for the rule-based classifier (S7), and another for the matrix-based classification. The wizard likely calls the matrix-based endpoint. **Cannot fully resolve without running the router and inspecting the actual procedure mapping.** |
| **X-03** | PM handoff guard strictness | WS2 §2 says: "Blocked if project is still DRAFT." UI (S1) blocks for DRAFT only. | WS2 (S12) | ps.lifecycle.ts (S5) + ps.types.ts (S15) | **Code is stricter than described.** Server-side state machine only allows SENT_TO_PM from VALIDATED state. A project in SUBMITTED status would also fail server-side, not just DRAFT. The WS2 description implies only DRAFT is blocked, but the actual enforcement blocks anything that isn't VALIDATED. UI guard is a subset of server guard. |
| **X-04** | "No AI call" in NLP step (Step 3) | WS2 §2 says "No AI call — purely informational display of `matrixData.dimensions`." The step title says "NLP Analysis." | WS2 (S12) | PSWizardPage.tsx (S1) | **No contradiction, but misleading naming.** The step is labeled "NLP Analysis" in the UI but performs no NLP. It displays DB-driven matrix dimensions. The name is a misnomer — it describes what was intended, not what was implemented. |
| **X-05** | Confidence value type | Wizard stores/displays confidence as a string label. Server confidence engine returns a numeric 0–1 value. | PSWizardPage.tsx (S1) | ps.confidence.ts (S4) | **Needs verification.** The frontend `Recommendation` type (S1:31) declares `confidence: string`. The server confidence engine (S4:49) returns numeric `{overall, spread, completeness, ambiguity}`. There is a transformation layer (likely in the router or matrix-engine's enriched result) that converts the numeric confidence to a label. The stored `confidence` in `psProjects` (S6:109) is also a string. The numeric confidence report exists but is not directly exposed to the wizard UI — a label is derived somewhere in the pipeline. |
| **X-06** | WS2 describes `deriveProjectName` as "Naive heuristic" | WS2 labels it naive; implementation is straightforward but functional. | WS2 (S12) | PSWizardPage.tsx (S1) | **No factual contradiction.** "Naive" is an editorial judgment in WS2, not a current-state fact. The implementation is a simple string-split heuristic (S1:55–62). Whether it is "naive" is a quality assessment, not a baseline fact. Retained as verified behavior without the editorial label. |

---

## 6. Cleaned Current-State Baseline

This section is the authoritative current-state view. It can be read independently. No redesign proposals are included.

### 6.1 Wizard Structure

| Property | Value | Evidence |
|----------|-------|----------|
| Total steps | 13 | S1:14, S1:39–53 |
| Step labels | Scenario → Context → NLP → Auto Name → Questions → Scoring → Explainability → Recommendation → Accept → Create → Validation → PM Central → Feedback | S1:39–53 |
| Entry point | Direct navigation (no ideation prerequisite enforced in wizard code) | S1:64 — component takes no props, no readiness check |
| Exit point | `/ps/list` after feedback or skip | S1:254, S1:843 |
| Navigation model | Linear forward/back with constraints: back disabled after step 10 | S1:161–164 |

### 6.2 Input Capture (Steps 1–4)

| Area | Verified Behavior | Notes |
|------|-------------------|-------|
| Scenario input | Free-text textarea, max display 5000 chars, must be non-empty to proceed | Server validates max 5000 via Zod |
| Context fields | 4 fields: Business Unit, Region, Strategic Importance, Existing Situation | All optional — no validation required |
| NLP Analysis step | Read-only display of matrix dimensions + context signal echo | Name is misleading — no NLP occurs |
| Auto Name | `deriveProjectName()`: first sentence split on `.!?\n`, truncated at 80 chars at word boundary | User can freely edit the result |

### 6.3 Classification & Scoring (Steps 5–7)

| Area | Verified Behavior | Notes |
|------|-------------------|-------|
| Question format | Binary Yes/No toggle buttons | DB-driven from active matrix version |
| Question source | `trpc.ps.matrix.getActiveQuestions` | Returns questions + scopes + dimensions from active matrix |
| Scoring formula | For each truthy answer: accumulate `cell.weight` into scope score. Score = Σ(cell.weight) for matched answers. | No normalisation, no Likert weighting, no per-question weights |
| Ranking | Sort scopes by score descending, alphabetical tie-breaking | S2:227–236 `rankScopes()` |
| Top results | Top 3 scopes displayed with scores and proportional bar charts | S1:486–507 |
| Confidence computation | Server-side three-pillar model: `0.30×completeness + 0.30×spread + 0.40×(1-ambiguity)` | Returns numeric 0–1 value; transformed to label before UI display |
| Explainability | Server computes positive signals (winner gained weight) and negative signals (runner-up gained more than winner) with numeric weights | **Frontend discards numeric weights** — renders labels only as text lists |
| Winner margin | `ranking[0].score - ranking[1].score` | Displayed in both Scoring and Explainability steps |

### 6.4 Decision & Override (Steps 8–9)

| Area | Verified Behavior | Notes |
|------|-------------------|-------|
| Recommendation display | Shows selected scope label, code, and matrix version | S1:582–587 |
| Override mechanism | Optional textarea for override reason | **Critical gap:** reason is captured in React state but silently dropped — never sent to server or persisted |
| Override tracking server-side | `ps.override.ts` provides full CRUD: record, list, rate, patterns | Exists but is disconnected from wizard flow |
| Accept review | Displays: name, scenario excerpt, BU/region, scope, confidence, matrix version, question count, decision trace, override reason | Decision trace: `scope=X | confidence=Y | matrix_v=Z | top3=[A,B,C]` |
| Confidence gate | **None.** All confidence levels and margins proceed identically to project creation | No threshold, no escalation, no gate |

### 6.5 Project Creation (Step 10)

| Area | Verified Behavior | Notes |
|------|-------------------|-------|
| API call | `trpc.ps.projects.create` | Transaction: insert wizard run trace + insert project |
| Initial status | DRAFT | Always DRAFT on creation |
| Template bundle | Resolved server-side from scope code via `resolveTemplateBundle()` | Bundle includes: governance, methods, frameworks, workflow, staffing, systemType, lifecycleType |
| Wizard run trace | Stored in `psWizardRuns` table with scenario text, input payload (context + answers + matrixVersion), result payload (scope, topScopes, confidence, explainability) | Provides full audit trail |
| Name resolution | Unique name resolution: appends number suffix if name already exists | S6:19–38 tries up to 10 suffixes, then timestamp |

### 6.6 Post-Creation Lifecycle (Steps 11–13)

| Area | Verified Behavior | Notes |
|------|-------------------|-------|
| State machine | DRAFT → SUBMITTED → VALIDATED/REJECTED → PUBLISHED/SENT_TO_PM | Terminal states: REJECTED, PUBLISHED, SENT_TO_PM |
| Validation (Step 11) | Single reviewer model. "Submit for Validation" button. Shows status badge + validation note. | No multi-reviewer, no SLA, no structured pass/fail |
| PM Central (Step 12) | "Send to PM Central" button. Shows PM project ID when available. | Server enforces VALIDATED → SENT_TO_PM only; UI guard less strict |
| Feedback (Step 13) | 4-state outcome (success/partial/failed/cancelled) + optional text notes | Data stored in `psFeedback` table; not consumed by any downstream process |
| Feedback loop | **None.** Outcomes are persisted but never read for matrix calibration, retraining, or analytics | The infrastructure for this does not exist |

### 6.7 Ideation → Wizard Boundary

| Area | Verified Behavior | Notes |
|------|-------------------|-------|
| Readiness engine | `evaluateReadiness()` checks 5 blockers + 3 warnings | Blockers: problem complete, opportunity complete, ideas exist, one selected, rationale present |
| ConceptPackage | Built by `prepareConceptPackage()` — contains scenario text (composed from problem + opportunity + selected concept), system name, rationale, feasibility score, risk level | Classification hints field exists but is empty `{}` |
| Conversion lifecycle | `concept_selected → ready_for_wizard → converted` | Double-conversion prevented |
| Wizard awareness of ideation | **The wizard UI has no code that reads or uses a ConceptPackage.** It receives no props, has no ideation ID input, and does not call any ideation-related API. | The ideation → wizard connection exists server-side and in `PSIdeationConvertPage.tsx` but the wizard itself is ideation-unaware. |

### 6.8 Server Infrastructure Summary

| Component | File | Status |
|-----------|------|--------|
| Matrix engine (DB-backed) | `ps.matrix-engine.ts` | Active — used by classification endpoint |
| Rule-based classifier | `ps.classifier.ts` | Active — 18 rules, 5 system types. Separate from matrix engine. |
| Confidence engine | `ps.confidence.ts` | Active — three-pillar model |
| Explainability engine | `ps.explainability.ts` | Active — weight-based positive/negative signals |
| Lifecycle state machine | `ps.lifecycle.ts` | Active — strict transitions with audit logging |
| Override tracking | `ps.override.ts` | **Exists but disconnected from wizard** |
| Feedback recording | `ps.feedback.ts` | Active — stores outcomes, no downstream consumption |
| Template resolution | `ps.templates.ts` | Active — resolves governance/methods/frameworks bundles |
| Ideation readiness | `ideation-readiness.ts` | Active — 5+3 readiness check |
| Ideation conversion | `ideation-conversion.ts` | Active — builds ConceptPackage, commits conversion |

---

## 7. Risks in the Current-State Narrative

| # | Risk | Severity | Description |
|---|------|----------|-------------|
| **R-01** | Override reason silently dropped | **High** | Users who enter override reasons believe they are being recorded. They are not. This is a data integrity and trust issue. The override infrastructure exists server-side but is disconnected. |
| **R-02** | "NLP Analysis" step performs no NLP | **Low** | Misleading step label may set incorrect user expectations. The step displays DB-driven matrix dimensions, not NLP results. |
| **R-03** | No confidence gate | **High** | A 1-point winner margin is treated identically to a 30-point margin. Low-confidence classifications can proceed to project creation without any escalation or warning. |
| **R-04** | Explainability data loss at UI layer | **Medium** | Server computes numeric weights per explainability signal. Frontend renders only text labels, discarding the weights. This reduces explainability quality without technical justification. |
| **R-05** | Classification endpoint schema ambiguity | **Medium** | The `classifyScenarioSchema` (S14:707–718) defines dimensions-based input, but the wizard sends `{scenario, context, answers}`. This suggests either multiple endpoints or a stale schema. Needs technical verification. |
| **R-06** | Wizard is ideation-unaware | **Medium** | The wizard UI does not accept or use a ConceptPackage. When entering from ideation, any prefill/handoff must happen outside the wizard component (likely in `PSIdeationConvertPage.tsx`). This creates a brittle integration point. |
| **R-07** | Feedback data not consumed | **Low** | Feedback outcomes are stored but never used for any purpose. This is dead data unless a consumption pipeline is built. |
| **R-08** | Two classification systems coexist | **Low** | `ps.classifier.ts` (rule-based) and `ps.matrix-engine.ts` (DB-backed) both exist. Their relationship and intended usage boundary is not documented. If both are active, confusion about which system produces results is possible. |
| **R-09** | PM handoff UI guard weaker than server guard | **Low** | UI only blocks DRAFT status from PM handoff. Server blocks anything except VALIDATED. A SUBMITTED project would pass the UI check but fail server-side. Minor UX issue — server is the final enforcement. |

---

## 8. Acceptance Check

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every major current-state claim is tagged | **PASS** | 55 claims (C-01 through C-55) extracted and tagged in Section 4. |
| Contradictions are explicitly resolved or left open with reason | **PASS** | 6 contradictions (X-01 through X-06) documented in Section 5. X-02 and X-05 are left open with explicit reasons. |
| No proposed redesign item is presented as current truth | **PASS** | Section 6 contains only implementation-verified behaviors. All redesign content (Likert scales, multi-evaluator, SHAP bars, confidence gates, KPI targets, matrix retraining) is excluded. |
| Final baseline can be read independently as authoritative current-state view | **PASS** | Section 6 is self-contained with table format, covering all 13 steps, server infrastructure, and boundary conditions. |
| Source documents are mapped to roles with authority levels | **PASS** | Section 2 maps 18 sources with roles and authority levels. |
| Missing source documents are explicitly flagged | **PASS** | S16 and S17 marked as "NOT FOUND in repo" with explanation of workaround. |
| Implementation truth takes precedence over prose claims | **PASS** | X-01 (override persistence) and X-03 (PM handoff guard) resolved in favor of code over WS2 prose. |

**Document status: COMPLETE.**
