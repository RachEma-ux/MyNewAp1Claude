# Agent Studio — Hardening Invariants (Consolidated)

**Status:** Adopted 2026-05-11
**Phase:** Native Graph Workspace Phase 28
**Owner:** Native Graph Workspace working group

---

## Summary

The Native Graph Workspace and Agent Studio retrofit ship with a
catalog of **hardening invariants** — boundary rules that, if
violated, would silently degrade safety, governance, or
correctness. This ADR consolidates the catalog into one place,
naming each invariant + where it is enforced + the failure-mode
class it prevents.

The Phase 28 roadmap entry lists 30+ governance requirements + 24
CI blockers. Each one is already enforced by some combination of:
- A source-scan test (greps the codebase for forbidden patterns).
- A unit test (validates runtime behavior).
- A governance adapter check (rejects at the request boundary).
- A boundary check script (runs in `pnpm check`).

This doc is the **index**; the enforcement lives elsewhere. The
goal is for a future auditor to look at one file and know which
guardrails are operational + which are gaps.

---

## Tool execution boundaries

### I-TOOL-1: MCP dispatcher is the only tool path

**Statement:** `dispatchMcpToolCall(input)` is the sole entry point
for tool execution. Agent code, retrofitted modules, and graph
agents all route through it.

**Enforced by:** `services/mcp/dispatcher.ts` (the single
chokepoint); call-site source-scan tests in
`tests/agent-studio/c2-c7-message-trace-asymmetry-doc.test.ts`
and the Cycle-7 audit set.

**Failure mode prevented:** A bypass would mean tool calls fire
without proposed-tool-call validation, approval gate, risk-class
routing, or trace recording — silent governance escape.

### I-TOOL-2: Proposed tool calls flow through validation

**Statement:** Every tool call must construct a `ProposedToolCall`
record and pass it through the Phase 8 validator before reaching
the dispatcher.

**Enforced by:** dispatcher rejects on missing
`ProposedToolCall` shape; `proposed-tool-call-runtime-trace.test.ts`
+ Cycle-6/7 audit tests.

**Failure mode prevented:** Skipping validation lets malformed
calls through, with downstream effects on governance + trace
correctness.

### I-TOOL-3: `riskClass="code_execution"` routes to sandbox

**Statement:** Tools with `riskClass="code_execution"` execute
inside the `node:vm` sandbox; the sandbox cannot be bypassed by
re-routing.

**Enforced by:** D-SBX-3 + `services/sandbox/` + dispatcher
integration tests.

**Failure mode prevented:** Code-execution tools running in the
host process can escape any isolation boundary.

---

## Governance + approval boundaries

### I-GOV-1: governedProcedure enforces approval

**Statement:** Procedures declared as `governedProcedure` reach
`requireGovernedAction` before resolver code runs. Approval-
gated actions cannot be invoked without prior approval.

**Enforced by:** `_core/trpc.ts` middleware; `action-key-map.ts`
+ `platform_action_registry.yaml` lockstep test; Cycle-4
approval-lifecycle suite.

**Failure mode prevented:** Direct resolver invocation would
skip approval, breaking the audit trail.

### I-GOV-2: governance adapter applies risk classification

**Statement:** `evaluateGovernance` reads the 8-class
`riskClass` taxonomy from the manifest and applies the matching
policy. No procedure can override the manifest's risk class.

**Enforced by:** D-TOOL-1 + D-TOOL-5 (manifest-only riskClass);
`governance-adapter.test.ts`.

**Failure mode prevented:** Caller-side risk-class overrides
would let dangerous actions claim lower risk.

### I-GOV-3: approval bypass is rejected at the boundary

**Statement:** Procedures wrapping a governed action cannot
"unwrap" the approval — the inner governed action still fires its
own check.

**Enforced by:** Phase 31-32 audit; gateway-wrapper tests in the
Cycle-4 + Phase 32 closure docs.

**Failure mode prevented:** Wrapper code that pre-approves the
inner action would create a silent escalation path.

---

## Vault + note boundaries

### I-VAULT-1: vault permission model is server-evaluated

**Statement:** Vault membership + workspace scope are checked
server-side on every read/write through the vault repository.
Client code cannot ride past with a stale permission cache.

**Enforced by:** `services/vault/repository-asdb.ts` queries
constrained on `vault_id` + member lookup; vault-router tests in
`graph-agent-router-shape.test.ts`.

**Failure mode prevented:** Client-side permission filtering is
defeated by API consumers; only server-side filtering binds.

### I-VAULT-2: optimistic-lock conflict is recorded, not silently overwritten

**Statement:** `updateNote` carries an `expectedVersion`;
mismatches insert a row into `ags_vault_note_conflicts` and
return a conflict response. The latest version is NOT silently
overwritten.

**Enforced by:** `repository-asdb.ts` update path;
`vault-repository-stub.test.ts` + the optimistic-lock contract
in `services/vault/repository.ts`.

**Failure mode prevented:** Silent overwrite loses the
overwritten editor's work.

### I-VAULT-3: trace permission filter at the explain reader

**Statement:** Decision-trace reads filter by `actorUserId` when
supplied; users see only their own traces. The same filter plumbs
through the trace export + vault-note export paths.

**Enforced by:** Phase 14 §7 (`explain-reader.ts` `actorUserId`
option); router procedures pass `ctx.user.id` consistently.

**Failure mode prevented:** Cross-user trace visibility would
leak runtime behavior across operator boundaries.

---

## Graph boundaries

### I-GRAPH-1: GraphRepository is the only graph access path

**Statement:** No `neo4j-driver` or `@neo4j/driver` imports outside
`server/agent-studio/services/graph/repository/**` and
`server/modules/kgia/**`. Source-scan tested.

**Enforced by:** `graph-repository-boundary.test.ts` and
`graph-agent-boundaries.test.ts`.

**Failure mode prevented:** Direct driver imports bypass the
permission filter + visibility rules.

### I-GRAPH-2: Postgres is the source of truth; Neo4j is a projection

**Statement:** Postgres → Neo4j is the only direction outside
ADR-approved bidirectional flows (Phase 11.5 graph change
proposals). Catastrophic Neo4j loss recovers via projection
rebuild.

**Enforced by:** `services/graph-projection-sync/` writes
unidirectionally; ADR-locked deviation in
`agent-studio-postgres-neo4j-responsibility-split.md`;
`agent-studio-workspace-sync-strategy.md` §"Neo4j projection
rebuild strategy."

**Failure mode prevented:** Bidirectional flow without invariant
control creates divergence; Neo4j failure becomes data loss.

### I-GRAPH-3: graph mutations route through graph change proposals

**Statement:** Graph Agent Lite + Quality Agents create
proposals; they do not mutate graph facts directly. Approval
fires the mutation via Phase 11.5.

**Enforced by:** `services/graph-correction/lifecycle.ts`
service does not write to entity tables; engine never calls
graph-write APIs directly; Phase 23 lifecycle service.

**Failure mode prevented:** Direct agent mutation skips human
approval for source-of-truth changes.

### I-GRAPH-4: Cypher templates parameterize; no raw query strings

**Statement:** All Cypher executes via the `ags_query_templates`
registry. No raw Cypher composition outside the template body.
Text2Cypher is read-only; mutations forbidden.

**Enforced by:** `services/graph-skill/template-execution-gate.ts`
(Phase 12.5 §13); registry-only execution path.

**Failure mode prevented:** String-built Cypher is the classic
injection vector; templates eliminate it.

---

## CAG + raw artifact boundaries

### I-CAG-1: CAG blocks reference note versions, not mutable notes

**Statement:** `ags_cag_block_note_references` carries
`noteVersionId`, not just `noteId`. Block content is anchored to
a specific version so future edits don't silently re-shape the
compiled CAG context.

**Enforced by:** Phase 10 + Phase 12.5 §14 source-note FK on
`ags_graph_skill_pack_versions.source_note_version_id`.

**Failure mode prevented:** Block re-shape under the operator's
feet undermines compiled-context stability.

### I-RAW-1: raw artifact policy

**Statement:** Universal Ingestion produces
`NormalizedKnowledgeUnit` rows; prompts read those. Raw source
files cannot be injected directly into prompts.

**Enforced by:** Phase 2-3 ingestion pipeline; CAG service
boundary; retrofit Phase 11+ closure.

**Failure mode prevented:** Raw injection bypasses sanitization,
encoding normalization, and provenance recording.

---

## Runtime trace + retention boundaries

### I-TRACE-1: every extension invocation records to agsRuntimeRuns

**Statement:** No silent extension path. Every command,
template, pack, or tool firing creates a runtime-run row.

**Enforced by:** engine wiring; Phase 18 extension framework ADR
invariant 7.

**Failure mode prevented:** Silent paths are invisible to the
audit trail.

### I-TRACE-2: trace retention policy is operator-triggered + governed

**Statement:** `agentStudio.graphAgent.pruneTraces` is a
`governedProcedure`. Auto-purge does not happen without operator
action + governance approval.

**Enforced by:** Phase 14 §3 retention.ts +
`graph-agent-prune-traces-governance.test.ts`.

**Failure mode prevented:** Silent auto-deletion of audit rows
would erase the trace ledger.

### I-TRACE-3: sensitive payload redaction default

**Statement:** Trace markdown exports apply
`redactSensitivePayload` by default. Operators must explicitly
opt out (`redact: false`) to see raw payloads.

**Enforced by:** Phase 14 §4 + `redaction.test.ts`.

**Failure mode prevented:** Default-off would leak credentials,
tokens, and PII through markdown exports.

---

## Performance + observability boundaries

### I-PERF-1: performance target violation requires explicit waiver

**Statement:** Phase 20 benchmark targets gate CI. A regression
that exceeds the p95 budget fails the build unless an explicit
waiver lands as a roadmap PR.

**Enforced by:** Phase 20 benchmark runner (forthcoming as Phase
20 lands) +
`docs/architecture/agent-studio-graph-production-operations.md`.

**Failure mode prevented:** Silent performance regression
accumulates until the workspace is unusable.

### I-OBS-1: error events record at workspace error boundary

**Statement:** Promotion validation rejections, projection sync
failures, template gate denials all record to
`ags_workspace_error_events`. Operators see the diagnostic trail
via the Phase 22 observability surface.

**Enforced by:** Phase 22 backend
(`services/workspace-observability/`); writer call sites land in
follow-on PRs (each error-emitting service wires its recorder).

**Failure mode prevented:** Errors disappear into logs without
operator visibility.

---

## Acceptance criteria mapping

Phase 28 lists 30+ governance requirements + 24 CI blockers; this
ADR doesn't reproduce them all line-for-line, but every named
invariant maps to one or more roadmap items. The audit-grade
mapping:

- Tool boundaries (I-TOOL-1/2/3) ↔ "MCP boundary enforcement",
  "Graph Agent boundary enforcement", "Tool Knowledge promotion
  without schema compatibility", "Code execution sandbox bypass".
- Governance boundaries (I-GOV-1/2/3) ↔ "Approval bypass", "Risk
  class manifest authority", "Governance adapter override".
- Vault boundaries (I-VAULT-1/2/3) ↔ "Note without permission
  context accepted", "Silent overwrite on concurrent edit",
  "Trace permission enforcement".
- Graph boundaries (I-GRAPH-1/2/3/4) ↔ "Neo4j query bypasses
  GraphRepository", "Graph backend bypasses GraphRepository",
  "Text2Cypher executes mutation", "Cypher query template
  bypasses permission filter", "Graph Agent mutates graph facts
  directly".
- CAG / raw artifact (I-CAG-1, I-RAW-1) ↔ "CAG block reference
  to mutable note instead of note version", "Raw artifact
  injected into runtime prompt".
- Trace + retention (I-TRACE-1/2/3) ↔ "Audit trail", "Trace
  retention policy", "Sensitive payload redaction".
- Performance + observability (I-PERF-1, I-OBS-1) ↔ "Performance
  target violation without explicit waiver", "Migration audit
  policy", "User feedback policy".

This ADR closes the Phase 28 "Hardening" objective by giving
auditors a single index. Per-CI-blocker enforcement implementation
work continues across follow-on phases (each CI blocker has
one-or-more existing tests or check scripts named above).

---

## See also

- `docs/architecture/agent-studio-canvas-strategy.md` — Phase 17
- `docs/architecture/agent-studio-extension-framework-strategy.md`
  — Phase 18 runtime boundary list (10 invariants overlapping
  here)
- `docs/architecture/agent-studio-workspace-sync-strategy.md` —
  Phase 19 server-first model
- `docs/architecture/agent-studio-graph-production-operations.md`
  — Phase 27 monitoring + on-call discipline
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
  Phase 28
