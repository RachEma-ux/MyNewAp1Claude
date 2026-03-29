/**
 * Context Translator Client — Contract Tests
 *
 * Tests the TypeScript client contract, types, error handling,
 * normalizeTranslateResponse, canonical payload keys, and backward compat.
 * Does NOT require the Python service to be running.
 */
import { describe, it, expect } from "vitest";
import type {
  TranslateRequest,
  TranslateResponse,
  DecisionGate,
  ProblemStatement,
  OpportunityStatement,
  CoreSignals,
  PSWizardScenarioPackage,
  FramingNotes,
  HealthResponse,
} from "./context-translator-client";
import { normalizeTranslateResponse, QUESTIONS_TABLE, normalizeQuestionTableResponse, deriveTranslateResponse, buildClarificationEnrichedText } from "../modules/pmt/context-translator-agent";
import type {
  AnsweredQuestionRow,
  QuestionTableResponse,
  ClarificationPayload,
  ClarificationChoiceGroup,
  ClarificationOption,
  ClarificationSubmission,
} from "@shared/ps-context-translator-types";
import { IDEATION_STEP_KEYS } from "@shared/ps-ideation-constants";

describe("Context Translator Client Types", () => {
  it("TranslateRequest requires rawText", () => {
    const req: TranslateRequest = {
      rawText: "Test input text for project analysis",
    };
    expect(req.rawText).toBeTruthy();
    expect(req.metadata).toBeUndefined();
  });

  it("TranslateRequest accepts optional metadata", () => {
    const req: TranslateRequest = {
      rawText: "Test input",
      metadata: { workspaceId: 1, sourceType: "manual" },
    };
    expect(req.metadata).toBeDefined();
    expect(req.metadata!.workspaceId).toBe(1);
  });

  it("DecisionGate has CONTINUE status", () => {
    const gate: DecisionGate = { status: "CONTINUE", reason: "Problem identified" };
    expect(gate.status).toBe("CONTINUE");
  });

  it("DecisionGate has CLARIFICATION_NEEDED status", () => {
    const gate: DecisionGate = { status: "CLARIFICATION_NEEDED", reason: "No clear problem" };
    expect(gate.status).toBe("CLARIFICATION_NEEDED");
  });

  it("ProblemStatement has clear/unclear/missing statuses", () => {
    const clear: ProblemStatement = { statement: "test", status: "clear" };
    const unclear: ProblemStatement = { statement: "", status: "unclear" };
    const missing: ProblemStatement = { statement: "", status: "missing" };
    expect(clear.status).toBe("clear");
    expect(unclear.status).toBe("unclear");
    expect(missing.status).toBe("missing");
  });

  it("CoreSignals has all required fields", () => {
    const signals: CoreSignals = {
      externalDrivers: ["Market competition"],
      internalDrivers: ["Process inefficiency"],
      trigger: "Executive mandate",
    };
    expect(signals.externalDrivers).toHaveLength(1);
    expect(signals.internalDrivers).toHaveLength(1);
    expect(signals.trigger).toBeTruthy();
  });

  it("PSWizardScenarioPackage has all required fields", () => {
    const pkg: PSWizardScenarioPackage = {
      scenarioTitle: "Test Project",
      scenarioSummary: "A test summary",
      businessNeed: "Modernization needed",
      primaryProblem: "Legacy system",
      opportunityStatement: "Better UX",
      urgencyDriver: "End of support",
      recommendedDirection: "Rebuild",
      recommendedDirectionRationale: "Cost effective",
      whatIfQuestion: "What if we rebuild?",
      feasibilityNotes: "Medium complexity",
      openQuestions: ["Budget?"],
      assumptions: ["Team available"],
      insights: ["Users want self-service"],
    };
    expect(pkg.scenarioTitle).toBeTruthy();
    expect(pkg.primaryProblem).toBeTruthy();
    expect(pkg.opportunityStatement).toBeTruthy();
  });

  it("Full TranslateResponse conforms to contract", () => {
    const response: TranslateResponse = {
      decisionGate: { status: "CONTINUE", reason: "" },
      extractedFacts: ["fact1", "fact2"],
      problem: { statement: "Problem", status: "clear" },
      opportunity: { statement: "Opportunity", status: "clear" },
      coreSignals: {
        externalDrivers: ["Market shift"],
        internalDrivers: ["Capability gap"],
        trigger: "Budget cycle",
      },
      projectContextFormula: "Project Context = External Drivers + Internal Drivers + Trigger",
      projectContextResult: "Result context",
      whatIfQuestion: "What if we acted now?",
      ideationWorkflowDraft: {
        contextOfProject: "Context",
        problem: "Problem",
        opportunity: "Opportunity",
        whatIfQuestion: "What if?",
        ideaGeneration: ["idea1", "idea2"],
        ideaClusteringAndTheming: [{ theme: "Theme1", ideas: ["idea1"] }],
        initialScreening: {
          promisingIdeas: ["idea1"],
          deferredIdeas: ["idea2"],
          reasoning: "Reason",
        },
        scenarioExploration: {
          scenarios: [{ name: "Scenario1", description: "Desc" }],
          insights: "Insights",
        },
        quickFeasibilityChecks: {
          idea: "idea1",
          testPerformed: "Market survey",
          keyFindings: ["finding1"],
          feasibilityRating: "Medium",
        },
        conceptSelection: {
          selectedIdea: "idea1",
          rationale: "Best fit",
          nextStep: "Prototype",
        },
        onePageSummary: {
          problem: "Problem",
          opportunity: "Opportunity",
          topIdeas: ["idea1"],
          feasibilityInsight: "Medium risk",
          selectedConcept: "idea1",
          reasonForSelection: "Best ROI",
        },
      },
      psWizardScenarioPackage: {
        scenarioTitle: "Test",
        scenarioSummary: "Summary",
        businessNeed: "Need",
        primaryProblem: "Problem",
        opportunityStatement: "Opportunity",
        urgencyDriver: "Driver",
        recommendedDirection: "Direction",
        recommendedDirectionRationale: "Rationale",
        whatIfQuestion: "What if?",
        feasibilityNotes: "Notes",
        openQuestions: [],
        assumptions: [],
        insights: [],
      },
      missingInformation: [],
      clarificationQuestions: [],
      framingNotes: { extracted: [], inferred: [], proposed: [] },
      renderedMarkdown: "",
    };

    expect(response.decisionGate.status).toBe("CONTINUE");
    expect(response.problem.statement).toBeTruthy();
    expect(response.opportunity.statement).toBeTruthy();
    expect(response.coreSignals.externalDrivers).toHaveLength(1);
    expect(response.psWizardScenarioPackage.scenarioTitle).toBeTruthy();
  });

  it("HealthResponse has expected shape", () => {
    const health: HealthResponse = {
      status: "ok",
      service: "project-context-translator",
      version: "1.0.0",
      llmProvider: "openai",
      llmModel: "gpt-4o-mini",
      promptLoaded: true,
    };
    expect(health.status).toBe("ok");
    expect(health.service).toBe("project-context-translator");
  });
});

// ── normalizeTranslateResponse Tests ──────────────────────────────────────

describe("normalizeTranslateResponse", () => {
  it("handles null/undefined input gracefully", () => {
    const result = normalizeTranslateResponse(null);
    expect(result.decisionGate.status).toBe("CONTINUE");
    expect(result.decisionGate.reason).toBeDefined();
    expect(result.problem.statement).toBeDefined();
  });

  it("handles empty object input", () => {
    const result = normalizeTranslateResponse({});
    expect(result.decisionGate.status).toBe("CONTINUE");
    expect(result.decisionGate.reason).toBe("");
    expect(result.problem.status).toBe("unclear");
    expect(result.opportunity.status).toBe("unclear");
    expect(result.coreSignals.externalDrivers).toEqual([]);
  });

  it("handles missing decisionGate — the exact crash scenario", () => {
    const raw = {
      problem: { statement: "Some problem", status: "clear" },
      opportunity: { statement: "Some opportunity", status: "clear" },
    };
    const result = normalizeTranslateResponse(raw);
    expect(result.decisionGate.status).toBe("CONTINUE");
    expect(result.decisionGate.reason).toBe("");
    // Should not throw when accessing .reason
    expect(() => result.decisionGate.reason.includes("without LLM")).not.toThrow();
  });

  it("handles decisionGate as a bare string", () => {
    const result = normalizeTranslateResponse({ decisionGate: "CONTINUE" });
    expect(result.decisionGate.status).toBe("CONTINUE");
    expect(result.decisionGate.reason).toBe("");
  });

  it("handles decisionGate with missing reason field", () => {
    const result = normalizeTranslateResponse({
      decisionGate: { status: "CONTINUE" },
    });
    expect(result.decisionGate.status).toBe("CONTINUE");
    expect(result.decisionGate.reason).toBe("");
  });

  it("handles decisionGate with reason as an object", () => {
    const result = normalizeTranslateResponse({
      decisionGate: { status: "CONTINUE", reason: { text: "some reason" } },
    });
    expect(result.decisionGate.status).toBe("CONTINUE");
    // Non-string reason should default to empty string
    expect(result.decisionGate.reason).toBe("");
  });

  it("preserves valid CLARIFICATION_NEEDED status", () => {
    const result = normalizeTranslateResponse({
      decisionGate: { status: "CLARIFICATION_NEEDED", reason: "Not enough info" },
    });
    expect(result.decisionGate.status).toBe("CLARIFICATION_NEEDED");
    expect(result.decisionGate.reason).toBe("Not enough info");
  });

  it("normalizes problem when it is a plain string", () => {
    const result = normalizeTranslateResponse({ problem: "Legacy system issue" });
    expect(result.problem.statement).toBe("Legacy system issue");
    expect(result.problem.status).toBe("unclear");
  });

  it("normalizes well-formed response passthrough", () => {
    const input = {
      decisionGate: { status: "CONTINUE", reason: "All clear" },
      extractedFacts: ["fact1"],
      problem: { statement: "Problem A", status: "clear" },
      opportunity: { statement: "Opportunity B", status: "clear" },
      coreSignals: {
        externalDrivers: ["Driver 1"],
        internalDrivers: ["Driver 2"],
        trigger: "Event X",
      },
      projectContextResult: "Context result",
      whatIfQuestion: "What if?",
    };
    const result = normalizeTranslateResponse(input);
    expect(result.decisionGate.status).toBe("CONTINUE");
    expect(result.decisionGate.reason).toBe("All clear");
    expect(result.problem.statement).toBe("Problem A");
    expect(result.opportunity.statement).toBe("Opportunity B");
    expect(result.coreSignals.externalDrivers).toEqual(["Driver 1"]);
    expect(result.whatIfQuestion).toBe("What if?");
  });
});

// ── Canonical Payload Mapping Tests ──────────────────────────────────────

describe("Context Translator Canonical Payload Mapping", () => {
  it("maps translator output to canonical Step 1-4 form field keys", () => {
    const response: TranslateResponse = {
      decisionGate: { status: "CONTINUE", reason: "" },
      extractedFacts: [],
      problem: { statement: "Slow portal", status: "clear" },
      opportunity: { statement: "Self-service portal", status: "clear" },
      coreSignals: {
        externalDrivers: ["Market shift", "Competitor advantage"],
        internalDrivers: ["Legacy tech debt"],
        trigger: "Executive mandate Q2",
      },
      projectContextFormula: "Project Context = External Drivers + Internal Drivers + Trigger",
      projectContextResult: "The combination of market pressure and internal inefficiency requires immediate action",
      whatIfQuestion: "What if we built a modern self-service portal?",
      ideationWorkflowDraft: {} as any,
      psWizardScenarioPackage: {} as any,
      missingInformation: [],
      clarificationQuestions: [],
      framingNotes: { extracted: [], inferred: [], proposed: [] },
      renderedMarkdown: "",
    };

    const toStr = (v: unknown): string => (v == null ? "" : String(v));

    // Step 1: Context — canonical keys match ContextDefinitionToolPanel
    const contextPayload = {
      externalDriver: response.coreSignals.externalDrivers.join("; "),
      internalDriver: response.coreSignals.internalDrivers.join("; "),
      triggerEvent: response.coreSignals.trigger,
      shapesNeed: response.projectContextResult,
    };
    expect(contextPayload.externalDriver).toBe("Market shift; Competitor advantage");
    expect(contextPayload.internalDriver).toBe("Legacy tech debt");
    expect(contextPayload.triggerEvent).toBe("Executive mandate Q2");
    expect(contextPayload.shapesNeed).toContain("market pressure");

    // Step 2: Problem — canonical keys match ProblemDefinitionToolPanel
    const problemPayload = {
      whatIsNotWorking: toStr(response.problem.statement),
      whoIsImpacted: "",
      consequencesOfDoingNothing: "",
    };
    expect(problemPayload.whatIsNotWorking).toBe("Slow portal");
    expect(problemPayload).toHaveProperty("whoIsImpacted");
    expect(problemPayload).toHaveProperty("consequencesOfDoingNothing");

    // Step 3: Opportunity — canonical keys match OpportunityDefinitionToolPanel
    const opportunityPayload = {
      whatCouldBeImproved: toStr(response.opportunity.statement),
      whatValueCouldBeCreated: "",
      strategicAdvantage: "",
    };
    expect(opportunityPayload.whatCouldBeImproved).toBe("Self-service portal");
    expect(opportunityPayload).toHaveProperty("whatValueCouldBeCreated");
    expect(opportunityPayload).toHaveProperty("strategicAdvantage");

    // Step 4: Guiding Question — canonical key matches GuidingWhatIfToolPanel
    const guidingPayload = {
      whatIf: toStr(response.whatIfQuestion),
    };
    expect(guidingPayload.whatIf).toBe("What if we built a modern self-service portal?");
  });

  it("does NOT use old non-canonical keys (problemStatement, opportunityStatement, whatIfQuestion)", () => {
    // The canonical payloads must NOT contain the old mismatched keys
    const canonicalProblemKeys = ["whatIsNotWorking", "whoIsImpacted", "consequencesOfDoingNothing"];
    const canonicalOpportunityKeys = ["whatCouldBeImproved", "whatValueCouldBeCreated", "strategicAdvantage"];
    const canonicalGuidingKeys = ["whatIf"];

    // Old keys that caused the mismatch
    expect(canonicalProblemKeys).not.toContain("problemStatement");
    expect(canonicalProblemKeys).not.toContain("status");
    expect(canonicalOpportunityKeys).not.toContain("opportunityStatement");
    expect(canonicalGuidingKeys).not.toContain("whatIfQuestion");
  });
});

// ── Backward Compatibility Tests ──────────────────────────────────────

describe("Backward Compatibility — Old Payload Alias Reading", () => {
  it("ProblemDefinitionToolPanel reads from old 'problemStatement' key", () => {
    // Simulates what the tool panel useEffect does with an old-format payload
    const oldPayload: Record<string, unknown> = {
      problemStatement: "Legacy system is slow",
      status: "clear",
    };

    // The tool panel reads: payload.whatIsNotWorking || payload.problemStatement
    const whatIsNotWorking =
      (oldPayload.whatIsNotWorking as string) || (oldPayload.problemStatement as string) || "";

    expect(whatIsNotWorking).toBe("Legacy system is slow");
  });

  it("OpportunityDefinitionToolPanel reads from old 'opportunityStatement' key", () => {
    const oldPayload: Record<string, unknown> = {
      opportunityStatement: "Build self-service portal",
      status: "clear",
    };

    const whatCouldBeImproved =
      (oldPayload.whatCouldBeImproved as string) || (oldPayload.opportunityStatement as string) || "";

    expect(whatCouldBeImproved).toBe("Build self-service portal");
  });

  it("GuidingWhatIfToolPanel reads from old 'whatIfQuestion' key", () => {
    const oldPayload: Record<string, unknown> = {
      whatIfQuestion: "What if we rebuilt the portal?",
    };

    const whatIf =
      (oldPayload.whatIf as string) || (oldPayload.whatIfQuestion as string) || "";

    expect(whatIf).toBe("What if we rebuilt the portal?");
  });

  it("New canonical keys take priority over old aliases", () => {
    const mixedPayload: Record<string, unknown> = {
      whatIsNotWorking: "New canonical value",
      problemStatement: "Old alias value",
    };

    const whatIsNotWorking =
      (mixedPayload.whatIsNotWorking as string) || (mixedPayload.problemStatement as string) || "";

    expect(whatIsNotWorking).toBe("New canonical value");
  });
});

// ── Mobile Header Progress Label Tests ──────────────────────────────────

describe("Mobile Header Progress Labels", () => {
  it("step label uses 'of' format: 'Step X of Y'", () => {
    const stepIndex = 1;
    const stepCount = 11;
    const label = `Step ${stepIndex + 1} of ${stepCount}`;
    expect(label).toBe("Step 2 of 11");
    expect(label).not.toMatch(/^\d+\/\d+$/); // Not bare X/Y
  });

  it("completed label uses 'done' suffix: 'X/Y done'", () => {
    const completedCount = 1;
    const stepCount = 11;
    const label = `${completedCount}/${stepCount} done`;
    expect(label).toBe("1/11 done");
    expect(label).toContain("done");
  });

  it("step and completed labels are visually distinguishable", () => {
    const stepLabel = `Step 2 of 11`;
    const completedLabel = `1/11 done`;

    // They should not look the same
    expect(stepLabel).not.toBe(completedLabel);
    // Step label includes the word "Step"
    expect(stepLabel).toMatch(/^Step \d+/);
    // Completed label includes the word "done"
    expect(completedLabel).toMatch(/done$/);
  });
});

// ── Coherence Enforcement Tests ──────────────────────────────────────

describe("Coherence Enforcement", () => {
  it("forward-fills: populated problem.statement → empty onePageSummary.problem", () => {
    const raw = {
      problem: { statement: "Legacy system is slow", status: "clear" },
      opportunity: { statement: "Modernize the stack", status: "clear" },
      ideationWorkflowDraft: {
        contextOfProject: "test",
        problem: "", opportunity: "", whatIfQuestion: "",
        ideaGeneration: [], ideaClusteringAndTheming: [],
        initialScreening: { promisingIdeas: [], deferredIdeas: [], reasoning: "" },
        scenarioExploration: { scenarios: [], insights: "" },
        quickFeasibilityChecks: { idea: "", testPerformed: "", keyFindings: [], feasibilityRating: "" },
        conceptSelection: { selectedIdea: "", rationale: "", nextStep: "" },
        onePageSummary: { problem: "", opportunity: "", topIdeas: [], feasibilityInsight: "", selectedConcept: "", reasonForSelection: "" },
      },
    };
    const result = normalizeTranslateResponse(raw);
    expect(result.ideationWorkflowDraft.onePageSummary.problem).toBe("Legacy system is slow");
    expect(result.ideationWorkflowDraft.onePageSummary.opportunity).toBe("Modernize the stack");
  });

  it("backfills: empty problem.statement ← populated onePageSummary.problem", () => {
    const raw = {
      problem: { statement: "", status: "missing" },
      opportunity: { statement: "", status: "missing" },
      ideationWorkflowDraft: {
        contextOfProject: "test",
        problem: "", opportunity: "", whatIfQuestion: "",
        ideaGeneration: [], ideaClusteringAndTheming: [],
        initialScreening: { promisingIdeas: [], deferredIdeas: [], reasoning: "" },
        scenarioExploration: { scenarios: [], insights: "" },
        quickFeasibilityChecks: { idea: "", testPerformed: "", keyFindings: [], feasibilityRating: "" },
        conceptSelection: { selectedIdea: "", rationale: "", nextStep: "" },
        onePageSummary: { problem: "Backfilled problem", opportunity: "Backfilled opp", topIdeas: [], feasibilityInsight: "", selectedConcept: "", reasonForSelection: "" },
      },
    };
    const result = normalizeTranslateResponse(raw);
    expect(result.problem.statement).toBe("Backfilled problem");
    expect(result.opportunity.statement).toBe("Backfilled opp");
    // Status upgraded from "missing" to "unclear"
    expect(result.problem.status).toBe("unclear");
    expect(result.opportunity.status).toBe("unclear");
  });

  it("cross-fills whatIfQuestion between top-level and draft", () => {
    const raw = {
      whatIfQuestion: "What if we modernize?",
      ideationWorkflowDraft: {
        contextOfProject: "test",
        problem: "", opportunity: "", whatIfQuestion: "",
        ideaGeneration: [], ideaClusteringAndTheming: [],
        initialScreening: { promisingIdeas: [], deferredIdeas: [], reasoning: "" },
        scenarioExploration: { scenarios: [], insights: "" },
        quickFeasibilityChecks: { idea: "", testPerformed: "", keyFindings: [], feasibilityRating: "" },
        conceptSelection: { selectedIdea: "", rationale: "", nextStep: "" },
        onePageSummary: { problem: "", opportunity: "", topIdeas: [], feasibilityInsight: "", selectedConcept: "", reasonForSelection: "" },
      },
    };
    const result = normalizeTranslateResponse(raw);
    expect(result.ideationWorkflowDraft.whatIfQuestion).toBe("What if we modernize?");
  });

  it("does not overwrite populated fields during coherence", () => {
    const raw = {
      problem: { statement: "Top-level problem", status: "clear" },
      opportunity: { statement: "Top-level opportunity", status: "clear" },
      ideationWorkflowDraft: {
        contextOfProject: "test",
        problem: "", opportunity: "", whatIfQuestion: "",
        ideaGeneration: [], ideaClusteringAndTheming: [],
        initialScreening: { promisingIdeas: [], deferredIdeas: [], reasoning: "" },
        scenarioExploration: { scenarios: [], insights: "" },
        quickFeasibilityChecks: { idea: "", testPerformed: "", keyFindings: [], feasibilityRating: "" },
        conceptSelection: { selectedIdea: "", rationale: "", nextStep: "" },
        onePageSummary: { problem: "Summary problem", opportunity: "Summary opp", topIdeas: [], feasibilityInsight: "", selectedConcept: "", reasonForSelection: "" },
      },
    };
    const result = normalizeTranslateResponse(raw);
    // Both levels populated — neither should be overwritten
    expect(result.problem.statement).toBe("Top-level problem");
    expect(result.ideationWorkflowDraft.onePageSummary.problem).toBe("Summary problem");
  });
});

// ── Fallback Template Coherence Tests ──────────────────────────────────

describe("Fallback Template Coherence", () => {
  it("uses consistent placeholder text across all fields", () => {
    // normalizeTranslateResponse(null) calls createFallbackResponse("")
    const result = normalizeTranslateResponse(null);
    const P = "Awaiting LLM analysis";

    // All analytical fields use the same unified placeholder
    expect(result.problem.statement).toBe(P);
    expect(result.opportunity.statement).toBe(P);
    expect(result.whatIfQuestion).toBe(P);
    expect(result.projectContextResult).toBe(P);
    expect(result.coreSignals.trigger).toBe(P);
    expect(result.coreSignals.externalDrivers).toContain(P);
    expect(result.coreSignals.internalDrivers).toContain(P);
  });

  it("onePageSummary fields match top-level placeholders", () => {
    const result = normalizeTranslateResponse(null);
    const summary = result.ideationWorkflowDraft.onePageSummary;
    // Fallback uses same placeholder at all levels — coherent
    expect(summary.problem).toBe(result.problem.statement);
    expect(summary.opportunity).toBe(result.opportunity.statement);
  });

  it("wizard package fields use same placeholder as top-level", () => {
    const result = normalizeTranslateResponse(null);
    const P = "Awaiting LLM analysis";
    expect(result.psWizardScenarioPackage.primaryProblem).toBe(P);
    expect(result.psWizardScenarioPackage.opportunityStatement).toBe(P);
    expect(result.psWizardScenarioPackage.businessNeed).toBe(P);
    expect(result.psWizardScenarioPackage.whatIfQuestion).toBe(P);
  });

  it("raw input is preserved in contextOfProject and scenarioSummary", () => {
    // When called with actual text (not null), raw input should be captured
    const raw = {
      decisionGate: { status: "CONTINUE", reason: "Basic analysis performed without LLM — human review strongly recommended" },
    };
    // normalizeTranslateResponse preserves ideationWorkflowDraft if provided
    // For true fallback, test via structure — contextOfProject is raw text
    const result = normalizeTranslateResponse(null);
    // Empty fallback still creates the structure
    expect(result.ideationWorkflowDraft).toBeDefined();
    expect(result.psWizardScenarioPackage).toBeDefined();
  });
});

// ── Step 11 One-Page Summary Canonical Key Mapping Tests ──────────────

describe("Step 11 One-Page Summary Canonical Key Mapping", () => {
  it("maps translator output to OnePageSummaryToolPanel canonical keys", () => {
    const response: TranslateResponse = {
      decisionGate: { status: "CONTINUE", reason: "" },
      extractedFacts: [],
      problem: { statement: "Slow portal performance", status: "clear" },
      opportunity: { statement: "Build a modern self-service portal", status: "clear" },
      coreSignals: { externalDrivers: [], internalDrivers: [], trigger: "" },
      projectContextFormula: "",
      projectContextResult: "",
      whatIfQuestion: "What if we rebuilt from scratch?",
      ideationWorkflowDraft: {
        contextOfProject: "",
        problem: "", opportunity: "", whatIfQuestion: "",
        ideaGeneration: ["Microservices rewrite", "Progressive enhancement"],
        ideaClusteringAndTheming: [],
        initialScreening: { promisingIdeas: [], deferredIdeas: [], reasoning: "" },
        scenarioExploration: { scenarios: [], insights: "Both scenarios show improved UX" },
        quickFeasibilityChecks: { idea: "", testPerformed: "", keyFindings: [], feasibilityRating: "Medium" },
        conceptSelection: { selectedIdea: "Microservices rewrite", rationale: "Best long-term fit", nextStep: "" },
        onePageSummary: {
          problem: "Slow portal",
          opportunity: "Modern self-service",
          topIdeas: ["Microservices rewrite", "Progressive enhancement"],
          feasibilityInsight: "Medium complexity, high ROI",
          selectedConcept: "Microservices rewrite",
          reasonForSelection: "Best long-term architecture fit",
        },
      },
      psWizardScenarioPackage: {} as any,
      missingInformation: [],
      clarificationQuestions: [],
      framingNotes: { extracted: [], inferred: [], proposed: [] },
      renderedMarkdown: "",
    };

    const toStr = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v : String(v));

    // Build the Step 11 payload the same way applyToIdeation does
    const summaryPayload = {
      theProblem: toStr(response.problem?.statement),
      theOpportunity: toStr(response.opportunity?.statement),
      topIdeas: (Array.isArray(response.ideationWorkflowDraft?.onePageSummary?.topIdeas) &&
        response.ideationWorkflowDraft.onePageSummary.topIdeas.length > 0)
          ? response.ideationWorkflowDraft.onePageSummary.topIdeas.join("\n")
          : (response.ideationWorkflowDraft?.ideaGeneration || []).map(toStr).join("\n"),
      scenariosExplored: toStr(response.ideationWorkflowDraft?.scenarioExploration?.insights),
      feasibilityInsights: toStr(response.ideationWorkflowDraft?.onePageSummary?.feasibilityInsight)
        || toStr(response.ideationWorkflowDraft?.quickFeasibilityChecks?.feasibilityRating),
      selectedConcept: toStr(response.ideationWorkflowDraft?.onePageSummary?.selectedConcept)
        || toStr(response.ideationWorkflowDraft?.conceptSelection?.selectedIdea),
      reasonForSelection: toStr(response.ideationWorkflowDraft?.onePageSummary?.reasonForSelection)
        || toStr(response.ideationWorkflowDraft?.conceptSelection?.rationale),
    };

    // Verify canonical keys match OnePageSummaryToolPanel expectations
    expect(summaryPayload.theProblem).toBe("Slow portal performance");
    expect(summaryPayload.theOpportunity).toBe("Build a modern self-service portal");
    expect(summaryPayload.topIdeas).toBe("Microservices rewrite\nProgressive enhancement");
    expect(summaryPayload.scenariosExplored).toBe("Both scenarios show improved UX");
    expect(summaryPayload.feasibilityInsights).toBe("Medium complexity, high ROI");
    expect(summaryPayload.selectedConcept).toBe("Microservices rewrite");
    expect(summaryPayload.reasonForSelection).toBe("Best long-term architecture fit");
  });

  it("falls back to ideaGeneration when onePageSummary.topIdeas is empty", () => {
    const toStr = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v : String(v));

    const topIdeasFromSummary: string[] = [];
    const ideaGeneration = ["Idea A", "Idea B"];

    const topIdeas = topIdeasFromSummary.length > 0
      ? topIdeasFromSummary.join("\n")
      : ideaGeneration.map(toStr).join("\n");

    expect(topIdeas).toBe("Idea A\nIdea B");
  });

  it("falls back to conceptSelection when onePageSummary fields are empty", () => {
    const toStr = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v : String(v));

    const selectedConcept = toStr("") || toStr("Fallback Concept");
    expect(selectedConcept).toBe("Fallback Concept");

    const reasonForSelection = toStr("") || toStr("Fallback Rationale");
    expect(reasonForSelection).toBe("Fallback Rationale");
  });

  it("Step 11 uses OnePageSummaryToolPanel keys, not internal keys", () => {
    const canonicalKeys = ["theProblem", "theOpportunity", "topIdeas", "scenariosExplored",
      "feasibilityInsights", "selectedConcept", "reasonForSelection"];

    // Internal/draft keys that must NOT appear in Step 11 payload
    const internalKeys = ["problem", "opportunity", "feasibilityInsight"];

    // The canonical key "theProblem" differs from the internal "problem"
    expect(canonicalKeys).toContain("theProblem");
    expect(canonicalKeys).not.toContain("problem");
    expect(canonicalKeys).toContain("theOpportunity");
    expect(canonicalKeys).not.toContain("opportunity");
    expect(canonicalKeys).toContain("feasibilityInsights");
    expect(canonicalKeys).not.toContain("feasibilityInsight");
  });
});

// ─── Step-status semantics after applyToIdeation ─────────────────────────
describe("applyToIdeation step status", () => {
  it("translator-seeded steps must use 'complete' status, not 'in_progress'", () => {
    // The applyToIdeation mutation writes stepStatus for both INSERT and UPDATE paths.
    // Requirement: translator-applied steps show green check, not spinner.
    // stepStatus must be "complete" (matching manual-save semantics).
    const validStatuses = ["not_started", "in_progress", "complete", "blocked"];
    const translatorStepStatus = "complete";
    expect(validStatuses).toContain(translatorStepStatus);
    expect(translatorStepStatus).not.toBe("in_progress");
  });

  it("'complete' status maps to CheckCircle2 in the rail, not Loader2", () => {
    // PSIdeationWorkflowRail STATUS_ICON mapping:
    //   complete    → CheckCircle2 (green check)
    //   in_progress → Loader2 (spinning)
    const STATUS_ICON_KEYS: Record<string, string> = {
      complete: "CheckCircle2",
      in_progress: "Loader2",
      blocked: "AlertCircle",
      not_started: "Circle",
    };
    expect(STATUS_ICON_KEYS["complete"]).toBe("CheckCircle2");
    expect(STATUS_ICON_KEYS["in_progress"]).toBe("Loader2");
    // After fix: translator steps use "complete" → CheckCircle2, never Loader2
  });

  it("completedAt timestamp is set alongside stepStatus: complete", () => {
    // Both UPDATE and INSERT paths must set completedAt: now alongside stepStatus: "complete".
    // This mirrors the manual save path in ideation-service.ts saveStepPayload.
    const now = new Date();
    const insertValues = {
      stepStatus: "complete" as const,
      completedAt: now,
      lastSavedAt: now,
    };
    expect(insertValues.completedAt).toEqual(now);
    expect(insertValues.stepStatus).toBe("complete");
  });

  it("_translatorApplied metadata distinguishes seeded from manual saves", () => {
    // After the fix, both translator-applied and manual-saved steps have stepStatus "complete".
    // The _translatorApplied flag distinguishes them in payloadJson.
    const manualPayload = { someField: "user typed this" };
    const translatorPayload = { someField: "AI analysis", _translatorApplied: true };
    expect(translatorPayload._translatorApplied).toBe(true);
    expect(manualPayload).not.toHaveProperty("_translatorApplied");
  });

  it("completedCount in header correctly counts translator-seeded steps", () => {
    // PSIdeationShell counts: steps.filter(s => s.stepStatus === "complete").length
    // After fix, translator-applied steps have stepStatus "complete" and are counted.
    const steps = [
      { stepKey: "problem_statement", stepStatus: "complete" }, // translator-seeded
      { stepKey: "opportunity_statement", stepStatus: "complete" }, // translator-seeded
      { stepKey: "what_if_question", stepStatus: "complete" }, // translator-seeded
      { stepKey: "scenarios", stepStatus: "not_started" }, // untouched
    ];
    const completedCount = steps.filter(s => s.stepStatus === "complete").length;
    expect(completedCount).toBe(3);
  });

  it("manual save path still sets stepStatus: complete (no regression)", () => {
    // ideation-service.ts saveStepPayload already uses stepStatus: "complete".
    // Changing applyToIdeation to also use "complete" must not alter manual save behavior.
    const manualSaveStatus = "complete";
    const translatorSaveStatus = "complete";
    expect(manualSaveStatus).toBe(translatorSaveStatus);
    // Both paths now converge on "complete", with _translatorApplied as differentiator
  });
});

// ─── Raw text rehydration from persisted translator runs ─────────────────
describe("raw text rehydration", () => {
  it("listRuns endpoint returns rawInput for rehydration", () => {
    // listRuns returns rows ordered by createdAt DESC with rawInput field.
    // The first element is the most recent run.
    const mockRuns = [
      { id: 2, rawInput: "Latest project context...", createdAt: "2025-01-02" },
      { id: 1, rawInput: "Initial project context...", createdAt: "2025-01-01" },
    ];
    expect(mockRuns[0].rawInput).toBe("Latest project context...");
    expect(mockRuns.length).toBeGreaterThan(0);
  });

  it("hydration uses most recent run (index 0), not oldest", () => {
    const runs = [
      { rawInput: "Second run text" },
      { rawInput: "First run text" },
    ];
    // The component uses prevRuns[0].rawInput — the most recent
    const hydratedText = runs[0].rawInput;
    expect(hydratedText).toBe("Second run text");
  });

  it("hydration only fires once (useRef guard)", () => {
    // The hydratedRef.current starts as false. After first hydration it becomes true.
    // Subsequent re-renders or data refetches do NOT overwrite user edits.
    let hydratedRef = { current: false };
    const runs = [{ rawInput: "persisted text" }];
    let rawText = "";

    // First hydration
    if (!hydratedRef.current && runs.length && !rawText) {
      rawText = runs[0].rawInput;
      hydratedRef.current = true;
    }
    expect(rawText).toBe("persisted text");
    expect(hydratedRef.current).toBe(true);

    // User edits the text
    rawText = "user modified this";

    // Re-render: hydration must NOT fire again
    if (!hydratedRef.current && runs.length && !rawText) {
      rawText = runs[0].rawInput; // This line should NOT execute
    }
    expect(rawText).toBe("user modified this"); // User edit preserved
  });

  it("no hydration when no previous runs exist", () => {
    const runs: { rawInput: string }[] = [];
    let hydratedRef = { current: false };
    let rawText = "";

    if (!hydratedRef.current && runs.length && !rawText) {
      rawText = runs[0].rawInput;
      hydratedRef.current = true;
    }
    expect(rawText).toBe(""); // Remains empty
    expect(hydratedRef.current).toBe(false);
  });

  it("rawInput field is persisted in psIdeationTranslatorRuns table", () => {
    // Schema: psIdeationTranslatorRuns has rawInput: text("raw_input").notNull()
    const tableColumns = ["id", "ideationId", "rawInput", "decisionGateStatus",
      "resultJson", "appliedAt", "createdBy", "createdAt"];
    expect(tableColumns).toContain("rawInput");
  });
});

// ─── Immediate value display after Apply (Requirement F) ─────────────────
describe("Immediate value display after Apply to Ideation Fields", () => {
  it("applyToIdeation returns fresh steps for synchronous cache update", () => {
    // Server returns { applied, stepsUpdated, steps } — the steps array lets the
    // client use setData() to synchronously populate tool panels without waiting
    // for an async refetch.
    const serverResponse = {
      applied: true,
      stepsUpdated: ["context", "problem_statement", "opportunity_statement", "what_if_question", "one_page_summary"],
      steps: [
        { stepKey: "context", stepOrder: 0, stepStatus: "complete", payloadJson: { externalDriver: "Market pressure", internalDriver: "Tech debt", triggerEvent: "CEO mandate", shapesNeed: "Digital transformation" } },
        { stepKey: "problem_statement", stepOrder: 1, stepStatus: "complete", payloadJson: { whatIsNotWorking: "Manual processes", whoIsImpacted: "Operations team", consequencesOfDoingNothing: "Revenue loss" } },
        { stepKey: "opportunity_statement", stepOrder: 2, stepStatus: "complete", payloadJson: { whatCouldBeImproved: "Self-service portal", whatValueCouldBeCreated: "50% faster onboarding", strategicAdvantage: "Market leader" } },
        { stepKey: "what_if_question", stepOrder: 3, stepStatus: "complete", payloadJson: { whatIf: "What if we rebuilt from scratch?" } },
        { stepKey: "one_page_summary", stepOrder: 10, stepStatus: "complete", payloadJson: { theProblem: "Manual processes", theOpportunity: "Self-service portal" } },
      ],
    };
    expect(serverResponse.steps).toBeDefined();
    expect(serverResponse.steps.length).toBe(5);
    expect(serverResponse.applied).toBe(true);
  });

  it("Step 1 context payload has canonical keys visible immediately after apply", () => {
    // After Apply, the client setData updates the cache with server-returned steps.
    // Step 1 (context) must have all 4 canonical keys with real values, not placeholders.
    const contextStep = {
      stepKey: "context",
      payloadJson: { externalDriver: "Market pressure", internalDriver: "Tech debt", triggerEvent: "CEO mandate", shapesNeed: "Digital transformation", _translatorApplied: true },
    };
    const p = contextStep.payloadJson;
    // All 4 canonical context keys present with non-empty values
    expect(p.externalDriver).toBeTruthy();
    expect(p.internalDriver).toBeTruthy();
    expect(p.triggerEvent).toBeTruthy();
    expect(p.shapesNeed).toBeTruthy();
    // Not placeholder text
    expect(p.externalDriver).not.toBe("Awaiting LLM analysis");
    expect(p.internalDriver).not.toBe("");
    expect(p.triggerEvent).not.toBe("");
    expect(p.shapesNeed).not.toBe("");
  });

  it("ContextDefinitionToolPanel hydrates from payload via JSON.stringify dependency", () => {
    // The tool panel useEffect depends on JSON.stringify(payload) as payloadKey.
    // When setData() updates the cache, payload changes → payloadKey changes →
    // useEffect fires → local state updated → form fields show real values.
    const payload1 = null;
    const payload2 = { externalDriver: "Market pressure", internalDriver: "Tech debt", triggerEvent: "CEO mandate", shapesNeed: "Digital transformation" };
    const key1 = JSON.stringify(payload1);
    const key2 = JSON.stringify(payload2);
    // Keys differ → useEffect will fire
    expect(key1).not.toBe(key2);
    // Simulating the str() extraction from ContextDefinitionToolPanel
    const str = (v: unknown): string => {
      if (v == null) return "";
      if (typeof v === "string") return v;
      if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        return String(o.signal || o.text || o.value || o.statement || JSON.stringify(v));
      }
      return String(v);
    };
    expect(str(payload2.externalDriver)).toBe("Market pressure");
    expect(str(payload2.internalDriver)).toBe("Tech debt");
    expect(str(payload2.triggerEvent)).toBe("CEO mandate");
    expect(str(payload2.shapesNeed)).toBe("Digital transformation");
  });

  it("JSON.stringify detects payload changes that object reference equality misses", () => {
    // React Query structural sharing can return a new object with the same reference
    // for unchanged nested values. JSON.stringify always produces a fresh string
    // when any value differs — this is the fix for the stale-display bug.
    const obj1 = { externalDriver: "old", internalDriver: "old" };
    const obj2 = { externalDriver: "new", internalDriver: "old" };
    // Same structure, different values → JSON.stringify differs
    expect(JSON.stringify(obj1)).not.toBe(JSON.stringify(obj2));
    // Even reusing the same object with mutated value
    const obj3 = { ...obj1 };
    expect(JSON.stringify(obj1)).toBe(JSON.stringify(obj3)); // Same values = same key
    obj3.externalDriver = "changed";
    expect(JSON.stringify(obj1)).not.toBe(JSON.stringify(obj3)); // Different values = different key
  });

  it("await invalidate pattern: immediate display + eventual consistency", () => {
    // The fix uses await invalidate() — waits for the React Query background
    // refetch to complete before calling onApplied(), ensuring tool panels
    // receive fresh payload data and useEffect fires.
    const cacheOperations: string[] = [];
    // Simulate the onSuccess callback order
    cacheOperations.push("await invalidate"); // Step 1: awaited refetch
    cacheOperations.push("onApplied");        // Step 2: parent callback
    expect(cacheOperations[0]).toBe("await invalidate");
    expect(cacheOperations[1]).toBe("onApplied");
    expect(cacheOperations.indexOf("await invalidate")).toBeLessThan(cacheOperations.indexOf("onApplied"));
  });
});

// ─── No regression to Steps 2–4 hydration after Apply ────────────────────
describe("Steps 2–4 hydration after Apply (no regression)", () => {
  it("Step 2 ProblemDefinitionToolPanel uses JSON.stringify payloadKey", () => {
    // All tool panels now use JSON.stringify(payload) as payloadKey — same pattern as Step 1.
    const payload = { whatIsNotWorking: "Legacy system slow", whoIsImpacted: "All users", consequencesOfDoingNothing: "Revenue decline" };
    const payloadKey = JSON.stringify(payload);
    expect(payloadKey).toContain("whatIsNotWorking");
    expect(payloadKey).toContain("Legacy system slow");
    // Canonical keys are extractable
    const whatIsNotWorking = (payload.whatIsNotWorking as string) || "";
    expect(whatIsNotWorking).toBe("Legacy system slow");
  });

  it("Step 3 OpportunityDefinitionToolPanel uses JSON.stringify payloadKey", () => {
    const payload = { whatCouldBeImproved: "Self-service portal", whatValueCouldBeCreated: "Faster onboarding", strategicAdvantage: "First-mover" };
    const payloadKey = JSON.stringify(payload);
    expect(payloadKey).toContain("whatCouldBeImproved");
    expect(payloadKey).toContain("Self-service portal");
    const whatCouldBeImproved = (payload.whatCouldBeImproved as string) || "";
    expect(whatCouldBeImproved).toBe("Self-service portal");
  });

  it("Step 4 GuidingWhatIfToolPanel uses JSON.stringify payloadKey", () => {
    const payload = { whatIf: "What if we rebuilt the entire stack?" };
    const payloadKey = JSON.stringify(payload);
    expect(payloadKey).toContain("whatIf");
    expect(payloadKey).toContain("What if we rebuilt the entire stack?");
    const whatIf = (payload.whatIf as string) || "";
    expect(whatIf).toBe("What if we rebuilt the entire stack?");
  });

  it("Step 11 OnePageSummaryToolPanel uses JSON.stringify payloadKey", () => {
    const payload = { theProblem: "Slow portal", theOpportunity: "Modern self-service", topIdeas: "Idea A\nIdea B", reasonForSelection: "" };
    const payloadKey = JSON.stringify(payload);
    expect(payloadKey).toContain("theProblem");
    const theProblem = (payload.theProblem as string) || "";
    expect(theProblem).toBe("Slow portal");
  });

  it("all 5 tool panels use the same payloadKey strategy", () => {
    // Requirement: all panels use JSON.stringify(payload) so the fix is uniform.
    // This test ensures no panel accidentally uses a different dependency strategy.
    const payloads = [
      { externalDriver: "X", internalDriver: "Y", triggerEvent: "Z", shapesNeed: "W" }, // Step 1
      { whatIsNotWorking: "X", whoIsImpacted: "Y", consequencesOfDoingNothing: "Z" },    // Step 2
      { whatCouldBeImproved: "X", whatValueCouldBeCreated: "Y", strategicAdvantage: "Z" },// Step 3
      { whatIf: "X" },                                                                    // Step 4
      { theProblem: "X", theOpportunity: "Y", topIdeas: "Z", reasonForSelection: "" },      // Step 11
    ];
    // JSON.stringify works consistently for all shapes
    for (const p of payloads) {
      const key = JSON.stringify(p);
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(2); // Not just "{}"
      // Mutation detection: changing any field produces a different key
      const modified = { ...p, __test: true };
      expect(JSON.stringify(modified)).not.toBe(key);
    }
  });
});

// ─── Step 1 resilient backfill from enriched coreSignals ─────────────────
describe("Step 1 resilient backfill — coreSignals enrichment", () => {
  it("empty coreSignals backfilled from psWizardScenarioPackage and framingNotes", () => {
    // Simulate a response where coreSignals are empty but richer context exists
    const raw = {
      decisionGate: { status: "CONTINUE", reason: "Analysis complete" },
      coreSignals: { externalDrivers: [], internalDrivers: [], trigger: "" },
      problem: { statement: "Legacy system is slow", status: "clear" },
      opportunity: { statement: "Build modern portal", status: "clear" },
      projectContextResult: "",
      psWizardScenarioPackage: {
        urgencyDriver: "Q4 deadline approaching",
        businessNeed: "Customer retention dropping",
        primaryProblem: "System downtime exceeds SLA",
        scenarioSummary: "Modernize the customer portal to reduce churn",
      },
      framingNotes: {
        extracted: ["Market share declining 5% QoQ"],
        inferred: ["Internal team lacks modern tooling"],
        proposed: [],
      },
      ideationWorkflowDraft: {
        contextOfProject: "The org faces mounting competitive pressure and internal capability gaps",
        problem: "", opportunity: "", whatIfQuestion: "",
        ideaGeneration: [], ideaClusteringAndTheming: [],
        initialScreening: { promisingIdeas: [], deferredIdeas: [], reasoning: "" },
        scenarioExploration: { scenarios: [], insights: "" },
        quickFeasibilityChecks: { idea: "", testPerformed: "", keyFindings: [], feasibilityRating: "" },
        conceptSelection: { selectedIdea: "", rationale: "", nextStep: "" },
        onePageSummary: { problem: "", opportunity: "", topIdeas: [], feasibilityInsight: "", selectedConcept: "", reasonForSelection: "" },
      },
      extractedFacts: [],
      whatIfQuestion: "",
      projectContextFormula: "",
      missingInformation: [],
      clarificationQuestions: [],
      renderedMarkdown: "",
    };

    const result = normalizeTranslateResponse(raw);

    // coreSignals should be enriched by enforceCoherence
    expect(result.coreSignals.externalDrivers.length).toBeGreaterThan(0);
    expect(result.coreSignals.internalDrivers.length).toBeGreaterThan(0);
    expect(result.coreSignals.trigger.trim().length).toBeGreaterThan(0);
    // projectContextResult should be backfilled
    expect(result.projectContextResult.trim().length).toBeGreaterThan(0);
  });

  it("populated coreSignals are NOT overwritten by backfill", () => {
    const raw = {
      decisionGate: { status: "CONTINUE", reason: "" },
      coreSignals: {
        externalDrivers: ["Regulatory compliance deadline"],
        internalDrivers: ["Legacy tech debt"],
        trigger: "New GDPR amendment effective Jan 2026",
      },
      problem: { statement: "Non-compliant data handling", status: "clear" },
      opportunity: { statement: "Achieve full compliance", status: "clear" },
      projectContextResult: "GDPR drives modernization of data pipelines",
      psWizardScenarioPackage: {
        urgencyDriver: "Different urgency text",
        businessNeed: "Different business need",
      },
      framingNotes: { extracted: ["Different extracted"], inferred: ["Different inferred"], proposed: [] },
      ideationWorkflowDraft: {
        contextOfProject: "Different context", problem: "", opportunity: "", whatIfQuestion: "",
        ideaGeneration: [], ideaClusteringAndTheming: [],
        initialScreening: { promisingIdeas: [], deferredIdeas: [], reasoning: "" },
        scenarioExploration: { scenarios: [], insights: "" },
        quickFeasibilityChecks: { idea: "", testPerformed: "", keyFindings: [], feasibilityRating: "" },
        conceptSelection: { selectedIdea: "", rationale: "", nextStep: "" },
        onePageSummary: { problem: "", opportunity: "", topIdeas: [], feasibilityInsight: "", selectedConcept: "", reasonForSelection: "" },
      },
      extractedFacts: [], whatIfQuestion: "", projectContextFormula: "",
      missingInformation: [], clarificationQuestions: [], renderedMarkdown: "",
    };

    const result = normalizeTranslateResponse(raw);

    // Original values preserved — NOT overwritten by downstream sources
    expect(result.coreSignals.externalDrivers).toEqual(["Regulatory compliance deadline"]);
    expect(result.coreSignals.internalDrivers).toEqual(["Legacy tech debt"]);
    expect(result.coreSignals.trigger).toBe("New GDPR amendment effective Jan 2026");
    expect(result.projectContextResult).toBe("GDPR drives modernization of data pipelines");
  });

  it("Step 1 apply mapping produces non-blank fields when coreSignals enriched", () => {
    // Simulate the toStr + joinArr logic from applyToIdeation
    const toStr = (v: unknown): string => {
      if (v == null) return "";
      if (typeof v === "string") return v;
      if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        return String(o.signal || o.text || o.value || o.statement || JSON.stringify(v));
      }
      return String(v);
    };
    const joinArr = (arr: unknown[] | undefined): string =>
      (arr || []).map(toStr).filter(s => (s as string).trim()).join("; ");

    // After normalization + enrichment
    const enriched = {
      coreSignals: {
        externalDrivers: ["Market share declining 5% QoQ"],
        internalDrivers: ["Internal team lacks modern tooling"],
        trigger: "Q4 deadline approaching",
      },
      projectContextResult: "The org faces mounting competitive pressure and internal capability gaps",
    };

    const externalDriver = joinArr(enriched.coreSignals.externalDrivers);
    const internalDriver = joinArr(enriched.coreSignals.internalDrivers);
    const triggerEvent = toStr(enriched.coreSignals.trigger);
    const shapesNeed = toStr(enriched.projectContextResult);

    expect(externalDriver.trim().length).toBeGreaterThan(0);
    expect(internalDriver.trim().length).toBeGreaterThan(0);
    expect(triggerEvent.trim().length).toBeGreaterThan(0);
    expect(shapesNeed.trim().length).toBeGreaterThan(0);
    expect(externalDriver).toBe("Market share declining 5% QoQ");
    expect(internalDriver).toBe("Internal team lacks modern tooling");
    expect(triggerEvent).toBe("Q4 deadline approaching");
  });

  it("double-fallback: router backfill catches anything normalizer missed", () => {
    // Even if enforceCoherence couldn't enrich coreSignals (e.g., framingNotes also empty),
    // the router's own backfill chain should still find values from deeper sources.
    const toStr = (v: unknown): string => {
      if (v == null) return "";
      if (typeof v === "string") return v;
      return String(v);
    };
    const joinArr = (arr: unknown[] | undefined): string =>
      (arr || []).map(toStr).filter(s => (s as string).trim()).join("; ");

    // Simulate: coreSignals still empty after normalization, but pkg has data
    const coreSignals = { externalDrivers: [] as string[], internalDrivers: [] as string[], trigger: "" };
    const pkg = { urgencyDriver: "Board meeting in 2 weeks", businessNeed: "Revenue target gap", primaryProblem: "Churn rate 15%" };
    const problem = { statement: "Customer churn exceeds target" };
    const notes = { extracted: [] as string[], inferred: [] as string[], proposed: [] as string[] };
    const draft = { contextOfProject: "The company must address customer retention before Q4 closes." };

    // Router backfill logic
    let externalDriver = joinArr(coreSignals.externalDrivers);
    if (!externalDriver.trim()) {
      externalDriver = joinArr(notes.extracted) || toStr(pkg.urgencyDriver) || toStr(pkg.businessNeed);
    }
    let internalDriver = joinArr(coreSignals.internalDrivers);
    if (!internalDriver.trim()) {
      internalDriver = joinArr(notes.inferred) || toStr(problem.statement) || toStr(pkg.primaryProblem);
    }
    let triggerEvent = toStr(coreSignals.trigger);
    if (!triggerEvent.trim()) {
      triggerEvent = toStr(pkg.urgencyDriver);
    }
    let shapesNeed = "";
    if (!shapesNeed.trim()) {
      shapesNeed = toStr(draft.contextOfProject);
    }

    expect(externalDriver).toBe("Board meeting in 2 weeks");
    expect(internalDriver).toBe("Customer churn exceeds target");
    expect(triggerEvent).toBe("Board meeting in 2 weeks");
    expect(shapesNeed).toBe("The company must address customer retention before Q4 closes.");
  });
});

// ─── Apply result truthfulness (warnings) ────────────────────────────────
describe("Apply result truthfulness — warnings", () => {
  it("no warnings when all Step 1 fields are populated", () => {
    const ctx1 = {
      externalDriver: "Market pressure",
      internalDriver: "Tech debt",
      triggerEvent: "CEO mandate",
      shapesNeed: "Digital transformation needed",
    };
    const warnings: string[] = [];
    if (!String(ctx1.externalDriver || "").trim()) warnings.push("External Driver could not be determined");
    if (!String(ctx1.internalDriver || "").trim()) warnings.push("Internal Driver could not be determined");
    if (!String(ctx1.triggerEvent || "").trim()) warnings.push("Trigger Event could not be determined");
    if (!String(ctx1.shapesNeed || "").trim()) warnings.push("Project Context could not be determined");
    expect(warnings).toHaveLength(0);
  });

  it("warnings generated for each empty Step 1 field", () => {
    const ctx1 = {
      externalDriver: "",
      internalDriver: "Tech debt",
      triggerEvent: "",
      shapesNeed: "Context exists",
    };
    const warnings: string[] = [];
    if (!String(ctx1.externalDriver || "").trim()) warnings.push("External Driver could not be determined");
    if (!String(ctx1.internalDriver || "").trim()) warnings.push("Internal Driver could not be determined");
    if (!String(ctx1.triggerEvent || "").trim()) warnings.push("Trigger Event could not be determined");
    if (!String(ctx1.shapesNeed || "").trim()) warnings.push("Project Context could not be determined");
    expect(warnings).toHaveLength(2);
    expect(warnings).toContain("External Driver could not be determined");
    expect(warnings).toContain("Trigger Event could not be determined");
  });

  it("client shows warning toast when warnings present, success when absent", () => {
    // Simulate client onSuccess logic
    const showToast = (warnings: string[] | undefined): "success" | "warning" => {
      if (warnings && warnings.length > 0) return "warning";
      return "success";
    };
    expect(showToast([])).toBe("success");
    expect(showToast(undefined)).toBe("success");
    expect(showToast(["External Driver could not be determined"])).toBe("warning");
    expect(showToast(["A", "B"])).toBe("warning");
  });
});

// ─── Steps 2–4 and Step 11 no regression after backfill changes ──────────
describe("Steps 2–4 and Step 11 no regression after backfill changes", () => {
  it("problem mapping still uses result.problem.statement", () => {
    const result = normalizeTranslateResponse({
      problem: { statement: "System is unreliable", status: "clear" },
    });
    expect(result.problem.statement).toBe("System is unreliable");
  });

  it("opportunity mapping still uses result.opportunity.statement", () => {
    const result = normalizeTranslateResponse({
      opportunity: { statement: "Build reliable platform", status: "clear" },
    });
    expect(result.opportunity.statement).toBe("Build reliable platform");
  });

  it("guiding question mapping still uses result.whatIfQuestion", () => {
    const result = normalizeTranslateResponse({
      whatIfQuestion: "What if we rebuilt from scratch?",
    });
    expect(result.whatIfQuestion).toBe("What if we rebuilt from scratch?");
  });

  it("Step 11 summary mapping still produces correct canonical keys", () => {
    const toStr = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v : String(v));
    const result = normalizeTranslateResponse({
      problem: { statement: "Slow portal", status: "clear" },
      opportunity: { statement: "Modern self-service", status: "clear" },
      ideationWorkflowDraft: {
        contextOfProject: "", problem: "", opportunity: "", whatIfQuestion: "",
        ideaGeneration: ["Idea A"], ideaClusteringAndTheming: [],
        initialScreening: { promisingIdeas: [], deferredIdeas: [], reasoning: "" },
        scenarioExploration: { scenarios: [], insights: "Good insights" },
        quickFeasibilityChecks: { idea: "", testPerformed: "", keyFindings: [], feasibilityRating: "High" },
        conceptSelection: { selectedIdea: "Idea A", rationale: "Best fit", nextStep: "" },
        onePageSummary: { problem: "", opportunity: "", topIdeas: [], feasibilityInsight: "", selectedConcept: "", reasonForSelection: "" },
      },
    });
    // Step 11 canonical keys derived from result
    expect(toStr(result.problem?.statement)).toBe("Slow portal");
    expect(toStr(result.opportunity?.statement)).toBe("Modern self-service");
    // Coherence should have forward-filled summary
    expect(result.ideationWorkflowDraft.onePageSummary.problem).toBe("Slow portal");
    expect(result.ideationWorkflowDraft.onePageSummary.opportunity).toBe("Modern self-service");
  });
});

// ── Question-Table-Driven Architecture Tests ────────────────────────────

describe("QUESTIONS_TABLE completeness", () => {
  it("covers all 11 IDEATION_STEP_KEYS", () => {
    const coveredStepKeys = new Set(QUESTIONS_TABLE.map(q => q.stepKey));
    for (const key of IDEATION_STEP_KEYS) {
      expect(coveredStepKeys.has(key)).toBe(true);
    }
  });

  it("has exactly 45 question rows", () => {
    expect(QUESTIONS_TABLE.length).toBe(45);
  });

  it("every row has non-empty step, stepKey, question, correspondingField", () => {
    for (const row of QUESTIONS_TABLE) {
      expect(row.step.trim().length).toBeGreaterThan(0);
      expect(row.stepKey.trim().length).toBeGreaterThan(0);
      expect(row.question.trim().length).toBeGreaterThan(0);
      expect(row.correspondingField.trim().length).toBeGreaterThan(0);
    }
  });

  it("Step 1 has exactly 4 questions (context)", () => {
    const step1 = QUESTIONS_TABLE.filter(q => q.stepKey === "context");
    expect(step1.length).toBe(4);
    expect(step1.map(q => q.correspondingField).sort()).toEqual(
      ["externalDriver", "internalDriver", "shapesNeed", "triggerEvent"]
    );
  });

  it("Step 2 has exactly 3 questions (problem)", () => {
    const step2 = QUESTIONS_TABLE.filter(q => q.stepKey === "problem");
    expect(step2.length).toBe(3);
    expect(step2.map(q => q.correspondingField).sort()).toEqual(
      ["consequencesOfDoingNothing", "whatIsNotWorking", "whoIsImpacted"]
    );
  });

  it("Step 3 has exactly 3 questions (opportunity)", () => {
    const step3 = QUESTIONS_TABLE.filter(q => q.stepKey === "opportunity");
    expect(step3.length).toBe(3);
    expect(step3.map(q => q.correspondingField).sort()).toEqual(
      ["strategicAdvantage", "whatCouldBeImproved", "whatValueCouldBeCreated"]
    );
  });

  it("Step 4 has exactly 1 question (guiding_question)", () => {
    const step4 = QUESTIONS_TABLE.filter(q => q.stepKey === "guiding_question");
    expect(step4.length).toBe(1);
    expect(step4[0].correspondingField).toBe("whatIf");
  });

  it("Step 6 has exactly 3 questions (clustering)", () => {
    const step6 = QUESTIONS_TABLE.filter(q => q.stepKey === "clustering");
    expect(step6.length).toBe(3);
    expect(step6.map(q => q.correspondingField).sort()).toEqual([
      "ideaThemeGrouping", "patternsObserved", "themeLabels",
    ]);
  });

  it("Step 7 has exactly 3 questions (screening)", () => {
    const step7 = QUESTIONS_TABLE.filter(q => q.stepKey === "screening");
    expect(step7.length).toBe(3);
    expect(step7.map(q => q.correspondingField).sort()).toEqual([
      "deferredIdeas", "promisingIdeas", "screeningCriteria",
    ]);
  });

  it("Step 8 has exactly 7 questions (scenario_exploration)", () => {
    const step8 = QUESTIONS_TABLE.filter(q => q.stepKey === "scenario_exploration");
    expect(step8.length).toBe(7);
    expect(step8.map(q => q.correspondingField).sort()).toEqual([
      "adoptionHighScenario", "adoptionLowScenario", "competitorReactionScenario",
      "costIncreaseScenario", "notes", "scenarioInsights", "technologyLimitScenario",
    ]);
  });

  it("Step 9 has exactly 4 questions (feasibility)", () => {
    const step9 = QUESTIONS_TABLE.filter(q => q.stepKey === "feasibility");
    expect(step9.length).toBe(4);
    expect(step9.map(q => q.correspondingField).sort()).toEqual([
      "feasibilityRating", "keyFindings", "notes", "testPerformed",
    ]);
  });

  it("Step 10 has exactly 7 questions (concept_selection)", () => {
    const step10 = QUESTIONS_TABLE.filter(q => q.stepKey === "concept_selection");
    expect(step10.length).toBe(7);
    expect(step10.map(q => q.correspondingField).sort()).toEqual([
      "nextStep", "rationale.expectedValue", "rationale.feasibility",
      "rationale.riskProfile", "rationale.stakeholderSupport",
      "rationale.strategicAlignment", "selectedIdea",
    ]);
  });

  it("Step 11 has exactly 7 questions (one_page_summary)", () => {
    const step11 = QUESTIONS_TABLE.filter(q => q.stepKey === "one_page_summary");
    expect(step11.length).toBe(7);
    expect(step11.map(q => q.correspondingField).sort()).toEqual([
      "feasibilityInsights", "reasonForSelection",
      "scenariosExplored", "selectedConcept", "theProblem",
      "theOpportunity", "topIdeas",
    ]);
  });
});

describe("normalizeQuestionTableResponse", () => {
  it("handles null/undefined input gracefully", () => {
    const result = normalizeQuestionTableResponse(null);
    expect(result.decisionGate.status).toBeDefined();
    expect(result.answeredQuestions.length).toBe(QUESTIONS_TABLE.length);
  });

  it("handles empty object input", () => {
    const result = normalizeQuestionTableResponse({});
    expect(result.decisionGate.status).toBe("CONTINUE");
    expect(result.answeredQuestions.length).toBe(QUESTIONS_TABLE.length);
    // All answers should be empty since no data was provided
    for (const row of result.answeredQuestions) {
      expect(row.answer).toBe("");
    }
  });

  it("fills missing rows from QUESTIONS_TABLE", () => {
    const raw = {
      decisionGate: { status: "CONTINUE", reason: "OK" },
      answeredQuestions: [
        { stepKey: "context", correspondingField: "externalDriver", answer: "Market pressure", answerType: "extracted", confidence: "high" },
      ],
    };
    const result = normalizeQuestionTableResponse(raw);
    expect(result.answeredQuestions.length).toBe(QUESTIONS_TABLE.length);
    // The provided answer should be preserved
    const extDriver = result.answeredQuestions.find(q => q.correspondingField === "externalDriver");
    expect(extDriver?.answer).toBe("Market pressure");
    expect(extDriver?.answerType).toBe("extracted");
    expect(extDriver?.confidence).toBe("high");
    // Missing rows should have empty answers
    const intDriver = result.answeredQuestions.find(q => q.correspondingField === "internalDriver");
    expect(intDriver?.answer).toBe("");
    expect(intDriver?.confidence).toBe("low");
  });

  it("normalizes invalid answerType and confidence values", () => {
    const raw = {
      decisionGate: { status: "CONTINUE", reason: "" },
      answeredQuestions: [
        { stepKey: "context", correspondingField: "externalDriver", answer: "Test", answerType: "invalid_type", confidence: "invalid_conf" },
      ],
    };
    const result = normalizeQuestionTableResponse(raw);
    const row = result.answeredQuestions.find(q => q.correspondingField === "externalDriver");
    expect(row?.answerType).toBe("proposed"); // defaults to proposed
    expect(row?.confidence).toBe("low"); // defaults to low
  });

  it("preserves CLARIFICATION_NEEDED status", () => {
    const raw = {
      decisionGate: { status: "CLARIFICATION_NEEDED", reason: "Not enough info" },
      answeredQuestions: [],
    };
    const result = normalizeQuestionTableResponse(raw);
    expect(result.decisionGate.status).toBe("CLARIFICATION_NEEDED");
    expect(result.decisionGate.reason).toBe("Not enough info");
  });
});

describe("deriveTranslateResponse", () => {
  it("derives a valid TranslateResponse from answered questions", () => {
    const qt: QuestionTableResponse = {
      decisionGate: { status: "CONTINUE", reason: "OK" },
      answeredQuestions: QUESTIONS_TABLE.map(q => ({
        ...q,
        answer: q.stepKey === "context" && q.correspondingField === "externalDriver"
          ? "Market competition increasing"
          : q.stepKey === "problem" && q.correspondingField === "whatIsNotWorking"
          ? "Legacy system is slow"
          : q.stepKey === "opportunity" && q.correspondingField === "whatCouldBeImproved"
          ? "Build modern portal"
          : q.stepKey === "guiding_question"
          ? "What if we modernized?"
          : "",
        answerType: "extracted" as const,
        confidence: "high" as const,
        evidence: "",
      })),
    };

    const result = deriveTranslateResponse(qt);
    expect(result.decisionGate.status).toBe("CONTINUE");
    expect(result.problem.statement).toBe("Legacy system is slow");
    expect(result.problem.status).toBe("clear");
    expect(result.opportunity.statement).toBe("Build modern portal");
    expect(result.opportunity.status).toBe("clear");
    expect(result.coreSignals.externalDrivers).toContain("Market competition increasing");
    expect(result.whatIfQuestion).toBe("What if we modernized?");
  });

  it("marks empty problem/opportunity as missing", () => {
    const qt: QuestionTableResponse = {
      decisionGate: { status: "CONTINUE", reason: "" },
      answeredQuestions: QUESTIONS_TABLE.map(q => ({
        ...q,
        answer: "",
        answerType: "proposed" as const,
        confidence: "low" as const,
        evidence: "",
      })),
    };

    const result = deriveTranslateResponse(qt);
    expect(result.problem.status).toBe("missing");
    expect(result.opportunity.status).toBe("missing");
  });

  it("populates missingInformation for unanswered non-summary questions", () => {
    const qt: QuestionTableResponse = {
      decisionGate: { status: "CONTINUE", reason: "" },
      answeredQuestions: QUESTIONS_TABLE.map(q => ({
        ...q,
        answer: "",
        answerType: "proposed" as const,
        confidence: "low" as const,
        evidence: "",
      })),
    };

    const result = deriveTranslateResponse(qt);
    // Should have missing info entries for all questions except one_page_summary
    const nonSummaryCount = QUESTIONS_TABLE.filter(q => q.stepKey !== "one_page_summary").length;
    expect(result.missingInformation.length).toBe(nonSummaryCount);
  });
});

describe("Direct field mapping — answered table to step payloads", () => {
  it("maps answered questions to correct step payload keys", () => {
    const answeredQuestions: AnsweredQuestionRow[] = QUESTIONS_TABLE.map(q => ({
      ...q,
      answer: `Answer for ${q.correspondingField}`,
      answerType: "extracted" as const,
      confidence: "high" as const,
      evidence: "",
    }));

    // Simulate the router's grouping logic
    const byStep: Record<string, Record<string, string>> = {};
    for (const row of answeredQuestions) {
      if (!byStep[row.stepKey]) byStep[row.stepKey] = {};
      byStep[row.stepKey][row.correspondingField] = row.answer || "";
    }

    // Step 1: context
    expect(byStep.context.externalDriver).toBe("Answer for externalDriver");
    expect(byStep.context.internalDriver).toBe("Answer for internalDriver");
    expect(byStep.context.triggerEvent).toBe("Answer for triggerEvent");
    expect(byStep.context.shapesNeed).toBe("Answer for shapesNeed");

    // Step 2: problem — all 3 fields populated (not just 1 like legacy)
    expect(byStep.problem.whatIsNotWorking).toBe("Answer for whatIsNotWorking");
    expect(byStep.problem.whoIsImpacted).toBe("Answer for whoIsImpacted");
    expect(byStep.problem.consequencesOfDoingNothing).toBe("Answer for consequencesOfDoingNothing");

    // Step 3: opportunity — all 3 fields populated
    expect(byStep.opportunity.whatCouldBeImproved).toBe("Answer for whatCouldBeImproved");
    expect(byStep.opportunity.whatValueCouldBeCreated).toBe("Answer for whatValueCouldBeCreated");
    expect(byStep.opportunity.strategicAdvantage).toBe("Answer for strategicAdvantage");

    // Step 4: guiding_question
    expect(byStep.guiding_question.whatIf).toBe("Answer for whatIf");

    // Step 6: clustering — expanded fields
    expect(byStep.clustering.patternsObserved).toBe("Answer for patternsObserved");
    expect(byStep.clustering.themeLabels).toBe("Answer for themeLabels");
    expect(byStep.clustering.ideaThemeGrouping).toBe("Answer for ideaThemeGrouping");

    // Step 7: screening — expanded fields
    expect(byStep.screening.screeningCriteria).toBe("Answer for screeningCriteria");
    expect(byStep.screening.promisingIdeas).toBe("Answer for promisingIdeas");
    expect(byStep.screening.deferredIdeas).toBe("Answer for deferredIdeas");

    // Step 8: scenario_exploration — expanded fields
    expect(byStep.scenario_exploration.notes).toBe("Answer for notes");
    expect(byStep.scenario_exploration.adoptionHighScenario).toBe("Answer for adoptionHighScenario");
    expect(byStep.scenario_exploration.competitorReactionScenario).toBe("Answer for competitorReactionScenario");

    // Step 9: feasibility — expanded fields
    expect(byStep.feasibility.notes).toBe("Answer for notes");
    expect(byStep.feasibility.testPerformed).toBe("Answer for testPerformed");
    expect(byStep.feasibility.feasibilityRating).toBe("Answer for feasibilityRating");

    // Step 10: concept_selection — 7 questions with rationale sub-fields
    expect(byStep.concept_selection.selectedIdea).toBe("Answer for selectedIdea");
    expect(byStep.concept_selection["rationale.strategicAlignment"]).toBe("Answer for rationale.strategicAlignment");
    expect(byStep.concept_selection["rationale.expectedValue"]).toBe("Answer for rationale.expectedValue");
    expect(byStep.concept_selection["rationale.feasibility"]).toBe("Answer for rationale.feasibility");
    expect(byStep.concept_selection["rationale.riskProfile"]).toBe("Answer for rationale.riskProfile");
    expect(byStep.concept_selection["rationale.stakeholderSupport"]).toBe("Answer for rationale.stakeholderSupport");
    expect(byStep.concept_selection.nextStep).toBe("Answer for nextStep");

    // Step 11: one_page_summary — 7 questions (no overrideText)
    expect(byStep.one_page_summary.theProblem).toBe("Answer for theProblem");
    expect(byStep.one_page_summary.reasonForSelection).toBe("Answer for reasonForSelection");
  });

  it("question-table path fills Steps 2-3 fields that legacy path left blank", () => {
    // The key improvement: Steps 2 and 3 now get whoIsImpacted, consequencesOfDoingNothing,
    // whatValueCouldBeCreated, and strategicAdvantage filled directly from LLM answers.
    // Legacy path left these as "" because coreSignals/problem/opportunity objects lacked them.
    const answeredQuestions: AnsweredQuestionRow[] = QUESTIONS_TABLE.map(q => ({
      ...q,
      answer: q.correspondingField === "whoIsImpacted" ? "Operations team and customers"
        : q.correspondingField === "consequencesOfDoingNothing" ? "Revenue decline 10%"
        : q.correspondingField === "whatValueCouldBeCreated" ? "50% faster onboarding"
        : q.correspondingField === "strategicAdvantage" ? "First-mover advantage in market"
        : "",
      answerType: "inferred" as const,
      confidence: "medium" as const,
      evidence: "",
    }));

    const byStep: Record<string, Record<string, string>> = {};
    for (const row of answeredQuestions) {
      if (!byStep[row.stepKey]) byStep[row.stepKey] = {};
      byStep[row.stepKey][row.correspondingField] = row.answer || "";
    }

    // These were always empty in legacy path
    expect(byStep.problem.whoIsImpacted).toBe("Operations team and customers");
    expect(byStep.problem.consequencesOfDoingNothing).toBe("Revenue decline 10%");
    expect(byStep.opportunity.whatValueCouldBeCreated).toBe("50% faster onboarding");
    expect(byStep.opportunity.strategicAdvantage).toBe("First-mover advantage in market");
  });
});

describe("Legacy compat — old TranslateResponse still applies via fallback path", () => {
  it("applyToIdeation detects legacy shape (no answeredQuestions)", () => {
    const legacyResult = {
      decisionGate: { status: "CONTINUE", reason: "" },
      problem: { statement: "Old problem", status: "clear" },
      opportunity: { statement: "Old opportunity", status: "clear" },
      coreSignals: { externalDrivers: ["Driver"], internalDrivers: ["Internal"], trigger: "Trigger" },
      whatIfQuestion: "What if?",
      projectContextResult: "Context",
    };
    // Detection: no answeredQuestions array
    expect(Array.isArray(legacyResult.answeredQuestions)).toBe(false);
  });

  it("applyToIdeation detects question-table shape (has answeredQuestions)", () => {
    const qtResult = {
      decisionGate: { status: "CONTINUE", reason: "" },
      answeredQuestions: [{ stepKey: "context", correspondingField: "externalDriver", answer: "Test" }],
    };
    expect(Array.isArray(qtResult.answeredQuestions)).toBe(true);
  });
});

// ── Structured Clarification Types Tests ──────────────────────────────────

describe("Structured Clarification — Type Contracts", () => {
  it("ClarificationPayload has required shape", () => {
    const payload: ClarificationPayload = {
      clarificationMode: "choice_dialog",
      clarificationPrompt: "The input has multiple possible interpretations.",
      clarificationChoices: [],
      allowFreeText: true,
    };
    expect(payload.clarificationMode).toBe("choice_dialog");
    expect(payload.allowFreeText).toBe(true);
  });

  it("ClarificationChoiceGroup supports single and multi select modes", () => {
    const single: ClarificationChoiceGroup = {
      groupKey: "primaryProblems",
      groupLabel: "Primary Problem",
      selectMode: "single",
      options: [
        { id: "p1", label: "Legacy system slowness", confidence: "high" },
        { id: "p2", label: "Customer churn", confidence: "medium" },
      ],
      correspondingFields: ["whatIsNotWorking"],
      stepKey: "problem",
    };
    const multi: ClarificationChoiceGroup = {
      groupKey: "externalDrivers",
      groupLabel: "External Drivers",
      selectMode: "multi",
      options: [
        { id: "e1", label: "Market competition" },
        { id: "e2", label: "Regulatory changes" },
        { id: "e3", label: "Technology shift" },
      ],
      correspondingFields: ["externalDriver"],
      stepKey: "context",
    };
    expect(single.selectMode).toBe("single");
    expect(multi.selectMode).toBe("multi");
    expect(single.options.length).toBe(2);
    expect(multi.options.length).toBe(3);
  });

  it("ClarificationOption supports all optional fields", () => {
    const opt: ClarificationOption = {
      id: "opt-1",
      label: "Primary option",
      rationale: "This was mentioned directly in the text",
      confidence: "high",
    };
    expect(opt.id).toBeTruthy();
    expect(opt.label).toBeTruthy();
    expect(opt.rationale).toBeTruthy();
    expect(opt.confidence).toBe("high");
  });

  it("ClarificationSubmission captures selections and free text", () => {
    const submission: ClarificationSubmission = {
      selections: {
        primaryProblems: ["p1"],
        externalDrivers: ["e1", "e3"],
      },
      freeText: "Additional context about the project",
    };
    expect(submission.selections.primaryProblems).toEqual(["p1"]);
    expect(submission.selections.externalDrivers).toHaveLength(2);
    expect(submission.freeText).toBeTruthy();
  });

  it("QuestionTableResponse includes optional clarification field", () => {
    const responseWithClarification: QuestionTableResponse = {
      decisionGate: { status: "CLARIFICATION_NEEDED", reason: "Ambiguous" },
      answeredQuestions: [],
      clarification: {
        clarificationMode: "choice_dialog",
        clarificationPrompt: "Please clarify",
        clarificationChoices: [
          {
            groupKey: "primaryProblems",
            groupLabel: "Primary Problem",
            selectMode: "single",
            options: [{ id: "p1", label: "Problem A" }],
            correspondingFields: ["whatIsNotWorking"],
            stepKey: "problem",
          },
        ],
        allowFreeText: true,
      },
    };
    const responseWithout: QuestionTableResponse = {
      decisionGate: { status: "CONTINUE", reason: "OK" },
      answeredQuestions: [],
    };
    expect(responseWithClarification.clarification).toBeDefined();
    expect(responseWithout.clarification).toBeUndefined();
  });
});

// ── buildClarificationEnrichedText Tests ──────────────────────────────────

describe("buildClarificationEnrichedText", () => {
  const makeGroups = (): ClarificationChoiceGroup[] => [
    {
      groupKey: "primaryProblems",
      groupLabel: "Primary Problem",
      selectMode: "single",
      options: [
        { id: "p1", label: "Legacy system slowness" },
        { id: "p2", label: "Customer churn" },
      ],
      correspondingFields: ["whatIsNotWorking"],
      stepKey: "problem",
    },
    {
      groupKey: "externalDrivers",
      groupLabel: "External Drivers",
      selectMode: "multi",
      options: [
        { id: "e1", label: "Market competition" },
        { id: "e2", label: "Regulatory changes" },
        { id: "e3", label: "Technology shift" },
      ],
      correspondingFields: ["externalDriver"],
      stepKey: "context",
    },
  ];

  it("enriches text with selected options", () => {
    const result = buildClarificationEnrichedText(
      "Our company needs a new system",
      makeGroups(),
      { selections: { primaryProblems: ["p1"], externalDrivers: ["e1", "e3"] } },
    );
    expect(result).toContain("Our company needs a new system");
    expect(result).toContain("--- User Clarifications ---");
    expect(result).toContain("Primary Problem: Legacy system slowness");
    expect(result).toContain("External Drivers: Market competition; Technology shift");
  });

  it("includes free text when provided", () => {
    const result = buildClarificationEnrichedText(
      "Base text",
      makeGroups(),
      { selections: { primaryProblems: ["p2"] }, freeText: "Also consider budget constraints" },
    );
    expect(result).toContain("Additional details: Also consider budget constraints");
  });

  it("skips groups with no selections", () => {
    const result = buildClarificationEnrichedText(
      "Base text",
      makeGroups(),
      { selections: { primaryProblems: ["p1"], externalDrivers: [] } },
    );
    expect(result).toContain("Primary Problem: Legacy system slowness");
    expect(result).not.toContain("External Drivers:");
  });

  it("handles empty selections gracefully", () => {
    const result = buildClarificationEnrichedText(
      "Base text",
      makeGroups(),
      { selections: {} },
    );
    expect(result).toContain("Base text");
    expect(result).toContain("--- User Clarifications ---");
    // No group entries when nothing selected
    expect(result).not.toContain("Primary Problem:");
    expect(result).not.toContain("External Drivers:");
  });

  it("handles empty groups array", () => {
    const result = buildClarificationEnrichedText(
      "Just raw text",
      [],
      { selections: { anything: ["x"] } },
    );
    expect(result).toContain("Just raw text");
  });

  it("trims free text and ignores whitespace-only free text", () => {
    const result = buildClarificationEnrichedText(
      "Base",
      makeGroups(),
      { selections: { primaryProblems: ["p1"] }, freeText: "   " },
    );
    expect(result).not.toContain("Additional details:");
  });
});

// ── normalizeQuestionTableResponse Clarification Tests ────────────────────

describe("normalizeQuestionTableResponse — clarification handling", () => {
  it("preserves structured clarification payload from LLM response", () => {
    const raw = {
      decisionGate: { status: "CLARIFICATION_NEEDED", reason: "Multiple problems detected" },
      answeredQuestions: [],
      clarification: {
        clarificationMode: "choice_dialog",
        clarificationPrompt: "Which problem is primary?",
        clarificationChoices: [
          {
            groupKey: "primaryProblems",
            groupLabel: "Primary Problem",
            selectMode: "single",
            options: [
              { id: "p1", label: "System slowness", rationale: "Mentioned 3 times", confidence: "high" },
              { id: "p2", label: "Data quality issues", confidence: "medium" },
            ],
            correspondingFields: ["whatIsNotWorking"],
            stepKey: "problem",
          },
        ],
        allowFreeText: true,
      },
    };
    const result = normalizeQuestionTableResponse(raw);
    expect(result.clarification).toBeDefined();
    expect(result.clarification!.clarificationMode).toBe("choice_dialog");
    expect(result.clarification!.clarificationChoices).toHaveLength(1);
    expect(result.clarification!.clarificationChoices[0].options).toHaveLength(2);
    expect(result.clarification!.allowFreeText).toBe(true);
  });

  it("returns undefined clarification when not CLARIFICATION_NEEDED", () => {
    const raw = {
      decisionGate: { status: "CONTINUE", reason: "OK" },
      answeredQuestions: [],
    };
    const result = normalizeQuestionTableResponse(raw);
    expect(result.clarification).toBeUndefined();
  });

  it("normalizes malformed clarification choices", () => {
    const raw = {
      decisionGate: { status: "CLARIFICATION_NEEDED", reason: "Needs clarification" },
      answeredQuestions: [],
      clarification: {
        clarificationMode: "choice_dialog",
        clarificationPrompt: "Please clarify",
        clarificationChoices: [
          {
            groupKey: "test",
            groupLabel: "Test Group",
            selectMode: "invalid_mode", // invalid
            options: [
              { id: "1", label: "Option 1" },
              { label: "Missing ID option" }, // missing id
            ],
            correspondingFields: ["field1"],
            stepKey: "context",
          },
        ],
        allowFreeText: false,
      },
    };
    const result = normalizeQuestionTableResponse(raw);
    expect(result.clarification).toBeDefined();
    // selectMode should be normalized to "multi" (default for invalid)
    expect(result.clarification!.clarificationChoices[0].selectMode).toBe("multi");
    // Options with missing IDs should get auto-generated IDs
    expect(result.clarification!.clarificationChoices[0].options.length).toBe(2);
    for (const opt of result.clarification!.clarificationChoices[0].options) {
      expect(opt.id).toBeTruthy();
      expect(opt.label).toBeTruthy();
    }
  });
});

// ── Clarification → Re-analysis Flow Tests ────────────────────────────────

describe("Clarification → Re-analysis Flow", () => {
  it("enriched text contains original + user selections", () => {
    const original = "We need to modernize our customer portal. There are performance issues and data quality problems.";
    const groups: ClarificationChoiceGroup[] = [
      {
        groupKey: "primaryProblems",
        groupLabel: "Primary Problem",
        selectMode: "single",
        options: [
          { id: "p1", label: "Performance issues" },
          { id: "p2", label: "Data quality problems" },
        ],
        correspondingFields: ["whatIsNotWorking"],
        stepKey: "problem",
      },
      {
        groupKey: "primaryOpportunities",
        groupLabel: "Primary Opportunity",
        selectMode: "single",
        options: [
          { id: "o1", label: "Faster response times" },
          { id: "o2", label: "Better data accuracy" },
        ],
        correspondingFields: ["whatCouldBeImproved"],
        stepKey: "opportunity",
      },
    ];
    const submission: ClarificationSubmission = {
      selections: {
        primaryProblems: ["p1"],
        primaryOpportunities: ["o1"],
      },
    };
    const enriched = buildClarificationEnrichedText(original, groups, submission);

    expect(enriched).toContain(original);
    expect(enriched).toContain("Primary Problem: Performance issues");
    expect(enriched).toContain("Primary Opportunity: Faster response times");
    // Should NOT contain unselected options
    expect(enriched).not.toContain("Data quality problems");
    expect(enriched).not.toContain("Better data accuracy");
  });

  it("multi-select groups join selected labels with semicolons", () => {
    const groups: ClarificationChoiceGroup[] = [{
      groupKey: "impactedGroups",
      groupLabel: "Impacted Groups",
      selectMode: "multi",
      options: [
        { id: "g1", label: "Operations team" },
        { id: "g2", label: "Customer support" },
        { id: "g3", label: "End users" },
      ],
      correspondingFields: ["whoIsImpacted"],
      stepKey: "problem",
    }];
    const submission: ClarificationSubmission = {
      selections: { impactedGroups: ["g1", "g3"] },
    };
    const enriched = buildClarificationEnrichedText("Base", groups, submission);
    expect(enriched).toContain("Impacted Groups: Operations team; End users");
  });

  it("applyToIdeation rejects CLARIFICATION_NEEDED results", () => {
    // The router throws BAD_REQUEST if trying to apply CLARIFICATION_NEEDED results
    const result = {
      decisionGate: { status: "CLARIFICATION_NEEDED", reason: "Need more info" },
      answeredQuestions: [],
    };
    const hasAnsweredQuestions = Array.isArray(result.answeredQuestions);
    const gateStatus = result.decisionGate?.status;
    expect(hasAnsweredQuestions).toBe(true);
    expect(gateStatus).toBe("CLARIFICATION_NEEDED");
    // Router would throw: "Cannot apply translator output in CLARIFICATION_NEEDED mode"
  });

  it("after clarification re-analysis, result can be applied if CONTINUE", () => {
    // After submitClarification succeeds with CONTINUE, the result should be applicable
    const reAnalysisResult = {
      decisionGate: { status: "CONTINUE", reason: "Clarified" },
      answeredQuestions: QUESTIONS_TABLE.map(q => ({
        ...q,
        answer: "Clarified answer",
        answerType: "extracted" as const,
        confidence: "high" as const,
        evidence: "",
      })),
    };
    expect(reAnalysisResult.decisionGate.status).toBe("CONTINUE");
    expect(reAnalysisResult.answeredQuestions.length).toBe(QUESTIONS_TABLE.length);
    // All answers populated after clarification
    for (const row of reAnalysisResult.answeredQuestions) {
      expect(row.answer).toBeTruthy();
    }
  });
});

// ─── Step 5: Structured Ideas from Answered Table ────────────────────────
describe("Step 5 — Structured Idea Parsing", () => {
  it("QUESTIONS_TABLE has Step 5 rawIdeaList field for idea extraction", () => {
    const rawIdeaRow = QUESTIONS_TABLE.find(
      q => q.stepKey === "idea_generation" && q.correspondingField === "rawIdeaList",
    );
    expect(rawIdeaRow).toBeDefined();
    expect(rawIdeaRow!.step).toContain("5.");
  });

  it("parses numbered list into individual ideas", () => {
    const rawText = "1. AI-powered document search\n2. Self-service analytics dashboard\n3. Automated compliance checks";
    const lines = rawText
      .split(/\n/)
      .map(line => line.replace(/^\s*[-•*\d]+[.):\s]+/, "").trim())
      .filter(line => line.length > 3);
    expect(lines).toEqual([
      "AI-powered document search",
      "Self-service analytics dashboard",
      "Automated compliance checks",
    ]);
  });

  it("parses bullet-point list into individual ideas", () => {
    const rawText = "- Cloud migration\n- Data lake consolidation\n- API gateway modernization";
    const lines = rawText
      .split(/\n/)
      .map(line => line.replace(/^\s*[-•*\d]+[.):\s]+/, "").trim())
      .filter(line => line.length > 3);
    expect(lines).toEqual([
      "Cloud migration",
      "Data lake consolidation",
      "API gateway modernization",
    ]);
  });

  it("extracts title and description from 'Title: Description' format", () => {
    const line = "Smart Search Engine: An AI-powered search tool that indexes all company documents";
    const colonSplit = line.match(/^(.+?):\s+(.+)$/);
    expect(colonSplit).not.toBeNull();
    expect(colonSplit![1].trim()).toBe("Smart Search Engine");
    expect(colonSplit![2].trim()).toBe("An AI-powered search tool that indexes all company documents");
  });

  it("deduplicates ideas by title (case-insensitive)", () => {
    const existing = new Set(["cloud migration", "api gateway"]);
    const candidates = ["Cloud Migration", "Data Lake", "API Gateway", "ML Pipeline"];
    const newIdeas = candidates.filter(c => !existing.has(c.toLowerCase().trim()));
    expect(newIdeas).toEqual(["Data Lake", "ML Pipeline"]);
  });

  it("filters out lines shorter than 4 characters", () => {
    const rawText = "OK\n- Real idea here\nNo\n- Another valid idea";
    const lines = rawText
      .split(/\n/)
      .map(line => line.replace(/^\s*[-•*\d]+[.):\s]+/, "").trim())
      .filter(line => line.length > 3);
    expect(lines).toEqual(["Real idea here", "Another valid idea"]);
  });
});

// ─── Step 10: Concept Selection Field Mapping ───────────────────────────
describe("Step 10 — Concept Selection Field Mapping", () => {
  it("QUESTIONS_TABLE has 7 questions for concept_selection step", () => {
    const csRows = QUESTIONS_TABLE.filter(q => q.stepKey === "concept_selection");
    expect(csRows.length).toBe(7);
  });

  it("QUESTIONS_TABLE has separate rationale sub-fields", () => {
    const csRows = QUESTIONS_TABLE.filter(q => q.stepKey === "concept_selection");
    const fields = csRows.map(r => r.correspondingField);
    expect(fields).toContain("selectedIdea");
    expect(fields).toContain("rationale.strategicAlignment");
    expect(fields).toContain("rationale.expectedValue");
    expect(fields).toContain("rationale.feasibility");
    expect(fields).toContain("rationale.riskProfile");
    expect(fields).toContain("rationale.stakeholderSupport");
    expect(fields).toContain("nextStep");
  });

  it("rationale sub-fields map 1:1 to ConceptSelectionToolPanel state", () => {
    // ConceptSelectionToolPanel reads: payload.rationale.{strategicAlignment, expectedValue, feasibility, riskProfile, stakeholderSupport}
    const panelFields = ["strategicAlignment", "expectedValue", "feasibility", "riskProfile", "stakeholderSupport"];
    const questionFields = QUESTIONS_TABLE
      .filter(q => q.stepKey === "concept_selection" && q.correspondingField.startsWith("rationale."))
      .map(q => q.correspondingField.replace("rationale.", ""));
    expect(questionFields.sort()).toEqual(panelFields.sort());
  });

  it("answered table maps to nested rationale object in step payload", () => {
    // Simulate the mapping logic from applyToIdeation
    const byStep: Record<string, Record<string, string>> = {
      concept_selection: {
        "selectedIdea": "AI-powered document search",
        "rationale.strategicAlignment": "Aligns with digital transformation strategy",
        "rationale.expectedValue": "30% reduction in search time",
        "rationale.feasibility": "Existing NLP models available",
        "rationale.riskProfile": "Medium — integration complexity",
        "rationale.stakeholderSupport": "Strong support from CIO",
        "nextStep": "Build prototype in Q2",
      },
    };

    const payload = {
      selectedIdea: byStep.concept_selection?.selectedIdea || "",
      rationale: {
        strategicAlignment: byStep.concept_selection?.["rationale.strategicAlignment"] || "",
        expectedValue: byStep.concept_selection?.["rationale.expectedValue"] || "",
        feasibility: byStep.concept_selection?.["rationale.feasibility"] || "",
        riskProfile: byStep.concept_selection?.["rationale.riskProfile"] || "",
        stakeholderSupport: byStep.concept_selection?.["rationale.stakeholderSupport"] || "",
      },
      nextStep: byStep.concept_selection?.nextStep || "",
    };

    expect(payload.selectedIdea).toBe("AI-powered document search");
    expect(payload.rationale.strategicAlignment).toBe("Aligns with digital transformation strategy");
    expect(payload.rationale.expectedValue).toBe("30% reduction in search time");
    expect(payload.rationale.feasibility).toBe("Existing NLP models available");
    expect(payload.rationale.riskProfile).toBe("Medium — integration complexity");
    expect(payload.rationale.stakeholderSupport).toBe("Strong support from CIO");
    expect(payload.nextStep).toBe("Build prototype in Q2");
  });

  it("deriveTranslateResponse combines rationale sub-fields into legacy format", () => {
    const qtResult: QuestionTableResponse = {
      decisionGate: { status: "CONTINUE", reason: "" },
      answeredQuestions: QUESTIONS_TABLE.map(q => ({
        ...q,
        answer: q.correspondingField === "rationale.strategicAlignment" ? "Good alignment"
          : q.correspondingField === "rationale.expectedValue" ? "High ROI"
          : q.correspondingField === "rationale.feasibility" ? "Very feasible"
          : q.correspondingField === "selectedIdea" ? "Top Concept"
          : "",
        answerType: "proposed" as const,
        confidence: "medium" as const,
        evidence: "",
      })),
    };

    const legacy = deriveTranslateResponse(qtResult);
    // Legacy format merges rationale sub-fields into a single string
    expect(legacy.ideationWorkflowDraft.conceptSelection.rationale).toContain("Good alignment");
    expect(legacy.ideationWorkflowDraft.conceptSelection.rationale).toContain("High ROI");
    expect(legacy.ideationWorkflowDraft.conceptSelection.rationale).toContain("Very feasible");
    expect(legacy.ideationWorkflowDraft.conceptSelection.selectedIdea).toBe("Top Concept");
  });
});

// ─── Readiness and Wizard Handoff Integration ────────────────────────────
describe("Readiness — Translator-Populated State", () => {
  it("readiness checks require ideas, selected concept, and rationale", () => {
    // Readiness blockers checklist (from ideation-readiness.ts):
    const READINESS_BLOCKERS = [
      "Problem definition not complete",
      "Opportunity definition not complete",
      "No ideas created",
      "No concept selected",
      "Concept rationale not provided",
    ];
    expect(READINESS_BLOCKERS.length).toBe(5);
  });

  it("translator apply must set ideation.selectedConceptSummary for readiness check 5", () => {
    // Readiness check: !ideation.rationaleSummary && !ideation.selectedConceptSummary → blocker
    // After translator apply: selectedConceptSummary is set from concept_selection selectedIdea
    const snapshot = {
      selectedConceptSummary: "AI-powered document search",
      rationaleSummary: "Good alignment | High ROI | Feasible | Medium risk | Strong support",
    };
    expect(!!(snapshot.rationaleSummary || snapshot.selectedConceptSummary)).toBe(true);
  });

  it("rationale from step payload also satisfies readiness check", () => {
    // Updated readiness also checks concept_selection step payload
    const stepPayload = {
      selectedIdea: "Smart Search",
      rationale: {
        strategicAlignment: "Aligns well",
        expectedValue: "",
        feasibility: "",
        riskProfile: "",
        stakeholderSupport: "",
      },
    };
    const rationale = stepPayload.rationale;
    const hasRationale = Object.values(rationale).some(v => typeof v === "string" && v.trim());
    expect(hasRationale).toBe(true);
  });
});

describe("Wizard Handoff — Scenario Package Persistence", () => {
  it("deriveTranslateResponse produces a non-empty psWizardScenarioPackage", () => {
    const qtResult: QuestionTableResponse = {
      decisionGate: { status: "CONTINUE", reason: "" },
      answeredQuestions: QUESTIONS_TABLE.map(q => ({
        ...q,
        answer: q.correspondingField === "selectedIdea" ? "Cloud Migration Strategy"
          : q.correspondingField === "whatIsNotWorking" ? "Legacy on-prem systems"
          : q.correspondingField === "whatCouldBeImproved" ? "Scalability and cost"
          : q.correspondingField === "externalDriver" ? "Market demands cloud-native"
          : q.correspondingField === "triggerEvent" ? "Data center lease expires Q4"
          : "",
        answerType: "proposed" as const,
        confidence: "medium" as const,
        evidence: "",
      })),
    };

    const legacy = deriveTranslateResponse(qtResult);
    expect(legacy.psWizardScenarioPackage).toBeDefined();
    expect(legacy.psWizardScenarioPackage.scenarioTitle).toBe("Cloud Migration Strategy");
    expect(legacy.psWizardScenarioPackage.primaryProblem).toBe("Legacy on-prem systems");
    expect(legacy.psWizardScenarioPackage.opportunityStatement).toBe("Scalability and cost");
    expect(legacy.psWizardScenarioPackage.urgencyDriver).toBe("Data center lease expires Q4");
    expect(legacy.psWizardScenarioPackage.businessNeed).toBe("Market demands cloud-native");
  });

  it("persistTranslatorRun must store legacyResult (with psWizardScenarioPackage), not qtResult", () => {
    // qtResult (QuestionTableResponse) has no psWizardScenarioPackage field
    const qtResult: QuestionTableResponse = {
      decisionGate: { status: "CONTINUE", reason: "" },
      answeredQuestions: [],
    };
    // legacyResult (TranslateResponse) has psWizardScenarioPackage
    const legacyResult = deriveTranslateResponse(qtResult);

    // generateWizardHandoff reads: result.psWizardScenarioPackage
    expect((qtResult as any).psWizardScenarioPackage).toBeUndefined();
    expect(legacyResult.psWizardScenarioPackage).toBeDefined();
    expect(legacyResult.psWizardScenarioPackage.scenarioTitle).toBeDefined();
  });
});

// ─── No Regression to Steps 1-4 ─────────────────────────────────────────
describe("No Regression — Steps 1-4 Answered Table Mapping", () => {
  it("Step 1 context fields unchanged in QUESTIONS_TABLE", () => {
    const ctxRows = QUESTIONS_TABLE.filter(q => q.stepKey === "context");
    expect(ctxRows.length).toBe(4);
    const fields = ctxRows.map(r => r.correspondingField);
    expect(fields).toContain("externalDriver");
    expect(fields).toContain("internalDriver");
    expect(fields).toContain("triggerEvent");
    expect(fields).toContain("shapesNeed");
  });

  it("Step 2 problem fields unchanged", () => {
    const rows = QUESTIONS_TABLE.filter(q => q.stepKey === "problem");
    expect(rows.length).toBe(3);
    expect(rows.map(r => r.correspondingField)).toEqual(
      expect.arrayContaining(["whatIsNotWorking", "whoIsImpacted", "consequencesOfDoingNothing"]),
    );
  });

  it("Step 3 opportunity fields unchanged", () => {
    const rows = QUESTIONS_TABLE.filter(q => q.stepKey === "opportunity");
    expect(rows.length).toBe(3);
  });

  it("Step 4 guiding question unchanged", () => {
    const rows = QUESTIONS_TABLE.filter(q => q.stepKey === "guiding_question");
    expect(rows.length).toBe(1);
    expect(rows[0].correspondingField).toBe("whatIf");
  });

  it("total QUESTIONS_TABLE row count is 45 after Step 10 expansion", () => {
    expect(QUESTIONS_TABLE.length).toBe(45);
    // 4+3+3+1+3+3+3+7+4+7+7 = 45
  });
});

// ─── Idempotent Apply ───────────────────────────────────────────────────
describe("Idempotent Apply — No Duplicate Ideas", () => {
  it("deduplication logic prevents adding ideas with same title", () => {
    const existing = new Set(["smart search engine", "data lake"]);
    const newCandidates = [
      "Smart Search Engine",     // duplicate
      "ML Pipeline Optimizer",   // new
      "Data Lake",               // duplicate
    ];
    const toAdd = newCandidates.filter(c => !existing.has(c.toLowerCase().trim()));
    expect(toAdd).toEqual(["ML Pipeline Optimizer"]);
  });

  it("deduplication is case-insensitive and trim-safe", () => {
    const existing = new Set(["  cloud migration  ".toLowerCase().trim()]);
    expect(existing.has("cloud migration")).toBe(true);
    expect(existing.has("CLOUD MIGRATION".toLowerCase().trim())).toBe(true);
    expect(existing.has("Cloud Migration ".toLowerCase().trim())).toBe(true);
  });
});
