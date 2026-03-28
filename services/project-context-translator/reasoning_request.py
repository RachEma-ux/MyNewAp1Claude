"""
Model-Agnostic Reasoning Request Builder.

Constructs a structured, vendor-neutral reasoning request that combines:
  - raw user text
  - spaCy preprocess output
  - translator task metadata
  - the Project Context Formula
  - structured-output and clarification requirements

The LLM adapter (in main.py) consumes this neutral request.
No OpenAI-specific or vendor-specific structures leak into this layer.
"""

from __future__ import annotations

from preprocess_schema import PreprocessOutput


FORMULA = "Project Context = External Drivers + Internal Drivers + Trigger"


def build_reasoning_context(
    raw_text: str,
    preprocess: PreprocessOutput,
    metadata: dict | None = None,
) -> str:
    """
    Build a model-agnostic context block that enriches the LLM prompt
    with spaCy preprocessing evidence.

    This is injected into the user message, not the system prompt.
    The system prompt stays unchanged (persona + rules + schema).
    """
    sections: list[str] = []

    sections.append(f"## Raw Input\n\n{raw_text}")

    # Preprocessing evidence summary
    sections.append("## Preprocessing Evidence (spaCy)")

    # Sentences
    if preprocess.sentences:
        sent_lines = [f"  [{s.id}] {s.text}" for s in preprocess.sentences]
        sections.append("### Sentences\n" + "\n".join(sent_lines))

    # Named entities
    if preprocess.entities:
        ent_lines = [f"  - {e.text} ({e.label}) [{e.sentenceId}]" for e in preprocess.entities]
        sections.append("### Named Entities\n" + "\n".join(ent_lines))

    # Keywords
    if preprocess.keywords:
        sections.append(f"### Key Phrases\n  {', '.join(preprocess.keywords[:15])}")

    # Candidate signals
    cs = preprocess.candidateSignals
    signal_parts: list[str] = []
    if cs.problemClues:
        items = [f"  - [{c.sentenceId}] {c.rule}: {c.text[:80]}" for c in cs.problemClues[:5]]
        signal_parts.append("**Problem Clues:**\n" + "\n".join(items))
    if cs.opportunityClues:
        items = [f"  - [{c.sentenceId}] {c.rule}: {c.text[:80]}" for c in cs.opportunityClues[:5]]
        signal_parts.append("**Opportunity Clues:**\n" + "\n".join(items))
    if cs.externalDrivers:
        items = [f"  - [{c.sentenceId}] {c.rule}: {c.text[:80]}" for c in cs.externalDrivers[:5]]
        signal_parts.append("**External Driver Clues:**\n" + "\n".join(items))
    if cs.internalDrivers:
        items = [f"  - [{c.sentenceId}] {c.rule}: {c.text[:80]}" for c in cs.internalDrivers[:5]]
        signal_parts.append("**Internal Driver Clues:**\n" + "\n".join(items))
    if cs.triggerCandidates:
        items = [f"  - [{c.sentenceId}] {c.rule}: {c.text[:80]}" for c in cs.triggerCandidates[:5]]
        signal_parts.append("**Trigger Clues:**\n" + "\n".join(items))
    if signal_parts:
        sections.append("### Candidate Signals\n" + "\n".join(signal_parts))

    # Quantitative cues
    if preprocess.quantSignals:
        q_lines = [f"  - [{q.sentenceId}] {q.type}: {q.text[:80]}" for q in preprocess.quantSignals[:5]]
        sections.append("### Quantitative Cues\n" + "\n".join(q_lines))

    # Validation hints
    vf = preprocess.validationFlags
    hints = []
    if vf.hasBusinessContext:
        hints.append("Business context detected")
    if vf.hasPainSignal:
        hints.append("Pain/problem signals detected")
    if vf.hasOpportunitySignal:
        hints.append("Opportunity signals detected")
    if vf.hasUrgencySignal:
        hints.append("Urgency signals detected")
    if not vf.hasPainSignal and not vf.hasOpportunitySignal:
        hints.append("WARNING: No clear problem or opportunity signals detected — consider CLARIFICATION_NEEDED")
    if hints:
        sections.append("### Validation Hints\n  " + "\n  ".join(hints))

    # Formula reminder
    sections.append(f"## Formula\n{FORMULA}")

    # Metadata
    if metadata:
        sections.append(f"## Metadata\n{metadata}")

    # Instruction
    sections.append(
        "## Task\n"
        "Analyze the raw input using the preprocessing evidence above. "
        "The candidate signals are hints — validate and refine them. "
        "Return the structured JSON response as defined in the system prompt."
    )

    return "\n\n".join(sections)
