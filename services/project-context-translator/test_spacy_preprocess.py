"""
Tests for the spaCy preprocessing pipeline.

Covers: preprocess_schema, signal_matchers, spacy_preprocess,
        reasoning_request, grounding.

Run: pytest test_spacy_preprocess.py -v
"""
import pytest

from preprocess_schema import (
    CandidateClue,
    CandidateSignals,
    Entity,
    PreprocessOutput,
    QuantSignal,
    Sentence,
    ValidationFlags,
)
from signal_matchers import (
    detect_quant_type,
    has_any_phrase,
    match_rules,
    MatchResult,
    PROBLEM_RULES,
    OPPORTUNITY_RULES,
    EXTERNAL_DRIVER_RULES,
    INTERNAL_DRIVER_RULES,
    TRIGGER_RULES,
    URGENCY_PHRASES,
    BUSINESS_CONTEXT_PHRASES,
)
from spacy_preprocess import normalize_text, preprocess
from reasoning_request import build_reasoning_context, FORMULA
from grounding import check_grounding, GroundingNote, GroundingResult


# ── Schema Tests ─────────────────────────────────────────────────────────────


class TestPreprocessSchema:
    def test_sentence_model(self):
        s = Sentence(id="s1", text="Hello world.")
        assert s.id == "s1"
        assert s.text == "Hello world."

    def test_entity_model(self):
        e = Entity(text="Acme Corp", label="ORG", sentenceId="s1")
        assert e.label == "ORG"
        assert e.sentenceId == "s1"

    def test_quant_signal_model(self):
        q = QuantSignal(text="increased by 20%", type="percentage", sentenceId="s2")
        assert q.type == "percentage"

    def test_candidate_clue_model(self):
        c = CandidateClue(text="rising costs", rule="cost_pressure", sentenceId="s1")
        assert c.rule == "cost_pressure"

    def test_candidate_signals_defaults(self):
        cs = CandidateSignals()
        assert cs.problemClues == []
        assert cs.opportunityClues == []
        assert cs.externalDrivers == []
        assert cs.internalDrivers == []
        assert cs.triggerCandidates == []

    def test_validation_flags_defaults(self):
        vf = ValidationFlags()
        assert vf.hasBusinessContext is False
        assert vf.hasPainSignal is False
        assert vf.hasOpportunitySignal is False
        assert vf.hasUrgencySignal is False

    def test_preprocess_output_defaults(self):
        po = PreprocessOutput(rawText="test", normalizedText="test")
        assert po.schemaVersion == "1.0"
        assert po.language == "en"
        assert po.sentences == []
        assert po.entities == []
        assert po.keywords == []

    def test_preprocess_output_full(self):
        po = PreprocessOutput(
            rawText="raw",
            normalizedText="normalized",
            sentences=[Sentence(id="s1", text="sentence one")],
            entities=[Entity(text="Acme", label="ORG", sentenceId="s1")],
            keywords=["keyword1"],
            quantSignals=[QuantSignal(text="20%", type="percentage", sentenceId="s1")],
            candidateSignals=CandidateSignals(
                problemClues=[CandidateClue(text="rising costs", rule="cost_pressure", sentenceId="s1")]
            ),
            validationFlags=ValidationFlags(hasBusinessContext=True, hasPainSignal=True),
        )
        assert len(po.sentences) == 1
        assert len(po.entities) == 1
        assert po.validationFlags.hasPainSignal is True


# ── Signal Matchers Tests ────────────────────────────────────────────────────


class TestSignalMatchers:
    def test_match_rules_finds_problem(self):
        results = match_rules("Our rising costs are unsustainable", "s1", PROBLEM_RULES)
        assert len(results) > 0
        assert any(r.rule == "cost_pressure" for r in results)

    def test_match_rules_finds_delay(self):
        results = match_rules("The project is behind schedule", "s2", PROBLEM_RULES)
        assert any(r.rule == "delay_issues" for r in results)

    def test_match_rules_finds_opportunity(self):
        results = match_rules("There is growing demand for self-service portals", "s3", OPPORTUNITY_RULES)
        assert len(results) > 0
        labels = {r.rule for r in results}
        assert "growth_demand" in labels or "self_service" in labels

    def test_match_rules_finds_external_driver(self):
        results = match_rules("New regulation requires compliance by Q4", "s4", EXTERNAL_DRIVER_RULES)
        assert any(r.rule == "regulatory" for r in results)

    def test_match_rules_finds_internal_driver(self):
        results = match_rules("Our legacy system is at end of life", "s5", INTERNAL_DRIVER_RULES)
        assert any(r.rule == "process_pain" for r in results)

    def test_match_rules_finds_trigger(self):
        results = match_rules("The deadline is end of quarter", "s6", TRIGGER_RULES)
        assert any(r.rule == "deadline" for r in results)

    def test_match_rules_no_match(self):
        results = match_rules("The weather is nice today", "s7", PROBLEM_RULES)
        assert len(results) == 0

    def test_match_rules_one_per_rule(self):
        """Only one match per rule per sentence (first phrase wins)."""
        results = match_rules("Rising costs and cost overrun problems", "s8", PROBLEM_RULES)
        cost_matches = [r for r in results if r.rule == "cost_pressure"]
        assert len(cost_matches) == 1

    def test_has_any_phrase_true(self):
        assert has_any_phrase("this is urgent and critical", URGENCY_PHRASES) is True

    def test_has_any_phrase_false(self):
        assert has_any_phrase("this is a normal day", URGENCY_PHRASES) is False

    def test_has_any_phrase_business_context(self):
        assert has_any_phrase("the customer wants a new product", BUSINESS_CONTEXT_PHRASES) is True

    def test_detect_quant_type_percentage(self):
        assert detect_quant_type("Revenue increased by 20%") == "percentage"

    def test_detect_quant_type_increase(self):
        assert detect_quant_type("Demand has been growing steadily") == "increase"

    def test_detect_quant_type_decrease(self):
        assert detect_quant_type("Sales have experienced a decline") == "decrease"

    def test_detect_quant_type_temporal(self):
        assert detect_quant_type("We plan to launch this quarter") == "temporal"

    def test_detect_quant_type_none(self):
        assert detect_quant_type("The sky is blue") is None


# ── spaCy Preprocess Tests ───────────────────────────────────────────────────


class TestNormalizeText:
    def test_trims_whitespace(self):
        assert normalize_text("  hello world  ") == "hello world"

    def test_collapses_multiple_spaces(self):
        assert normalize_text("hello    world") == "hello world"

    def test_collapses_newlines(self):
        assert normalize_text("hello\n\nworld") == "hello world"

    def test_preserves_single_space(self):
        assert normalize_text("hello world") == "hello world"


class TestPreprocess:
    SAMPLE_TEXT = (
        "Our customer support team is overwhelmed with repetitive inquiries. "
        "Costs are rising and competitors already offer self-service portals. "
        "We need to act before the end of quarter deadline."
    )

    def test_returns_preprocess_output(self):
        result = preprocess(self.SAMPLE_TEXT)
        assert isinstance(result, PreprocessOutput)

    def test_preserves_raw_text(self):
        result = preprocess(self.SAMPLE_TEXT)
        assert result.rawText == self.SAMPLE_TEXT

    def test_normalized_text_not_empty(self):
        result = preprocess(self.SAMPLE_TEXT)
        assert len(result.normalizedText) > 0

    def test_produces_sentences(self):
        result = preprocess(self.SAMPLE_TEXT)
        assert len(result.sentences) >= 2
        assert all(s.id.startswith("s") for s in result.sentences)

    def test_sentence_ids_sequential(self):
        result = preprocess(self.SAMPLE_TEXT)
        ids = [s.id for s in result.sentences]
        expected = [f"s{i + 1}" for i in range(len(ids))]
        assert ids == expected

    def test_detects_problem_clues(self):
        result = preprocess(self.SAMPLE_TEXT)
        assert len(result.candidateSignals.problemClues) > 0

    def test_detects_opportunity_clues(self):
        result = preprocess(self.SAMPLE_TEXT)
        assert len(result.candidateSignals.opportunityClues) > 0

    def test_detects_trigger_candidates(self):
        result = preprocess(self.SAMPLE_TEXT)
        assert len(result.candidateSignals.triggerCandidates) > 0

    def test_detects_external_drivers(self):
        result = preprocess(self.SAMPLE_TEXT)
        assert len(result.candidateSignals.externalDrivers) > 0

    def test_validation_flags_populated(self):
        result = preprocess(self.SAMPLE_TEXT)
        vf = result.validationFlags
        assert vf.hasBusinessContext is True
        assert vf.hasPainSignal is True

    def test_no_signals_for_generic_text(self):
        result = preprocess("The weather is nice today and the sun is shining brightly.")
        assert len(result.candidateSignals.problemClues) == 0
        assert len(result.candidateSignals.opportunityClues) == 0

    def test_quant_signals_detected(self):
        result = preprocess("Revenue decreased by 15% last quarter. We need to act urgently.")
        assert len(result.quantSignals) > 0

    def test_schema_version(self):
        result = preprocess(self.SAMPLE_TEXT)
        assert result.schemaVersion == "1.0"


# ── Reasoning Request Tests ──────────────────────────────────────────────────


class TestReasoningRequest:
    def _make_preprocess(self) -> PreprocessOutput:
        return PreprocessOutput(
            rawText="test input",
            normalizedText="test input",
            sentences=[
                Sentence(id="s1", text="Our costs are rising."),
                Sentence(id="s2", text="The market is shifting."),
            ],
            entities=[Entity(text="Acme Corp", label="ORG", sentenceId="s1")],
            keywords=["costs", "market"],
            quantSignals=[],
            candidateSignals=CandidateSignals(
                problemClues=[
                    CandidateClue(text="Our costs are rising.", rule="cost_pressure", sentenceId="s1")
                ],
                externalDrivers=[
                    CandidateClue(text="The market is shifting.", rule="market_forces", sentenceId="s2")
                ],
            ),
            validationFlags=ValidationFlags(
                hasBusinessContext=True,
                hasPainSignal=True,
            ),
        )

    def test_contains_raw_input(self):
        pp = self._make_preprocess()
        ctx = build_reasoning_context("test input", pp)
        assert "## Raw Input" in ctx
        assert "test input" in ctx

    def test_contains_formula(self):
        pp = self._make_preprocess()
        ctx = build_reasoning_context("test input", pp)
        assert FORMULA in ctx

    def test_contains_sentences(self):
        pp = self._make_preprocess()
        ctx = build_reasoning_context("test input", pp)
        assert "### Sentences" in ctx
        assert "[s1]" in ctx
        assert "[s2]" in ctx

    def test_contains_entities(self):
        pp = self._make_preprocess()
        ctx = build_reasoning_context("test input", pp)
        assert "### Named Entities" in ctx
        assert "Acme Corp" in ctx

    def test_contains_candidate_signals(self):
        pp = self._make_preprocess()
        ctx = build_reasoning_context("test input", pp)
        assert "### Candidate Signals" in ctx
        assert "Problem Clues" in ctx

    def test_contains_validation_hints(self):
        pp = self._make_preprocess()
        ctx = build_reasoning_context("test input", pp)
        assert "### Validation Hints" in ctx
        assert "Pain/problem signals detected" in ctx

    def test_contains_task_instruction(self):
        pp = self._make_preprocess()
        ctx = build_reasoning_context("test input", pp)
        assert "## Task" in ctx

    def test_includes_metadata(self):
        pp = self._make_preprocess()
        ctx = build_reasoning_context("test input", pp, metadata={"source": "test"})
        assert "## Metadata" in ctx

    def test_no_metadata_when_none(self):
        pp = self._make_preprocess()
        ctx = build_reasoning_context("test input", pp, metadata=None)
        assert "## Metadata" not in ctx

    def test_warning_when_no_signals(self):
        pp = PreprocessOutput(
            rawText="test",
            normalizedText="test",
            validationFlags=ValidationFlags(hasPainSignal=False, hasOpportunitySignal=False),
        )
        ctx = build_reasoning_context("test", pp)
        assert "CLARIFICATION_NEEDED" in ctx


# ── Grounding Tests ──────────────────────────────────────────────────────────


class TestGrounding:
    def _make_preprocess(self) -> PreprocessOutput:
        return PreprocessOutput(
            rawText="Our rising costs are a problem. The market is shifting to digital.",
            normalizedText="our rising costs are a problem. the market is shifting to digital.",
            sentences=[
                Sentence(id="s1", text="Our rising costs are a problem."),
                Sentence(id="s2", text="The market is shifting to digital."),
            ],
        )

    def test_grounded_claims(self):
        pp = self._make_preprocess()
        llm_result = {
            "coreSignals": {
                "externalDrivers": ["market shifting to digital"],
                "internalDrivers": ["rising costs problem"],
                "trigger": "",
            },
            "problem": {"statement": "rising costs are a problem"},
            "opportunity": {"statement": ""},
        }
        result = check_grounding(llm_result, pp)
        assert isinstance(result, GroundingResult)
        assert result.overallScore in ("strong", "moderate", "weak", "unknown")
        # Claims with word overlap should be grounded
        grounded_notes = [n for n in result.notes if n.grounded]
        assert len(grounded_notes) > 0

    def test_ungrounded_claims(self):
        pp = self._make_preprocess()
        llm_result = {
            "coreSignals": {
                "externalDrivers": ["quantum computing revolution"],
                "internalDrivers": ["blockchain integration failure"],
                "trigger": "asteroid impact imminent",
            },
            "problem": {"statement": ""},
            "opportunity": {"statement": ""},
        }
        result = check_grounding(llm_result, pp)
        assert len(result.ungroundedClaims) > 0
        assert result.overallScore == "weak"

    def test_empty_claims_unknown_score(self):
        pp = self._make_preprocess()
        llm_result = {
            "coreSignals": {
                "externalDrivers": [],
                "internalDrivers": [],
                "trigger": "",
            },
            "problem": {"statement": ""},
            "opportunity": {"statement": ""},
        }
        result = check_grounding(llm_result, pp)
        assert result.overallScore == "unknown"
        assert len(result.notes) == 0

    def test_mixed_grounding(self):
        pp = self._make_preprocess()
        llm_result = {
            "coreSignals": {
                "externalDrivers": ["market shifting to digital"],
                "internalDrivers": ["quantum entanglement failure"],
                "trigger": "",
            },
            "problem": {"statement": "rising costs are a problem"},
            "opportunity": {"statement": ""},
        }
        result = check_grounding(llm_result, pp)
        assert result.overallScore in ("strong", "moderate")
        assert len(result.notes) >= 2

    def test_grounding_note_structure(self):
        note = GroundingNote(
            field="coreSignals.externalDrivers",
            claim="test claim",
            grounded=True,
            evidence="s1",
            note="",
        )
        assert note.field == "coreSignals.externalDrivers"
        assert note.grounded is True
        assert note.evidence == "s1"
