/**
 * PS Context Translator — Shared Types
 *
 * Types for the Project Context Translator response contract.
 * Used by both client and server.
 */

export interface DecisionGate {
  status: "CONTINUE" | "CLARIFICATION_NEEDED";
  reason: string;
}

export interface ProblemStatement {
  statement: string;
  status: "clear" | "unclear" | "missing";
}

export interface OpportunityStatement {
  statement: string;
  status: "clear" | "unclear" | "missing";
}

export interface CoreSignals {
  externalDrivers: string[];
  internalDrivers: string[];
  trigger: string;
}

export interface PSWizardScenarioPackage {
  scenarioTitle: string;
  scenarioSummary: string;
  businessNeed: string;
  primaryProblem: string;
  opportunityStatement: string;
  urgencyDriver: string;
  recommendedDirection: string;
  recommendedDirectionRationale: string;
  whatIfQuestion: string;
  feasibilityNotes: string;
  openQuestions: string[];
  assumptions: string[];
  insights: string[];
}

export interface FramingNotes {
  extracted: string[];
  inferred: string[];
  proposed: string[];
}

export interface TranslateResponse {
  decisionGate: DecisionGate;
  extractedFacts: string[];
  problem: ProblemStatement;
  opportunity: OpportunityStatement;
  coreSignals: CoreSignals;
  projectContextFormula: string;
  projectContextResult: string;
  whatIfQuestion: string;
  ideationWorkflowDraft: {
    contextOfProject: string;
    problem: string;
    opportunity: string;
    whatIfQuestion: string;
    ideaGeneration: string[];
    ideaClusteringAndTheming: Array<Record<string, unknown>>;
    initialScreening: {
      promisingIdeas: string[];
      deferredIdeas: string[];
      reasoning: string;
    };
    scenarioExploration: {
      scenarios: Array<Record<string, unknown>>;
      insights: string;
    };
    quickFeasibilityChecks: {
      idea: string;
      testPerformed: string;
      keyFindings: string[];
      feasibilityRating: string;
    };
    conceptSelection: {
      selectedIdea: string;
      rationale: string;
      nextStep: string;
    };
    onePageSummary: {
      problem: string;
      opportunity: string;
      topIdeas: string[];
      feasibilityInsight: string;
      selectedConcept: string;
      reasonForSelection: string;
    };
  };
  psWizardScenarioPackage: PSWizardScenarioPackage;
  missingInformation: string[];
  clarificationQuestions: string[];
  framingNotes: FramingNotes;
  renderedMarkdown: string;
}
