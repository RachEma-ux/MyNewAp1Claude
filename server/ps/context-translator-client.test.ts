/**
 * Context Translator Client — Contract Tests
 *
 * Tests the TypeScript client contract, types, and error handling.
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

describe("Context Translator Field Mapping", () => {
  it("maps translator output to PS Ideation step payloads correctly", () => {
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

    // Verify field mapping: coreSignals → context step payload
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

    // Verify field mapping: problem → problem step payload
    const problemPayload = {
      problemStatement: response.problem.statement,
      status: response.problem.status,
    };
    expect(problemPayload.problemStatement).toBe("Slow portal");

    // Verify field mapping: opportunity → opportunity step payload
    const opportunityPayload = {
      opportunityStatement: response.opportunity.statement,
      status: response.opportunity.status,
    };
    expect(opportunityPayload.opportunityStatement).toBe("Self-service portal");
  });
});
