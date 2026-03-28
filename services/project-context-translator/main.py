"""
Project Context Translator — FastAPI Service

Dedicated Python service that transforms unstructured user input into
structured PS Ideation fields and a PS Wizard-ready scenario package.

Applies the formula: Project Context = External Drivers + Internal Drivers + Trigger

Start: uvicorn main:app --host 0.0.0.0 --port 8585
"""

import os
import json
import logging
import time
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from spacy_preprocess import preprocess as spacy_preprocess
from reasoning_request import build_reasoning_context
from grounding import check_grounding, GroundingResult

load_dotenv()

# ── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("project-context-translator")

# ── Config ──────────────────────────────────────────────────────────────────

LLM_PROVIDER = os.environ.get("PCT_LLM_PROVIDER", "openai")  # openai | anthropic
LLM_API_KEY = os.environ.get("PCT_LLM_API_KEY", "")
LLM_MODEL = os.environ.get("PCT_LLM_MODEL", "gpt-4o-mini")
LLM_BASE_URL = os.environ.get("PCT_LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MAX_TOKENS = int(os.environ.get("PCT_LLM_MAX_TOKENS", "4096"))

PROMPT_PATH = Path(__file__).parent / "prompts" / "system-prompt.md"

app = FastAPI(
    title="Project Context Translator",
    version="1.0.0",
    description="Transforms unstructured user input into structured PS Ideation + PS Wizard scenario packages.",
)


# ── Pydantic Models ─────────────────────────────────────────────────────────


class LlmOverride(BaseModel):
    """Optional LLM override from the platform's Default Reasoning LLM selection."""
    provider: Optional[str] = Field(default=None, description="LLM provider (openai | anthropic)")
    model: Optional[str] = Field(default=None, description="Model identifier")
    apiBaseUrl: Optional[str] = Field(default=None, description="API base URL")
    catalogRef: Optional[str] = Field(default=None, description="Catalog entry name for audit trail")


class TranslateRequest(BaseModel):
    """Input: raw user text and optional metadata."""
    rawText: str = Field(..., min_length=10, max_length=10000, description="Raw user input describing a project idea or scenario")
    metadata: Optional[dict] = Field(default=None, description="Optional metadata (workspaceId, sourceType, etc.)")
    llmOverride: Optional[LlmOverride] = Field(default=None, description="Platform-provided LLM override from agent config")


class DecisionGate(BaseModel):
    status: str = Field(..., description="CONTINUE or CLARIFICATION_NEEDED")
    reason: str = ""


class ProblemStatement(BaseModel):
    statement: str = ""
    status: str = "unclear"  # clear | unclear | missing


class OpportunityStatement(BaseModel):
    statement: str = ""
    status: str = "unclear"


class CoreSignals(BaseModel):
    externalDrivers: list[str] = []
    internalDrivers: list[str] = []
    trigger: str = ""


class InitialScreening(BaseModel):
    promisingIdeas: list[str] = []
    deferredIdeas: list[str] = []
    reasoning: str = ""


class ScenarioExploration(BaseModel):
    scenarios: list[dict] = []
    insights: str = ""


class QuickFeasibilityChecks(BaseModel):
    idea: str = ""
    testPerformed: str = ""
    keyFindings: list[str] = []
    feasibilityRating: str = ""


class ConceptSelection(BaseModel):
    selectedIdea: str = ""
    rationale: str = ""
    nextStep: str = ""


class OnePageSummary(BaseModel):
    problem: str = ""
    opportunity: str = ""
    topIdeas: list[str] = []
    feasibilityInsight: str = ""
    selectedConcept: str = ""
    reasonForSelection: str = ""


class IdeationWorkflowDraft(BaseModel):
    contextOfProject: str = ""
    problem: str = ""
    opportunity: str = ""
    whatIfQuestion: str = ""
    ideaGeneration: list[str] = []
    ideaClusteringAndTheming: list[dict] = []
    initialScreening: InitialScreening = InitialScreening()
    scenarioExploration: ScenarioExploration = ScenarioExploration()
    quickFeasibilityChecks: QuickFeasibilityChecks = QuickFeasibilityChecks()
    conceptSelection: ConceptSelection = ConceptSelection()
    onePageSummary: OnePageSummary = OnePageSummary()


class PSWizardScenarioPackage(BaseModel):
    scenarioTitle: str = ""
    scenarioSummary: str = ""
    businessNeed: str = ""
    primaryProblem: str = ""
    opportunityStatement: str = ""
    urgencyDriver: str = ""
    recommendedDirection: str = ""
    recommendedDirectionRationale: str = ""
    whatIfQuestion: str = ""
    feasibilityNotes: str = ""
    openQuestions: list[str] = []
    assumptions: list[str] = []
    insights: list[str] = []


class FramingNotes(BaseModel):
    extracted: list[str] = []
    inferred: list[str] = []
    proposed: list[str] = []


class GroundingMetadata(BaseModel):
    """Post-LLM grounding check results — evidence tracing metadata."""
    overallScore: str = "unknown"  # strong | moderate | weak | unknown
    ungroundedClaims: list[str] = []
    noteCount: int = 0
    groundedCount: int = 0


class TranslateResponse(BaseModel):
    """Full structured output from the Project Context Translator."""
    decisionGate: DecisionGate
    extractedFacts: list[str] = []
    problem: ProblemStatement = ProblemStatement()
    opportunity: OpportunityStatement = OpportunityStatement()
    coreSignals: CoreSignals = CoreSignals()
    projectContextFormula: str = "Project Context = External Drivers + Internal Drivers + Trigger"
    projectContextResult: str = ""
    whatIfQuestion: str = ""
    ideationWorkflowDraft: IdeationWorkflowDraft = IdeationWorkflowDraft()
    psWizardScenarioPackage: PSWizardScenarioPackage = PSWizardScenarioPackage()
    missingInformation: list[str] = []
    clarificationQuestions: list[str] = []
    framingNotes: FramingNotes = FramingNotes()
    renderedMarkdown: str = ""
    grounding: Optional[GroundingMetadata] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    llmProvider: str
    llmModel: str
    promptLoaded: bool


class StatusResponse(BaseModel):
    status: str
    service: str
    version: str
    llmProvider: str
    llmModel: str
    promptLoaded: bool
    promptPath: str
    uptime: float


# ── Startup ─────────────────────────────────────────────────────────────────

_start_time = time.time()
_system_prompt: str = ""


def _load_system_prompt() -> str:
    global _system_prompt
    if PROMPT_PATH.exists():
        _system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
        logger.info(f"Loaded system prompt from {PROMPT_PATH} ({len(_system_prompt)} chars)")
    else:
        logger.warning(f"System prompt not found at {PROMPT_PATH}, using fallback")
        _system_prompt = "You are a project context analysis assistant. Analyze the input and return structured JSON."
    return _system_prompt


_load_system_prompt()


# ── LLM Integration ─────────────────────────────────────────────────────────

RESPONSE_SCHEMA_HINT = """
Return a JSON object with this exact structure (no markdown fences, just raw JSON):
{
  "decisionGate": {"status": "CONTINUE" or "CLARIFICATION_NEEDED", "reason": ""},
  "extractedFacts": ["..."],
  "problem": {"statement": "...", "status": "clear" or "unclear" or "missing"},
  "opportunity": {"statement": "...", "status": "clear" or "unclear" or "missing"},
  "coreSignals": {"externalDrivers": ["..."], "internalDrivers": ["..."], "trigger": "..."},
  "projectContextFormula": "Project Context = External Drivers + Internal Drivers + Trigger",
  "projectContextResult": "...",
  "whatIfQuestion": "...",
  "ideationWorkflowDraft": {
    "contextOfProject": "...",
    "problem": "...",
    "opportunity": "...",
    "whatIfQuestion": "...",
    "ideaGeneration": ["idea1", "idea2", ...],
    "ideaClusteringAndTheming": [{"theme": "...", "ideas": ["..."]}],
    "initialScreening": {"promisingIdeas": ["..."], "deferredIdeas": ["..."], "reasoning": "..."},
    "scenarioExploration": {"scenarios": [{"name": "...", "description": "..."}], "insights": "..."},
    "quickFeasibilityChecks": {"idea": "...", "testPerformed": "...", "keyFindings": ["..."], "feasibilityRating": "High/Medium/Low"},
    "conceptSelection": {"selectedIdea": "...", "rationale": "...", "nextStep": "..."},
    "onePageSummary": {"problem": "...", "opportunity": "...", "topIdeas": ["..."], "feasibilityInsight": "...", "selectedConcept": "...", "reasonForSelection": "..."}
  },
  "psWizardScenarioPackage": {
    "scenarioTitle": "...",
    "scenarioSummary": "...",
    "businessNeed": "...",
    "primaryProblem": "...",
    "opportunityStatement": "...",
    "urgencyDriver": "...",
    "recommendedDirection": "...",
    "recommendedDirectionRationale": "...",
    "whatIfQuestion": "...",
    "feasibilityNotes": "...",
    "openQuestions": ["..."],
    "assumptions": ["..."],
    "insights": ["..."]
  },
  "missingInformation": ["..."],
  "clarificationQuestions": ["..."],
  "framingNotes": {"extracted": ["..."], "inferred": ["..."], "proposed": ["..."]},
  "renderedMarkdown": "..."
}
"""


async def _call_llm(
    user_content: str,
    override: Optional["LlmOverride"] = None,
) -> dict:
    """Call the configured LLM provider and parse structured JSON response.

    Args:
        user_content: Pre-built user message content (enriched with
                      spaCy preprocessing evidence when available).
        override: Optional platform-provided LLM override from the agent's
                  Default Reasoning LLM selection. When present, overrides
                  the env-based provider/model/base_url config.
    """
    # Resolve effective LLM config — override wins over env
    eff_provider = (override.provider if override and override.provider else None) or LLM_PROVIDER
    eff_model = (override.model if override and override.model else None) or LLM_MODEL
    eff_base_url = (override.apiBaseUrl if override and override.apiBaseUrl else None) or LLM_BASE_URL
    eff_api_key = LLM_API_KEY  # API key always from env (never sent over the wire)

    if not eff_api_key:
        raise HTTPException(
            status_code=503,
            detail="LLM API key not configured. Set PCT_LLM_API_KEY environment variable.",
        )

    if override and (override.provider or override.model):
        logger.info(f"LLM override active: provider={eff_provider} model={eff_model} catalogRef={override.catalogRef}")

    user_message = user_content

    messages = [
        {"role": "system", "content": _system_prompt + "\n\n" + RESPONSE_SCHEMA_HINT},
        {"role": "user", "content": user_message},
    ]

    headers = {
        "Content-Type": "application/json",
    }

    if eff_provider == "anthropic":
        # Anthropic API format
        headers["x-api-key"] = eff_api_key
        headers["anthropic-version"] = "2023-06-01"
        body = {
            "model": eff_model,
            "max_tokens": LLM_MAX_TOKENS,
            "system": _system_prompt + "\n\n" + RESPONSE_SCHEMA_HINT,
            "messages": [{"role": "user", "content": user_message}],
        }
        url = eff_base_url.rstrip("/") + "/messages" if "anthropic" in eff_base_url else "https://api.anthropic.com/v1/messages"
    else:
        # OpenAI-compatible API format (default)
        headers["Authorization"] = f"Bearer {eff_api_key}"
        body = {
            "model": eff_model,
            "messages": messages,
            "max_tokens": LLM_MAX_TOKENS,
            "temperature": 0.3,
        }
        url = eff_base_url.rstrip("/") + "/chat/completions"

    async with httpx.AsyncClient(timeout=120.0) as client:
        logger.info(f"Calling LLM: provider={eff_provider} model={eff_model} url={url}")
        resp = await client.post(url, json=body, headers=headers)

        if resp.status_code != 200:
            logger.error(f"LLM API error: {resp.status_code} {resp.text[:500]}")
            raise HTTPException(
                status_code=502,
                detail=f"LLM provider returned status {resp.status_code}",
            )

        data = resp.json()

    # Extract content based on provider
    if LLM_PROVIDER == "anthropic":
        content = data.get("content", [{}])[0].get("text", "")
    else:
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

    if not content:
        raise HTTPException(status_code=502, detail="LLM returned empty content")

    # Parse JSON from response (handle markdown fences)
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM JSON response: {e}\nContent: {content[:500]}")
        raise HTTPException(
            status_code=502,
            detail=f"LLM returned invalid JSON: {str(e)}",
        )


# ── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/health", response_model=HealthResponse)
async def health():
    """Service liveness/readiness check."""
    return HealthResponse(
        status="ok",
        service="project-context-translator",
        version="1.0.0",
        llmProvider=LLM_PROVIDER,
        llmModel=LLM_MODEL,
        promptLoaded=bool(_system_prompt),
    )


@app.get("/status", response_model=StatusResponse)
async def status():
    """Richer service status."""
    return StatusResponse(
        status="ok",
        service="project-context-translator",
        version="1.0.0",
        llmProvider=LLM_PROVIDER,
        llmModel=LLM_MODEL,
        promptLoaded=bool(_system_prompt),
        promptPath=str(PROMPT_PATH),
        uptime=round(time.time() - _start_time, 2),
    )


@app.post("/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest):
    """
    Transform raw user text into structured ideation fields + PS Wizard scenario package.

    Applies: Project Context = External Drivers + Internal Drivers + Trigger

    End-to-end flow:
      1. Receive raw ideation text
      2. Run spaCy preprocessing (sentences, entities, signals, validation)
      3. Build model-agnostic reasoning context enriched with evidence
      4. Call the LLM reasoning layer with enriched context
      5. Run grounding check — validate LLM claims against source evidence
      6. Return final structured response with grounding metadata
    """
    logger.info(f"Translate request: {len(req.rawText)} chars, metadata={req.metadata is not None}")

    # ── Step 1-2: spaCy Preprocessing ────────────────────────────────────
    try:
        preprocess_output = spacy_preprocess(req.rawText)
        logger.info(
            f"spaCy preprocess: {len(preprocess_output.sentences)} sentences, "
            f"{len(preprocess_output.entities)} entities, "
            f"{len(preprocess_output.keywords)} keywords, "
            f"pain={preprocess_output.validationFlags.hasPainSignal}, "
            f"opp={preprocess_output.validationFlags.hasOpportunitySignal}"
        )
    except Exception as e:
        logger.warning(f"spaCy preprocessing failed, falling back to raw text: {e}")
        preprocess_output = None

    # ── Step 3: Build enriched reasoning context ─────────────────────────
    if preprocess_output:
        user_content = build_reasoning_context(
            raw_text=req.rawText,
            preprocess=preprocess_output,
            metadata=req.metadata,
        )
    else:
        # Fallback: plain text without preprocessing evidence
        user_content = f"Analyze the following raw project input and return the structured JSON response:\n\n---\n{req.rawText}\n---"
        if req.metadata:
            user_content += f"\n\nAdditional metadata: {json.dumps(req.metadata)}"

    # ── Step 4: Call LLM reasoning layer ─────────────────────────────────
    try:
        result = await _call_llm(user_content, override=req.llmOverride)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error calling LLM")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

    # ── Step 5: Grounding check ──────────────────────────────────────────
    grounding_meta = None
    if preprocess_output:
        try:
            grounding_result = check_grounding(result, preprocess_output)
            grounding_meta = GroundingMetadata(
                overallScore=grounding_result.overallScore,
                ungroundedClaims=grounding_result.ungroundedClaims,
                noteCount=len(grounding_result.notes),
                groundedCount=len([n for n in grounding_result.notes if n.grounded]),
            )
            logger.info(
                f"Grounding check: score={grounding_meta.overallScore}, "
                f"grounded={grounding_meta.groundedCount}/{grounding_meta.noteCount}, "
                f"ungrounded={len(grounding_meta.ungroundedClaims)}"
            )
        except Exception as e:
            logger.warning(f"Grounding check failed (non-blocking): {e}")

    # ── Step 6: Validate and build response ──────────────────────────────
    gate = result.get("decisionGate", {})
    gate_status = gate.get("status", "CLARIFICATION_NEEDED")

    if gate_status not in ("CONTINUE", "CLARIFICATION_NEEDED"):
        gate_status = "CLARIFICATION_NEEDED"
        result["decisionGate"]["status"] = gate_status

    # Build response with defaults for missing fields
    try:
        response = TranslateResponse(**result)
    except Exception as e:
        logger.warning(f"Response validation warning, applying defaults: {e}")
        # Attempt partial construction
        response = TranslateResponse(
            decisionGate=DecisionGate(
                status=gate_status,
                reason=gate.get("reason", str(e)),
            ),
            extractedFacts=result.get("extractedFacts", []),
            problem=ProblemStatement(**result.get("problem", {})) if isinstance(result.get("problem"), dict) else ProblemStatement(),
            opportunity=OpportunityStatement(**result.get("opportunity", {})) if isinstance(result.get("opportunity"), dict) else OpportunityStatement(),
            missingInformation=result.get("missingInformation", []),
            clarificationQuestions=result.get("clarificationQuestions", []),
        )

    # Attach grounding metadata
    if grounding_meta:
        response.grounding = grounding_meta

    logger.info(f"Translate result: gate={response.decisionGate.status}")
    return response
