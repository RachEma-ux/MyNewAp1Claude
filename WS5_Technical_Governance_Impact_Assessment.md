# Workstream 5 — Technical and Governance Impact Assessment

**Author:** Senior Solution Architect, Governance Analyst & Implementation Planner
**Date:** 2026-03-29
**Inputs:** WS2_Step_Architecture_Mapping.md (Workstream 2 — disposition decisions), PS-Ideation-Workflow-Diagram.md (upstream boundary), PSWizardPage.tsx (implementation truth), server-side PS module files (ps.classifier.ts, ps.matrix-engine.ts, ps.explainability.ts, ps.confidence.ts, ps.lifecycle.ts, ps.project.ts, ps.feedback.ts, ps.override.ts, ps.validation.ts, ps.repository.ts, ps.types.ts), drizzle/tables/ps.ts (data model), WS Wizard — Governance-First Design.md (governance reference)

---

## 1. Purpose

This document translates the accepted redesign decisions from the PS Wizard analysis (Workstream 2 disposition register) into a concrete implementation impact assessment across:

- **UI / UX** — frontend component and layout changes
- **API / service layer** — server-side logic, tRPC endpoints, mutation signatures
- **Data model** — schema additions, column changes, new tables
- **Governance and policy** — decision gates, audit trail, approval requirements
- **Rollout dependencies** — sequencing constraints between changes

Only approved or conditionally approved items from WS2 are assessed. Deferred items (Workstream 3 scope, high-effort infrastructure) and rejected items are explicitly excluded from the implementation scope.

### Input Status Acknowledgement

| Workstream | Status | How Used |
|---|---|---|
| WS1 (Initial Analysis) | Not committed separately | WS2 references and incorporates WS1 findings; WS2 Section 2 (Current Step Inventory) serves as the implementation-verified baseline |
| WS2 (Step Architecture Mapping) | **Committed** — `d9b0201` | Primary decision source: Section 7 (Step Disposition Register) provides 22 disposition entries with explicit Approve/Defer/Reject outcomes |
| WS3 (Scoring Engine Analysis) | Not yet produced | Items deferred to WS3 (D-9, D-10, D-12, D-14) are excluded from this assessment |
| WS4 (not yet defined) | Not yet produced | No items depend on WS4 for Phase A/B scope |
| Design Suggestion | Referenced as `ps_wizard_design_suggestion.md` in WS2 | Fully reflected in WS2 Section 3 (Proposed Step Inventory) and Section 5 (Transition Matrix) |

---

## 2. Approved Change Inventory

Source: WS2 Section 7 (Step Disposition Register) and Section 8 (Recommended Implementation Path).

### Phase A — Immediate (13 → 10 steps)

| # | Change | Source Decision | Priority | Notes |
|---|--------|----------------|----------|-------|
| A-1 | Merge Steps 1+2 (Scenario + Context → single form) | WS2 D-1 | P2 — Medium | UX consolidation. Two screens → one collapsible form. Make ≥1 context field required. |
| A-2 | Merge Steps 3+4 (NLP + Auto Name → single review screen) | WS2 D-2 | P2 — Medium | UX consolidation. Eliminates pure-information step 3 and trivial step 4. |
| A-3 | LLM-generated project title (replace `deriveProjectName` heuristic) | WS2 D-6 | P2 — Medium | Replaces naive first-sentence extraction with LLM call via existing provider infrastructure. |
| A-4 | Confidence gate (block low-margin decisions) | WS2 D-15 | P1 — High | Most valuable structural addition. Configurable thresholds: High ≥15, Medium 8–14, Low <8. Low blocks auto-creation; Medium requires reviewer note. |
| A-5 | Merge Steps 12+13 (PM Central + Feedback → single post-lifecycle screen) | WS2 D-21 | P3 — Low | UX consolidation of two post-lifecycle screens. |
| A-6 | Scenario completeness indicator | WS2 D-5 | P3 — Low | Heuristic quality score (word count, field coverage). UI-only. |
| A-7 | Editable dimension values (user correction of NLP extraction) | WS2 D-8 | P3 — Low | Dimensions currently displayed read-only. Allow inline editing before questionnaire. |

### Phase B — After Phase A (same 10 steps, richer data)

| # | Change | Source Decision | Priority | Notes |
|---|--------|----------------|----------|-------|
| B-1 | Guided scenario template (with reworded prompts) | WS2 D-3 (with boundary constraint) | P3 — Low | Optional prompt pattern. Must NOT duplicate Ideation Steps 1–3. Template wording: "Describe the project situation, key stakeholders, and expected governance needs." NOT "What is the problem?" |
| B-2 | Structured override metadata capture | WS2 D-16 (partial) | P2 — Medium | Structured override records (recommended scope, overridden scope, reason, confidence, answers) already supported by `psWizardOverrides` table. Wire up UI capture to existing server `recordOverride()`. |
| B-3 | KPI baseline targets at accept | WS2 D-17 | P3 — Low | Optional KPI fields: cost savings, time reduction, revenue impact, timeline, success metric. Stored in project record. |
| B-4 | KPI actuals capture at feedback | WS2 D-19 | P3 — Low | Quantitative KPI actuals compared against baseline. Depends on B-3. |

### Explicitly Excluded

| # | Item | Reason | Gate |
|---|------|--------|------|
| X-1 | Binary → Likert 1–5 (D-9) | Deferred to Workstream 3 | WS3 completion |
| X-2 | Adaptive branching (D-10) | Depends on X-1 | WS3 completion |
| X-3 | Likert-normalised scoring (D-12) | Core engine change | WS3 completion |
| X-4 | SHAP-style explainability (D-14) | Depends on scoring formula | WS3 completion |
| X-5 | Multi-evaluator scoring (D-11) | High-effort infrastructure | Post-WS3 |
| X-6 | Multi-reviewer validation + SLA (D-18) | High-effort infrastructure | Post-WS3 |
| X-7 | Matrix retraining from outcomes (D-20) | System-level module | Post-WS3 |
| X-8 | Auto-tagging (D-4) | Nice-to-have, high effort | Backlog |
| X-9 | NLP confidence per dimension (D-7) | Architecturally mismatched | Backlog |
| X-10 | Impact-Effort quadrant (D-13) | Visualization, independent | Backlog |
| X-11 | Scenario template wording from design suggestion (D-22) | **Rejected** — duplicates Ideation | N/A |

---

## 3. UI / UX Impact

### 3.1 File: `client/src/pages/projects-system/PSWizardPage.tsx`

This is the sole wizard page (896 lines). Every Phase A change touches this file.

| Change | UI Impact | Scope | Effort |
|--------|-----------|-------|--------|
| **A-1: Merge Steps 1+2** | Replace `{step === 1 && ...}` and `{step === 2 && ...}` blocks with single combined form. Add collapsible section (Scenario ↔ Context). Add required field validation on ≥1 context field. Remove step 2 from `STEP_LABELS`. Renumber all subsequent step references. | **Major refactor** of step rendering and `canGoNext` logic | Medium |
| **A-2: Merge Steps 3+4** | Replace `{step === 3 && ...}` and `{step === 4 && ...}` with single review screen showing NLP dimensions + generated name. Move name generation to happen on entry to this merged step. | **Major refactor** of step rendering | Medium |
| **A-3: LLM title** | Replace `deriveProjectName()` (lines 55–62) with async call to LLM title generation endpoint. Add loading state during LLM call. Keep user-editable input. | Replace local function with API call | Low |
| **A-4: Confidence gate** | At step 8 (Recommendation, renumbered to step 6): add gate UI. If `winnerMargin < 8`, show red blocker banner, disable "Next" button. If `8 ≤ margin < 15`, show amber warning, require reviewer note text before proceeding. If `margin ≥ 15`, show green confidence badge, proceed normally. | **New UI component**: ConfidenceGateBanner | Medium |
| **A-5: Merge Steps 12+13** | Combine PM Central and Feedback into single screen with two sections: PM handoff controls + feedback form. | Replace two `{step === ...}` blocks with one | Low |
| **A-6: Completeness indicator** | Add real-time indicator below scenario textarea. Heuristic: word count (min 30 words), ≥2 sentences, ≥1 context field filled. Show progress chips. | **New UI component**: CompletenessIndicator | Low |
| **A-7: Editable dimensions** | At step 3 (NLP review, renumbered): change dimension values from read-only `<span>` to inline-editable `<select>` dropdowns populated from `matrixData.dimensions[].values`. Store user corrections in local state. Pass corrected dimensions through to classification. | Modify existing dimension display grid | Low–Medium |

### 3.2 Step Renumbering

After merges, the wizard goes from 13 steps to 10:

| New # | Name | Old # |
|-------|------|-------|
| 1 | Scenario + Context | 1+2 |
| 2 | NLP Review + Smart Name | 3+4 |
| 3 | Questions | 5 |
| 4 | Scoring | 6 |
| 5 | Explainability | 7 |
| 6 | Recommendation + Confidence Gate | 8 |
| 7 | Accept | 9 |
| 8 | Create Project | 10 |
| 9 | Validation | 11 |
| 10 | PM Handoff + Feedback | 12+13 |

This requires updating:
- `STEP_LABELS` array (lines 39–53)
- `Step` type definition (line 14): `1 | 2 | ... | 10`
- `canGoNext` logic (lines 121–132)
- `nextStep()` transitions (lines 134–159)
- `prevStep()` boundary (lines 161–165)
- `isPostCreation` flag (line 262): change from `step >= 10` to `step >= 8`
- Footer "Step X of 13" (line 860): change to "Step X of 10"
- Step progress indicator pills (lines 274–293)

### 3.3 New Components Required

| Component | Purpose | Location |
|-----------|---------|----------|
| `ConfidenceGateBanner` | Displays confidence level and enforces gate logic | `client/src/components/projects-system/wizard/` |
| `CompletenessIndicator` | Real-time scenario quality feedback | `client/src/components/projects-system/wizard/` |
| `KPITargetsForm` (Phase B) | Optional KPI baseline fields at accept step | `client/src/components/projects-system/wizard/` |
| `KPIActualsForm` (Phase B) | KPI actuals comparison at feedback step | `client/src/components/projects-system/wizard/` |

---

## 4. API / Service Impact

### 4.1 Existing Endpoints (no change required)

| Endpoint | File | Status |
|----------|------|--------|
| `trpc.ps.matrix.getActiveQuestions` | `ps.router.ts` | **No change** |
| `trpc.ps.classifyScenario` | `ps.router.ts` → `ps.matrix-engine.ts` | **No change** for Phase A (binary scoring retained) |
| `trpc.ps.projects.create` | `ps.router.ts` → `ps.project.ts` | **Payload extension** for B-3 (KPI targets) |
| `trpc.ps.lifecycle.submit` | `ps.router.ts` → `ps.lifecycle.ts` | **No change** |
| `trpc.ps.lifecycle.sendToPM` | `ps.router.ts` → `ps.lifecycle.ts` | **No change** |
| `trpc.ps.feedback.create` | `ps.router.ts` → `ps.feedback.ts` | **Payload extension** for B-4 (KPI actuals) |

### 4.2 New Endpoints Required

| Endpoint | Purpose | Phase | Input | Output | File |
|----------|---------|-------|-------|--------|------|
| `trpc.ps.wizard.generateTitle` | LLM-generated project title from scenario text | A-3 | `{ scenario: string, context: Record<string,string> }` | `{ title: string, source: "llm" \| "heuristic" }` | New: `server/ps/ps.wizard-title.ts` |
| `trpc.ps.wizard.recordOverride` | Record structured override with full metadata | B-2 | `OverrideInput` (already defined in `ps.override.ts`) | `PsWizardOverride` | Expose existing `recordOverride()` via tRPC — currently not wired |

### 4.3 Service Logic Changes

| Change | File | What Changes | Risk |
|--------|------|-------------|------|
| **A-3: LLM title generation** | New: `server/ps/ps.wizard-title.ts` | New service that calls existing LLM provider infrastructure (`resolveAgentLlm()`, `callLLM()`) with a prompt to generate a professional project title from scenario text. Falls back to `deriveProjectName()` heuristic if LLM unavailable. | Low — uses existing provider plumbing |
| **A-4: Confidence gate** | `server/ps/ps.confidence.ts` | **No server change required.** The confidence report (`ConfidenceReport.overall`, `.ambiguity`) and `ExplainabilityReport.winnerMargin` are already computed. The gate logic is UI-enforced: the client reads `winnerMargin` from the classification result and applies threshold rules. | None — pure UI enforcement for Phase A |
| **A-4: Confidence gate (server enforcement)** | `server/ps/ps.project.ts` | **Optional server-side guard**: `createPSProjectFromWizard()` could reject creation if `confidence < threshold` and no reviewer note is provided. This is a governance control decision — see Section 6. | Medium — requires governance decision |
| **B-2: Override wiring** | `server/ps/ps.router.ts` | Add tRPC endpoint that calls existing `recordOverride()` from `ps.override.ts`. The function and table already exist but are not exposed via tRPC. | Low — wiring only |
| **B-3: KPI in project creation** | `server/ps/ps.project.ts` | Extend `CreatePSProjectInput` type to include optional `kpiTargets` object. Pass through to `psProjects` insert. | Low |
| **B-4: KPI in feedback** | `server/ps/ps.feedback.ts` | Extend `createFeedbackSchema` to include optional `kpiActuals` object. Pass through to `psFeedback` insert. | Low |

### 4.4 Scoring Engine Impact

**Phase A: Zero scoring engine changes.** The binary Yes/No questionnaire, weight accumulation formula (`computeScores()`), ranking (`rankScopes()`), explainability (`computeExplainability()`), and confidence (`computeConfidence()`) all remain unchanged. The confidence gate is a UI-layer decision applied to existing `winnerMargin` output.

**Phase C (WS3 scope, not assessed here):** Likert scoring, per-question weights, and SHAP explainability would require changes to `computeScores()`, `evaluateMatrixEnriched()`, `computeExplainability()`, and potentially the `psMatrixCells` weight model. These changes are deferred pending WS3 analysis.

---

## 5. Data Model Impact

### 5.1 Existing Tables — No Schema Changes Required for Phase A

| Table | Columns | Phase A Impact |
|-------|---------|----------------|
| `ps_projects` | 19 columns | None — existing `contextJson`, `confidence`, `explainabilityJson` suffice |
| `ps_wizard_runs` | 7 columns | None |
| `ps_wizard_overrides` | 10 columns | None — schema already supports Phase B-2 |
| `ps_feedback` | 6 columns | None for Phase A |
| `ps_matrix_versions` | 8 columns | None |
| `ps_matrix_questions` | 6 columns | None |
| `ps_matrix_cells` | 5 columns | None |
| `ps_scope_registry` | 8 columns | None |
| `ps_dimensions` | 7 columns | None |
| `ps_dimension_values` | 7 columns | None |

### 5.2 Data Model Change Table — Phase B Additions

| Field / Entity | Why Needed | Owner | Risk | Notes |
|----------------|-----------|-------|------|-------|
| `ps_projects.kpi_targets_json` | Store KPI baseline targets (cost savings, time reduction, revenue impact, delivery timeline, primary success metric) set at wizard accept step | Backend | Low | JSON column. Optional. Added to `psProjects` table. No existing data migration needed (new column, nullable). |
| `ps_projects.confidence_gate_result` | Record the confidence gate outcome (`high` / `medium` / `low`) and any reviewer note at the time of project creation | Backend | Low | VARCHAR(30). Optional. Provides audit trail of the gate decision that led to project creation. |
| `ps_projects.confidence_reviewer_note` | Mandatory reviewer note when confidence is medium (margin 8–14) | Backend | Low | TEXT, nullable. Required by confidence gate governance control when margin is in medium range. |
| `ps_feedback.kpi_actuals_json` | Store quantitative KPI actuals compared against baseline targets | Backend | Low | JSON column. Optional. Depends on `kpi_targets_json` being populated. |
| `ps_confidence_gate_config` (new table) | Store configurable confidence thresholds per matrix version | Backend | Medium | Allows governance to adjust thresholds (default: High ≥15, Medium 8–14, Low <8) without code deployment. See Section 5.3. |

### 5.3 New Table: `ps_confidence_gate_config`

**Purpose:** Make confidence gate thresholds configurable per matrix version rather than hardcoded.

```
ps_confidence_gate_config
├── id                  SERIAL PK
├── matrix_version_id   INTEGER NOT NULL (FK → ps_matrix_versions.id)
├── high_threshold      INTEGER NOT NULL DEFAULT 15   -- margin ≥ this = HIGH confidence
├── medium_threshold    INTEGER NOT NULL DEFAULT 8    -- margin ≥ this = MEDIUM confidence
├── low_action          VARCHAR(30) DEFAULT 'block'   -- 'block' | 'warn' | 'allow'
├── medium_action       VARCHAR(30) DEFAULT 'require_note' -- 'require_note' | 'warn' | 'allow'
├── is_active           INTEGER DEFAULT 1
├── created_by          INTEGER NOT NULL
├── created_at          TIMESTAMP DEFAULT NOW()
├── updated_at          TIMESTAMP DEFAULT NOW()
└── UNIQUE(matrix_version_id)
```

**Governance requirement:** Threshold changes must be logged to `ps_audit_log` with action `confidence_gate.config_updated`.

### 5.4 Migration Strategy

All schema changes are additive (new nullable columns, new table). No destructive migrations. No existing data needs transformation.

| Migration | Type | Risk | Rollback |
|-----------|------|------|----------|
| Add `kpi_targets_json` to `ps_projects` | ADD COLUMN (nullable JSON) | None | DROP COLUMN |
| Add `confidence_gate_result` to `ps_projects` | ADD COLUMN (nullable VARCHAR) | None | DROP COLUMN |
| Add `confidence_reviewer_note` to `ps_projects` | ADD COLUMN (nullable TEXT) | None | DROP COLUMN |
| Add `kpi_actuals_json` to `ps_feedback` | ADD COLUMN (nullable JSON) | None | DROP COLUMN |
| Create `ps_confidence_gate_config` table | CREATE TABLE | None | DROP TABLE |

---

## 6. Governance and Policy Impact

### 6.1 Governance Control Table

| Change | Governance Concern | Required Approval / Control | Notes |
|--------|-------------------|---------------------------|-------|
| **A-4: Confidence gate** | The gate introduces a decision point that can **block project creation**. This is a governance-sensitive action: who defines the thresholds? Who can override a "blocked" low-confidence result? | **Required:** Governance team must approve threshold values before go-live. Threshold changes must be audited. Override path for "blocked" results must be defined (e.g., senior reviewer can override). | This is the highest-governance-impact item. Thresholds must be configurable (not hardcoded), auditable, and have a defined override path. |
| **A-4: Server enforcement vs UI-only** | If the confidence gate is UI-only, it can be bypassed by API callers or automation. If server-enforced, it adds a hard control. | **Decision required:** Should `createPSProjectFromWizard()` enforce the gate server-side? Recommendation: **Yes** — governance controls must not be UI-only. Add server-side check with structured bypass for authorized roles. | Server enforcement prevents bypass. The bypass (for authorized roles) must be logged with action `confidence_gate.override`. |
| **A-3: LLM title generation** | LLM calls introduce a dependency on an external provider and nondeterministic output. A hallucinated or inappropriate title could propagate to project records. | **Mitigation:** Title is always user-editable. LLM title is a suggestion, not an auto-committed field. Fallback to deterministic heuristic when LLM is unavailable. | Low governance risk. No approval required. The user retains full control. |
| **A-7: Editable dimension values** | User can modify classification dimensions before questionnaire. This changes the classification input, which could alter the recommended scope. | **Mitigation:** Dimension edits must be captured in the wizard run trace (`inputPayload`). The audit trail must show both the NLP-extracted and user-modified values. | Moderate concern. Original and modified values must both be stored for auditability. |
| **B-1: Scenario template** | Template prompts could overlap with Ideation responsibility. | **Required:** Template wording must be reviewed to ensure no boundary violation with PS Ideation Steps 1–3. WS2 D-22 explicitly rejected "What is the problem?" wording. Template must use "Describe the project situation" language. | Template content is a governance-controlled artifact. Changes to template wording require Governance Agent review. |
| **B-2: Override metadata** | Override records contain classification decision traces. Structured overrides enable future calibration analysis. | **Existing control:** `psWizardOverrides` table already captures `recommendedScopeCode`, `overriddenScopeCode`, `reason`, `confidence`, `matrixVersion`, `answersJson`. No new governance control needed — just wiring the existing table to the UI. | Low governance risk. Infrastructure already exists. |
| **B-3: KPI targets** | KPI values are business-sensitive data (cost savings, revenue impact). | **Mitigation:** KPI fields are optional. No automated action is taken based on KPI values in Phase B. KPI data is stored in project record, visible only to project participants. | Low governance risk. KPIs become governance-sensitive only when used for automated matrix calibration (deferred item X-7). |
| **B-4: KPI actuals** | Comparison of targets vs actuals could be used to evaluate project performance. | **Mitigation:** Purely informational in Phase B. No automated scoring or retraining. | Low governance risk. |

### 6.2 Governance-Sensitive Changes Requiring Explicit Approval Before Release

| # | Item | Why | Approver |
|---|------|-----|----------|
| G-1 | Confidence gate threshold values (default: 15/8) | These thresholds determine which projects can be auto-created and which are blocked or require review. Wrong thresholds could either block too many projects (friction) or allow too many low-quality classifications (risk). | Product Owner + Governance Agent |
| G-2 | Confidence gate enforcement mode (server-side vs UI-only) | Server enforcement prevents bypass but adds a hard constraint to the API. UI-only is softer but bypassable. | Architecture Review |
| G-3 | Confidence gate override authorization | Who can override a "blocked" low-confidence result? Options: any user with reviewer note, only designated reviewers, only admins. | Governance Agent |
| G-4 | Scenario template wording (Phase B) | Template content must not duplicate PS Ideation Steps 1–3. Specific wording requires review. | Governance Agent (boundary compliance) |

### 6.3 Audit Trail Requirements

All changes introduce or rely on the existing `ps_audit_log` table. New audit events:

| Action | When | Data Logged |
|--------|------|-------------|
| `wizard.confidence_gate_blocked` | User hits confidence gate at low margin | `{ winnerMargin, threshold, matrixVersion, top3 }` |
| `wizard.confidence_gate_reviewed` | User provides mandatory reviewer note for medium confidence | `{ winnerMargin, reviewerNote, matrixVersion }` |
| `confidence_gate.override` | Authorized user overrides a blocked result | `{ winnerMargin, overrideReason, authorizedBy }` |
| `confidence_gate.config_updated` | Governance changes threshold values | `{ previousThresholds, newThresholds, changedBy }` |
| `wizard.dimension_values_edited` | User modifies NLP-extracted dimension values | `{ originalValues, editedValues, step }` |
| `wizard.title_generated` | LLM generates project title | `{ scenario_length, generated_title, source: "llm" \| "heuristic" }` |

---

## 7. Dependency Map

### 7.1 Phase A Internal Dependencies

| Change | Depends On | Blocks | Notes |
|--------|-----------|--------|-------|
| **A-1: Merge Steps 1+2** | None | A-2, A-6 | Must be done first — step renumbering cascades to all other changes |
| **A-2: Merge Steps 3+4** | A-1 (renumbering) | A-3, A-7 | NLP + Auto Name merge must happen after initial renumbering |
| **A-3: LLM title** | A-2 (merged NLP+Name step exists) | None | Can be added to merged step after A-2 |
| **A-4: Confidence gate** | None (independent of step merges) | None | Can be developed in parallel with A-1/A-2. Applied at the Recommendation step regardless of numbering. |
| **A-5: Merge Steps 12+13** | A-1 (renumbering) | None | Can be done after A-1 renumbering or in parallel if numbering handled as final pass |
| **A-6: Completeness indicator** | A-1 (merged Scenario+Context step exists) | None | Simple heuristic added to the merged step |
| **A-7: Editable dimensions** | A-2 (merged NLP step exists) | None | Modifies the NLP review screen created by A-2 |

### 7.2 Phase B Dependencies

| Change | Depends On | Blocks | Notes |
|--------|-----------|--------|-------|
| **B-1: Scenario template** | A-1 (merged step exists) | None | Template is optional overlay on the scenario input |
| **B-2: Override wiring** | None (table already exists) | None | Independent. Can be done anytime. |
| **B-3: KPI targets** | Phase A complete (step 7 Accept exists in new numbering) | B-4 | Must add schema column + UI form before actuals can reference targets |
| **B-4: KPI actuals** | B-3 (baseline targets exist) | None | Feedback form extension |

### 7.3 Cross-Phase Dependencies

```
Phase A
├─ A-1 ────→ A-2 ────→ A-3 (LLM title)
│            └────→ A-7 (editable dims)
├─ A-1 ────→ A-5 (merge 12+13)
├─ A-1 ────→ A-6 (completeness)
├─ A-4 (confidence gate) ──────── independent ──→
│
Phase B (requires Phase A complete)
├─ B-1 (template) ←── A-1
├─ B-2 (override wiring) ←── independent
├─ B-3 (KPI targets) ──→ B-4 (KPI actuals)
│
Phase C (Workstream 3 — excluded from this assessment)
└─ X-1..X-4 (scoring engine changes)
│
Phase D (post-WS3 — excluded)
└─ X-5..X-7 (advanced infrastructure)
```

### 7.4 Recommended Implementation Sequence (Phase A)

```
Sprint 1:
  ├── A-1: Merge Steps 1+2 (renumbering foundation)
  ├── A-4: Confidence gate (can develop in parallel)
  └── A-6: Completeness indicator (simple, can piggyback on A-1)

Sprint 2:
  ├── A-2: Merge Steps 3+4
  ├── A-5: Merge Steps 12+13
  └── A-7: Editable dimension values

Sprint 3:
  ├── A-3: LLM title generation (requires provider wiring)
  └── Integration testing of 10-step wizard
```

---

## 8. Risk Register

| # | Risk | Trigger | Impact | Likelihood | Mitigation | Owner |
|---|------|---------|--------|-----------|------------|-------|
| R-1 | **Step renumbering regression** — Existing code references step numbers in `canGoNext`, `nextStep`, `prevStep`, navigation guards, and inline conditions. Renumbering from 13 to 10 steps could introduce off-by-one errors or broken navigation. | A-1 starts | High — broken wizard flow | Medium | Extract step logic into a configuration object (step config map) rather than inline numeric conditions. Write unit tests for all step transitions before refactoring. | Frontend Builder |
| R-2 | **Confidence gate blocks too many projects** — If thresholds are too aggressive (e.g., High ≥20), most classifications will be flagged, creating user friction and reducing adoption. | A-4 go-live | Medium — user frustration, process friction | Medium | Start with conservative thresholds (15/8). Monitor override rate after launch. Make thresholds configurable via `ps_confidence_gate_config` so governance can adjust without redeployment. | Product Owner + Governance |
| R-3 | **Confidence gate threshold manipulation** — If thresholds are stored in a configurable table without proper access control, unauthorized users could lower thresholds to bypass the gate. | A-4 + configurable thresholds | High — governance bypass | Low | Admin-only access to threshold configuration. All changes logged to `ps_audit_log`. Governance Agent validates threshold changes. | Governance Agent |
| R-4 | **LLM title generation latency** — LLM calls add latency (1–5 seconds). If the provider is slow or unavailable, the user is stuck waiting. | A-3 go-live | Low — degraded UX | Medium | Implement timeout (3s). If LLM fails or times out, fall back to `deriveProjectName()` heuristic silently. Show "Generating title..." spinner with cancel/manual-entry option. | Backend Builder |
| R-5 | **LLM title generation produces inappropriate content** — The LLM could generate an unprofessional, misleading, or hallucinated title. | A-3 go-live | Low — cosmetic, user-correctable | Low | Title is always user-editable (not auto-committed). Add a simple profanity/length check. Log generated titles for post-hoc quality review. | Backend Builder |
| R-6 | **Editable dimensions break classification accuracy** — If users modify NLP-extracted dimension values incorrectly, the classification result may be less accurate. | A-7 go-live | Medium — wrong scope recommendation | Low | Store both original (NLP-extracted) and user-modified values in `inputPayload`. Display a warning when values are modified: "You are overriding the automatic extraction. This may change the classification result." Allow reset to original values. | Frontend Builder |
| R-7 | **Backward compatibility — existing 13-step projects** — Existing PS projects were created under the 13-step wizard. The wizard run traces reference the old step numbering. If the system tries to reopen or display these projects with the new 10-step numbering, the audit trail may be confusing. | Phase A go-live | Low — audit trail readability | Low | Wizard runs are immutable records. The `inputPayload` and `resultPayload` in `ps_wizard_runs` already store all data regardless of step numbering. New wizard creates new runs; old runs are unaffected. No migration needed. | Backend Builder |
| R-8 | **Scenario template boundary violation** — Despite D-22 rejection, a future developer could add template prompts that duplicate Ideation Steps 1–3 (problem/opportunity discovery). | B-1 implementation | Medium — boundary violation, duplicated UX | Low | Template wording is a governance-controlled artifact. Code review must check template content against PS Ideation boundary rules (WS2 Section 4). Governance Agent sign-off required on template text. | Governance Agent |
| R-9 | **KPI data quality — garbage in, garbage out** — Optional KPI fields may be filled with unrealistic values (e.g., "99% cost savings"). If KPIs are later used for calibration (deferred item X-7), bad data poisons the calibration. | B-3/B-4 go-live | Low (Phase B) / High (Phase D) | Medium | Phase B: KPIs are informational only. No automated action. Phase D: Before enabling calibration, implement data quality checks (range validation, outlier detection). Do not connect KPIs to calibration without explicit governance approval. | Governance Agent (future) |

---

## 9. Implementation Impact Summary

### 9.1 Change Classification

| Change | UI-Only | Backend-Only | Full-Stack | Governance/Process |
|--------|---------|-------------|-----------|-------------------|
| A-1: Merge Steps 1+2 | **X** | | | |
| A-2: Merge Steps 3+4 | **X** | | | |
| A-3: LLM title | | | **X** | |
| A-4: Confidence gate | | | **X** | **X** |
| A-5: Merge Steps 12+13 | **X** | | | |
| A-6: Completeness indicator | **X** | | | |
| A-7: Editable dimensions | **X** | | | |
| B-1: Scenario template | **X** | | | **X** |
| B-2: Override wiring | | | **X** | |
| B-3: KPI targets | | | **X** | |
| B-4: KPI actuals | | | **X** | |

**Summary:** 5 of 11 changes are UI-only. 1 requires full-stack + governance approval. Phase A is predominantly a frontend refactor with one new server endpoint (LLM title) and one governance gate (confidence).

### 9.2 Effort Estimate by Phase

| Phase | Items | Dominant Layer | New DB Migrations | New API Endpoints | Governance Approvals Required |
|-------|-------|---------------|-------------------|-------------------|------------------------------|
| Phase A | 7 items | Frontend (PSWizardPage.tsx refactor) | 0 | 1 (`wizard.generateTitle`) | 3 (G-1, G-2, G-3: confidence gate thresholds, enforcement mode, override auth) |
| Phase B | 4 items | Full-stack (DB + API + UI) | 3 columns + 1 table | 1 (`wizard.recordOverride` wiring) | 1 (G-4: scenario template wording) |

### 9.3 Files Touched

| File | Phase A | Phase B | Change Type |
|------|---------|---------|-------------|
| `client/src/pages/projects-system/PSWizardPage.tsx` | **Major** | Minor | Refactor: step merge, renumber, gate UI |
| `server/ps/ps.wizard-title.ts` (new) | Create | — | New LLM title generation service |
| `server/ps/ps.router.ts` | Minor | Minor | Add 1–2 new tRPC endpoints |
| `server/ps/ps.project.ts` | — | Minor | Extend `CreatePSProjectInput` with KPI fields |
| `server/ps/ps.feedback.ts` | — | Minor | Extend feedback schema with KPI actuals |
| `server/ps/ps.confidence.ts` | — | — | No change (existing output sufficient) |
| `server/ps/ps.matrix-engine.ts` | — | — | No change |
| `server/ps/ps.explainability.ts` | — | — | No change |
| `server/ps/ps.override.ts` | — | Minor | Already implemented; wire to tRPC |
| `drizzle/tables/ps.ts` | — | Minor | Add columns + new config table |
| `client/src/components/projects-system/wizard/` (new dir) | Create | Create | New sub-components extracted from wizard |

### 9.4 Key Architectural Decisions Preserved

1. **Binary scoring retained** — The matrix engine (`computeScores`, `evaluateMatrixEnriched`) stays unchanged. Likert scoring is deferred to WS3.
2. **DB-driven matrix** — No hardcoded classification logic introduced. All new features (confidence gate thresholds, dimensions, questions) are DB-driven.
3. **Ideation boundary preserved** — No capability moved from PS Ideation to PS Wizard. The ConceptPackage handoff remains the clean boundary.
4. **Audit trail extended, not broken** — All new governance-sensitive actions add audit events to the existing `ps_audit_log` table using the existing `logPsAudit()` function.
5. **State machine unchanged** — The lifecycle (`DRAFT → SUBMITTED → VALIDATED → PUBLISHED / SENT_TO_PM / REJECTED`) remains identical. The confidence gate operates *before* project creation, not within the lifecycle.

---

## 10. Acceptance Check

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every approved redesign item has an impact assessment | **PASS** | Section 2 lists 11 approved items (7 Phase A + 4 Phase B). Sections 3–6 assess each across UI, API, data model, and governance. |
| Governance-sensitive changes are explicitly identified | **PASS** | Section 6.1 (Governance Control Table: 8 entries), Section 6.2 (4 items requiring explicit approval: G-1 through G-4). |
| Dependencies are visible and sequenced | **PASS** | Section 7.1 (Phase A: 7 dependency entries), Section 7.2 (Phase B: 4 entries), Section 7.3 (cross-phase diagram), Section 7.4 (recommended 3-sprint sequence). |
| Risks and mitigation actions are documented | **PASS** | Section 8 (9 risks: R-1 through R-9, each with trigger, impact, likelihood, mitigation, owner). |
| No hidden assumptions about implementation scope | **PASS** | Section 2 explicitly lists all excluded items (X-1 through X-11) with reasons. Section 1 acknowledges missing WS1/WS3/WS4 inputs and explains how WS2 dispositions serve as the decision source. |
| Deferred and rejected items are explicitly excluded | **PASS** | Section 2 "Explicitly Excluded" table (11 items with reasons and gates). |
| Data model changes are justified | **PASS** | Section 5.2 (5 entries, each with "Why Needed" column). Section 5.3 (new table with field-level specification). |
| Change classification (UI-only / backend-only / full-stack / governance) is stated per item | **PASS** | Section 9.1 (Impact Matrix table). |
| Scoring engine is confirmed unchanged for Phase A | **PASS** | Section 4.4 explicitly states zero scoring engine changes. |
| Boundary integrity with PS Ideation is preserved | **PASS** | Section 6.1 (B-1 template controls), Section 9.4 point 3 (boundary preserved). |

**Document status: COMPLETE.**
