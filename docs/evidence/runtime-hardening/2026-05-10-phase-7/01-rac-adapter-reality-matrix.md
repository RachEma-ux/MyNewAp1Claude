# Phase 7 — RAC Adapter Reality Matrix + Phase 7.5 Pre-Flight

**Date:** 2026-05-10
**Roadmap:** Agent Studio Runtime Hardening V3, §7 (Track B)
**Scope discipline (Principle 5):** consume cycle-5/6/7/8 audits + Phase 1 boundary integrity matrix; **deep-audit only adapter-level gaps** for the seven RAC source types. This document is the matrix; gaps are filed as follow-up issues, not deep-audited inline.
**Method:** parallel sub-agent audits (one for the 7 RAC adapters, one for OpenRouter Model Access streaming primitives), synthesized into the canonical matrix shape.

---

## 1. The Matrix

| Source type | Adapter | Implemented | Tested | Runtime wired | Citation | Permission | Production-ready | Gaps |
|---|---|---|---|---|---|---|---|---|
| `document_collection` | (none) | **No** | No | **No** — `pickAdapter()` returns null | N/A | N/A | **NO** | Qdrant integration deferred; no adapter binding. Placeholder for document-source retrieval. |
| `vector_index` | `local-pgvector-adapter.ts` | **Partial** | Yes (unit) | **Yes** — `pickAdapter() → localPgvectorAdapter` | Yes | **Partial** | **Partial** | pgvector extension is optional; activation requires manual SQL script. Column dim locked to 1536. Dim mismatch is hard-error (D-EMB-3). Workspace-scope filtering enforced; per-unit ACL refinement deferred. |
| `graph_index` | `graphrag-adapter.ts` | **Interface-only** | Yes (gap stubs) | **Yes** — `pickAdapter() → graphragAdapter` | No | No | **NO** | Backend unavailable (`data-analysis.graphrag.retrieve` contract missing per `GRAPHRAG_CONTRACT_GAP_REPORT.md`). Returns empty + `source_unavailable` warning; not fatal in `safe_degraded` mode. Marked for completion when contract lands. |
| `knowledge_unit` | `knowledge-unit-adapter.ts` | **Yes** | Yes (unit + integration) | **Yes** — `pickAdapter() → knowledgeUnitAdapter` | Yes | **Partial** | **Partial** | MVP full-text score (Jaccard tokens) is deterministic, not stochastic/hybrid. Workspace scope enforced; per-unit ACL refinement deferred. Freshness + validation filtering implemented. Metadata includes `permissionContext` for downstream consumers. |
| `tool_knowledge` | (reuses `knowledge-unit-adapter.ts`) | **Yes** | Yes (via knowledge-unit) | **Yes** — `pickAdapter() → knowledgeUnitAdapter` | Yes | **Partial** | **Partial** | Tool-knowledge units materialized in `agsKnowledgeUnits` (D-NKU-6). Same retrieval pipeline. No separate test suite; coverage inherited. Workspace scope enforced. |
| `external_connector` | (none) | **No** | No | **No** — `pickAdapter()` returns null | N/A | N/A | **NO** | Placeholder for future external HTTP retrieval; no adapter registration path yet. Catch-all per D-RET-1 until real producer surfaces. |
| `cag_pack` | (N/A — CAG resolver) | **N/A** | N/A | **Not via RAC** — rendered directly by `resolveCagPack()` outside retrieval path | Yes (via CAG) | Yes (via CAG) | **By design** | Not a retrieval source; source-type exists for profile config only. CAG resolver owns rendering. Citations inherited from CAG compile metadata. Ownership boundary clear (`services/cag/` vs `services/rac/`). **NOT a gap.** |

---

## 2. Production-Readiness Verdict

**Three sources READY for staging** (Partial with known constraints):

- `knowledge_unit` — MVP full-text retrieval wired end-to-end; citations + permission filtering functional. Embedded into `agsRacRuntimeTraces`. Constraint: full-text scoring (not hybrid).
- `tool_knowledge` — Wired via same adapter as `knowledge_unit`; tool-schema mirror (D-NKU-6). Constraint: inherited full-text limitation.
- `vector_index` — pgvector optional-engine pattern live; citations + workspace filtering functional. Constraint: manual extension activation required; single dim (1536).

**Three sources NOT READY:**

- `document_collection` — Qdrant adapter undefined; no dispatcher binding. Filed as follow-up.
- `graph_index` — Interface-real, backend-blocked. Structured degradation in place; unblocks when DataAnalysis exposes a public `retrieve` contract.
- `external_connector` — Catch-all placeholder; no registration mechanism.

**One source by-design out of RAC scope:**

- `cag_pack` — rendered by CAG resolver, not retrieved. Source-type exists for profile config; ownership boundary intentional.

---

## 3. Cross-References (consumed, not re-derived)

- `docs/evidence/runtime-hardening/2026-05-10-phase-1/01-wiring-and-boundary-integrity.md` §1.1–1.2 — chat-stream + chat.ts call `resolveAndAssembleContext()` which invokes `executeRetrieval()` on enabled sources. Both lanes wired.
- `docs/evidence/agent-studio-rac/GRAPHRAG_CONTRACT_GAP_REPORT.md` — graph_index adapter returns `source_unavailable`; blocked on the public retrieve contract from DataAnalysis.
- Cycle-8 closure (`project_cycle_8_complete.md`) — `RuntimeTraceMetrics` includes per-source `latencyMs`, fallback cascade, PII / license block counts. Chunks survive to `agsRacRuntimeTraces` + `agsRacContextBlocks` (M6-c8 fire-and-forget contract).

These verdicts are authoritative; Phase 7 does not re-verify them.

---

## 4. Genuinely Unverified Items (require follow-up)

| # | Item | Why unverified | Recommended owner | Recommended phase |
|---|---|---|---|---|
| G1 | `document_collection` adapter timeline | No code exists; roadmap placement ambiguous (P3/P4 boundary). Qdrant integration path / dependencies unknown. | RAC team | New phase 7.6 (or defer to Track C) |
| G2 | Per-unit ACL refinement | Workspace scope enforced; per-unit fine-grained ACL noted as deferred in `knowledge-unit-adapter.ts` §D-UI-2 comment. No timeline. | Governance team | Phase 9+ (post-streaming) |
| G3 | Embedding dim-mismatch observability | Hard-error (D-EMB-3) on mismatch but no pre-flight UI validator. Operator must notice runtime failures in `agsRacTraces`. | UI / RAC | Phase 8.x |
| G4 | `graph_index` contract stability | DataAnalysis public surface is async job-shaped (`graphRag.query`); sync `retrieve` contract does not exist. | DataAnalysis owner | External dependency |
| G5 | `external_connector` registration mechanism | No path for a new external adapter to register with `pickAdapter()`. | RAC team | New phase 7.7 (or defer) |

**These are not Phase 7 work** — Phase 7's deliverable is this matrix. Filing G1–G5 as separate items is the closure.

---

## 5. Phase 7.5 Pre-Flight (Streaming Primitives)

Per roadmap R7: micro-audit OpenRouter Model Access at Phase 7 entry to decide if Phase 7.5 is needed.

**VERDICT: partial — Phase 7.5 IS needed (scoped narrowly).**

**Evidence:**

1. **Text streaming exists.** `server/openrouter/model-access/execute.ts:321–447` exports `stream()` as `AsyncGenerator<ModelAccessStreamChunk>`. `types.ts:130–139` defines `ModelAccessStreamChunk = { delta: string, done: boolean, usage?, finishReason? }` — text-only.
2. **Tool-call streaming explicitly deferred.** `execute.ts:314–319` says: *"Phase 4 implements text-only SSE for the OpenAI-compatible shape. Anthropic streaming and tool-call streaming are deferred to Phase 17/18."* Anthropic callers fall back to non-streaming `execute()` and yield the full output as one chunk.
3. **Consumer already wired for streaming.** `chat-stream.ts:1073–1119` calls `openRouter.modelAccess.stream` via `gatewayCall`, uses `for await (const chunk of chunks)`, consumes `chunk.delta` / `chunk.usage` / `chunk.done`.
4. **No union event type yet.** `index.ts:20` exports only `ModelAccessStreamChunk` — no discriminated `ModelAccessStreamEvent`.

**Phase 7.5 scope (narrow):** extend `ModelAccessStreamChunk` into a discriminated `ModelAccessStreamEvent` union with `text_delta` / `tool_call_delta` / `tool_call_complete` variants. Update `execute.ts::stream()` to parse OpenAI/Anthropic SSE tool events and yield the new shapes. Update chat-stream consumption to pattern-match on `chunk.type` instead of `chunk.delta`. Backward compat via additive event variants — text path unaffected.

**Phase 7.5 scope (out of):** Anthropic streaming itself is a separate deferral (Phase 17/18 per existing comments). Phase 7.5 only adds the event-shape layer; the Anthropic path can stay on the buffered fallback until 17/18 lands.

---

## 6. Closure

Phase 7 deliverable: this matrix. **Per Principle 5 scope discipline, no remediation work ships in Phase 7.** The 5 unverified items (G1–G5) are filed as follow-ups. Phase 7.5 is on-deck (partial verdict per §5).
