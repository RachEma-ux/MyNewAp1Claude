# Agent Studio Multi-Region Deployment — ADR

**Owner:** Agent Studio module + Platform infrastructure + Operations
**Phase:** Retrofit follow-up D2 (deferred-by-design)
**Status:** Adopted as forward-looking; **not** an MVP requirement
**Authority:** Documents the conditions under which the platform would move from single-region to multi-region operation, what changes, and what the migration looks like. Does NOT authorize the migration.

---

## 1. Why this document exists

The Agent Studio retrofit's follow-up §D2 deferred multi-region deployment with a single-line trigger ("when operations team formally requests it") and no anchor doc. Two passing references (`CLAUDE.md` line 82; `RAC_ROLLOUT_PLAN.md` line 159) acknowledge the current state but don't lock the shape of the future migration.

This ADR fills that gap. It mirrors the pgvector ADR's *original* form (forward-looking, locked deferral, "not authorized" clause) — when ops triggers fire, this ADR is amended to authorize the implementation, the same way the pgvector ADR was amended for D1's optional-engine path.

Future engineers reading this should see "we considered it, we didn't do it, here's the shape and trigger" — not "we forgot about it" and not "we shipped scaffolding for a problem that hadn't surfaced yet."

---

## 2. Current state (2026-05-06)

### 2.1 Single-region is intentional

- `CLAUDE.md` `## Deferred Scope` § lists "Multi-region deployment guidance — single-region remains the operational baseline."
- `docs/architecture/agent-studio/RAC_ROLLOUT_PLAN.md` line 159 (the original §7 "Stage 9 concern" entry; updated to back-reference this ADR as the authoritative deferral document).
- No row in any retrofit-scope table carries a `region` column.
- No service in `server/agent-studio/` calls a region resolver.
- `multi_region` exists in `shared/catalog-taxonomy.ts` as a **provider-capability tag** (e.g., "this provider connection supports multi-region calls") — unrelated to deployment topology.

### 2.2 Region-shardable foundations are already in place

The retrofit's row-keying is workspace-scoped throughout — `agsKnowledgeUnits`, `agsKnowledgeChunks`, `agsRacSources`, `agsRacProfiles`, `agsToolCallTraces`, `agsRacRuntimeTraces`, `agsApprovalSteps`, `agsPendingPermissionRequests`, etc. all key on `workspaceId`. Workspace is a natural region boundary; per-workspace sharding doesn't require schema migrations on the canonical tables.

### 2.3 Cross-region call paths that exist today (single-region)

External engines that the retrofit calls:

- **Forge proxy** (`{BUILT_IN_FORGE_API_URL}/v1/...`) for chat completions + embeddings + audio transcription. Single global URL.
- **Data Acquisition worker** (`{DATA_ACQUISITION_WORKER_URL}/...`) for OCR + classify/route/parse. Single global URL.
- **System ffmpeg** for video audio extraction. Local subprocess; not a cross-region concern.
- **Embedding providers** resolved via `withEmbeddingCredential` (D-EMB-2). Per-workspace provider connections; URL is per-connection, not per-region.
- **Postgres** (main DB + ASDB + RAGDB). Single connection string per database.
- **Qdrant** (`server/vectordb/`). Single base URL.

In a multi-region world, each of these becomes per-region OR per-workspace-with-region-routing.

---

## 3. Trigger conditions

A migration to multi-region operation becomes worth doing when ANY of these fires:

### 3.1 Data residency requirement

A workspace's tenant requires their data to live in a specific jurisdiction (EU, US, AU). Single-region deployments fail this requirement when the deployment region differs from the residency requirement.

### 3.2 Latency to non-local users dominates p95

When a non-trivial fraction of requests come from users far from the deployment region, network latency dominates the budget. Threshold heuristic: ≥30% of p95 retrieval latency is attributable to user→region RTT.

### 3.3 Failover / disaster-recovery requirement

A specific reliability target requires regional failover. Single-region cannot meet RTO/RPO commitments below the time it takes a fresh region to come online.

### 3.4 Operations team formally requests it

The original deferral-spec trigger. An ops planning cycle decides multi-region is the next operational priority and budgets the engineering work.

NONE of these triggers is true today.

---

## 4. Swap surface

When the migration becomes worth doing, here is the surface that changes.

### 4.1 Schema

A nullable `region` column on each region-bearing table. The canonical retrofit-scope tables that need it:

| Table | Region semantics |
|---|---|
| `workspaces` | Authoritative — the workspace's home region. Set at create time, immutable thereafter. |
| `agsRacSources` | Inherits from workspace; explicit override allowed for cross-region read replicas. |
| `agsKnowledgeUnits` / `agsKnowledgeChunks` | Inherits from workspace. Sharded copies in other regions carry the same value (replicas, not different rows). |
| `agsToolCallTraces` / `agsRacRuntimeTraces` / `agsApprovalSteps` | Stamped at write-time with the serving region (so traces from a US replica show `region="us"` distinct from EU). |

The retrofit's existing `workspaceId`-keyed tables don't change schema beyond the new column. The column is nullable so existing single-region deployments are unaffected.

### 4.2 Region resolver

A new `services/_core/region.ts` (or platform equivalent) exposes:

```ts
function getCurrentRegion(): string;          // From AGENT_STUDIO_REGION env, default "default"
function getWorkspaceRegion(workspaceId: number): Promise<string>;  // From the workspaces row
function isLocalRegion(region: string): boolean;  // current === region
```

Every cross-region routing decision goes through this resolver. No service reads `process.env.AGENT_STUDIO_REGION` directly.

### 4.3 Engine bindings

Each external engine's URL becomes per-region:

- `BUILT_IN_FORGE_API_URL_{REGION}` (`_US`, `_EU`, etc.) with fallback to `BUILT_IN_FORGE_API_URL`.
- `DATA_ACQUISITION_WORKER_URL_{REGION}` similarly.
- Postgres connection strings per region.
- Qdrant base URLs per region.

The factory pattern established by D-PARSE-OCR/AUDIO/VIDEO already accepts injected `getEnv` / `getWorkerUrl` deps — wiring per-region resolution is a deps-substitution change, not an API change.

### 4.4 Routing layer

Inbound requests are routed to the workspace's home region BEFORE hitting business logic. Two implementation paths:

- **Edge-routing** (CDN / load-balancer): JWT carries `workspaceId` → header carries `region` → request goes to the home-region cluster directly.
- **Application-level routing**: any region's API can serve any workspace; the request handler reads `workspaceId`, calls `getWorkspaceRegion()`, returns a redirect to the home-region URL when mismatched.

Edge-routing is preferred (avoids a round-trip per request). Application-level routing is the fall-back when edge isn't available.

### 4.5 Cross-region read replicas

Workspaces that need cross-region reads (read scaling, failover) get an explicit `agsRacSources` row override pointing at the replica region's adapter. The retrofit's per-source binding (D-EMB-1) extends to per-region binding without contract changes.

### 4.6 Data flows that stay single-region

- **Embedding generation**: stays in the home region. Cross-region embedding adds latency without correctness benefit.
- **Approval gate / governance audits**: stay in the home region. Compliance audits expect a single source of truth per workspace.
- **Sandbox execution**: stays in the home region. `node:vm` is a process-local concern.

### 4.7 D-EMB-1 / D-PARSE-* unchanged

The per-source / per-engine binding decisions established in the retrofit (D-EMB-1, D-PARSE-OCR/AUDIO/VIDEO/PGVECTOR) all extend to multi-region without contract changes. The only thing that changes is the URL each binding resolves to.

---

## 5. Migration plan (when triggered)

### 5.1 Pre-flight

- Confirm at least one tenant has a data-residency or latency requirement that justifies the work (§3.1, §3.2 fired).
- Confirm ops-side capacity to operate ≥2 regions (§3.4).
- Identify the home region for each existing workspace. If a workspace's tenant didn't specify, default to the deployment's current region.

### 5.2 Migration steps

1. **Add the region column.** Drizzle migration adds `region varchar nullable` to `workspaces` (and downstream replicas if needed). Default existing rows to the deployment's current region.
2. **Stand up the region resolver.** Ship `getCurrentRegion()`, `getWorkspaceRegion()`, `isLocalRegion()` as no-ops in the existing single-region deployment. Trace metrics start carrying `region` immediately so observability is in place before routing changes.
3. **Stand up the second region cluster.** Empty Postgres + ASDB + RAGDB; Qdrant; forge proxy; data-acquisition worker. No traffic.
4. **Replicate read-only data.** For workspaces that need cross-region reads, dual-write to both regions. The retrofit's adapter contract handles a "read from replica" source override without changes.
5. **Route the first workspace.** Pick one volunteer workspace (small, non-critical). Update its `region` column. Edge-routing or application-level redirect kicks in. Monitor traces for the new `region` tag.
6. **Validate.** Per-workspace traces from both regions; latency p50/p95 from the new region; approval gate decisions still resolve correctly; sandbox executions still attribute to the home region.
7. **Roll out remaining workspaces.** Region by region, workspace by workspace. No flag day.

### 5.3 Back-out

If a workspace's multi-region experience regresses, flip its `region` column back. Read replicas remain (idle) for the soak window; decommission only after a clear period (≥30 days) of no regressions on any workspace.

The migration is non-destructive and per-workspace — same shape as the pgvector adapter's per-source migration in D-PARSE-PGVECTOR §11.2.

---

## 6. What this ADR does NOT authorize

- Adding the `region` column to any retrofit-scope table now.
- Standing up a second region cluster.
- Changing any service to call a region resolver.
- Writing the per-region engine env var fallbacks now.
- Re-shaping CI to test multi-region paths.

This ADR is forward-looking. The retrofit (Phases 0–14 + §D follow-ups) does NOT touch deployment topology. When/if a §3 trigger fires, this ADR is amended (per §11 added at amendment time, mirroring the pgvector ADR's amendment shape) and a separate planning + execution arc lands the migration.

---

## 7. Acceptance

- [x] Current state documented (single-region intentional, region-shardable foundations in place).
- [x] Trigger conditions enumerated (§3.1–§3.4).
- [x] Swap surface described (§4.1–§4.7) — schema, resolver, engine bindings, routing, replicas.
- [x] Migration plan with back-out documented (§5.1–§5.3).
- [x] Explicitly NOT authorized for the retrofit scope (§6).
- [ ] Re-evaluate when any §3 trigger fires.

---

## 8. Cross-references

- `docs/implementation/agent-studio-retrofit-followups.md` §D2 — the deferral spec this ADR closes.
- `docs/architecture/agent-studio-pgvector-future-migration.md` — sibling ADR with the same forward-looking shape; D1 closure shows the amendment pattern when a trigger fires.
- `docs/architecture/agent-studio/RAC_ROLLOUT_PLAN.md` §7 — the original "Stage 9 concern" reference that this ADR replaces with concrete trigger conditions.
- `CLAUDE.md` `## Deferred Scope` — references this ADR as the authoritative deferral document.

---

## 9. Verification snapshot — 2026-05-08 (R7 of post-RAC audit closure)

The audit closure at `main@0258892` re-verified §2 / §4.3 invariants
against current main and locked the deferred state with CI gates.
This is **not** a §11 amendment — none of §3.1–§3.4 has fired, the
ADR's authority is unchanged. This is a closure snapshot recording
that "what the ADR says is deferred" actually still is.

### 9.1 Verified invariants (read against `main@0258892`)

| ADR § | Claim | Verified |
|---|---|---|
| §2.1 | No retrofit-scope table carries a `region` column | ✅ Direct grep across `drizzle/tables/agent-studio.ts` and `drizzle/tables/workspaces.ts` returned zero matches |
| §2.1 | No service in `server/agent-studio/` calls a region resolver | ✅ Zero matches for `getCurrentRegion` / `getWorkspaceRegion` / `isLocalRegion` function declarations in `server/` |
| §2.1 | `multi_region` is provider-capability tag only | ✅ `shared/catalog-taxonomy.ts:1145` declares `appliesTo: ["provider"]`, group `"operational"`. No deployment-topology coupling |
| §2.2 | Retrofit tables key on `workspaceId` | ✅ 19 `workspaceId.notNull()` rows in `drizzle/tables/agent-studio.ts` covering all canonical retrofit tables |
| §2.3 | `BUILT_IN_FORGE_API_URL` is a single global URL | ✅ `server/_core/env.ts:11` reads `process.env.BUILT_IN_FORGE_API_URL` with no per-region suffix branching |
| §2.3 | `DATA_ACQUISITION_WORKER_URL` is a single global URL | ✅ `server/data-analysis/data-acquisition/dataAcquisition.constants.ts:11` declares `DATA_ACQUISITION_WORKER_ENV = "DATA_ACQUISITION_WORKER_URL"`, single env name |
| §4.3 | No `BUILT_IN_FORGE_API_URL_{REGION}` / `DATA_ACQUISITION_WORKER_URL_{REGION}` / `AGENT_STUDIO_REGION` env-key references | ✅ Grep across `server/` and `shared/` for `_(US|EU|AU|REGION)` variants and `AGENT_STUDIO_REGION` returned zero matches |

### 9.2 CI lock

The above invariants moved from "verified once" to "enforced every CI
run" via 5 new tests in
`tests/agent-studio/retrofit-acceptance.test.ts` under the describe
block **"RETROFIT R7 — multi-region deferral lock (ADR §6)"**:

1. No `region` column on the 8 canonical retrofit-scope tables (§4.1
   list).
2. No region-resolver function declarations (`getCurrentRegion` /
   `getWorkspaceRegion` / `isLocalRegion`) anywhere in `server/`.
3. No per-region engine env-var references (`BUILT_IN_FORGE_API_URL_*`,
   `DATA_ACQUISITION_WORKER_URL_*`, `AGENT_STUDIO_REGION`).
4. `multi_region` taxonomy tag's `appliesTo` is exactly
   `["provider"]` — anything else (workspace, deployment) is a
   topology coupling that the ADR forbids.
5. No service in `server/agent-studio/` imports from a `*/region` or
   `*/region-resolver` module.

Layer 6 in `.github/workflows/run-tests.yml` runs the
retrofit-acceptance suite on every PR; these 5 tests fail loudly the
moment retrofit code starts adopting any §4 foundation without a
preceding §11 amendment. This converts the ADR's prose lock (§6
"What this ADR does NOT authorize") into an enforced gate, mirroring
audit-closure lesson #3 (CI-gates-are-the-real-contract).

### 9.3 What this snapshot does NOT do

- It does NOT amend the deferral. None of §3 has fired; §7's
  "Re-evaluate when any §3 trigger fires" remains unchecked.
- It does NOT pre-build any §4 foundation. No `region` column added,
  no resolver written, no per-region env vars wired.
- It does NOT change the trigger conditions (§3) or the swap surface
  (§4). §3.1–§3.4 + §4.1–§4.7 are unchanged from the original ADR.

When a §3 trigger eventually fires, the §11 amendment will (per the
ADR's original framing) authorize the migration arc, the 5 CI lock
tests will be relaxed in lockstep with the foundations being built,
and the swap surface (§4) drives the implementation.

### 9.4 Cross-reference to the audit closure summary

`/sdcard/Download/RAC_AUDIT_CLOSURE_2026-05-08.md` §1.6 — R7 closure
shape (verification snapshot + CI lock).
