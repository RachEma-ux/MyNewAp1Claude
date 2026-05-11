# Agent Studio — Neo4j Enterprise Upgrade Path

**Status:** Adopted 2026-05-11
**Phase:** Native Graph Workspace Phase 27
**Owner:** Native Graph Workspace working group

---

## Summary

The Native Graph Workspace ships on **Neo4j Community Edition (CE)** for
MVP (Phase 7.5). When the workspace requires features CE does not
provide, the documented upgrade path is **Neo4j Enterprise (self-managed)**.

Companion docs:
- `agent-studio-neo4j-aura-upgrade-path.md` — managed-service alternative.
- `agent-studio-graph-production-operations.md` — shared production ops
  patterns regardless of upgrade target.

---

## Neo4j Community Edition limitations

CE is sufficient for single-node, single-database, single-tenant
workloads. The boundaries:

- **No high availability.** A single CE process can die; no failover.
- **No clustering.** All reads and writes hit one node.
- **No online backup.** `neo4j-admin backup` requires a stopped node.
- **No multi-database.** A CE instance hosts one logical database.
- **No enterprise RBAC.** Auth is operating-system-level; no
  role/scope granularity.
- **No LDAP / Active Directory.** Local auth only.
- **No managed operations.** Operator runs the process; no SLA from
  a vendor.
- **No graph algorithms beyond the basics.** GDS (Graph Data Science)
  library has algorithmic depth Enterprise unlocks.
- **No multi-tenant isolation.** A single workspace's queries can
  touch any node CE knows about.

These limits are acceptable for MVP because:
- The workspace is single-vault for single-workspace operators today.
- Backups can run against a paused CE instance overnight.
- Auth is server-first (vault membership + workspace scope), not
  database-level.

---

## When to upgrade to Enterprise

Trigger conditions (any one suffices):

1. **Availability requirement** — the workspace serves traffic with a
   formal SLA, or operators cannot tolerate a multi-minute restart
   window after a CE crash.
2. **Online backup requirement** — the workspace grew past the point
   where overnight downtime for backup is acceptable.
3. **Multi-database requirement** — separate vaults or environments
   (production / staging / sandbox) need isolated graph storage
   within the same cluster.
4. **Enterprise RBAC / LDAP requirement** — operators authenticate
   via SSO; vault membership alone is no longer sufficient at the
   graph layer.
5. **Graph algorithm depth requirement** — workloads need GDS
   centrality, community detection, or similarity algorithms beyond
   the open-source library.
6. **Production support requirement** — operators want vendor
   support contracts for incident response.

---

## Upgrade procedure (CE → Enterprise self-managed)

1. **Licensing** — acquire a Neo4j Enterprise license; confirm node
   count + concurrent user count.
2. **Provision Enterprise nodes** — at least 3 nodes for a core
   cluster. Deploy in the same network segment as the Postgres
   primary so projection writes don't cross WAN.
3. **Configure clustering** — `causal_clustering.initial_discovery_members`
   on each node points at the others; configure `neo4j.conf` for
   minimum cluster size = 3.
4. **Initial data migration** — export from CE via `neo4j-admin dump`,
   import to Enterprise via `neo4j-admin load`. Verify node + edge
   counts match. The projection rebuild from Postgres (per
   `agent-studio-workspace-sync-strategy.md`) is the authoritative
   recovery path if the dump-load route fails.
5. **Repository config switch** — flip
   `AGS_GRAPH_BACKEND_KIND=neo4j-enterprise` (TBD env var; Phase 7.5
   adds the GraphRepository switch). `Neo4jCommunityGraphRepository`
   stays available as a fallback during the transition.
6. **Cluster smoke test** — kill one node; confirm reads continue.
   Restart; confirm cluster reconverges. Run a projection rebuild;
   confirm it lands on all nodes.
7. **Enable enterprise RBAC** — define operator roles
   (`agent_studio_reader`, `agent_studio_writer`, `agent_studio_admin`).
   GraphRepository now passes per-user JWT credentials to the
   driver; CE's "everyone is god" model retires.
8. **Cutover** — flip traffic from CE to Enterprise. Keep CE
   instance live for 1 week in case rollback is needed. Decommission
   after the projection-drift detector (Phase 14.5) reports clean
   for 7 consecutive days.

---

## Rollback procedure

If the Enterprise upgrade exposes a fatal regression:

1. Re-enable the CE instance.
2. Flip `AGS_GRAPH_BACKEND_KIND` back to `neo4j-community`.
3. Rebuild CE's projection from the current Postgres state
   (`projection.rebuild('all')`). The Postgres source of truth is
   authoritative; the upgrade window does not corrupt vault state.
4. Decommission the Enterprise cluster after rollback completes.

Critical invariant: **Postgres is the source of truth.** A
catastrophic Enterprise failure cannot lose vault content as long
as the Postgres rows survive. Backup discipline lives on the
Postgres side, not the Neo4j side.

---

## Acceptance criteria mapping

This ADR closes the following Phase 27 acceptance criteria:

- ✅ Neo4j CE limitations are documented
- ✅ Upgrade triggers are documented (six-item list above)
- ✅ Neo4j Enterprise path is documented (8-step procedure)
- ✅ Migration from CE to Enterprise is planned (procedure + rollback)

Production backup/restore and production auth/RBAC are split out
to `agent-studio-graph-production-operations.md`. Neo4j Aura is the
companion `agent-studio-neo4j-aura-upgrade-path.md`.

---

## See also

- `docs/architecture/agent-studio-neo4j-aura-upgrade-path.md`
- `docs/architecture/agent-studio-graph-production-operations.md`
- `docs/architecture/agent-studio-workspace-sync-strategy.md` —
  Postgres-source-of-truth invariant
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
  Phase 27
