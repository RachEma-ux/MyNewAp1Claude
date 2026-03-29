"""
Project Context Translator — Python Flask Service

Transforms unstructured user input into structured project context analysis
and PS Wizard-ready scenarios via LLM chat completions.

Runs on port 8585. Supports multiple LLM providers:
  - OpenAI (and OpenAI-compatible APIs)
  - Ollama (local)
  - Anthropic

Provider is selected via the llmOverride field in the translate request,
which the Node server populates from the catalog agent's resolved LLM.

Uses Flask + httpx (pure Python, no Rust compilation needed on Termux/aarch64).
"""

import json
import os
import re
import sys
from typing import Any

import httpx
from flask import Flask, jsonify, request

# ── Configuration ────────────────────────────────────────────────────────────

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
DEFAULT_PROVIDER = os.environ.get("CONTEXT_TRANSLATOR_PROVIDER", "openai")
DEFAULT_MODEL = os.environ.get("CONTEXT_TRANSLATOR_MODEL", "gpt-4o-mini")
DEFAULT_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
SERVICE_VERSION = "1.1.0"
SERVICE_NAME = "project-context-translator"
LLM_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "120"))

# ── System Prompt (mirrors server/modules/pmt/context-translator-agent.ts) ───

SYSTEM_PROMPT = """You are a Project Context Translator — a specialist AI agent designed to transform unstructured user input into a structured project context analysis and PS Wizard-ready scenario.

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
Return a JSON object conforming to the TranslateResponse schema. No markdown wrapping, no explanations outside the JSON."""


# ── Response Schema Defaults ─────────────────────────────────────────────────

EMPTY_RESPONSE_TEMPLATE: dict[str, Any] = {
    "decisionGate": {"status": "CLARIFICATION_NEEDED", "reason": ""},
    "extractedFacts": [],
    "problem": {"statement": "", "status": "missing"},
    "opportunity": {"statement": "", "status": "missing"},
    "coreSignals": {"externalDrivers": [], "internalDrivers": [], "trigger": ""},
    "projectContextFormula": "Project Context = External Drivers + Internal Drivers + Trigger",
    "projectContextResult": "",
    "whatIfQuestion": "",
    "ideationWorkflowDraft": {
        "contextOfProject": "",
        "problem": "",
        "opportunity": "",
        "whatIfQuestion": "",
        "ideaGeneration": [],
        "ideaClusteringAndTheming": [],
        "initialScreening": {"promisingIdeas": [], "deferredIdeas": [], "reasoning": ""},
        "scenarioExploration": {"scenarios": [], "insights": ""},
        "quickFeasibilityChecks": {
            "idea": "",
            "testPerformed": "",
            "keyFindings": [],
            "feasibilityRating": "",
        },
        "conceptSelection": {"selectedIdea": "", "rationale": "", "nextStep": ""},
        "onePageSummary": {
            "problem": "",
            "opportunity": "",
            "topIdeas": [],
            "feasibilityInsight": "",
            "selectedConcept": "",
            "reasonForSelection": "",
        },
    },
    "psWizardScenarioPackage": {
        "scenarioTitle": "",
        "scenarioSummary": "",
        "businessNeed": "",
        "primaryProblem": "",
        "opportunityStatement": "",
        "urgencyDriver": "",
        "recommendedDirection": "",
        "recommendedDirectionRationale": "",
        "whatIfQuestion": "",
        "feasibilityNotes": "",
        "openQuestions": [],
        "assumptions": [],
        "insights": [],
    },
    "missingInformation": [],
    "clarificationQuestions": [],
    "framingNotes": {"extracted": [], "inferred": [], "proposed": []},
    "renderedMarkdown": "",
}


def _deep_merge(base: dict, overlay: dict) -> dict:
    """Merge overlay into base, filling missing keys from base. Recurse into dicts."""
    result = dict(base)
    for key, value in overlay.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


# ── Helpers ──────────────────────────────────────────────────────────────────


def _extract_json(text: str) -> dict:
    """Extract a JSON object from LLM output that may contain markdown fences."""
    text = text.strip()

    # Try direct parse
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # Try markdown code block
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Last resort: first { to last }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError("Could not extract valid JSON from LLM response")


def _resolve_provider(body: dict) -> str:
    """Resolve which provider to use: request override > env > default."""
    override = body.get("llmOverride") or {}
    provider = (override.get("provider") or "").lower().strip()
    if provider in ("ollama", "ollama-local"):
        return "ollama"
    if provider in ("anthropic",):
        return "anthropic"
    if provider in ("openai", "openai-compatible", ""):
        return "openai"
    # Unknown provider — treat as OpenAI-compatible (most are)
    return "openai"


def _resolve_model(body: dict, provider: str) -> str:
    """Resolve model: request override > env > provider default."""
    override = body.get("llmOverride") or {}
    if override.get("model"):
        return override["model"]
    env_model = os.environ.get("CONTEXT_TRANSLATOR_MODEL")
    if env_model:
        return env_model
    if provider == "ollama":
        return "llama3.2"
    if provider == "anthropic":
        return "claude-sonnet-4-5-20250929"
    return DEFAULT_MODEL


def _resolve_base_url(body: dict, provider: str) -> str:
    """Resolve base URL: request override > env > provider default."""
    override = body.get("llmOverride") or {}
    if override.get("apiBaseUrl"):
        return override["apiBaseUrl"].rstrip("/")
    if provider == "ollama":
        return OLLAMA_BASE_URL.rstrip("/")
    if provider == "anthropic":
        return "https://api.anthropic.com"
    return DEFAULT_BASE_URL


# ── Provider-Specific LLM Callers ───────────────────────────────────────────


def _call_openai(base_url: str, model: str, user_message: str) -> str:
    """Call OpenAI-compatible chat completions API. Returns raw content string."""
    if not OPENAI_API_KEY:
        raise LLMError(503, "OPENAI_API_KEY not configured. Set the environment variable and restart.")

    with httpx.Client(timeout=LLM_TIMEOUT) as client:
        resp = client.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.3,
                "max_tokens": 8000,
            },
        )

    if resp.status_code == 401:
        raise LLMError(401, "Invalid OpenAI API key.")
    if resp.status_code == 429:
        # Distinguish quota exhaustion from transient rate limit
        try:
            err = resp.json().get("error", {})
            if err.get("code") == "insufficient_quota":
                raise LLMError(402, "OpenAI quota exhausted. Check billing at platform.openai.com.")
        except (json.JSONDecodeError, AttributeError):
            pass
        raise LLMError(429, "OpenAI rate limit exceeded. Try again shortly.")
    if resp.status_code >= 400:
        detail = f"OpenAI API error {resp.status_code}"
        try:
            detail = resp.json().get("error", {}).get("message", detail)
        except Exception:
            pass
        raise LLMError(502, detail)

    completion = resp.json()
    return (completion["choices"][0]["message"]["content"] or "").strip()


def _call_ollama(base_url: str, model: str, user_message: str) -> str:
    """Call Ollama's /api/chat endpoint. Returns raw content string."""
    with httpx.Client(timeout=LLM_TIMEOUT) as client:
        resp = client.post(
            f"{base_url}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                "stream": False,
                "options": {"temperature": 0.3},
            },
        )

    if resp.status_code == 404:
        raise LLMError(502, f"Ollama model '{model}' not found. Pull it with: ollama pull {model}")
    if resp.status_code >= 400:
        detail = f"Ollama error {resp.status_code}"
        try:
            detail = resp.json().get("error", detail)
        except Exception:
            pass
        raise LLMError(502, detail)

    result = resp.json()
    return (result.get("message", {}).get("content") or "").strip()


def _call_anthropic(base_url: str, model: str, user_message: str) -> str:
    """Call Anthropic's messages API. Returns raw content string."""
    if not ANTHROPIC_API_KEY:
        raise LLMError(503, "ANTHROPIC_API_KEY not configured.")

    with httpx.Client(timeout=LLM_TIMEOUT) as client:
        resp = client.post(
            f"{base_url}/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 8000,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": user_message}],
                "temperature": 0.3,
            },
        )

    if resp.status_code == 401:
        raise LLMError(401, "Invalid Anthropic API key.")
    if resp.status_code == 429:
        raise LLMError(429, "Anthropic rate limit exceeded. Try again shortly.")
    if resp.status_code >= 400:
        detail = f"Anthropic API error {resp.status_code}"
        try:
            detail = resp.json().get("error", {}).get("message", detail)
        except Exception:
            pass
        raise LLMError(502, detail)

    result = resp.json()
    content_blocks = result.get("content", [])
    texts = [b["text"] for b in content_blocks if b.get("type") == "text"]
    return "\n".join(texts).strip()


class LLMError(Exception):
    """Structured error from an LLM provider call."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _call_llm(provider: str, base_url: str, model: str, user_message: str) -> str:
    """Route to the correct provider caller. Returns raw LLM content string."""
    try:
        if provider == "ollama":
            return _call_ollama(base_url, model, user_message)
        if provider == "anthropic":
            return _call_anthropic(base_url, model, user_message)
        return _call_openai(base_url, model, user_message)
    except LLMError:
        raise
    except httpx.ConnectError as e:
        raise LLMError(502, f"Cannot reach {provider} LLM API at {base_url}: {e}")
    except httpx.TimeoutException:
        raise LLMError(504, f"{provider} LLM request timed out ({LLM_TIMEOUT}s).")


# ── Flask App ────────────────────────────────────────────────────────────────

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/health", methods=["GET"])
def health():
    """Health check — reports service status and configured LLM."""
    has_any_key = bool(OPENAI_API_KEY) or bool(ANTHROPIC_API_KEY)
    provider = DEFAULT_PROVIDER
    model = DEFAULT_MODEL
    # Ollama needs no key — if it's the default provider, status is ok
    if provider == "ollama":
        status = "ok"
    else:
        status = "ok" if has_any_key else "degraded"

    return jsonify({
        "status": status,
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "llmProvider": provider,
        "llmModel": model,
        "promptLoaded": True,
    })


@app.route("/translate", methods=["POST", "OPTIONS"])
def translate():
    """Translate raw project text into structured context analysis."""
    if request.method == "OPTIONS":
        return "", 204

    body = request.get_json(silent=True) or {}
    raw_text = (body.get("rawText") or "").strip()

    if len(raw_text) < 10:
        return jsonify({"detail": "rawText must be at least 10 characters."}), 400

    # Resolve provider, model, and base URL from override + env + defaults
    provider = _resolve_provider(body)
    model = _resolve_model(body, provider)
    base_url = _resolve_base_url(body, provider)

    print(f"[Translate] provider={provider} model={model} base_url={base_url}", flush=True)

    user_message = (
        "Analyze the following raw project input and produce a complete "
        "TranslateResponse JSON object.\n\n---\n\n"
        f"{raw_text}\n\n---\n\n"
        "Output ONLY the JSON object, no additional text."
    )

    # Call the resolved LLM provider
    try:
        raw_content = _call_llm(provider, base_url, model, user_message)
    except LLMError as e:
        return jsonify({"detail": e.detail}), e.status_code

    if not raw_content:
        return jsonify({"detail": "LLM returned empty response."}), 502

    try:
        parsed = _extract_json(raw_content)
    except ValueError as e:
        return jsonify({"detail": f"Failed to parse LLM JSON: {e}"}), 502

    # Merge with defaults so all fields are guaranteed present
    result = _deep_merge(EMPTY_RESPONSE_TEMPLATE, parsed)

    return jsonify(result)


# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8585"))
    print(f"[ContextTranslator] Starting on port {port}", flush=True)
    print(f"[ContextTranslator] Default provider: {DEFAULT_PROVIDER}", flush=True)
    print(f"[ContextTranslator] Default model: {DEFAULT_MODEL}", flush=True)
    print(f"[ContextTranslator] OPENAI_API_KEY set: {bool(OPENAI_API_KEY)}", flush=True)
    print(f"[ContextTranslator] ANTHROPIC_API_KEY set: {bool(ANTHROPIC_API_KEY)}", flush=True)
    print(f"[ContextTranslator] OLLAMA_BASE_URL: {OLLAMA_BASE_URL}", flush=True)
    app.run(host="0.0.0.0", port=port)
