# Agent Studio Phase MR-1 Phase-2 Cutover — State of the Union

**Date:** 2026-05-15 (rev 2: 2026-05-15 — extended with §8 post-SOU follow-ups)
**Status:** **Operationally complete + 5 of 6 SOU §5 follow-ups closed.** All caller migration (MR-3) is done at the shim layer; the shim's Phase-2 routing stack is built end-to-end; the cutover is env-flag-gated; the cache-coherency loop is closed both in-process and cross-process; operator tRPC + React admin surfaces exist; cross-region access denial primitive + middleware factory exist.
**Predecessor:** `docs/implementation/agent-studio-mr-3-state-of-the-union-2026-05-14.md` (rev 3) — substantive close-out of the MR-3 caller migration.

---

## 0. Why this doc exists

Phase MR-1 of the V1+/V2 Native Graph Workspace plan is the
multi-region cutover. It moved through several distinct sub-arcs:

1. **MR-1-α (#754, 2026-05-13)** — `agsRegions` table + pure router
   (`resolveWorkspaceRegion` / `assertSameRegion`) + multi-region
   failover runbook.
2. **MR-2 (#760-something, 2026-05-13)** — region-routed connection
   helper (`getDbForRegion` / `getDbForWorkspace`) + per-region pool
   cache.
3. **MR-3 caller migration** — 76 batches across `repository.ts`,
   service-layer files, and read-path consumers; closed substantively
   in rev 3 of the predecessor SOU (#898, 2026-05-15). Every Phase-1
   call site now routes through `getAsDbForWorkspace(workspaceId)`.
4. **MR-1 Phase-2 cutover** — **THIS SUB-ARC.** Wires the shim to
   actually consult region pinning data at runtime. Six PRs in one
   afternoon (#899–#904, 2026-05-15).

The cutover arc shipped the missing data source, sync cache, late-
binding bridge, boot wiring, and cache-coherency hooks needed to flip
`getAsDbForWorkspace` from "observe + delegate" to "consult cache +
route".

---

## 1. Architecture (post-cutover)

```
   ┌────────────────────────────────────────────────────────────┐
   │ Caller (repository.ts, services/*)                         │
   │                                                            │
   │   getAsDbForWorkspace(workspaceId)        ← Phase-1 shim   │
   │            │                                               │
   │            ▼                                               │
   │   db/connection.ts (shim)                                  │
   │   ┌──────────────────────────────────────┐                 │
   │   │ if (workspaceId == null) → getAsDb() │                 │
   │   │ if (!router)            → getAsDb()  │                 │
   │   │ const routed = router.resolve(id)    │                 │
   │   │ if (!routed)            → getAsDb()  │                 │
   │   │ return routed                        │                 │
   │   └──────────────────────────────────────┘                 │
   │            │                                               │
   │            ▼ (when installed)                              │
   │   services/region/region-routing-bridge.ts                 │
   │            │                                               │
   │            ▼                                               │
   │   services/region/workspace-region-cache.ts (sync readers) │
   │   ┌──────────────────────────────────────┐                 │
   │   │ workspacePinByWorkspaceId map        │                 │
   │   │ activeRegions array                  │                 │
   │   │ primaryRegion                        │                 │
   │   └──────────────────────────────────────┘                 │
   │            ▲                                               │
   │            │ warmRegionRoutingCache (async)                │
   │            │                                               │
   │   ┌────────┴────────┐  ┌─────────────────────────┐         │
   │   │ region-service  │  │ workspace-region-pin-   │         │
   │   │  listActive +   │  │  service                │         │
   │   │  getPrimary     │  │  listAll, set, remove   │         │
   │   └─────────────────┘  └─────────────────────────┘         │
   │            │                       │                       │
   │            ▼                       ▼                       │
   │   ASDB ags_regions       ASDB ags_workspace_region_pins    │
   └────────────────────────────────────────────────────────────┘
```

**Coherency loop (post-cutover):**
- Pin write → `firePinChanged` → `reloadCacheAfterChange("pin change")` → `invalidateRegionRoutingCache` + fire-and-forget `warmRegionRoutingCache`.
- Region write → `fireRegionChanged` → `reloadCacheAfterChange("region change")` → same as above.

---

## 2. Six-PR ledger (#899–#904)

| PR | Slice | Scope |
|---|---|---|
| #899 (PR-V1-148) | First slice | `ags_workspace_region_pins` table + `workspace-region-pin-service` (set/get/list/remove) + barrel re-exports. **The missing data source.** |
| #900 (PR-V1-149) | Second slice | `workspace-region-cache` — in-process sync cache populated by `warmRegionRoutingCache`; readers: `getCachedRegionForWorkspace` / `getCachedRegionKeyForWorkspace` / `getCachedPrimaryRegion` / `getCachedActiveRegions` / `getRegionRoutingCacheStatus` / `invalidateRegionRoutingCache`. **The sync view.** |
| #901 (PR-V1-150) | Third slice | Shim cutover. `db/connection.ts` adds `configureRegionRouter(router \| null)` late-binding hook. `region-routing-bridge.ts` exposes `installRegionRouter()` / `uninstallRegionRouter()` — the closure that fills the shim's slot. **The hot-path wiring.** |
| #902 (PR-V1-151) | Fourth slice | Env-flag-gated boot wiring. `install-region-routing.ts` exposes `maybeInstallRegionRouting()`. Boot Step 3.32 invokes it. Flag: `AGS_REGION_ROUTING=on` (default OFF). **The operator switch.** |
| #903 (PR-V1-152) | Fifth slice | Pin-change invalidation hook. `setPinChangeHook` slot on pin-service; `firePinChanged()` after every INSERT/UPDATE/DELETE; bridge wires invalidate-and-re-warm closure. **Pin coherency.** |
| #904 (PR-V1-153) | Sixth slice | Region-change invalidation hook (symmetric). `setRegionChangeHook` slot on region-service; `fireRegionChanged()` after `registerRegion` insert; bridge wires the closure. DRY helper `reloadCacheAfterChange(label)` reused across both hooks. **Region coherency.** |

---

## 3. Operational baseline

**Single-region operators:**
- Do nothing. `AGS_REGION_ROUTING` stays unset; boot logs `[ags-region-routing] not installed — env flag unset`.
- Every `getAsDbForWorkspace(workspaceId)` call returns the bootstrap `getAsDb()` handle — bit-for-bit identical to pre-cutover behavior.

**Multi-region operators (cutover sequence):**
1. Insert region rows: `INSERT INTO ags_regions(region_key, name, postgres_uri, neo4j_uri, is_primary, is_active) VALUES (...)`. Idiomatic shape: one `default` primary row + one row per remote region.
2. Insert pin rows: `INSERT INTO ags_workspace_region_pins(workspace_id, region_key, is_replicated, notes) VALUES (...)`. One row per workspace assigned to a non-primary region. Unpinned workspaces default to the primary.
3. Set `AGS_REGION_ROUTING=on`. Restart.
4. Boot logs: `[ags-region-routing] installed — activeRegions=N pins=M primary=X`.
5. Operator pin changes after boot: visible immediately (no restart needed) — the pin-service write fires the invalidation hook + the cache re-warms async.

**Rollback:**
- Unset `AGS_REGION_ROUTING`. Restart.
- `installRegionRouter` is not called; shim reverts to Phase-1 delegate-to-`getAsDb` behavior.
- Pin / region rows remain in place (data is not destroyed); the cache is just no longer consulted.

---

## 4. Hard-rule compliance

Every file in the cutover stack source-scan-tested for:
- No `process.env.*_API_KEY` reads (only `AGS_REGION_ROUTING` toggle).
- No `credential-resolver` import outside model-access (Plan v3 D2).
- No `dispatchMcpToolCall` import (MCP dispatcher chokepoint preserved).
- No `neo4j-driver` import outside `services/graph/repository/**` + `server/modules/kgia/**`.

Postgres = source of truth: the cache is a derived in-process view. Pin + region writes go to ASDB; cache derives from those rows on warm.

---

## 5. What's NOT in scope (carried forward)

These are the natural successor slices, deferred so this cutover arc closes cleanly:

| Item | Why deferred | Notes |
|---|---|---|
| **Multi-process cache invalidation** | The current invalidate-and-re-warm is in-process only. Multi-replica deployments will see stale caches on non-writer replicas. | Future: Redis pub-sub / cluster-wide invalidation channel. The hook slots are ready; only the cross-process fan-out is missing. |
| **Cross-region replication catch-up** | Pin changes don't currently trigger data replication; they only re-point the routing. | Future: when Phase MR-1 multi-region replication ships (Phase 2.5 / 3 of the original ADR), pin write should optionally trigger a replication-job enqueue. |
| **Operator admin UI for pins** | Service exists; tRPC admin router + React surface deferred. | Future: `agentStudio.region.pin.list / set / remove` procedures + an operator dashboard page. |
| **Periodic cache re-warm** | One-shot warm at boot; subsequent warmth depends on writes triggering re-warm. Long-running processes with rare pin writes could see staleness if writes happen on other replicas. | Future: cron-style `setInterval` re-warm at boot, matching the existing retention-cron factory pattern. |
| **Cross-region read denial** | The `assertSameRegion` pure guard exists (#754); it is not yet wired into a request middleware. | Future: tRPC middleware that calls `assertSameRegion` on workspace-scoped procedures. |

---

## 6. Connection back to MR-3

The MR-3 caller-migration arc (rev 3 SOU) established the invariant
that **every workspace-scoped read and write** routes through
`getAsDbForWorkspace`. That arc was a *prerequisite* for this cutover:
without it, only some callers would route correctly under multi-region,
and the cutover would have shipped with a silent split-brain risk.

Now that both arcs are operationally complete:
- MR-3 invariant: every workspace-scoped DB call observes workspaceId.
- MR-1 Phase-2 invariant: every observed workspaceId routes to the
  pinned region (or falls back to primary / bootstrap as documented).

The two arcs compose end-to-end. Single-region deployments are
unaffected; multi-region deployments are now a config-only change.

---

## 8. Rev 2 — Post-SOU follow-ups (2026-05-15)

The SOU §5 deferred list named 5 follow-up items. Rev 2 closes 5 of 6
in one continuous burst (#906–#911). The remaining item
("Cross-region replication catch-up") is a multi-quarter
infrastructure investment and is correctly deferred to Phase 2.5/3 of
the multi-region ADR.

| PR | Item | What |
|---|---|---|
| #906 (PR-V1-155) | Periodic re-warm cron | `services/region/region-cache-rewarm-cron.ts` wraps `warmRegionRoutingCache` via `makeRetentionCron`. Default cadence `*/10 * * * *`. Boot Step 3.33 starts it. Catches drift if a hook closure threw + bridges any cross-process gap. |
| #907 (PR-V1-156) | Admin tRPC router | `services/region/region-admin-router.ts` mounted at `agentStudio.region.*` with 8 admin-only procedures: listActiveRegions, registerRegion, listPins, getPin, setPin, removePin, getCacheStatus, getRewarmCronStatus. All inputs Zod-validated; mutations fire the invalidation hooks. |
| #908 (PR-V1-157) | Admin React page | `pages/RegionAdminPage.tsx` + `components/RegionAdminPanel.tsx` reachable at `/agent-studio/region-admin`. Four panels: cache status, cron status, active regions, workspace pins. Postgres URIs credential-masked before display. Read-only; CLI / tRPC remain the supported write path. |
| #909 (PR-V1-158) | Cross-region access guard primitive | `services/region/cross-region-guard.ts::guardCrossRegionAccess(workspaceId, ctx?)`. Throws `CrossRegionAccessDeniedError` when pin doesn't match process region + not replicated. Process region read from `AGS_PROCESS_REGION_KEY` env. Permissive defaults. |
| #910 (PR-V1-159) | Cross-region tRPC middleware factory | `services/region/cross-region-trpc-middleware.ts::createCrossRegionMiddleware<TInput>(extractWorkspaceId, options?)`. Wraps the guard; throws `TRPCError({ code: "FORBIDDEN" })` on deny. Per-procedure opt-in. |
| #911 (PR-V1-160) | Multi-process cache invalidation | `services/region/region-cache-pubsub.ts` — Postgres LISTEN/NOTIFY on channel `ags_region_routing_invalidate`. NOTIFY fires from `reloadCacheAfterChange`; subscriber spawned at boot when `AGS_REGION_PUBSUB=on`. Linear-backoff reconnect. Reusable pattern for any future cross-process bus. |

### Carry-forward to a future arc

**Cross-region replication catch-up** (Phase 2.5 / 3 of original ADR)
remains the one significant deferred item. This isn't a single slice
— it's logical replication between Postgres clusters in different
regions, Neo4j projection rebuild per region, replication-aware
promotion semantics. The scaffolding to enable it is now in place:
the cache coherency loop will surface inconsistencies during
replication catch-up; the admin surfaces let operators inspect the
state; the cross-region guard denies unauthorized reads. The actual
replication mechanism is a separate engineering arc.

### Operational summary after rev 2

| Capability | Single-region default | Multi-region opt-in |
|---|---|---|
| Caller routing | `getAsDbForWorkspace` → bootstrap `getAsDb()` | `getAsDbForWorkspace` → routed pool via cache |
| Cache coherency | n/a (no cache) | In-process hooks (#903 / #904) + cross-process NOTIFY (#911) |
| Re-warm | n/a | Boot warm + 10-min cron (#906) + NOTIFY-triggered |
| Operator visibility | n/a | `agentStudio.region.*` (#907) + `/region-admin` page (#908) |
| Cross-region read deny | n/a | `guardCrossRegionAccess` primitive (#909) + `createCrossRegionMiddleware` (#910) |
| Env flags | All unset | `AGS_REGION_ROUTING=on` + optionally `AGS_REGION_PUBSUB=on` + `AGS_PROCESS_REGION_KEY=<key>` |

Single-region operational baseline is preserved across all 14 PRs:
unset flags = behavior identical to pre-cutover.

---

## 7. Reference docs

- `docs/architecture/agent-studio-multi-region.md` — Phase MR-1 ADR.
- `docs/runbooks/agent-studio-multi-region-failover-runbook.md` — failover runbook.
- `docs/implementation/agent-studio-mr-3-state-of-the-union-2026-05-14.md` rev 3 — predecessor caller-migration SOU.
- `docs/implementation/agent-studio-mr-3-getasdb-inventory.md` — original Phase-1 caller inventory.
- `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` §Phase MR-1 — execution plan section.
