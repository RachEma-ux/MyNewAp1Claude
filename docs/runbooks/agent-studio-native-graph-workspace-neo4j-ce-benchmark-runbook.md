# Neo4j CE Benchmark — Native Graph Workspace Operator Runbook

**Plan:** Agent Studio Native Graph Workspace MVP 0 — Phase 1.5 backend decision gate (G3)
**Status:** Formalized; operator execution pending
**Owner:** Operator on staging infrastructure (Neo4j CE deploy + 10k-row fixture not available in the day-to-day device environment)
**Harness:** `scripts/graph-bench/`
**Last refreshed:** 2026-05-13

---

## 1. Purpose

Validate that the Neo4j Community Edition projection backend meets the published p50 / p95 latency targets at the 10k-note / 100k-link / 50k-node / 250k-edge fixture before the Phase 7.5 production deploy proceeds.

The Phase 1.5 backend decision (`docs/architecture/agent-studio-active-graph-backend-decision.md`) currently records Neo4j CE as the **architecture-driven default**. This runbook executes the missing **operator-side validation** that flips the G3 gate from "Formalized; operator execution pending" to "Closed (validated)".

## 2. Pre-flight checklist

The operator MUST confirm all of the following before running anything:

| Check | Command | Expected |
|---|---|---|
| Docker compose available | `docker compose version` | `Docker Compose version v2.*` |
| Neo4j CE bolt port reachable | `curl -sf http://localhost:7474 \| head -n 1` | HTTP 200 OK (or browser-redirect 30x) |
| ASDB Postgres reachable | `psql -d asdb -c 'SELECT 1;'` | `(1 row)` |
| RAGDB Postgres reachable | `psql -d ragdb -c 'SELECT 1;'` | `(1 row)` |
| pnpm + tsx present | `pnpm exec tsx --version` | tsx >= 4 |
| Disk space ≥ 5 GB free | `df -h .` | ≥ 5 GB free |
| Repository clean | `git status --short` | empty |
| Branch matches main | `git rev-parse HEAD && git rev-parse origin/main` | identical |

If any check fails, do **not** proceed. File a ticket with the operator-platform team and link this runbook.

## 3. Prerequisite services

### 3.1 Neo4j CE

The bolt-port deployment must run **5.x Community Edition** (matching `Neo4jCommunityGraphRepository`'s tested driver line). Reference compose file lands at `docker-compose.graph.yml` (Phase 7.5):

```bash
docker compose -f docker-compose.graph.yml up -d
sleep 10
curl -sf http://localhost:7474 | head -n 1
```

Env vars consumed by the harness:

```bash
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=devpassword   # operator must rotate before production
```

### 3.2 Postgres baseline (control)

The harness produces a Postgres baseline so the Neo4j numbers can be compared apples-to-apples against the Postgres `GraphRepository` implementation. ASDB must be empty of fixture data before the run starts.

```bash
psql -d asdb -c "TRUNCATE ags_vault_notes, ags_vault_note_links,
  ags_graph_nodes, ags_graph_edges,
  ags_graph_projection_queue RESTART IDENTITY CASCADE;"
```

## 4. Fixture generation

```bash
GRAPH_BACKEND=postgres pnpm tsx scripts/graph-bench/run-benchmark.ts \
  --scenarios none \
  --output /tmp/graph-bench-fixture-gen.md
```

The `--scenarios none` form runs only `generateFixture()` (see `scripts/graph-bench/lib/fixtures.ts`) and skips measurement. The default fixture is 10,000 notes + 100,000 links + 50,000 nodes + 250,000 edges (see `DEFAULT_FIXTURE` in `lib/fixtures.ts`).

Verify counts after generation:

```bash
psql -d asdb -c "SELECT
  (SELECT count(*) FROM ags_vault_notes) AS notes,
  (SELECT count(*) FROM ags_vault_note_links) AS links,
  (SELECT count(*) FROM ags_graph_nodes) AS nodes,
  (SELECT count(*) FROM ags_graph_edges) AS edges;"
```

Expected: notes ≥ 10000, links ≥ 100000, nodes ≥ 50000, edges ≥ 250000.

## 5. Benchmark execution

Run each backend with **30 iterations per scenario** (default). Use a date-stamped evidence directory.

### 5.1 Postgres baseline

```bash
DATE=$(date -u +%Y-%m-%d)
GRAPH_BACKEND=postgres pnpm tsx scripts/graph-bench/run-benchmark.ts \
  --scenarios all \
  --iterations 30 \
  --skip-fixture \
  --output docs/evidence/graph-backend/${DATE}-postgres-baseline/report.md
```

### 5.2 Neo4j CE

The projection backend requires the projection queue to be drained first:

```bash
pnpm tsx scripts/agent-studio/drain-graph-projection.ts --until-empty --max-batches 200
```

Then run:

```bash
DATE=$(date -u +%Y-%m-%d)
GRAPH_BACKEND=neo4j-ce \
  NEO4J_URI=bolt://localhost:7687 \
  NEO4J_USER=neo4j \
  NEO4J_PASSWORD=devpassword \
  pnpm tsx scripts/graph-bench/run-benchmark.ts \
  --scenarios all \
  --iterations 30 \
  --skip-fixture \
  --output docs/evidence/graph-backend/${DATE}-neo4j-ce/report.md
```

### 5.3 Comparison report

```bash
pnpm tsx scripts/graph-bench/compare-backends.ts \
  docs/evidence/graph-backend/${DATE}-postgres-baseline/ \
  docs/evidence/graph-backend/${DATE}-neo4j-ce/ \
  --output docs/evidence/graph-backend/${DATE}-comparison/comparison.md
```

## 6. Pass / fail criteria

A scenario **passes** if its measured p50 ≤ target p50 **AND** p95 ≤ target p95 (both bounds from `lib/scenarios.ts`). The harness emits `overallPassed: boolean` and exits 0 on pass / 1 on fail (see `run-benchmark.ts:91`).

| Scenario | Target p50 (ms) | Target p95 (ms) |
|---|---:|---:|
| `note_open` | 300 | 800 |
| `backlinks_refresh` | 500 | 1500 |
| `note_projection_to_neo4j` | 500 | 2000 |
| `local_graph_depth_2` | 700 | 2000 |
| `permission_aware_depth_3` | 900 | 2500 |
| `search_10k_notes` | 300 | 1200 |
| `graphrag_retrieval` | 800 | 2500 |
| `cypher_template` | 300 | 1200 |
| `runtime_trace_load` | 500 | 1500 |
| `entity_resolution_scan` | 1000 | 4000 |

Source of truth for targets: `docs/architecture/agent-studio-native-graph-workspace-performance-targets.md`. If targets in this runbook drift from that ADR, the ADR wins.

### 6.1 Aggregate decision

| Outcome | Action |
|---|---|
| Neo4j CE passes **all 10** scenarios | G3 → **Closed (validated)**. Proceed to §7. |
| Neo4j CE passes ≥ 8 / 10 and the 2 misses are within +10% of p95 | G3 → **Closed with caveats**. Proceed to §7 and add the caveat list to the decision ADR. |
| Neo4j CE misses > 2 scenarios OR any miss exceeds +25% of p95 | G3 → **Reopened**. Trigger §3 fallback in `agent-studio-active-graph-backend-decision.md` (Memgraph / FalkorDB candidate or hybrid). Do NOT close. |
| Postgres baseline misses its own targets | Re-tune indexes (ASDB) before retrying. Suspect operator-side fixture skew, not backend choice. |

## 7. Archival + decision update

On a pass / pass-with-caveats outcome:

1. Commit `docs/evidence/graph-backend/${DATE}-postgres-baseline/`, `${DATE}-neo4j-ce/`, and `${DATE}-comparison/` directories. Branch name: `graph-bench-${DATE}`.
2. Update `docs/architecture/agent-studio-active-graph-backend-decision.md`:
   - Bump **Status** from `Proposed (architecture-driven default)` to `Adopted (validated)` or `Adopted (with caveats)`.
   - Append a **Validation Evidence** section linking the three evidence directories.
3. Update `docs/implementation/agent-studio-native-graph-workspace-status-check-2026-05-13.md` (and any successor status-check doc): G3 row → `Closed (validated)`.
4. Update `~/.claude/projects/-root/memory/feedback_native_graph_workspace_continuing_rule.md`: strike item 1 from "Current required closure items" with a date-stamped note.
5. Open a single closure PR titled `chore(graph-bench): close G3 via Neo4j CE benchmark ${DATE}` and request Governance-agent review.

## 8. Failure + rollback

If §6.1 returns the **Reopened** outcome:

1. Do not update the decision ADR Status — leave it as `Proposed`.
2. File a new ADR `docs/architecture/agent-studio-active-graph-backend-decision-rev-${DATE}.md` capturing the failure, the candidate fallbacks (Memgraph, FalkorDB, partitioned Postgres), and the next benchmark plan.
3. Status report G3 row stays `Formalized; operator execution pending` until a passing run lands.
4. CLAUDE.md hard rules continue to apply — the `Neo4jCommunityGraphRepository` MAY remain wired but production deploys MUST NOT proceed without a passing benchmark.

### 8.1 Memgraph fallback path

If the Reopened outcome routes to Memgraph as the candidate fallback:

1. Trigger `.github/workflows/graph-bench-memgraph-fallback.yml` via the Actions tab (`workflow_dispatch`) with `fixture_scale: sanity` first to verify the adapter wiring.
2. The workflow today fails fast at the "Memgraph adapter readiness check" step (exit 78) because the `MemgraphGraphRepository` adapter is V1+ scope per `agent-studio-native-graph-workspace-v1-v2-execution-plan.md`. The failure is **intentional** — the workflow exists as the operator-readiness artifact named here, not as a runnable benchmark.
3. To proceed with a real Memgraph benchmark, the operator-implementation PR must:
   - Add a `MemgraphGraphRepository` class under `server/agent-studio/services/graph/repository/`
   - Register `memgraph` as a backend key in `getGraphRepository()`
   - Implement the same `GraphRepository` interface (boundary tested)
   - Add Memgraph-specific Cypher dialect handling for parameterized templates
4. Once that PR merges, re-run the Memgraph workflow at `fixture_scale: full` and compare evidence against the Neo4j CE results per §5.3.

The Memgraph workflow + this §8.1 are the **fallback-readiness artifact** the Phase 1.5 ADR §3 requires. Memgraph is NOT made primary unless the Neo4j CE benchmark fails and the operator approves the migration in a rev-ADR.

## 9. CI / staging constraints

- This runbook is **not** part of per-PR CI. It cannot run on Termux device (no Docker, no Neo4j CE deploy, no 10k-row fixture).
- A **static integrity test** for the harness shape (scenario library compiles, 10 canonical scenario keys, p50 < p95, default fixture sizes match the spec, CLI imports + exit-code wiring intact) lives at `tests/agent-studio/graph-bench/harness-integrity.test.ts`. It runs in CI on every PR. It is not a substitute for execution; it only prevents harness drift between operator runs.
- A **`workflow_dispatch`-gated** GitHub Actions workflow lives at `.github/workflows/graph-bench-neo4j-ce.yml`. The operator triggers it from the Actions tab or via `gh workflow run "Graph Backend Benchmark — Neo4j CE (G3)"`. The workflow brings up Postgres + Neo4j 5.x CE service containers, runs the harness, archives the markdown report under `docs/evidence/graph-backend/<date>-*/` as a workflow artifact, and exits 0 on overall pass / 1 on fail. Operator-side closure (runbook §7 / §8) still owns the evidence commit + ADR update.
- Per-PR CI **must not** attempt to run `pnpm tsx scripts/graph-bench/run-benchmark.ts`. Any future job under `.github/workflows/` that touches the harness MUST be gated on `workflow_dispatch`.

## 10. Hard-rule compliance reminder

This benchmark must obey the CLAUDE.md "Native Graph Workspace — Non-Build List" hard rules. In particular:

- All graph access goes through `GraphRepository`. The harness uses `getGraphRepository()` — do not import `neo4j-driver` directly from `scripts/graph-bench/`.
- Postgres remains source of truth. The fixture writes to ASDB tables first; Neo4j CE is loaded via the existing projection sync, not direct Cypher seeding.
- No raw Cypher strings outside `ags_query_templates`. Scenario `cypher_template` invokes `repo.executeTemplate({ templateKey: ... })`.
- Text2Cypher is read-only. The harness MUST NOT issue mutation Cypher.
