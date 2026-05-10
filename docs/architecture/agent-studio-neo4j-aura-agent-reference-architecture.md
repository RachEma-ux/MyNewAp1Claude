# Agent Studio — Neo4j / Aura Agent Reference Architecture — ADR

**Owner:** Agent Studio module
**Phase:** Native Graph Workspace MVP 0 — Phase 1.5 prep
**Status:** Adopted as reference; not a dependency
**Authority:** Documents Neo4j Aura Agent as an architectural reference. Custom Agent Studio Graph Agent Lite remains the chosen build path.

---

## 1. Purpose

Neo4j publishes managed Aura Agent products (graph-grounded assistants over Aura). They provide useful patterns for ontology-driven agent creation, REST/MCP exposure, schema inspection, and managed lifecycle. This ADR captures **reference patterns** that inform Native Graph Workspace's Graph Agent Lite design without introducing Aura Agent as a dependency.

## 2. Reference patterns extracted

### 2.1 Schema inspection as a runtime primitive

Aura Agent surfaces a "describe schema" capability before Cypher generation. Native Graph Workspace mirrors this as `Neo4jCommunityGraphRepository.getOntologySummary()` — returns labels, relationship types, key properties, and constraints in a prompt-safe format.

### 2.2 Ontology-driven agent creation

Aura Agent ties agent capabilities to ontology nodes. Native Graph Workspace's Graph Skill Packs (Phase 12.5) play this role: each pack declares supported node types, edge types, and traversal constraints — agent eligibility derives from ontology overlap.

### 2.3 REST + MCP exposure

Aura Agent exposes both REST and MCP endpoints. Native Graph Workspace's Graph Agent Lite exposes:
- tRPC endpoint (consistent with rest of Agent Studio)
- MCP server endpoint (per Phase 13 — exposes Graph Agent as a tool to other agents)
- Optional A2A interface (deferred)

### 2.4 Cypher-oriented tool design

Aura Agent treats Cypher templates as first-class tool schemas. Native Graph Workspace's Phase 12.5 mirrors this: Cypher query templates become MCP-routable tools with parameter schemas.

### 2.5 Managed lifecycle (build, deploy, observe)

Aura Agent provides managed lifecycle hooks. Native Graph Workspace's Graph Agent Lite uses existing Agent Studio lifecycle (draft → release → deploy) plus runtime trace observability (V3 schema).

## 3. Why custom (not Aura Agent dependency)

| Concern | Aura Agent | Native Graph Workspace requirement |
|---|---|---|
| CAG integration | Generic | Tight (existing CAG Capability Packs + 8-class riskClass) |
| RAC integration | Generic | Tight (existing planner / executor / filter) |
| MCP dispatcher | External tool exposure | Existing single-chokepoint contract preserved |
| OpenRouter Model Access | Aura's own model gateway | Existing canonical entry point preserved |
| Governance / approval | Aura's own | Existing scaffolding (`agsApprovalSteps`, `evaluateGovernance()`) |
| Runtime trace integration | Aura's own | Existing `agsRuntimeRuns` (V3) |
| Note promotion / versioning | None | New (Phase 11) |
| Postgres + Neo4j projection model | None | New (Phase 1.7) |
| Hosting | Aura cloud | Self-hosted |
| Cost | Aura subscription | None (CE) |

**Decision:** Build custom Graph Agent Lite mirroring KGRA Agent module shape. Extract Aura Agent reference patterns where they reduce design risk; do not import.

## 4. Acceptance

- [x] Reference patterns extracted.
- [x] Custom-build justification documented.
- [x] No Aura Agent dependency introduced unless explicitly approved.
- [ ] Schema inspection primitive lands in `Neo4jCommunityGraphRepository.getOntologySummary()`.
- [ ] Graph Skill Pack ontology eligibility lands in Phase 12.5.

## 5. Evidence

- Companion: `agent-studio-graph-agent-runtime.md`.
- Companion: `agent-studio-graph-skill-packs.md`.
- Existing KGRA Agent module shape: `server/kgra-agent/`.
