/**
 * Catalog Taxonomy — Single source of truth for entry type classification.
 * Imported by both server (validation) and client (form dropdowns).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  1. FILE CONCEPT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  Comments = design spec for humans.
 *  DB = runtime truth for code.
 *  Clean separation. No duplication of purpose.
 *
 *  Rules:
 *    - Comments = spec. DB = runtime. Don't mix them.
 *    - Every type is multi-dimensional. Don't flatten it.
 *    - The schema is 4 tables. Don't invent your own.
 *    - Versioning is soft. Don't over-engineer it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  2. THE NATURAL WAY OF DOING THINGS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  Every type in the taxonomy is multi-dimensional, not just Agent.
 *
 *  Provider isn't just "cloud API" — it has:
 *    - Hosting model (cloud, on-prem, hybrid, edge)
 *    - Auth architecture (OAuth, API key, mTLS, IAM)
 *    - Compliance profile (SOC2, HIPAA, ISO, none)
 *    - Pricing model (pay-per-token, subscription, free, custom)
 *    - Geographic scope (single-region, multi-region, global)
 *    - SLA tier (enterprise, standard, best-effort)
 *
 *  LLM isn't just "transformer" — it has:
 *    - Architecture family (transformer, diffusion, mixture-of-experts, etc.)
 *    - Modality (text, vision, multimodal, audio, code)
 *    - Training approach (pre-trained, fine-tuned, RLHF, distilled)
 *    - License (open-source, commercial, research-only)
 *    - Size class (small, medium, large, frontier)
 *
 *  Model isn't just a version number — it has:
 *    - Quantization (fp32, fp16, int8, int4, GGUF)
 *    - Deployment target (GPU, CPU, edge, serverless)
 *    - Promotion state (sandbox, governed, production)
 *    - Benchmark profile (reasoning, coding, creative, factual)
 *    - Cost tier (free, low, medium, high)
 *
 *  Bot isn't just a channel — it has:
 *    - Interface type (web chat, messaging, voice, API, embedded)
 *    - State management (stateless, session, persistent)
 *    - Interaction pattern (Q&A, task-oriented, open-ended)
 *    - User scope (internal, customer-facing, public)
 *    - Governance binding (none, inherited, explicit)
 *
 *  Same pattern: each type has orthogonal axes, each axis has
 *  sub-categories and classes, and a single dropdown chain can't
 *  capture the full identity.
 *
 *  The DB schema generalizes cleanly:
 *    - taxonomy_axes — axis per type (not just agent)
 *    - taxonomy_subcategories — grouped under axes
 *    - taxonomy_classes — leaf values
 *    - taxonomy_inference_rules — cross-axis suggestions
 *
 *  One generic <MultiAxisPanel type={entryType}> component renders
 *  the right axes for any type. The wizard becomes type-agnostic.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  3.1 THE CONCEPT LIMIT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  Versioning — if the ontology evolves (new classes, renamed
 *  sub-categories, deprecated axes), existing agents reference old
 *  values. Two options:
 *
 *    - Soft approach: classes have an active boolean. Deprecated
 *      classes stay readable but aren't shown in the wizard dropdown.
 *
 *    - Strict approach: taxonomy version column. Each agent records
 *      which ontology version it was classified against.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  3.2 THE CHOSEN SOLUTION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  We will go soft approach for now — simpler, and the ontology is
 *  unlikely to change drastically once seeded.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE FIVE FUNDAMENTALLY DIFFERENT ENTITIES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  Type      │ What It Is                                              │ Ontological Level
 *  ──────────┼─────────────────────────────────────────────────────────┼──────────────────
 *  Provider  │ An infrastructure service that hosts and serves models  │ Infrastructure
 *            │ via APIs, managing authentication, quotas, billing,     │ layer
 *            │ and execution environments                              │
 *  ──────────┼─────────────────────────────────────────────────────────┼──────────────────
 *  LLM       │ A large language model architecture — a neural network │ Model
 *            │ design specialized for language understanding and       │ layer
 *            │ generation                                              │
 *  ──────────┼─────────────────────────────────────────────────────────┼──────────────────
 *  Model     │ A trained computational function (architecture +       │ Inference
 *            │ learned weights) that performs inference                │ layer
 *  ──────────┼─────────────────────────────────────────────────────────┼──────────────────
 *  Agent     │ A goal-directed decision system that selects actions   │ Control
 *            │ based on objectives, state, memory, and environment    │ layer
 *  ──────────┼─────────────────────────────────────────────────────────┼──────────────────
 *  Bot       │ A deployed, often user-facing application instance     │ Application
 *            │ that exposes capabilities through an interface         │ layer
 *  ──────────┴─────────────────────────────────────────────────────────┴──────────────────
 *
 *  These entities operate at different abstraction layers and are NOT interchangeable.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  CLEAN COMPARISON TABLE
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Layer               │ Provider              │ LLM                 │ Model                  │ Agent                 │ Bot
 *  ────────────────────┼───────────────────────┼─────────────────────┼────────────────────────┼───────────────────────┼────────────────────────
 *  Abstraction Level   │ Infrastructure        │ Technology Class    │ Trained Instance       │ Intelligent System    │ App Layer Automation
 *  Core Question       │ Where does it run?    │ What kind of AI?    │ Which exact version?   │ Who is acting?        │ What automation responds?
 *  Owns Models?        │ Yes                   │ No                  │ No                     │ Uses them             │ Uses them
 *  Has Memory?         │ No                    │ No                  │ No                     │ Yes                   │ Minimal
 *  Has Tools?          │ Exposes capabilities  │ No                  │ No                     │ Yes                   │ Rarely
 *  Has Goals?          │ No                    │ No                  │ No                     │ Yes                   │ Usually fixed task
 *  Statefulness        │ No                    │ No                  │ No                     │ Stateful              │ Mostly stateless
 *  Governance Binding  │ Infrastructure level  │ No                  │ No                     │ Yes                   │ Usually none
 *  Multi-step Planning │ No                    │ No                  │ No                     │ Yes                   │ Limited
 *  Typical Placement   │ Backend provider layer│ AI category         │ Version selection layer│ Orchestrator entity   │ UI/Channel wrapper
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  AI PLATFORM COMPLIANCE DESIGN MATRIX
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  FORMAL AI PLATFORM COMPLIANCE DESIGN MATRIX
 *
 *  This document defines governance and control requirements across the full
 *  AI system stack:  Provider → LLM → Model → Agent → Bot
 *  It is structured for audit-grade environments (SOC2 / ISO-aligned design).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  1. Provider Layer — Infrastructure Governance
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Dimension              │ Specification
 *  ───────────────────────┼────────────────────────────────────────────────────
 *  Layer                  │ Provider
 *  Governance Scope       │ External AI infrastructure access and capability
 *                         │ exposure
 *  Control Objectives     │ Ensure secure, authenticated, rate-limited, and
 *                         │ policy-compliant model access
 *  Mandatory Controls     │ API authentication (key vault / secret manager),
 *                         │ rate limiting, quota enforcement, provider
 *                         │ capability registry, TLS enforcement, regional
 *                         │ compliance validation
 *  Change Management      │ Provider onboarding workflow with approval gate
 *  Observability          │ Health checks (/health), model registry sync
 *                         │ (/models), capability audit logs
 *  Risk Category          │ Data exfiltration, credential leakage, vendor
 *                         │ dependency risk
 *  Required Evidence      │ Secret rotation logs, provider configuration
 *                         │ registry snapshot, access audit logs
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  2. LLM Layer — Architectural Compliance
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Dimension              │ Specification
 *  ───────────────────────┼────────────────────────────────────────────────────
 *  Layer                  │ LLM
 *  Governance Scope       │ Model class validation & capability classification
 *  Control Objectives     │ Ensure architecture type matches approved risk
 *                         │ profile
 *  Mandatory Controls     │ Architecture classification registry (LLM vs
 *                         │ multimodal vs embedding), allowed-use mapping,
 *                         │ content policy binding
 *  Capability Registry    │ Text generation, reasoning, tool-use, vision,
 *                         │ embeddings
 *  Risk Category          │ Hallucination risk, misuse capability exposure
 *  Required Evidence      │ Approved architecture whitelist, documented model
 *                         │ capability sheet
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  3. Model Layer — Inference Compliance
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Dimension              │ Specification
 *  ───────────────────────┼────────────────────────────────────────────────────
 *  Layer                  │ Model
 *  Governance Scope       │ Specific trained model version governance
 *  Control Objectives     │ Ensure only approved model versions are routed
 *                         │ in production
 *  Mandatory Controls     │ Model version registry, cost/latency profile
 *                         │ registry, promotion state (Sandbox → Governed →
 *                         │ Production), deprecation flags
 *  Evaluation Reqs        │ Benchmark validation, bias evaluation, performance
 *                         │ baseline
 *  Risk Category          │ Drift, regression, cost explosion
 *  Required Evidence      │ Model evaluation reports, promotion approval
 *                         │ record, runtime usage logs
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  4. Agent Layer — Autonomous System Governance
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Dimension              │ Specification
 *  ───────────────────────┼────────────────────────────────────────────────────
 *  Layer                  │ Agent
 *  Governance Scope       │ Decision-making system behavior
 *  Control Objectives     │ Ensure goal-bound, policy-bound, auditable
 *                         │ autonomous execution
 *  Mandatory Controls     │ Cognitive loop definition (Sense → Think → Act →
 *                         │ Learn), policy binding, memory control, tool
 *                         │ access scope, runtime attestation
 *  Autonomy Class         │ Reactive / Human-in-the-Loop / Autonomous /
 *                         │ Self-Evolving
 *  Org Structure          │ Single / Multi-Agent / Hierarchical / Federated
 *  Decision Paradigm      │ Deterministic / Probabilistic / Risk-sensitive /
 *                         │ Game-theoretic
 *  Learning Paradigm      │ Supervised / Reinforcement / Meta / Continual
 *  Governance Reqs        │ Audit logging, explainability layer, approval
 *                         │ gates, rollback capability
 *  Risk Category          │ Unbounded autonomy, unsafe tool execution, policy
 *                         │ violation
 *  Required Evidence      │ Agent config snapshot, policy binding manifest,
 *                         │ runtime logs, decision trace logs
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  5. Bot Layer — Application & Interaction Compliance
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Dimension              │ Specification
 *  ───────────────────────┼────────────────────────────────────────────────────
 *  Layer                  │ Bot
 *  Governance Scope       │ User-facing automation behavior
 *  Control Objectives     │ Ensure predictable, scoped, interaction-safe
 *                         │ automation
 *  Mandatory Controls     │ Channel binding (web, messaging, API), prompt
 *                         │ scope validation, rate limits, user input
 *                         │ sanitation
 *  State Management       │ Stateless or limited session state
 *  Governance Binding     │ Inherits agent-level policy constraints
 *  Risk Category          │ Prompt injection, channel abuse, spam misuse
 *  Required Evidence      │ Interaction logs, channel config, rate-limit
 *                         │ records
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  Cross-Layer Governance Controls (Applies to All Layers)
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Control Category       │ Required Mechanism
 *  ───────────────────────┼────────────────────────────────────────────────────
 *  Identity & Access      │ Role-Based Access Control (RBAC)
 *  Secret Management      │ Encrypted secret store with rotation
 *  Policy Enforcement     │ Centralized policy engine with constraint binding
 *  Auditability           │ Immutable structured logs
 *  Observability          │ Health endpoints, telemetry, metrics
 *  Change Management      │ Promotion workflow with approval gates
 *  Security               │ Sandbox execution for tool access
 *  Privacy                │ Data retention policies, PII masking
 *  Alignment              │ Allowed-use policy registry
 *  Drift Detection        │ Runtime anomaly detection
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  Compliance Hierarchy Summary
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Infrastructure Risk  →  Provider
 *  Architecture Risk    →  LLM
 *  Inference Risk       →  Model
 *  Autonomy Risk        →  Agent
 *  Interaction Risk     →  Bot
 *
 *  Each successive layer introduces:
 *    - Greater behavioral complexity
 *    - Higher governance requirements
 *    - Broader audit scope
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  Governance Principles
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  The control plane must enforce:
 *    - Layer isolation
 *    - Explicit promotion gates
 *    - Policy-bound execution
 *    - Observable runtime behavior
 *    - Reversible deployments
 *
 *  This matrix ensures structural separation between:
 *    - Infrastructure Compliance
 *    - Model Governance
 *    - Autonomous Decision Control
 *    - User-Facing Interaction Safety
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  CLEAN UNIFIED AGENT ONTOLOGY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  Three-Dropdown Filtering System
 *  (Type = Agent → Category → Sub-Category → Class)
 *
 *  Type: Agent
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  1. Cognitive Architecture
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Sub-Category               │ Classes
 *  ───────────────────────────┼────────────────────────────────────────────────
 *  Reactive Systems           │ Simple Reflex, Rule-Based, Heuristic
 *  State-Based Systems        │ Model-Based Reflex, Bayesian
 *  Deliberative Systems       │ Goal-Based, Planning, Search-Based,
 *                             │ Constraint-Satisfaction, Logic-Based
 *  Decision-Theoretic         │ Utility-Based, Game-Theoretic
 *  Learning-Centric           │ Reinforcement-Based Architecture,
 *                             │ Model-Based RL Architecture
 *  Advanced Cognitive         │ Neuro-Symbolic, Generative Architecture,
 *                             │ LLM-Based Architecture, Meta-Reasoning
 *                             │ Architecture, Self-Reflective Architecture,
 *                             │ Theory-of-Mind Architecture
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  2. Functional Role
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Sub-Category               │ Classes
 *  ───────────────────────────┼────────────────────────────────────────────────
 *  Interface Roles            │ Conversational, Advisory, Recommendation,
 *                             │ Decision Support
 *  Expert Roles               │ Specialist, Data Analysis, Code Generation,
 *                             │ Research, Evaluation
 *  Execution Roles            │ Task Executor, Workflow Executor, Testing
 *                             │ Agent, Monitoring Agent
 *  Coordination Roles         │ Orchestrator, Coordination Agent,
 *                             │ Optimization Agent
 *  Governance Roles           │ Compliance Agent, Security Agent, Audit Agent
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  3. Organizational Structure
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Sub-Category               │ Classes
 *  ───────────────────────────┼────────────────────────────────────────────────
 *  Single-Unit                │ Single-Agent
 *  Distributed                │ Multi-Agent System (MAS), Peer-to-Peer, Swarm
 *  Centralized                │ Centralized Coordination, Hierarchical
 *  Hybrid                     │ Hybrid, Federated System
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  4. Autonomy Level
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Sub-Category               │ Classes
 *  ───────────────────────────┼────────────────────────────────────────────────
 *  Reactive Autonomy          │ Reactive
 *  Assisted                   │ Human-in-the-Loop, Semi-Autonomous
 *  Independent                │ Fully Autonomous, Self-Governing
 *  Self-Evolving              │ Self-Improving, Self-Replicating
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  5. Embodiment
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Sub-Category               │ Classes
 *  ───────────────────────────┼────────────────────────────────────────────────
 *  Software                   │ Software Agent, Virtual Agent
 *  Cyber-Physical             │ Cyber-Physical Agent, IoT Agent
 *  Physical                   │ Robotic Agent, Mobile Physical Agent
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  6. Learning Paradigm
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Sub-Category               │ Classes
 *  ───────────────────────────┼────────────────────────────────────────────────
 *  Supervised                 │ Supervised Learning
 *  Unsupervised               │ Unsupervised Learning, Self-Supervised Learning
 *  Reinforcement              │ Reinforcement Learning, Policy-Based RL,
 *                             │ Value-Based RL, Actor-Critic, Model-Free RL,
 *                             │ Model-Based RL
 *  Online & Continual         │ Online Learning, Continual Learning
 *  Transfer & Distributed     │ Transfer Learning, Federated Learning
 *  Evolutionary & Meta        │ Evolutionary Learning, Meta-Learning
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  7. Decision Paradigm
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Sub-Category               │ Classes
 *  ───────────────────────────┼────────────────────────────────────────────────
 *  Deterministic              │ Deterministic Decision
 *  Probabilistic              │ Stochastic Decision, Probabilistic Inference
 *  Risk & Economic            │ Risk-Sensitive Decision, Market-Based Decision
 *  Strategic                  │ Adversarial, Cooperative, Competitive,
 *                             │ Nash-Equilibrium
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  8. Governance & Safety
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Sub-Category               │ Classes
 *  ───────────────────────────┼────────────────────────────────────────────────
 *  Policy Control             │ Policy-Constrained, Compliance-Enforcing
 *  Alignment                  │ Alignment-Constrained, Fairness-Aware
 *  Transparency               │ Auditable, Explainable
 *  Security                   │ Secure, Privacy-Preserving, Sandbox-Limited
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  9. Cognitive Capability
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Sub-Category               │ Classes
 *  ───────────────────────────┼────────────────────────────────────────────────
 *  Minimal                    │ Stateless
 *  Contextual                 │ Stateful, Context-Aware
 *  World Modeling             │ World-Modeling, Self-Modeling
 *  Higher-Order               │ Reflective, Meta-Cognitive, Theory-of-Mind,
 *                             │ Creative Generative
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  Structural Guarantees
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  - Type is fixed to Agent
 *  - Each Class belongs to exactly one Sub-Category
 *  - Each Sub-Category belongs to exactly one Category
 *  - No duplication across axes
 *  - No conceptual overlap
 *  - Suitable for compliance matrix construction
 *  - Suitable for schema validation (JSON/Zod/OpenAPI)
 *  - Fully enumerable and machine-usable
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  MULTI-AXIS AGENT CLASSIFICATION MODEL
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  Why a Vertical Multi-Axis Classification Panel Is the Correct UI
 *  Architecture
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  Core Principle
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  An agent is not defined by a single characteristic.
 *  It is defined across multiple independent dimensions:
 *
 *    - How it reasons           → Cognitive Architecture
 *    - What role it performs    → Functional Role
 *    - How it is organized     → Organizational Structure
 *    - How autonomous it is    → Autonomy Level
 *    - Where it exists         → Embodiment
 *    - How it learns           → Learning Paradigm
 *    - How it decides          → Decision Paradigm
 *    - What constraints govern → Governance & Safety
 *    - How deep its cognition  → Cognitive Capability
 *
 *  Each of these is an independent axis.
 *  Together, they form the complete semantic identity of an agent.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  The Problem to Solve
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  Real-world agents are multi-dimensional systems.
 *  A single descriptive path cannot accurately model:
 *
 *    - A conversational LLM-based system
 *    - That operates in a multi-agent structure
 *    - With human oversight
 *    - Running purely in software
 *    - Using reinforcement learning
 *    - Making probabilistic decisions
 *    - Under strict compliance controls
 *    - With contextual awareness
 *
 *  These are orthogonal properties. They must coexist.
 *  They must be selectable independently.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  Why a Vertical Multi-Axis Classification Panel Is the Solution
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  1. It Mirrors the Ontology Structure
 *     ─────────────────────────────────
 *     The ontology itself is organized into independent axes.
 *     A vertical panel directly represents that structure:
 *       - One section per axis
 *       - No conceptual mixing
 *       - No hierarchy confusion
 *       - No artificial constraints
 *     The UI becomes a direct reflection of the ontology.
 *
 *  2. It Preserves Conceptual Purity
 *     ──────────────────────────────
 *     Each axis remains:
 *       - Internally structured
 *       - Mutually exclusive within itself
 *       - Isolated from other axes
 *     This prevents:
 *       - Architecture leaking into governance
 *       - Learning paradigms mixing with decision theory
 *       - Organizational structure conflicting with autonomy
 *     Each dimension stays clean.
 *
 *  3. It Enables Complete Agent Modeling
 *     ─────────────────────────────────
 *     A vertical axis panel allows:
 *       - Full multi-dimensional tagging
 *       - Accurate semantic identity
 *       - Enterprise-grade specification
 *     An agent is no longer partially described. It is fully classified.
 *     This is critical for:
 *       - Compliance matrices
 *       - Governance enforcement
 *       - Policy gating
 *       - Capability validation
 *       - Audit traceability
 *
 *  4. It Supports Deterministic Validation
 *     ────────────────────────────────────
 *     Because each axis is independent:
 *       - Exactly one selection per axis can be enforced (strict mode)
 *       - Controlled multi-selection can be allowed where logically valid
 *       - Contradictory configurations can be blocked
 *     Validation becomes structured and predictable.
 *     This is essential for:
 *       - Schema validation
 *       - Orchestrator enforcement
 *       - Policy engines
 *       - Promotion gates
 *
 *  5. It Scales Without Breaking
 *     ─────────────────────────
 *     Future additions can be handled safely:
 *       - New classes can be added inside an axis
 *       - New sub-categories can be inserted
 *       - Entire new axes can be introduced if required
 *     The vertical structure scales horizontally across dimensions,
 *     not vertically into complexity.
 *     This keeps the system extensible without becoming chaotic.
 *
 *  6. It Improves Cognitive Clarity for Users
 *     ──────────────────────────────────────
 *     From a UX perspective:
 *       - Each section is mentally scoped
 *       - Users focus on one dimension at a time
 *       - The structure is predictable
 *       - The model feels structured and intentional
 *     It reduces ambiguity and improves decision quality.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  Architectural Benefits
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  A vertical multi-axis classification panel ensures:
 *    - Ontological integrity
 *    - Multi-dimensional accuracy
 *    - Strict separation of concerns
 *    - Compliance readiness
 *    - Governance alignment
 *    - Schema-friendly design
 *    - Enterprise scalability
 *
 *  It transforms classification from a linear choice into a structured
 *  identity model.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *  Final Position
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *  The vertical multi-axis classification panel is not a UI preference.
 *  It is a structural necessity.
 *
 *  It aligns:
 *    - The ontology
 *    - The validation model
 *    - The governance framework
 *    - The compliance matrix
 *    - The orchestrator logic
 *
 *  And most importantly — it allows agents to be modeled as what they
 *  truly are: multi-dimensional intelligent systems.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │                    ARCHITECTURAL STACK                                  │
 * │                                                                         │
 * │    Provider  →  LLM  →  Model  →  Agent or Bot  →  Workflow             │
 * │                                                                         │
 * │  Entity       │ Ontological Level │ Core Question                       │
 * │  ────────────-┼───────────────────┼──────────────────────────────────── │
 * │  Provider     │ Infrastructure    │ Where does it run?                  │
 * │  LLM          │ Model             │ What kind of AI is this?            │
 * │  Model        │ Inference         │ Which exact version / weights?      │
 * │  Agent        │ Control           │ Who is acting and deciding?         │
 * │  Bot          │ Application       │ What interface responds to users?   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ============================================================================
// Types
// ============================================================================

/** The five entry types in the catalog */
export type EntryType = "provider" | "llm" | "model" | "agent" | "bot";

export const ENTRY_TYPES: readonly EntryType[] = ["provider", "llm", "model", "agent", "bot"] as const;

export interface EntryTypeDef {
  label: string;
  abstractionLevel: string;
  coreQuestion: string;
  description: string;
  ownsModels: boolean;
  hasMemory: boolean;
  hasTools: boolean;
  hasGoals: boolean;
  stateful: boolean;
}

export interface CategoryDef {
  label: string;
  description: string;
  subCategories?: Record<string, string>; // value → label
}

export interface CapabilityDef {
  label: string;
  group: "functional" | "operational" | "governance" | "meta";
  appliesTo: EntryType[];
}

// ============================================================================
// Entry Type Definitions
// ============================================================================

/**
 * 1️⃣ PROVIDER
 *
 * A Provider is an infrastructure service that exposes AI capabilities
 * through an API.
 *
 * It answers: "Where and how do we access intelligence?"
 *
 * A provider:
 *  - Hosts models (cloud or local)
 *  - Exposes endpoints (chat, embeddings, tools, etc.)
 *  - Manages authentication
 *  - Applies quotas, billing, and rate limits
 *  - Defines capability boundaries
 *
 * Examples: OpenAI, Anthropic, Mistral AI, Ollama
 *
 * In architecture: Provider = infrastructure access layer
 * Dashboard: configured in /providers
 */

/**
 * 2️⃣ LLM (Large Language Model)
 *
 * An LLM is a category of AI system designed to understand and generate
 * human language.
 *
 * It answers: "What type of intelligence is this?"
 *
 * An LLM:
 *  - Processes natural language
 *  - Generates text
 *  - Performs reasoning in language form
 *  - Follows instructions
 *  - May support multi-modal inputs
 *
 * Examples: GPT-4, Claude, Llama 3
 *
 * Conceptually: LLM = technology class (like "database" or "browser")
 */

/**
 * 3️⃣ MODEL
 *
 * A Model is a specific trained instance of an AI architecture.
 *
 * It answers: "Which exact trained system are we using?"
 *
 * A model:
 *  - Has a defined size (e.g., 8B, 70B)
 *  - Has performance characteristics
 *  - Has cost and latency profiles
 *  - May be fine-tuned or specialized
 *  - Is versioned
 *
 * Examples: GPT-4o, Claude 3 Opus, Llama 3 8B
 *
 * In dashboard: Provider → exposes multiple models, Workspace → selects one
 * Model = concrete trained brain instance
 */

/**
 * 4️⃣ AGENT
 *
 * An Agent is a stateful, goal-oriented system built around one or more models.
 *
 * It answers: "What autonomous entity is executing decisions?"
 *
 * An agent:
 *  - Uses a model as its reasoning engine
 *  - Has memory (short / long term)
 *  - Has tools (APIs, databases, workflows)
 *  - Maintains internal state
 *  - Operates under policies
 *  - Executes multi-step workflows
 *  - Can coordinate with other agents
 *
 * Agent includes:
 *  - Cognitive loop (Sense → Think → Act → Learn)
 *  - Memory cells
 *  - Decision engine
 *  - Policy binding
 *  - Runtime configuration
 *  - Observability
 *
 * Agent = orchestrated intelligent entity
 */

/**
 * 5️⃣ BOT
 *
 * A Bot is a reactive, task-focused automation system typically powered
 * by a model.
 *
 * It answers: "What automated responder handles a specific interaction?"
 *
 * A bot:
 *  - Performs a narrow task
 *  - Is usually prompt-driven
 *  - Has minimal state
 *  - Executes simple input → output loops
 *  - May wrap a model directly
 *  - Is often channel-specific (Discord, Telegram, web chat)
 *
 * It is typically:
 *  - Stateless or lightly stateful
 *  - Limited in autonomy
 *  - Single-purpose
 *
 * Bot = lightweight automated responder
 */

export const ENTRY_TYPE_DEFS: Record<EntryType, EntryTypeDef> = {
  provider: {
    label: "Provider",
    abstractionLevel: "Infrastructure",
    coreQuestion: "Where does it run?",
    description: "Infrastructure service exposing AI capabilities through an API",
    ownsModels: true,
    hasMemory: false,
    hasTools: false,
    hasGoals: false,
    stateful: false,
  },
  llm: {
    label: "LLM",
    abstractionLevel: "Technology Class",
    coreQuestion: "What kind of AI is this?",
    description: "Category of AI system designed to understand and generate human language",
    ownsModels: false,
    hasMemory: false,
    hasTools: false,
    hasGoals: false,
    stateful: false,
  },
  model: {
    label: "Model",
    abstractionLevel: "Trained Instance",
    coreQuestion: "Which exact version?",
    description: "Specific trained instance of an AI architecture",
    ownsModels: false,
    hasMemory: false,
    hasTools: false,
    hasGoals: false,
    stateful: false,
  },
  agent: {
    label: "Agent",
    abstractionLevel: "Intelligent System",
    coreQuestion: "Who is acting?",
    description: "Stateful, goal-oriented system built around one or more models",
    ownsModels: false,
    hasMemory: true,
    hasTools: true,
    hasGoals: true,
    stateful: true,
  },
  bot: {
    label: "Bot",
    abstractionLevel: "Application Layer",
    coreQuestion: "What automation responds?",
    description: "Reactive, task-focused automation system typically powered by a model",
    ownsModels: false,
    hasMemory: false,
    hasTools: false,
    hasGoals: false,
    stateful: false,
  },
};

// ============================================================================
// Provider Categories
// ============================================================================

/**
 * Provider categories — classifies the infrastructure access layer.
 * Provider = where and how do we access intelligence?
 */
export const PROVIDER_CATEGORIES: Record<string, CategoryDef> = {
  cloud_api: {
    label: "Cloud API",
    description: "Hosted SaaS providers (OpenAI, Anthropic, Azure, Bedrock)",
    subCategories: {
      official_saas: "Official SaaS",
      enterprise_managed: "Enterprise Managed",
    },
  },
  local_runtime: {
    label: "Local Runtime",
    description: "Self-hosted inference (Ollama, vLLM, llama.cpp)",
    subCategories: {
      single_node: "Single Node",
      self_hosted_cluster: "Self-Hosted Cluster",
    },
  },
  custom_adapter: {
    label: "Custom Adapter",
    description: "Custom gateways and smart routers",
    subCategories: {
      http_adapter: "HTTP Adapter",
      multi_provider_router: "Multi-Provider Router",
    },
  },
  edge_runtime: {
    label: "Edge Runtime",
    description: "Cloudflare Workers AI, Fastly edge inference",
  },
  air_gapped: {
    label: "Air-Gapped",
    description: "Offline / regulated environments",
  },
  mock: {
    label: "Mock",
    description: "Simulation, testing, and CI stubs",
  },
  archived: {
    label: "Archived",
    description: "Deprecated provider, historical reference only",
  },
};

// ============================================================================
// LLM Categories
// ============================================================================

/**
 * LLM categories — classifies the technology class.
 * LLM = what type of intelligence is this?
 */
export const LLM_CATEGORIES: Record<string, CategoryDef> = {
  general_purpose: {
    label: "General Purpose",
    description: "Broad-capability language models for diverse tasks",
    subCategories: {
      instruction_following: "Instruction Following",
      conversational: "Conversational",
      reasoning: "Reasoning",
    },
  },
  code: {
    label: "Code",
    description: "Language models specialized for code generation and understanding",
    subCategories: {
      code_generation: "Code Generation",
      code_review: "Code Review",
      code_completion: "Code Completion",
    },
  },
  multimodal: {
    label: "Multimodal",
    description: "Models handling text + vision, audio, or other modalities",
    subCategories: {
      vision_language: "Vision-Language",
      audio_language: "Audio-Language",
      omni: "Omni-Modal",
    },
  },
  domain_specific: {
    label: "Domain Specific",
    description: "LLMs trained for a specific vertical (medical, legal, finance)",
    subCategories: {
      medical: "Medical",
      legal: "Legal",
      financial: "Financial",
      scientific: "Scientific",
    },
  },
  small_language: {
    label: "Small Language Model",
    description: "Lightweight LLMs for edge / mobile / embedded use",
    subCategories: {
      edge: "Edge",
      mobile: "Mobile",
      embedded: "Embedded",
    },
  },
};

// ============================================================================
// Model Categories
// ============================================================================

/**
 * Model categories — classifies the concrete trained instance.
 * Model = which exact trained system are we using?
 */
export const MODEL_CATEGORIES: Record<string, CategoryDef> = {
  base_llm: {
    label: "Base LLM",
    description: "Foundation language models",
    subCategories: {
      text_only: "Text Only",
      multimodal: "Multimodal",
      code_optimized: "Code Optimized",
      reasoning: "Reasoning",
    },
  },
  embedding: {
    label: "Embedding",
    description: "Embedding / vector models",
    subCategories: {
      text_embedding: "Text Embedding",
      multimodal_embedding: "Multimodal Embedding",
      retrieval_optimized: "Retrieval Optimized",
    },
  },
  speech: {
    label: "Speech",
    description: "Speech-to-text and text-to-speech models",
    subCategories: {
      stt: "Speech-to-Text",
      tts: "Text-to-Speech",
    },
  },
  fine_tuned: {
    label: "Fine-Tuned",
    description: "Custom-trained model variants",
    subCategories: {
      supervised: "Supervised",
      domain_adapted: "Domain Adapted",
      instruction_tuned: "Instruction Tuned",
    },
  },
  adapter: {
    label: "Adapter",
    description: "LoRA / adapter-enhanced models",
    subCategories: {
      lora: "LoRA",
      domain_plugin: "Domain Plugin",
    },
  },
  quantized: {
    label: "Quantized",
    description: "Quantized model variants for efficiency",
    subCategories: {
      "4bit": "4-bit",
      "8bit": "8-bit",
      gguf: "GGUF",
    },
  },
  distilled: {
    label: "Distilled",
    description: "Smaller / edge-friendly distilled models",
  },
  experimental: {
    label: "Experimental",
    description: "Unstable, alpha, or research models",
    subCategories: {
      alpha: "Alpha",
      canary: "Canary",
      research: "Research",
    },
  },
  composite: {
    label: "Composite",
    description: "Router models, shadow deployments, frozen snapshots",
    subCategories: {
      router_model: "Router Model",
      shadow: "Shadow",
      frozen_snapshot: "Frozen Snapshot",
    },
  },
};

// ============================================================================
// Agent Categories
// ============================================================================

/**
 * Agent categories — classifies the orchestrated intelligent entity.
 * Agent = what autonomous entity is executing decisions?
 *
 * Agent includes: cognitive loop (Sense → Think → Act → Learn),
 * memory cells, decision engine, policy binding, runtime config, observability.
 */
export const AGENT_CATEGORIES: Record<string, CategoryDef> = {
  conversational: {
    label: "Conversational",
    description: "Dialogue-driven agents with memory and context",
    subCategories: {
      assistant: "Assistant",
      advisor: "Advisor",
      tutor: "Tutor",
    },
  },
  task_executor: {
    label: "Task Executor",
    description: "Goal-oriented agents that execute multi-step plans",
    subCategories: {
      planner: "Planner",
      coder: "Coder",
      researcher: "Researcher",
      data_analyst: "Data Analyst",
    },
  },
  orchestrator: {
    label: "Orchestrator",
    description: "Meta-agents that coordinate other agents",
    subCategories: {
      supervisor: "Supervisor",
      router: "Router",
      swarm_leader: "Swarm Leader",
    },
  },
  autonomous: {
    label: "Autonomous",
    description: "Long-running agents with persistent goals and self-direction",
    subCategories: {
      background_worker: "Background Worker",
      monitor: "Monitor",
      self_improving: "Self-Improving",
    },
  },
  specialist: {
    label: "Specialist",
    description: "Domain-expert agents with deep tool integration",
    subCategories: {
      devops: "DevOps",
      security: "Security",
      compliance: "Compliance",
      creative: "Creative",
    },
  },
};

// ============================================================================
// Bot Categories
// ============================================================================

/**
 * Bot categories — classifies the lightweight automated responder.
 * Bot = what automated responder handles a specific interaction?
 *
 * Typically: stateless or lightly stateful, limited in autonomy, single-purpose.
 */
export const BOT_CATEGORIES: Record<string, CategoryDef> = {
  chat_bot: {
    label: "Chat Bot",
    description: "Channel-specific conversational responder (Discord, Telegram, web)",
    subCategories: {
      discord: "Discord",
      telegram: "Telegram",
      slack: "Slack",
      web_chat: "Web Chat",
    },
  },
  command_bot: {
    label: "Command Bot",
    description: "Slash-command or trigger-driven automation",
    subCategories: {
      cli: "CLI",
      webhook: "Webhook",
      slash_command: "Slash Command",
    },
  },
  notification_bot: {
    label: "Notification Bot",
    description: "Alert and notification delivery automation",
    subCategories: {
      alerter: "Alerter",
      digest: "Digest",
      escalation: "Escalation",
    },
  },
  integration_bot: {
    label: "Integration Bot",
    description: "Bridges between services (GitHub, Jira, CI/CD)",
    subCategories: {
      github: "GitHub",
      jira: "Jira",
      ci_cd: "CI/CD",
    },
  },
  qa_bot: {
    label: "Q&A Bot",
    description: "Simple question-answering over a knowledge base",
    subCategories: {
      faq: "FAQ",
      docs: "Documentation",
      support: "Support",
    },
  },
};

// ============================================================================
// Capabilities
// ============================================================================

export const CAPABILITIES: Record<string, CapabilityDef> = {
  // Functional
  tool_calling:      { label: "Tool Calling",       group: "functional", appliesTo: ["provider", "model", "agent", "bot"] },
  json_mode:         { label: "JSON Mode",           group: "functional", appliesTo: ["provider", "model", "llm"] },
  streaming:         { label: "Streaming",           group: "functional", appliesTo: ["provider", "model", "llm"] },
  function_calling:  { label: "Function Calling",    group: "functional", appliesTo: ["provider", "model", "agent"] },
  rag_builtin:       { label: "RAG Built-in",        group: "functional", appliesTo: ["provider", "model", "agent"] },
  vision:            { label: "Vision",              group: "functional", appliesTo: ["model", "llm"] },
  audio:             { label: "Audio",               group: "functional", appliesTo: ["model", "llm"] },
  memory:            { label: "Memory",              group: "functional", appliesTo: ["agent"] },
  multi_step:        { label: "Multi-Step Planning", group: "functional", appliesTo: ["agent"] },
  coordination:      { label: "Coordination",        group: "functional", appliesTo: ["agent"] },
  channel_binding:   { label: "Channel Binding",     group: "functional", appliesTo: ["bot"] },

  // Operational
  low_latency:       { label: "Low Latency",         group: "operational", appliesTo: ["provider", "model", "bot"] },
  cost_optimized:    { label: "Cost Optimized",       group: "operational", appliesTo: ["provider", "model"] },
  high_context:      { label: "High Context",         group: "operational", appliesTo: ["model", "llm"] },
  multi_region:      { label: "Multi-Region",         group: "operational", appliesTo: ["provider"] },
  version_pinned:    { label: "Version Pinned",       group: "operational", appliesTo: ["provider", "model"] },
  long_running:      { label: "Long Running",         group: "operational", appliesTo: ["agent"] },
  lightweight:       { label: "Lightweight",          group: "operational", appliesTo: ["bot"] },

  // Governance
  sandbox:           { label: "Sandbox",              group: "governance", appliesTo: ["provider", "model", "agent", "bot"] },
  governed:          { label: "Governed",             group: "governance", appliesTo: ["provider", "model", "agent"] },
  production_ready:  { label: "Production Ready",     group: "governance", appliesTo: ["provider", "model", "agent", "bot"] },
  internet_required: { label: "Internet Required",    group: "governance", appliesTo: ["provider"] },
  mobile_safe:       { label: "Mobile Safe",          group: "governance", appliesTo: ["model", "bot"] },
  policy_bound:      { label: "Policy Bound",         group: "governance", appliesTo: ["agent"] },

  // Meta
  default:           { label: "Default",              group: "meta", appliesTo: ["provider", "model", "agent", "bot"] },
  recommended:       { label: "Recommended",          group: "meta", appliesTo: ["provider", "model", "llm", "agent", "bot"] },
  high_cost:         { label: "High Cost",            group: "meta", appliesTo: ["provider", "model"] },
};

// ============================================================================
// Category Map (all 5 types)
// ============================================================================

const CATEGORY_MAP: Record<EntryType, Record<string, CategoryDef>> = {
  provider: PROVIDER_CATEGORIES,
  llm: LLM_CATEGORIES,
  model: MODEL_CATEGORIES,
  agent: AGENT_CATEGORIES,
  bot: BOT_CATEGORIES,
};

// ============================================================================
// Helpers
// ============================================================================

/** Get the category map for a given entry type */
export function getCategoriesForType(entryType: EntryType): Record<string, CategoryDef> {
  return CATEGORY_MAP[entryType] ?? {};
}

/** Get subcategories for a given category key (searches all type maps) */
export function getSubCategories(category: string): Record<string, string> | undefined {
  for (const map of Object.values(CATEGORY_MAP)) {
    if (map[category]?.subCategories) return map[category].subCategories;
  }
  return undefined;
}

/** Get capabilities filtered by entry type */
export function getCapabilitiesForType(entryType: EntryType): Record<string, CapabilityDef> {
  const result: Record<string, CapabilityDef> = {};
  for (const [key, cap] of Object.entries(CAPABILITIES)) {
    if (cap.appliesTo.includes(entryType)) {
      result[key] = cap;
    }
  }
  return result;
}

/** All valid category keys for a given entry type */
export function getValidCategoryKeys(entryType: EntryType): string[] {
  return Object.keys(getCategoriesForType(entryType));
}

/** All valid subcategory keys for a given category */
export function getValidSubCategoryKeys(category: string): string[] {
  const subs = getSubCategories(category);
  return subs ? Object.keys(subs) : [];
}

/** All valid capability keys */
export function getAllCapabilityKeys(): string[] {
  return Object.keys(CAPABILITIES);
}

// ============================================================================
// Multi-Axis Classification Data
// ============================================================================

/**
 * Axis definition for multi-dimensional taxonomy.
 * Each axis has a key, label, description, and children (subcategories or classes).
 */
export interface AxisNode {
  key: string;
  label: string;
  description?: string;
  children?: AxisNode[];
}

export interface AxisDef {
  key: string;
  label: string;
  description: string;
  children: AxisNode[];
}

// ── Provider Axes (6 axes, 2-level: axis → classes) ──

export const PROVIDER_AXES: AxisDef[] = [
  {
    key: "hosting_model", label: "Hosting Model", description: "Where the provider runs",
    children: [
      { key: "cloud", label: "Cloud" },
      { key: "on_prem", label: "On-Premises" },
      { key: "hybrid", label: "Hybrid" },
      { key: "edge", label: "Edge" },
    ],
  },
  {
    key: "auth_architecture", label: "Auth Architecture", description: "How authentication is handled",
    children: [
      { key: "oauth", label: "OAuth" },
      { key: "api_key", label: "API Key" },
      { key: "mtls", label: "mTLS" },
      { key: "iam", label: "IAM" },
    ],
  },
  {
    key: "compliance_profile", label: "Compliance Profile", description: "Regulatory compliance level",
    children: [
      { key: "soc2", label: "SOC2" },
      { key: "hipaa", label: "HIPAA" },
      { key: "iso27001", label: "ISO 27001" },
      { key: "none", label: "None" },
    ],
  },
  {
    key: "pricing_model", label: "Pricing Model", description: "How usage is billed",
    children: [
      { key: "pay_per_token", label: "Pay-per-Token" },
      { key: "subscription", label: "Subscription" },
      { key: "free", label: "Free" },
      { key: "custom", label: "Custom" },
    ],
  },
  {
    key: "geographic_scope", label: "Geographic Scope", description: "Regional availability",
    children: [
      { key: "single_region", label: "Single Region" },
      { key: "multi_region", label: "Multi-Region" },
      { key: "global", label: "Global" },
    ],
  },
  {
    key: "sla_tier", label: "SLA Tier", description: "Service level agreement tier",
    children: [
      { key: "enterprise", label: "Enterprise" },
      { key: "standard", label: "Standard" },
      { key: "best_effort", label: "Best Effort" },
    ],
  },
];

// ── LLM Axes (5 axes, 2-level: axis → classes) ──

export const LLM_AXES: AxisDef[] = [
  {
    key: "architecture_family", label: "Architecture Family", description: "Core neural architecture type",
    children: [
      { key: "transformer", label: "Transformer" },
      { key: "diffusion", label: "Diffusion" },
      { key: "mixture_of_experts", label: "Mixture-of-Experts" },
      { key: "state_space", label: "State Space" },
      { key: "hybrid", label: "Hybrid" },
    ],
  },
  {
    key: "modality", label: "Modality", description: "Input/output types supported",
    children: [
      { key: "text", label: "Text" },
      { key: "vision", label: "Vision" },
      { key: "multimodal", label: "Multimodal" },
      { key: "audio", label: "Audio" },
      { key: "code", label: "Code" },
    ],
  },
  {
    key: "training_approach", label: "Training Approach", description: "How the model was trained",
    children: [
      { key: "pre_trained", label: "Pre-trained" },
      { key: "fine_tuned", label: "Fine-tuned" },
      { key: "rlhf", label: "RLHF" },
      { key: "distilled", label: "Distilled" },
    ],
  },
  {
    key: "license", label: "License", description: "Usage license type",
    children: [
      { key: "open_source", label: "Open Source" },
      { key: "commercial", label: "Commercial" },
      { key: "research_only", label: "Research Only" },
    ],
  },
  {
    key: "size_class", label: "Size Class", description: "Model parameter size category",
    children: [
      { key: "small", label: "Small (<3B)" },
      { key: "medium", label: "Medium (3B-30B)" },
      { key: "large", label: "Large (30B-100B)" },
      { key: "frontier", label: "Frontier (>100B)" },
    ],
  },
];

// ── Model Axes (5 axes, 2-level: axis → classes) ──

export const MODEL_AXES: AxisDef[] = [
  {
    key: "quantization", label: "Quantization", description: "Weight precision format",
    children: [
      { key: "fp32", label: "FP32" },
      { key: "fp16", label: "FP16" },
      { key: "int8", label: "INT8" },
      { key: "int4", label: "INT4" },
      { key: "gguf", label: "GGUF" },
    ],
  },
  {
    key: "deployment_target", label: "Deployment Target", description: "Where the model runs",
    children: [
      { key: "gpu", label: "GPU" },
      { key: "cpu", label: "CPU" },
      { key: "edge", label: "Edge" },
      { key: "serverless", label: "Serverless" },
    ],
  },
  {
    key: "promotion_state", label: "Promotion State", description: "Lifecycle stage",
    children: [
      { key: "sandbox", label: "Sandbox" },
      { key: "governed", label: "Governed" },
      { key: "production", label: "Production" },
    ],
  },
  {
    key: "benchmark_profile", label: "Benchmark Profile", description: "Primary strength area",
    children: [
      { key: "reasoning", label: "Reasoning" },
      { key: "coding", label: "Coding" },
      { key: "creative", label: "Creative" },
      { key: "factual", label: "Factual" },
    ],
  },
  {
    key: "cost_tier", label: "Cost Tier", description: "Inference cost level",
    children: [
      { key: "free", label: "Free" },
      { key: "low", label: "Low" },
      { key: "medium", label: "Medium" },
      { key: "high", label: "High" },
    ],
  },
];

// ── Agent Axes (9 axes, full 3-level: axis → subcategory → class) ──

export const AGENT_AXES: AxisDef[] = [
  {
    key: "cognitive_architecture", label: "Cognitive Architecture", description: "How the agent reasons",
    children: [
      { key: "cog_reactive", label: "Reactive Systems", children: [
        { key: "cog_simple_reflex", label: "Simple Reflex" },
        { key: "cog_rule_based", label: "Rule-Based" },
        { key: "cog_heuristic", label: "Heuristic" },
      ]},
      { key: "cog_state_based", label: "State-Based Systems", children: [
        { key: "cog_model_based_reflex", label: "Model-Based Reflex" },
        { key: "cog_bayesian", label: "Bayesian" },
      ]},
      { key: "cog_deliberative", label: "Deliberative Systems", children: [
        { key: "cog_goal_based", label: "Goal-Based" },
        { key: "cog_planning", label: "Planning" },
        { key: "cog_search_based", label: "Search-Based" },
        { key: "cog_constraint_satisfaction", label: "Constraint-Satisfaction" },
        { key: "cog_logic_based", label: "Logic-Based" },
      ]},
      { key: "cog_decision_theoretic", label: "Decision-Theoretic", children: [
        { key: "cog_utility_based", label: "Utility-Based" },
        { key: "cog_game_theoretic", label: "Game-Theoretic" },
      ]},
      { key: "cog_learning_centric", label: "Learning-Centric", children: [
        { key: "cog_rl_arch", label: "Reinforcement-Based Architecture" },
        { key: "cog_model_based_rl_arch", label: "Model-Based RL Architecture" },
      ]},
      { key: "cog_advanced", label: "Advanced Cognitive", children: [
        { key: "cog_neuro_symbolic", label: "Neuro-Symbolic" },
        { key: "cog_generative", label: "Generative Architecture" },
        { key: "cog_llm_based", label: "LLM-Based Architecture" },
        { key: "cog_meta_reasoning", label: "Meta-Reasoning Architecture" },
        { key: "cog_self_reflective", label: "Self-Reflective Architecture" },
        { key: "cog_theory_of_mind", label: "Theory-of-Mind Architecture" },
      ]},
    ],
  },
  {
    key: "functional_role", label: "Functional Role", description: "What role the agent performs",
    children: [
      { key: "role_interface", label: "Interface Roles", children: [
        { key: "role_conversational", label: "Conversational" },
        { key: "role_advisory", label: "Advisory" },
        { key: "role_recommendation", label: "Recommendation" },
        { key: "role_decision_support", label: "Decision Support" },
      ]},
      { key: "role_expert", label: "Expert Roles", children: [
        { key: "role_specialist", label: "Specialist" },
        { key: "role_data_analysis", label: "Data Analysis" },
        { key: "role_code_generation", label: "Code Generation" },
        { key: "role_research", label: "Research" },
        { key: "role_evaluation", label: "Evaluation" },
      ]},
      { key: "role_execution", label: "Execution Roles", children: [
        { key: "role_task_executor", label: "Task Executor" },
        { key: "role_workflow_executor", label: "Workflow Executor" },
        { key: "role_testing_agent", label: "Testing Agent" },
        { key: "role_monitoring_agent", label: "Monitoring Agent" },
      ]},
      { key: "role_coordination", label: "Coordination Roles", children: [
        { key: "role_orchestrator", label: "Orchestrator" },
        { key: "role_coordination_agent", label: "Coordination Agent" },
        { key: "role_optimization_agent", label: "Optimization Agent" },
      ]},
      { key: "role_governance", label: "Governance Roles", children: [
        { key: "role_compliance_agent", label: "Compliance Agent" },
        { key: "role_security_agent", label: "Security Agent" },
        { key: "role_audit_agent", label: "Audit Agent" },
      ]},
    ],
  },
  {
    key: "organizational_structure", label: "Organizational Structure", description: "How agents are organized",
    children: [
      { key: "org_single", label: "Single-Unit", children: [
        { key: "org_single_agent", label: "Single-Agent" },
      ]},
      { key: "org_distributed", label: "Distributed", children: [
        { key: "org_mas", label: "Multi-Agent System (MAS)" },
        { key: "org_peer_to_peer", label: "Peer-to-Peer" },
        { key: "org_swarm", label: "Swarm" },
      ]},
      { key: "org_centralized", label: "Centralized", children: [
        { key: "org_centralized_coordination", label: "Centralized Coordination" },
        { key: "org_hierarchical", label: "Hierarchical" },
      ]},
      { key: "org_hybrid", label: "Hybrid", children: [
        { key: "org_hybrid_system", label: "Hybrid" },
        { key: "org_federated", label: "Federated System" },
      ]},
    ],
  },
  {
    key: "autonomy_level", label: "Autonomy Level", description: "How autonomous the agent is",
    children: [
      { key: "auto_reactive", label: "Reactive Autonomy", children: [
        { key: "auto_reactive_agent", label: "Reactive" },
      ]},
      { key: "auto_assisted", label: "Assisted", children: [
        { key: "auto_hitl", label: "Human-in-the-Loop" },
        { key: "auto_semi", label: "Semi-Autonomous" },
      ]},
      { key: "auto_independent", label: "Independent", children: [
        { key: "auto_fully", label: "Fully Autonomous" },
        { key: "auto_self_governing", label: "Self-Governing" },
      ]},
      { key: "auto_evolving", label: "Self-Evolving", children: [
        { key: "auto_self_improving", label: "Self-Improving" },
        { key: "auto_self_replicating", label: "Self-Replicating" },
      ]},
    ],
  },
  {
    key: "embodiment", label: "Embodiment", description: "Where the agent exists",
    children: [
      { key: "emb_software", label: "Software", children: [
        { key: "emb_software_agent", label: "Software Agent" },
        { key: "emb_virtual_agent", label: "Virtual Agent" },
      ]},
      { key: "emb_cyber_physical", label: "Cyber-Physical", children: [
        { key: "emb_cyber_physical_agent", label: "Cyber-Physical Agent" },
        { key: "emb_iot_agent", label: "IoT Agent" },
      ]},
      { key: "emb_physical", label: "Physical", children: [
        { key: "emb_robotic_agent", label: "Robotic Agent" },
        { key: "emb_mobile_physical", label: "Mobile Physical Agent" },
      ]},
    ],
  },
  {
    key: "learning_paradigm", label: "Learning Paradigm", description: "How the agent learns",
    children: [
      { key: "learn_supervised", label: "Supervised", children: [
        { key: "learn_supervised_learning", label: "Supervised Learning" },
      ]},
      { key: "learn_unsupervised", label: "Unsupervised", children: [
        { key: "learn_unsupervised_learning", label: "Unsupervised Learning" },
        { key: "learn_self_supervised", label: "Self-Supervised Learning" },
      ]},
      { key: "learn_reinforcement", label: "Reinforcement", children: [
        { key: "learn_rl", label: "Reinforcement Learning" },
        { key: "learn_policy_rl", label: "Policy-Based RL" },
        { key: "learn_value_rl", label: "Value-Based RL" },
        { key: "learn_actor_critic", label: "Actor-Critic" },
        { key: "learn_model_free_rl", label: "Model-Free RL" },
        { key: "learn_model_based_rl", label: "Model-Based RL" },
      ]},
      { key: "learn_online", label: "Online & Continual", children: [
        { key: "learn_online_learning", label: "Online Learning" },
        { key: "learn_continual", label: "Continual Learning" },
      ]},
      { key: "learn_transfer", label: "Transfer & Distributed", children: [
        { key: "learn_transfer_learning", label: "Transfer Learning" },
        { key: "learn_federated", label: "Federated Learning" },
      ]},
      { key: "learn_evolutionary", label: "Evolutionary & Meta", children: [
        { key: "learn_evolutionary_learning", label: "Evolutionary Learning" },
        { key: "learn_meta_learning", label: "Meta-Learning" },
      ]},
    ],
  },
  {
    key: "decision_paradigm", label: "Decision Paradigm", description: "How the agent decides",
    children: [
      { key: "dec_deterministic", label: "Deterministic", children: [
        { key: "dec_deterministic_decision", label: "Deterministic Decision" },
      ]},
      { key: "dec_probabilistic", label: "Probabilistic", children: [
        { key: "dec_stochastic", label: "Stochastic Decision" },
        { key: "dec_probabilistic_inference", label: "Probabilistic Inference" },
      ]},
      { key: "dec_risk", label: "Risk & Economic", children: [
        { key: "dec_risk_sensitive", label: "Risk-Sensitive Decision" },
        { key: "dec_market_based", label: "Market-Based Decision" },
      ]},
      { key: "dec_strategic", label: "Strategic", children: [
        { key: "dec_adversarial", label: "Adversarial" },
        { key: "dec_cooperative", label: "Cooperative" },
        { key: "dec_competitive", label: "Competitive" },
        { key: "dec_nash", label: "Nash-Equilibrium" },
      ]},
    ],
  },
  {
    key: "governance_safety", label: "Governance & Safety", description: "What constraints govern the agent",
    children: [
      { key: "gov_policy", label: "Policy Control", children: [
        { key: "gov_policy_constrained", label: "Policy-Constrained" },
        { key: "gov_compliance_enforcing", label: "Compliance-Enforcing" },
      ]},
      { key: "gov_alignment", label: "Alignment", children: [
        { key: "gov_alignment_constrained", label: "Alignment-Constrained" },
        { key: "gov_fairness_aware", label: "Fairness-Aware" },
      ]},
      { key: "gov_transparency", label: "Transparency", children: [
        { key: "gov_auditable", label: "Auditable" },
        { key: "gov_explainable", label: "Explainable" },
      ]},
      { key: "gov_security", label: "Security", children: [
        { key: "gov_secure", label: "Secure" },
        { key: "gov_privacy_preserving", label: "Privacy-Preserving" },
        { key: "gov_sandbox_limited", label: "Sandbox-Limited" },
      ]},
    ],
  },
  {
    key: "cognitive_capability", label: "Cognitive Capability", description: "How deep the agent's cognition is",
    children: [
      { key: "cap_minimal", label: "Minimal", children: [
        { key: "cap_stateless", label: "Stateless" },
      ]},
      { key: "cap_contextual", label: "Contextual", children: [
        { key: "cap_stateful", label: "Stateful" },
        { key: "cap_context_aware", label: "Context-Aware" },
      ]},
      { key: "cap_world_modeling", label: "World Modeling", children: [
        { key: "cap_world_model", label: "World-Modeling" },
        { key: "cap_self_model", label: "Self-Modeling" },
      ]},
      { key: "cap_higher_order", label: "Higher-Order", children: [
        { key: "cap_reflective", label: "Reflective" },
        { key: "cap_meta_cognitive", label: "Meta-Cognitive" },
        { key: "cap_theory_of_mind", label: "Theory-of-Mind" },
        { key: "cap_creative_generative", label: "Creative Generative" },
      ]},
    ],
  },
];

// ── Bot Axes (5 axes, 2-level: axis → classes) ──

export const BOT_AXES: AxisDef[] = [
  {
    key: "interface_type", label: "Interface Type", description: "How users interact with the bot",
    children: [
      { key: "web_chat", label: "Web Chat" },
      { key: "messaging", label: "Messaging" },
      { key: "voice", label: "Voice" },
      { key: "api", label: "API" },
      { key: "embedded", label: "Embedded" },
    ],
  },
  {
    key: "state_management", label: "State Management", description: "How bot state is handled",
    children: [
      { key: "stateless", label: "Stateless" },
      { key: "session", label: "Session" },
      { key: "persistent", label: "Persistent" },
    ],
  },
  {
    key: "interaction_pattern", label: "Interaction Pattern", description: "How the bot engages",
    children: [
      { key: "qa", label: "Q&A" },
      { key: "task_oriented", label: "Task-Oriented" },
      { key: "open_ended", label: "Open-Ended" },
    ],
  },
  {
    key: "user_scope", label: "User Scope", description: "Who the bot serves",
    children: [
      { key: "internal", label: "Internal" },
      { key: "customer_facing", label: "Customer-Facing" },
      { key: "public", label: "Public" },
    ],
  },
  {
    key: "governance_binding", label: "Governance Binding", description: "How governance is applied",
    children: [
      { key: "none", label: "None" },
      { key: "inherited", label: "Inherited" },
      { key: "explicit", label: "Explicit" },
    ],
  },
];

// ── Unified Axes Map ──

export const AXES_MAP: Record<EntryType, AxisDef[]> = {
  provider: PROVIDER_AXES,
  llm: LLM_AXES,
  model: MODEL_AXES,
  agent: AGENT_AXES,
  bot: BOT_AXES,
};
