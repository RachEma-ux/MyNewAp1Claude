# Phase 23 Graph Quality Agent — operator runbook

**Audience:** workspace operators who triage graph-quality findings.
**Scope:** the 10-scanner Quality Agent surface (T-D.1 → T-D.6 + the original 4 scanners from Phase 23 §1) and the proposal → approval → mutation lifecycle.

This runbook closes Phase 28 acceptance criterion #30's Phase 23 documentation half. It is the workspace operator's reference for: (a) what each scanner detects, (b) what to do when a scanner emits a finding, and (c) how the approve / dismiss / mutate lifecycle works.

---

## 1. Scanners at a glance

| scanKind | What it detects | Severity | Operator action when triggered |
|---|---|---|---|
| `orphan_node` | Node has no edges in the sample | low | Decide: link it OR archive it |
| `duplicate_entity` | Two entities with the same canonical id+typeKey | medium | Merge candidates (Phase 11.5 proposal) |
| `stale_node` | Node hasn't been touched since N days ago | low | Re-promote with current source-version OR archive |
| `self_loop` | Edge points from a node to itself | low | Verify (self-references can be intentional in code-graph) |
| `missing_provenance` | Node has empty `sourceId` | high | Backfill the source-id OR accept loss + dismiss |
| `dangling_edge_endpoint` | Edge points at a node not in the projection | medium | Backfill the node OR delete the edge |
| `parallel_edges` | Same (source, target, typeKey) appears > 1× | low | Deduplicate (mutation worker proposes one delete) |
| `excessive_fanout` | Node has > 100 outgoing edges of same kind | medium | Review for entity-resolution split |
| `isolated_subgraph` | Connected component of size < 5 nodes | low | Review for stale workspace section |
| `missing_source_version` | Node has `sourceId` but no `sourceVersionId` | medium | Backfill the version-pin OR reproject |

Source: `server/agent-studio/services/graph-quality/scanners/`. Closed taxonomy enforced; new scanners require an ADR + a new entry in the QUALITY_SCANNER_REGISTRY.

---

## 2. Lifecycle — finding → proposal → approval → mutation

```
[Quality Agent scan]
   ↓ emits
[QualityFinding rows in ags_graph_quality_findings]
   ↓ finding-to-proposal converter
[GraphCorrectionProposal in ags_graph_correction_proposals (status=pending)]
   ↓ ApprovalSteps gate
[status=approved OR status=rejected]
   ↓ applier (mutation-worker)
[Postgres SoT mutation] → [Neo4j projection-sync rerun]
```

Per-step details:

### 2.1 — Scan

Operators trigger a scan via:
- **Cron**: scheduled at `*/30 * * * *` for the default scope.
- **Manual**: `agentStudio.graphQuality.runQualityAgent` tRPC (admin role).

`runQualityAgent` invokes every registered scanner against the same sample and persists findings. `autoConvertFindings: true` (the default) immediately converts each finding to a proposal.

### 2.2 — Triage findings

Open the Graph Quality Findings admin page. For each finding:

- Read `findingClass`, `severity`, `sourceId`, `details`.
- Cross-reference the scanner's "operator action" column above.
- Decide: ACCEPT (becomes a proposal) / DISMISS (audit-trail only, no mutation).

Dismissed findings remain in `ags_graph_quality_findings` for the retention window (T-AT-6 retention panels apply); they never reach the mutation worker.

### 2.3 — Approve / reject the proposal

Accepted findings produce a `GraphCorrectionProposal` row with:
- `proposalKind`: one of the 10 mapped kinds (`link_or_archive_orphan_node`, `merge_duplicate_entities`, ...).
- `evidence`: the finding's details + scan sample reference.
- `confidence`: scanner-supplied (today: implicit; explicit in T-D.3 semantic-enrichment).

The proposal routes through the **ApprovalSteps gate adapter** (#776 AS-1). Operators with `graph_correction_decide` permission approve or reject:

- **Approve** (`approveAndApplyProposal`): writes audit row, then the mutation-worker applies. Result is a Postgres SoT mutation + a projection-sync rerun for the affected scope.
- **Reject**: writes audit row, leaves Postgres untouched. Emits `failure_state:graph_correction_rejected` (when the wiring lands — currently phase-gated; see Phase 22 audit kind #23).

### 2.4 — Mutation worker

Applier registry maps `proposalKind` → applier function. Each applier:
1. Validates the proposal is still applicable (source row hasn't been deleted).
2. Mutates Postgres SoT.
3. Triggers `graph-projection-sync` rerun for the affected scope.
4. Writes a `graph_quality_proposal_applied` audit row.

On apply failure, the proposal is marked `apply_failed` and the operator can retry. The Phase 22 closed-taxonomy bridge does NOT currently emit on apply failure — that's a future wiring (T-I.5.D candidate).

---

## 3. Common scenarios

### 3.1 — A scan returns 0 findings

Normal in a clean graph. The `runQualityAgent` row reflects `status: "completed"` with `proposalsCreated: 0`. No operator action required.

### 3.2 — A scan returns 100+ duplicate_entity findings

Usually a sign that entity resolution wasn't applied consistently. Triage:
1. Check if a recent ingestion bulk-loaded entities without dedup (look at `ags_runtime_runs` for the same window).
2. If dedup wasn't applied, prefer running the bulk dedup utility before approving the proposals one-by-one.
3. The Phase 22 emission `entity_resolution_conflict` (#1026) fires per-scan when this happens — query for the event timeline:
   ```sql
   SELECT created_at, metadata FROM ags_workspace_error_events
   WHERE error_class = 'failure_state:entity_resolution_conflict'
   ORDER BY created_at DESC LIMIT 20;
   ```

### 3.3 — An apply fails with "source row deleted"

The source row was deleted after the scan but before the apply. Resolution: dismiss the proposal (it's stale) and re-run the scan. The Phase 23 lifecycle treats this as expected; no operator escalation needed.

### 3.4 — A scan triggers `missing_provenance` for entire workspaces

Almost always a sign that the projection-sync ran before version-pinning was wired. Check #1031's sibling scanner `missing_source_version` — if BOTH scanners emit, the projection migration is incomplete. Coordinate with the projection-sync owner before approving the backfill proposals.

---

## 4. Observability hooks

The Phase 22 closed-taxonomy emission surface emits when scans surface conflicts:

| Scanner | Failure-state kind | PR |
|---|---|---|
| `duplicate_entity` (any finding) | `entity_resolution_conflict` | #1026 |
| All scanners (proposal rejected) | `graph_correction_rejected` (phase-gated) | future |
| Mutation worker (apply throws) | (no direct kind) | future |

Operators querying for emission timelines should `LIKE 'failure_state:%'` on `ags_workspace_error_events` (see Phase 22 audit §7 query examples).

---

## 5. Acceptance criteria coverage

This runbook contributes to Phase 28 acceptance criterion #30 ("Documentation complete"). Specifically the Phase 23 user-facing docs half. The remaining gap is:

- **Per-scanner severity rationale doc** (deferred — would expand §1 into one section per scanKind with the reasoning behind each severity choice).

---

## 6. References

- Scanners: `server/agent-studio/services/graph-quality/scanners/`
- Agent run: `server/agent-studio/services/graph-quality/agent-run.ts`
- Approve + apply: `server/agent-studio/services/graph-quality/approve-and-apply.ts`
- Finding → proposal: `server/agent-studio/services/graph-quality/finding-to-proposal.ts`
- Closed-taxonomy emission audit: `docs/implementation/agent-studio-phase-22-failure-state-emission-audit.md`
- Phase 28 catalog: `docs/implementation/agent-studio-phase-28-governance-acceptance-catalog.md`
- ADR: `docs/architecture/agent-studio-graph-correction-strategy.md`
