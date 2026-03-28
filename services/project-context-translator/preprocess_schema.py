"""
Preprocess Output Contract — structured schema for spaCy preprocessing results.

This is the canonical interface between the spaCy helper layer and the
Translator orchestration. The Translator consumes this; the LLM reasoning
request is built from it.

spaCy produces candidate signals and validation hints only.
Final reasoning (Problem, Opportunity, Trigger, Project Context) is the
LLM's responsibility, orchestrated by the Translator.
"""

from pydantic import BaseModel, Field


class Sentence(BaseModel):
    id: str = Field(..., description="Stable sentence identifier, e.g. 's1'")
    text: str = Field(..., description="Original sentence text")


class Entity(BaseModel):
    text: str
    label: str = Field(..., description="spaCy NER label (ORG, DATE, MONEY, etc.)")
    sentenceId: str = Field(..., description="Source sentence ID for evidence tracing")


class QuantSignal(BaseModel):
    text: str = Field(..., description="The quantitative/temporal phrase")
    type: str = Field(..., description="percentage | count | increase | decrease | temporal | duration")
    sentenceId: str


class CandidateClue(BaseModel):
    text: str = Field(..., description="The matched phrase or sentence fragment")
    rule: str = Field(..., description="Rule/pattern that triggered the match")
    sentenceId: str = Field(..., description="Source sentence for evidence tracing")


class CandidateSignals(BaseModel):
    problemClues: list[CandidateClue] = []
    opportunityClues: list[CandidateClue] = []
    externalDrivers: list[CandidateClue] = []
    internalDrivers: list[CandidateClue] = []
    triggerCandidates: list[CandidateClue] = []


class ValidationFlags(BaseModel):
    hasBusinessContext: bool = False
    hasPainSignal: bool = False
    hasOpportunitySignal: bool = False
    hasUrgencySignal: bool = False


class PreprocessOutput(BaseModel):
    """Canonical preprocess output from the spaCy helper layer."""
    schemaVersion: str = "1.0"
    rawText: str = Field(..., description="Original input text, preserved")
    normalizedText: str = Field(..., description="Cleaned/normalized text")
    language: str = "en"
    sentences: list[Sentence] = []
    entities: list[Entity] = []
    keywords: list[str] = []
    quantSignals: list[QuantSignal] = []
    candidateSignals: CandidateSignals = CandidateSignals()
    validationFlags: ValidationFlags = ValidationFlags()
