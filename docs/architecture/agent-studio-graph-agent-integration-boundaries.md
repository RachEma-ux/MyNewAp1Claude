# Agent Studio Graph Agent — Integration Boundaries — ADR

**Owner:** Agent Studio module + KGRA Agent + Governance
**Phase:** Native Graph Workspace MVP 0 — Phase 0
**Status:** Adopted — locked boundaries for Graph Agent Lite (Phase 13) and Graph Agent Advanced (Phase 13.5)
**Authority:** Locks the runtime contract that prevents Graph Agent from bypassing existing platform boundaries.

---

## 1. Problem statement

A new Graph Agent runtime introduces classic boundary-bypass risk:
- Direct provider SDK calls (bypassing OpenRouter Model Access).
- Direct tool execution (bypassing MCP dispatcher).
- Direct graph mutation (bypassing governance).
- Source-of-truth confusion between Postgres records and Neo4j CE projections.
- Parallel runtime confusion with the existing KGRA Agent module.

This ADR locks the boundaries.

## 2. Decision

### 2.1 Graph Agent Lite is a sibling of KGRA Agent, not a replacement

Graph Agent Lite (`server/agent-studio/services/graph-agent/`) mirrors the KGRA Agent module shape:
- `manifest.ts` — declares ports, handoffs, events
- `ports.ts` — declares inbound/outbound contracts
- `public-api.ts` — exported entry point
- `contracts.ts` — Zod schemas for request/response
- `engine.ts` — orchestration core
- `events.ts` — emitted runtime events
- `handoffs.ts` — handoff to other modules
- `router.ts` — tRPC procedures
- `state.ts` — internal state machine

KGRA Agent (`server/kgra-agent/`) remains untouched in MVP 0–4.

### 2.2 Boundary contracts (hard rules)

```
Boundary 1 — MCP dispatcher
    Graph Agent must call:
        dispatchMcpToolCall(input) from server/agent-studio/services/mcp/dispatcher.ts
    Graph Agent must NOT:
        import provider SDKs directly
        bypass dispatcher with private tool execution
        introduce side-effectful operations outside dispatcher

Boundary 2 — OpenRouter Model Access
    Graph Agent must call models via:
        server/openrouter/model-access/ canonical entry point
    Graph Agent must NOT:
        import @anthropic-ai/sdk, openai, @google/generative-ai directly
        introduce a parallel model gateway
        cache model responses outside the existing OpenRouter cache layer

Boundary 3 — GraphRepository
    Graph Agent must access graph state only via:
        GraphRepository (server/agent-studio/services/graph/repository/)
    Graph Agent must NOT:
        import neo4j-driver / bolt / cypher clients directly
        access drizzle graph tables directly outside repository
        write to Neo4j CE outside the projection sync layer

Boundary 4 — Governance
    Graph Agent must NOT:
        mutate graph facts directly
        bypass evaluateGovernance() for retrieval / promotion / proposals
        bypass agsApprovalSteps / agsPendingPermissionRequests for governed actions
    Graph Agent may:
        create graph change proposals (Phase 11.5)
        create semantic enrichment proposals (Phase 23)
        execute approved Cypher query templates (read-only)
        return cited answers with provenance

Boundary 5 — Source of truth
    Postgres = source of truth.
    Neo4j CE = projected graph backend.
    Graph Agent reads cited answers from Postgres source records (not Neo4j).
    Graph Agent uses Neo4j only for traversal / path expansion.

Boundary 6 — Runtime trace
    Graph Agent must emit traces to existing agsRuntimeRuns (V3 schema).
    Trace projection into Neo4j happens via Phase 14 projection sync,
    not by Graph Agent directly.
```

### 2.3 Source-scan tests (mandatory from Phase 13 onward)

```typescript
// tests/agent-studio/graph-agent-mcp-boundary.test.ts
// tests/agent-studio/graph-agent-openrouter-boundary.test.ts
// tests/agent-studio/graph-agent-graph-repository-boundary.test.ts
// tests/agent-studio/graph-agent-governance-boundary.test.ts
// tests/agent-studio/graph-agent-postgres-source-of-truth.test.ts
```

Each test reads `server/agent-studio/services/graph-agent/**/*.ts` and asserts forbidden imports / forbidden patterns.

### 2.4 Module wiring

Graph Agent Lite registers with existing module wiring scripts:
- `pnpm check:wiring:module` — manifest exports
- `pnpm check:wiring:gateway` — gateway integration
- `pnpm check:wiring:event` — event emission
- `pnpm check:wiring:handoff` — handoffs to other modules
- `pnpm check:wiring:runtime` — runtime registration

## 3. Consequences

**Positive:**
- Boundaries enforced by automated source-scan tests; no human review fatigue.
- Module shape parity with KGRA Agent makes the codebase predictable.
- Clear escalation path: features that don't fit boundaries become governed proposals.

**Negative / risks:**
- Source-scan tests have false-positive risk on string-similar imports — use AST when possible.
- Manifest-barrel transitive setIntervals risk (per memory `feedback_check_script_pitfall.md`) — Graph Agent module must follow the `process.exit(0)` discipline for any check scripts.

## 4. Acceptance

- [ ] Graph Agent Lite module skeleton lands with manifest/ports/public-api parity to KGRA Agent.
- [ ] All 5 boundary source-scan tests land before Graph Agent Lite ships answers.
- [ ] Runtime trace emission verified through `agsRuntimeRuns`.
- [ ] No direct provider SDK / neo4j-driver / cypher-client imports anywhere under `server/agent-studio/services/graph-agent/`.
- [ ] No direct mutation of graph nodes/edges from Graph Agent code.

## 5. Evidence

- KGRA Agent module shape: `server/kgra-agent/{manifest,ports,public-api,contracts,engine,events,handoffs,router,state,actions,routing,adapter,nodes}.ts`.
- MCP dispatcher: `server/agent-studio/services/mcp/dispatcher.ts`.
- OpenRouter Model Access: `server/openrouter/model-access/`.
- Existing `check:wiring:*` scripts in `package.json`.
- V3 source-scan pattern: `tests/agent-studio/runtime-observability-writers-chat-sim.test.ts`.
