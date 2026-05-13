# Neo4j CE → Aura Migration — Operator Runbook (Track J / Phase 27)

**Status:** Operator-actionable. Trigger-conditional — execute only when one of the §1 conditions is met.
**Owner:** Operator on staging/production infrastructure
**Reference ADR:** `docs/architecture/agent-studio-neo4j-aura-upgrade-path.md`
**V1+ plan reference:** `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase J-1
**Last refreshed:** 2026-05-13

---

## 1. Trigger conditions

Execute this migration only when one of the following triggers fires. Do **not** migrate preemptively — Neo4j CE is the architecture-driven default per the Phase 1.5 backend decision and is sized for the MVP fleet.

| Trigger | Where to observe | Threshold |
|---|---|---|
| **Query throughput ceiling** | Phase 14 trace graph + `agent-studio-runtime-slo.md` p95 latency budgets | `cypher_template` scenario p95 ≥ +25 % over target sustained ≥ 7 days |
| **Write contention / projection-queue backlog** | `ags_graph_projection_queue.depth` cron | depth > 5,000 entries sustained ≥ 60 minutes |
| **Fan-out depth saturation** | `permission_aware_depth_3` scenario latency | p95 > 5 s on 90 % of operator-triggered runs |
| **Single-instance availability incident** | Production telemetry | any unplanned outage > 15 minutes |
| **Operator decision** | Documented in `agent-studio-active-graph-backend-decision.md` rev-ADR | Approved by Governance |

If no trigger has fired, stop. The CE deployment is the supported baseline.

## 2. Pre-flight inventory

Run before any migration steps. Record outputs.

```bash
# 1. Active backend
psql "${DATABASE_URL_ASDB}" -c "SELECT key, value FROM ags_active_graph_backend_state ORDER BY updated_at DESC LIMIT 5"

# 2. Projection queue state
psql "${DATABASE_URL_ASDB}" -tAc "SELECT
  status,
  count(*) AS rows,
  min(created_at) AS oldest,
  max(updated_at) AS newest
FROM ags_graph_projection_queue
GROUP BY status
ORDER BY status"

# 3. Fixture freshness (canonical row counts in ASDB)
psql "${DATABASE_URL_ASDB}" -c "SELECT
  (SELECT count(*) FROM ags_vault_notes) AS notes,
  (SELECT count(*) FROM ags_graph_nodes) AS nodes,
  (SELECT count(*) FROM ags_graph_edges) AS edges,
  (SELECT count(*) FROM ags_vault_note_links) AS links"

# 4. Current Neo4j CE bolt URI + auth
echo "Current NEO4J_URI: $NEO4J_URI"
echo "Current NEO4J_USER: $NEO4J_USER"

# 5. Phase 14 health alert state
psql "${DATABASE_URL_ASDB}" -c "SELECT alert_key, fired_at, cleared_at FROM ags_runtime_alerts WHERE alert_key LIKE 'graph_%' ORDER BY fired_at DESC LIMIT 10"
```

Save the outputs to `docs/evidence/graph-backend/<date>-migration-preflight/inventory.txt`.

## 3. Aura provisioning

This runbook does NOT provision the Aura instance — that is a cloud-console + billing operation. Capture, before this runbook starts:

- Aura instance bolt URI (e.g. `neo4j+s://<id>.databases.neo4j.io`)
- Aura username + initial password (will be rotated post-migration)
- Aura instance region (must be co-located with the workspace's primary Postgres region for MR-1 compatibility)
- Aura tier (Aura Free is acceptable only for staging; production requires Aura Professional or higher per the upgrade-path ADR)

Verify connectivity from the deploy environment:

```bash
curl -sf "https://<id>.databases.neo4j.io" -o /dev/null && echo OK || echo FAIL
```

## 4. Dual-write window

The migration runs through a dual-write window. During this window, the projection sync writes to **both** Neo4j CE and Neo4j Aura, allowing parity verification.

### 4.1 Enable dual-write

Set the runtime flag (operator action, NOT a code change):

```sql
INSERT INTO ags_active_graph_backend_state (key, value, updated_at)
VALUES
  ('primary_backend', 'neo4j-ce', NOW()),
  ('dual_write_target', 'neo4j-aura', NOW()),
  ('dual_write_target_uri', 'neo4j+s://<id>.databases.neo4j.io', NOW()),
  ('dual_write_started_at', NOW()::text, NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

Restart the dev / production app so the projection-sync worker reads the new flags.

### 4.2 Drain projection queue

```bash
pnpm tsx scripts/agent-studio/drain-graph-projection.ts --until-empty --max-batches 500
```

Wait until queue depth is zero before proceeding.

### 4.3 Run parity check

```bash
pnpm tsx scripts/graph-bench/run-benchmark.ts \
  --scenarios local_graph_depth_2,permission_aware_depth_3,note_open \
  --iterations 10 \
  --output /tmp/aura-parity-bench.md
```

This is the harness covered by the G3 runbook. Aura latencies must not exceed CE by > 1.5× on any p95.

Capture node + edge count parity:

```bash
# Compare Neo4j CE and Aura node counts using cypher-shell on each
NEO4J_URI_CE=bolt://... cypher-shell "MATCH (n) RETURN count(n)"
NEO4J_URI_AURA=neo4j+s://... cypher-shell "MATCH (n) RETURN count(n)"
```

Counts must match exactly. If they don't, do NOT proceed. Investigate projection drift.

## 5. Cutover

When §4.3 parity is verified:

```sql
UPDATE ags_active_graph_backend_state
SET value = 'neo4j-aura', updated_at = NOW()
WHERE key = 'primary_backend';
```

Restart the app. The projection-sync worker now writes primarily to Aura; CE becomes the dual-write secondary.

### 5.1 Post-cutover smoke

Open the local app on `/agent-studio/graph-workspace/`. Verify:

- Note open succeeds.
- Backlinks refresh succeeds.
- Local-graph-depth-2 renders.
- Permission filter respects current user role.

If any smoke fails, see §7 rollback.

## 6. Verification

| Check | Pass criterion |
|---|---|
| Aura + ASDB row-count parity | `count(*)` matches across `ags_vault_notes`, `ags_graph_nodes`, `ags_graph_edges` |
| Projection queue idle | depth = 0 sustained ≥ 60 minutes |
| Health alert clean | no `graph_*` alert fired in last 60 minutes |
| Benchmark | re-run G3 workflow_dispatch against `neo4j-aura` backend; all 10 scenarios pass per `agent-studio-native-graph-workspace-performance-targets.md` |

Once all four pass, commit the evidence directory and update `agent-studio-active-graph-backend-decision.md` Status from "Adopted (CE)" → "Adopted (Aura)".

## 7. Rollback

If §5.1 or §6 fails, restore CE as primary:

```sql
UPDATE ags_active_graph_backend_state
SET value = 'neo4j-ce', updated_at = NOW()
WHERE key = 'primary_backend';

UPDATE ags_active_graph_backend_state
SET value = NULL, updated_at = NOW()
WHERE key = 'dual_write_target';
```

Restart the app. The projection-sync worker reverts to CE-only writes. Aura writes during the dual-write window are discarded (Aura instance can be paused or deleted to avoid billing).

Capture the rollback in a rev-ADR per the G3 runbook §8 pattern.

## 8. Aura tier monitoring (post-cutover)

Aura imposes hard limits per tier. Monitor:

| Limit | Where to observe | Action on breach |
|---|---|---|
| Per-tier max nodes | `count(*)` on `ags_graph_nodes` | Upgrade tier or prune projection |
| Per-tier max relationships | `count(*)` on `ags_graph_edges` | Upgrade tier or prune projection |
| Per-tier max databases | Aura console | Consolidate workspaces or upgrade tier |
| Concurrent connection ceiling | Aura console | Tune the projection-sync worker pool size |

Phase MR-1 (multi-region) and Phase 27 (full Track J production hardening) are the next phases that benefit from Aura; this runbook is the bridge.

## 9. Evidence path

After a successful migration:

```
docs/evidence/graph-backend/<date>-aura-migration/
├── inventory.txt              # §2 outputs
├── aura-parity-bench.md       # §4.3 output
├── post-cutover-smoke.md      # §5.1 result
├── verification.md            # §6 checklist + benchmark report
└── README.md                  # rollup with operator name + dates
```

Open a closure PR pointing to this directory.

## 10. Hard-rule compliance

| Rule | Where preserved in this runbook |
|---|---|
| Postgres = source of truth | Aura is projection target, not authority. §2 pre-flight reads from ASDB. §6 verifies parity against ASDB. |
| All graph access through `GraphRepository` | No raw `neo4j-driver` imports in the operator path; the migration uses the existing repository's backend selector. |
| No reverse direction outside ADR-approved flows | This migration changes the **target** of the projection; the **direction** (Postgres → Neo4j) is unchanged. |
| Cypher templates parameterized | Aura inherits the existing `ags_query_templates` registry; no operator-edited Cypher. |
