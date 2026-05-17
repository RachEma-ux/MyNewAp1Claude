# Neo4j Connectivity Evidence (item 46)

> Evidence template tracking the health-probe result for the active
> Neo4j CE backend. Populated by operator dispatch of
> `graph-p0-smoke-neo4j-ce.yml`; this file is the date-stamped
> entry-point that closure docs link to.

## Scope

Prove that the production `Neo4jCommunityGraphRepository` can open a
Bolt connection to the configured CE container and complete a
`health()` round-trip.

## Commit SHA

Branch `backend-operational-evidence-2026-05-17`. Replace with merge
SHA when PR is merged.

## Backend configuration (no secrets)

| Field | Value |
|---|---|
| Backend | `neo4j-ce` |
| Driver | `neo4j-driver` v5.x (lazy-loaded) |
| Endpoint hostname | `localhost` (CI service) — never log full URI with credentials |
| Database name | `neo4j` (default) |
| Auth | `NEO4J_USER` + `NEO4J_PASSWORD` env vars; passwords never written to evidence |

## Connectivity status

**`BLOCKED BY MISSING CREDENTIALS / INFRA`** on this commit.

The dev box has no credentialed Neo4j 5 CE container, and CI
`workflow_dispatch` has not been triggered for this date. The
production code path (`Neo4jCommunityGraphRepository.health()`) is
implemented and tested against stub executors (see
`tests/agent-studio/p0-neo4j-traversal-permission-explain.test.ts`,
47 tests); live evidence remains operator-action.

## Failure / error summary

n/a (no run on this commit).

## Next action

Operator dispatches `graph-p0-smoke-neo4j-ce.yml`. The smoke runner
exits 78 if `NEO4J_PASSWORD` is unset (honest skip — no false
PASS). Successful run writes `health-probe` scenario to the smoke
report's first row with `nodeCount` / `edgeCount` / `latencyMs`.

## Template for operator-completed run

When the workflow runs successfully, add the following block to
this file (or replace it with a date-stamped sibling per
`docs/evidence/graph-backend/README.md`):

```markdown
## Run @ YYYY-MM-DDTHH:MM:SSZ

- Status: CONNECTED
- Endpoint hostname: <host without secret>
- Database: <db name>
- Round-trip latency: <ms>
- Driver version: <neo4j-driver version>
- Reported nodeCount: <n>
- Reported edgeCount: <n>
- Workflow run: https://github.com/RachEma-ux/MyNewAp1Claude/actions/runs/<id>
```
