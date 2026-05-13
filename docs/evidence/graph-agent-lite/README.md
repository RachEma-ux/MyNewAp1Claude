# Graph Agent Lite Evidence

This directory archives the output of the `Golden Questions — Live
Evaluation (G10)` workflow_dispatch GitHub Actions workflow.

## Directory shape

After each operator-triggered run, the workflow writes:

```
docs/evidence/graph-agent-lite/
└── YYYY-MM-DD-golden-questions/
    └── report.md
```

The workflow also uploads the directory as a GitHub Actions artifact:
`golden-questions-YYYY-MM-DD`.

## Two evidence modes

| Mode | When | Exit code | Report shape |
|---|---|---|---|
| **Inventory** | Day-1 / pre-live-wiring | 0 (or 1 with `--require-live`) | `liveWired: false`, full question inventory + expected paths + minimum citation counts |
| **Live** | After the adapter-composition operator-implementation PR lands | 0 on pass / 1 on suite failure | `liveWired: true`, per-question results: chosen skill pack, chosen Cypher template, retrieval mode, citation count, raw answer, pass/fail |

The inventory mode is intentional: it produces useful closure-evidence
even before live wiring lands, by surfacing the seed-to-registry
contract (which packs / templates each question expects to resolve).

## How to produce evidence

1. Operator goes to **Actions → Golden Questions — Live Evaluation (G10)**.
2. Clicks **Run workflow** with desired inputs:
   - `suite` — specific suite key or `all`
   - `require_live` — `true` to fail the run if still in inventory
     mode; `false` (default) to accept inventory output
3. Workflow brings up `postgres:16` service container, seeds the
   suites, runs the eval, archives the report.
4. Operator downloads the artifact, commits the report directory
   under this path, and opens a closure PR per runbook §4.5.

## How this evidence flips G10

Per `docs/runbooks/agent-studio-native-graph-workspace-golden-questions-evaluation-runbook.md`
§4.5:

| Outcome | Action |
|---|---|
| 4 / 4 suites pass (live mode) | G10 → **Closed (live evaluation passed YYYY-MM-DD)**. Append Validation Evidence section to `docs/architecture/agent-studio-native-graph-workspace-user-feedback.md`. |
| 1 suite fails on citation-count miss only | Investigate retrieval-safety filter; rerun before declaring regression. |
| 1 suite fails on path mismatch | Suspect eligibility ranking or template-execution-gate drift. Open fix PR. |
| ≥ 2 suites fail | Block Phase 23 graph-quality merge train until root cause identified. |

## Live wiring — next operator-implementation PR

The day-1 `run-golden-questions.ts` writes the inventory report. The
next operator-implementation PR composes `GraphAgentEngine` with the
full adapter set (`GraphRepository` + `GraphRetrievalRouter` +
`ModelAccessAdapter` + `McpDispatchAdapter` + `RuntimeTraceAdapter` +
`GraphAgentDecisionTraceAdapter`). When that PR lands:

- Provider credentials MUST flow through `withProviderCredential` per
  Plan v3 D1 — never via raw `process.env` reads in script bodies.
- Tool calls MUST route through `dispatchMcpToolCall()`.
- Model calls MUST use the OpenRouter Model Access path.
- The agent MUST NOT mutate graph facts; corrections flow through the
  Phase 11.5 proposal/approval surface.

## Not in this directory

- The question seed — `server/agent-studio/services/graph-skill/seed-golden-questions.ts`.
- The static integrity test — `tests/agent-studio/graph-skill/golden-questions/seed-integrity.test.ts`.
- The eval CLI — `scripts/agent-studio/run-golden-questions.ts`.
- The workflow — `.github/workflows/graph-golden-questions-live.yml`.
