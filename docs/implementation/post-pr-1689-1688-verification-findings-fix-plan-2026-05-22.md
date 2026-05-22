# Verification findings fix plan — post PRs #1688/#1689

Date: 2026-05-22
Source: live-app verification run against `main @ 6dc53651` on `localhost:3000`.

Six findings surfaced. Six PRs proposed, one per root cause, each sized for the same review burden as the recent #1685–#1690 series.

## Severity & order

| # | Finding | Severity | Risk if left | Suggested order |
|---|---|---|---|---|
| F1 | Dev server crashes on Postgres bounce | **High** | dev-loop fragility, false-positive verdicts | 1 |
| F4 | `graphLens.render` ignores workspace scoping | **Med** | governance audit risk (data leak across workspaces) | 2 |
| F5 | ASDB-targeted crons run on wrong DB (Termux role mismatch) | **Med** | log noise, hides real cron failures | 3 |
| F2 | Lens stack double-flag gate is silent | **Med** | first-boot operator confusion | 4 |
| F6 | ASDB boot index-create error | **Low** | log noise; unique index never lands | 5 |
| F3 | No operator UI for `bases.*` lifecycle verbs | **Backlog** | acknowledged in #1689 test plan | 6 (or defer) |

---

## F1 — DB pool unhandled error → server crash

**Root cause (located):** `server/db/connection.ts:12` calls `drizzle(process.env.DATABASE_URL, { schema })`. This auto-creates an internal `pg.Pool` we never get a handle to. When the postmaster bounces, the idle client emits `error`, no listener is attached, Node's default handler exits the process. Same pattern in `server/agent-studio/db/connection.ts:43` for ASDB.

**Fix:**
1. Refactor both `getDb()` and `getAsDb()` to own the pool: `const pool = new pg.Pool({ connectionString: url }); pool.on('error', (err) => log...); _db = drizzle({ client: pool, schema });`
2. Match the log shape we already use (`[Database]` / `[ASDB]` prefix); never rethrow from the error handler.
3. Add a one-shot reconnection probe inside the handler so the next request that touches the pool surfaces a clean error rather than a stale-socket one.

**Files:** `server/db/connection.ts`, `server/agent-studio/db/connection.ts`.

**Acceptance:** kill PG with `pkill -9 postmaster`, wait for runsv respawn, hit `/api/trpc/agentStudio.bases.list` — first request after respawn errors cleanly (5xx, NOT process exit), subsequent request succeeds.

**Test plan:** unit test that triggers `pool.emit('error', new Error(...))` and asserts process is still alive after a `setImmediate`.

---

## F4 — `graphLens.render` returns 86 nodes for non-existent workspace 9999

**Root cause:** the reader's ASDB queries (agents, decisions, governance_records) aren't filtered by `workspaceId` — they're ASDB-global. The router accepts any integer and passes it through. There's no existence check.

**Fix:** Two layers, smallest slice first.
1. Slice A (this PR): add a workspace-existence check at the top of `graphLensRouter.render`. If `workspaceId` is supplied but no `workspaces` row matches, return a new envelope status `workspace_not_found` (extend the existing discriminated union — same pattern as `not_found` / `no_runner_for_kind`).
2. Slice B (follow-up, **not** in this PR): thread `workspaceId` through the ASDB reader so each table is scoped where it has a natural workspace column (agents.workspaceId, etc). Decide per-table what "global to ASDB" means for governance. This is a roadmap item, not a bug fix — file as a tracker entry.

**Files:** `server/agent-studio/services/graph-lens/graph-lens-router.ts` (+1 envelope shape on the discriminated union), `RenderLensInput` Zod schema unchanged.

**Acceptance:** `render({workspaceId:9999, lensId:"institutional_memory_default"})` → `{status:"workspace_not_found", workspaceId:9999}`. Existing `not_found` / `no_runner_for_kind` envelopes unchanged.

---

## F5 — ASDB crons fail with "Failed query" on every sweep

**Root cause (located):** `server/agent-studio/db/connection.ts:30` defaults to `postgresql://localhost:5432/asdb`. On Termux that auths as user `root`, which doesn't exist (memory: `reference_local_asdb_role_mismatch`). The boot log shows `[ASDB] Connecting to: postgresql://localhost:5432/asdb` and then every region-cache + graph-health-alert sweep dies because the lazy pool fails on first query.

Two parts to the fix:

1. **The cron error swallowing makes diagnosis hard.** `makeRetentionCron`'s catch reports `sweep failed: Failed query: ...` but discards the underlying `error.message` (`role "root" does not exist`). Surface the original error.
2. **The default URL doesn't work on Termux.** Two options:
   - (a) Document `DATABASE_URL_ASDB` as a required env var and refuse to lazy-init when unset on non-CI hosts (fail loud at boot, not at first query).
   - (b) Detect Termux at the connection layer and pick `host=/data/data/com.termux/files/usr/tmp` + user `u0_a296` automatically.

   (a) is the conservative fix; (b) is operator-friendly. **Recommend (a)** — auto-detection couples dev/prod paths.

**Files:** `server/agent-studio/db/connection.ts`, `server/agent-studio/services/retention/make-retention-cron.ts` (or wherever the catch block lives), docs/`.env.example`.

**Acceptance:** with `DATABASE_URL_ASDB` set, sweeps log `swept — pinCount=0` clean. Without it, boot logs a clear `[ASDB] DATABASE_URL_ASDB unset — refusing to init` before any cron starts.

---

## F2 — Lens stack double-flag gate

**Not a bug** — the gating is deliberate. The friction is operator-discovery.

**Fix:** Cheapest possible. At boot, after the lens-stack composer reports `installedCount`, log a one-shot warning when the stack is misconfigured:

```
[ags-graph-lens] WARNING — 1 real runner installed but AGS_GRAPH_LENS_DEFAULTS_INSTALL is unset.
  graphLens.list will be empty until you set AGS_GRAPH_LENS_DEFAULTS_INSTALL=on.
```

Same for the inverse case (defaults installed but no runners → registry shows everything as `hasRunner:false`).

**Files:** `server/agent-studio/services/graph-lens/install-default-lens-stack.ts` or `boot.ts:957`.

**Acceptance:** boot with one flag set → warning visible; boot with both → no warning; boot with neither → existing "partial install — lenses=false runners=false" line is enough (no warning needed).

---

## F6 — ASDB `idx_ags_graph_edges_type_edge_key` index creation fails

**Investigation step first** (we don't know if it's duplicate data or a column-shape mismatch). Run on a live ASDB:
```sql
SELECT type, edge_key, COUNT(*) FROM ags_graph_edges
GROUP BY type, edge_key HAVING COUNT(*) > 1 LIMIT 20;
```

**Then fix:** either backfill-dedupe via migration, or change the index to non-unique with a comment explaining why. Migration goes through the same `scripts/migrations/manual/` route as PR #223 (ASDB doesn't run Drizzle migrations).

**Files:** `scripts/migrations/manual/ags-graph-edges-unique-index-backfill.sql`, possibly the table definition if the constraint was wrong.

**Acceptance:** boot log shows no `[ASDB] index error` line.

---

## F3 — Bases admin UI (operator UI for #1689 verbs)

**Defer or schedule?** This is a feature, not a bug fix. The PR test plan explicitly leaves the operator-UI checkbox unchecked.

**If scheduled, scope:**
- Add an admin page at `/agent-studio/bases` (or under existing admin nav).
- List view: workspace selector, bases table with archive/unarchive toggle.
- Detail view: column table with rename + delete row-actions; row table (already covered by `createRow`/`updateRow`).
- Wire to `trpc.agentStudio.bases.*` — types already exported.

**Files:** new under `client/src/modules/agent-studio/pages/`, plus a nav entry.

**Recommendation:** punt to a separate slice; not in the same PR series as F1–F6. The other five are server-side; this is a frontend day.

---

## Execution order

Five tight server-side PRs (F1 → F4 → F5 → F2 → F6) in that order, then decide on F3 separately. F1 first because the dev server crash blocks reliable verification of any later fix.
