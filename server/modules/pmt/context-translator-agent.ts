/**
 * Project Context Translator Agent — AI Types Catalog Agent
 *
 * Transforms unstructured user input into structured project ideation fields
 * and a PS Wizard-ready scenario. Applies the formula:
 *   Project Context = External Drivers + Internal Drivers + Trigger
 *
 * Registered in the AI Types Catalog with full 9-axis taxonomy classification,
 * following the same pattern as the PM Idea Builder Agent.
 *
 * The agent:
 *   1. Analyzes raw user text to extract facts, problems, and opportunities
 *   2. Identifies external drivers, internal drivers, and trigger events
 *   3. Applies the Project Context formula to synthesize context
 *   4. Generates a PS Wizard-ready scenario package
 *   5. Produces an ideation workflow draft with structured sections
 *
 * Falls back to template output if no LLM provider is available.
 */

import { getAvailableProvider, callLLM, parseLLMJson } from "./idea-builder-agent";
import type { Message } from "../../providers/types";
import { createCatalogEntry, updateCatalogEntry, getCatalogEntries, createCatalogAuditEvent, getTaxonomyNodes, setEntryClassifications, getEntryClassifications } from "../../db/catalog";
import type { TranslateResponse, QuestionTableRow, AnsweredQuestionRow, QuestionTableResponse, ClarificationPayload, ClarificationChoiceGroup, ClarificationOption, ClarificationSubmission } from "@shared/ps-context-translator-types";

// ── Agent Identity ──────────────────────────────────────────────────────────

export const AGENT_CATALOG_ID = "ps.agent.context_translator";
export const AGENT_DISPLAY_NAME = "Project Context Translator";
export const AGENT_VERSION = "1.0.0";

/** Full 9-axis classification for catalog_entry_classifications */
export const AGENT_TAXONOMY_CLASSIFICATION = {
  cognitive_architecture: "cog_llm_based",        // Advanced Cognitive > LLM-Based Architecture
  functional_role: "role_specialist",              // Expert Roles > Specialist
  organizational_structure: "org_single_agent",    // Single-Unit > Single-Agent
  autonomy_level: "auto_hitl",                     // Assisted > Human-in-the-Loop (has Decision Gate)
  embodiment: "emb_software_agent",                // Software > Software Agent
  learning_paradigm: "learn_supervised_learning",  // Supervised > Supervised Learning
  decision_paradigm: "dec_probabilistic_inference",// Probabilistic > Probabilistic Inference
  governance_safety: ["gov_policy_constrained", "gov_auditable"], // Policy Control + Transparency
  cognitive_capability: "cap_context_aware",       // Contextual > Context-Aware
} as const;

export const AGENT_CAPABILITIES = [
  "tool_calling",
  "multi_step",
  "memory",
  "policy_bound",
  "governed",
] as const;

// ── System Prompt ───────────────────────────────────────────────────────────

export const CONTEXT_TRANSLATOR_SYSTEM_PROMPT = `You are a Project Context Translator — a specialist AI agent designed to transform unstructured user input into a structured project context analysis and PS Wizard-ready scenario.

CORE FORMULA:
  Project Context = External Drivers + Internal Drivers + Trigger

NON-NEGOTIABLE RULES:
1. You are ASSISTIVE ONLY — all outputs are drafts requiring human approval
2. You CANNOT approve gates, transition lifecycle states, lock baselines, or freeze artifacts
3. You CANNOT write canonical artifacts — only draft proposals
4. Every output MUST include confidence annotations (extracted, inferred, proposed)
5. If the input lacks a clear problem OR opportunity, enter Clarification Mode
6. Never fabricate facts — clearly label inferred vs. extracted information

YOUR MISSION:
Given raw, unstructured text from a user describing a project idea, business need, or organizational challenge, you will:

STEP 1 — DECISION GATE
Evaluate the input. If it contains at least one identifiable problem OR opportunity, set status to "CONTINUE". Otherwise set status to "CLARIFICATION_NEEDED" with a reason explaining what is missing, and provide targeted clarification questions.

STEP 2 — EXTRACT FACTS
Pull out every concrete fact, metric, name, date, constraint, or requirement mentioned in the input. Label each as [extracted].

STEP 3 — IDENTIFY THE PROBLEM
Articulate the core problem the user is facing. If not explicitly stated, infer it from context and label as [inferred]. Classify as "clear", "unclear", or "missing".

STEP 4 — IDENTIFY THE OPPORTUNITY
Articulate the opportunity that solving this problem would unlock. If not explicitly stated, infer it from context and label as [inferred]. Classify as "clear", "unclear", or "missing".

STEP 5 — CORE SIGNALS EXTRACTION
From the input, extract:
- External Drivers: market forces, competitive pressure, regulatory changes, customer demands, technology shifts
- Internal Drivers: process inefficiency, capability gaps, resource constraints, technical debt, cultural factors
- Trigger: the specific event or catalyst that makes this project necessary NOW

STEP 6 — APPLY THE PROJECT CONTEXT FORMULA
Combine: Project Context = External Drivers + Internal Drivers + Trigger
Produce a synthesized 2-3 sentence "Project Context Result" that captures the full picture.

STEP 7 — FRAME THE GUIDING QUESTION
Generate a "What if..." question that captures the transformative potential of addressing this context.

STEP 8 — IDEATION WORKFLOW DRAFT
Produce a structured draft across these sections:
- Context of Project (from Step 6)
- Problem (from Step 3)
- Opportunity (from Step 4)
- What-If Question (from Step 7)
- Idea Generation: 3-5 potential approaches
- Idea Clustering & Theming: group ideas into themes
- Initial Screening: promising vs. deferred ideas with reasoning
- Scenario Exploration: 2-3 scenarios with insights
- Quick Feasibility Checks: basic feasibility assessment
- Concept Selection: recommended approach with rationale
- One-Page Summary: executive-ready overview

STEP 9 — PS WIZARD SCENARIO PACKAGE
Produce a structured handoff package ready for the PS Wizard with:
- scenarioTitle: concise title (max 100 chars)
- scenarioSummary: 2-3 sentence summary
- businessNeed: the underlying business need
- primaryProblem: the core problem statement
- opportunityStatement: the opportunity
- urgencyDriver: why now
- recommendedDirection: suggested approach
- recommendedDirectionRationale: why this direction
- whatIfQuestion: the guiding what-if question
- feasibilityNotes: initial feasibility assessment
- openQuestions: items needing human input
- assumptions: assumptions made during analysis
- insights: key insights discovered

STEP 10 — MISSING INFORMATION
List any information gaps that would improve the analysis if provided by the user.

STEP 11 — CONFIDENCE NOTES
For every claim in your output, classify it as:
- extracted: directly from user input (highest confidence)
- inferred: logically derived from context (medium confidence)
- proposed: suggested by the agent based on domain knowledge (lower confidence, requires human validation)

CLARIFICATION MODE:
If Decision Gate = CLARIFICATION_NEEDED, skip Steps 3-11 and instead:
- List 3-5 specific questions that would unblock analysis
- Explain what information is missing and why it matters
- Provide a partial analysis with what you can determine

QUALITY BAR:
- Every field must be populated (use "Not determinable from input" if truly impossible)
- External Drivers must include at least one market/industry factor
- Internal Drivers must include at least one organizational factor
- Trigger must be specific and time-bound when possible
- PS Wizard package must be complete enough to prefill Step 1 of the wizard

OUTPUT FORMAT:
Return a JSON object conforming to the TranslateResponse schema. No markdown wrapping, no explanations outside the JSON.`;

// ── Analysis Functions ──────────────────────────────────────────────────────

/** Optional LLM override — resolved from catalog agent's defaultReasoningLlmRef */
export interface LlmOverrideHint {
  provider?: string;
  model?: string;
  apiBaseUrl?: string;
}

// ── Questions Table (Deterministic Field Mapping) ────────────────────────

export const QUESTIONS_TABLE: QuestionTableRow[] = [
  // ── Step 1: Context of the Project (4 Qs) ─────────────
  // ContextDefinitionToolPanel: externalDriver, internalDriver, triggerEvent, shapesNeed
  { step: "1. Context of the Project", stepKey: "context",
    question: "What external factor is driving the need for this project?",
    correspondingField: "externalDriver" },
  { step: "1. Context of the Project", stepKey: "context",
    question: "What internal factor is driving the need for this project?",
    correspondingField: "internalDriver" },
  { step: "1. Context of the Project", stepKey: "context",
    question: "What specific event or deadline triggered this initiative right now?",
    correspondingField: "triggerEvent" },
  { step: "1. Context of the Project", stepKey: "context",
    question: "How do these drivers and trigger combine to justify a project?",
    correspondingField: "shapesNeed" },

  // ── Step 2: The Problem (3 Qs) ────────────────────────
  // ProblemDefinitionToolPanel: whatIsNotWorking, whoIsImpacted, consequencesOfDoingNothing
  { step: "2. The Problem", stepKey: "problem",
    question: "What is not working today?",
    correspondingField: "whatIsNotWorking" },
  { step: "2. The Problem", stepKey: "problem",
    question: "Who is impacted by this problem?",
    correspondingField: "whoIsImpacted" },
  { step: "2. The Problem", stepKey: "problem",
    question: "What are the consequences of doing nothing?",
    correspondingField: "consequencesOfDoingNothing" },

  // ── Step 3: The Opportunity (3 Qs) ────────────────────
  // OpportunityDefinitionToolPanel: whatCouldBeImproved, whatValueCouldBeCreated, strategicAdvantage
  { step: "3. The Opportunity", stepKey: "opportunity",
    question: "What could be improved?",
    correspondingField: "whatCouldBeImproved" },
  { step: "3. The Opportunity", stepKey: "opportunity",
    question: "What value could be created?",
    correspondingField: "whatValueCouldBeCreated" },
  { step: "3. The Opportunity", stepKey: "opportunity",
    question: "What strategic advantage could result?",
    correspondingField: "strategicAdvantage" },

  // ── Step 4: Guiding What-If (1 Q) ────────────────────
  // GuidingWhatIfToolPanel: whatIf
  { step: "4. Guiding What-If Question", stepKey: "guiding_question",
    question: "What is the guiding 'What if...?' question that captures the transformative potential?",
    correspondingField: "whatIf" },

  // ── Step 5: Idea Generation (3 Qs) ───────────────────
  // IdeaGenerationToolPanel: brainstormingMethod, participants, rawIdeaList
  { step: "5. Idea Generation", stepKey: "idea_generation",
    question: "What brainstorming method or approach would you recommend?",
    correspondingField: "brainstormingMethod" },
  { step: "5. Idea Generation", stepKey: "idea_generation",
    question: "Who should participate in ideation?",
    correspondingField: "participants" },
  { step: "5. Idea Generation", stepKey: "idea_generation",
    question: "List 3-5 potential solution ideas or approaches.",
    correspondingField: "rawIdeaList" },

  // ── Step 6: Clustering & Theming (3 Qs) ──────────────
  // ClusteringAndThemingToolPanel: patternsObserved (payload)
  // + child records: psIdeationThemes (label, patternNotes)
  { step: "6. Idea Clustering & Theming", stepKey: "clustering",
    question: "What patterns or themes emerge from grouping the ideas?",
    correspondingField: "patternsObserved" },
  { step: "6. Idea Clustering & Theming", stepKey: "clustering",
    question: "What theme names or category labels would you assign to the idea clusters?",
    correspondingField: "themeLabels" },
  { step: "6. Idea Clustering & Theming", stepKey: "clustering",
    question: "How would you group the ideas into those themes?",
    correspondingField: "ideaThemeGrouping" },

  // ── Step 7: Initial Screening (3 Qs) ─────────────────
  // InitialScreeningToolPanel: screeningCriteria (payload)
  // + child records: psIdeationScreeningScores + idea shortlist status
  { step: "7. Initial Screening", stepKey: "screening",
    question: "What screening criteria should be used to evaluate ideas (e.g., Strategic Fit, Feasibility, Impact, Risk)?",
    correspondingField: "screeningCriteria" },
  { step: "7. Initial Screening", stepKey: "screening",
    question: "Which ideas appear most promising after screening?",
    correspondingField: "promisingIdeas" },
  { step: "7. Initial Screening", stepKey: "screening",
    question: "Which ideas should be deferred and why?",
    correspondingField: "deferredIdeas" },

  // ── Step 8: Scenario Exploration (7 Qs) ───────────────
  // ScenarioExplorationToolPanel: notes (payload)
  // + child records: psIdeationScenarios per idea
  { step: "8. Scenario Exploration", stepKey: "scenario_exploration",
    question: "What key insights emerge from exploring 'what if' scenarios for the top ideas?",
    correspondingField: "notes" },
  { step: "8. Scenario Exploration", stepKey: "scenario_exploration",
    question: "What would happen if adoption of the top idea were much higher than expected?",
    correspondingField: "adoptionHighScenario" },
  { step: "8. Scenario Exploration", stepKey: "scenario_exploration",
    question: "What would happen if adoption were much lower than expected?",
    correspondingField: "adoptionLowScenario" },
  { step: "8. Scenario Exploration", stepKey: "scenario_exploration",
    question: "What if costs increased significantly during implementation?",
    correspondingField: "costIncreaseScenario" },
  { step: "8. Scenario Exploration", stepKey: "scenario_exploration",
    question: "How might competitors react to this initiative?",
    correspondingField: "competitorReactionScenario" },
  { step: "8. Scenario Exploration", stepKey: "scenario_exploration",
    question: "What technology limitations could constrain this approach?",
    correspondingField: "technologyLimitScenario" },
  { step: "8. Scenario Exploration", stepKey: "scenario_exploration",
    question: "What are the most important insights from these scenario explorations?",
    correspondingField: "scenarioInsights" },

  // ── Step 9: Feasibility Checks (4 Qs) ─────────────────
  // FeasibilityCheckToolPanel: notes (payload)
  // + child records: psIdeationFeasibilityChecks per idea
  { step: "9. Quick Feasibility Checks", stepKey: "feasibility",
    question: "What are the initial feasibility findings, including technical, resource, and timeline considerations?",
    correspondingField: "notes" },
  { step: "9. Quick Feasibility Checks", stepKey: "feasibility",
    question: "What test or evaluation was performed to assess feasibility?",
    correspondingField: "testPerformed" },
  { step: "9. Quick Feasibility Checks", stepKey: "feasibility",
    question: "What were the key findings from the feasibility assessment?",
    correspondingField: "keyFindings" },
  { step: "9. Quick Feasibility Checks", stepKey: "feasibility",
    question: "What is the overall feasibility rating (High/Medium/Low)?",
    correspondingField: "feasibilityRating" },

  // ── Step 10: Concept Selection (7 Qs) ─────────────────
  // ConceptSelectionToolPanel: selectedIdeaId (FK), rationale (nested), nextStep
  { step: "10. Concept Selection", stepKey: "concept_selection",
    question: "Which idea or concept is recommended for selection, and why?",
    correspondingField: "selectedIdea" },
  { step: "10. Concept Selection", stepKey: "concept_selection",
    question: "How well does the recommended concept align with strategic goals?",
    correspondingField: "rationale.strategicAlignment" },
  { step: "10. Concept Selection", stepKey: "concept_selection",
    question: "What is the expected value or benefit of this concept?",
    correspondingField: "rationale.expectedValue" },
  { step: "10. Concept Selection", stepKey: "concept_selection",
    question: "How feasible is this concept to implement?",
    correspondingField: "rationale.feasibility" },
  { step: "10. Concept Selection", stepKey: "concept_selection",
    question: "What is the risk profile of this concept?",
    correspondingField: "rationale.riskProfile" },
  { step: "10. Concept Selection", stepKey: "concept_selection",
    question: "What level of stakeholder support exists for this concept?",
    correspondingField: "rationale.stakeholderSupport" },
  { step: "10. Concept Selection", stepKey: "concept_selection",
    question: "What should be the immediate next step after selecting this concept?",
    correspondingField: "nextStep" },

  // ── Step 11: One-Page Summary (7 Qs) ──────────────────
  // OnePageSummaryToolPanel: theProblem, theOpportunity, topIdeas,
  //   scenariosExplored, feasibilityInsights, selectedConcept, reasonForSelection
  { step: "11. One-Page Summary", stepKey: "one_page_summary",
    question: "Summarize the core problem in 1-2 sentences.",
    correspondingField: "theProblem" },
  { step: "11. One-Page Summary", stepKey: "one_page_summary",
    question: "Summarize the core opportunity in 1-2 sentences.",
    correspondingField: "theOpportunity" },
  { step: "11. One-Page Summary", stepKey: "one_page_summary",
    question: "List the top 2-3 ideas that emerged (newline-separated).",
    correspondingField: "topIdeas" },
  { step: "11. One-Page Summary", stepKey: "one_page_summary",
    question: "What scenarios were explored and what were the key takeaways?",
    correspondingField: "scenariosExplored" },
  { step: "11. One-Page Summary", stepKey: "one_page_summary",
    question: "What are the key feasibility insights?",
    correspondingField: "feasibilityInsights" },
  { step: "11. One-Page Summary", stepKey: "one_page_summary",
    question: "What concept was selected?",
    correspondingField: "selectedConcept" },
  { step: "11. One-Page Summary", stepKey: "one_page_summary",
    question: "Why was this concept selected over alternatives?",
    correspondingField: "reasonForSelection" },
];
// Total: 45 rows (4+3+3+1+3+3+3+7+4+7+7)

// ── Question-Table System Prompt ─────────────────────────────────────────

export const QUESTION_TABLE_SYSTEM_PROMPT = `You are a Project Context Translator — a specialist AI agent that transforms unstructured project input into structured answers for a PS Ideation workflow.

Given raw text and a Questions Table (JSON array of {step, stepKey, question, correspondingField}), answer every question based on the raw text.

If you can identify a clear problem AND opportunity, return status "CONTINUE" with all answers.

If the input is too vague or ambiguous to identify a clear problem or opportunity, return status "CLARIFICATION_NEEDED" AND include a "clarification" object with structured choices the user can select from.

Return JSON:
{
  "decisionGate": { "status": "CONTINUE"|"CLARIFICATION_NEEDED", "reason": "..." },
  "answeredQuestions": [
    { "step": "...", "stepKey": "...", "question": "...", "correspondingField": "...",
      "answer": "your answer here",
      "answerType": "extracted"|"inferred"|"proposed",
      "confidence": "high"|"medium"|"low",
      "evidence": "quote or reference from input" },
    ...
  ],
  "clarification": {
    "clarificationMode": "choice_dialog",
    "clarificationPrompt": "We found multiple possible interpretations. Please select the options that best describe your project.",
    "allowFreeText": true,
    "clarificationChoices": [
      {
        "groupKey": "primaryProblems",
        "groupLabel": "Primary Problem",
        "selectMode": "single",
        "stepKey": "problem",
        "correspondingFields": ["whatIsNotWorking"],
        "options": [
          { "id": "p1", "label": "...", "rationale": "...", "confidence": "medium" },
          { "id": "p2", "label": "...", "rationale": "...", "confidence": "low" }
        ]
      },
      {
        "groupKey": "primaryOpportunities",
        "groupLabel": "Primary Opportunity",
        "selectMode": "single",
        "stepKey": "opportunity",
        "correspondingFields": ["whatCouldBeImproved"],
        "options": [...]
      },
      {
        "groupKey": "externalDrivers",
        "groupLabel": "External Drivers",
        "selectMode": "multi",
        "stepKey": "context",
        "correspondingFields": ["externalDriver"],
        "options": [...]
      },
      {
        "groupKey": "internalDrivers",
        "groupLabel": "Internal Drivers",
        "selectMode": "multi",
        "stepKey": "context",
        "correspondingFields": ["internalDriver"],
        "options": [...]
      },
      {
        "groupKey": "impactedGroups",
        "groupLabel": "Impacted Groups",
        "selectMode": "multi",
        "stepKey": "problem",
        "correspondingFields": ["whoIsImpacted"],
        "options": [...]
      },
      {
        "groupKey": "consequencesOfDoingNothing",
        "groupLabel": "Consequences of Doing Nothing",
        "selectMode": "multi",
        "stepKey": "problem",
        "correspondingFields": ["consequencesOfDoingNothing"],
        "options": [...]
      }
    ]
  }
}

Rules:
- Answer ALL questions. Do not skip any row.
- If the input lacks information for a question, set answer to "" and confidence to "low".
- Do not fabricate facts. Label inferred answers honestly.
- "extracted" = directly from user input. "inferred" = logically derived. "proposed" = suggested based on domain knowledge.
- Each answer should be concise (1-3 sentences).
- If the input lacks a clear problem OR opportunity, set decisionGate status to "CLARIFICATION_NEEDED".
- When CLARIFICATION_NEEDED, you MUST include the "clarification" object with at least primaryProblems and primaryOpportunities groups.
- Each option must have a unique id (e.g., "p1", "p2", "ed1", "ed2"), a clear user-facing label, and optionally a rationale.
- Generate 2-4 options per group based on what you can infer from the input.
- When status is "CONTINUE", omit the "clarification" field entirely.
- Return ONLY the JSON, no markdown wrapping.`;

// ── Question-Table Analysis Function ─────────────────────────────────────

/**
 * Analyze raw input using the question-table-driven approach.
 * Each question maps 1:1 to a UI field — no backfill chains needed.
 */
export async function analyzeWithQuestionTable(
  rawText: string,
  llmHint?: LlmOverrideHint,
): Promise<QuestionTableResponse> {
  const provider = getAvailableProvider();
  if (!provider) return createQuestionTableFallback(rawText);

  const messages: Message[] = [
    { role: "system", content: QUESTION_TABLE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Raw text:\n---\n${rawText}\n---\n\nQuestions Table:\n${JSON.stringify(QUESTIONS_TABLE)}\n\nAnswer every question. Output ONLY JSON.`,
    },
  ];

  try {
    const raw = await callLLM(provider, messages, {
      temperature: 0.3,
      maxTokens: 8000,
      model: llmHint?.model || undefined,
    });
    const parsed = parseLLMJson(raw);
    return normalizeQuestionTableResponse(parsed);
  } catch (err: any) {
    console.warn(`[ContextTranslator] LLM call failed (question-table): ${err.message}`);
    return createQuestionTableFallback(rawText);
  }
}

/**
 * Normalize a raw LLM response into a valid QuestionTableResponse.
 * Ensures every question from QUESTIONS_TABLE has an answer row.
 */
export function normalizeQuestionTableResponse(raw: unknown): QuestionTableResponse {
  if (!raw || typeof raw !== "object") {
    return createQuestionTableFallback("");
  }

  const r = raw as Record<string, unknown>;

  // Normalize decisionGate
  let decisionGate: QuestionTableResponse["decisionGate"];
  if (r.decisionGate && typeof r.decisionGate === "object") {
    const dg = r.decisionGate as Record<string, unknown>;
    decisionGate = {
      status: dg.status === "CLARIFICATION_NEEDED" ? "CLARIFICATION_NEEDED" : "CONTINUE",
      reason: typeof dg.reason === "string" ? dg.reason : "",
    };
  } else {
    decisionGate = { status: "CONTINUE", reason: "" };
  }

  // Build a map of answered questions from the LLM response
  const answeredMap = new Map<string, Record<string, unknown>>();
  if (Array.isArray(r.answeredQuestions)) {
    for (const row of r.answeredQuestions) {
      if (row && typeof row === "object") {
        const rr = row as Record<string, unknown>;
        const key = `${rr.stepKey}::${rr.correspondingField}`;
        answeredMap.set(key, rr);
      }
    }
  }

  // Ensure every QUESTIONS_TABLE row has an answer
  const answeredQuestions: AnsweredQuestionRow[] = QUESTIONS_TABLE.map((q) => {
    const key = `${q.stepKey}::${q.correspondingField}`;
    const found = answeredMap.get(key);
    if (found) {
      return {
        ...q,
        answer: typeof found.answer === "string" ? found.answer : "",
        answerType: (found.answerType === "extracted" || found.answerType === "inferred" || found.answerType === "proposed")
          ? found.answerType : "proposed",
        confidence: (found.confidence === "high" || found.confidence === "medium" || found.confidence === "low")
          ? found.confidence : "low",
        evidence: typeof found.evidence === "string" ? found.evidence : "",
      };
    }
    // Missing row — fill with empty answer
    return {
      ...q,
      answer: "",
      answerType: "proposed" as const,
      confidence: "low" as const,
      evidence: "",
    };
  });

  // Normalize clarification payload (only when CLARIFICATION_NEEDED)
  let clarification: ClarificationPayload | undefined;
  if (decisionGate.status === "CLARIFICATION_NEEDED" && r.clarification && typeof r.clarification === "object") {
    clarification = normalizeClarificationPayload(r.clarification as Record<string, unknown>);
  }

  return { decisionGate, answeredQuestions, ...(clarification ? { clarification } : {}) };
}

/**
 * Normalize a raw clarification payload from the LLM into a valid ClarificationPayload.
 */
function normalizeClarificationPayload(raw: Record<string, unknown>): ClarificationPayload {
  const choices: ClarificationChoiceGroup[] = [];

  if (Array.isArray(raw.clarificationChoices)) {
    for (const group of raw.clarificationChoices) {
      if (!group || typeof group !== "object") continue;
      const g = group as Record<string, unknown>;
      const options: ClarificationOption[] = [];
      if (Array.isArray(g.options)) {
        for (const opt of g.options) {
          if (!opt || typeof opt !== "object") continue;
          const o = opt as Record<string, unknown>;
          options.push({
            id: typeof o.id === "string" ? o.id : `opt_${options.length}`,
            label: typeof o.label === "string" ? o.label : "",
            rationale: typeof o.rationale === "string" ? o.rationale : undefined,
            confidence: (o.confidence === "high" || o.confidence === "medium" || o.confidence === "low")
              ? o.confidence : undefined,
          });
        }
      }
      if (options.length === 0) continue;

      choices.push({
        groupKey: typeof g.groupKey === "string" ? g.groupKey : `group_${choices.length}`,
        groupLabel: typeof g.groupLabel === "string" ? g.groupLabel : "",
        selectMode: g.selectMode === "single" ? "single" : "multi",
        options,
        correspondingFields: Array.isArray(g.correspondingFields)
          ? g.correspondingFields.map(String) : [],
        stepKey: typeof g.stepKey === "string" ? g.stepKey : "",
      });
    }
  }

  return {
    clarificationMode: "choice_dialog",
    clarificationPrompt: typeof raw.clarificationPrompt === "string"
      ? raw.clarificationPrompt
      : "Please select the options that best describe your project context.",
    clarificationChoices: choices,
    allowFreeText: raw.allowFreeText !== false,
  };
}

/**
 * Build enriched raw text from original text + user's clarification selections.
 * Maps selections back to readable sentences for re-analysis.
 */
export function buildClarificationEnrichedText(
  originalRawText: string,
  clarificationChoices: ClarificationChoiceGroup[],
  submission: ClarificationSubmission,
): string {
  const parts = [originalRawText, "\n\n--- User Clarifications ---\n"];

  for (const group of clarificationChoices) {
    const selectedIds = submission.selections[group.groupKey] || [];
    if (selectedIds.length === 0) continue;
    const selectedLabels = group.options
      .filter(o => selectedIds.includes(o.id))
      .map(o => o.label);
    if (selectedLabels.length === 0) continue;
    parts.push(`${group.groupLabel}: ${selectedLabels.join("; ")}`);
  }

  if (submission.freeText?.trim()) {
    parts.push(`\nAdditional details: ${submission.freeText.trim()}`);
  }

  return parts.join("\n");
}

/**
 * Create a question-table fallback when no LLM is available.
 */
function createQuestionTableFallback(rawText: string): QuestionTableResponse {
  const words = rawText.split(/\s+/);
  const hasEnoughContent = words.length >= 10;

  return {
    decisionGate: {
      status: hasEnoughContent ? "CONTINUE" : "CLARIFICATION_NEEDED",
      reason: hasEnoughContent
        ? "Basic analysis performed without LLM — human review strongly recommended"
        : "Input too brief for meaningful analysis. Please provide more detail.",
    },
    answeredQuestions: QUESTIONS_TABLE.map((q) => ({
      ...q,
      answer: "",
      answerType: "proposed" as const,
      confidence: "low" as const,
      evidence: "",
    })),
  };
}

/**
 * Derive a legacy TranslateResponse from an answered questions table.
 * Used for persistence backward compat and legacy display sections.
 */
export function deriveTranslateResponse(qt: QuestionTableResponse): TranslateResponse {
  // Helper: get the answer for a given stepKey + field
  const getAnswer = (stepKey: string, field: string): string => {
    const row = qt.answeredQuestions.find(
      (r) => r.stepKey === stepKey && r.correspondingField === field,
    );
    return row?.answer || "";
  };

  // Collect all extracted/inferred/proposed answers for framing notes
  const extracted: string[] = [];
  const inferred: string[] = [];
  const proposed: string[] = [];
  for (const row of qt.answeredQuestions) {
    if (row.answer) {
      if (row.answerType === "extracted") extracted.push(`${row.correspondingField}: ${row.answer}`);
      else if (row.answerType === "inferred") inferred.push(`${row.correspondingField}: ${row.answer}`);
      else proposed.push(`${row.correspondingField}: ${row.answer}`);
    }
  }

  const problemStatement = getAnswer("problem", "whatIsNotWorking");
  const opportunityStatement = getAnswer("opportunity", "whatCouldBeImproved");
  const whatIfQuestion = getAnswer("guiding_question", "whatIf");

  return {
    decisionGate: qt.decisionGate,
    extractedFacts: extracted.slice(0, 10),
    problem: {
      statement: problemStatement,
      status: problemStatement ? "clear" : "missing",
    },
    opportunity: {
      statement: opportunityStatement,
      status: opportunityStatement ? "clear" : "missing",
    },
    coreSignals: {
      externalDrivers: [getAnswer("context", "externalDriver")].filter(Boolean),
      internalDrivers: [getAnswer("context", "internalDriver")].filter(Boolean),
      trigger: getAnswer("context", "triggerEvent"),
    },
    projectContextFormula: "Project Context = External Drivers + Internal Drivers + Trigger",
    projectContextResult: getAnswer("context", "shapesNeed"),
    whatIfQuestion,
    ideationWorkflowDraft: {
      contextOfProject: getAnswer("context", "shapesNeed"),
      problem: problemStatement,
      opportunity: opportunityStatement,
      whatIfQuestion,
      ideaGeneration: getAnswer("idea_generation", "rawIdeaList")
        .split("\n").map((s) => s.trim()).filter(Boolean),
      ideaClusteringAndTheming: [],
      initialScreening: {
        promisingIdeas: getAnswer("screening", "promisingIdeas")
          .split("\n").map((s: string) => s.trim()).filter(Boolean),
        deferredIdeas: getAnswer("screening", "deferredIdeas")
          .split("\n").map((s: string) => s.trim()).filter(Boolean),
        reasoning: getAnswer("screening", "screeningCriteria"),
      },
      scenarioExploration: {
        scenarios: [],
        insights: getAnswer("scenario_exploration", "notes")
          || getAnswer("scenario_exploration", "scenarioInsights"),
      },
      quickFeasibilityChecks: {
        idea: "",
        testPerformed: getAnswer("feasibility", "testPerformed"),
        keyFindings: getAnswer("feasibility", "keyFindings")
          .split("\n").map((s: string) => s.trim()).filter(Boolean),
        feasibilityRating: getAnswer("feasibility", "feasibilityRating")
          || getAnswer("feasibility", "notes"),
      },
      conceptSelection: {
        selectedIdea: getAnswer("concept_selection", "selectedIdea")
          || getAnswer("one_page_summary", "selectedConcept"),
        rationale: [
          getAnswer("concept_selection", "rationale.strategicAlignment"),
          getAnswer("concept_selection", "rationale.expectedValue"),
          getAnswer("concept_selection", "rationale.feasibility"),
          getAnswer("concept_selection", "rationale.riskProfile"),
          getAnswer("concept_selection", "rationale.stakeholderSupport"),
        ].filter(Boolean).join(" | ")
          || getAnswer("one_page_summary", "reasonForSelection"),
        nextStep: getAnswer("concept_selection", "nextStep"),
      },
      onePageSummary: {
        problem: getAnswer("one_page_summary", "theProblem"),
        opportunity: getAnswer("one_page_summary", "theOpportunity"),
        topIdeas: getAnswer("one_page_summary", "topIdeas")
          .split("\n").map((s) => s.trim()).filter(Boolean),
        feasibilityInsight: getAnswer("one_page_summary", "feasibilityInsights"),
        selectedConcept: getAnswer("one_page_summary", "selectedConcept"),
        reasonForSelection: getAnswer("one_page_summary", "reasonForSelection"),
      },
    },
    psWizardScenarioPackage: {
      scenarioTitle: getAnswer("concept_selection", "selectedIdea")
        || getAnswer("one_page_summary", "selectedConcept")
        || "Untitled Project",
      scenarioSummary: getAnswer("one_page_summary", "reasonForSelection")
        || getAnswer("concept_selection", "rationale"),
      businessNeed: getAnswer("context", "externalDriver"),
      primaryProblem: problemStatement,
      opportunityStatement,
      urgencyDriver: getAnswer("context", "triggerEvent"),
      recommendedDirection: getAnswer("one_page_summary", "selectedConcept"),
      recommendedDirectionRationale: getAnswer("one_page_summary", "reasonForSelection"),
      whatIfQuestion,
      feasibilityNotes: getAnswer("one_page_summary", "feasibilityInsights"),
      openQuestions: [],
      assumptions: [],
      insights: [],
    },
    missingInformation: qt.answeredQuestions
      .filter((r) => !r.answer && r.stepKey !== "one_page_summary")
      .map((r) => `${r.step}: ${r.question}`),
    clarificationQuestions: qt.decisionGate.status === "CLARIFICATION_NEEDED"
      ? ["Please provide more detail about your project idea, the problem you're solving, and the opportunity."]
      : [],
    framingNotes: { extracted, inferred, proposed },
    renderedMarkdown: "",
  };
}

/**
 * Normalize a raw parsed object into a safe TranslateResponse.
 * LLM responses frequently omit fields or use unexpected shapes
 * (e.g., decisionGate as a string instead of {status, reason}).
 * This ensures every required field exists with a safe default.
 */
export function normalizeTranslateResponse(raw: unknown): TranslateResponse {
  if (!raw || typeof raw !== "object") {
    return createFallbackResponse("");
  }

  const r = raw as Record<string, unknown>;

  // Normalize decisionGate — must always be {status, reason}
  let decisionGate: TranslateResponse["decisionGate"];
  if (r.decisionGate && typeof r.decisionGate === "object") {
    const dg = r.decisionGate as Record<string, unknown>;
    decisionGate = {
      status: dg.status === "CLARIFICATION_NEEDED" ? "CLARIFICATION_NEEDED" : "CONTINUE",
      reason: typeof dg.reason === "string" ? dg.reason : "",
    };
  } else if (typeof r.decisionGate === "string") {
    decisionGate = {
      status: r.decisionGate === "CLARIFICATION_NEEDED" ? "CLARIFICATION_NEEDED" : "CONTINUE",
      reason: "",
    };
  } else {
    decisionGate = { status: "CONTINUE", reason: "" };
  }

  // Normalize problem
  const normProblem = (v: unknown): TranslateResponse["problem"] => {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return {
        statement: typeof o.statement === "string" ? o.statement : "",
        status: (o.status === "clear" || o.status === "unclear" || o.status === "missing") ? o.status : "unclear",
      };
    }
    return { statement: typeof v === "string" ? v : "", status: "unclear" };
  };

  // Normalize opportunity
  const normOpportunity = (v: unknown): TranslateResponse["opportunity"] => {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return {
        statement: typeof o.statement === "string" ? o.statement : "",
        status: (o.status === "clear" || o.status === "unclear" || o.status === "missing") ? o.status : "unclear",
      };
    }
    return { statement: typeof v === "string" ? v : "", status: "unclear" };
  };

  // Normalize coreSignals
  const normSignals = (v: unknown): TranslateResponse["coreSignals"] => {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return {
        externalDrivers: Array.isArray(o.externalDrivers) ? o.externalDrivers.map(String) : [],
        internalDrivers: Array.isArray(o.internalDrivers) ? o.internalDrivers.map(String) : [],
        trigger: typeof o.trigger === "string" ? o.trigger : "",
      };
    }
    return { externalDrivers: [], internalDrivers: [], trigger: "" };
  };

  const result: TranslateResponse = {
    decisionGate,
    extractedFacts: Array.isArray(r.extractedFacts) ? r.extractedFacts.map(String) : [],
    problem: normProblem(r.problem),
    opportunity: normOpportunity(r.opportunity),
    coreSignals: normSignals(r.coreSignals),
    projectContextFormula: typeof r.projectContextFormula === "string" ? r.projectContextFormula : "",
    projectContextResult: typeof r.projectContextResult === "string" ? r.projectContextResult : "",
    whatIfQuestion: typeof r.whatIfQuestion === "string" ? r.whatIfQuestion : "",
    ideationWorkflowDraft: (r.ideationWorkflowDraft && typeof r.ideationWorkflowDraft === "object")
      ? r.ideationWorkflowDraft as TranslateResponse["ideationWorkflowDraft"]
      : { contextOfProject: "", problem: "", opportunity: "", whatIfQuestion: "", ideaGeneration: [], ideaClusteringAndTheming: [], initialScreening: { promisingIdeas: [], deferredIdeas: [], reasoning: "" }, scenarioExploration: { scenarios: [], insights: "" }, quickFeasibilityChecks: { idea: "", testPerformed: "", keyFindings: [], feasibilityRating: "" }, conceptSelection: { selectedIdea: "", rationale: "", nextStep: "" }, onePageSummary: { problem: "", opportunity: "", topIdeas: [], feasibilityInsight: "", selectedConcept: "", reasonForSelection: "" } },
    psWizardScenarioPackage: (r.psWizardScenarioPackage && typeof r.psWizardScenarioPackage === "object")
      ? r.psWizardScenarioPackage as TranslateResponse["psWizardScenarioPackage"]
      : { scenarioTitle: "", scenarioSummary: "", businessNeed: "", primaryProblem: "", opportunityStatement: "", urgencyDriver: "", recommendedDirection: "", recommendedDirectionRationale: "", whatIfQuestion: "", feasibilityNotes: "", openQuestions: [], assumptions: [], insights: [] },
    missingInformation: Array.isArray(r.missingInformation) ? r.missingInformation.map(String) : [],
    clarificationQuestions: Array.isArray(r.clarificationQuestions) ? r.clarificationQuestions.map(String) : [],
    framingNotes: (r.framingNotes && typeof r.framingNotes === "object")
      ? r.framingNotes as TranslateResponse["framingNotes"]
      : { extracted: [], inferred: [], proposed: [] },
    renderedMarkdown: typeof r.renderedMarkdown === "string" ? r.renderedMarkdown : "",
  };

  // ── Coherence enforcement ─────────────────────────────────────────
  enforceCoherence(result);

  return result;
}

/**
 * Cross-fill between top-level fields and ideationWorkflowDraft.onePageSummary,
 * and enrich weak coreSignals from richer downstream sources.
 * Mutates the response in place.
 */
function enforceCoherence(r: TranslateResponse): void {
  const summary = r.ideationWorkflowDraft?.onePageSummary;

  const isEmpty = (s: string | undefined | null): boolean =>
    !s || s.trim().length === 0;

  const isEmptyArr = (a: unknown[] | undefined | null): boolean =>
    !a || a.length === 0 || a.every(v => isEmpty(typeof v === "string" ? v : ""));

  // ── coreSignals enrichment from richer downstream sources ──────────
  // LLMs frequently populate psWizardScenarioPackage, framingNotes, and
  // ideationWorkflowDraft.contextOfProject but leave coreSignals sparse.
  // Cross-fill so that Step 1 mapping never writes blank strings when
  // richer context exists elsewhere in the response.

  const pkg = r.psWizardScenarioPackage;
  const notes = r.framingNotes;
  const draft = r.ideationWorkflowDraft;

  // External drivers: backfill from framing notes (extracted), wizard package, or facts
  if (isEmptyArr(r.coreSignals?.externalDrivers)) {
    const candidates: string[] = [];
    if (notes?.extracted?.length) candidates.push(...notes.extracted.filter(s => s && s.trim()));
    if (!isEmpty(pkg?.urgencyDriver)) candidates.push(pkg.urgencyDriver);
    if (!isEmpty(pkg?.businessNeed)) candidates.push(pkg.businessNeed);
    if (candidates.length === 0 && r.extractedFacts?.length) {
      candidates.push(...r.extractedFacts.filter(s => s && s.trim()).slice(0, 2));
    }
    if (candidates.length > 0) {
      r.coreSignals.externalDrivers = candidates;
    }
  }

  // Internal drivers: backfill from framing notes (inferred), problem, wizard package
  if (isEmptyArr(r.coreSignals?.internalDrivers)) {
    const candidates: string[] = [];
    if (notes?.inferred?.length) candidates.push(...notes.inferred.filter(s => s && s.trim()));
    if (!isEmpty(r.problem?.statement)) candidates.push(r.problem.statement);
    if (!isEmpty(pkg?.primaryProblem) && pkg.primaryProblem !== r.problem?.statement) {
      candidates.push(pkg.primaryProblem);
    }
    if (candidates.length > 0) {
      r.coreSignals.internalDrivers = candidates;
    }
  }

  // Trigger: backfill from wizard urgencyDriver, decision gate reason, or draft context
  if (isEmpty(r.coreSignals?.trigger)) {
    if (!isEmpty(pkg?.urgencyDriver)) {
      r.coreSignals.trigger = pkg.urgencyDriver;
    } else if (!isEmpty(r.decisionGate?.reason) && r.decisionGate.status === "CONTINUE") {
      r.coreSignals.trigger = r.decisionGate.reason;
    } else if (!isEmpty(draft?.contextOfProject)) {
      // Use first sentence of contextOfProject as trigger approximation
      const first = draft.contextOfProject.split(/[.!?]\s/)[0];
      if (first && first.trim().length > 10) {
        r.coreSignals.trigger = first.trim();
      }
    }
  }

  // projectContextResult: backfill from draft contextOfProject or wizard scenarioSummary
  if (isEmpty(r.projectContextResult)) {
    if (!isEmpty(draft?.contextOfProject)) {
      r.projectContextResult = draft.contextOfProject;
    } else if (!isEmpty(pkg?.scenarioSummary)) {
      r.projectContextResult = pkg.scenarioSummary;
    }
  }

  // ── onePageSummary cross-fill (existing logic) ─────────────────────
  if (summary) {
    // Forward-fill: top-level → onePageSummary
    if (!isEmpty(r.problem?.statement) && isEmpty(summary.problem)) {
      summary.problem = r.problem.statement;
    }
    if (!isEmpty(r.opportunity?.statement) && isEmpty(summary.opportunity)) {
      summary.opportunity = r.opportunity.statement;
    }

    // Backfill: onePageSummary → top-level (only if top-level is truly empty)
    if (isEmpty(r.problem?.statement) && !isEmpty(summary.problem)) {
      r.problem.statement = summary.problem;
      if (r.problem.status === "missing") r.problem.status = "unclear";
    }
    if (isEmpty(r.opportunity?.statement) && !isEmpty(summary.opportunity)) {
      r.opportunity.statement = summary.opportunity;
      if (r.opportunity.status === "missing") r.opportunity.status = "unclear";
    }
  }

  // Cross-fill whatIfQuestion
  const draftWhatIf = r.ideationWorkflowDraft?.whatIfQuestion;
  if (isEmpty(r.whatIfQuestion) && !isEmpty(draftWhatIf)) {
    r.whatIfQuestion = draftWhatIf;
  } else if (!isEmpty(r.whatIfQuestion) && isEmpty(draftWhatIf)) {
    r.ideationWorkflowDraft.whatIfQuestion = r.whatIfQuestion;
  }
}

/**
 * Analyze raw user input and produce a structured context translation.
 *
 * @param rawText - The unstructured project text to analyze
 * @param llmHint - Optional LLM override from the catalog agent's defaultReasoningLlmRef.
 *   When provided, the model field is passed to the LLM provider for routing.
 *   This ensures the admin-selected reasoning LLM is used even in built-in mode.
 */
export async function analyzeRawInput(
  rawText: string,
  llmHint?: LlmOverrideHint,
): Promise<TranslateResponse> {
  const provider = getAvailableProvider();

  if (!provider) {
    // No LLM provider at all — return clearly-labeled template fallback
    return createFallbackResponse(rawText);
  }

  const messages: Message[] = [
    { role: "system", content: CONTEXT_TRANSLATOR_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Analyze the following raw project input and produce a complete TranslateResponse JSON object.\n\n---\n\n${rawText}\n\n---\n\nOutput ONLY the JSON object, no additional text.`,
    },
  ];

  // Use the catalog-resolved model if provided, otherwise let the provider choose
  try {
    const raw = await callLLM(provider, messages, {
      temperature: 0.3,
      maxTokens: 8000,
      model: llmHint?.model || undefined,
    });
    const parsed = parseLLMJson(raw);
    return normalizeTranslateResponse(parsed);
  } catch (err: any) {
    // LLM call failed (quota exceeded, network error, etc.) — degrade gracefully
    console.warn(`[ContextTranslator] LLM call failed (${err.code || err.message}), falling back to template`);
    return createFallbackResponse(rawText);
  }
}

/** Generate a PS Wizard scenario package from raw input */
export async function translateToWizardScenario(rawText: string): Promise<TranslateResponse["psWizardScenarioPackage"]> {
  const result = await analyzeRawInput(rawText);
  return result.psWizardScenarioPackage;
}

// ── Fallback Generator ──────────────────────────────────────────────────────

/** Create a template response when no LLM provider is available */
function createFallbackResponse(rawText: string): TranslateResponse {
  const words = rawText.split(/\s+/);
  const hasEnoughContent = words.length >= 10;

  // Unified placeholder — every analytical field uses this exact string
  // so the output is semantically coherent (no mix of different wordings).
  const P = "Awaiting LLM analysis";

  return {
    decisionGate: {
      status: hasEnoughContent ? "CONTINUE" : "CLARIFICATION_NEEDED",
      reason: hasEnoughContent
        ? "Basic analysis performed without LLM — human review strongly recommended"
        : "Input too brief for meaningful analysis. Please provide more detail.",
    },
    extractedFacts: words.length > 5
      ? [`Input contains ${words.length} words`, "No LLM available for deep analysis"]
      : ["Input too brief for fact extraction"],
    problem: {
      statement: P,
      status: "unclear",
    },
    opportunity: {
      statement: P,
      status: "unclear",
    },
    coreSignals: {
      externalDrivers: [P],
      internalDrivers: [P],
      trigger: P,
    },
    projectContextFormula: "Project Context = External Drivers + Internal Drivers + Trigger",
    projectContextResult: P,
    whatIfQuestion: P,
    ideationWorkflowDraft: {
      contextOfProject: rawText,
      problem: P,
      opportunity: P,
      whatIfQuestion: P,
      ideaGeneration: [P],
      ideaClusteringAndTheming: [],
      initialScreening: {
        promisingIdeas: [],
        deferredIdeas: [],
        reasoning: P,
      },
      scenarioExploration: {
        scenarios: [],
        insights: P,
      },
      quickFeasibilityChecks: {
        idea: P,
        testPerformed: P,
        keyFindings: [],
        feasibilityRating: P,
      },
      conceptSelection: {
        selectedIdea: P,
        rationale: P,
        nextStep: "Configure an LLM provider and re-run",
      },
      onePageSummary: {
        problem: P,
        opportunity: P,
        topIdeas: [],
        feasibilityInsight: P,
        selectedConcept: P,
        reasonForSelection: P,
      },
    },
    psWizardScenarioPackage: {
      scenarioTitle: "Untitled Project — Awaiting Analysis",
      scenarioSummary: rawText.substring(0, 200),
      businessNeed: P,
      primaryProblem: P,
      opportunityStatement: P,
      urgencyDriver: P,
      recommendedDirection: "Configure an LLM provider and re-analyze",
      recommendedDirectionRationale: P,
      whatIfQuestion: P,
      feasibilityNotes: P,
      openQuestions: ["What is the core problem?", "What is the business opportunity?", "What is driving urgency?"],
      assumptions: ["User will configure an LLM provider for full analysis"],
      insights: ["Raw input captured for future analysis"],
    },
    missingInformation: ["LLM provider configuration required for full analysis"],
    clarificationQuestions: hasEnoughContent
      ? []
      : ["Please describe your project idea in more detail (at least 2-3 sentences)"],
    framingNotes: {
      extracted: [`Raw input: ${words.length} words`],
      inferred: [],
      proposed: ["Configure an LLM provider for AI-powered analysis"],
    },
    renderedMarkdown: `## Project Context Translator\n\n**Status:** LLM provider not configured\n\n**Raw Input:** ${rawText.substring(0, 500)}\n\n> Configure an LLM provider (OpenAI, Anthropic, etc.) to enable full project context analysis.`,
  };
}

// ── Catalog Registration ────────────────────────────────────────────────────

/** Resolve taxonomy classification keys to DB node IDs */
async function resolveTaxonomyNodeIds(): Promise<number[]> {
  const allNodes = await getTaxonomyNodes({ entryType: "agent" });
  const nodeIds: number[] = [];

  const classificationKeys: string[] = [];
  for (const value of Object.values(AGENT_TAXONOMY_CLASSIFICATION)) {
    if (Array.isArray(value)) {
      classificationKeys.push(...value);
    } else {
      classificationKeys.push(value as string);
    }
  }

  for (const key of classificationKeys) {
    const node = allNodes.find(n => n.key === key);
    if (node) {
      nodeIds.push(node.id);
    }
  }

  return nodeIds;
}

/** Ensure the Project Context Translator Agent is registered in the AI Types Catalog */
export async function ensureContextTranslatorRegistered(): Promise<number | null> {
  try {
    // Check if already registered
    const existing = await getCatalogEntries({ entryType: "agent" });
    const found = existing.find(e => e.name === AGENT_CATALOG_ID);

    if (found) {
      // Ensure runtime config is present (fix config drift from older registrations)
      const existingConfig = (found.config as Record<string, unknown>) || {};
      if (!existingConfig.runtime || (existingConfig.runtime as any)?.kind !== "service") {
        try {
          await updateCatalogEntry(found.id, {
            config: {
              ...existingConfig,
              runtime: {
                kind: "service",
                serviceKind: "python",
                serviceName: "project-context-translator",
                serviceUrlEnv: "PROJECT_CONTEXT_TRANSLATOR_URL",
                serviceUrlDefault: "http://localhost:8585",
                healthEndpoint: "/health",
                statusEndpoint: "/status",
                translateEndpoint: "/translate",
                inputSchemaRef: "shared/ps-context-translator-types#TranslateRequest",
                outputSchemaRef: "shared/ps-context-translator-types#TranslateResponse",
                capabilityTags: ["ps-ideation", "wizard-handoff", "context-framing"],
                bounded: true,
              },
            },
          }, 0);
          console.log(`[ContextTranslator] Patched missing runtime config on existing agent (id=${found.id})`);
        } catch (patchErr: any) {
          console.warn(`[ContextTranslator] Failed to patch runtime config:`, patchErr.message);
        }
      }

      // Ensure taxonomy classifications are assigned
      try {
        const existingClassifications = await getEntryClassifications(found.id);
        if (existingClassifications.length === 0) {
          const nodeIds = await resolveTaxonomyNodeIds();
          if (nodeIds.length > 0) {
            await setEntryClassifications(found.id, nodeIds);
            console.log(`[ContextTranslator] Assigned ${nodeIds.length} taxonomy classifications to existing agent (id=${found.id})`);
          }
        }
      } catch (classErr: any) {
        console.warn(`[ContextTranslator] Failed to assign taxonomy classifications:`, classErr.message);
      }
      return found.id;
    }

    // Register new catalog entry
    const entry = await createCatalogEntry({
      name: AGENT_CATALOG_ID,
      displayName: AGENT_DISPLAY_NAME,
      description: "An AI-powered agent that transforms unstructured project ideas into structured context analysis and PS Wizard-ready scenarios. Applies the formula: Project Context = External Drivers + Internal Drivers + Trigger. Produces decision gates, core signals, ideation workflow drafts, and scenario packages.",
      entryType: "agent",
      category: "specialist",
      subCategory: "ideation",
      capabilities: [...AGENT_CAPABILITIES],
      scope: "app",
      status: "active",
      origin: "system",
      reviewState: "approved",
      config: {
        version: AGENT_VERSION,
        agentType: "context_translator",
        systemPrompt: CONTEXT_TRANSLATOR_SYSTEM_PROMPT,
        outputSections: [
          "decisionGate", "extractedFacts", "problem", "opportunity",
          "coreSignals", "projectContextFormula", "projectContextResult",
          "whatIfQuestion", "ideationWorkflowDraft", "psWizardScenarioPackage",
          "missingInformation", "framingNotes",
        ],
        // ── Runtime metadata (service-based agent) ────────────────────────
        runtime: {
          kind: "service",
          serviceKind: "python",
          serviceName: "project-context-translator",
          serviceUrlEnv: "PROJECT_CONTEXT_TRANSLATOR_URL",
          serviceUrlDefault: "http://localhost:8585",
          healthEndpoint: "/health",
          statusEndpoint: "/status",
          translateEndpoint: "/translate",
          inputSchemaRef: "shared/ps-context-translator-types#TranslateRequest",
          outputSchemaRef: "shared/ps-context-translator-types#TranslateResponse",
          capabilityTags: ["ps-ideation", "wizard-handoff", "context-framing"],
          bounded: true,
        },
        taxonomyClassification: AGENT_TAXONOMY_CLASSIFICATION,
        enforcementOverlay: {
          deny: [
            "gate_submit", "gate_approve", "gate_reject", "gate_waive",
            "state_transition", "baseline_lock", "baseline_unlock",
            "freeze", "unfreeze", "artifact_write_canonical",
          ],
          requireHumanReview: true,
        },
        cognitiveLoop: {
          sense: "Receives raw unstructured project text from user",
          think: "LLM-powered extraction of facts, drivers, signals, and opportunities",
          act: "Generates structured context analysis + PS Wizard scenario package",
          learn: "Incorporates clarification answers and iterates on analysis",
        },
        memoryType: "session",
        toolAccess: ["context_extraction", "scenario_framing", "feasibility_assessment"],
        phasesAllowed: ["draft_shell", "initiating", "planning"],
      },
      tags: ["ps", "ideation", "context-translator", "wizard", "scenario", "llm-powered"],
      createdBy: 1, // system user
    });

    // Assign taxonomy classifications
    try {
      const nodeIds = await resolveTaxonomyNodeIds();
      if (nodeIds.length > 0) {
        await setEntryClassifications(entry.id, nodeIds);
        console.log(`[ContextTranslator] Assigned ${nodeIds.length} taxonomy classifications`);
      }
    } catch (classErr: any) {
      console.warn(`[ContextTranslator] Failed to assign taxonomy classifications:`, classErr.message);
    }

    // Audit the registration
    await createCatalogAuditEvent({
      eventType: "agent_registered",
      catalogEntryId: entry.id,
      actor: 0,
      actorType: "system",
      payload: {
        agentId: AGENT_CATALOG_ID,
        version: AGENT_VERSION,
        classification: AGENT_TAXONOMY_CLASSIFICATION,
      },
    });

    console.log(`[ContextTranslator] Registered AI agent in catalog: ${AGENT_DISPLAY_NAME} (id=${entry.id})`);
    return entry.id;
  } catch (err: any) {
    console.error(`[ContextTranslator] Failed to register agent in catalog:`, err.message);
    return null;
  }
}
