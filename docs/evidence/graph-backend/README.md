# Graph Backend Evidence

This directory archives evidence for the graph backend surface —
benchmark output, connectivity probes, permission proof,
active-backend smoke runs, and per-date operator-dispatched
workflow artifacts.

## Index (date-stamped, items 45–50)

Per the 2026-05-17 Backend / Operational Evidence closure (items
45–51), the following date-stamped evidence files live alongside the
historical benchmark artifacts:

| Item | File | Status |
|---|---|---|
| 45 | [`active-backend-smoke-2026-05-17.md`](./active-backend-smoke-2026-05-17.md) | Deterministic half FULLY IMPLEMENTED (4 tests); live half BLOCKED BY CREDENTIALS |
| 46 | [`neo4j-connectivity-2026-05-17.md`](./neo4j-connectivity-2026-05-17.md) | BLOCKED BY CREDENTIALS — operator dispatches `graph-p0-smoke-neo4j-ce.yml` |
| 47 | [`projection-benchmark-2026-05-17.md`](./projection-benchmark-2026-05-17.md) | BLOCKED BY CREDENTIALS — operator dispatches `graph-bench-neo4j-ce.yml` |
| 48 | [`traversal-benchmark-2026-05-17.md`](./traversal-benchmark-2026-05-17.md) | BLOCKED BY CREDENTIALS — same workflow, traversal scenario subset |
| 49 | [`permission-evidence-2026-05-17.md`](./permission-evidence-2026-05-17.md) | Deterministic half FULLY IMPLEMENTED (77 tests); live half BLOCKED BY CREDENTIALS |
| 50 | This README + the 5 files above | Done |

Closure docs that link to this directory:

- `docs/evidence/agent-studio-native-graph-workspace-mvp4-closure-2026-05-17.md` (item 1, PR #1397)
- `docs/evidence/agent-studio-graphrag-retrieval-closure-2026-05-17.md` (items 26–32, PR #1398)
- `docs/evidence/agent-studio-graph-agent-runtime-closure-2026-05-17.md` (items 33–37, PR #1400)
- `docs/evidence/agent-studio-self-correction-loop-closure-2026-05-17.md` (items 38–44, PR #1401)
- `2026-05-17-graph-agent-reasoning-bench/report.md` (PR #1400 deterministic bench evidence — actually run, 6/6 PASS)

## How to add a new evidence file

1. Pick the appropriate template above (or create a new
   `<surface>-YYYY-MM-DD.md`).
2. Replace `YYYY-MM-DD` with today's UTC date.
3. Replace placeholder fields:
   - **Commit SHA** — fill from `git rev-parse HEAD`
   - **Status** — use closed-taxonomy: FULLY IMPLEMENTED /
     PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / BLOCKED BY MISSING
     CREDENTIALS / INFRA / DEFERRED BY SCOPE
   - **Endpoint hostname** — record without secrets
   - **Failure summary** — if applicable
4. Reference the new file from the closure doc that's tracking the
   relevant item.
5. Update the index table above.

## Historical benchmark workflow

The `Graph Backend Benchmark — Neo4j CE (G3)` workflow_dispatch
GitHub Actions workflow is the primary source of date-stamped
benchmark archives.

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
