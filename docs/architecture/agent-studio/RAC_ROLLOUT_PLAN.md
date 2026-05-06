# RAC Rollout Plan

**Owner:** Agent Studio module
**RAC phase:** P12 (Rollout Readiness)
**Status:** Adopted — sequenced gates for staging → prod
**Authority:** Required reading before any RAC-enabled agent is promoted past `dev`.

---

## 1. Why this document exists

Phases P1A–P11 landed the Agent Studio Native RAC stack: capability packs (CAG), a source registry, retrieval planning/execution/filtering, the context assembler, runtime trace + feedback, evaluation actions, the sandbox gate, the export-readiness matrix, and the configuration UI. Each phase shipped behind unit tests and the established CI fingerprint. **Shipping the code is not the same as turning it on for real users.**

This plan defines:

1. The deployment ordering (which RAC subsystems flip from `off` → `dry_run` → `on` in which order).
2. The observable signals each gate watches (no time-based promotion — every gate is a metric or audit row, not "wait 24 hours").
3. The back-out runbook (which switches revert which behaviour, in what order, with what side effects).
4. The on-call escalation path for the failure modes the matrix predicts.

The plan is intentionally **gate-driven, not calendar-driven**. We do not promote because three days passed; we promote because the previous stage produced the signals the gate requires.

---

## 2. Stage definitions

| Stage | Audience | Gate to enter | Persistence guarantee |
|---|---|---|---|
| `dev` | Engineers running the local DB | None — opt-in by setting `RAC_PROFILE=default` and creating a profile in the UI | Volatile; the dev DB is wiped on `db:push` |
| `dry_run` | Internal staging workspace | All P1A–P11 unit tests green on `main`; sandbox `health()` ok in CI | Drizzle migrations applied; ASDB rows persist |
| `on` | Production workspaces, opted-in via `racReadiness` gate | Stage-2 metrics within thresholds for the prior 7 stage runs; no `SBX_*` errors in trace; export-readiness matrix matches expected verdict for all sample agents | Prod DB; all migration journals stable |

**There is no global `rac_enabled` flag.** Every RAC subsystem is per-agent (via `ags_rac_profiles.enabled`) and per-source (via `ags_rac_sources.enabled`). The "stage" is an organisational concept, not a runtime flag. This is deliberate: per-agent toggles match how operators actually want to roll out RAC ("turn it on for the wiki agent first") and align with the eligibility gate.

---

## 3. Subsystem promotion order

Promote in this order. Each step gates on the previous step's metric envelope, not on time.

### 3.1 CAG (capability packs)

- `dev` → `dry_run`: pack builder runs without errors on every active draft for one full chat-stream cycle. Watch `cag_pack_built_total` / `cag_pack_validation_failed_total`. Validation failures should be 0. Gate: builder errors per 1000 builds < 1.
- `dry_run` → `on`: the composer dry-run `prompt` matches the live prompt for the same agent within ±5% token estimate for ≥95% of sampled agents. Surface via `cag.previewInjectedContext` against a fixed agent fixture nightly.

### 3.2 Source registry + ingestion (P2 / P3)

- `dev` → `dry_run`: profile + at least one source created for the staging workspace's pilot agent. Adapter registration ledger (Phase 3 dispatcher) shows `graphrag_adapter` AND `local_pgvector_adapter` registered.
- `dry_run` → `on`: `validateIndex` returns `ok=true` for every active source; ingestion preview returns chunks within the source's policy minScore.

### 3.3 Retrieval (P4) + assembler (P5) + runtime (P6)

- `dev` → `dry_run`: chat-stream end-of-stream writes a trace row for ≥99% of streamed messages; `safe_degraded` mode is the default. Watch `rac_retrieval_latency_ms` p50 < `policy.timeoutMs * 0.6`.
- `dry_run` → `on`: `chunks_filtered / chunks_returned ≥ 0.5` and `chunks_included > 0` for ≥80% of traces in the sampled window. `fallback_reason="retrieval_timeout"` < 1% of traces.

### 3.4 Trace + feedback + evaluation (P7 / P8)

- `dev` → `dry_run`: every chat-stream emits a trace; the RacTraceDrawer surfaces blocks for the corresponding messageId. Feedback writes idempotent on messageId.
- `dry_run` → `on`: `groundednessScore` mean ≥ 0.6 and `citationCoverage` mean ≥ 0.7 across the seed fixture (the 10 questions from P8). Reviewers' feedback is non-zero (we want at least one thumbs verdict before flipping a workspace on, so we know the loop is closed).

### 3.5 Sandbox gate (P9)

- `dev` → `dry_run`: `sandbox.health()` returns `ok: true, impl: "node-vm"` in CI for the `feat/*` branch and on `main`. The 14 P9 sandbox tests pass.
- `dry_run` → `on`: in production CI, the sandbox health probe reports `ok` for at least 7 consecutive nightly runs. `SBX_TIMEOUT` and `SBX_DENY_GLOBAL` may appear in the trace ledger (those are the gate working); `SBX_UNAVAILABLE` MUST NOT appear.

### 3.6 Export readiness (P10)

- `dev` → `dry_run`: every published agent in the staging workspace has a `racReadiness` snapshot with status ∈ {ready, degraded, blocked}; no `racReadiness=undefined` rows in the listExportCandidates output.
- `dry_run` → `on`: the eligibility gate `rac_readiness` blocks the same agents the matrix marks `blocked`; no false-positive blocks observed (an agent the operator believes is exportable but the matrix flips to blocked is investigated before promotion).

### 3.7 UI (P11)

- `dev` → `dry_run`: manual smoke per `CLAUDE.md` UI testing rule. Confirm Pack/Sources/Policy/Evaluation/Traces tabs render for an agent with a published draft.
- `dry_run` → `on`: at least one operator from outside the implementing team has driven the page end-to-end: created a profile, attached a source, edited a policy, run a preview, looked up a trace, submitted feedback. Their feedback must be acknowledged before promotion.

---

## 4. Observability dashboards

Operators should not need to read `chat-stream.ts` to know whether RAC is healthy. Three dashboards must be in place before the first workspace flips to `on`:

### 4.1 RAC retrieval latency

Source: `ags_rac_runtime_traces.retrieval_latency_ms`.

Panels:
- p50 / p95 / p99 latency, faceted by `mode` and `profile.profileKey`.
- `fallback_reason` distribution (target: `null` ≥ 99%).
- `chunks_returned` / `chunks_filtered` / `chunks_included` averages.

### 4.2 Sandbox health

Source: dispatcher logs (`invokeError.sandboxCode`) + `sandbox.health()` probe.

Panels:
- `SBX_*` error count over time (target: SBX_TIMEOUT ≤ rare, SBX_DENY_GLOBAL = the policy working, SBX_UNAVAILABLE = page on-call).
- Last-known sandbox `health.ok` boolean.

### 4.3 Export readiness

Source: `agentStudio.exportCatalog.listCandidates`.

Panels:
- Count of candidates by `racReadiness.status` (ready / degraded / blocked).
- Count by `reasons[0]` for blocked candidates (so reviewers can see "these N agents need a sandbox before export").
- Eligibility gate failures by `firstFailure` (so reviewers can see whether `rac_readiness` is the dominant blocker or whether earlier gates dominate).

---

## 5. Back-out runbook

Each subsystem can be backed out independently. There is no global kill-switch by design — backing out RAC for one agent should not affect another agent on the same node.

### 5.1 Disable RAC for an agent

`agentStudio.racSources.profile.update({ profileId, enabled: false })`. The orchestrator falls back to `safe_degraded` with empty evidence; the composer drops the `retrieval-evidence` section. CAG continues to inject. Test: chat the agent, verify no `[citation:...]` appears in responses.

### 5.2 Disable a single source

`agentStudio.racSources.source.update({ sourceId, enabled: false })`. The retrieval planner skips the source. Other sources continue to feed evidence. Test: preview retrieval, verify the source's chunks no longer appear.

### 5.3 Roll back the dispatcher gate (P9)

If the sandbox starts misbehaving in production:

```
import { clearToolSandbox } from "server/agent-studio/services/sandbox";
clearToolSandbox();
```

This makes the dispatcher throw `SBX_UNAVAILABLE` for any `code_execution` tool — which is a hard-block, not a silent passthrough (D-SBX-2). The `code_execution` tool calls fail loudly with `SBX_UNAVAILABLE`; non-`code_execution` tools continue to run unchanged. **This is the intended posture.** Restoring requires `resetToolSandboxToDefault()` at boot, which the registry does automatically.

### 5.4 Roll back P10 export readiness

Set the `listAgentToolRiskClasses` lookup to return `[]` for all agents (in `services/export-catalog-lookups.ts`). The matrix resolves to `ready` for every agent, the new eligibility gate passes for everyone, and the export wizard goes back to its pre-P10 behaviour. Re-enable by reverting the lookup edit. **This is a code change**, not a runtime flag — by design, since the matrix is correctness-critical. Reviewers must not be able to silently disable the gate from the UI.

### 5.5 Roll back P7 trace persistence

Comment out the `writeTrace` + `writeContextBlocks` calls in `chat-stream.ts` end-of-stream. Chats continue; the trace ledger stops growing. Existing trace rows remain queryable. The drawer continues to render whatever it can find. (This is the only roll-back that requires a code edit + redeploy; the others are runtime toggles.)

---

## 6. On-call escalation

| Symptom | Likely subsystem | First action | Escalate when |
|---|---|---|---|
| Chat responses missing citations | Retrieval / assembler | Check trace `fallback_reason` for the messageId | `fallback_reason="retrieval_timeout"` for ≥10% of traces in the last hour |
| Chat throws on send | CAG composer or assembler | Read `composer.warnings` from the latest trace | Composer warnings include `cag_required` or `evidence_required` that wasn't requested |
| Tool call returns `SBX_UNAVAILABLE` | Sandbox registry unbound | Run `getToolSandbox().health()` in a node REPL | Health returns `ok=false` more than once per minute |
| Tool call returns `SBX_TIMEOUT` for legitimate code | Sandbox policy | Verify the tool's `args.code` is in scope; the 1000ms default may be too tight for a specific tool | Multiple tools timing out; consider a per-tool policy override (D-SBX-IMPL-2 §3) |
| Export wizard shows `racStatus=blocked` for a known-good agent | Risk-class classifier | `readRiskClass(tool)` is returning `quarantined` for an MCP tool that should be classified | Multiple tools mis-classified; add manifest entries (D-TOOL-6) |
| `rac_readiness` eligibility gate fails for every candidate | Sandbox health probe failing globally | Check `probeSandboxForExport()` return value in a worker node | Fix is non-trivial; consider §5.4 roll-back while diagnosing |

---

## 7. What is explicitly out of scope for P12

- Any new code or schema changes. P12 is docs-only.
- Multi-region deployment guidance. We are still single-region; the forward-looking shape + trigger conditions + swap surface are locked in `docs/architecture/agent-studio-multi-region.md` (D2 closure).
- Cost/billing modelling for embedding traffic. The resource estimate (this PR's sibling doc) records the actuals; the cost model itself is a finance concern outside Agent Studio.
- Chargeback for sandbox CPU time. The default node:vm impl runs in-process; future external-sandbox impls will need a metering story.

---

## 8. Acceptance for this rollout plan

- [x] Every code phase (P1A–P11) has an entry in §3 with both gates spelled out.
- [x] Every subsystem in §3 has a back-out path in §5.
- [x] Every failure mode in §6 maps to a runbook step in §5 or a one-line diagnostic.
- [x] No promotion criterion is time-based; all are observable signals.
