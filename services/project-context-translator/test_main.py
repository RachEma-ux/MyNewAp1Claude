"""
Tests for the Project Context Translator service.

Run: pytest test_main.py -v
"""
import json
import pytest
from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


# ── Health Endpoint ─────────────────────────────────────────────────────────


def test_health_returns_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "project-context-translator"
    assert data["version"] == "1.0.0"
    assert "llmProvider" in data
    assert "llmModel" in data
    assert "promptLoaded" in data


def test_health_prompt_loaded():
    resp = client.get("/health")
    data = resp.json()
    assert data["promptLoaded"] is True


# ── Status Endpoint ─────────────────────────────────────────────────────────


def test_status_returns_uptime():
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "uptime" in data
    assert isinstance(data["uptime"], float)
    assert data["uptime"] >= 0
    assert "promptPath" in data


# ── Translate Endpoint — Validation ─────────────────────────────────────────


def test_translate_rejects_empty_text():
    resp = client.post("/translate", json={"rawText": ""})
    assert resp.status_code == 422  # Pydantic validation error


def test_translate_rejects_short_text():
    resp = client.post("/translate", json={"rawText": "too short"})
    assert resp.status_code == 422


def test_translate_rejects_missing_text():
    resp = client.post("/translate", json={})
    assert resp.status_code == 422


def test_translate_validates_max_length():
    long_text = "a" * 10001
    resp = client.post("/translate", json={"rawText": long_text})
    assert resp.status_code == 422


def test_translate_accepts_valid_input_format():
    """Test that a valid request shape is accepted (will fail at LLM call without API key)."""
    resp = client.post("/translate", json={
        "rawText": "We need to build a new customer portal because our existing one is slow and losing customers. The market is shifting to self-service and our competitors already have modern portals.",
        "metadata": {"workspaceId": 1},
    })
    # Without API key, should return 503 (LLM unavailable)
    assert resp.status_code in (200, 503, 502)


def test_translate_accepts_without_metadata():
    """Metadata is optional."""
    resp = client.post("/translate", json={
        "rawText": "We need to modernize our legacy ERP system due to end of vendor support in Q2 2025.",
    })
    assert resp.status_code in (200, 503, 502)


# ── Response Shape Tests (with mocked LLM) ─────────────────────────────────

# These would require mocking the LLM call. For unit testing without an API key,
# we verify the request validation and service health. Full integration tests
# require PCT_LLM_API_KEY to be set.


def test_translate_response_shape_documentation():
    """Document the expected response shape for contract testing."""
    expected_keys = [
        "decisionGate",
        "extractedFacts",
        "problem",
        "opportunity",
        "coreSignals",
        "projectContextFormula",
        "projectContextResult",
        "whatIfQuestion",
        "ideationWorkflowDraft",
        "psWizardScenarioPackage",
        "missingInformation",
        "clarificationQuestions",
        "framingNotes",
        "renderedMarkdown",
    ]
    # This test documents the contract shape even without running the LLM
    from main import TranslateResponse
    response = TranslateResponse(
        decisionGate={"status": "CONTINUE", "reason": ""},
        extractedFacts=["fact1"],
        problem={"statement": "test problem", "status": "clear"},
        opportunity={"statement": "test opportunity", "status": "clear"},
        coreSignals={"externalDrivers": ["driver1"], "internalDrivers": ["driver2"], "trigger": "trigger1"},
        projectContextResult="test context",
        whatIfQuestion="What if we could?",
    )
    data = response.model_dump()
    for key in expected_keys:
        assert key in data, f"Missing key: {key}"


def test_decision_gate_statuses():
    """Verify valid decision gate statuses."""
    from main import DecisionGate
    gate_continue = DecisionGate(status="CONTINUE", reason="Problem identified")
    assert gate_continue.status == "CONTINUE"

    gate_clarify = DecisionGate(status="CLARIFICATION_NEEDED", reason="Missing context")
    assert gate_clarify.status == "CLARIFICATION_NEEDED"


def test_problem_opportunity_statuses():
    """Verify valid problem/opportunity statuses."""
    from main import ProblemStatement, OpportunityStatement
    for status in ["clear", "unclear", "missing"]:
        p = ProblemStatement(statement="test", status=status)
        assert p.status == status
        o = OpportunityStatement(statement="test", status=status)
        assert o.status == status
