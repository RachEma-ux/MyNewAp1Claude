# Phase 29 — Scoping Note

**Status:** Scoping; not yet a full execution plan.
**Captured:** 2026-05-07 against `main@9a8d123` (post-Phase-28.2 merge).
**Owner:** Planner role per AGENTS.md (assigned during Phase 29 plan-freeze).

---

## Why Phase 29 exists

Phase 28 was scoped as the "close the LR-01..09 register" batch. During Phase 28.3 execution, investigating the LR-08 call sites surfaced that the register entry materially underestimated the migration's scope. LR-08's prescribed fix — "migrate `chat/stream.ts` and `executeInvokeAgent` to `agentStudio.providerBindings.resolveForRun` + `openRouter.modelAccess.execute|stream`" — assumes a small migration. Reality:

1. **`/api/chat/stream` has no `agentId`.** The endpoint is workspace-scoped, not agent-scoped. `resolveForRun(...)` requires an AS-agent ID. The legacy chat UI at `client/src/pages/Chat.tsx:364` is actively wired against this endpoint.

2. **`server/inference/provider-router.ts:resolvePlan` is the workspace-scoped routing layer** that chat-stream delegates to in unified-routing mode. It itself reads `getProviderRegistry()` at lines 17, 137, 205. Closing LR-08 cleanly means migrating this routing layer onto Model Access, not just rewiring the two named callers.

3. **`executeInvokeAgent` operates on the legacy `agents` table**, not Agent Studio drafts. The `agents` table rows have no foreign-key relationship to `ags_agent_drafts`, so `resolveForRun(legacyAgentId)` doesn't resolve. The current implementation just picks `providers[0]` from the registry — no real binding semantics today.

The honest assessment: LR-08's closure isn't "rewire two call sites." It's "migrate the workspace-scoped routing infrastructure off the registry abstraction." That's a Phase-shaped piece of work, not a sub-phase.

The Phase 28 decision was to **defer LR-08 to Phase 29** (`PHASE_28_LR_08_DEFERRAL_DECISION.md`). LR-08's deadline rolls from Phase 28 → Phase 29; per the precedent in `PHASE_27_RUNTIME_PATH_DECISION_MATRIX.md` ("Items 5–11 in the 27.4 decision matrix are pre-existing register entries with deadlines flipped from 'Phase 27' to 'Phase 28'; none of them count as new"), a deadline roll is not a new TEMPORARY_EXCEPTION.

---

## Scope (in)

The unifying theme of Phase 29 is: **migrate the workspace-scoped routing path onto Model Access**. After Phase 28.3 deferred LR-08 and Phase 28.4 deferred the LR-02/03/04 caller migrations (with LR-04 reclassified as a chat-completion caller, not embedding), the Phase 29 caller list is:

| LR | Caller | Primitive |
|---|---|---|
| LR-02 | `embeddings/service.ts` | `openRouter.modelAccess.embed` (built in 28.4) |
| LR-03 | `documents/processor.ts:339` | Closes transitively with LR-02 |
| LR-04 | `operators/provider-hub.ts:78` | `openRouter.modelAccess.execute` (existing) |
| LR-08 | `chat/stream.ts` + `automation/block-executors.ts:executeInvokeAgent` | `execute`/`stream` (existing) + routing-layer migration |

All four share the **workspace-default-binding** upstream dependency — the unifying decision Phase 29 owns.

Concrete deliverables:

- **`providerRouter` migration.** Replace `getProviderRegistry()` calls in `server/inference/provider-router.ts` with Model Access execute/stream invocations. Decide whether `providerRouter` survives as a routing+selection layer that *delegates* to Model Access for the actual upstream call, or whether it gets dissolved entirely and the existing callers (chat-stream, batch service, hybrid router) call Model Access directly.

- **Workspace default binding.** Either a new `workspace_default_provider_binding` table/column, or a "platform agent" pattern (a synthetic AS agent whose binding is the workspace default). This unblocks `/api/chat/stream`'s no-agentId case. Decision lives in a P29 ADR.

- **`/api/chat/stream` migration.** After the above two land, swap `getProviderRegistry()` + `provider.generateStream` for a Model Access streaming call. Preserve the existing SSE shape, RAG-context injection, cost tracking, and unified-routing audit reasons.

- **`executeInvokeAgent` migration.** Decide what to do about the legacy `agents` table:
  - Path A: backfill an AS draft on first invocation (one-time migration).
  - Path B: refuse legacy agents — return a structured "AS draft required" error; provide an operator script to migrate.
  - Path C: keep dual-table support in `executeInvokeAgent` (registry path for legacy agents, Model Access path for AS agents). This preserves backwards-compat at the cost of keeping the registry alive in this one path.

- **Eventual `getProviderRegistry()` deprecation.** After Phase 29 closes, the only remaining consumers are `code-studio/opencode/provider-sync.ts:48`, `code-studio/opencode/web-instance-manager.ts:71`, and `kgra-agent/nodes.ts:33` — the three legacy `providers`-table readers Phase 28.2 deferred. Whether to migrate them off the registry or leave them as a documented compat shim is a Phase 29 decision.

## Scope (out)

- **The `providers` legacy table itself.** Phase 29 closes the *runtime read* path; whether the table is dropped is a separate question (it's still used by code-studio/opencode for the auth.json sync and by kgra-agent for fact-gathering).
- **Embeddings, documents, operators (LR-02/03/04).** These continue to land under Phase 28.4 + 28.5; they don't touch the workspace-scoped routing layer.
- **Simulation (LR-01).** Continues under Phase 28.6 + 28.7.

---

## Tentative sub-phase decomposition (refined during Phase 29 plan-freeze)

| Sub-phase | Title | Notes |
|---|---|---|
| 29.0 | Plan freeze | Mirror the Phase 28 plan-freeze pattern. Captures decisions made in this scoping note. |
| 29.1 | Workspace default binding ADR + migration | Decide between table/column vs. platform-agent pattern. Schema + read API + tests. |
| 29.2 | `providerRouter` migration ADR | Decide: dissolve, or layer over Model Access? |
| 29.3 | `providerRouter` implementation | Per ADR. |
| 29.4 | `/api/chat/stream` migration | Now possible via 29.1 + 29.3. |
| 29.5 | `executeInvokeAgent` migration | Per Path A/B/C decision in ADR (29.2 may include this). |
| 29.6 | Boundary-lint allowlist purge for LR-08 | Final gate. |
| 29.7 | Closure report + register reconciliation | LR-08 row → `migrated`. |

## Tentative sizing

| Sub-phase | PRs | LOC estimate |
|---|---|---|
| 29.0 | 1 | ~250 docs |
| 29.1 | 1–2 | ~150 + tests |
| 29.2 | 1 | ~100 ADR |
| 29.3 | 2–3 | ~300–500 |
| 29.4 | 1–2 | ~300 |
| 29.5 | 1 | ~150 |
| 29.6 | 1 | ~50 |
| 29.7 | 1 | ~250 docs |
| **Total** | **9–11** | **~1,500–2,200 LOC** |

Smaller than Phase 27 / Phase 28 because the surface is more focused (one routing layer + two callers, not seven-LR cleanup). The dominant cost is the workspace-default-binding decision and `providerRouter` migration, both of which need ADRs first.

---

## Authority

Phase 29 is **not yet authorized for autonomous execution.** The autonomous authority granted on 2026-05-07 (`project_phase_28_authority.md`) scoped to Phase 28's LR-01..09 register closure. Phase 29 needs an explicit re-grant when the user is ready to start it.

---

## Cross-references

- `LEGACY_EXCEPTION_REGISTER.md` LR-08 — deadline rolled from Phase 28 → Phase 29 in this scoping pass.
- `PHASE_28_EXECUTION_PLAN.md` 28.3 — marked DEFERRED with cite to this doc.
- `PHASE_28_LR_08_DEFERRAL_DECISION.md` — full rationale for the scope discovery.
- `PHASE_27_RUNTIME_PATH_DECISION_MATRIX.md` — the original matrix; precedent for rolling deadlines forward.
- `server/inference/provider-router.ts` — the routing layer Phase 29 owns.
- `server/chat/stream.ts` — primary LR-08 caller.
- `server/automation/block-executors.ts:executeInvokeAgent` — secondary LR-08 caller.
