# Agent Studio Runtime SLOs

**Version:** 1.0.0 (Phase 11c, Roadmap V3)
**Owner:** Agent Studio runtime team
**Audience:** operators (rollout decisions, incident response), oncall (alert thresholds), platform (capacity planning)

This document defines the **Service Level Objectives** for the Agent Studio runtime — the chat-stream / chat / simulation lanes that dispatch tool calls and assemble RAC context. Phase 12 load tests certify against these numerics; Gate 7 of the Roadmap V3 closes when 11c + 12 close together.

## 1. Why these SLOs

Per Gate 7 of the runtime hardening roadmap (§1 Definition of Done), reference-grade certification requires **observable health metrics + documented thresholds + load-tested numerics**. The numbers below come directly from the Gate 7 quantification (§1 Gate 7 + §3 Pre-flight #3) and are intentionally:

- **Conservative.** A green dashboard at these numbers means real users have headroom. The runtime fails gracefully past the limits (degradation curve documented in §4).
- **Measurable from existing storage.** Phase 11a's audit (`docs/evidence/runtime-hardening/2026-05-10-phase-11a/`) confirmed every SLO below has a canonical column or trivial SQL aggregate. No new instrumentation is required for measurement; only for emission.
- **Aligned to user-visible failures.** Each SLO maps to a concrete user complaint: "the chat is slow to start", "tools take forever", "the runs page is empty", "memory leak crashed the server".

## 2. SLO Table

| ID | Metric | Target | Measurement | Storage / aggregation |
|---|---|---|---|---|
| **S1** | Concurrent SSE no-tool streams | ≥ **25** stable | running streams w/ `agsRuntimeRuns.status='running'` AND `triggerType='chat-stream'` AND no row in `agsToolCallTraces` for that run | live count via `pg_stat_activity` proxy + agsRuntimeRuns query |
| **S2** | First-token latency (p95) | < **5 s** | `agsRuntimeRuns.sseFirstTokenMs` p95 over last 1h, status≠'failed' | `agsRuntimeRuns.sseFirstTokenMs` (Phase 11a column #6) |
| **S3** | Concurrent tool streams | ≥ **10** stable | running streams that have ≥1 row in `agsToolCallTraces` | join `agsRuntimeRuns` × `agsToolCallTraces` filtered by `runtimeRunId` |
| **S4** | Trace writes throughput | ≥ **100** rows/min sustained, no chat back-pressure | `COUNT(*)` from `agsToolCallTraces` + `agsRuntimePolicyEvents` per minute | per-table row-rate query |
| **S5** | Long-running stream memory | **0** unbounded growth across a 2-minute stream | RSS delta from process metrics over 2-min sustained SSE | external probe (Phase 12 load harness) — no SQL; instrumentation via `process.memoryUsage()` on a live pod |
| **S6** | Client-disconnect handling | 100% of disconnected runs flagged within 30s | `agsRuntimeRuns.clientDisconnected=true` for every run whose SSE socket closed | `agsRuntimeRuns.clientDisconnected` (Phase 11a column #15) |
| **S7** | Idempotency conflict ceiling | < **5** conflicts per session per minute | `agsRuntimeRuns.idempotencyConflicts` aggregate | `agsRuntimeRuns.idempotencyConflicts` (Phase 11a column #19) |
| **S8** | Approval-wait p95 | < **300 s** (matches the cycle-7 `awaitApprovalDecision` 300s timeout) | `decidedAt - createdAt` over `agsPendingPermissionRequests` rows where `status≠'pending'` | direct SQL aggregate |
| **S9** | RAC retrieval latency p95 | < **2 s** per source, < **3 s** end-to-end context assembly | `agsRacRuntimeTraces.metrics.latencyMs` per-source map (cycle-8 M6-c8 contract) | jsonb aggregate |
| **S10** | Dispatcher failure rate | < **1%** of dispatches over rolling 10m window | `agsRuntimePolicyEvents WHERE policyKey='mcp_dispatch' AND decision='deny' AND payload.errorCode != 'not_authorized'` | rolling rate query |

**Out of scope for SLO measurement (Phase 12 load tests still run them):**

- Token latency series (per-token gap) — measured live in Phase 12 but not persisted; surfaced via in-memory ring buffer if a future audit shows S2 alone is insufficient.
- Cross-region latency — single-region operational baseline per the deferred-multi-region ADR.

## 3. Alert routing

Phase 11c documents **what** triggers an alert; Phase 11b's UI surfaces the dashboard banner. External integrations (Slack / PagerDuty) are **optional** and configured per deployment.

| Severity | Trigger | Routing |
|---|---|---|
| **P0 — page** | S5 (memory leak) confirmed across 2 consecutive probes; OR S10 > 5% over 10m | dashboard banner (red) + admin notification + audit/event log + (optional) PagerDuty |
| **P1 — alert** | S2 p95 > 8s for 10m; OR S4 < 50 rows/min while chat queue depth > 10; OR S6 < 95% | dashboard banner (amber) + admin notification + audit log |
| **P2 — informational** | S1/S3 nearing target ceiling (e.g. S1 ≥ 22 sustained); OR S7 spike on a single session; OR S8 spike on a single tool | audit log entry; surfaced in operator dashboards but no proactive notification |
| **P3 — runbook only** | Any SLO miss outside the rolling-window thresholds | logged for operator post-mortem; no real-time signal |

**Audit log:** every alert (P0–P2) writes a row to `agsRuntimePolicyEvents` with `policyKey='runtime_slo_alert'` so forensic readers can reconstruct alert history without external system dependency. The payload includes the SLO id, observed value, threshold, and rolling-window timestamp.

**External integrations (optional):**

- Slack: post P0/P1 to a configured channel via webhook. Disabled by default.
- PagerDuty: route P0 to the configured service. Disabled by default.
- Prometheus exporter: a future phase may expose `runtime_slo_*` gauges. Out of scope for 11c.

## 4. Degradation curve

When the runtime is pushed past the SLO ceilings, behavior degrades gracefully:

| Load level | Expected behavior |
|---|---|
| **At target** (S1=25, S3=10, S4=100/min) | All SLOs green; first-token p95 < 5s; no errors. |
| **1.5× target** | First-token p95 climbs toward 8s; trace writes still flow but with measurable lag (queue depth visible); tool dispatches succeed. |
| **2× target** | Approval gate may queue; new SSE streams accept but first-token climbs > 10s; no data loss. |
| **3× target** | New SSE streams may be rejected with `503` to protect the running set; existing streams continue. |
| **Catastrophic** (provider-side outage, ASDB down) | SSE streams emit `error` events with stable error codes (Phase 3.4); no zombie sessions; client retries via Phase 3.2 idempotency. |

## 5. Phase 12 load test plan

The numerics in §2 are the targets; Phase 12 (`Runtime Load Certification`) runs the canonical scenarios:

1. **No-tool streams scaling** — ramp 1 → 25 → 50 SSE chat sessions; record first-token p95 + RSS over time.
2. **Tool streams scaling** — ramp 1 → 10 → 25 chat sessions all triggering an MCP dispatch; record dispatch p95 + per-call governance overhead.
3. **Trace write storm** — 100 trace writes/min sustained for 5 min; assert chat throughput stays ≥ 80% of baseline.
4. **Approval queue depth** — 50 simultaneous pending approvals; assert decisions resolve and gate state stays consistent.
5. **Long-running stream** — single SSE stream for 2 min uninterrupted; assert RSS delta ≈ 0.
6. **Client disconnect storm** — 100 SSE connections, abrupt close on 80%; assert all 80 mark `clientDisconnected=true` within 30s.
7. **Approval expiry under load** — 10 expired approval rows + 10 valid + 10 pending; assert dispatcher returns the right verdict per row.
8. **MAX_TOOL_TURNS** — single chat that triggers the loop ceiling (cycle-7 `tool_loop_max_turns` guard); assert clean termination, audit row written.

Each scenario produces a row in the load report. Pass requires the SLO target on §2 + the degradation curve on §4 (no surprise failures past 1.5× target).

## 6. Lifecycle

This document is **versioned** — version field at the top. Bumps land alongside SLO changes:

- **Patch (1.0.x):** clarification edits, link updates, no numeric changes.
- **Minor (1.x.0):** new SLO row added or threshold widened (less strict).
- **Major (x.0.0):** SLO removed or threshold narrowed (more strict). Major bumps require a roadmap entry + load-test re-run.

Today's version: **1.0.0**. SLOs ratified pending Phase 12 load test confirmation; if Phase 12 finds a target is unrealistic on the production runner shape, the threshold is widened and a 1.0.1 patch lands.
