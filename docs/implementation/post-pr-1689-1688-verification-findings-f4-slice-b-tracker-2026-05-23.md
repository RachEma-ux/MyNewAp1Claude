# F4 slice B tracker — graphLens reader workspace scoping

Date filed: 2026-05-23
Origin plan: `docs/implementation/post-pr-1689-1688-verification-findings-fix-plan-2026-05-22.md` (F4 section, "Slice B (follow-up, not in this PR)")
Series close-out: see `project_verification_findings_fix_complete.md` memory entry — this tracker is the F4 slice-B carry-forward the original plan explicitly called for ("file as a tracker entry").

## Status

**Open / deferred.** F4 slice A shipped as PR #1692 (squash `7006e2e1`): `graphLens.render` now short-circuits with a `workspace_not_found` envelope when the supplied `workspaceId` does not match any row in `workspaces`. Slice B is the deeper structural change and is not scheduled.

## What slice A did NOT fix

Slice A defends against the *non-existent* workspace case. It does **not** thread `workspaceId` into the underlying ASDB reader queries. For a *valid* workspace, the reader (graph-lens runner stack reading `agsAgents`, `agsDecisions`, `agsGovernanceRecords`, and their kin) still returns ASDB-global rows. Two distinct workspaces with valid IDs will see the same node set.

In the verification log this surfaced as: `render({workspaceId: 1, lensId: "institutional_memory_default"})` returns 86 nodes, and so does the same call with `workspaceId: 2`. Slice A merely catches the case where the second integer is unfilled (e.g. `9999`).

## The decision slice B requires

For each ASDB table the lens runners read, decide what "global to ASDB" means:

| Table | Has `workspaceId` column? | Slice B decision needed |
|---|---|---|
| `agsAgents` | yes | filter by `workspaceId` (agents are workspace-owned today) |
| `agsAgentVersions` | inherited via `agentId` | filter via join on agent's workspaceId |
| `agsDecisions` | TBD — needs schema audit | classify: workspace-scoped vs. governance-global |
| `agsGovernanceRecords` | TBD | likely governance-global; document the choice |
| `agsRuntimeRuns` | yes (V3 Phase 11a) | filter by `workspaceId` |
| `agsApprovalSteps` | inherited via runtime run | filter via join |
| `agsKnowledgeUnits` | per-source via `agsRacSources.workspaceId` | filter via join |

Two-table sketch: `agents` is unambiguously workspace-scoped (filter); `governance_records` is more nuanced (some records are governance-global by design — admin retention policies, system-wide approval-bus events). Slice B cannot just blanket-filter; it needs per-table judgment calls plus tests asserting cross-workspace isolation where required.

## Out-of-scope for slice B

- **Lens registry / runner discovery** (`graphLens.list`, runner installation): these are ASDB-global by design and don't need workspace scoping.
- **Cross-workspace inspection by admins**: a separate `adminListAllWorkspaces` shape may be wanted, but slice B is about preventing accidental cross-workspace leak in the *normal* render path, not about adding admin scopes.
- **Neo4j-projected reads**: graph reads via `GraphRepository` already carry workspace-scoped Cypher params; slice B is specifically about the Postgres reader path.

## Acceptance criteria

When slice B lands:
1. `render({workspaceId: A, lensId: ...})` and `render({workspaceId: B, lensId: ...})` return disjoint node sets for tables where the column exists and the decision is "filter".
2. Tables marked "governance-global" have a doc-block comment in `graph-lens-runners/*` naming why filtering would be incorrect.
3. Source-scan test enumerates each lens runner and asserts either `workspaceId`-bearing where clauses or an explicit `// GOVERNANCE_GLOBAL: ...` annotation.

## Why not now

- Series authority for the post-#1688/#1689 plan was scoped to bug-fix-shaped PRs (F1-F6, then F3 frontend slice). Slice B is structural: it touches ~7 tables and requires governance-policy decisions about which records cross workspace boundaries.
- Slice A closes the data-leak risk for the "made-up workspaceId" case (the verification log's actual finding). Cross-workspace leak between *valid* workspaces requires admin behavior to surface; lower live-risk than the F1-F6 bag.
- Defer with a tracker doc per the plan's explicit recommendation.

## Pickup signal

Schedule slice B when any of:
1. A governance audit flags cross-workspace data exposure via `graphLens.render`.
2. Multi-workspace operator deployments graduate from single-tenant to multi-tenant data-access requirements.
3. The Native Graph Workspace roadmap's per-workspace projection (Phase 14+) reaches the stage where Postgres-side scoping must match Neo4j-side scoping.

Until then this doc is the single source of truth for the deferral and the per-table decision table.
