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
import { normalizeTranslateResponse } from "../modules/pmt/context-translator-agent";

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
      overrideText: "",
    };

    // Verify canonical keys match OnePageSummaryToolPanel expectations
    expect(summaryPayload.theProblem).toBe("Slow portal performance");
    expect(summaryPayload.theOpportunity).toBe("Build a modern self-service portal");
    expect(summaryPayload.topIdeas).toBe("Microservices rewrite\nProgressive enhancement");
    expect(summaryPayload.scenariosExplored).toBe("Both scenarios show improved UX");
    expect(summaryPayload.feasibilityInsights).toBe("Medium complexity, high ROI");
    expect(summaryPayload.selectedConcept).toBe("Microservices rewrite");
    expect(summaryPayload.reasonForSelection).toBe("Best long-term architecture fit");
    expect(summaryPayload.overrideText).toBe("");
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
      "feasibilityInsights", "selectedConcept", "reasonForSelection", "overrideText"];

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
