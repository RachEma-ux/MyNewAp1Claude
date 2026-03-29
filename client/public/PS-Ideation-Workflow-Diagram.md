# PS Ideation Workflow — Step Succession Diagram

> Auto-generated from codebase (`shared/ps-ideation-constants.ts`, `PSIdeationWorkspace.tsx`, `context-translator-router.ts`)

---

## Lifecycle Statuses

```
draft → in_exploration → screening → concept_selected → ready_for_wizard → converted
                                                      ↘ deferred
                                                      ↘ rejected
```

---

## 11-Step Ideation Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PHASE 1: INTAKE                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 1: Context of the Project                                 │    │
│  │  Key: "context"                                                 │    │
│  │  Panels:                                                        │    │
│  │    ├─ ContextTranslatorPanel (AI-powered raw text → structure)  │    │
│  │    │    ├─ Primary: Python service (localhost:8585)              │    │
│  │    │    ├─ Fallback: Built-in LLM (OpenAI via catalog)          │    │
│  │    │    └─ Template: No-LLM static fallback                     │    │
│  │    └─ ContextDefinitionToolPanel (manual fields)                │    │
│  │         ├─ External Driver                                      │    │
│  │         ├─ Internal Driver                                      │    │
│  │         ├─ Trigger Event (Why now?)                             │    │
│  │         └─ How this shapes the need                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 2: The Problem                                            │    │
│  │  Key: "problem"                                                 │    │
│  │  Panel: ProblemDefinitionToolPanel                              │    │
│  │    ├─ Problem Statement                                         │    │
│  │    └─ Status: clear | unclear | missing                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 3: The Opportunity                                        │    │
│  │  Key: "opportunity"                                             │    │
│  │  Panel: OpportunityDefinitionToolPanel                          │    │
│  │    ├─ Opportunity Statement                                     │    │
│  │    └─ Status: clear | unclear | missing                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 4: Guiding "What If?" Question                            │    │
│  │  Key: "guiding_question"                                        │    │
│  │  Panel: GuidingWhatIfToolPanel                                  │    │
│  │    └─ What-If Question                                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PHASE 2: EXPLORATION                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 5: Idea Generation (Divergent)                            │    │
│  │  Key: "idea_generation"                                         │    │
│  │  Panel: IdeaGenerationToolPanel                                 │    │
│  │    ├─ Add ideas (title + description)                           │    │
│  │    └─ Uses: ideas[]                                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 6: Idea Clustering & Theming                              │    │
│  │  Key: "clustering"                                              │    │
│  │  Panel: ClusteringAndThemingToolPanel                           │    │
│  │    ├─ Create themes (label + pattern notes)                     │    │
│  │    ├─ Assign ideas to themes                                    │    │
│  │    └─ Uses: ideas[], themes[]                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PHASE 3: EVALUATION                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 7: Initial Screening (Filtering)                          │    │
│  │  Key: "screening"                                               │    │
│  │  Panel: InitialScreeningToolPanel                               │    │
│  │    ├─ Score ideas by criteria                                   │    │
│  │    └─ Uses: ideas[], scores[]                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 8: "What If?" Scenario Exploration                        │    │
│  │  Key: "scenario_exploration"                                    │    │
│  │  Panel: ScenarioExplorationToolPanel                            │    │
│  │    ├─ Create/edit scenarios per idea                             │    │
│  │    └─ Uses: ideas[], scenarios[]                                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 9: Quick Feasibility Checks (Mini-POCs)                   │    │
│  │  Key: "feasibility"                                             │    │
│  │  Panel: FeasibilityCheckToolPanel                               │    │
│  │    ├─ Run feasibility checks per idea                           │    │
│  │    ├─ Rating: High | Medium | Low                               │    │
│  │    └─ Uses: ideas[], checks[]                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       PHASE 4: DECISION                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 10: Concept Selection                                     │    │
│  │  Key: "concept_selection"                                       │    │
│  │  Panel: ConceptSelectionToolPanel                               │    │
│  │    ├─ Select winning idea                                       │    │
│  │    └─ Uses: ideas[]                                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STEP 11: One-Page Summary (Optional)                           │    │
│  │  Key: "one_page_summary"                                        │    │
│  │  Panel: OnePageSummaryToolPanel                                 │    │
│  │    ├─ Auto-generated summary                                    │    │
│  │    └─ Uses: autoSummary                                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     HANDOFF TO PS WIZARD                                │
│                                                                         │
│  Readiness check → ConceptPackage → PS Wizard Scenario                 │
│                                                                         │
│  Lifecycle: concept_selected → ready_for_wizard → converted            │
└─────────────────────────────────────────────────────────────────────────┘


---

## Context Translator Execution Flow (Step 1)

```
User enters raw text
        │
        ▼
┌─ Service Online? ─────────────────────────┐
│  YES → "Translate Context" button         │
│         │                                  │
│         ▼                                  │
│    Python Service (localhost:8585)         │
│         │                                  │
│         ▼                                  │
│    TranslateResponse returned             │
│                                            │
│  NO → "Use built-in fallback" button      │
│         │                                  │
│         ▼                                  │
│    resolveAgentLlm() → catalog LLM        │
│         │                                  │
│         ├─ LLM available?                  │
│         │   YES → callLLM(gpt-4o-mini)    │
│         │          │                       │
│         │          ▼                       │
│         │   parseLLMJson → result          │
│         │                                  │
│         │   NO or LLM fails →             │
│         │          │                       │
│         │          ▼                       │
│         │   createFallbackResponse()      │
│         │   (template, no AI)              │
│         │                                  │
│         ▼                                  │
│    TranslateResponse returned             │
└────────────────────────────────────────────┘
        │
        ▼
┌─ Decision Gate ───────────────────────────┐
│  CONTINUE → Show full results:            │
│    • Problem / Opportunity                │
│    • Core Signals (drivers + trigger)     │
│    • What-If Question                     │
│    • Workflow Draft                        │
│    • PS Wizard Package                    │
│    • Framing Notes                        │
│    → "Apply to Ideation Fields" button    │
│                                            │
│  CLARIFICATION_NEEDED → Show questions    │
│    • Clarification questions list         │
│    • Missing information list             │
└────────────────────────────────────────────┘
        │
        ▼ (on Apply)
┌─ applyToIdeation ─────────────────────────┐
│  Writes to step payloads:                 │
│    context  → drivers, trigger, need      │
│    problem  → statement, status           │
│    opportunity → statement, status        │
│    guiding_question → whatIfQuestion      │
│                                            │
│  Updates ideation snapshots               │
└────────────────────────────────────────────┘
```

---

## Step Status Progression

```
Each step: not_started → in_progress → complete
                                     ↘ blocked
```

## Data Flow Between Steps

```
Step 1 (Context)
  └→ externalDriver, internalDriver, triggerEvent, shapesNeed

Step 2 (Problem)
  └→ problemStatement, status

Step 3 (Opportunity)
  └→ opportunityStatement, status

Step 4 (Guiding Question)
  └→ whatIfQuestion

Step 5 (Idea Generation)
  └→ ideas[] ─────────────────────────┐
                                       │
Step 6 (Clustering)                    │
  └→ themes[], idea↔theme assignments ◄┘
                                       │
Step 7 (Screening)                     │
  └→ scores[] per idea ◄───────────────┘
                                       │
Step 8 (Scenarios)                     │
  └→ scenarios[] per idea ◄────────────┘
                                       │
Step 9 (Feasibility)                   │
  └→ checks[] per idea ◄──────────────┘
                                       │
Step 10 (Concept Selection)            │
  └→ selectedIdea ◄────────────────────┘

Step 11 (One-Page Summary)
  └→ autoSummary (aggregates all above)
```

---

## Source Files

| Component | File |
|---|---|
| Step constants | `shared/ps-ideation-constants.ts` |
| Workspace router | `client/src/components/projects-system/ideation/PSIdeationWorkspace.tsx` |
| Context Translator Panel | `client/src/components/projects-system/ideation/ContextTranslatorPanel.tsx` |
| Context Definition Panel | `client/src/components/projects-system/ideation/ContextDefinitionToolPanel.tsx` |
| Translator server router | `server/ps/context-translator-router.ts` |
| Translator agent | `server/modules/pmt/context-translator-agent.ts` |
| Translator types | `shared/ps-context-translator-types.ts` |
| Ideation service | `server/ps/ideation-service.ts` |
| Ideation router | `server/ps/ps.ideation-router.ts` |
