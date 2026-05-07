# Provider Router Migration — Decision Record

**Captured:** 2026-05-07 against `main@1f5628a` (post-Phase-29.1b).
**Branch:** `feat/pmb-phase-29-2-provider-router-migration-adr`.
**Owner:** Planner + Builder roles per AGENTS.md.

---

## Why this decision exists

Phase 28.3's scope-discovery deferral cited `server/inference/provider-router.ts` as a routing-layer dependency on `getProviderRegistry()` at "lines 17, 137, 205" — flagged as part of the LR-08 closure work for Phase 29. Phase 29 §29.2 was scoped as: *does `providerRouter` survive as a routing-and-selection layer that delegates to Model Access for the actual upstream call, or does it dissolve entirely with callers calling Model Access directly?*

Pre-locking the answer required walking the call graph one or two hops out — the standing Phase 28 lesson. That walk produced a **load-bearing finding** that collapses the decision space.

---

## Scope-discovery finding (re-grep against `main@1f5628a`)

### Live consumers of `providerRouter`

| # | File | Line | Method called | Purpose |
|---|---|---|---|---|
| 1 | `server/chat/stream.ts` | 77 | `resolvePlan` | Selects primary provider when `useUnifiedRouting && workspaceId`. The actual `generateStream` is then invoked via `getProviderRegistry().getProvider(plan.primaryProviderId)` two layers later. |
| 2 | `server/code-studio/worker/phase-model-resolver.ts` | 97 | `resolvePlan` | Selection-only — returns `plan.primaryProviderName` for OpenCode CLI dispatch. **No execution.** |
| 3 | `server/providers/router.ts` (tRPC) | 538 | `resolvePlan` | UI dry-run via `routing.getRoutingPlan` query. Returns the plan; no execution. |

### Dead code on the `providerRouter` class

| # | File | Lines | Method | Status |
|---|---|---|---|---|
| 4 | `provider-router.ts` | 132–195 | `execute(request)` | **Never called from anywhere in `server/`.** |
| 5 | `provider-router.ts` | 200–336 | `executeStream(request)` | **Never called from anywhere in `server/`.** |

`grep -rn "providerRouter\.\(execute\|executeStream\)" server/ client/` returns zero results outside this file.

### Where the registry lives in providerRouter source

| Line | Site | Live? |
|---|---|---|
| 17 | `import { getProviderRegistry } from "../providers/registry";` | dead-coupled — only used by lines 137 + 205 below |
| 137 | inside `execute(request)` method | dead (no caller) |
| 205 | inside `executeStream(request)` method | dead (no caller) |

`resolvePlan` itself reads provider metadata via `providerDb.getAllProviders()` (line 357), **NOT** via `getProviderRegistry()`. That metadata read is the legacy `providers` table — a non-secret-shaped read of provider id/name/type/capabilities/priority/costs. It is **not** a D1 violation (D1 forbids reading `process.env[PROVIDER_API_KEY]` at runtime; reading a metadata row is orthogonal).

### Implication

The Phase 28.3 register entry framed §29.2 as "migrate `providerRouter`'s registry dependency to Model Access". The **actual live state** is:

- The registry import exists.
- The registry is referenced inside two dead methods.
- All three live callers use `resolvePlan` (selection-only), which has zero registry coupling.

The §29.2 decision space therefore collapses from "dissolve vs layer-over" to **"keep `resolvePlan`, delete the dead `execute` / `executeStream` methods, and migrate the chat-stream caller's *separate* registry consumption at line 70 in 29.6a"**.

---

## Locked decisions

### D-PR-1 — Verdict: layer-over with dead-code excision

**Decision:** Keep `providerRouter.resolvePlan` unchanged in scope and shape. **Delete** the dead `providerRouter.execute()` and `providerRouter.executeStream()` methods entirely (lines 132–336 of `provider-router.ts`). The class becomes selection-only.

**Why:** `resolvePlan` carries routing-rules-engine + workspace-routing-profile + fallback-chain logic that Model Access does not duplicate (Model Access takes a single `providerConnectionId`; routing across providers is an orthogonal concern). Dissolving it would force every caller to re-implement that selection. Layering over Model Access — i.e., callers feed `resolvePlan`'s output into Model Access — preserves both contracts cleanly.

The `execute` / `executeStream` methods are dead code per the call-graph walk above; deleting them removes the dangling `getProviderRegistry()` import from the file.

### D-PR-2 — Live caller migration shape (defines §29.6's contract)

| Caller | Pre-29 shape | Post-29 shape | Sub-phase |
|---|---|---|---|
| `chat/stream.ts:77` (resolvePlan) + `chat/stream.ts:70, 178` (registry.generateStream) | `providerRouter.resolvePlan` → `getProviderRegistry().getProvider(id).generateStream(...)` | `providerRouter.resolvePlan` → resolve `providerConnectionId` from selected `providerId` (D-PR-4) → `gatewayCall(modelAccess.stream, ...)` | **29.6a** |
| `code-studio/worker/phase-model-resolver.ts:97` | `providerRouter.resolvePlan` → `plan.primaryProviderName` (selection only; OpenCode CLI executes) | unchanged — selection only, no D1 violation in the flow | **n/a** (no migration needed) |
| `server/providers/router.ts:538` (tRPC `routing.getRoutingPlan`) | `unifiedRouter.resolvePlan` → return plan to UI | unchanged — dry-run only, no execution | **n/a** |

The unified-routing branch in `chat-stream.ts` keeps its `resolvePlan` call; only the *execution* step at line 178 (`provider.generateStream(...)`) is rewired onto Model Access. The non-unified branch (no `workspaceId`) refuses with `binding_required` (D-WDB-3 contract — no automatic system-default fallback).

### D-PR-3 — `getProvidersWithMetadata` is NOT a D1 violation

`resolvePlan` reads the legacy `providers` table via `providerDb.getAllProviders()` to populate the routing-rules-engine input. This read returns metadata fields (`id`, `name`, `type`, `enabled`, `priority`, `kind`, `capabilities`, `policyTags`, `limits`, `costPer1kTokens`) — **none of which are credential-shaped**.

D1 forbids runtime code from reading `process.env[PROVIDER_API_KEY]`. Reading a `providers` row of metadata is not in D1's scope. The boundary lint at `scripts/check-provider-key-env-boundary.ts` correctly does not flag this read. **No allowlist entry required.**

This decision is locked here so §29.7 (boundary-lint allowlist sweep) doesn't accidentally reclassify `providers`-table reads as violations.

### D-PR-4 — `providerId` ↔ `providerConnectionId` mapping (the bridging primitive)

The legacy `providers` table (main DB, integer `id`) and the `provider_connections` table (main DB per Phase 12.5, integer `id`) carry different keyspaces. `resolvePlan` returns a legacy `providerId`; Model Access takes a `providerConnectionId`. The chat-stream migration in 29.6a needs a bridge.

**Investigation outcome (locked here so 29.6a doesn't re-litigate):** `provider_connections` carries a soft cross-reference back to the legacy `providers` row via the existing `provider_catalog_entry_id` ↔ `provider_id` link established in Phase 23–25 of Plan v3. The 29.6a migration uses this mapping in one of two shapes:

- **(I)** Look up the `provider_connections` row whose linked `provider_catalog_entry_id` resolves back to `plan.primaryProviderId`. Requires a small read helper alongside `resolveWorkspaceDefaultBinding` — call it `resolveProviderConnectionForLegacyProviderId(workspaceId, providerId)`.
- **(II)** When mapping (I) returns no row, fall back to `resolveWorkspaceDefaultBinding({workspaceId, role:"chat"})` — i.e., when the routing profile selects a provider that has no Phase-12.5 connection rowed yet, use the workspace default.

29.6a prep verifies the mapping shape against current ASDB / main-DB state. Should mapping (I) be infeasible (no FK link in current schema), 29.6a falls through to mapping (II) only and surfaces the gap as a follow-up. **Not blocking** the §29.2 decision.

### D-PR-5 — `executeInvokeAgent` legacy `agents` table strategy

`server/automation/block-executors.ts:executeInvokeAgent` reads from the legacy `agents` table (line 217: `SELECT * FROM agents WHERE id = ${agentId}`), not from AS drafts. This is the only Phase 29 caller that does not have a clean AS-agent path forward. Three options were laid out in the Phase 29 plan:

- **Path A — backfill:** create an AS draft on first invocation. Adds migration logic + per-workflow draft-creation flow.
- **Path B — refuse:** return `binding_required` for legacy `agents` table rows. Simplest; might break automation workflows in dev.
- **Path C — dual-table support:** keep the registry path for legacy agents + Model Access for AS agents. Preserves back-compat at the cost of keeping `getProviderRegistry()` alive in this one path (a partial D1 closure).

**Decision: Path B (refuse).** Rationale:

- The `agents` table is the pre-Agent-Studio orchestration system, marked legacy in `CLAUDE.md` ("`server/agents/` — Legacy agent orchestration (pre-Agent-Studio; out of retrofit scope)").
- Path C re-introduces a registry path AT THE TIME we're closing it. That contradicts D1.
- Path A is non-trivial (per-workflow AS draft creation, ownership questions, lifecycle bugs) for a code surface explicitly out of retrofit scope.
- Path B's "might break dev workflows" risk: 29.6b prep includes a query against ASDB / main DB to enumerate active automation workflows that hit `executeInvokeAgent` with legacy `agentId`. If the count is zero, Path B ships clean. If non-zero, surface for sign-off before locking 29.6b.

**Pre-condition check before locking 29.6b:**

```sql
SELECT COUNT(*) FROM workflow_executions
 WHERE workflow_id IN (
   SELECT workflow_id FROM workflow_blocks
    WHERE block_type = 'invokeAgent'
      AND data->>'agentId' IS NOT NULL
 );
```

If 0: ship Path B. If >0: surface for sign-off.

### D-PR-6 — §29.2's relationship to §29.3

§29.3 was originally scoped as "providerRouter implementation per the §29.2 ADR — 2–3 PRs, ~300–500 LOC". Per D-PR-1's collapse of the decision space, **§29.3 is downgraded to a single-PR ~80-LOC excision**: delete `execute` / `executeStream` methods, drop the `getProviderRegistry` import, update the (likely none — verify in 29.3 prep) corresponding tests.

The execution-layer migration (the part that originally looked like ~400 LOC) actually lives in §29.6a (chat-stream's registry consumption) and §29.6b (executeInvokeAgent). §29.3's only job is the dead-code excision.

### D-PR-7 — Boundary lint shape

`provider-router.ts` does not call `process.env`. It reads `provider_connections` and `providers` metadata. **No new boundary-lint allowlist entry** is created or removed by §29.2 / §29.3.

§29.6a's chat-stream migration removes a registry-based execution path; if `chat/stream.ts:70` is currently on the boundary-lint allowlist, §29.6a removes that entry. If not, no change. Per the Phase 29 plan §29.6's note ("LR-08 has no boundary entry — its registry consumption is one layer down"), the allowlist already does not point at chat-stream — so 29.6a's boundary-lint impact is also nil.

### D-PR-8 — Receipt and governance

`providerRouter.resolvePlan` is internal Express-server code, not a gateway-callable surface. The dry-run UI exposure is at the tRPC layer (`server/providers/router.ts:538`), which keeps its existing `protectedProcedure` gate. No receipt descriptor is added or removed by §29.2.

The downstream `gatewayCall(modelAccess.stream, ...)` calls in §29.6a inherit Model Access's existing receipt policy via `enforceModelAccessReceipt` — this is the SAME hybrid policy that 29.0a's simulation migration consumes. No new policy decision needed.

---

## Net plan-doc impact

§29.2 (this PR — ADR-only, ~doc): ~80 LOC of doc.
§29.3 (excision PR): ~80 LOC code change. Deletes `execute()` + `executeStream()` methods + the unused `getProviderRegistry` import + (likely none) corresponding tests. Updates `provider-router.ts` JSDoc to reflect "selection-only" surface.
§29.6a (chat-stream caller migration): ~150–200 LOC. Wires `resolvePlan` output into `gatewayCall(modelAccess.stream)` via D-PR-4's mapping helper.
§29.6b (executeInvokeAgent caller migration): ~50–100 LOC. Path B refuses for legacy agents.

**Total Phase-29-rev-of-original-estimate:** down from "~600–800 LOC across §29.3 + §29.6" to "~280–380 LOC." The collapse comes from the dead-code finding.

---

## Cross-references

- `PHASE_29_EXECUTION_PLAN.md` §29.2 / §29.3 / §29.6 — execution plan that this ADR refines.
- `WORKSPACE_DEFAULT_BINDING_DECISION.md` — D-WDB-1..8 (consumed by 29.6a's mapping fallback per D-PR-4).
- `MODEL_ACCESS_CONTRACT.md` — Model Access surface consumed by 29.6a/29.6b.
- `LEGACY_EXCEPTION_REGISTER.md` — LR-08 row points at chat/stream.ts and block-executors.ts; this ADR clarifies the actual fix shape.
- `PHASE_28_LR_08_DEFERRAL_DECISION.md` — origin of the §29.2/29.3 deferral; this ADR closes it.
- `CLAUDE.md` — "`server/agents/` — Legacy agent orchestration (pre-Agent-Studio; out of retrofit scope)" anchors D-PR-5's Path B rationale.

---

## Lesson carried forward (and applied here)

> When locking a sub-phase scope, re-grep current code AND walk the call graph one-or-two hops out. The register snapshots scope at write-time; code drifts; chain-of-trust through earlier plan docs amplifies stale assumptions.

This ADR was prepared by re-grepping `providerRouter` and `unifiedRouter` against `main@1f5628a` and walking each caller. The walk surfaced the dead-code finding (D-PR-1) and shrank the planned §29.2 + §29.3 + §29.6 scope by ~50%. **The Phase 29 plan's original ~300–500 LOC §29.3 estimate was based on the register's write-time framing; the actual live shape is much smaller.** Future Phase 29 sub-phases should run the same prep step before committing to LOC estimates.

D-PR-4 explicitly defers the `providerId` ↔ `providerConnectionId` mapping investigation to 29.6a prep. If that mapping turns out infeasible (no FK link in current schema), 29.6a takes mapping (II) only and files a follow-up — surfacing the gap rather than forcing a fit.

D-PR-5's Path B for `executeInvokeAgent` carries a pre-condition check against active legacy-agent workflows. If the check returns non-zero, 29.6b pauses for sign-off. Same shape as the Phase 28 pause-condition discipline.
