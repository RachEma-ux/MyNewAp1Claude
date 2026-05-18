# Fully Revised Detailed Implementation Roadmap

**Agent Studio Native Graph Workspace**
Obsidian-like Markdown Workspace + Postgres Workspace Persistence + Neo4j Community Edition Dedicated Graph DB + Typed Knowledge Graph + GraphRAG + Graph Agent Runtime + Governance / Evaluation / Self-Correction

> **Status:** Authored 2026-05-10. This document is the canonical roadmap for the Native Graph Workspace initiative. The companion execution plan is at `docs/implementation/agent-studio-native-graph-workspace-execution-plan.md`. The Phase 11b-3 deferral analysis from Roadmap V3 (which this project supersedes for runtime/trace UI surfaces) is at `docs/implementation/runtime-hardening-v3-phase-11b-3-deferral.md`.

---

## 0. Product Vision

Build a native Obsidian-like graph workspace inside Agent Studio, but stronger than a normal notes app because notes are not merely documents.

In Agent Studio, notes can become:

- human-readable knowledge
- structured metadata
- typed graph entities
- versioned source artifacts
- governed runtime assets
- GraphRAG evidence
- CAG / Graph Skill source material
- MCP/tool knowledge
- workflow and policy assets
- runtime trace explanations
- institutional memory
- code intelligence references
- graph-agent operational context

The target is not simply:

> Knowledge Graph

The target is:

> Agent Studio Native Graph Workspace
> =
> server-first Markdown workspace
> + Postgres-backed workspace/governance persistence
> + Neo4j Community Edition dedicated graph database
> + typed knowledge graph
> + graph-native context layer for agents
> + GraphRAG retrieval
> + Graph Agent runtime
> + governance / provenance / lineage
> + evaluation and self-correction loop

The critical architectural principle becomes:

> **Do not build a serious graph-agent system on Postgres-only assumptions.**

- Use Postgres for workspace persistence.
- Use Neo4j Community Edition as the default dedicated graph backend candidate for MVP graph workloads.
- Use GraphRepository abstraction from day one.
- Keep Memgraph as a secondary benchmark candidate.
- Keep Neo4j Enterprise / Aura as the later production upgrade path.

The core value chain is:

```
Human-readable note
    ↓
structured metadata
    ↓
wikilinks / backlinks
    ↓
entity extraction / entity resolution
    ↓
typed graph node / edge creation
    ↓
projection from Postgres source records to Neo4j CE graph model
    ↓
provenance + lineage + confidence
    ↓
graph projection / graph lens / saved view
    ↓
GraphRAG retrieval / RAC / CAG / MCP usage
    ↓
Graph Agent reasoning and explanation
    ↓
runtime trace + decision trace
    ↓
feedback / graph quality signal
    ↓
governed correction proposal
    ↓
self-improving institutional graph memory
```

Final product definition:

Agent Studio becomes a graph-native knowledge operating system where human-authored notes, institutional memory, CAG blocks, Graph Skill Packs, GraphRAG evidence, RAC context, MCP tools, policies, workflows, code architecture, security exposure, runtime traces, decision traces, evaluations, and feedback all become part of one governed, dynamic, versioned, benchmarked, explainable, and self-improving knowledge graph.

---

## 1. Core Architectural Decision

### 1.1 Database Responsibility Split

The system must use a dual-store architecture.

```
Postgres
    owns durable workspace, governance, permissions, versions, and audit records.

Neo4j Community Edition
    owns projected graph traversal, graph relationships, graph paths, GraphRAG expansion,
    graph-agent reasoning support, and graph-native query templates.

GraphRepository
    hides backend details and prevents direct coupling to either SQL or Cypher.

Projection Sync
    keeps Neo4j CE synchronized from Postgres source-of-truth records.
```

### 1.2 Postgres Responsibilities

Use Postgres for: users, workspaces, vaults, shared vault membership, folders, notes, note versions, note locks, note conflicts, attachments, properties / frontmatter, permissions, promotion records, governance records, approval records, audit records, runtime asset metadata, source artifact versions, background jobs, evaluation records, benchmark records.

Postgres remains the source of truth.

### 1.3 Neo4j Community Edition Responsibilities

Use Neo4j Community Edition for: graph nodes, graph edges, multi-hop traversal, local graph, global graph, impact analysis, GraphRAG expansion, runtime trace graph paths, decision trace graph paths, CAG → source note paths, Graph Skill → source note paths, MCP tool dependency paths, workflow dependency paths, code dependency paths, security blast-radius paths, Graph Agent graph queries, Cypher query templates, guarded Text2Cypher target execution, graph algorithm experiments where supported.

Neo4j CE becomes the default dedicated graph backend for MVP graph workloads.

### 1.4 What Neo4j CE Does Not Replace

Neo4j CE must not replace: Postgres note storage, Postgres workspace permissions, Postgres governance records, Postgres audit records, Postgres source note versions, Postgres approval workflows, Postgres runtime asset metadata.

Neo4j CE stores a projected graph model, not the full application source of truth.

---

## 2. Five-Layer Product Architecture

```
Layer 1 — Graph Workspace
    Obsidian-like Markdown vaults, notes, folders, backlinks, tags,
    attachments, templates, saved views, import/export.

Layer 2 — Typed Knowledge Graph / Institutional Memory
    Canonical entities, relationships, ontology, constraints,
    provenance, temporal facts, decisions, people, systems, ownership,
    policies, workflows, code, security, evaluation memory.

Layer 3 — GraphRAG Retrieval Layer
    Full-text search, vector search, Neo4j graph traversal,
    Cypher query templates, guarded Text2Cypher, graph algorithms,
    hybrid ranking, citations, context safety filtering.

Layer 4 — Graph Agent Runtime Layer
    Schema inspection, ontology-aware planning, retrieval selection,
    graph skill selection, Cypher/query-template execution,
    provenance explanation, governed action routing, runtime traces,
    decision traces.

Layer 5 — Evaluation / Governance / Self-Correction Loop
    Golden questions, benchmark CI, graph quality metrics, user feedback,
    graph correction proposals, semantic enrichment proposals, approval,
    rollback, audit.
```

The system is not workspace-first only. It is:

```
workspace
+ Postgres source-of-truth persistence
+ Neo4j CE projected graph intelligence
+ GraphRAG retrieval
+ Graph Agent runtime
+ governance
+ self-correction
```

---

## 3. Core Product Model

```
Agent Studio Native Graph Workspace
├── 1. Durable Markdown Workspace
│   ├── Vaults
│   ├── Shared Vaults
│   ├── Folders
│   ├── Notes
│   ├── Note Versions
│   ├── Note Edit Sessions
│   ├── Soft Editing Locks
│   ├── Conflict Resolution
│   ├── Attachments
│   ├── Markdown Content
│   ├── Properties / Frontmatter
│   ├── Tags
│   ├── Wikilinks
│   ├── Backlinks
│   ├── Embeds
│   ├── Templates
│   ├── Saved Views
│   └── Markdown Import / Export
│
├── 2. Postgres Workspace Persistence Layer
│   ├── Workspace Records
│   ├── Vault Records
│   ├── Note Records
│   ├── Note Version Records
│   ├── Permission Records
│   ├── Governance Records
│   ├── Approval Records
│   ├── Promotion Records
│   ├── Runtime Asset Metadata
│   ├── Audit Events
│   ├── Background Jobs
│   └── Evaluation / Benchmark Records
│
├── 3. Neo4j Community Edition Graph Layer
│   ├── Projected Graph Nodes
│   ├── Projected Graph Edges
│   ├── Cypher Query Templates
│   ├── Graph Traversal
│   ├── Multi-Hop Paths
│   ├── Runtime Trace Paths
│   ├── Decision Trace Paths
│   ├── CAG Source Paths
│   ├── Graph Skill Source Paths
│   ├── MCP Tool Dependency Paths
│   ├── Impact Analysis Paths
│   ├── GraphRAG Expansion Paths
│   ├── Graph Algorithm Experiments
│   └── Graph Backend Health
│
├── 4. Dynamic Workspace Layer
│   ├── Markdown Editor
│   ├── Source Mode
│   ├── Reading Mode
│   ├── Live Preview
│   ├── Search
│   ├── Quick Switcher
│   ├── Command Palette
│   ├── Ask Agent About This Note
│   ├── Why This Answer? Panel
│   ├── Runtime Usage Panel
│   ├── Graph Inspector
│   ├── Local Graph
│   ├── Global Graph
│   ├── Runtime Trace View
│   ├── Decision Trace View
│   ├── Impact Analysis View
│   ├── Graph Quality Panel
│   └── Failure / Empty / Loading / Permission States
│
├── 5. Graph Repository Layer
│   ├── GraphRepository Interface
│   ├── PostgresGraphRepository
│   ├── Neo4jCommunityGraphRepository
│   ├── MemgraphGraphRepository
│   ├── FalkorDbGraphRepository
│   ├── TestGraphRepository
│   ├── Backend Capability Registry
│   ├── Backend Benchmark Runner
│   ├── Backend Promotion Decision Gate
│   └── Backend Migration / Projection Strategy
│
├── 6. Projection Sync Layer
│   ├── Note Projection Jobs
│   ├── Link Projection Jobs
│   ├── Entity Projection Jobs
│   ├── CAG Projection Jobs
│   ├── Graph Skill Projection Jobs
│   ├── MCP Tool Projection Jobs
│   ├── Runtime Trace Projection Jobs
│   ├── Decision Trace Projection Jobs
│   ├── Policy Projection Jobs
│   ├── Workflow Projection Jobs
│   ├── Projection Reconciliation
│   ├── Projection Retry
│   ├── Projection Drift Detection
│   └── Projection Audit Events
│
├── 7. Typed Knowledge Graph Engine
│   ├── Ontology Registry
│   ├── Graph Constraint Registry
│   ├── Entity Resolution Layer
│   ├── Provenance / Lineage Layer
│   ├── Temporal Observation Model
│   ├── Graph Nodes
│   ├── Graph Edges
│   ├── Graph Projections
│   ├── Graph Query Cache
│   ├── Projection Snapshots
│   ├── Layout Registry
│   ├── Graph Lenses
│   ├── Retention Policies
│   ├── Traversal Benchmarks
│   └── Governance-Aware Visibility
│
├── 8. Institutional Memory Layer
│   ├── People
│   ├── Teams
│   ├── Projects
│   ├── Decisions
│   ├── Systems
│   ├── Services
│   ├── Documents
│   ├── Policies
│   ├── Workflows
│   ├── Ownership
│   ├── Responsibilities
│   ├── Timelines
│   ├── Outcomes
│   ├── Governance Records
│   ├── Evaluation Feedback
│   └── Decision Traces
│
├── 9. Graph Memory Model
│   ├── Short-Term Session Memory
│   ├── Long-Term Institutional Memory
│   ├── Reasoning Memory
│   ├── Runtime Memory
│   ├── Evaluation Memory
│   ├── DecisionTrace
│   ├── DecisionTraceStep
│   ├── Observation Nodes
│   ├── Temporal Facts
│   └── Memory Retention Classes
│
├── 10. GraphRAG Retrieval Layer
│   ├── Full-Text Search
│   ├── Vector Search
│   ├── Neo4j Graph Traversal
│   ├── Cypher Query Templates
│   ├── Guarded Text2Cypher
│   ├── Similarity Search
│   ├── Graph Algorithms
│   ├── Hybrid Ranking
│   ├── Citation Assembly
│   ├── Context Safety Filter
│   ├── Retrieval Policy Enforcement
│   └── Permission-Aware Context Assembly
│
├── 11. Graph Skill Layer
│   ├── Graph Skill Packs
│   ├── Query Recipes
│   ├── Cypher Graph Patterns
│   ├── Traversal Constraints
│   ├── MCP Usage Guidance
│   ├── Source Note References
│   ├── Runtime Eligibility
│   ├── Skill Evaluation Cases
│   └── Skill Versioning
│
├── 12. Graph Agent Runtime Layer
│   ├── Graph Agent Lite
│   ├── Graph Agent Advanced
│   ├── Schema Inspection
│   ├── Ontology-Aware Planning
│   ├── Retrieval Tool Selection
│   ├── Cypher Query Execution
│   ├── Graph Algorithm Invocation
│   ├── Provenance Explanation
│   ├── Why This Answer? Explanation
│   ├── Graph Skill Pack Usage
│   ├── MCP Tool Access
│   ├── Runtime Trace Generation
│   ├── Decision Trace Generation
│   ├── Governed Action Routing
│   ├── REST Interface
│   ├── MCP Server Interface
│   ├── Optional A2A Interface
│   └── Agent Studio Dashboard Surface
│
├── 13. Migration / Projection Layer
│   ├── Existing CAG Pack Projection
│   ├── Existing MCP Tool Projection
│   ├── Existing Runtime Trace Projection
│   ├── Existing RAC Source Projection
│   ├── Existing Approval Policy Projection
│   ├── Existing Code Architecture Projection
│   ├── Existing Docs / Markdown Import
│   ├── Optional Generated Documentation Notes
│   └── Migration Audit Trail
│
├── 14. Promotion / Reference / Graph Change Workflows
│   ├── Note → Knowledge Unit
│   ├── Note → CAG Block
│   ├── Note → Graph Skill Pack
│   ├── Note → Tool Knowledge
│   ├── Note → Workflow
│   ├── Note → Policy
│   ├── Note → Evaluation Case
│   ├── Note → Graph Entity
│   ├── Runtime Trace → Investigation Note
│   ├── CAG Block → References Note Version
│   ├── Graph Skill Pack → References Note Version
│   ├── Tool Knowledge → References Note Version
│   ├── Graph Change Proposal
│   ├── Entity Merge Proposal
│   ├── Edge Correction Proposal
│   └── Self-Correction Review Workflow
│
├── 15. Agent Studio Runtime Integration
│   ├── RAG Lens
│   ├── RAC Lens
│   ├── CAG Lens
│   ├── Graph Skill Lens
│   ├── MCP Lens
│   ├── Governance Lens
│   ├── Runtime Lens
│   ├── Institutional Memory Lens
│   ├── Code Intelligence Lens
│   ├── Security Lens
│   ├── Workflow Lens
│   ├── Impact Lens
│   ├── Graph Quality Lens
│   └── Runtime Trace Backlinks
│
├── 16. Evaluation / Quality / Self-Correction Layer
│   ├── Graph Quality Metrics
│   ├── Golden Question Suites
│   ├── Answer Feedback Capture
│   ├── Feedback → Graph Improvement Pipeline
│   ├── Semantic Enrichment Agent
│   ├── Graph Correction Proposals
│   ├── Human Review
│   ├── Approval / Rejection
│   ├── Rollback
│   ├── Evaluation Regression Tests
│   ├── Benchmark CI
│   └── Quality Dashboards
│
└── 17. Deferred Full Capability Completion
    ├── Canvas MVP / Full Canvas
    ├── Bases MVP / Full Bases
    ├── Governed Plugin Framework
    ├── Offline Sync
    ├── Local-First Mode
    ├── Publish Strategy
    ├── Advanced GraphRAG
    ├── Multi-Agent GraphRAG
    ├── Cross-Workspace GraphRAG
    ├── Advanced Code Architecture Graph
    ├── Advanced Security / DevSecOps Graph
    ├── Neo4j Enterprise / Aura Upgrade
    └── Production HA / Backup / RBAC Hardening
```

---

## 4. Implementation Principles

### 4.1 Build Native, Not a Clone

Do not integrate external Obsidian code as a dependency. Build a native Agent Studio equivalent:

```
Obsidian-like workspace behavior
+ Agent Studio-native graph
+ Postgres source-of-truth persistence
+ Neo4j CE graph traversal backend
+ runtime awareness
+ governed promotion
+ provenance
+ institutional memory
+ GraphRAG
+ Graph Agent runtime
+ MCP-safe tool access
+ evaluation and self-correction
```

The goal is not to copy Obsidian. The goal is to create a graph-native operational context layer for Agent Studio.

### 4.2 Treat the Graph as an AI Context Layer

The graph is not just a visualization feature. The graph is the structured context, memory, provenance, and reasoning substrate for agents.

It stores: entities, relationships, provenance, lineage, constraints, temporal observations, decision traces, ownership, security exposure, code dependencies, policies, workflows, tool schemas, runtime traces, evaluation feedback, institutional memory.

It must support: human inspection, agent retrieval, GraphRAG, runtime explanation, authorization, auditing, correction, evaluation, benchmarking.

### 4.3 Use Postgres for Workspace Persistence

Postgres remains the default for: users, workspaces, vaults, folders, notes, note versions, attachments, properties, tags, editing locks, conflicts, permissions, workspace metadata, audit metadata, promotion records, approval records, governance records, runtime asset metadata, background jobs, evaluation records, benchmark records.

Postgres remains the source of truth for workspace and governance records.

### 4.4 Use Neo4j Community Edition as Dedicated Graph DB

Neo4j Community Edition becomes the default dedicated graph backend candidate for MVP graph workloads.

Use Neo4j CE for: graph nodes, graph edges, multi-hop traversal, local graph, global graph, impact analysis, GraphRAG expansion, runtime trace graph paths, decision trace graph paths, CAG source note paths, Graph Skill source note paths, MCP tool dependency paths, workflow dependency paths, code dependency paths, security blast-radius paths, Graph Agent graph queries, Cypher query templates, guarded Text2Cypher target execution, graph algorithm experiments where supported.

Neo4j CE should be added as **default dedicated graph backend for MVP graph intelligence**, not as **replacement for Postgres**.

### 4.5 Accept Neo4j Community Edition Limits

Neo4j Community Edition is valuable for MVP graph intelligence, but it is not the same as Neo4j Enterprise or Aura.

Neo4j CE is weaker for: high availability, clustering, failover, online backup, enterprise RBAC, LDAP / Active Directory integration, large production operations, multi-database enterprise administration.

Therefore:

- **Neo4j CE** = MVP dedicated graph backend
- **Neo4j Enterprise / Aura** = later production-hardening path

### 4.6 GraphRepository Abstraction Is Mandatory From Day One

Every graph operation must go through `GraphRepository`. No feature may directly bind advanced graph logic to Postgres or Neo4j implementation details.

Required interface families: node operations, edge operations, projection operations, traversal operations, permission-aware traversal, query template execution, graph algorithm execution, graph explain / path inspection, graph backend capability lookup, graph benchmark execution, graph import/export, projection sync, backend health check.

The GraphRepository must support capability flags:

- `supportsCypher`
- `supportsGql`
- `supportsRecursiveTraversal`
- `supportsGraphAlgorithms`
- `supportsVectorIndex`
- `supportsFullTextIndex`
- `supportsPermissionFilterPushdown`
- `supportsMaterializedPaths`
- `supportsQueryExplain`
- `supportsBatchProjection`
- `supportsTemporalQueries`
- `supportsStreamingResults`
- `supportsCommunityEditionLimitations`
- `supportsEnterpriseUpgradePath`

### 4.7 Dedicated Graph Backend Readiness Is an Early Gate

Dedicated graph backend evaluation must occur before: advanced graph views, GraphRAG retrieval layer, Graph Agent runtime, impact analysis, deep traversal, graph algorithms, cross-domain graph lenses.

Graph backend candidates:

- PostgresGraphRepository
- Neo4jCommunityGraphRepository
- MemgraphGraphRepository
- FalkorDbGraphRepository
- TestGraphRepository

Evaluation priority:

1. Postgres baseline
2. Neo4j Community Edition dedicated graph backend
3. Memgraph secondary benchmark candidate
4. FalkorDB low-latency experimental candidate

Backend decision rule:

> If Postgres fails p95 traversal / permission / impact targets, do not continue building advanced graph capabilities on Postgres alone.
>
> Promote Neo4j Community Edition as the active dedicated graph backend by Phase 7 / Phase 8 unless its own benchmark fails.
>
> Keep Postgres as workspace persistence.

### 4.8 Projection Sync Is Mandatory

Because Postgres remains source of truth and Neo4j CE owns graph traversal, the roadmap must include a projection sync layer.

Projection flow:

```
Note saved in Postgres
    ↓
Projection job extracts links/entities/metadata
    ↓
GraphRepository writes projected nodes/edges to Neo4j CE
    ↓
Graph view / GraphRAG / Graph Agent query Neo4j CE
    ↓
Neo4j result returns node IDs + source references
    ↓
Postgres loads authorized source records
    ↓
Context safety filter applies
    ↓
Agent receives governed context
```

Projection sync must support: initial projection, incremental projection, reprojection, delete / tombstone handling, version-aware projection, permission-aware projection, projection drift detection, projection retry, projection audit, backend health checks.

### 4.9 Server-First MVP, Markdown-Compatible Workspace

Because Agent Studio is a governed multi-user web application, the MVP must be server-first.

Correct storage decision:

```
MVP:
    server-first workspace storage
    Postgres source-of-truth
    Neo4j CE dedicated graph traversal backend
    Markdown-compatible import/export
    governed vaults
    DB-backed note versions
    permission-aware graph

Later:
    hybrid vault export/import

Much later:
    local-first / offline sync
```

### 4.10 Define Scope as Parallel Tracks

Controlled implementation tracks:

```
Track A — Durable Workspace
    vaults, notes, folders, markdown, frontmatter, links, backlinks,
    attachments, versions, search, shared-vault safety

Track B — Neo4j CE Graph Backend Readiness
    Neo4j CE configuration, GraphRepository, Cypher templates,
    projection sync, backend health, benchmark gate

Track C — Typed Graph Engine
    nodes, edges, ontology, constraints, projections, graph cache,
    saved views, graph lenses, impact analysis

Track D — Institutional Memory
    people, projects, systems, decisions, policies, workflows,
    ownership, timelines, outcomes, governance records

Track E — GraphRAG Retrieval
    full-text search, vector search, Neo4j graph traversal,
    Cypher query templates, guarded Text2Cypher, graph algorithms, citations

Track F — Graph Agent Runtime
    schema inspection, query planning, graph tool selection,
    provenance explanation, governed action routing

Track G — Runtime Binding
    RAG, RAC, CAG, Graph Skills, MCP, workflow, policy,
    trace, audit, source-note references

Track H — Evaluation / Self-Correction
    golden questions, graph quality metrics, user feedback,
    correction proposals, semantic enrichment, human review, rollback

Track I — Full Obsidian-like Capability Completion
    Canvas, Bases, plugin framework, sync, publish

Track J — Production Graph Platform Expansion
    Neo4j Enterprise / Aura upgrade, HA, backup, RBAC, advanced algorithms,
    multi-agent GraphRAG, code graph, security graph
```

### 4.11 Do Not Overbuild the MVP

Deferred from MVP: full Canvas, full Bases, third-party plugin runtime, real-time collaborative editing, offline-first sync, publish platform, advanced block references, math / diagrams, browser clipper, multi-agent GraphRAG, cross-workspace GraphRAG, advanced code intelligence graph, advanced security graph, automatic graph mutation by agents, Neo4j Enterprise / Aura production upgrade.

Not deferred anymore: GraphRepository abstraction, Neo4j CE dedicated graph backend, Postgres/Neo4j benchmark, projection sync, GraphRAG retrieval layer, Graph Agent Lite, Cypher query templates, guarded Text2Cypher foundation.

### 4.12 Governance Is Mandatory

A note must not become runtime-active automatically.

Correct promotion model:

```
Note v3
    ↓
Promotion Candidate
    ↓
Validation
    ↓
Governance Review
    ↓
Approval if required
    ↓
Runtime Asset Draft
    ↓
Active Runtime Asset Version
```

If the note changes later:

```
Note v4
    ↓
New Promotion Candidate
```

It must not silently mutate runtime behavior.

### 4.13 Reference Is Not Promotion

A runtime object can reference a note version for traceability without using that note as runtime context.

Rule:

- Referenced note does not automatically enter the prompt.
- Only governed runtime asset content enters the prompt.
- Referenced note is available for audit, explanation, backlinks, and traceability.

This applies to: CAG blocks, Graph Skill Packs, Tool Knowledge, Policies, Workflows, Runtime Traces, Decision Traces, Code References, Security References, Institutional Memory References, Neo4j projected graph facts.

### 4.14 Runtime-Active Assets Must Be Version-Pinned

Runtime-active assets must bind to immutable source versions: `note_version_id`, `source_artifact_version_id`, `graph_entity_version_id`, `tool_schema_version_id`, `policy_version_id`, `workflow_version_id`, `graph_skill_version_id`, `query_template_version_id`, `neo4j_projection_snapshot_id`.

No runtime-active asset may bind only to a mutable note or mutable graph fact.

### 4.15 MCP Is a Tool Boundary, Not the Agent Layer

Correct model:

- MCP exposes controlled tools/resources.
- CAG and Graph Skills guide usage.
- GraphRAG retrieves graph-grounded context from Neo4j CE and other retrievers.
- Graph Agent orchestrates retrieval, explanation, and governed actions.
- Approval gates decide whether actions can proceed.
- MCP dispatcher executes tools only after policy allows it.

Hard rule:

- Graph traversal must not execute tools.
- Approval must not execute tools.
- CAG must not execute tools.
- Graph Skill Packs must not execute tools.
- Graph Agent must not bypass MCP dispatcher.
- Neo4j query execution must not bypass GraphRepository.

### 4.16 GraphRAG Is Core, Not V2

This roadmap uses this terminology:

- **GraphRAG Retrieval Layer:** graph traversal, vector search, full-text search, hybrid ranking, Cypher query templates, guarded Text2Cypher, citations, context safety filter.
- **Agentic GraphRAG:** Graph Agent chooses retrieval strategy, graph skill, query template, graph algorithm, and explanation path.

Therefore:

- **Phase 12** = GraphRAG Retrieval Layer
- **Phase 13** = Graph Agent Lite
- **Phase 13.5** = Graph Agent Advanced / Agentic GraphRAG

V2 may contain: Advanced GraphRAG, multi-agent GraphRAG, cross-workspace GraphRAG, large-scale graph algorithm optimization, Neo4j Enterprise / Aura hardening.

### 4.17 Provenance and Lineage Apply to Every Graph Fact

Every graph node and edge must record:

- `source_type`, `source_id`, `source_version_id`, `source_locator`
- `created_by_user_id`, `created_by_process`, `created_by_agent_id`
- `confidence`, `lineage_status`, `extraction_method`, `validation_status`, `governance_status`
- `created_at`, `updated_at`, `valid_from`, `valid_to`
- `neo4j_node_id`, `neo4j_relationship_id`, `projection_snapshot_id`

Without this, graph growth becomes untrusted.

### 4.18 Entity Resolution Is Mandatory, But Automation Must Be Controlled

Entity resolution must support: canonical IDs, aliases, merge candidates, duplicate detection, confidence scoring, human approval, safe auto-merge policy, entity split, entity rollback, provenance preservation, Neo4j projection update after merge/split.

Safe auto-merge may be allowed only when: same workspace, same entity type, same canonical normalized label, no conflicting provenance, no conflicting temporal fact, rollback is available, policy allows auto-merge, projection update is safe.

Ambiguous cases require human review.

### 4.19 Self-Correction Must Include Structural and Semantic Improvement

The system must support:

- **Graph Quality Agent:** detects structural graph problems.
- **Semantic Enrichment Agent:** proposes semantic improvements using source-backed LLM reasoning.

Semantic enrichment proposal types: improve node description, infer missing category, propose missing relationship, standardize naming, suggest aliases, summarize source note into entity description, detect contradiction candidates, suggest evaluation cases.

Rules: proposal-only, source-backed, confidence-scored, human/governance reviewed, rollbackable, no silent graph mutation, Neo4j projection updated only after approved Postgres source-of-truth change.

### 4.20 User Feedback Is Part of the Architecture

Failure states include: promotion failed, note conflict, entity merge conflict, Neo4j unavailable, Neo4j degraded, projection sync failed, projection drift detected, graph query timeout, backlink refresh failed, runtime reference hidden by permission, CAG reference invalidated, Graph Skill reference invalidated, tool schema changed, graph projection stale, search index stale, query cache stale, Text2Cypher rejected, golden question failed, graph correction rejected, semantic enrichment rejected, background job failed.

The UI must show: loading states, empty states, permission-denied states, conflict warnings, promotion validation errors, Neo4j degraded states, projection sync status, graph query timeout UI, partial graph loading, stale graph indicators, correction proposal status, evaluation failure status, retry actions, background job status.

---

## 5. Early Architecture Decisions

These decisions must be made before feature implementation.

### 5.1 Storage Model ADR

Create: `docs/architecture/agent-studio-native-graph-workspace-storage-model.md`

Decision:

```
MVP = Server-first
Postgres = source of truth
Neo4j Community Edition = dedicated projected graph backend
Later = Hybrid
Much later = Local-first / offline sync
```

Postgres responsibility: workspace persistence, notes, versions, metadata, permissions, editing locks, audit records, promotion records, governance records.

Neo4j CE responsibility: typed graph traversal, multi-hop queries, graph algorithms where supported, GraphRAG path expansion, impact analysis, runtime trace graph paths, decision trace graph paths, Graph Agent graph reasoning.

**Acceptance criteria:**
- [ ] Server-first MVP confirmed.
- [ ] Postgres workspace responsibility defined.
- [ ] Neo4j CE graph responsibility defined.
- [ ] Projection sync responsibility defined.
- [ ] Local-first/offline sync explicitly deferred.

### 5.2 KG / GraphRAG / Agentic GraphRAG / Graph Agent ADR

Create: `docs/architecture/agent-studio-kg-graphrag-graph-agent-taxonomy.md`

| Concept | Role |
|---|---|
| Knowledge Graph | Structured durable context and memory layer. |
| GraphRAG | Retrieval layer over graph-grounded knowledge plus vector/full-text context. |
| Agentic GraphRAG | Agent plans which retrieval tools and graph paths to use. |
| Graph Agent | Operational graph-aware agent that queries, traverses, explains, and routes governed actions. |
| MCP | Controlled tool/resource interface. |
| CAG / Graph Skills | Runtime procedural guidance and capability context. |
| Neo4j CE | Dedicated graph backend for projected graph traversal and GraphRAG. |
| Postgres | Source of truth for workspace, governance, permissions, and audit records. |

**Acceptance criteria:**
- [ ] Terms are clearly separated.
- [ ] GraphRAG is not deferred to V2.
- [ ] Agentic GraphRAG is tied to Graph Agent runtime.
- [ ] MCP is not treated as the Graph Agent.
- [ ] Neo4j CE is defined as graph backend, not workspace source of truth.

### 5.3 GraphRepository and Backend Strategy ADR

Create: `docs/architecture/agent-studio-graph-repository-and-backend-strategy.md`

Required repositories:

```
GraphRepository
├── PostgresGraphRepository
├── Neo4jCommunityGraphRepository
├── MemgraphGraphRepository
├── FalkorDbGraphRepository
└── TestGraphRepository
```

Required interfaces:

- `GraphTraversalRepository`
- `GraphProjectionRepository`
- `GraphProjectionSyncRepository`
- `GraphQueryTemplateRepository`
- `GraphAlgorithmRepository`
- `GraphPermissionRepository`
- `GraphExplainRepository`
- `GraphBenchmarkRepository`
- `GraphBackendHealthRepository`

Backend capability registry: `supportsCypher`, `supportsGql`, `supportsRecursiveTraversal`, `supportsGraphAlgorithms`, `supportsVectorIndex`, `supportsFullTextIndex`, `supportsPermissionFilterPushdown`, `supportsQueryExplain`, `supportsTemporalQueries`, `supportsBatchProjection`, `supportsStreamingResults`, `supportsCommunityEditionLimitations`, `supportsEnterpriseUpgradePath`.

Decision: Neo4j Community Edition is the default dedicated graph backend candidate for MVP. Postgres remains baseline and fallback for shallow graph only. Memgraph remains secondary benchmark candidate. FalkorDB remains optional low-latency experiment.

**Acceptance criteria:**
- [ ] GraphRepository interface exists before graph feature implementation.
- [ ] Neo4jCommunityGraphRepository exists before Phase 7.
- [ ] No advanced graph feature directly depends on Postgres SQL.
- [ ] No advanced graph feature directly depends on raw Cypher outside repository boundary.
- [ ] Backend capability registry exists.
- [ ] Backend promotion criteria are documented.

### 5.4 Neo4j Community Edition Architecture ADR

Create: `docs/architecture/agent-studio-neo4j-community-edition-graph-backend.md`

Purpose: Define Neo4j Community Edition as the MVP dedicated graph backend for projected graph workloads.

Neo4j CE graph labels: `Note`, `NoteVersion`, `Tag`, `Attachment`, `Entity`, `Observation`, `Agent`, `KnowledgeUnit`, `CAGBlock`, `GraphSkillPack`, `MCPTool`, `Policy`, `Workflow`, `RuntimeTrace`, `DecisionTrace`, `DecisionTraceStep`, `EvaluationCase`, `Service`, `DbTable`, `CodeFile`, `SecurityFinding`.

Neo4j CE relationship types: `VERSION_OF`, `LINKS_TO`, `HAS_TAG`, `EMBEDS`, `MENTIONS`, `HAS_ALIAS`, `OBSERVED_AS`, `PROMOTED_TO`, `REFERENCES_NOTE_VERSION`, `USED_CAG_BLOCK`, `USED_GRAPH_SKILL`, `USED_MCP_TOOL`, `HAS_DECISION_TRACE`, `HAS_STEP`, `DERIVED_FROM_SOURCE`, `GOVERNS`, `DEPENDS_ON`, `USES`, `CALLS`, `AFFECTS`.

Required Cypher query template categories: `local_graph_depth_1`, `local_graph_depth_2`, `local_graph_depth_3`, `global_graph_sample`, `note_backlinks`, `cag_source_notes`, `graph_skill_source_notes`, `runtime_trace_path`, `decision_trace_path`, `impact_analysis`, `tool_policy_dependencies`, `workflow_tool_dependencies`, `code_dependency_path`, `security_blast_radius`, `entity_neighborhood`.

Neo4j CE limits to document: single-instance deployment, no enterprise clustering, no enterprise failover, limited enterprise RBAC/LDAP capabilities, backup/HA strategy must be external or deferred, production upgrade path needed for enterprise operations.

**Acceptance criteria:**
- [ ] Neo4j CE architecture ADR exists.
- [ ] Labels and relationship types are defined.
- [ ] Cypher query template categories are defined.
- [ ] CE limitations are documented.
- [ ] Enterprise/Aura upgrade path is documented.

### 5.5 Graph Backend Evaluation Matrix ADR

Create: `docs/architecture/agent-studio-graph-backend-evaluation-matrix.md`

| Backend | Role |
|---|---|
| Postgres graph tables | Source-of-truth workspace DB and shallow graph fallback. |
| Neo4j Community Edition | Default dedicated graph backend candidate for MVP graph workloads. |
| Memgraph | Secondary benchmark candidate for interactive/developer graph workloads. |
| FalkorDB | Optional low-latency experimental candidate. |
| Neo4j Enterprise / Aura | Future production-hardening / managed graph upgrade path. |
| CodeGraph layer | Code intelligence layer, not graph DB backend. |

Evaluation criteria: traversal latency, permission-aware traversal, depth-3 performance, impact analysis performance, runtime trace graph loading, query language expressiveness, Cypher template support, schema/constraint support, graph algorithm support, Text2Cypher support, GraphRAG support, MCP/server ecosystem, operational complexity, hosting complexity, cost, migration complexity, developer ergonomics, Community vs Enterprise limitations, production upgrade path.

**Acceptance criteria:**
- [ ] Backend matrix exists.
- [ ] Neo4j CE is evaluated before Phase 7.
- [ ] Memgraph is evaluated as secondary option.
- [ ] FalkorDB is benchmark-only unless results justify promotion.
- [ ] Neo4j Enterprise/Aura upgrade path is documented.
- [ ] CodeGraph category is not confused with graph DB storage.

### 5.6 Neo4j / Aura Agent Reference Architecture ADR

Create: `docs/architecture/agent-studio-neo4j-aura-agent-reference-architecture.md`

Purpose: Evaluate Neo4j Aura Agent as a reference pattern, not as mandatory dependency.

Evaluate as reference for: ontology-driven graph agent creation, REST exposure, MCP exposure, graph-grounded assistant testing, graph agent lifecycle management, Cypher-oriented tool design, graph schema inspection, managed graph agent operations.

Custom Agent Studio Graph Agent justification:

```
Agent Studio needs custom integration with:
- existing CAG
- RAC
- MCP dispatcher
- governance gates
- OpenRouter model access
- runtime traces
- decision traces
- Agent Studio UI
- note promotion/versioning model
- Postgres/Neo4j projection model
```

**Acceptance criteria:**
- [ ] Aura Agent evaluated as architectural reference.
- [ ] Decision to build custom Graph Agent is justified.
- [ ] Useful interface patterns are extracted.
- [ ] No dependency is introduced unless explicitly approved.

---

## 6. Roadmap Overview

```
Phase 0      — Repository Reconciliation and Non-Build List
Phase 0.5    — Existing Data Migration and Projection Plan
Phase 1      — Architecture Decisions and Evaluation Design
Phase 1.1    — KG / GraphRAG / Graph Agent Taxonomy
Phase 1.2    — GraphRepository and Backend Strategy
Phase 1.3    — Neo4j Community Edition Graph Backend Architecture
Phase 1.4    — Early Graph Backend Benchmark Spike
Phase 1.5    — Backend Decision Gate and Neo4j CE Promotion
Phase 1.6    — Ontology, Constraints, Provenance, Entity Resolution
Phase 1.7    — Projection Sync Architecture
Phase 2      — Native Vault Core with Collaboration Safety
Phase 2.5    — Shared Editing Lock and Conflict UX
Phase 3      — Agent Studio Markdown Profile and Editor MVP
Phase 4      — Properties / Frontmatter / Metadata Domains
Phase 5      — Wikilinks, Backlinks, and Link Engine MVP
Phase 6      — Search, Quick Switcher, Command Palette, Ask Agent
Phase 7      — Minimal Typed Graph Store and Neo4j Projection Layer
Phase 7.5    — Active Neo4j CE Graph Backend Implementation
Phase 8      — Local / Global Graph MVP with Layout Registry
Phase 9      — Graph Customization and Governance-Aware Views
Phase 10     — Lightweight Runtime References: CAG / Graph Skill → Source Note
Phase 11     — Promotion Workflows with Versioning and Rollback
Phase 11.5   — Graph Change Proposals and Entity Resolution Workflows
Phase 12     — GraphRAG Retrieval Layer
Phase 12.5   — Graph Skill Packs and Cypher Query Template System
Phase 13     — Graph Agent Lite Runtime
Phase 13.5   — Graph Agent Advanced / Agentic GraphRAG
Phase 14     — Runtime Trace, Decision Trace, and Audit Graph with Retention
Phase 15     — Templates, Attachments, Import / Export MVP
Phase 16     — Saved Views as Lightweight Bases Precursor
Phase 17     — Canvas Strategy and Deferred Canvas Implementation
Phase 18     — Extension Framework Strategy
Phase 19     — Sync / Publish Strategy
Phase 20     — Performance Benchmarks and Scale Validation
Phase 20.5   — Code Graph Parser Spike
Phase 21     — Continuous Graph Testing and Benchmark CI
Phase 22     — User Feedback and Failure-State Implementation
Phase 23     — Graph Quality Agent and Semantic Self-Correction Loop
Phase 24     — Full V1 Expansion: Canvas, Bases, Lenses, Impact
Phase 25     — V1.5 Expansion: Institutional, Code, Security, and Recommendation Graphs
Phase 26     — V2 Expansion: Plugins, Sync, Publish, Advanced GraphRAG
Phase 27     — Neo4j Enterprise / Aura Production Hardening Path
Phase 28     — Governance, Evaluation, Hardening
```

> **Detailed phase content** (Phase 0 through Phase 28, including goal, required actions, deliverables, data models, and acceptance criteria) is captured in full in this document via the next sections. The phases below preserve the original specification verbatim.

### Phase 0 — Repository Reconciliation and Non-Build List

**Goal:** Integrate the Native Graph Workspace into existing Agent Studio without duplicating existing systems.

**Required Actions:** Read AGENTS.md. Inspect existing Agent Studio module boundaries. Inspect existing UI routes. Inspect existing CAG Capability Pack system. Inspect existing RAC prompt composer / runtime path. Inspect existing MCP dispatcher. Inspect governance and approval scaffolding. Inspect DB / Drizzle schema conventions. Inspect current graph, RAG, RAC, CAG, MCP, and code architecture features. Inspect existing runtime trace implementation. Inspect existing OpenRouter model access path. Inspect existing deployment/runtime assumptions. Produce a delta plan.

**Must Explicitly State What Not To Build:**

- Do not reimplement existing CAG storage.
- Do not replace existing MCP dispatcher.
- Do not bypass OpenRouter model access if it is the standard runtime model path.
- Do not force pgvector.
- Do not duplicate approval scaffolding.
- Do not create a separate runtime trace system if one exists.
- Do not create a separate Graph Agent runtime if an agent runtime already exists; extend it.
- Do not build plugin runtime in MVP.
- Do not build Canvas in MVP.
- Do not build full Bases in MVP.
- Do not implement real-time collaboration in MVP.
- Do not implement offline sync in MVP.
- Do not force all existing system records to become notes.
- Do not allow agents to mutate graph facts directly.
- Do not build advanced graph views before Neo4j CE benchmark and projection decision.
- Do not build Graph Agent runtime on Postgres-only graph traversal.
- Do not treat Neo4j CE as the workspace source of truth.

**Deliverables:**

- `docs/architecture/agent-studio-native-graph-workspace.md`
- `docs/implementation/native-graph-workspace-delta.md`
- `docs/architecture/agent-studio-graph-agent-integration-boundaries.md`
- `docs/architecture/agent-studio-postgres-neo4j-responsibility-split.md`
- CLAUDE.md update

**Acceptance Criteria:**
- [ ] Existing Agent Studio module mapped.
- [ ] Existing CAG/RAC/MCP/governance boundaries documented.
- [ ] Existing runtime trace path documented.
- [ ] Existing OpenRouter/model execution path documented.
- [ ] Native Graph Workspace placement defined.
- [ ] Graph Agent extension point defined.
- [ ] Postgres/Neo4j responsibility split documented.
- [ ] Non-build list documented.
- [ ] No duplication of existing CAG or MCP systems.
- [ ] No bypass of MCP dispatcher.
- [ ] No advanced graph feature planned without Neo4j CE graph backend gate.
- [ ] Implementation follows existing repo conventions.

### Phase 0.5 — Existing Data Migration and Projection Plan

**Goal:** Define how existing Agent Studio data enters the Native Graph Workspace and how source-of-truth records project into Neo4j CE.

**Existing Artifact Mapping:**

| Existing Artifact | Source of Truth | Neo4j Projection Action |
|---|---|---|
| Existing CAG packs | Postgres / existing CAG store | Project pack/block/version nodes and references |
| Existing CAG blocks | Postgres / existing CAG store | Project as runtime context nodes |
| Existing MCP tools | Existing MCP/tool registry | Project as tool graph nodes |
| Existing MCP servers | Existing MCP registry | Project as server nodes |
| Existing runtime traces | Runtime trace store | Project into runtime trace graph |
| Existing RAC sources | RAC source registry | Convert/link to Knowledge Units and source nodes |
| Existing docs / Markdown | File/import source then Postgres notes | Import into vault notes, then project links/entities |
| Existing approval policies | Governance store | Project into governance graph |
| Existing code architecture | Repo/static analysis | Project into code graph later |
| Existing tool knowledge | Existing tool knowledge store | Project into tool knowledge graph |
| Existing evaluations | Evaluation store | Project into evaluation graph |
| Existing agent definitions | Agent Studio store | Project as agent nodes |
| Existing OpenRouter model refs | Model/provider registry | Project as model/provider nodes where useful |

**Projection Rules:**
- Postgres or existing system store remains source of truth.
- Neo4j CE stores projected graph nodes and relationships.
- Projection records must preserve `source_id` and `source_version_id`.
- Projection sync must be replayable.
- Projection sync must be auditable.
- Projection drift must be detectable.

**Data Model:** `ags_migration_jobs`, `ags_migration_job_items`, `ags_migration_projection_results`, `ags_migration_audit_events`, `ags_graph_projection_sync_jobs`, `ags_graph_projection_sync_results`, `ags_graph_projection_drift_events`.

**Acceptance Criteria:**
- [ ] Existing CAG migration/projection plan exists.
- [ ] Existing MCP tool projection plan exists.
- [ ] Existing runtime trace projection plan exists.
- [ ] Existing RAC source projection plan exists.
- [ ] Existing approval/governance projection plan exists.
- [ ] Existing agent/model projection plan exists.
- [ ] Neo4j projection model is defined.
- [ ] Existing records are not forcibly converted into notes.
- [ ] Migration audit records source, target, status, and errors.
- [ ] Projection sync can be replayed safely.

### Phase 1 — Architecture Decisions and Evaluation Design

**Goal:** Make foundational decisions and define tests before feature implementation.

**Required ADRs:**

- `docs/architecture/agent-studio-native-graph-workspace-storage-model.md`
- `docs/architecture/agent-studio-postgres-neo4j-responsibility-split.md`
- `docs/architecture/agent-studio-kg-graphrag-graph-agent-taxonomy.md`
- `docs/architecture/agent-studio-graph-repository-and-backend-strategy.md`
- `docs/architecture/agent-studio-neo4j-community-edition-graph-backend.md`
- `docs/architecture/agent-studio-graph-backend-evaluation-matrix.md`
- `docs/architecture/agent-studio-neo4j-aura-agent-reference-architecture.md`
- `docs/architecture/agent-studio-graph-projection-sync.md`
- `docs/architecture/agent-studio-markdown-profile.md`
- `docs/architecture/agent-studio-note-metadata-domain-model.md`
- `docs/architecture/agent-studio-note-promotion-binding-semantics.md`
- `docs/architecture/agent-studio-lightweight-source-note-references.md`
- `docs/architecture/agent-studio-graph-ontology-registry.md`
- `docs/architecture/agent-studio-graph-constraint-registry.md`
- `docs/architecture/agent-studio-entity-resolution.md`
- `docs/architecture/agent-studio-graph-provenance-lineage.md`
- `docs/architecture/agent-studio-temporal-observation-model.md`
- `docs/architecture/agent-studio-graph-memory-model.md`
- `docs/architecture/agent-studio-runtime-graph-retention-policy.md`
- `docs/architecture/agent-studio-native-graph-workspace-performance-targets.md`
- `docs/architecture/agent-studio-graph-layout-registry.md`
- `docs/architecture/agent-studio-graph-query-cache-and-projection-snapshots.md`
- `docs/architecture/agent-studio-graphrag-retrieval-router.md`
- `docs/architecture/agent-studio-text2cypher-query-guardrails.md`
- `docs/architecture/agent-studio-cypher-query-template-system.md`
- `docs/architecture/agent-studio-graph-skill-packs.md`
- `docs/architecture/agent-studio-graph-agent-runtime.md`
- `docs/architecture/agent-studio-graph-context-safety-filter.md`
- `docs/architecture/agent-studio-shared-vault-editing-locks.md`
- `docs/architecture/agent-studio-native-graph-workspace-user-feedback.md`

**Required Evaluation Sets:** Markdown parsing, wikilink extraction, backlink generation, property parsing, GraphRepository backend evaluation, Postgres baseline traversal, Neo4j CE traversal, Neo4j CE projection sync, Neo4j CE Cypher query template, Neo4j CE guarded Text2Cypher, Memgraph traversal, FalkorDB benchmark, ontology validation, graph constraint validation, entity resolution, provenance/lineage, temporal observation, graph projection, graph permission, graph traversal, graph query cache, graph retention, GraphRAG retrieval, query template, Graph Skill Pack, Graph Agent Lite, Graph Agent Advanced, golden question, promotion workflow, promotion rollback, graph correction proposal, semantic enrichment proposal, MCP boundary, raw artifact blocking, concurrent edit conflict, performance benchmark, user feedback / failure-state.

**Acceptance Criteria:**
- [ ] All required ADRs exist.
- [ ] Postgres/Neo4j responsibility split exists.
- [ ] Neo4j CE architecture ADR exists.
- [ ] Projection sync ADR exists.
- [ ] Backend benchmark plan exists.
- [ ] Backend promotion decision gate exists.
- [ ] Evaluation cases exist before feature implementation.
- [ ] GraphRepository tests exist.
- [ ] Neo4j CE tests exist.
- [ ] Markdown profile tests exist.
- [ ] Link extraction tests exist.
- [ ] Ontology tests exist.
- [ ] Constraint registry tests exist.
- [ ] Entity resolution tests exist.
- [ ] Provenance tests exist.
- [ ] Graph projection tests exist.
- [ ] GraphRAG tests exist.
- [ ] Graph Agent Lite tests exist.
- [ ] Golden question tests exist.
- [ ] Raw artifact blocking tests exist.
- [ ] MCP boundary tests exist.

### Phase 1.1 — KG / GraphRAG / Graph Agent Taxonomy

**Goal:** Prevent architectural confusion before implementation.

**Required Definitions:**

- **Knowledge Graph:** structured durable memory/context layer.
- **GraphRAG:** retrieval layer over graph-grounded knowledge plus vector/full-text context.
- **Agentic GraphRAG:** Graph Agent dynamically chooses retrieval strategy, graph tools, and graph paths.
- **Graph Agent:** deployed operational graph-aware agent that queries, traverses, explains, and routes governed actions.
- **MCP:** controlled tool/resource interface.
- **Graph Skill Pack:** procedural graph capability guidance for agents.
- **Postgres:** source of truth for workspace, governance, permissions, and audit records.
- **Neo4j Community Edition:** dedicated graph database for projected graph traversal and GraphRAG workloads.

**Acceptance Criteria:**
- [ ] Graph Agent is defined as first-class runtime layer.
- [ ] GraphRAG is a Phase 12 capability, not V2-only.
- [ ] Agentic GraphRAG is Phase 13.5 capability.
- [ ] MCP is not treated as equivalent to Graph Agent.
- [ ] Graph Skill Packs are distinguished from CAG blocks.
- [ ] Neo4j CE is defined as graph backend, not source-of-truth workspace DB.

### Phase 1.2 — GraphRepository and Backend Strategy

**Goal:** Implement graph backend abstraction before graph feature implementation.

**Required Interfaces:** `GraphRepository`, `GraphTraversalRepository`, `GraphProjectionRepository`, `GraphProjectionSyncRepository`, `GraphQueryTemplateRepository`, `GraphAlgorithmRepository`, `GraphPermissionRepository`, `GraphExplainRepository`, `GraphBenchmarkRepository`, `GraphBackendHealthRepository`.

**Required Backends:** `PostgresGraphRepository`, `Neo4jCommunityGraphRepository`, `MemgraphGraphRepository`, `FalkorDbGraphRepository`, `TestGraphRepository`.

**Acceptance Criteria:**
- [ ] GraphRepository interface exists.
- [ ] PostgresGraphRepository baseline exists.
- [ ] Neo4jCommunityGraphRepository exists.
- [ ] MemgraphGraphRepository spike interface exists.
- [ ] Backend capability registry exists.
- [ ] Advanced graph code uses GraphRepository only.
- [ ] Raw Cypher does not leak outside repository/query-template boundary.
- [ ] Backend promotion decision logic documented.

### Phase 1.3 — Neo4j Community Edition Graph Backend Architecture

**Goal:** Define Neo4j CE as the dedicated graph database for MVP graph workloads.

**Required Work:** Define Neo4j labels. Define Neo4j relationship types. Define uniqueness constraints where supported. Define indexes. Define projection sync model. Define Cypher query template model. Define permission filter strategy. Define projection snapshot strategy. Define fallback/degraded mode. Define CE limitation policy. Define Enterprise/Aura upgrade path.

**Neo4j Labels:** `Workspace`, `Vault`, `Note`, `NoteVersion`, `Tag`, `Attachment`, `Entity`, `Observation`, `Agent`, `KnowledgeUnit`, `CAGBlock`, `GraphSkillPack`, `MCPTool`, `MCPServer`, `Policy`, `Workflow`, `RuntimeTrace`, `DecisionTrace`, `DecisionTraceStep`, `EvaluationCase`, `Service`, `DbTable`, `CodeFile`, `SecurityFinding`.

**Neo4j Relationship Types:** `VERSION_OF`, `BELONGS_TO_WORKSPACE`, `BELONGS_TO_VAULT`, `LINKS_TO`, `HAS_TAG`, `EMBEDS`, `MENTIONS`, `HAS_ALIAS`, `OBSERVED_AS`, `PROMOTED_TO`, `REFERENCES_NOTE_VERSION`, `USED_CAG_BLOCK`, `USED_GRAPH_SKILL`, `USED_MCP_TOOL`, `HAS_DECISION_TRACE`, `HAS_STEP`, `DERIVED_FROM_SOURCE`, `GOVERNS`, `DEPENDS_ON`, `USES`, `CALLS`, `AFFECTS`.

**Acceptance Criteria:**
- [ ] Neo4j CE backend architecture exists.
- [ ] Label model exists.
- [ ] Relationship model exists.
- [ ] Constraint/index plan exists.
- [ ] Projection sync model exists.
- [ ] Cypher template categories exist.
- [ ] CE limitations documented.
- [ ] Enterprise/Aura upgrade path documented.

### Phase 1.4 — Early Graph Backend Benchmark Spike

**Goal:** Validate Neo4j CE and compare it to Postgres baseline before advanced graph features.

**Benchmark Candidates:** Postgres recursive CTE baseline. Neo4j Community Edition Cypher traversal. Memgraph traversal. FalkorDB low-latency graph query.

**Required Spike Tests:** depth-1 / depth-2 / depth-3 local graph traversal, impact analysis traversal, runtime trace graph loading, decision trace graph loading, permission-aware edge filtering, projection sync throughput, projection rebuild, query cache effectiveness, projection snapshot effectiveness, ontology-filtered traversal, entity-resolution-aware traversal, Cypher query template execution, guarded Text2Cypher dry-run, graph algorithm availability.

**Target Dataset:** 10,000 notes / 100,000 links / 50,000 graph nodes / 250,000 graph edges / 10,000 runtime traces / 1,000 decision traces / 1,000 graph skill references / 500 golden questions.

**Acceptance Criteria:**
- [ ] Postgres traversal spike completed.
- [ ] Neo4j CE traversal spike completed.
- [ ] Neo4j CE projection sync spike completed.
- [ ] Memgraph traversal spike completed or explicitly waived.
- [ ] FalkorDB benchmark completed or explicitly deferred.
- [ ] Recursive CTE behavior measured.
- [ ] Cypher traversal behavior measured.
- [ ] Depth-3 traversal measured.
- [ ] Impact analysis traversal measured.
- [ ] Runtime trace graph load measured.
- [ ] Permission-aware traversal benchmarked.
- [ ] Projection sync throughput measured.
- [ ] Backend recommendation produced.

### Phase 1.5 — Backend Decision Gate and Neo4j CE Promotion

**Goal:** Decide whether Neo4j CE becomes active graph backend for Phase 7+.

**Default Decision:** Neo4j Community Edition should be promoted as active graph backend for MVP graph workloads unless its benchmark fails or operational constraints block adoption.

**Decision Rules:**

Postgres may remain active graph backend only if it passes: depth-3 permission-aware traversal p95 target, runtime trace graph loading p95 target, impact analysis p95 target, query cache correctness tests, permission leakage tests, projection rebuild tests.

Neo4j CE should become active graph backend if it passes: depth-3 traversal target, permission-aware traversal target, runtime trace path target, projection sync target, Cypher query template target, GraphRAG expansion target, backend health/degraded-mode requirements.

If Neo4j CE fails: Memgraph may be evaluated for active graph backend. Postgres remains workspace source of truth and shallow graph fallback. Advanced graph features are blocked until backend decision is resolved.

**Decision Output:** `docs/architecture/agent-studio-active-graph-backend-decision.md`

**Acceptance Criteria:**
- [ ] Backend decision is recorded.
- [ ] Neo4j CE promotion decision is explicit.
- [ ] Active graph backend is selected for Phase 7+.
- [ ] Postgres fallback responsibilities documented.
- [ ] Neo4j CE responsibilities documented.
- [ ] Projection sync strategy documented.
- [ ] Advanced graph views are blocked until this gate passes.

### Phase 1.6 — Ontology, Constraints, Provenance, Entity Resolution

**Goal:** Make the graph trustworthy before it becomes large.

**Required Components:** Graph Ontology Registry. Graph Constraint Registry. Entity Resolution Layer. Provenance / Lineage Layer. Temporal Observation Model. Graph Memory Model. Neo4j Projection Provenance Model.

**MVP Node Types:** `Note`, `NoteVersion`, `Tag`, `Attachment`, `Agent`, `KnowledgeUnit`, `Entity`, `Observation`, `CAGBlock`, `GraphSkillPack`, `MCPTool`, `RuntimeTrace`, `DecisionTrace`, `DecisionTraceStep`, `Policy`, `Workflow`, `EvaluationCase`.

**MVP Edge Types:** `NOTE_VERSION_OF_NOTE`, `NOTE_LINKS_TO_NOTE`, `NOTE_HAS_TAG`, `NOTE_EMBEDS_ATTACHMENT`, `NOTE_MENTIONS_ENTITY`, `ENTITY_HAS_ALIAS`, `OBSERVATION_ABOUT_ENTITY`, `NOTE_PROMOTED_TO_KNOWLEDGE_UNIT`, `NOTE_PROMOTED_TO_CAG_BLOCK`, `NOTE_PROMOTED_TO_GRAPH_SKILL`, `CAG_BLOCK_REFERENCES_NOTE_VERSION`, `GRAPH_SKILL_REFERENCES_NOTE_VERSION`, `RUNTIME_USED_CAG_BLOCK`, `RUNTIME_USED_GRAPH_SKILL`, `RUNTIME_USED_MCP_TOOL`, `RUNTIME_TRACE_HAS_DECISION_TRACE`, `DECISION_TRACE_HAS_STEP`, `GRAPH_FACT_DERIVED_FROM_SOURCE`.

**Acceptance Criteria:**
- [ ] Ontology registry exists.
- [ ] Constraint registry exists.
- [ ] Entity resolution tables exist.
- [ ] Provenance fields exist on graph nodes and edges.
- [ ] Neo4j projected graph facts carry source references.
- [ ] Temporal observations are represented.
- [ ] Graph memory model is documented.
- [ ] Invalid graph edges are rejected.
- [ ] Duplicate entity candidates can be reviewed.

### Phase 1.7 — Projection Sync Architecture

**Goal:** Build the explicit Postgres → Neo4j CE projection architecture.

**Projection Types:** Note, NoteVersion, Tag, Wikilink, Backlink, Entity, Observation, CAG, Graph Skill, MCP tool, Policy, Workflow, Runtime trace, Decision trace, Evaluation projections.

**Projection Events:** `note.created`, `note.updated`, `note.version_created`, `note.deleted`, `note.restored`, `wikilink.changed`, `entity.detected`, `entity.merged`, `entity.split`, `promotion.approved`, `runtime_trace.created`, `decision_trace.created`, `policy.updated`, `tool_schema.changed`, `graph_correction.approved`, `semantic_enrichment.approved`.

**Data Model:** `ags_graph_projection_sync_jobs`, `ags_graph_projection_sync_results`, `ags_graph_projection_sync_errors`, `ags_graph_projection_drift_events`, `ags_graph_projection_snapshots`, `ags_graph_projection_rebuilds`.

**Acceptance Criteria:**
- [ ] Projection jobs can write to Neo4j CE.
- [ ] Projection jobs preserve source IDs and versions.
- [ ] Projection jobs are replayable.
- [ ] Projection failures are visible.
- [ ] Projection drift can be detected.
- [ ] Projection snapshot can be created.
- [ ] Rebuild from Postgres source of truth is possible.

### Phase 2 — Native Vault Core with Collaboration Safety

**Goal:** Create the persistent note workspace with shared-vault safety.

**Features:** Vaults, Shared Vaults, Folders, Notes, Note Versions, Trash / Deleted Notes, Attachments Metadata, Workspace Settings, Vault Settings, Permissions, Optimistic Locking, Concurrent Edit Detection, Manual Conflict Resolution, Audit Trail.

**Data Model:** `ags_vaults`, `ags_vault_members`, `ags_vault_folders`, `ags_vault_notes`, `ags_vault_note_versions`, `ags_vault_note_conflicts`, `ags_vault_attachments`, `ags_vault_trash`, `ags_vault_settings`.

**Acceptance Criteria:**
- [ ] User can create a vault.
- [ ] User can create shared vault membership.
- [ ] User can create folders.
- [ ] User can create notes.
- [ ] Notes store Markdown content.
- [ ] Notes have versions.
- [ ] Optimistic locking works.
- [ ] Concurrent edit conflict is detected.
- [ ] Notes can be restored from trash.
- [ ] Vault/folder/note permissions are enforced.

### Phase 2.5 — Shared Editing Lock and Conflict UX

**Goal:** Reduce confusing concurrent edits without implementing full real-time collaboration.

**Features:** Soft editing locks, Active editor indicator, Last active timestamp, Lock owner display, Lock expiration, Conflict warning, Manual override, Conflict diff UI, Save copy, Merge manually, Discard draft, Conflict audit.

**Data Model:** `ags_vault_note_edit_sessions`, `ags_vault_note_locks`, `ags_vault_note_conflict_resolutions`.

**Acceptance Criteria:**
- [ ] Opening a note creates an edit session.
- [ ] Users can see when another user is editing.
- [ ] Soft lock expires after inactivity.
- [ ] Save conflict shows latest version and user draft.
- [ ] User can save copy.
- [ ] User can manually merge.
- [ ] Conflict resolution is audited.

### Phase 3 — Agent Studio Markdown Profile and Editor MVP

**Goal:** Implement the Markdown editor using the formal Agent Studio Markdown Profile.

**MVP Markdown Features:** Markdown Editor, Source Mode, Reading Mode, Live Preview, Split Panes, Tabs, Outline, Headings, Paragraphs, Line Breaks, Bold, Italic, Strikethrough, Highlight, Block Quotes, Callouts, Ordered Lists, Unordered Lists, Nested Lists, Task Lists, Horizontal Rules, Inline Code, Code Blocks, Tables, Images / Basic Embeds, Comments, Escaped Formatting.

**Agent Studio Enhancements:** Ask Agent About Selection, Ask Agent About This Note, Why This Answer? for previous agent response, Promote Selection to CAG Block, Promote Selection to Graph Skill Pack, Promote Selection to Tool Knowledge, Promote Selection to Knowledge Unit, Reference Selection from CAG Block, Reference Selection from Graph Skill Pack, Validate Note Governance, Show Runtime Usage, Show Graph Projection Preview, Show Entity Extraction Preview, Show Neo4j Projection Status.

**MVP Safety Rule:**
- Ask Agent About This Note = read-only in MVP.
- No note mutation.
- No tool execution.
- No promotion without explicit action and governance.
- No referenced note enters runtime prompt automatically.
- No graph fact mutation by agent.
- No direct Neo4j mutation from UI outside approved projection/correction workflows.

**Acceptance Criteria:**
- [ ] Markdown editor works.
- [ ] Reading mode renders MVP Markdown.
- [ ] Source mode shows raw Markdown.
- [ ] Live preview works.
- [ ] Headings render and populate outline.
- [ ] Task lists can be toggled.
- [ ] Code blocks render.
- [ ] Tables render.
- [ ] Callouts render.
- [ ] Images/basic embeds render.
- [ ] Ask Agent About This Note works in read-only mode.
- [ ] Selection actions are available but governed.
- [ ] Graph projection preview is read-only.
- [ ] Neo4j projection status is visible.

### Phase 4 — Properties / Frontmatter / Metadata Domains

**Goal:** Add structured metadata while separating content, binding, governance, runtime, graph, and system concerns.

**Features:** Properties Panel, YAML Frontmatter, Text Properties, List Properties, Number Properties, Checkbox Properties, Date Properties, Date-Time Properties, Tags Property, Aliases Property, CSS Classes Property, JSON Property Import, Property Search, Property Rename, Property Display Modes, Metadata Validation, Domain-Aware Property Editing.

**Data Model:** `ags_vault_note_properties`, `ags_vault_property_definitions`, `ags_vault_property_types`, `ags_vault_property_domains`.

**Required Metadata Domains:** `content.*`, `binding.*`, `governance.*`, `runtime.*`, `graph.*`, `system.*`, `projection.*`.

**Acceptance Criteria:**
- [ ] Notes support YAML/frontmatter properties.
- [ ] Properties can be edited in UI.
- [ ] Property types are enforced.
- [ ] Property domains are separated.
- [ ] Properties can be searched.
- [ ] Tags and aliases work as properties.
- [ ] Governance metadata is namespaced.
- [ ] Binding metadata is namespaced.
- [ ] Graph metadata is namespaced.
- [ ] Projection metadata is namespaced.

### Phase 5 — Wikilinks, Backlinks, and Link Engine MVP

**Goal:** Implement core internal linking and backlink discovery.

**MVP Features:** Wikilinks `[[Note]]`. Markdown Links. Heading Links `[[Note#Heading]]`. Aliases `[[Note|Alias]]`. Link Autocomplete. Automatic Link Update on Rename. Embedded Links `![[Note]]`. Embedded Attachments. Backlinks. Unlinked Mentions. Outgoing Links. Broken Link Detection. Entity Mention Detection. Projection of links into Neo4j CE.

**Deferred Features:** Full Block References, Block ID Generation, Block-Level Graph Edges, Advanced Transclusion.

**Data Model:** `ags_vault_wikilinks`, `ags_vault_backlinks`, `ags_vault_unlinked_mentions`, `ags_vault_outgoing_links`, `ags_vault_embeds`, `ags_vault_entity_mentions`.

**Neo4j Projection:**

```cypher
(:NoteVersion)-[:LINKS_TO]->(:Note)
(:NoteVersion)-[:MENTIONS]->(:Entity)
(:NoteVersion)-[:EMBEDS]->(:Attachment)
(:NoteVersion)-[:HAS_TAG]->(:Tag)
```

**Acceptance Criteria:**
- [ ] Wikilinks parse.
- [ ] Markdown links parse.
- [ ] Heading links work.
- [ ] Link aliases work.
- [ ] Embeds work.
- [ ] Backlinks are generated.
- [ ] Outgoing links are generated.
- [ ] Unlinked mentions are detected.
- [ ] Entity mentions are detected.
- [ ] Broken links are detected.
- [ ] Renaming a note updates links.
- [ ] Link graph projects to Neo4j CE.
- [ ] Block references are explicitly deferred.

### Phase 6 — Search, Quick Switcher, Command Palette, Ask Agent

**Goal:** Add dynamic workspace navigation and action execution.

**Features:** Full-Text Search, Property Search, Tag Search, Link Search, Entity Search, Neo4j Graph Entity Search, Saved Searches, Quick Switcher, Command Palette, Slash Commands, Hotkeys, Recent Files, Bookmarks, Random Note.

**Agent Studio Commands:** Ask Agent About This Note, Ask Agent About Selection, Explain Graph Path, Show Why This Answer?, Promote Note to Knowledge Unit, Promote Note to CAG Block, Promote Note to Graph Skill Pack, Promote Note to Tool Knowledge, Promote Note to Workflow, Promote Note to Policy, Reference Note from CAG Block, Reference Note from Graph Skill Pack, Open RAG Lens, Open RAC Lens, Open CAG Lens, Open Graph Skill Lens, Open MCP Lens, Open Graph Quality Lens, Run Impact Analysis, Export Runtime Trace to Note, Create Graph Correction Proposal, Inspect Neo4j Projection, Refresh Projection.

**Acceptance Criteria:**
- [ ] Search finds notes by content.
- [ ] Search filters by properties.
- [ ] Search filters by tags.
- [ ] Search finds entities.
- [ ] Neo4j entity search works through GraphRepository.
- [ ] Quick Switcher opens notes.
- [ ] Command Palette runs workspace commands.
- [ ] Slash commands work in editor.
- [ ] Hotkeys can be assigned.
- [ ] Ask Agent About This Note works read-only.
- [ ] Agent Studio commands are available.

### Phase 7 — Minimal Typed Graph Store and Neo4j Projection Layer

**Goal:** Create the deterministic typed graph foundation using Postgres source records and Neo4j CE projections.

**Backend Rule:**
- All graph operations use GraphRepository.
- Postgres stores source records and graph metadata.
- Neo4j CE stores projected traversal graph.
- Postgres may support shallow fallback only.
- Advanced graph traversal uses Neo4jCommunityGraphRepository.

**MVP Node Types:** `Note`, `NoteVersion`, `Tag`, `Attachment`, `Agent`, `KnowledgeUnit`, `Entity`, `Observation`.

**Optional Node Types** (only if corresponding integration exists): `CAGBlock`, `GraphSkillPack`, `MCPTool`, `RuntimeTrace`, `DecisionTrace`, `Policy`, `Workflow`, `EvaluationCase`.

**MVP Edge Types:** `NOTE_VERSION_OF_NOTE`, `NOTE_LINKS_TO_NOTE`, `NOTE_HAS_TAG`, `NOTE_EMBEDS_ATTACHMENT`, `NOTE_MENTIONS_ENTITY`, `ENTITY_HAS_ALIAS`, `OBSERVATION_ABOUT_ENTITY`, `NOTE_PROMOTED_TO_KNOWLEDGE_UNIT`, `AGENT_USES_NOTE`, `CAG_BLOCK_REFERENCES_NOTE_VERSION`, `GRAPH_SKILL_REFERENCES_NOTE_VERSION`.

**Data Model:** `ags_graph_nodes`, `ags_graph_edges`, `ags_graph_node_properties`, `ags_graph_edge_properties`, `ags_graph_projections`, `ags_graph_query_cache`, `ags_graph_projection_snapshots`, `ags_graph_entities`, `ags_graph_entity_aliases`, `ags_graph_observations`, `ags_graph_projection_sync_jobs`, `ags_graph_projection_sync_results`.

**Acceptance Criteria:**
- [ ] GraphRepository-backed graph store exists.
- [ ] Neo4j CE is active graph backend unless explicitly rejected by benchmark.
- [ ] Notes become graph nodes.
- [ ] Note versions become graph nodes.
- [ ] Tags become graph nodes.
- [ ] Attachments become graph nodes.
- [ ] Wikilinks become graph edges.
- [ ] Entity mentions become entity edges.
- [ ] Graph nodes have provenance.
- [ ] Graph edges have provenance.
- [ ] Neo4j nodes/relationships preserve source references.
- [ ] Graph query cache exists.
- [ ] Graph projection snapshots exist.
- [ ] Graph projection tests pass.

### Phase 7.5 — Active Neo4j CE Graph Backend Implementation

**Goal:** Implement Neo4j CE as the active dedicated graph backend for MVP graph features.

**Scope:** Neo4jCommunityGraphRepository. Neo4j connection configuration. Neo4j health checks. Neo4j label/index/constraint setup. Cypher query template registry. Permission filter strategy. Projection sync from Postgres workspace records. Graph import/export. GraphRAG query support. Runtime trace path support. Decision trace path support. Impact analysis support. Fallback/degraded mode.

**Neo4j Query Template Categories:** `local_graph_depth_1`, `local_graph_depth_2`, `local_graph_depth_3`, `global_graph_sample`, `note_backlinks`, `entity_neighborhood`, `cag_source_notes`, `graph_skill_source_notes`, `runtime_trace_path`, `decision_trace_path`, `impact_analysis`, `tool_policy_dependencies`, `workflow_tool_dependencies`, `code_dependency_path`, `security_blast_radius`.

**Acceptance Criteria:**
- [ ] Neo4jCommunityGraphRepository exists.
- [ ] Backend capability registry is accurate.
- [ ] Projection sync works.
- [ ] Permission-aware traversal works.
- [ ] Cypher query templates work.
- [ ] GraphRAG graph expansion works.
- [ ] Backend health status is visible.
- [ ] Fallback/degraded mode is documented.
- [ ] Neo4j CE limitations are visible in admin documentation.

### Phase 8 — Local / Global Graph MVP with Layout Registry

**Goal:** Implement the first dynamic graph views on Neo4j CE through GraphRepository.

**MVP Features:** Global Graph, Local Graph, Node Search, Entity Search, Node Expand / Collapse, Depth Control, Graph Filters, Groups, Colors, Hover Preview, Open Note from Node, Open Entity from Node, Graph Inspector, Provenance Inspector, Projection Inspector, Partial Graph Loading, Graph Timeout Handling, Expand-On-Demand, Permission Truncation Indicator, Neo4j Degraded Indicator.

**Acceptance Criteria:**
- [ ] Global graph renders using GraphRepository.
- [ ] Local graph renders around active note using Neo4j CE.
- [ ] Layout registry exists.
- [ ] Depth control works.
- [ ] Filters work.
- [ ] Node click opens note/entity.
- [ ] Node visibility respects permissions.
- [ ] Edge visibility respects permissions.
- [ ] Partial graph loads if traversal times out.
- [ ] Graph shows truncation reason.
- [ ] Neo4j degraded state is visible.
- [ ] Projection inspector shows source Postgres record.

### Phase 9 — Graph Customization and Governance-Aware Views

**Goal:** Let users customize graph representation without leaking unauthorized relationships.

**Features:** Node Types, Edge Types, Colors, Groups, Filters, Saved Views, Layout Rules, Lens-Specific Display, Pinned Nodes, Hidden Nodes, Collapsed Subgraphs, Graph View Presets, Governance-Aware Visibility, Permission-Aware Counts, Provenance Display Options, Confidence Display Options, Projection Status Display.

**Data Model:** `ags_graph_saved_views`, `ags_graph_view_filters`, `ags_graph_view_groups`, `ags_graph_view_styles`, `ags_graph_lens_configs`, `ags_graph_layout_configs`.

**Security Rule:**
- Do not show an edge if either endpoint is not visible.
- Do not reveal hidden entity existence through visible structure.
- Do not leak hidden nodes through counts unless aggregate-count policy allows it.
- Do not expose Neo4j node/relationship IDs as authorization proof.

**Acceptance Criteria:**
- [ ] Users can save graph views.
- [ ] Users can filter node types.
- [ ] Users can filter edge types.
- [ ] Users can group nodes.
- [ ] Users can color nodes/edges.
- [ ] Users can pin/hide nodes.
- [ ] Lens-specific display rules work.
- [ ] Governance visibility is enforced.
- [ ] Hidden nodes do not leak via visible edges or counts.
- [ ] Projection status is visible where relevant.

### Phase 10 — Lightweight Runtime References: CAG / Graph Skill → Source Note

**Goal:** Deliver early traceability from agent decisions to human-authored notes without requiring full promotion.

**Model:**

```
RuntimeAssetSourceReference
├── runtime_asset_type
│   ├── CAGBlock
│   ├── GraphSkillPack
│   ├── ToolKnowledge
│   ├── Policy
│   └── Workflow
├── runtime_asset_id
├── source_note_id
├── source_note_version_id
├── reference_type
│   ├── source
│   ├── rationale
│   ├── documentation
│   ├── policy_basis
│   ├── graph_query_basis
│   └── human_explanation
├── required_for_runtime
├── prompt_inclusion_allowed
├── neo4j_relationship_id
├── projection_snapshot_id
├── created_at
└── created_by
```

**Runtime Behavior:**
- CAG Block may enter prompt if active and eligible.
- Graph Skill Pack may guide graph tool usage if active and eligible.
- Referenced note does not enter prompt automatically.
- Runtime trace shows source note version reference.
- Backlink exists from source note to runtime asset.
- Neo4j projection enables graph path explanation.

**Acceptance Criteria:**
- [ ] CAG block can reference a note version.
- [ ] Graph Skill Pack can reference a note version.
- [ ] Runtime trace shows source note reference.
- [ ] Referenced note does not enter prompt automatically.
- [ ] Backlink from note to CAG block exists.
- [ ] Backlink from note to Graph Skill Pack exists.
- [ ] Neo4j projection contains reference edge.
- [ ] Permissions are enforced on referenced note visibility.

### Phase 11 — Promotion Workflows with Versioning and Rollback

**Goal:** Make notes operational in a versioned, auditable, rollback-safe way.

**Promotion Types:** Note → Knowledge Unit, Note → CAG Block, Note → Graph Skill Pack, Note → Tool Knowledge, Note → Workflow, Note → Policy, Note → Evaluation Case, Note → Runtime Investigation, Note → Graph Entity, Note → Temporal Observation.

**Promotion Lifecycle:**

```
Note Version
    ↓
Promotion Candidate
    ↓
Validation
    ↓
Governance Review
    ↓
Approval if Required
    ↓
Promoted Draft
    ↓
Active Runtime Asset Version
    ↓
Postgres source record updated
    ↓
Neo4j projection sync
    ↓
Runtime Trace / Audit
```

**Data Model:** `ags_note_promotions`, `ags_note_promotion_versions`, `ags_note_promotion_decisions`, `ags_note_runtime_bindings`, `ags_note_promotion_audit_events`.

**Rollback Rules:**
- A promoted asset can roll back to previous active version.
- Editing source note does not mutate runtime asset automatically.
- A changed note creates a new promotion candidate.
- Promotion rollback is audited.
- Runtime-active assets bind to note versions, not mutable notes.
- Neo4j projection updates only after source-of-truth promotion change.

**Acceptance Criteria:**
- [ ] Note can be promoted to Knowledge Unit.
- [ ] Note can be promoted to CAG Block.
- [ ] Note can be promoted to Graph Skill Pack.
- [ ] Note can be promoted to Tool Knowledge.
- [ ] Note can be promoted to Workflow.
- [ ] Note can be promoted to Policy.
- [ ] Promotion can require approval.
- [ ] Promotion records source note version.
- [ ] Runtime-impacting promotions are audited.
- [ ] Promotion rollback works.
- [ ] Editing source note does not silently mutate runtime asset.
- [ ] Promotion projection to Neo4j works.

### Phase 11.5 — Graph Change Proposals and Entity Resolution Workflows

**Goal:** Extend the promotion model beyond notes so graph corrections are governed.

**Proposal Types:** Create Node Proposal, Update Node Proposal, Deprecate Node Proposal, Create Edge Proposal, Update Edge Proposal, Remove Edge Proposal, Entity Merge Proposal, Entity Split Proposal, Observation Correction Proposal, Provenance Correction Proposal, Projection Correction Proposal.

**Data Model:** `ags_graph_change_proposals`, `ags_graph_change_proposal_items`, `ags_graph_change_decisions`, `ags_graph_change_audit_events`, `ags_graph_entity_resolution_candidates`, `ags_graph_entity_merge_decisions`.

**Acceptance Criteria:**
- [ ] Graph correction proposals can be created.
- [ ] Entity merge proposals can be reviewed.
- [ ] Entity split proposals can be reviewed.
- [ ] Approved proposal creates auditable source-of-truth graph update.
- [ ] Neo4j projection updates after approved correction.
- [ ] Rejected proposal remains auditable.
- [ ] Agents cannot directly mutate Neo4j graph facts.

### Phase 12 — GraphRAG Retrieval Layer

**Goal:** Implement GraphRAG as a core capability using Neo4j CE for graph traversal.

**Retrieval Components:** Full-Text Search, Vector Search, Neo4j Graph Traversal, Graph Expansion, Cypher Query Templates, Guarded Text2Cypher, Similarity Search, Graph Algorithms where supported, Hybrid Ranking, Citation Assembly, Context Safety Filter, Permission-Aware Context Assembly.

**Retrieval Flow:**

```
User / Agent Query
    ↓
GraphRAG Retrieval Router
    ↓
Intent classification
    ↓
Choose retrieval strategy
    ↓
Run full-text / vector / Neo4j graph / hybrid retrieval
    ↓
Apply permissions
    ↓
Apply context safety filter
    ↓
Assemble citations
    ↓
Return context blocks
    ↓
Write retrieval trace
```

**Data Model:** `ags_retrieval_runs`, `ags_retrieval_queries`, `ags_retrieval_results`, `ags_retrieval_context_blocks`, `ags_retrieval_citations`, `ags_retrieval_safety_events`.

**Acceptance Criteria:**
- [ ] Full-text retrieval works.
- [ ] Vector retrieval path is abstracted.
- [ ] Neo4j graph traversal retrieval works.
- [ ] Hybrid retrieval works.
- [ ] Cypher query template retrieval works.
- [ ] Guarded Text2Cypher is read-only.
- [ ] Graph algorithm retrieval works where supported.
- [ ] Retrieval results include citations.
- [ ] Retrieval respects permissions.
- [ ] Context safety filter runs before prompt assembly.
- [ ] Retrieval traces are written.

### Phase 12.5 — Graph Skill Packs and Cypher Query Template System

**Goal:** Create stable, governed procedural graph knowledge for Graph Agents.

**Graph Skill Pack Contents:** `skill_id`, `name`, `description`, `domain`, supported node types, supported edge types, allowed Cypher query templates, retrieval recipes, traversal constraints, MCP tool guidance, risk level, approval requirements, source note references, version, evaluation cases, runtime eligibility.

**Cypher Query Template Contents:** `template_id`, `name`, `description`, `graph_backend`, `query_language = cypher`, `cypher_body`, `parameter_schema`, `permission_filter_required`, `max_depth`, `max_results`, `timeout_ms`, `read_only`, `risk_level`, `allowed_roles`, `source_skill_pack_id`, test cases.

**Acceptance Criteria:**
- [ ] Graph Skill Pack can be created.
- [ ] Graph Skill Pack can be versioned.
- [ ] Graph Skill Pack can reference source note version.
- [ ] Cypher query template can be executed safely.
- [ ] Query template enforces permission filter.
- [ ] Query template runs are audited.
- [ ] Graph Agent can select Graph Skill Pack.
- [ ] Query template cannot mutate Neo4j unless explicitly approved as admin maintenance operation.

### Phase 13 — Graph Agent Lite Runtime

**Goal:** Create the first executable Graph Agent without overbuilding adaptive planning.

**Graph Agent Lite Capabilities:** schema inspection, prompt-safe ontology summary, Neo4j schema summary, Cypher query template execution, permission-aware graph lookup, basic GraphRAG retrieval, cited answer, runtime trace, decision trace, Why This Answer? panel.

**Graph Agent Lite Flow:**

```
User question
    ↓
Load user permissions from Postgres
    ↓
Inspect prompt-safe ontology summary
    ↓
Inspect available Cypher query templates
    ↓
Select approved query template or simple retrieval mode
    ↓
Run permission-aware retrieval through Neo4jCommunityGraphRepository
    ↓
Apply context safety filter
    ↓
Call model through approved model access path
    ↓
Return cited answer
    ↓
Write runtime trace and decision trace
    ↓
Show Why This Answer?
```

**Data Model:** `ags_graph_agent_runs`, `ags_graph_agent_steps`, `ags_graph_agent_tool_choices`, `ags_graph_agent_context_blocks`, `ags_graph_agent_explanations`, `ags_graph_agent_auth_events`.

**Acceptance Criteria:**
- [ ] Graph Agent Lite run can be started.
- [ ] Graph Agent can inspect prompt-safe schema summary.
- [ ] Graph Agent can execute approved Cypher query template.
- [ ] Graph Agent can produce cited answer.
- [ ] Graph Agent writes runtime trace.
- [ ] Graph Agent writes decision trace.
- [ ] Graph Agent shows Why This Answer? explanation.
- [ ] Graph Agent cannot bypass MCP dispatcher.
- [ ] Graph Agent cannot mutate Postgres or Neo4j graph facts directly.

### Phase 13.5 — Graph Agent Advanced / Agentic GraphRAG

**Goal:** Add adaptive graph reasoning and retrieval planning after Graph Agent Lite is stable.

**Advanced Capabilities:** retrieval strategy planning, Graph Skill Pack selection, guarded Text2Cypher, graph algorithm invocation, multi-step graph traversal planning, impact analysis planning, correction proposal creation, semantic enrichment proposal creation, governed action routing.

**Graph Algorithms** (approved calls may include): shortest path, centrality, similarity, dependency expansion, community detection, blast-radius analysis.

All graph algorithm calls must go through: GraphRepository, GraphAlgorithmRepository, Neo4jCommunityGraphRepository where supported, permission filters, audit trail, context safety filter if results enter prompt.

**Acceptance Criteria:**
- [ ] Graph Agent can choose retrieval strategy.
- [ ] Graph Agent can select Graph Skill Pack.
- [ ] Graph Agent can use guarded Text2Cypher.
- [ ] Graph Agent can invoke approved graph algorithms where supported.
- [ ] Graph Agent can create correction proposals.
- [ ] Graph Agent can create semantic enrichment proposals.
- [ ] Graph Agent cannot mutate graph directly.
- [ ] Agentic GraphRAG tests pass.

### Phase 14 — Runtime Trace, Decision Trace, and Audit Graph with Retention

**Goal:** Represent runtime traces and reasoning traces as graph paths, export them to investigation notes, and manage trace graph growth.

**Trace Graph Path:**

```
User Request
    ↓
Agent
    ↓
Graph Agent Run
    ↓
Graph Skill Pack Used
    ↓
CAG Blocks Used
    ↓
CAG Source Notes Referenced
    ↓
RAC Plan
    ↓
GraphRAG Retrieval Run
    ↓
Cypher Query Template
    ↓
Knowledge Units
    ↓
Context Blocks
    ↓
Decision Trace
    ↓
Decision Trace Steps
    ↓
OpenRouter / Model Call
    ↓
Proposed Tool Call
    ↓
Approval
    ↓
MCP Dispatch
    ↓
Tool Result / Final Response
    ↓
User Feedback
```

**Data Model:** `ags_runtime_traces`, `ags_runtime_trace_steps`, `ags_decision_traces`, `ags_decision_trace_steps`, `ags_runtime_graph_events`, `ags_runtime_trace_exports`, `ags_runtime_trace_retention_states`.

**Neo4j Projection:**

```cypher
(:RuntimeTrace)-[:USED_GRAPH_SKILL]->(:GraphSkillPack)
(:RuntimeTrace)-[:USED_CAG_BLOCK]->(:CAGBlock)
(:RuntimeTrace)-[:HAS_DECISION_TRACE]->(:DecisionTrace)
(:DecisionTrace)-[:HAS_STEP]->(:DecisionTraceStep)
(:RuntimeTrace)-[:REFERENCES_NOTE_VERSION]->(:NoteVersion)
```

**Acceptance Criteria:**
- [ ] Runtime trace graph projection works.
- [ ] Decision trace graph projection works.
- [ ] Runtime trace can export to note.
- [ ] Trace note links to Neo4j graph path.
- [ ] Trace includes CAG source note references.
- [ ] Trace includes Graph Skill source note references.
- [ ] Trace graph enforces permissions.
- [ ] Retention policy exists.
- [ ] Sensitive payload redaction is designed or implemented.

### Phase 15 — Templates, Attachments, Import / Export MVP

**Goal:** Add essential productivity features without overbuilding capture/publish systems.

**MVP Templates:** Basic Note Template, Agent Skill Template, CAG Block Template, Graph Skill Pack Template, Tool Knowledge Template, Workflow Template, Policy Template, Runtime Investigation Template, Evaluation Case Template, Graph Correction Proposal Template, Decision Record Template.

**MVP Attachments:** Image Attachments, PDF Attachments, File Attachments, Attachment Preview, Drag-and-Drop Embed, Attachment Metadata, Attachment Graph Nodes, Attachment Source Artifact References.

**MVP Import / Export:** Markdown Import, Folder Import, Basic HTML Import, Markdown Export, Runtime Trace Export to Note, Decision Trace Export to Note, Impact Analysis Export to Note, Vault Export to Markdown Folder, Graph View Export, Neo4j Graph Snapshot Export.

**Acceptance Criteria:**
- [ ] Basic templates work.
- [ ] Template variables resolve.
- [ ] Graph Skill Pack template works.
- [ ] Image attachments work.
- [ ] PDF attachments work.
- [ ] Attachments can be embedded in notes.
- [ ] Attachments can become source artifacts.
- [ ] Markdown import/export works.
- [ ] Runtime trace can export to note.
- [ ] Decision trace can export to note.
- [ ] Neo4j graph snapshot export works where allowed.

### Phase 16 — Saved Views as Lightweight Bases Precursor

**Goal:** Provide database-like organization without building full Bases yet.

**MVP:** Saved Filtered Note Views, Table-like Note List, Property Columns, Filters, Sorting, Basic Grouping, Saved View Definitions, Entity Views, Runtime Asset Views, Graph Quality Views, Projection Status Views.

**Acceptance Criteria:**
- [ ] Users can create saved note views.
- [ ] Users can filter by tags/properties.
- [ ] Users can sort by properties.
- [ ] Users can choose visible columns.
- [ ] Entity views work.
- [ ] Runtime asset views work.
- [ ] Projection status views work.
- [ ] Full Bases is explicitly deferred.

### Phase 17 — Canvas Strategy and Deferred Canvas Implementation

**Goal:** Define Canvas without making it MVP-blocking.

**MVP Alternatives:** Graph views, Saved views, Tree/table views, Runtime trace DAG, Decision trace DAG, Impact analysis graph, Evidence-centered graph view, Neo4j path visualization.

**Deliverable:** `docs/architecture/agent-studio-canvas-strategy.md`

**Acceptance Criteria:**
- [ ] Canvas strategy documented.
- [ ] Canvas is not MVP-blocking.
- [ ] Canvas is explicitly scheduled after core workspace stability.
- [ ] Graph/table/tree alternatives exist for MVP.
- [ ] Future Canvas data model is defined.

### Phase 18 — Extension Framework Strategy

**Goal:** Avoid unsafe plugin overbuild while preserving extensibility.

**MVP:** Internal Command Registry, Internal Extension Points, No arbitrary third-party plugins, No untrusted plugin runtime, Graph Skill Pack registry, Cypher Query Template registry.

**Security Rule:** Extensions cannot bypass MCP dispatcher, approval gate, note permissions, graph governance, CAG governance, Graph Skill governance, raw artifact policy, runtime trace, context safety filter, GraphRepository, Neo4j projection rules.

**Acceptance Criteria:**
- [ ] Internal command registry exists.
- [ ] Internal extension points documented.
- [ ] Third-party plugin runtime deferred.
- [ ] Plugin security strategy documented.
- [ ] Runtime boundaries protected.

### Phase 19 — Sync / Publish Strategy

**Goal:** Clarify sync and publish without treating them as simple features.

**MVP:** Shared workspace through existing app permissions, Manual import/export, Note version history, Audit trail, Server-first source of truth, Neo4j projection rebuild from Postgres.

**Later:** Hybrid vault export/import, Publish-like static export, Selective export, Documentation site export, Graph snapshot export.

**Much Later:** Real sync engine, Offline support, Local-first mode, CRDT/OT collaboration, Offline merge, Multi-device conflict resolution.

**Deliverables:** `docs/architecture/agent-studio-workspace-sync-strategy.md`, `docs/architecture/agent-studio-publish-export-strategy.md`.

**Acceptance Criteria:**
- [ ] Sync strategy documented.
- [ ] Publish/export strategy documented.
- [ ] Server-first MVP confirmed.
- [ ] Hybrid import/export path defined.
- [ ] Real-time collaboration deferred.
- [ ] Offline sync deferred.
- [ ] Neo4j projection rebuild strategy documented.

### Phase 20 — Performance Benchmarks and Scale Validation

**Goal:** Prevent the graph workspace, Neo4j graph layer, GraphRAG layer, and Graph Agent runtime from becoming slow or unusable.

**MVP Scale Targets:** 10,000 notes / 100,000 links / 50,000 graph nodes / 250,000 graph edges / 10,000 runtime traces / 1,000 decision traces / 1,000 graph skill references / 500 golden questions.

**Required Benchmarks:**

| Benchmark | Target |
|---|---|
| Open note with 5,000 words + 50 links | p50 ≤ 300 ms, p95 ≤ 800 ms |
| Refresh backlinks after saving note with 100 links | p50 ≤ 500 ms, p95 ≤ 1500 ms |
| Project note update to Neo4j CE | p50 ≤ 500 ms, p95 ≤ 2000 ms |
| Render local graph depth 2 with ≤ 500 nodes | p50 ≤ 700 ms, p95 ≤ 2000 ms |
| Permission-aware depth-3 Neo4j traversal | p50 ≤ 900 ms, p95 ≤ 2500 ms |
| Search across 10,000 notes | p50 ≤ 300 ms, p95 ≤ 1200 ms |
| GraphRAG retrieval over graph + notes | p50 ≤ 800 ms, p95 ≤ 2500 ms |
| Cypher query template execution | p50 ≤ 300 ms, p95 ≤ 1200 ms |
| Runtime trace graph load | p50 ≤ 500 ms, p95 ≤ 1500 ms |
| Graph Agent Lite answer with citations | p50 ≤ 2500 ms, p95 ≤ 8000 ms |
| Entity resolution candidate scan | p50 ≤ 1000 ms, p95 ≤ 4000 ms |
| Full Neo4j projection rebuild | scheduled benchmark, no hard interactive target |

**Acceptance Criteria:**
- [ ] Benchmark suite exists.
- [ ] Note open benchmark passes or reports regression.
- [ ] Backlink refresh benchmark passes or reports regression.
- [ ] Neo4j projection benchmark passes or reports regression.
- [ ] Local graph render benchmark passes or reports regression.
- [ ] Search benchmark passes or reports regression.
- [ ] GraphRAG benchmark passes or reports regression.
- [ ] Runtime trace graph benchmark passes or reports regression.
- [ ] Graph Agent benchmark passes or reports regression.
- [ ] Backend-specific benchmark results are reported.

### Phase 20.5 — Code Graph Parser Spike

**Goal:** Evaluate code graph ingestion complexity before committing to full Code Intelligence Graph.

**Evaluate:** Tree-sitter for multi-language parsing. Language-specific AST tools where needed. Repository → file → class/function/API graph extraction. Dependency edge extraction. Sample repo ingestion. Code graph query performance. Code graph projection into Neo4j CE.

**Acceptance Criteria:**
- [ ] Sample repo ingestion spike completed.
- [ ] Parser strategy documented.
- [ ] Code node/edge model validated.
- [ ] Code graph query performance measured in Neo4j CE.
- [ ] Decision made whether to proceed with full Code Intelligence Graph.

### Phase 21 — Continuous Graph Testing and Benchmark CI

**Goal:** Continuously test graph correctness, visibility, traversal, retention, cache behavior, GraphRAG, Graph Agent behavior, Neo4j projection, and performance.

**Test Suite:**

```
test/graph/
├── graph-repository.test.ts
├── neo4j-community-repository.test.ts
├── graph-backend-capabilities.test.ts
├── graph-projection-sync.test.ts
├── graph-projection-drift.test.ts
├── graph-projection.test.ts
├── graph-permission-visibility.test.ts
├── graph-traversal.test.ts
├── cypher-query-template.test.ts
├── graph-query-cache.test.ts
├── graph-retention.test.ts
├── graph-impact-analysis.test.ts
├── graph-property-based.test.ts
├── graph-ontology.test.ts
├── graph-constraints.test.ts
├── graph-entity-resolution.test.ts
├── graph-provenance-lineage.test.ts
├── graph-temporal-observations.test.ts
├── graphrag-retrieval-router.test.ts
├── query-template-guardrails.test.ts
├── text2cypher-guardrails.test.ts
├── graph-skill-pack.test.ts
├── graph-agent-lite.test.ts
├── graph-agent-advanced.test.ts
├── graph-context-safety-filter.test.ts
└── golden-question-regression.test.ts
```

**Property-Based Visibility Rule:**

For any hidden node:
- no visible edge may expose it
- no visible neighbor list may reveal it
- no count may reveal it unless policy allows aggregate counts
- no Graph Agent answer may reveal it
- no graph cache response may reveal it
- no Neo4j result may bypass permission post-filtering
- no citation path may reveal it

**Acceptance Criteria:**
- [ ] GraphRepository tests run in CI.
- [ ] Neo4j repository tests run in CI.
- [ ] Projection sync tests run in CI.
- [ ] Backend capability tests run in CI.
- [ ] Graph projection tests run in CI.
- [ ] Graph permission tests run in CI.
- [ ] Property-based visibility tests exist.
- [ ] Graph traversal tests exist.
- [ ] Query cache tests exist.
- [ ] GraphRAG tests exist.
- [ ] Graph Agent tests exist.
- [ ] Golden question tests exist.
- [ ] Benchmark CI exists.
- [ ] p95 regression gate exists.

### Phase 22 — User Feedback and Failure-State Implementation

**Goal:** Make graph workspace, Neo4j backend, projection sync, retrieval, and Graph Agent failures visible, understandable, and recoverable.

**Failure States:** promotion failed, note conflict, entity resolution conflict, Neo4j unavailable, Neo4j degraded, Neo4j query timeout, Neo4j projection stale, Neo4j projection drift detected, projection sync failed, graph query timeout, backlink refresh failed, runtime reference hidden by permission, CAG reference invalidated, Graph Skill reference invalidated, tool schema changed, search index stale, query cache stale, Text2Cypher rejected, Cypher query template failed, retrieval safety filter blocked content, Graph Agent answer incomplete, golden question failed, graph correction rejected, semantic enrichment rejected, background job failed.

**Graph Agent Explanation Panel Shows:** retrieval mode used, Graph Skill Pack used, Cypher query template used, graph backend used, Neo4j projection snapshot used, graph path, citations, confidence, hidden/truncated context reason, correction proposal option.

**Data Model:** `ags_workspace_background_jobs`, `ags_workspace_user_notifications`, `ags_workspace_error_events`, `ags_graph_agent_user_feedback`, `ags_graph_backend_health_events`, `ags_graph_projection_drift_events`.

**Acceptance Criteria** (post 2026-05-15 emission burst — see `agent-studio-failure-state-emission-burst-2026-05-15.md`):
- [ ] Graph timeout state is visible. (partial — `neo4j_query_timeout` deferred; `graph_query_timeout` deferred)
- [x] Neo4j degraded state is visible. (`neo4j_degraded` + `neo4j_unavailable` LIVE @ #1014)
- [x] Projection sync failure is visible. (`projection_sync_failed` LIVE @ #1025; `neo4j_projection_drift_detected` LIVE @ #1015)
- [ ] Partial graph loading works. (operator UI feature; out of failure-state scope)
- [x] Promotion validation errors are visible. (`promotion_failed` LIVE @ #1027 — distinguishes validation-reject vs operator-reject via `rejectionStage` metadata)
- [ ] Conflict resolution UI works. (`note_conflict` detection-first deferred — no concurrent-edit emit point in current vault repo)
- [x] Background job status is visible. (legacy `errorClass: "BackgroundJobFailed"` since #517-era; closed-taxonomy sibling-emit deferred due to count-pin blocker — see audit kind #25)
- [ ] Stale graph/search indicators exist. (`neo4j_projection_stale` / `search_index_stale` / `query_cache_stale` — detection-first deferred)
- [x] Graph Agent explanation panel works. (`graph_agent_answer_incomplete` LIVE @ #1023 — budget-exhaustion signal; clean convergence excluded per closed-taxonomy contract)

**Implementation artifacts:**
- Closed taxonomy: `services/failure-states/contracts.ts` (#1002 — 25 closed kinds)
- Emission bridge: `services/failure-states/observability-bridge.ts` (#1013 — `recordFailureStateEvent` + #1029 plural)
- Per-state audit + dashboard SQL: `docs/implementation/agent-studio-phase-22-failure-state-emission-audit.md`
- Burst summary: `docs/implementation/agent-studio-failure-state-emission-burst-2026-05-15.md`

### Phase 23 — Graph Quality Agent and Semantic Self-Correction Loop

**Goal:** Turn the graph into governed living memory without allowing unsafe autonomous mutation.

**Graph Quality Metrics:** orphan nodes, duplicate entities, missing required properties, missing expected edges, stale nodes, weak descriptions, contradiction candidates, unresolved references, broken source links, low-confidence extractions, permission anomalies, unvalidated runtime assets, expired tool schemas, policy mismatch, projection drift, failed golden questions.

**Graph Quality Agent** detects structural graph problems: orphan nodes, duplicate candidates, missing required properties, invalid edges, stale projections, broken source references, Neo4j projection drift.

**Semantic Enrichment Agent** uses source-backed LLM reasoning to propose: improved node descriptions, missing categories, missing relationships, standardized names, aliases, source-note summaries, contradiction candidates, evaluation cases.

**Self-Correction Flow:**

```
Graph quality issue detected
    ↓
Graph Quality Agent or Semantic Enrichment Agent creates proposal
    ↓
Evidence and confidence attached
    ↓
Human/governance review
    ↓
Approve / reject / request revision
    ↓
Approved correction updates Postgres source-of-truth record
    ↓
Neo4j projection sync updates graph
    ↓
Evaluation case updated
    ↓
Audit event written
```

**Data Model:** `ags_graph_quality_metrics`, `ags_graph_quality_scans`, `ags_graph_quality_findings`, `ags_graph_quality_agent_runs`, `ags_semantic_enrichment_runs`, `ags_semantic_enrichment_proposals`, `ags_graph_correction_proposals`, `ags_graph_correction_decisions`, `ags_graph_correction_audit_events`.

**Acceptance Criteria:**
- [x] Graph quality scan runs.
- [x] Duplicate entities can be detected.
- [x] Stale graph facts can be detected.
- [x] Projection drift can be detected.
- [x] Missing required properties can be detected.
- [x] Semantic enrichment proposals can be created.
- [x] Graph Quality Agent creates proposals only.
- [x] Semantic Enrichment Agent creates proposals only.
- [x] Human/governance approval is required for source-of-truth mutation.
- [x] Approved correction reprojects to Neo4j CE.
- [x] Approved correction is auditable.
- [x] Rejected correction is auditable.
- [x] Golden question failures can create correction proposals.

**Closure (2026-05-18):** Phase 23 is **FULLY IMPLEMENTED**. Shipped across:

- Graph Quality Agent runtime — `server/agent-studio/services/graph-quality/` (scan, findings, agent runs, retention cron)
- Semantic Enrichment Agent — `server/agent-studio/services/graph-enrichment/` (5 candidate-selector kinds: weak descriptions, missing properties, entity disambiguation, relationship-label repair, stale-fact refresh; row-id-aware evidence collector)
- Promotion chain (T-D.4, 6 PRs #1499–#1504): `semantic-enrichment-promotion-bridge.ts` → `runPromoteSemanticEnrichment` → tRPC `promote` / `promoteAndApprove` / `promoteBulk` → auto-promote cron `*/15 * * * *` (env-gated, ≥0.95 confidence) → admin UI panel (`SemanticEnrichmentProposalDetailPanel.tsx` on RetrofitPage)
- Failure-correction bridge (T-D.5) — `failure-correction-bridge.ts` routes golden-question failures into `ags_graph_correction_proposals`
- Approve-and-apply chain — `approveAndApplyProposal` writes `ags_graph_correction_audit_events` and triggers Neo4j reprojection via the existing `GraphRepository` mutation surface

See memory entries `project_td4_promotion_chain_complete.md` and `project_v1_plus_session_2026_05_16.md` for per-PR ledgers.

### Phase 24 — Full V1 Expansion: Canvas, Bases, Lenses, Impact

**Goal:** After MVP is stable, add the larger Obsidian-like and graph-native experience.

**V1 Additions:** Canvas MVP, Bases MVP, Full saved graph views, Expanded graph node/edge types, RAG Lens, RAC Lens, CAG Lens, Graph Skill Lens, MCP Lens, Governance Lens, Runtime Lens, Institutional Memory Lens, Code Lens, Workflow Lens, Impact Analysis Lens, Graph Quality Lens, Lightweight Bases → richer database views, Attachment expansion, Import/export expansion, Runtime graph integration, Decision trace integration, Runtime graph retention tiers, Expanded performance validation, Expanded user feedback states.

**Impact Analysis Types:** Knowledge Impact, Runtime Impact, Code Impact, Security Impact, Governance Impact, Tool Impact, Workflow Impact.

**Acceptance Criteria:**
- [ ] Lenses work with appropriate layouts.
- [ ] Impact analysis works by type using Neo4j CE where appropriate.
- [ ] Canvas MVP works.
- [ ] Bases MVP works.
- [ ] Expanded graph projections are tested.
- [ ] Runtime graph remains performant.
- [ ] Governance visibility still enforced.

### Phase 25 — V1.5 Expansion: Institutional, Code, Security, and Recommendation Graphs

**Goal:** Add enterprise-grade graph intelligence beyond notes and runtime traces.

**Institutional KG Lens** node types: `Person`, `Team`, `Project`, `System`, `Service`, `Decision`, `Policy`, `Workflow`, `Document`, `Outcome`, `Responsibility`, `TimelineEvent`, `GovernanceRecord`. Use cases: who owns this system?, why was this decision made?, which policy governs this workflow?, what projects depend on this service?, what changed over time?

**Code Intelligence Graph** node types: `Repository`, `Package`, `File`, `Class`, `Function`, `Method`, `ApiEndpoint`, `Service`, `DbTable`, `FrontendComponent`, `ConfigFile`, `TestFile`. Edges: `IMPORTS`, `CALLS`, `DECLARES`, `IMPLEMENTS`, `DEPENDS_ON`, `READS_FROM_TABLE`, `WRITES_TO_TABLE`, `ROUTES_TO`, `RENDERS_COMPONENT`, `TESTS`.

**Security / DevSecOps Graph Lens** node types: `CVE`, `SecurityFinding`, `Component`, `Package`, `Service`, `Environment`, `Owner`, `CustomerExposure`, `Policy`, `Control`. Example path: `CVE → Package → Component → Service → Environment → Owner → CustomerExposure`.

**Graph Recommendation Service Pattern** use cases: recommend relevant notes, CAG blocks, Graph Skill Packs, tools, policies, workflows, experts/owners, next actions. Outputs include: rank, reason, graph path, source citations, confidence, permission status.

**Acceptance Criteria:**
- [ ] Institutional Memory Lens works.
- [ ] Code Intelligence Graph ingestion strategy exists.
- [ ] Security Graph Lens strategy exists.
- [ ] Recommendation service pattern documented.
- [ ] Impact analysis can use institutional/code/security graphs.
- [ ] Neo4j CE performance remains acceptable or upgrade path is triggered.
- [ ] Permission rules remain enforced.

### Phase 26 — V2 Expansion: Plugins, Sync, Publish, Advanced GraphRAG

**Goal:** Add product-scale capabilities only after the core system is stable.

**V2 Features:** Governed Plugin Framework, Advanced Graph Layouts, Real-Time Collaboration, Offline Sync, Local-First Mode, Publish-Like Hosting, Advanced GraphRAG, Multi-Agent GraphRAG, Cross-Workspace GraphRAG, Advanced Graph Algorithms, Advanced Code Architecture Graph, Advanced Workflow Graph, Advanced Governance, Advanced Import/Capture, Advanced Security Graph, Dedicated Graph Backend Scaling.

**Graph Algorithm Toolset** (potential): centrality, community detection, similarity, shortest path, dependency paths, blast radius, entity clustering, influence analysis.

**Acceptance Criteria:**
- [ ] Plugin sandbox exists before third-party plugins.
- [ ] Sync handles conflicts.
- [ ] Offline sync has merge strategy.
- [ ] Publish enforces access control.
- [ ] Advanced GraphRAG does not bypass permissions.
- [ ] Multi-agent GraphRAG does not bypass governance.
- [ ] Code/workflow graphs are tested.
- [ ] Runtime performance remains acceptable.
- [ ] Dedicated graph backend strategy is benchmark-driven.

### Phase 27 — Neo4j Enterprise / Aura Production Hardening Path

**Goal:** Define the upgrade path from Neo4j Community Edition to production-grade graph infrastructure.

**Trigger Conditions** (upgrade should be evaluated when project requires): high availability, clustering, failover, online backup, enterprise RBAC, LDAP / Active Directory integration, managed operations, multi-database administration, larger graph algorithm workloads, stricter production support.

**Upgrade Candidates:** Neo4j Enterprise self-managed, Neo4j Aura managed, Memgraph production deployment if benchmarked superior, Hybrid graph backend strategy if required.

**Required Deliverables:** `docs/architecture/agent-studio-neo4j-enterprise-upgrade-path.md`, `docs/architecture/agent-studio-neo4j-aura-upgrade-path.md`, `docs/architecture/agent-studio-graph-production-operations.md`.

**Acceptance Criteria:**
- [ ] Neo4j CE limitations are documented.
- [ ] Upgrade triggers are documented.
- [ ] Neo4j Enterprise path is documented.
- [ ] Neo4j Aura path is documented.
- [ ] Production backup/restore strategy exists.
- [ ] Production auth/RBAC strategy exists.
- [ ] Migration from CE to Enterprise/Aura is tested or planned.

### Phase 28 — Governance, Evaluation, Hardening

**Goal:** Ensure the workspace is safe, reliable, scalable, usable, and operationally useful.

**Governance Requirements:** Vault permissions, Shared vault roles, Note permissions, Attachment permissions, Graph backend access policy, Neo4j access policy, Graph node visibility, Graph edge visibility, Graph query permission, Graph cache permission, Projection sync permission, Entity resolution approval, Safe auto-merge policy, Graph correction approval, Semantic enrichment approval, Promotion approval, Promotion rollback, Reference visibility, Runtime eligibility, CAG governance, Graph Skill governance, CAG source note references, Graph Skill source note references, Tool knowledge governance, MCP boundary enforcement, Graph Agent boundary enforcement, Raw artifact policy, Context safety filter, Audit trail, Trace retention policy, Memory retention policy, Performance regression policy, Migration audit policy, Projection audit policy, User feedback policy, Golden question policy.

**CI Blockers:**

- Note without permission context accepted
- Knowledge Unit promotion without source note version
- CAG promotion without governance validation
- Graph Skill promotion without governance validation
- CAG block reference to mutable note instead of note version
- Graph Skill reference to mutable note instead of note version
- Tool Knowledge promotion without schema compatibility
- Raw artifact injected into runtime prompt
- Unauthorized graph node visible
- Unauthorized graph edge visible
- Hidden node leaked by edge or count
- Graph query cache serves unauthorized data
- Neo4j query bypasses GraphRepository
- Graph backend bypasses GraphRepository
- Text2Cypher executes mutation
- Cypher query template bypasses permission filter
- Graph Agent bypasses MCP dispatcher
- Graph Agent mutates graph facts directly
- Approval bypass
- Silent overwrite on concurrent edit
- Performance target violation without explicit waiver
- Migration projects records incorrectly
- Entity merge loses provenance
- Unsafe auto-merge occurs
- Graph correction applies without approval
- Semantic enrichment applies without approval
- Neo4j projection mutates without source-of-truth update
- Projection drift ignored
- Golden question regression without waiver

**Acceptance Criteria:**
- [ ] All core tests pass.
- [ ] GraphRepository boundary is enforced.
- [ ] Neo4j CE backend decision is documented.
- [ ] Postgres/Neo4j responsibility split is enforced.
- [ ] Graph projections are correct.
- [ ] Projection sync is auditable.
- [ ] Ontology constraints are enforced.
- [ ] Entity resolution works.
- [ ] Provenance is recorded.
- [ ] Permission enforcement works.
- [ ] Promotion governance works.
- [ ] CAG note references are version-pinned.
- [ ] Graph Skill note references are version-pinned.
- [ ] Promotion rollback works.
- [ ] Graph correction proposals are governed.
- [ ] Semantic enrichment proposals are governed.
- [ ] Concurrent edit detection works.
- [ ] Soft editing locks work.
- [ ] MCP boundary remains intact.
- [ ] Graph Agent boundary remains intact.
- [ ] Runtime trace graph is auditable.
- [ ] Decision trace graph is auditable.
- [ ] Retention policy works.
- [ ] Query cache respects permissions.
- [ ] Context safety filter works.
- [ ] User feedback states work.
- [ ] Golden question suite runs.
- [ ] Performance benchmarks are reported.
- [ ] Neo4j Enterprise/Aura upgrade path is documented.
- [ ] Documentation complete.

---

## 7. Revised Data Model Summary

### 7.1 Static Workspace Tables

`ags_vaults`, `ags_vault_members`, `ags_vault_folders`, `ags_vault_notes`, `ags_vault_note_versions`, `ags_vault_note_conflicts`, `ags_vault_note_edit_sessions`, `ags_vault_note_locks`, `ags_vault_note_conflict_resolutions`, `ags_vault_attachments`, `ags_vault_note_properties`, `ags_vault_property_definitions`, `ags_vault_property_domains`, `ags_vault_tags`, `ags_vault_wikilinks`, `ags_vault_backlinks`, `ags_vault_embeds`, `ags_vault_entity_mentions`, `ags_vault_templates`, `ags_vault_saved_views`, `ags_vault_settings`.

### 7.2 Graph Repository / Backend Tables

`ags_graph_backend_configs`, `ags_graph_backend_capabilities`, `ags_graph_backend_benchmark_runs`, `ags_graph_backend_benchmark_results`, `ags_graph_backend_decisions`, `ags_graph_backend_health_events`, `ags_graph_backend_upgrade_evaluations`.

### 7.3 Neo4j Projection Sync Tables

`ags_graph_projection_sync_jobs`, `ags_graph_projection_sync_results`, `ags_graph_projection_sync_errors`, `ags_graph_projection_drift_events`, `ags_graph_projection_snapshots`, `ags_graph_projection_rebuilds`, `ags_graph_projection_node_mappings`, `ags_graph_projection_edge_mappings`.

### 7.4 Graph Core Metadata Tables

`ags_graph_nodes`, `ags_graph_edges`, `ags_graph_node_properties`, `ags_graph_edge_properties`, `ags_graph_projections`, `ags_graph_query_cache`, `ags_graph_projection_snapshots`, `ags_graph_traversal_benchmarks`, `ags_graph_saved_views`, `ags_graph_view_filters`, `ags_graph_view_groups`, `ags_graph_view_styles`, `ags_graph_lens_configs`, `ags_graph_layout_configs`, `ags_runtime_graph_events`.

### 7.5 Ontology / Constraints / Provenance Tables

`ags_graph_ontology_node_types`, `ags_graph_ontology_edge_types`, `ags_graph_ontology_property_definitions`, `ags_graph_constraints`, `ags_graph_constraint_violations`, `ags_graph_provenance_records`, `ags_graph_lineage_events`, `ags_graph_observations`, `ags_graph_temporal_facts`.

### 7.6 Entity Resolution Tables

`ags_graph_entities`, `ags_graph_entity_aliases`, `ags_graph_entity_resolution_candidates`, `ags_graph_entity_merge_decisions`, `ags_graph_entity_split_decisions`, `ags_graph_entity_resolution_audit_events`, `ags_graph_entity_auto_merge_policies`.

### 7.7 Migration Tables

`ags_migration_jobs`, `ags_migration_job_items`, `ags_migration_projection_results`, `ags_migration_audit_events`.

### 7.8 Reference / Promotion / Runtime Tables

`ags_cag_block_note_references`, `ags_graph_skill_note_references`, `ags_runtime_asset_source_references`, `ags_runtime_note_references`, `ags_note_promotions`, `ags_note_promotion_versions`, `ags_note_promotion_decisions`, `ags_note_runtime_bindings`, `ags_note_promotion_audit_events`, `ags_graph_retention_policies`, `ags_command_registry`, `ags_workspace_layouts`, `ags_workspace_audit_events`.

### 7.9 Graph Change / Self-Correction Tables

`ags_graph_change_proposals`, `ags_graph_change_proposal_items`, `ags_graph_change_decisions`, `ags_graph_change_audit_events`, `ags_graph_quality_metrics`, `ags_graph_quality_scans`, `ags_graph_quality_findings`, `ags_graph_quality_agent_runs`, `ags_graph_correction_proposals`, `ags_graph_correction_decisions`, `ags_graph_correction_audit_events`, `ags_semantic_enrichment_runs`, `ags_semantic_enrichment_proposals`, `ags_semantic_enrichment_decisions`.

### 7.10 GraphRAG Tables

`ags_retrieval_runs`, `ags_retrieval_queries`, `ags_retrieval_results`, `ags_retrieval_context_blocks`, `ags_retrieval_citations`, `ags_retrieval_safety_events`, `ags_query_templates`, `ags_query_template_versions`, `ags_query_template_runs`, `ags_text2cypher_runs`, `ags_graph_algorithm_runs`.

### 7.11 Graph Skill Tables

`ags_graph_skill_packs`, `ags_graph_skill_pack_versions`, `ags_graph_skill_query_templates`, `ags_graph_skill_evaluation_cases`, `ags_graph_skill_source_references`, `ags_graph_skill_runtime_usages`.

### 7.12 Graph Agent Runtime Tables

`ags_graph_agent_runs`, `ags_graph_agent_steps`, `ags_graph_agent_tool_choices`, `ags_graph_agent_context_blocks`, `ags_graph_agent_explanations`, `ags_graph_agent_auth_events`, `ags_graph_agent_user_feedback`.

### 7.13 Runtime / Decision Trace Tables

`ags_runtime_traces`, `ags_runtime_trace_steps`, `ags_decision_traces`, `ags_decision_trace_steps`, `ags_runtime_trace_exports`, `ags_runtime_trace_retention_states`, `ags_memory_observations`, `ags_memory_retention_classes`, `ags_memory_links`.

### 7.14 User Feedback / Operations Tables

`ags_workspace_background_jobs`, `ags_workspace_user_notifications`, `ags_workspace_error_events`, `ags_answer_feedback`, `ags_feedback_graph_improvement_links`.

### 7.15 Performance / Evaluation Tables

`ags_workspace_benchmark_runs`, `ags_workspace_benchmark_results`, `ags_workspace_eval_sets`, `ags_workspace_eval_cases`, `ags_workspace_eval_results`, `ags_golden_question_suites`, `ags_golden_questions`, `ags_golden_question_runs`, `ags_golden_question_results`.

### 7.16 Deferred / Future Tables

`ags_vault_canvas_files`, `ags_vault_bases`, `ags_plugin_registry`, `ags_plugin_permissions`, `ags_publish_exports`, `ags_sync_events`, `ags_graph_enterprise_upgrade_assessments`.

---

## 8. Revised Implementation Priority

### MVP 0 — Architecture, Neo4j CE Backend, and Projection Gate

Repository reconciliation. Existing data migration/projection plan. Server-first storage ADR. Postgres/Neo4j responsibility split ADR. KG / GraphRAG / Graph Agent taxonomy ADR. GraphRepository ADR. Neo4j CE architecture ADR. Backend evaluation matrix. Neo4j/Aura Agent reference architecture review. Postgres / Neo4j CE / Memgraph backend spike. Neo4j CE promotion decision gate. Projection sync ADR. Markdown profile ADR. Metadata domain ADR. Promotion binding semantics ADR. Ontology registry. Constraint registry. Entity resolution design. Provenance / lineage design. Temporal observation model. Graph memory model. Runtime graph retention policy. Performance targets. GraphRAG router ADR. Cypher query template ADR. Text2Cypher/query guardrails ADR. Graph Skill Pack ADR. Graph Agent runtime ADR. Context safety filter ADR. Shared editing lock strategy. User feedback strategy.

### MVP 1 — Workspace Foundation

Vaults. Shared vault permissions. Soft editing locks. Optimistic locking. Conflict UX. Note versioning. Folders. Notes. Markdown editor MVP. Properties with separated metadata domains. Tags. Wikilinks. Backlinks. Embeds. Search. Quick Switcher. Command Palette. Ask Agent About This Note — read-only. Neo4j projection status preview.

### MVP 2 — Neo4j CE Typed Graph Foundation

Active GraphRepository implementation. Neo4j CE configured. Neo4jCommunityGraphRepository implemented. Projection sync jobs. Minimal typed graph store. Ontology registry. Constraint registry. Entity resolution candidates. Safe auto-merge policy. Provenance on all nodes/edges. Neo4j source reference mapping. Graph query cache. Projection snapshots. Global graph. Local graph. Layout registry. Basic graph customization. Governance-aware visibility. Partial graph loading. Graph timeout feedback. Neo4j degraded-state feedback. Projection drift feedback.

### MVP 3 — Runtime Traceability and Promotion

CAG Block → Source Note Version reference. Graph Skill Pack → Source Note Version reference. Runtime trace backlink to source note. Decision trace structure. Runtime trace projection to Neo4j CE. Decision trace projection to Neo4j CE. Note → Knowledge Unit promotion. Note → CAG Block promotion. Note → Graph Skill Pack promotion. Note → Tool Knowledge promotion. Promotion versioning. Promotion rollback. Graph change proposals. Entity merge/split review. Runtime trace export to note. Governance for promotion.

### MVP 4 — GraphRAG and Graph Agent Lite

GraphRAG retrieval router. Cypher query templates. Read-only guarded Text2Cypher. Graph algorithm interface where supported. Graph Skill Pack usage. Graph Agent Lite. Why This Answer? panel. Context safety filter. Golden question suite. Basic performance benchmarks. Continuous graph testing.

### V1

Graph Agent Advanced / Agentic GraphRAG. Semantic Enrichment Agent. Graph Quality Agent. Attachments expansion. Templates. Saved filtered note views. Expanded graph lenses. RAG Lens. RAC Lens. CAG Lens. Graph Skill Lens. MCP Lens. Governance Lens. Runtime Lens. Institutional Memory Lens. Impact Analysis. Import/export MVP. Canvas MVP. Bases MVP. Runtime graph integration. Decision trace integration. Runtime graph retention tiers. Expanded performance validation. Expanded user feedback states.

### V1.5

Institutional KG Lens. Code Graph Parser Spike expansion. Code Intelligence Graph Track. Security / DevSecOps Graph Lens. Recommendation Service Pattern. Advanced Impact Analysis. Advanced graph algorithm use. Neo4j CE optimization. Neo4j Enterprise/Aura upgrade assessment.

### V2

Full Canvas. Full Bases. Governed plugin framework. Advanced graph layouts. Real-time collaboration. Offline sync. Local-first mode. Publish-like workflows. Advanced GraphRAG. Multi-agent GraphRAG. Cross-workspace GraphRAG. Advanced code architecture graph. Advanced workflow graph. Advanced capture/import. Advanced governance. Neo4j Enterprise / Aura production hardening. Dedicated graph backend scaling.

---

## 9. Final Product Definition

```
Agent Studio Native Graph Workspace
=
Obsidian-like Markdown knowledge workspace
+ server-first governed vault storage
+ Postgres source-of-truth persistence
+ Neo4j Community Edition dedicated graph database
+ Markdown-compatible import/export
+ shared-vault edit awareness
+ properties / tags / wikilinks / backlinks
+ search / quick switcher / command palette
+ GraphRepository abstraction from day one
+ Postgres / Neo4j CE responsibility split
+ Neo4j CE graph backend benchmark and promotion gate
+ Postgres → Neo4j projection sync
+ global graph / local graph / saved views
+ typed ontology and graph constraint registry
+ entity resolution with safe auto-merge policy
+ provenance and lineage for all graph facts
+ temporal observations
+ institutional memory model
+ graph memory taxonomy
+ graph query cache / projection snapshot strategy
+ versioned note references
+ versioned promotion workflows
+ CAG block → source note traceability
+ Graph Skill Pack → source note traceability
+ typed Agent Studio Knowledge Graph
+ GraphRAG retrieval router
+ Cypher query templates
+ guarded Text2Cypher
+ graph algorithm interface
+ Graph Skill Packs
+ Graph Agent Lite
+ Graph Agent Advanced / Agentic GraphRAG
+ RAG / RAC / CAG / Graph Skill / MCP / Governance lenses
+ runtime trace graph
+ decision trace graph
+ retention policy
+ performance-benchmarked graph interactions
+ continuous graph correctness testing
+ golden-question evaluation
+ graph quality metrics
+ governed self-correction loop
+ semantic enrichment proposals
+ Neo4j Enterprise / Aura upgrade path
+ clear failure-state user feedback
+ agent-usable governed knowledge
```

The strategic correction is:

```
Original enhanced roadmap:
    Postgres-first graph MVP, dedicated graph DB mostly V2.

Revised roadmap:
    Postgres remains source of truth for workspace and governance.
    Neo4j Community Edition becomes the dedicated graph database for MVP graph workloads.
    GraphRepository abstracts graph access from day one.
    Postgres → Neo4j projection sync is mandatory.
    GraphRAG is Phase 12, not V2.
    Graph Agent Lite is Phase 13.
    Agentic GraphRAG is Phase 13.5.
    Neo4j Enterprise / Aura is the production hardening path, not the MVP blocker.
```

Final strategic value:

> Agent Studio becomes a graph-native knowledge operating system where Postgres handles durable workspace and governance persistence, Neo4j Community Edition handles graph-native traversal and GraphRAG, and GraphRepository keeps the system flexible enough to evolve toward Neo4j Enterprise, Aura, Memgraph, or other graph backends later without rewriting the workspace, runtime, or governance model.
