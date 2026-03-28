/**
 * Project Context Translator — Node/TS HTTP Client
 *
 * Communicates with the dedicated Python FastAPI service
 * at the configured PROJECT_CONTEXT_TRANSLATOR_URL.
 */

const SERVICE_URL = process.env.PROJECT_CONTEXT_TRANSLATOR_URL || "http://localhost:8585";

// ── Types (mirror Python Pydantic models) ─────────────────────────────────

export interface LlmOverride {
  provider?: string;
  model?: string;
  apiBaseUrl?: string;
  catalogRef?: string;
}

export interface TranslateRequest {
  rawText: string;
  metadata?: Record<string, unknown>;
  llmOverride?: LlmOverride;
}

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

export interface InitialScreening {
  promisingIdeas: string[];
  deferredIdeas: string[];
  reasoning: string;
}

export interface ScenarioExploration {
  scenarios: Array<Record<string, unknown>>;
  insights: string;
}

export interface QuickFeasibilityChecks {
  idea: string;
  testPerformed: string;
  keyFindings: string[];
  feasibilityRating: string;
}

export interface ConceptSelection {
  selectedIdea: string;
  rationale: string;
  nextStep: string;
}

export interface OnePageSummary {
  problem: string;
  opportunity: string;
  topIdeas: string[];
  feasibilityInsight: string;
  selectedConcept: string;
  reasonForSelection: string;
}

export interface IdeationWorkflowDraft {
  contextOfProject: string;
  problem: string;
  opportunity: string;
  whatIfQuestion: string;
  ideaGeneration: string[];
  ideaClusteringAndTheming: Array<Record<string, unknown>>;
  initialScreening: InitialScreening;
  scenarioExploration: ScenarioExploration;
  quickFeasibilityChecks: QuickFeasibilityChecks;
  conceptSelection: ConceptSelection;
  onePageSummary: OnePageSummary;
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
  ideationWorkflowDraft: IdeationWorkflowDraft;
  psWizardScenarioPackage: PSWizardScenarioPackage;
  missingInformation: string[];
  clarificationQuestions: string[];
  framingNotes: FramingNotes;
  renderedMarkdown: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  llmProvider: string;
  llmModel: string;
  promptLoaded: boolean;
}

// ── Client Functions ──────────────────────────────────────────────────────

export async function checkHealth(): Promise<HealthResponse> {
  const resp = await fetch(`${SERVICE_URL}/health`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`Context Translator health check failed: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function translate(req: TranslateRequest): Promise<TranslateResponse> {
  const resp = await fetch(`${SERVICE_URL}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!resp.ok) {
    const body = await resp.text();
    let detail = `Context Translator error: ${resp.status}`;
    try {
      const parsed = JSON.parse(body);
      detail = parsed.detail || detail;
    } catch {
      // use default detail
    }
    throw new Error(detail);
  }

  return resp.json();
}
