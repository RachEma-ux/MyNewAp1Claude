# Runtime Hardening V3 — Phase 11b-3 (UI Surfaces) Deferral Note

> **Status:** Deferred at Roadmap V3 closure (`c7d1d29`, 2026-05-10). This note exists so the deferral is visible alongside the Native Graph Workspace roadmap, which supersedes its scope.

## Context

Roadmap V3 (Agent Studio Runtime Hardening) closed all 7 Definition-of-Done gates on 2026-05-10 with PR #402 merging at `c7d1d29`. The 20-PR ledger spans #383–#404 (Track A production-ready: #383–#396; Track B reference-grade: #397–#404). The closure summary lives in `docs/implementation/agent-studio-runtime-hardening-roadmap.md`.

Phase 11b shipped in three sub-phases:

| Sub-phase | PR | What landed |
|---|---|---|
| 11b-1 | #403 | chat-stream observability writers (SSE lane) |
| 11b-2 | #404 | chat.ts + simulation observability writers |
| **11b-3** | **deferred** | **Runtime/RAC/Governance UI surfaces + chat diagnostics panel** |

Phase 11b-1 and 11b-2 populate the Phase 11a observability columns on `agsRuntimeRuns` (`sseFirstTokenMs`, `sseDurationMs`, `errorReason`, `clientDisconnected`, `idempotencyConflicts`) from the chat-stream, blocking chat, and simulation lanes. Operator dashboarding via direct SQL on `agsRuntimeRuns` works today.

## What Phase 11b-3 would have delivered

- Runtime Page UI surfaces (run list, run detail, SSE timeline)
- RAC Page UI surfaces (RAC composer reads + governance reasons)
- Governance Page UI surfaces (approval queue + decision history)
- Trace detail surfaces (per-run drilldown)
- Inline chat diagnostics panel (SSE first-token, idempotency conflicts, disconnect cause shown next to the chat session)

Multi-week scope. Non-blocking for any DoD gate.

## Why deferral is safe

### 1. No gate depends on Phase 11b-3

All 7 DoD gates closed without it. The Roadmap V3 closure memo (`project_runtime_hardening_complete.md`) explicitly tags 11b-3 as "non-blocking polish."

### 2. Observability data is already wired

The columns exist on `agsRuntimeRuns` (Phase 11a, PR #400), and three lanes write to them today:

- **chat-stream** (PR #403) — SSE first-token timing, SSE duration, errorReason, clientDisconnected, idempotencyConflicts
- **chat.ts blocking** (PR #404) — status, durationMs, errorReason
- **simulation** (PR #404) — abortReason → errorReason on terminal updateRuntimeRun

No UI gate exists between writers and consumers — operators can query `agsRuntimeRuns` directly via SQL. The deferred piece is purely the in-app rendering of that data.

### 3. Phase 11c SLO doc + Phase 12 assessor are the contract surface

Operator certification for Gate 7 doesn't need a UI. The flow is: run preferred load harness → pipe metrics through `scripts/load/runtime-load-report.ts` → exit code 0 = all 10 SLOs PASS → save markdown report alongside deploy. That's the closure shape; UI rendering is orthogonal.

## Why the Native Graph Workspace roadmap makes deferral *more* attractive

The new Native Graph Workspace project (`docs/implementation/agent-studio-native-graph-workspace-roadmap.md`) builds its own first-class runtime/governance surfaces:

- **Phase 14** — Runtime Trace, Decision Trace, and Audit Graph (with Neo4j projection)
- **Phase 22** — User Feedback and Failure-State Implementation (Graph Agent Explanation Panel: retrieval mode, Graph Skill Pack, Cypher query template, graph backend, projection snapshot, graph path, citations, confidence, hidden/truncated reason, correction proposal option)
- **Phase 24** — Full V1 Expansion lenses: **RAG Lens, RAC Lens, CAG Lens, Graph Skill Lens, MCP Lens, Governance Lens, Runtime Lens**, Institutional Memory Lens, Code Lens, Workflow Lens, Impact Analysis Lens, Graph Quality Lens

Every UI surface 11b-3 would have shipped — Runtime page, RAC page, Governance page, trace detail — gets superseded by the Workspace project's lens treatment of the same underlying tables. Shipping 11b-3 now means building UI that the Workspace project either rebuilds or has to integrate around. **Build-and-discard risk is real.**

## Caveats

### 1. Interim window: operator dashboarding = SQL only

Until the Workspace project's runtime/trace surfaces land (Phase 14 + Phase 24 in the new roadmap), anyone debugging a stuck run goes through SQL on `agsRuntimeRuns`. That's the current state — the original 11b-3 deferral already accepted this. The Workspace roadmap doesn't shrink that window, but it also doesn't widen it.

### 2. Don't formally re-scope 11b-3 yet

Wait until the Workspace project commits to specific runtime-surface phases. At that point fold 11b-3 in as carry-over: "RTH-V3 11b-3 carry-over — subsumed by Workspace Phase 14 + Phase 24 lens work." Maintaining two parallel UI plans is worse than waiting.

### 3. One sliver the Workspace plan doesn't obviously cover

A **chat diagnostics panel** attached to the chat surface itself (showing SSE first-token timing, idempotency conflicts, disconnect cause inline) is a different cut than the Workspace's Runtime Trace View. The Trace View is a user/agent run perspective; the chat-side inline diagnostics is a session-debug perspective.

When the Workspace plan firms up, confirm whether Phase 14 or Phase 24 picks up inline chat diagnostics. If neither does, that single sliver may still need a tiny dedicated PR later. **Not blocking anything today.**

## Verdict

**Keep Phase 11b-3 deferred.** The new Native Graph Workspace roadmap is the natural home for the UI surfaces it would have delivered. Plan to formally fold it in as a carry-over note when the Workspace project commits to Phase 14 (Runtime Trace) and Phase 24 (lens) phase plans.

## References

- Closure roadmap: `docs/implementation/agent-studio-runtime-hardening-roadmap.md`
- Closure memory: `~/.claude/projects/-root/memory/project_runtime_hardening_complete.md`
- New project roadmap: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
- Phase 11b-1 PR: #403 (`b61f94b`)
- Phase 11b-2 PR: #404 (`6364b49`)
- Phase 11a column ledger: PR #400 — `agsRuntimeRuns` columns `sseFirstTokenMs`, `sseDurationMs`, `errorReason`, `clientDisconnected`, `idempotencyConflicts`
- Phase 11c SLO doc: `docs/operations/agent-studio-runtime-slo.md`
- Phase 12 load assessor: `scripts/load/runtime-load-report.ts`, `scripts/load/README.md`
