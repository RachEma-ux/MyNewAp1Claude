# Traversal Benchmark Evidence (item 48)

> Evidence template tracking traversal benchmark results for
> `Neo4jCommunityGraphRepository`. Populated by operator dispatch of
> `graph-bench-neo4j-ce.yml` (traversal scenario subset).

## Scope

Benchmark the production traversal methods end-to-end against a
realistic fixture:

- `localGraph(seedNodeId, options, runtime)` — variable-depth local
  expansion
- `globalGraphSample({maxDepth, maxResults}, runtime)` — bounded
  cross-graph sample
- `neighborhood(seedNodeId, options, runtime)` — depth-bounded
  pattern match
- `shortestPath(fromNodeId, toNodeId, runtime)` — Cypher shortestPath

Each method is run permission-filtered AND unfiltered (the unfiltered
path is the absolute upper bound; the filtered path adds the
permission predicate per PR #1397 SAFE-DEFAULT DENY).

## Commit SHA

Branch `backend-operational-evidence-2026-05-17`. Replace with merge
SHA when PR is merged.

## Command / workflow

```yaml
# .github/workflows/graph-bench-neo4j-ce.yml — workflow_dispatch
# Pick traversal scenarios in the `scenarios` input.
```

## Environment

- Backend: `neo4j-ce`
- Service: `neo4j:5-community` (CI) or operator-supplied container
- Fixture: `lib/fixtures.ts` synthetic dataset
- Permission runtime: simulated workspace/governance/visibility/
  sensitivity scope per `RuntimeContext`

## Result

**`BLOCKED BY MISSING CREDENTIALS / INFRA`** on this commit.

The traversal methods are FULLY IMPLEMENTED in
`Neo4jCommunityGraphRepository` (PR #1397 P0 closure) and tested via
stub executor (47 cases in `p0-neo4j-traversal-permission-explain.test.ts`).
Live benchmark evidence remains operator-action.

## Failures / blockers

n/a (no run on this commit). A populated fixture returning empty
results would be a FAIL — the harness asserts non-zero result counts
when the fixture is non-empty (`tests/agent-studio/graph-bench/harness-integrity.test.ts`).

## Next action

Operator dispatches `graph-bench-neo4j-ce.yml` with the traversal
scenario subset selected. Workflow runs the harness, archives
evidence with p50/p95/mean/result-count per scenario.

## Template for operator-completed run

```markdown
## Run @ YYYY-MM-DDTHH:MM:SSZ — <fixture-scale>

| Scenario | Permission-filtered | Iterations | p50 (ms) | p95 (ms) | Mean (ms) | Result count | Pass |
|---|---|---|---|---|---|---|---|
| localGraph         | yes |  |  |  |  |  | ✅/❌ |
| localGraph         | no  |  |  |  |  |  | ✅/❌ |
| globalGraphSample  | yes |  |  |  |  |  | ✅/❌ |
| globalGraphSample  | no  |  |  |  |  |  | ✅/❌ |
| neighborhood       | yes |  |  |  |  |  | ✅/❌ |
| neighborhood       | no  |  |  |  |  |  | ✅/❌ |
| shortestPath       | yes |  |  |  |  |  | ✅/❌ |
| shortestPath       | no  |  |  |  |  |  | ✅/❌ |

- Workflow run: https://github.com/RachEma-ux/MyNewAp1Claude/actions/runs/<id>
- Failure case (if any): <description>
```

Pass/fail threshold per the runbook: matches the targets in
`docs/architecture/agent-studio-native-graph-workspace-performance-targets.md`.
A scenario returning empty results against a populated fixture is a
FAIL regardless of latency.
