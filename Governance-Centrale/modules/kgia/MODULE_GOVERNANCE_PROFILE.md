# KGIA — Module Governance Profile

## Module Identity
- **Name:** Knowledge Graph Interpretation Agent (KGIA)
- **Key:** `kgia`
- **Domain:** Knowledge Graph Reading & Interpretation
- **Status:** V1 Active
- **Governance Owner:** Governance Center (CGT v2)

## Governance Classification
- **Execution Layer:** Orchestrator / Worker Runtime
- **Data Classification:** Workspace-scoped, no cross-workspace data leakage
- **Risk Profile:** R2-R3 (read-only queries, external system connections)

## Non-Bypassable Controls

### 1. Read-Only Default
All graph queries are read-only by default. Write operations (CREATE, MERGE, DELETE, SET, REMOVE, INSERT, UPDATE, DROP) are blocked at the governance layer via 15 explicit blocked patterns.

**Enforcement point:** `governance/policies.ts → enforceReadOnly()`

### 2. Source Allowlist
Sources must be explicitly allowlisted for production use. Non-allowlisted sources trigger governance warnings.

**Enforcement point:** `governance/policies.ts → enforceSourceAllowlist()`

### 3. SSRF Prevention
Source registration blocks private IP addresses (127.0.0.1, localhost, 10.*, 172.16.*, 192.168.*, 0.0.0.0, ::1).

**Enforcement point:** `governance/safety.ts → gateSourceRegistration()`

### 4. Query Shape Validation
All queries pass through shape validation: prefix check, dangerous pattern scan, LIMIT clause enforcement.

**Enforcement point:** `governance/policies.ts → validateQueryShape()`

### 5. Hop & Row Limits
Maximum traversal depth and result count are enforced per-source and globally.

**Defaults:** maxHops=6, maxRows=5000, maxTokenContext=128000

**Enforcement point:** `governance/policies.ts → enforceHopLimit(), enforceRowLimit()`

### 6. Audit Trail
Every policy decision is persisted to `kgia_policy_decisions` with: action, decision, reason, rule, actor, context.

**Enforcement point:** `governance/safety.ts → persistPolicyDecision()`

### 7. Governance Gating
All mutations use `governedProcedure` which requires action registration in `platform_action_registry.yaml` with deny-by-default for unknown actions.

## Action Registry

| Action Key | Risk | Capability | Stage |
|------------|------|------------|-------|
| `kgia.source.create` | R3 | kgia.manage | mutate |
| `kgia.source.update` | R2 | kgia.manage | mutate |
| `kgia.source.delete` | R3 | kgia.manage | mutate |
| `kgia.session.create` | R1 | kgia.use | mutate |
| `kgia.run.execute` | R2 | kgia.use | mutate |
| `kgia.benchmark.createCase` | R2 | kgia.manage | mutate |
| `kgia.benchmark.runCase` | R2 | kgia.use | mutate |

## Database Tables (16)
All tables carry `workspaceId` (indexed) for workspace-scoped isolation:
- kgia_sources, kgia_sessions, kgia_runs, kgia_query_plans, kgia_query_executions
- kgia_answers, kgia_evidence_nodes, kgia_evidence_edges
- kgia_memory_nodes, kgia_memory_edges
- kgia_ingestions, kgia_ingestion_chunks, kgia_entity_resolutions
- kgia_benchmark_cases, kgia_benchmark_runs, kgia_policy_decisions

## Module Guard
All routes are gated by `requireModule(workspaceId, "kgia")` — module must be enabled per-workspace.
