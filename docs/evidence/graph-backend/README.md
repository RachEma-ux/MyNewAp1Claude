# Graph Backend Benchmark Evidence

This directory archives the output of the `Graph Backend Benchmark — Neo4j CE (G3)`
workflow_dispatch GitHub Actions workflow.

## Directory shape

After each operator-triggered run, the workflow writes:

```
docs/evidence/graph-backend/
├── YYYY-MM-DD-postgres-baseline-<scale>/
│   └── report.md
├── YYYY-MM-DD-neo4j-ce-<scale>/
│   └── report.md
└── YYYY-MM-DD-comparison/
    └── comparison.md          # optional, when compare-backends.ts runs
```

Where `<scale>` is `sanity` (~100 notes / 1k links) or `full` (10k notes
/ 100k links / 50k nodes / 250k edges per `DEFAULT_FIXTURE`).

The workflow also uploads the directory as a GitHub Actions artifact:
`graph-bench-YYYY-MM-DD-<scale>`.

## How to produce evidence

1. Operator goes to **Actions → Graph Backend Benchmark — Neo4j CE (G3)**.
2. Clicks **Run workflow** with desired inputs (scenarios / iterations
   / fixture_scale / include_postgres_baseline).
3. Workflow brings up `postgres:16` + `neo4j:5-community` service
   containers, runs the harness, archives the report.
4. Operator downloads the artifact, commits the report directory under
   this path, and opens a closure PR per runbook §7.

## How this evidence flips G3

Per `docs/runbooks/agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md`
§6.1 / §7:

| Outcome | Action |
|---|---|
| Pass all 10 scenarios | G3 → **Closed (validated)**. Bump `docs/architecture/agent-studio-active-graph-backend-decision.md` Status from "Adopted (provisional)" to "Adopted (validated)". Link the evidence directory. |
| Pass ≥ 8 / 10 with ≤ +10% p95 misses | G3 → **Closed with caveats**. Same ADR update + caveat list. |
| Miss > 2 scenarios or any miss > +25% p95 | G3 → **Reopened**. File `agent-studio-active-graph-backend-decision-rev-<date>.md` per runbook §8. |
| Postgres baseline misses its own targets | Investigate index/setup; re-run before declaring backend issue. |

## Hard-rule reminders

- Postgres remains source of truth. The workflow's
  `Assert Postgres source-of-truth invariant` step checks ASDB row
  counts after each run. A passing benchmark with empty ASDB tables
  is a failure.
- All graph access must go through `GraphRepository`. The harness
  uses `getGraphRepository()` — never imports `neo4j-driver` directly
  from `scripts/graph-bench/`.
- Cypher templates must be parameterized; scenarios calling
  `repo.executeTemplate()` reference templates by `templateKey` only.
- Text2Cypher is read-only; the harness must not issue mutation
  Cypher.

These invariants are enforced by:

- `tests/agent-studio/graph-bench/harness-integrity.test.ts` (CI Layer 9)
- `tests/agent-studio/repository-boundary*.test.ts`
- `.github/workflows/graph-bench-neo4j-ce.yml` source-of-truth step

## Not in this directory

- Static benchmark targets — those live in
  `docs/architecture/agent-studio-native-graph-workspace-performance-targets.md`.
- The harness itself — `scripts/graph-bench/`.
- Test fixtures — generated on demand by `lib/fixtures.ts`; not
  committed.
