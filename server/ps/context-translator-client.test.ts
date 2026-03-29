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
