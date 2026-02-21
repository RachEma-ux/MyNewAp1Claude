# Catalog Entry Types — Definitions

## 1. Provider

A **Provider** is an infrastructure service that exposes AI capabilities through an API.

**It answers:** *Where and how do we access intelligence?*

A provider:
- Hosts models (cloud or local)
- Exposes endpoints (chat, embeddings, tools, etc.)
- Manages authentication
- Applies quotas, billing, and rate limits
- Defines capability boundaries

**Examples:** OpenAI, Anthropic, Mistral AI, Ollama

**In architecture:** Provider = infrastructure access layer
**Dashboard:** configured in `/providers`

---

## 2. LLM (Large Language Model)

An **LLM** is a category of AI system designed to understand and generate human language.

**It answers:** *What type of intelligence is this?*

An LLM:
- Processes natural language
- Generates text
- Performs reasoning in language form
- Follows instructions
- May support multi-modal inputs

**Examples:** GPT-4, Claude, Llama 3

**Conceptually:** LLM = technology class (like "database" or "browser")

---

## 3. Model

A **Model** is a specific trained instance of an AI architecture.

**It answers:** *Which exact trained system are we using?*

A model:
- Has a defined size (e.g., 8B, 70B)
- Has performance characteristics
- Has cost and latency profiles
- May be fine-tuned or specialized
- Is versioned

**Examples:** GPT-4o, Claude 3 Opus, Llama 3 8B

**In dashboard:** Provider → exposes multiple models, Workspace → selects one model
**Model** = concrete trained brain instance

---

## 4. Agent

An **Agent** is a stateful, goal-oriented system built around one or more models.

**It answers:** *What autonomous entity is executing decisions?*

An agent:
- Uses a model as its reasoning engine
- Has memory (short / long term)
- Has tools (APIs, databases, workflows)
- Maintains internal state
- Operates under policies
- Executes multi-step workflows
- Can coordinate with other agents

**Agent includes:**
- Cognitive loop (Sense → Think → Act → Learn)
- Memory cells
- Decision engine
- Policy binding
- Runtime configuration
- Observability

**Agent** = orchestrated intelligent entity

---

## 5. Bot

A **Bot** is a reactive, task-focused automation system typically powered by a model.

**It answers:** *What automated responder handles a specific interaction?*

A bot:
- Performs a narrow task
- Is usually prompt-driven
- Has minimal state
- Executes simple input → output loops
- May wrap a model directly
- Is often channel-specific (Discord, Telegram, web chat)

It is typically:
- Stateless or lightly stateful
- Limited in autonomy
- Single-purpose

**Bot** = lightweight automated responder

---

## Comparison Table

| Layer | Provider | LLM | Model | Agent | Bot |
|---|---|---|---|---|---|
| **Abstraction Level** | Infrastructure | Technology Class | Trained Instance | Intelligent System | Application Layer Automation |
| **Core Question** | Where does it run? | What kind of AI is this? | Which exact version? | Who is acting? | What automation responds? |
| **Owns Models?** | Yes | No | No | Uses them | Uses them |
| **Has Memory?** | No | No | No | Yes | Minimal |
| **Has Tools?** | Exposes capabilities | No | No | Yes | Rarely |
| **Has Goals?** | No | No | No | Yes | Usually fixed task |
| **Statefulness** | No | No | No | Stateful | Mostly stateless |
| **Governance Binding** | Infrastructure level | No | No | Yes | Usually none |
| **Multi-step Planning** | No | No | No | Yes | Limited |
| **Typical Placement** | Backend provider layer | AI category | Version selection layer | Orchestrator entity | UI/Channel wrapper |

---

## Architectural Stack

```
Provider  →  LLM  →  Model  →  Agent or Bot  →  Workflow / Interaction
```

---

## In the Multi-Agent Dashboard Context

| Element | Location |
|---|---|
| **Provider** | configured in `/providers` |
| **LLM** | underlying AI category powering the model |
| **Model** | attached to provider |
| **Agent** | governed, stateful orchestrated entity |
| **Bot** | lightweight interface wrapper (optional profile) |
