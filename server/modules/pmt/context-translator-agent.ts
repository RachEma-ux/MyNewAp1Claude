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
import type { TranslateResponse } from "@shared/ps-context-translator-types";

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

  return {
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
      statement: "Unable to determine — no LLM provider configured",
      status: "unclear",
    },
    opportunity: {
      statement: "Unable to determine — no LLM provider configured",
      status: "unclear",
    },
    coreSignals: {
      externalDrivers: ["Not determinable without LLM analysis"],
      internalDrivers: ["Not determinable without LLM analysis"],
      trigger: "Not determinable without LLM analysis",
    },
    projectContextFormula: "Project Context = External Drivers + Internal Drivers + Trigger",
    projectContextResult: "Unable to synthesize — configure an LLM provider for full analysis",
    whatIfQuestion: "What if this project idea were fully analyzed with AI assistance?",
    ideationWorkflowDraft: {
      contextOfProject: rawText,
      problem: "Requires LLM analysis",
      opportunity: "Requires LLM analysis",
      whatIfQuestion: "Requires LLM analysis",
      ideaGeneration: ["Configure an LLM provider to generate ideas"],
      ideaClusteringAndTheming: [],
      initialScreening: {
        promisingIdeas: [],
        deferredIdeas: [],
        reasoning: "LLM required for screening",
      },
      scenarioExploration: {
        scenarios: [],
        insights: "LLM required for scenario exploration",
      },
      quickFeasibilityChecks: {
        idea: "N/A",
        testPerformed: "None — no LLM available",
        keyFindings: [],
        feasibilityRating: "Unknown",
      },
      conceptSelection: {
        selectedIdea: "N/A",
        rationale: "LLM required for concept selection",
        nextStep: "Configure an LLM provider and re-run",
      },
      onePageSummary: {
        problem: "Requires analysis",
        opportunity: "Requires analysis",
        topIdeas: [],
        feasibilityInsight: "Requires analysis",
        selectedConcept: "N/A",
        reasonForSelection: "LLM provider not configured",
      },
    },
    psWizardScenarioPackage: {
      scenarioTitle: "Untitled Project — Awaiting Analysis",
      scenarioSummary: rawText.substring(0, 200),
      businessNeed: "To be determined via LLM analysis",
      primaryProblem: "To be determined via LLM analysis",
      opportunityStatement: "To be determined via LLM analysis",
      urgencyDriver: "To be determined via LLM analysis",
      recommendedDirection: "Configure LLM provider and re-analyze",
      recommendedDirectionRationale: "Full analysis requires an active LLM provider",
      whatIfQuestion: "What if this idea were fully analyzed?",
      feasibilityNotes: "No feasibility assessment without LLM",
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
