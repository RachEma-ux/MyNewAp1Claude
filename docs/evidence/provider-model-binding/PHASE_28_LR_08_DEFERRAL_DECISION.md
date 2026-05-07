# Phase 28.3 — LR-08 Deferral Decision

**Captured:** 2026-05-07 against `main@9a8d123` (post-Phase-28.2 merge).
**Branch:** `docs/pmb-phase-28-3-defer-to-phase-29`.
**Owner:** Governance role per AGENTS.md.

---

## TL;DR

**Decision: DEFER LR-08 to Phase 29.** The register entry materially underestimated the scope. The Phase 28 plan's 28.3 sub-phase is marked DEFERRED with the deadline rolled from Phase 28 → Phase 29. A Phase 29 scoping note (`PHASE_29_SCOPING.md`) captures the actual surface to migrate.

Per the precedent in `PHASE_27_RUNTIME_PATH_DECISION_MATRIX.md` (matrix items 5–11: pre-existing register entries with deadlines flipped from Phase 27 to Phase 28), a deadline roll is **not a new TEMPORARY_EXCEPTION_WITH_DEADLINE**. Phase 28's exception cap stays at **0 / 1 allowed**.

User explicitly authorized this deferral on 2026-05-07 after surfacing the scope discovery.

---

## Investigation

The Phase 28 plan §6.1 anticipated some open questions on LR-08 (workspace-scoped binding resolution for the no-agentId case in `/api/chat/stream`). Reading the actual call sites surfaced three structural mismatches between what the register prescribed and what the code requires:

### Mismatch 1: `/api/chat/stream` has no `agentId`

**Register fix:** "Migrate `/api/chat/stream` to call `agentStudio.providerBindings.resolveForRun` then `openRouter.modelAccess.execute|stream` via the gateway."

**Reality (`server/chat/stream.ts:12-25`):**

```ts
const chatStreamSchema = z.object({
  providerId: z.number().int().positive().optional(),
  messages: ...,
  workspaceId: z.number().int().positive().optional(),
  useUnifiedRouting: z.boolean().optional(),
  // ... no agentId
});
```

The endpoint is workspace-scoped, not agent-scoped. `resolveForRun(...)` requires an AS-agent ID. Closing this requires either a new "workspace default binding" surface, or refusing non-AS-agent chat-stream calls outright.

The legacy chat UI at `client/src/pages/Chat.tsx:364` is the live caller; this endpoint is not dead code.

### Mismatch 2: `providerRouter.resolvePlan` is the workspace-routing layer underneath

`chat-stream.ts:77` delegates to `providerRouter.resolvePlan({ workspaceId, ... })` in unified-routing mode. `providerRouter` itself reads `getProviderRegistry()` at lines 17, 137, 205. Closing LR-08 by rewiring chat-stream to call `providerRouter` instead of the registry directly **doesn't actually close LR-08** — the registry consumption is one layer down.

The honest closure requires migrating the `providerRouter` infrastructure off the registry abstraction. That's a Phase-shaped piece of work, not a sub-phase:

```ts
// server/inference/provider-router.ts
17: import { getProviderRegistry } from "../providers/registry";
73:   async resolvePlan(request: RoutingRequest): Promise<RoutingPlan> {
137:    const registry = getProviderRegistry();
202:    const plan = await this.resolvePlan(request);
205:    const registry = getProviderRegistry();
```

### Mismatch 3: `executeInvokeAgent` operates on the legacy `agents` table

**Register fix:** "Migrate `executeInvokeAgent` to do the same against the agent's binding."

**Reality (`server/automation/block-executors.ts:218-228`):**

```ts
const agents: any = await db.execute(
  sql`SELECT * FROM agents WHERE id = ${agentId}`
);
const agent = agents[0][0];
// ...
const { getProviderRegistry } = await import("../providers/registry");
const registry = getProviderRegistry();
const providers = registry.getAllProviders();
// ... picks providers[0] — no real binding semantics
```

The function operates on the legacy `agents` table, not `ags_agent_drafts`. There is no foreign-key relationship between the two tables today. `resolveForRun(legacyAgentId)` does not resolve. The current implementation just picks `providers[0]` from the registry — there's no real binding being honored at all.

Closing this requires a decision on legacy-agents support: backfill an AS draft, refuse legacy agents, or keep dual-table support. None of those decisions are pre-made; the register entry assumed AS draft semantics that don't exist for this caller.

---

## Why deferral is the right call

Three options were considered:

### Option α — Tackle the full migration in Phase 28.3

Migrate `providerRouter` to Model Access, build workspace-default binding, then chat-stream + executeInvokeAgent on top. ~500–800 LOC across 5+ files, with new schema work for the workspace-default binding.

**Why not:** Phase 28's scope was "close the LR register"; this is "rewrite the workspace-routing infrastructure." Conflating them produces the largest single PMB PR and mixes three independent decisions into one merge. Reviewer load + regression risk both balloon.

### Option β — Defer LR-08 to Phase 29

Acknowledge the scope discovery; roll LR-08's deadline forward; capture the actual surface in a Phase 29 scoping doc; continue the Phase 28 batch with the remaining LRs (LR-02/03/04 in 28.4–28.5; LR-01 in 28.6–28.7).

**Why yes:** The register-entry-was-wrong outcome is the same shape as Phase 28.1's LR-09 closure (where the entry described a surface that no longer existed) and as the lessons from PR #223 (migration 0042 path mismatch) and PR #224 (`useCount` field never incremented). Re-verifying scope against current code surfaces drift that planning docs miss. Once surfaced, the honest move is to rescope, not to ship a forced fit.

### Option γ — Half-close LR-08

Migrate `executeInvokeAgent` to require AS agents; leave chat-stream open. Half-closes the row; awkward for the closure report.

**Why not:** Bookkeeping debt without a clear winner — the chat-stream half is the more important closure (it's the live HTTP endpoint), so closing only the automation half doesn't reduce the principal risk meaningfully.

---

## What this PR changes

1. New `docs/architecture/provider-model-binding/PHASE_29_SCOPING.md` — scoping note for the Phase 29 routing-layer migration.
2. New `docs/evidence/provider-model-binding/PHASE_28_LR_08_DEFERRAL_DECISION.md` (this doc) — full rationale.
3. `LEGACY_EXCEPTION_REGISTER.md` LR-08 row — `Deadline phase` flipped from "Phase 28" to "Phase 29"; `Reason retained` updated to cite this doc.
4. `LEGACY_EXCEPTION_REGISTER.md` Phase 28 sub-phase mapping table — LR-08 row updated to `28.3 (DEFERRED → Phase 29)`.
5. `PHASE_28_EXECUTION_PLAN.md` 28.3 sub-phase — marked DEFERRED with cite to this doc and `PHASE_29_SCOPING.md`.

No code changes. No new TEMPORARY_EXCEPTION_WITH_DEADLINE introduced (deadline roll, not new exception).

---

## Acceptance criteria — met

- [x] Scope discovery documented with code-level cites (file paths + line numbers).
- [x] Phase 29 scoping note captures the actual surface to migrate.
- [x] LR-08 row reflects the new deadline.
- [x] Phase 28 plan reflects 28.3's deferred status.
- [x] No new exception introduced (deadline roll only); cap stays 0 / 1.
- [x] User explicitly authorized the deferral.

---

## Lessons reinforced (continuation of the chain-of-trust drift theme)

This is the **third** Phase-28 sub-phase to discover that a register entry's prescribed fix didn't match current code. Earlier instances:

- **28.1 (LR-09):** Surface eliminated by PR #100 *seven hours before the register was created*. Decision: ALREADY_FIXED (`PHASE_28_OPENCODE_SUBPROCESS_DECISION.md`).
- **28.2 (LR-06):** Register entry's "switch target table to `provider_connections`" piece accounted for the boot-time read but not the three legacy `providers`-table readers downstream. Decision: ship Scope A; defer the table swap.
- **28.3 (LR-08, this doc):** Register entry's "migrate two call sites" piece materially underestimated the routing-layer migration. Decision: defer to Phase 29.

**Pattern:** when closing a register row, re-grep the file against current `main` AND walk the call graph one or two hops out. The register snapshots scope at write-time; code drifts; chain-of-trust through Phase 19 → 27.4 → 28 entries amplifies stale assumptions. This is the same shape PR #223 (migration 0042 path) and PR #224 (`useCount` field) caught — both via re-verification against current code rather than via static review of the docs.
