# Permission Enforcement Evidence (item 49)

> Cross-references the unit + integration tests that prove no hidden
> graph data leaks through any code path. Each path links to a
> deterministic test plus, where applicable, the live-evidence
> workflow that operators dispatch.

## Scope

Prove permission enforcement across:

- `localGraph` (workspace + governance + visibility + sensitivity filtering)
- `globalGraphSample`
- `neighborhood`
- `shortestPath`
- GraphRAG retrieval (`graphrag_local` / `graphrag_neighborhood` /
  `graphrag_shortest_path` / `graphrag_algorithm`)
- Final context assembly (safety filter → ranker → context blocks
  → model prompt)

The load-bearing invariant: nodes the actor cannot see MUST NOT
appear in answer text, citations, decision-trace step payloads,
explain output, safety event details, or any operator-facing
surface.

## Commit SHA

Branch `backend-operational-evidence-2026-05-17`. Replace with merge
SHA when PR is merged.

## Fixture coverage

The deterministic test surface covers every required actor/role
combination per the closure prompt:

| Actor | Workspace | Roles | Visible | Hidden |
|---|---|---|---|---|
| `user:1` | A | user | public, protected (workspace-A) | hidden, archived, workspace-B |
| `user:2` | B | user | public, workspace-B | hidden, protected (workspace-A) |
| `admin:9` | A | admin | public, protected, archived (workspace-A) | hidden, workspace-B |
| `anon` | — | none | none | all |

## Evidence path-by-path (FULLY IMPLEMENTED — code + test)

| Path | Test | Hidden-leak check |
|---|---|---|
| `Neo4jCommunityGraphRepository.localGraph` SAFE-DEFAULT DENY | `tests/agent-studio/p0-neo4j-traversal-permission-explain.test.ts` (47 cases) | Hidden node never returned; cross-workspace pruned |
| `filterByPermissions` + `isVisibleToUser` | same | Two-call disambiguation pinned (hidden vs not_found) |
| `filterContextBlocks` (safety filter) | `tests/agent-studio/graph-safety-filter.test.ts` (8 cases) | `missing_citation` / `raw_artifact` / cross-workspace rejected |
| GraphRAG modes (local/neighborhood/shortest_path/algorithm) permission propagation | `tests/agent-studio/graphrag-retrieval-closure.test.ts` §B (4 cases) | Hidden block never enters context |
| Hybrid ranker cannot promote hidden | `tests/agent-studio/graphrag-retrieval-closure.test.ts` §E (7 cases) | Ranker operates on `ContextBlockOutput[]` only |
| Graph Agent provenance enricher redaction | `tests/agent-studio/item-34-provenance-enrichment.test.ts` §2 (2 cases) | Hidden envelope has NO label, NO provenance |
| Graph Agent reasoning bench permission scenario | `tests/agent-studio/item-35-reasoning-bench-shape.test.ts` `permission_hidden_distractor` | No SECRET leak in answer OR trace |

## Live-evidence status

**`BLOCKED BY MISSING CREDENTIALS / INFRA`** for the live Cypher
round-trip variant. The deterministic test surface above proves the
contract end-to-end against stub repositories. Live Cypher evidence
requires the credentialed `graph-p0-smoke-neo4j-ce.yml` workflow
which exercises `permission-filter` scenario as one of 7 scenarios
in the smoke runner.

## Failures / blockers

No leaks detected in any test. Combined coverage at this commit:

```
✓ p0-neo4j-traversal-permission-explain (47)
✓ graph-safety-filter (8)
✓ graphrag-retrieval-closure §B + §E + §F (15)
✓ item-34-provenance-enrichment §2 (2)
✓ item-35-reasoning-bench-shape (5)
```

Cumulative: **77 tests covering the permission surface, all green** on this commit.

## Next action

Operator dispatches `graph-p0-smoke-neo4j-ce.yml` for live Cypher
permission-filter scenario evidence. Add the run result block below
when the workflow completes:

```markdown
## Live Run @ YYYY-MM-DDTHH:MM:SSZ

- Scenario: permission-filter
- Status: PASS / FAIL
- Hidden nodes seeded: <n>
- Hidden nodes returned to caller: 0 (expected) / <n> if FAIL
- Visible nodes returned: <n>
- Workflow run: https://github.com/RachEma-ux/MyNewAp1Claude/actions/runs/<id>
```
