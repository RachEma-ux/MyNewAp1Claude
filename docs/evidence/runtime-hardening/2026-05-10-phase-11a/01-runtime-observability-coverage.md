# Phase 11a — Runtime Observability Coverage Audit

**Date:** 2026-05-10
**Roadmap:** Agent Studio Runtime Hardening V3, §11a (Track B)
**Scope:** define + capture every metric named in roadmap §11a; freeze the storage schema BEFORE Phase 11b builds the UI.

**Storage decision (per §11a):** reuse existing trace/audit tables where columns suffice. New columns or tables only when reuse is impossible.

---

## 1. Coverage Matrix

For each roadmap-§11a metric, the table is the canonical storage. **Status** column meanings:

- ✅ — already stored as a real column
- ⚙️ — derivable via SQL aggregate over an existing table (no new column needed)
- ➕ — **NEW column added in this phase** (5 total)

| # | Metric | Status | Storage |
|---|---|---|---|
| 1 | stream id | ✅ | `agsRuntimeRuns.id` (the run id IS the stream id for SSE flows) |
| 2 | session id | ✅ | `agsChatSessions.id` referenced via run input payload / `runtimeRunId` foreign key on tool-call traces |
| 3 | agent id | ✅ | `agsRuntimeRuns.agentId` |
| 4 | runtime state | ✅ | `agsRuntimeRuns.status` (`pending` / `running` / `completed` / `failed`) |
| 5 | SSE duration | ➕ | NEW: `agsRuntimeRuns.sseDurationMs` — distinct from `durationMs` (which covers the whole run including pre-stream setup) |
| 6 | first-token latency | ➕ | NEW: `agsRuntimeRuns.firstTokenMs` — closes Gate 7 numeric `p95 first-token < 5s` |
| 7 | token latency series | ⚙️ | NOT persisted as a series — Gate 7 only requires p95 first-token (already captured via #6). Per-token-gap series is in-memory only, surfaced through future log/Prometheus exporters (Phase 11b+) |
| 8 | tool-call count | ⚙️ | `SELECT COUNT(*) FROM agsToolCallTraces WHERE runtimeRunId = $runId` |
| 9 | tool dispatch latency | ⚙️ | `agsToolCallTraces.durationMs` per row |
| 10 | approval wait time | ⚙️ | `decidedAt - createdAt` on `agsPendingPermissionRequests` rows |
| 11 | RAC retrieval latency | ⚙️ | `agsRacRuntimeTraces.metrics.latencyMs` (per-source map; cycle-8 M6-c8 contract) |
| 12 | context blocks included | ⚙️ | `SELECT COUNT(*) FROM agsRacContextBlocks WHERE runtimeTraceId = $tid` |
| 13 | trace/audit write status | ⚙️ | `agsRuntimePolicyEvents` row presence indicates audit success; `agsToolCallTraces` row presence indicates trace success |
| 14 | error reason | ➕ | NEW: `agsRuntimeRuns.errorReason` — free-form when `status='failed'`. Per-call errors stay on `agsToolCallTraces.errorMessage`; this is the run-level summary |
| 15 | client disconnects | ➕ | NEW: `agsRuntimeRuns.clientDisconnected` boolean — Phase 3.4 added the SSE-side abort signal but didn't persist the outcome. Operators want to filter "runs that ended because the user navigated away" |
| 16 | model gateway errors | ⚙️ | `agsToolCallTraces.errorMessage` + `agsRuntimePolicyEvents` rows where `policyKey='openrouter_model_access'` |
| 17 | dispatcher failures | ⚙️ | `agsRuntimePolicyEvents` rows where `decision='deny'` AND `policyKey='mcp_dispatch'` |
| 18 | validation rejection count | ⚙️ | `SELECT COUNT(*) FROM agsToolCallTraces WHERE runtimeRunId = $runId AND validationVerdict = 'rejected'` |
| 19 | idempotency conflict count | ➕ | NEW: `agsRuntimeRuns.idempotencyConflicts` integer — Phase 3.2 emits the SSE error event but has no persisted counter. Operator dashboards want to flag "this session repeatedly hit dup `clientMessageId`" |

**Net result:** 14 of 19 metrics already covered (✅ + ⚙️). 5 truly missing → 5 new columns on `agsRuntimeRuns`.

---

## 2. Schema additions (Phase 11a)

All five new columns land on `agsRuntimeRuns` as nullable / defaulted so existing rows + simulation-only paths remain compatible. The Drizzle schema reconciler auto-applies `ALTER TABLE ADD COLUMN IF NOT EXISTS` on boot, so no manual migration step is required for ASDB.

```ts
// agsRuntimeRuns additions (Phase 11a)
sseFirstTokenMs: integer("sse_first_token_ms"),       // metric #6
sseDurationMs: integer("sse_duration_ms"),            // metric #5
errorReason: text("error_reason"),                    // metric #14
clientDisconnected: boolean("client_disconnected").default(false),  // metric #15
idempotencyConflicts: integer("idempotency_conflicts").default(0),  // metric #19
```

**Indexes:** none added in Phase 11a. The new columns are populated by the SSE handler / chat-stream loop on terminal events (one row write per run); they're not hot-path query targets until Phase 11b's UI lands. Phase 11b owns any indexes its query patterns require.

**Population:** the columns are added in Phase 11a but writers are wired in Phase 11b alongside the UI. This keeps the schema-freeze-vs-UI-build separation the roadmap asks for. Pre-population the columns are nullable / defaulted, and consumers can read them without crashing.

---

## 3. What's intentionally NOT in Phase 11a

- **Per-token-gap series** (#7) — too high-cardinality for SQL persistence. If Phase 12 load tests show first-token isn't the right SLO target, a future phase adds a Prometheus exporter or in-memory ring buffer with bounded retention.
- **Aggregate counters** (e.g. dispatcher_failures_total) — Phase 11c (SLOs) decides which aggregates need pre-computation. SQL aggregates over existing tables work fine for the dashboards Phase 11b ships.
- **Cross-run correlation (trace IDs)** — `runtimeRunId` already chains run → trace → context-blocks → tool-call-traces → policy-events. No new correlation id needed.
- **External APM integration** — Phase 11c may add a Prometheus / OTel exporter. Phase 11a is local-DB-only.

---

## 4. Closure

Phase 11a deliverable: this audit + the 5 schema additions. Phase 11b consumes this matrix to build the UI; Phase 11c documents SLO thresholds; Phase 12 runs load tests against the SLO numerics. Gate 7 closes when 11a + 11b + 11c + 12 all close.
