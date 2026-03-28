"""
Grounding Validator — post-LLM-response evidence checking.

After the LLM produces its structured output, this module checks whether
key claims (drivers, trigger, problem, opportunity) have traceable evidence
in the original preprocessed input.

This is a lightweight, pragmatic layer. It does NOT block results.
It produces grounding notes and flags weakly-supported claims.
"""

from __future__ import annotations

from pydantic import BaseModel
from preprocess_schema import PreprocessOutput


class GroundingNote(BaseModel):
    field: str
    claim: str
    grounded: bool
    evidence: str = ""
    note: str = ""


class GroundingResult(BaseModel):
    notes: list[GroundingNote] = []
    ungroundedClaims: list[str] = []
    overallScore: str = "unknown"  # "strong" | "moderate" | "weak" | "unknown"


def check_grounding(
    llm_result: dict,
    preprocess: PreprocessOutput,
) -> GroundingResult:
    """
    Check whether key LLM output claims have evidence in the source text.

    Returns grounding notes, ungrounded claims, and an overall score.
    """
    notes: list[GroundingNote] = []
    lower_raw = preprocess.normalizedText.lower()

    # Collect all sentence texts for evidence search
    sentence_texts = {s.id: s.text.lower() for s in preprocess.sentences}
    all_text = " ".join(sentence_texts.values())

    def has_evidence(claim: str) -> tuple[bool, str]:
        """Check if a claim substring appears in any source sentence."""
        claim_lower = claim.lower().strip()
        if not claim_lower or len(claim_lower) < 4:
            return False, ""
        # Check for significant words from the claim in source
        words = [w for w in claim_lower.split() if len(w) > 3]
        if not words:
            return False, ""
        matched = sum(1 for w in words if w in all_text)
        ratio = matched / len(words) if words else 0
        if ratio >= 0.4:
            # Find the best matching sentence
            best_sid = ""
            best_count = 0
            for sid, stxt in sentence_texts.items():
                count = sum(1 for w in words if w in stxt)
                if count > best_count:
                    best_count = count
                    best_sid = sid
            return True, best_sid
        return False, ""

    # Check external drivers
    core_signals = llm_result.get("coreSignals", {})
    for driver in core_signals.get("externalDrivers", []):
        if not driver:
            continue
        grounded, evidence = has_evidence(driver)
        notes.append(GroundingNote(
            field="coreSignals.externalDrivers",
            claim=driver,
            grounded=grounded,
            evidence=evidence,
            note="" if grounded else "External driver not clearly traceable to source text",
        ))

    # Check internal drivers
    for driver in core_signals.get("internalDrivers", []):
        if not driver:
            continue
        grounded, evidence = has_evidence(driver)
        notes.append(GroundingNote(
            field="coreSignals.internalDrivers",
            claim=driver,
            grounded=grounded,
            evidence=evidence,
            note="" if grounded else "Internal driver not clearly traceable to source text",
        ))

    # Check trigger
    trigger = core_signals.get("trigger", "")
    if trigger:
        grounded, evidence = has_evidence(trigger)
        notes.append(GroundingNote(
            field="coreSignals.trigger",
            claim=trigger,
            grounded=grounded,
            evidence=evidence,
            note="" if grounded else "Trigger not clearly traceable to source text",
        ))

    # Check problem statement
    problem = llm_result.get("problem", {})
    problem_stmt = problem.get("statement", "")
    if problem_stmt:
        grounded, evidence = has_evidence(problem_stmt)
        notes.append(GroundingNote(
            field="problem.statement",
            claim=problem_stmt,
            grounded=grounded,
            evidence=evidence,
            note="" if grounded else "Problem statement may contain inferred content",
        ))

    # Check opportunity statement
    opportunity = llm_result.get("opportunity", {})
    opp_stmt = opportunity.get("statement", "")
    if opp_stmt:
        grounded, evidence = has_evidence(opp_stmt)
        notes.append(GroundingNote(
            field="opportunity.statement",
            claim=opp_stmt,
            grounded=grounded,
            evidence=evidence,
            note="" if grounded else "Opportunity statement may contain inferred content",
        ))

    # Calculate overall score
    ungrounded = [n.claim for n in notes if not n.grounded]
    total = len(notes)
    grounded_count = total - len(ungrounded)

    if total == 0:
        score = "unknown"
    elif grounded_count / total >= 0.8:
        score = "strong"
    elif grounded_count / total >= 0.5:
        score = "moderate"
    else:
        score = "weak"

    return GroundingResult(
        notes=notes,
        ungroundedClaims=ungrounded,
        overallScore=score,
    )
