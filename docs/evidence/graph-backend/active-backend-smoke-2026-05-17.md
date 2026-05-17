# Active Backend Smoke — `GRAPH_BACKEND=neo4j-ce` (item 45)

> Item 45 evidence file. Two halves: deterministic selection (covered
> by `tests/agent-studio/item-45-active-backend-selection.test.ts`)
> and live Cypher round-trip (operator-action; BLOCKED on dev boxes).

## Scope

Prove that when an operator sets `GRAPH_BACKEND=neo4j-ce`:
1. `getGraphRepository()` returns a `Neo4jCommunityGraphRepository`.
2. The repository's health probe succeeds against a real CE container.
3. Projection write, template execution, traversal, and permission
   filter all execute end-to-end against the same container.

## Commit SHA

This file ships against branch `backend-operational-evidence-2026-05-17`. Update with merge SHA after PR is merged.

## Command / workflow

**Deterministic half (run anywhere):**

```bash
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/agent-studio/item-45-active-backend-selection.test.ts
```

**Live half (operator-action; requires Neo4j 5 CE credentials):**

```yaml
# .github/workflows/graph-p0-smoke-neo4j-ce.yml — workflow_dispatch
# Brings up neo4j:5-community service container, runs the production
# Neo4jCommunityGraphRepository through 7 scenarios
# (health-probe / projection-batch / localGraph / neighborhood /
# shortestPath / permission-filter / explain-node), writes evidence
# to docs/evidence/graph-backend/<date>-neo4j-ce-p0-smoke/.
```

## Environment

| Field | Value |
|---|---|
| Backend | `neo4j-ce` (`Neo4jCommunityGraphRepository`) |
| Endpoint | `bolt://localhost:7687` (CI service container) — secret never logged |
| Database | `neo4j` (default) |
| Driver | `neo4j-driver` v5.x — lazy-loaded via dynamic import per PR #1397 |
| Repository config | from `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` / `NEO4J_DATABASE` env vars |

## Result

### Deterministic half — PASS

```
✓ tests/agent-studio/item-45-active-backend-selection.test.ts (4 tests)
  ✓ GRAPH_BACKEND=neo4j-ce → getGraphRepository() returns a Neo4jCommunityGraphRepository
  ✓ GRAPH_BACKEND=test → returns TestGraphRepository (regression guard)
  ✓ unset GRAPH_BACKEND → defaults to postgres (does NOT auto-select neo4j-ce)
  ✓ Neo4jCommunityGraphRepository selection does NOT trigger eager neo4j-driver load
```

Repository selection invariant proven. Lazy-load contract proven (test
passes on a dev box where `neo4j-driver` is declared but not
installed — selection succeeds; only actual Cypher calls would
require the driver).

### Live Cypher half — **BLOCKED BY MISSING CREDENTIALS / INFRA**

Operator action required to produce live evidence. The script
`scripts/graph-bench/run-neo4j-ce-p0-smoke.ts` is on main and
operator-runnable; the workflow is wired and skip-safe. Exit code 78
when `NEO4J_PASSWORD` is unset (honest skip per CLAUDE.md "Do not put
secrets in docs or logs").

## Failures / blockers

- No live evidence run on this commit. Reason: dev box has no
  credentialed Neo4j 5 CE container; CI workflow exists but
  workflow_dispatch has not been triggered for this date by an
  operator.

## Next action

Operator dispatches `graph-p0-smoke-neo4j-ce.yml` via Actions tab or
`gh workflow run`. Workflow brings up the service container, runs
the 7-scenario smoke, archives the report directory at
`docs/evidence/graph-backend/<date>-neo4j-ce-p0-smoke/{report.md,report.json}`,
uploads the GitHub artifact, and (optionally) commits back to a
closure PR per the runbook.
