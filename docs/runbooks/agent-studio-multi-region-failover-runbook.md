# Multi-Region Failover — Operator Runbook (V2 / Phase MR-1)

**Status:** Operator-actionable scaffold. Trigger-conditional — execute only when a §1 condition fires.
**Owner:** Operator on multi-region infrastructure
**Reference ADR:** `docs/architecture/agent-studio-multi-region.md`
**V1+ plan reference:** `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase MR-1
**Last refreshed:** 2026-05-13

---

## 1. Trigger conditions

Execute the failover procedure only when one of the following triggers fires. Do **not** failover preemptively — single-region remains the operational baseline per `agent-studio-multi-region.md`.

| Trigger | Where to observe | Threshold |
|---|---|---|
| **Primary region unavailable** | `ags_regions` health-check cron + production telemetry | Primary region health unreachable ≥ 5 min |
| **Replication lag SLO breach** | `ags_runtime_alerts` `region_replication_lag_high` | p95 lag ≥ 5 min sustained ≥ 15 min |
| **Sustained primary p95 budget breach** | Phase 14 trace graph + per-region SLO | Primary p95 ≥ +50% over budget sustained ≥ 30 min AND secondary p95 within budget |
| **Compliance-driven region migration** | Operator-driven (e.g. data residency change) | Per operator approval |

---

## 2. Pre-flight inventory

Before failover:

1. Confirm `ags_regions` has at least one `isActive=true` row other than the current primary. If none exists, **stop** — provision a new region first per `docs/architecture/agent-studio-multi-region.md` §4.
2. Confirm projection-queue depth is ≤ 100 events in both regions. If higher in the secondary, drain via the existing projection-sync worker before flipping primary.
3. Confirm `ags_runtime_alerts` has no open `region_replication_lag_high` alerts on the secondary region.
4. Snapshot the current primary's `(node count, edge count, vault note count)` for the parity check in §6.

Commands:

```sql
SELECT region_key, is_primary, is_active, name FROM ags_regions ORDER BY is_primary DESC;
SELECT region_key, count(*) AS open_alerts FROM ags_runtime_alerts
  WHERE resolved_at IS NULL GROUP BY region_key;
SELECT count(*) FROM ags_vault_notes;
SELECT count(*) FROM ags_graph_nodes;
SELECT count(*) FROM ags_graph_edges;
```

---

## 3. Migration steps

1. **Disable writes on the current primary**:
   ```sql
   UPDATE ags_regions SET is_active = false WHERE is_primary = true;
   ```
   The connection-helper router refuses new writes against an inactive region (Phase MR-2 enforcement); read traffic is already failed-over to the secondary's read replica when it picks up.

2. **Drain in-flight writes**: wait until the projection-sync worker reports queue depth = 0 on the OLD primary. Typically < 5 min in steady state.

3. **Flip primary**:
   ```sql
   UPDATE ags_regions SET is_primary = false WHERE is_primary = true;
   UPDATE ags_regions SET is_primary = true, is_active = true WHERE region_key = '<new-primary>';
   ```

4. **Restart app**: the connection-helper re-reads the region registry on boot. `pkill` + `pnpm start` (or rolling restart in production).

---

## 4. Verification

Run the parity check:

```sql
-- On the NEW primary
SELECT count(*) FROM ags_vault_notes;
SELECT count(*) FROM ags_graph_nodes;
SELECT count(*) FROM ags_graph_edges;
```

Counts must match the §2 snapshot ± replication lag delta. If they don't, **do not declare failover complete**; investigate replication drift before un-disabling the old primary.

Open the local app on `/agent-studio/graph-workspace/`. Verify:
- Note open succeeds.
- Backlinks refresh succeeds.
- Local-graph-depth-2 renders.
- Permission filter respects current user role.

---

## 5. Rollback

If §4 fails:

```sql
UPDATE ags_regions SET is_primary = false WHERE region_key = '<new-primary>';
UPDATE ags_regions SET is_primary = true, is_active = true WHERE region_key = '<old-primary>';
```

Restart the app. The old primary resumes service.

---

## 6. Post-failover

1. Mark the old region `is_active = false` if it is still unreachable; an operator can flip it back when the underlying issue is resolved.
2. Open an incident ticket linking the trigger that fired, the SHA of the active deployment, the parity numbers, and any replication-lag traces.
3. Update `agent-studio-active-graph-backend-decision.md` if the failover changed which region is canonical.
