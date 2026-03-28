# spaCy Integration — Project Context Translator

## Architecture Boundary

**spaCy is a preprocessing helper ONLY.** It does NOT replace the Project Context Translator agent.

- spaCy extracts candidate signals, entities, keywords, and validation hints
- The LLM reasoning layer makes all final decisions (Problem, Opportunity, Trigger, Project Context)
- spaCy output enriches the LLM prompt — it does not bypass the LLM

## End-to-End Flow

```
Raw Text
  │
  ▼
┌─────────────────────────────┐
│  spaCy Preprocessing        │  ← spacy_preprocess.py
│  (sentences, entities,       │
│   signals, validation)       │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  Reasoning Request Builder   │  ← reasoning_request.py
│  (model-agnostic context     │
│   enriched with evidence)    │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  LLM Reasoning Layer         │  ← main.py (_call_llm)
│  (OpenAI / Anthropic)        │
│  Final judgment + JSON       │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  Grounding Validator         │  ← grounding.py
│  (evidence tracing,          │
│   ungrounded claim flags)    │
└──────────────┬──────────────┘
               │
               ▼
         TranslateResponse
         (+ grounding metadata)
```

## File Map

| File | Purpose |
|---|---|
| `preprocess_schema.py` | Pydantic models for preprocessing output contract |
| `signal_matchers.py` | Rule-based domain signal pattern registries |
| `spacy_preprocess.py` | Core preprocessing: sentences, entities, keywords, signals |
| `reasoning_request.py` | Model-agnostic reasoning context builder |
| `grounding.py` | Post-LLM grounding validator with evidence tracing |
| `main.py` | Orchestrates the full flow (modified to wire spaCy in) |
| `setup_spacy.sh` | Bootstrap script to download spaCy model |

## Setup

```bash
pip install -r requirements.txt
bash setup_spacy.sh   # Downloads en_core_web_sm model
```

If the spaCy model is not installed, the preprocessor falls back to a blank English pipeline with sentencizer (tokenization-only mode).

## Key Design Decisions

1. **Graceful fallback**: If spaCy preprocessing fails, the `/translate` endpoint falls back to raw text without enrichment. The LLM still works.

2. **Non-blocking grounding**: The grounding check is advisory. It produces metadata (score, ungrounded claims) but never blocks or modifies the LLM response.

3. **Model-agnostic context**: The reasoning request builder produces a plain text context block injected into the user message. No vendor-specific structures. Works with any LLM provider.

4. **Extensible signal matchers**: To add new signal patterns, edit the rule dictionaries in `signal_matchers.py`. Each entry is `(rule_label, [lowercase_phrases])`.

## Grounding Metadata

The `TranslateResponse` includes an optional `grounding` field:

```json
{
  "grounding": {
    "overallScore": "strong",
    "ungroundedClaims": [],
    "noteCount": 5,
    "groundedCount": 4
  }
}
```

Scores: `strong` (>=80% grounded), `moderate` (>=50%), `weak` (<50%), `unknown` (no claims checked).

## Testing

```bash
pytest test_spacy_preprocess.py -v   # Unit tests for preprocessing pipeline
pytest test_main.py -v               # Service tests including integration
```
