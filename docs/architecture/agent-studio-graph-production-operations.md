# Agent Studio — Graph Production Operations

**Status:** Adopted 2026-05-11
**Phase:** Native Graph Workspace Phase 27
**Owner:** Native Graph Workspace working group

---

## Summary

Operational patterns for running Neo4j (Community Edition,
Enterprise, or Aura) as the projected graph layer behind the
Native Graph Workspace. Covers backup/restore, auth/RBAC,
monitoring, and on-call discipline.

Companion docs:
- `agent-studio-neo4j-enterprise-upgrade-path.md` — when + how to
  upgrade to self-managed Enterprise.
- `agent-studio-neo4j-aura-upgrade-path.md` — when + how to move
  to managed Aura.

---

## Backup / restore strategy

The workspace's authoritative state is **Postgres**. Neo4j is a
projection — recovery is always "rebuild from Postgres." This
section covers the secondary backup tier (Neo4j dumps) that
shortens recovery time when rebuild from Postgres would take too
long.

### Per-backend

- **Community Edition** — `neo4j-admin dump` against a paused
  instance, daily. Store dumps in a customer-owned bucket; retain
  7 days. The CE limitation: no online backup. Operators schedule
  the pause window during low-traffic hours.

- **Enterprise self-managed** — `neo4j-admin backup` runs against
  a live cluster. Schedule daily incremental + weekly full. Retain
  daily backups for 30 days, full backups for 90 days. The
  Enterprise advantage: zero downtime for backup.

- **Aura managed** — Aura takes daily backups automatically (7-day
  retention on Professional, 30-day on Business Critical).
  Customer-owned additional dumps run via `neo4j-admin dump` from
  an Aura connection, scheduled weekly to a customer-owned bucket
  for long-tail retention.

### Restore procedure

Order of preference (fastest to slowest, all valid):

1. **Neo4j dump-restore** — when the dump is current (≤ 24h old),
   restore from dump and resume traffic in minutes. The projection
   drift detector (Phase 14.5) reports any divergence from
   Postgres; a follow-up `projection.rebuild('all')` reconciles.
2. **Projection rebuild from Postgres** — when no current dump is
   available, run the full rebuild. Latency is O(notes + entities
   + edges) — Phase 20 benchmark target says rebuild a 50k-node
   graph in ≤ 60s on the hot path.
3. **Postgres restore + projection rebuild** — last-resort recovery
   when Postgres itself failed. Postgres backups land first, then
   projection rebuild fires.

The order is: Neo4j-backup-only failures get the dump path,
Postgres-still-fine failures get the rebuild path, full
catastrophic failures get the Postgres-restore-then-rebuild path.

---

## Auth / RBAC strategy

### Per-backend

- **Community Edition** — single-credential connection. The
  workspace operator's secret manager holds the CE password; all
  GraphRepository connections use it. Per-user permission
  filtering lives at the GraphRepository read boundary (visibility
  filter) — not at the database layer.

- **Enterprise self-managed** — Neo4j's role/scope RBAC engages.
  Per-user roles map to operator workspace membership:
  - `agent_studio_reader` — read-only across all projected nodes.
  - `agent_studio_writer` — read + write to graph change proposals
    (Phase 11.5 lifecycle).
  - `agent_studio_admin` — additional projection rebuild +
    schema mutation permission.
  GraphRepository acquires per-request JWT credentials from the
  Phase 19-onward governance adapter, scoped to the calling
  user's role.

- **Aura managed** — Aura's role-assignment UI plus connection-
  string-based password. Operators define roles in the Aura
  console; the runtime passes per-user JWT credentials the same
  way as Enterprise.

### Critical invariant

**Database-level auth complements, does not replace, the
GraphRepository visibility filter.** The repository's read
boundary applies workspace-membership + vault-scope filtering on
every Cypher query result; the database's RBAC layer is the
defense-in-depth backstop, not the primary gate.

This means: a CE deployment with no database-level auth still
satisfies workspace permission requirements as long as the
GraphRepository invariant holds. Upgrading to Enterprise/Aura
*tightens* the defense; it doesn't replace it.

---

## Monitoring

The minimum operator dashboard for any backend:

- **Query latency p50 / p95 / p99** — per query template (Phase
  12.5 §13 templates) plus per Graph Agent run phase (Phase 13
  §2 step kinds).
- **Projection lag** — `now() - max(updated_at)` from
  `ags_graph_projection_sync_jobs` rows with status
  `completed`. The Phase 20 benchmark target says p95 ≤ 2s for
  per-note projection writes.
- **Drift events** — count of `ags_graph_projection_drift_events`
  rows in the last hour. Phase 14.5 drift detection writes these;
  zero is the expected steady state.
- **Backend health** — periodic ping query against the connection
  pool. Reports to `ags_graph_backend_health_events` (Phase 22
  table). Operators correlate spikes with deployment events.
- **Background job status** — count of pending / running / failed
  jobs from `ags_workspace_background_jobs` (Phase 22). A failed-
  job rate above N/hour pages on-call.
- **Cypher template denials** — count of `template_gate_denied_*`
  emissions from the Phase 12.5 §13 gate. Spikes correlate with
  schema drift or permission misconfigurations.

The dashboard is backend-agnostic; only the underlying metric
collection differs. CE relies on `:sysinfo` polling; Enterprise
adds Prometheus metrics natively; Aura exposes a metrics endpoint
the workspace polls.

---

## On-call discipline

Pageable alerts (must wake on-call):
- Graph query latency p95 > 5s for 5 minutes (workspace becomes
  unresponsive)
- Projection lag > 5 minutes for 10 minutes (writes diverging
  from reads)
- Backend health probe failing for 3 consecutive minutes
  (workspace is degraded)

Non-pageable alerts (handled at next business hour):
- Drift event spike (the drift detector itself self-heals via
  rebuild)
- Background job failed-job rate elevated
- Cypher template denial spike

**Postgres alerts take precedence.** A Postgres outage means the
workspace cannot accept writes regardless of Neo4j state; that's
the first thing on-call investigates. Neo4j is the projection;
Postgres is the truth.

---

## Acceptance criteria mapping

This ADR closes the following Phase 27 acceptance criteria:

- ✅ Production backup/restore strategy exists (per-backend +
  per-failure-mode procedures)
- ✅ Production auth/RBAC strategy exists (per-backend + visibility-
  filter-is-primary-not-replaced invariant)

The remaining Phase 27 criteria are split across the companion
ADRs:
- CE limitations + upgrade triggers + Enterprise path + migration
  planning → `agent-studio-neo4j-enterprise-upgrade-path.md`
- Aura path + migration planning →
  `agent-studio-neo4j-aura-upgrade-path.md`

---

## See also

- `docs/architecture/agent-studio-neo4j-enterprise-upgrade-path.md`
- `docs/architecture/agent-studio-neo4j-aura-upgrade-path.md`
- `docs/architecture/agent-studio-workspace-sync-strategy.md`
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
  Phase 27
