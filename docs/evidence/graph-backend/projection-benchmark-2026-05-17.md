# Projection Write Benchmark Evidence (item 47)

> Evidence template tracking `enqueueProjectionJob` + projection
> worker round-trip benchmark results. Populated by operator
> dispatch of `graph-bench-neo4j-ce.yml`.

## Scope

Benchmark the production projection write path end-to-end:

- node upsert (create + update)
- edge upsert (create + update)
- node delete
- edge delete

For each operation: multiple dataset sizes (sanity ~1k / full ~50k
nodes per `DEFAULT_FIXTURE` in `scripts/graph-bench/lib/fixtures.ts`).

## Commit SHA

Branch `backend-operational-evidence-2026-05-17`. Replace with merge
SHA when PR is merged.

## Command / workflow

```yaml
# .github/workflows/graph-bench-neo4j-ce.yml — workflow_dispatch
# inputs: scenarios / iterations / fixture_scale / include_postgres_baseline
```

Local operator run (when credentialed):

```bash
NEO4J_URI=bolt://localhost:7687 \
NEO4J_PASSWORD=<dev-only> \
GRAPH_BACKEND=neo4j-ce \
pnpm tsx scripts/graph-bench/run-benchmark.ts
```

## Environment

- Backend: `neo4j-ce`
- Service: `neo4j:5-community` (CI) or operator-supplied container
- Postgres baseline: `postgres:16` (CI side-by-side)
- Fixture: `lib/fixtures.ts` synthetic dataset

## Result

**`BLOCKED BY MISSING CREDENTIALS / INFRA`** on this commit.

Workflow is wired and operator-runnable; the harness
(`scripts/graph-bench/run-benchmark.ts`) exists; the report shape is
specified in `docs/evidence/graph-backend/README.md`. No live run has
been triggered for this date.

## Failures / blockers

n/a (no run on this commit). Live evidence is operator-action via
the credentialed workflow dispatch.

## Next action

Operator dispatches `graph-bench-neo4j-ce.yml` with chosen scenario
+ scale inputs. Workflow brings up service containers, runs the
harness, writes the per-scenario evidence directory under
`docs/evidence/graph-backend/<date>-neo4j-ce-<scale>/`, uploads the
GitHub Actions artifact, and commits back per the runbook (`docs/runbooks/agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md`).

## Template for operator-completed run

When the bench workflow PASS-or-FAILs, add the following table to
the closure PR:

```markdown
## Run @ YYYY-MM-DDTHH:MM:SSZ — <fixture-scale>

| Scenario | Iterations | Nodes | Edges | p50 (ms) | p95 (ms) | Mean (ms) | Errors |
|---|---|---|---|---|---|---|---|
| node_upsert    |  |  |  |  |  |  |  |
| edge_upsert    |  |  |  |  |  |  |  |
| node_delete    |  |  |  |  |  |  |  |
| edge_delete    |  |  |  |  |  |  |  |

- Workflow run: https://github.com/RachEma-ux/MyNewAp1Claude/actions/runs/<id>
- Postgres baseline (if run): see `<date>-postgres-baseline-<scale>/`
```

Pass/fail threshold per the runbook: matches the targets in
`docs/architecture/agent-studio-native-graph-workspace-performance-targets.md`.
