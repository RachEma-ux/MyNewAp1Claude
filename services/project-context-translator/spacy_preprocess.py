"""
spaCy Preprocessor — internal helper layer for the Project Context Translator.

ARCHITECTURE BOUNDARY:
  - spaCy is a preprocessing helper ONLY
  - It does NOT replace the Project Context Translator agent
  - It does NOT generate final Problem/Opportunity/Trigger/Project Context
  - Those are the LLM's responsibility, orchestrated by the Translator

This module:
  1. Normalizes raw input text
  2. Extracts sentences with stable IDs
  3. Extracts named entities with evidence links
  4. Extracts keywords / key noun phrases
  5. Runs rule-based domain signal matching
  6. Proposes candidate signals (problem, opportunity, drivers, triggers)
  7. Detects quantitative/temporal cues
  8. Produces validation flags (hints, not decisions)

Output: PreprocessOutput (see preprocess_schema.py)
"""

from __future__ import annotations

import logging
import re
from collections import Counter

import spacy
from spacy.language import Language

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
    BUSINESS_CONTEXT_PHRASES,
    EXTERNAL_DRIVER_RULES,
    INTERNAL_DRIVER_RULES,
    OPPORTUNITY_RULES,
    PROBLEM_RULES,
    TRIGGER_RULES,
    URGENCY_PHRASES,
    detect_quant_type,
    has_any_phrase,
    match_rules,
)

logger = logging.getLogger("spacy-preprocess")

# ── spaCy Model Loading ───────────────────────────────────────────────────

_nlp: Language | None = None


def _get_nlp() -> Language:
    """Lazy-load the spaCy model. Falls back gracefully if model not installed."""
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
            logger.info("spaCy model en_core_web_sm loaded successfully")
        except OSError:
            logger.warning(
                "spaCy model en_core_web_sm not found. "
                "Run: python -m spacy download en_core_web_sm"
            )
            # Create a blank English pipeline as fallback (tokenization + sentencizer)
            _nlp = spacy.blank("en")
            _nlp.add_pipe("sentencizer")
            logger.info("Using blank spaCy pipeline with sentencizer (fallback)")
    return _nlp


# ── Text Normalization ────────────────────────────────────────────────────

def normalize_text(raw: str) -> str:
    """Clean raw input text for processing. Preserves meaning."""
    text = raw.strip()
    # Collapse multiple whitespace/newlines into single spaces
    text = re.sub(r"\s+", " ", text)
    return text


# ── Core Preprocessing ────────────────────────────────────────────────────

def preprocess(raw_text: str) -> PreprocessOutput:
    """
    Run the full spaCy preprocessing pipeline on raw input text.

    Returns a structured PreprocessOutput with sentences, entities,
    keywords, candidate signals, quantitative cues, and validation flags.
    """
    nlp = _get_nlp()
    normalized = normalize_text(raw_text)
    doc = nlp(normalized)

    # ── Sentences ──────────────────────────────────────────────────────
    sentences: list[Sentence] = []
    for i, sent in enumerate(doc.sents):
        sentences.append(Sentence(
            id=f"s{i + 1}",
            text=sent.text.strip(),
        ))

    # Build sentence lookup for entity/signal mapping
    def sentence_id_for_char(char_start: int) -> str:
        """Find which sentence ID contains a character offset."""
        cumulative = 0
        for sent in sentences:
            end = cumulative + len(sent.text) + 1  # +1 for space
            if char_start < end:
                return sent.id
            cumulative = end
        return sentences[-1].id if sentences else "s1"

    # ── Named Entities ─────────────────────────────────────────────────
    entities: list[Entity] = []
    for ent in doc.ents:
        sid = sentence_id_for_char(ent.start_char)
        entities.append(Entity(
            text=ent.text,
            label=ent.label_,
            sentenceId=sid,
        ))

    # ── Keywords (top noun chunks by frequency) ────────────────────────
    noun_chunks = [
        chunk.text.lower().strip()
        for chunk in doc.noun_chunks
        if len(chunk.text.strip()) > 2
    ] if doc.has_annotation("DEP") else []

    chunk_counts = Counter(noun_chunks)
    keywords = [word for word, _ in chunk_counts.most_common(20)]

    # ── Quantitative Signals ───────────────────────────────────────────
    quant_signals: list[QuantSignal] = []
    for sent in sentences:
        qtype = detect_quant_type(sent.text)
        if qtype:
            quant_signals.append(QuantSignal(
                text=sent.text,
                type=qtype,
                sentenceId=sent.id,
            ))

    # ── Candidate Signal Matching ──────────────────────────────────────
    problem_clues: list[CandidateClue] = []
    opportunity_clues: list[CandidateClue] = []
    external_drivers: list[CandidateClue] = []
    internal_drivers: list[CandidateClue] = []
    trigger_candidates: list[CandidateClue] = []

    for sent in sentences:
        for m in match_rules(sent.text, sent.id, PROBLEM_RULES):
            problem_clues.append(CandidateClue(text=m.text, rule=m.rule, sentenceId=m.sentenceId))
        for m in match_rules(sent.text, sent.id, OPPORTUNITY_RULES):
            opportunity_clues.append(CandidateClue(text=m.text, rule=m.rule, sentenceId=m.sentenceId))
        for m in match_rules(sent.text, sent.id, EXTERNAL_DRIVER_RULES):
            external_drivers.append(CandidateClue(text=m.text, rule=m.rule, sentenceId=m.sentenceId))
        for m in match_rules(sent.text, sent.id, INTERNAL_DRIVER_RULES):
            internal_drivers.append(CandidateClue(text=m.text, rule=m.rule, sentenceId=m.sentenceId))
        for m in match_rules(sent.text, sent.id, TRIGGER_RULES):
            trigger_candidates.append(CandidateClue(text=m.text, rule=m.rule, sentenceId=m.sentenceId))

    candidate_signals = CandidateSignals(
        problemClues=problem_clues,
        opportunityClues=opportunity_clues,
        externalDrivers=external_drivers,
        internalDrivers=internal_drivers,
        triggerCandidates=trigger_candidates,
    )

    # ── Validation Flags ───────────────────────────────────────────────
    full_lower = normalized.lower()
    validation_flags = ValidationFlags(
        hasBusinessContext=has_any_phrase(full_lower, BUSINESS_CONTEXT_PHRASES),
        hasPainSignal=len(problem_clues) > 0,
        hasOpportunitySignal=len(opportunity_clues) > 0,
        hasUrgencySignal=has_any_phrase(full_lower, URGENCY_PHRASES),
    )

    return PreprocessOutput(
        rawText=raw_text,
        normalizedText=normalized,
        sentences=sentences,
        entities=entities,
        keywords=keywords,
        quantSignals=quant_signals,
        candidateSignals=candidate_signals,
        validationFlags=validation_flags,
    )
