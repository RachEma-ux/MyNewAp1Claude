# Agent Studio — Neo4j Aura Upgrade Path

**Status:** Adopted 2026-05-11
**Phase:** Native Graph Workspace Phase 27
**Owner:** Native Graph Workspace working group

---

## Summary

Neo4j Aura is the **fully-managed** Neo4j alternative to self-managed
Enterprise (`agent-studio-neo4j-enterprise-upgrade-path.md`).
Operators trade infrastructure control for vendor-operated
availability, backup, and patching.

Companion docs:
- `agent-studio-neo4j-enterprise-upgrade-path.md` — self-managed
  Enterprise alternative.
- `agent-studio-graph-production-operations.md` — shared production
  ops patterns.

---

## When Aura is the right call

Trigger conditions favor Aura when the operator team:

- Cannot allocate dedicated SRE / DBA capacity for Neo4j.
- Wants vendor-managed availability without in-house clustering.
- Operates in a public cloud (AWS, GCP, Azure) that Aura supports
  in the relevant region.
- Prefers OpEx (Aura subscription) over CapEx (self-hosted hardware
  + licensing).
- Needs a path-to-managed quickly; Enterprise's 8-step cutover
  procedure is longer than Aura's 4-step.

Trigger conditions disfavor Aura when the operator team:

- Has air-gapped or sovereignty constraints that prevent SaaS.
- Already operates a Neo4j Enterprise cluster successfully and the
  switching cost is high.
- Needs custom Neo4j extensions (plugins, server-side procedures)
  that Aura's managed surface does not allow.
- Has hard latency budgets that an in-region managed-service
  provider cannot meet (rare; usually self-hosting in the same VPC
  is the alternative, not running CE).

---

## Aura tier selection

Aura offers tiered SKUs; the workspace's expected fit:

| Tier | Use case | Limits |
|---|---|---|
| **AuraDB Free** | Spike / proof-of-concept only | 200k nodes / 400k relationships |
| **AuraDB Professional** | Single-team workspace | Up to 64GB RAM / 8 vCPU |
| **AuraDB Business Critical** | Multi-tenant or HA-required | Multi-region replication, on-call SLA |
| **AuraDS** | Workspace + heavy graph algorithms | GDS library included |

The Phase 20 benchmark targets (50k nodes / 250k edges scale; p95
latency budgets) fit comfortably within Aura Professional for the
single-vault MVP. Multi-vault rollouts or workspaces with
≥100k notes benefit from Business Critical.

---

## Upgrade procedure (CE → Aura)

1. **Provision the Aura instance** — pick tier + region. Capture
   the connection URI (`neo4j+s://...aura.neo4j.io`) and the
   generated password.
2. **Initial data migration** — Aura supports dump-load via the
   Aura UI's "Restore from backup" flow. Export from CE via
   `neo4j-admin dump`, upload the resulting file to Aura. Verify
   node + edge counts match.
3. **Repository config switch** — flip `AGS_GRAPH_BACKEND_KIND=neo4j-aura`
   (or generic `neo4j-bolt` with the Aura URI). The same
   `Neo4jCommunityGraphRepository` driver works against Aura; only
   the connection string changes (Aura speaks the same Bolt
   protocol).
4. **Smoke test + cutover** — run a projection rebuild; verify the
   GraphRepository read path returns expected counts. Flip traffic
   from CE to Aura. Keep CE live for 1 week in case rollback is
   needed.

The Aura procedure is shorter than Enterprise's because Aura
operates the cluster — no `neo4j.conf`, no failover testing, no
manual RBAC provisioning. Authentication uses the Aura-issued
password + database name; per-user RBAC layers on top via Aura's
role assignment UI.

---

## Rollback procedure

Same shape as the Enterprise rollback:

1. Re-enable CE.
2. Flip `AGS_GRAPH_BACKEND_KIND` back.
3. Rebuild CE's projection from Postgres (`projection.rebuild('all')`).
4. Decommission Aura after rollback completes (cancel subscription
   to avoid continued billing).

Postgres-source-of-truth invariant holds: Aura failures cannot lose
vault content as long as the Postgres rows survive.

---

## Backup + restore notes (Aura-specific)

Aura takes daily backups automatically. Aura's documented retention
is 7 days for Professional, 30 days for Business Critical.
Operators wanting longer retention should:

1. Periodically `neo4j-admin dump` from Aura to a customer-owned
   storage bucket (this is *additional* to Aura's automatic
   backups, not a replacement).
2. Validate restore quarterly by spinning up a side-channel Aura
   instance and verifying a dump-restore round-trip.

The Postgres backup discipline carries the bulk of the recovery
guarantee; Aura backups protect against the (rare) case where the
projection diverges from Postgres in a way the rebuild can't
correct.

---

## Acceptance criteria mapping

This ADR closes the following Phase 27 acceptance criteria:

- ✅ Neo4j Aura path is documented (tier selection + 4-step
  procedure)
- ✅ Migration from CE to Aura is planned (same dump-load shape,
  plus Aura-specific UI flow)

Production backup/restore + auth/RBAC details are split out to
`agent-studio-graph-production-operations.md`.

---

## See also

- `docs/architecture/agent-studio-neo4j-enterprise-upgrade-path.md`
- `docs/architecture/agent-studio-graph-production-operations.md`
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
  Phase 27
