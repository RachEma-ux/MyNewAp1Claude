# Runtime Load Certification

Phase 12 (Roadmap V3) — Gate 7 closure. **Operator runbook** for certifying the Agent Studio runtime against the SLOs defined in `docs/operations/agent-studio-runtime-slo.md`.

## What this directory contains

- `lib/types.ts` — input contract: `LoadReportInput` shape that operator-captured metrics must match
- `lib/metrics.ts` — pure percentile / regression math
- `lib/slo-checker.ts` — assesses a `LoadReportInput` against the 10 SLOs (S1–S10), emits per-SLO PASS/FAIL/UNKNOWN
- `lib/report-formatter.ts` — renders a `LoadReport` as markdown
- `runtime-load-report.ts` — CLI: reads JSON, prints markdown report, exit code 0 = overall PASS

## What this directory does NOT contain

A live load *harness* is intentionally out of scope. Real load tests against a deployed runtime are environment-specific:

- Choice of tool: k6 / autocannon / artillery / custom Node — operator's call
- Mocking strategy for OpenRouter Model Access (otherwise the test burns API credits)
- Connection details, auth tokens, baseline traffic shape

The certification contract is the **JSON capture format** plus the **SLO checker logic**. Operators bring the harness; this directory grades the result.

## Running a certification

1. **Capture metrics from your load harness** in the `LoadReportInput` shape (see `lib/types.ts`). Minimum viable capture:

   ```json
   {
     "timestamp": "2026-05-10T14:30:00Z",
     "environment": "staging",
     "firstTokenLatency": {
       "scenarioId": "no-tool-stream-ramp",
       "samplesMs": [820, 950, 1100, 1300, 2200, ...]
     },
     "noToolStreams": {
       "scenarioId": "no-tool-stream-ramp",
       "peakConcurrent": 27,
       "sustainedMs": 60000,
       "totalDurationMs": 180000
     },
     "traceThroughput": {
       "scenarioId": "trace-write-storm",
       "eventCount": 615,
       "windowMs": 300000
     }
   }
   ```

   Every field is optional. Missing fields → UNKNOWN verdicts for the affected SLOs (NOT pass).

2. **Run the report**:

   ```bash
   npx tsx scripts/load/runtime-load-report.ts \
     metrics.json \
     /tmp/runtime-load-2026-05-10.md
   ```

   Stdout shows the markdown report. Exit code 0 = every SLO PASS; non-zero = any FAIL or UNKNOWN.

3. **Save the report** as a Gate 7 certification artifact alongside the deploy.

## Canonical scenarios

Each scenario in roadmap §12 maps to one or more `LoadReportInput` fields. Run the operator-side harness against a staging deploy with traffic-shape matching:

| # | Scenario | LoadReportInput fields |
|---|---|---|
| 1 | 10 → 25 → 50 concurrent no-tool SSE streams | `noToolStreams`, `firstTokenLatency` |
| 2 | 10 concurrent tool streams | `toolStreams`, `toolDispatchLatency` |
| 3 | 50 simultaneous RAC retrievals | `racRetrievalLatency` |
| 4 | 100 trace writes/min sustained | `traceThroughput` |
| 5 | 50 pending approvals | `approvalWaitLatency` |
| 6 | 2-minute long-running stream | `longRunMemory` |
| 7 | Client disconnect storm (80 of 100 disconnect) | `clientDisconnects` |
| 8 | Approval expiry under load + MAX_TOOL_TURNS | `dispatcherFailures` + `dispatcherTotal` |

## SLO targets

See `docs/operations/agent-studio-runtime-slo.md` (version 1.0.0). The checker imports them from `lib/slo-checker.ts`'s `SLO_TARGETS` map; locking the doc + code in lockstep is enforced by `tests/agent-studio/runtime-slo-doc-lockstep.test.ts` + `tests/agent-studio/runtime-load-slo-checker.test.ts`.

## Why no pre-built harness?

Honest closure pattern: Gate 7 requires **proven SLO assessment**, not "we ran the test ourselves." The unit tests on `slo-checker.ts` prove the assessor logic is correct given any input shape. Operators bring their environment-specific harness; the assessor verdicts are then trustworthy because the math is locked.

This mirrors the operator-only tooling pattern from Phase 5a (`scripts/scan-published-agents-no-rules.ts`) — the script lives in the repo; the run lives at the operator's hands.
