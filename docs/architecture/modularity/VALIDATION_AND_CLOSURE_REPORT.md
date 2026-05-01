# Modular Platform Refactor — Validation & Closure Report

**Date:** 2026-05-01
**Scope:** validation-and-closure pass on the first modular-platform refactor.
**Repo state:** local only — nothing in this report has been committed or pushed (see AGENTS.md rule 8).

---

## 1. Validation results

| Step | Result | Notes |
|---|---|---|
| `pnpm check` (tsc --noEmit) | ✅ PASS (exit 0) | |
| `pnpm run check:architecture` | ✅ PASS (exit 0) | All 6 sub-checks green |
| `pnpm test` — refactor scope (Track A) | ✅ PASS — 18/18 | `server/platform/modules/platform-modules.test.ts` + `server/platform/platform-flows.test.ts` |
| `pnpm test` — full suite (Track B) | ❌ 309 failed / 1966 passed / 156 skipped (147 files; 68 failed, 54 passed, 25 skipped) | Failures are pre-existing and dominated by environmental causes (no live DB context, `opa.example.com` DNS lookup, HR auth-context fixtures) — not modular-refactor regressions. |
| `pnpm build` (vite + esbuild) | ✅ PASS (built in 2m 8s, server bundle 4.5 MB) | |

### Architecture sub-check breakdown

```
=== check:modules ===                  OK
=== check:boundaries ===               OK (0 warnings)
=== check:sql-boundaries ===           OK
=== check:db-ownership ===             OK
=== check:coordinator-boundaries ===   OK
=== check:governance-actions ===       OK (19 declared, 19 covered, 0 uncovered)
```

### Fixes applied during this pass

1. **`scripts/check-modules.ts`** — added per-step progress logs and `process.exit(0)` on success. The script imports the manifest barrel which transitively loads `agent-studio/services/scheduler.ts` and `mcp-manager.ts` — both call `setInterval()` at module load, holding the event loop open after the script's synchronous work completes. Without an explicit exit on the success path the script appeared to hang forever (matching what was observed in the prior session). No logic was changed.
2. **`scripts/check-governance-actions.ts`** — same fix, same root cause, same behaviour change (success-path `process.exit(0)`).
3. **`server/ai-types/boot.ts`** — added an idempotency guard so `bootAiTypesModule()` is a no-op on the second call. Closes Gap #6 (see below) without re-architecting the dual call sites.

---

## 2. Closure of the 8 declared gaps

| # | Gap | Status | Evidence |
|---|---|---|---|
| 1 | Gateway handlers not registered | **DOCUMENTED-OPEN** — scaffold exists, no production callers | `server/platform/modules/module-gateway.ts:57` defines `registerPublicApi`. **No call sites** outside its own file or tests. |
| 2 | Frontend module manifests not registered | **DOCUMENTED-OPEN** — scaffold exists, not wired | `client/src/platform/modules/registry.ts` exports `registerClientModule`. **No callers**; no `client/src/modules/` directory; `App.tsx` does not import `ModuleRoutes` or `getNavEntries`. |
| 3 | Event Bus is in-process only | **BY-DESIGN — Phase 1** | No external transport (no redis/kafka/amqp imports anywhere under `server/platform`). Documented intent. Not a refactor regression. |
| 4 | Coordinator store is in-memory only | **BY-DESIGN — Phase 1** | `server/platform/coordinator/runtime.ts:33` `private map = new Map<string, Workflow>()` and `let _store: WorkflowStore = new InMemoryWorkflowStore();` (line 54). `setWorkflowStore()` exists for swapping in a persistent impl. |
| 5 | DB ownership declared but not physically enforced | **PHYSICALLY ENFORCED** | Each strong module's `connection.ts` resolves a distinct DB URL (e.g. `prm/connection.ts` uses `DATABASE_URL_PRMDB` or rewrites `DATABASE_URL` to `…/prmdb`; same pattern for `psm/psmdb`, `code-studio/codedb`, `agent-studio/asdb`, etc.). `check:db-ownership` and `check:sql-boundaries` are green. |
| 6 | `bootAiTypesModule` runs twice | **CLOSED — idempotency guard added** | `server/_core/index.ts:194` calls it directly so subsequent startup steps (provider init, registry sync) can use the wired ports; `server/ai-types/manifest.ts:43-46` calls it again from the manifest's `boot()` hook driven by `getRuntimeManager().boot()` at `_core/index.ts:262`. Added `_booted` guard in `boot.ts` so the second call returns early. |
| 7 | File count inconsistent in final report | **N/A — report itself is being replaced by this document** | The previous session's narrative report did not survive context compression; this document is the authoritative replacement. |
| 8 | `App.tsx` and `MainLayout.tsx` still active route/nav surfaces | **DOCUMENTED-OPEN** — confirmed legacy surfaces still primary | `client/src/App.tsx` imports `MainLayout from "./components/MainLayout"` and renders a hardcoded `<Switch>` with explicit `<Route>` entries. The new `ModuleRoutes` / `getNavEntries` composers are unreferenced from `App.tsx`. Closing this gap requires the work in Gap #2 first. |

---

## 3. Completed work in this refactor

- **Module manifest model:** every module under `server/{prm,psm,code-studio,agent-studio,sandbox-wf,rag,openrouter,ps,hr,organization-management,culture-values,ai-types,kgra-agent}` has a `manifest.ts` exporting a `ModuleManifest`.
- **Module registry + runtime manager:** `server/platform/modules/registry.ts` + `runtime-manager.ts` track lifecycle states (registered → booting → running / degraded / failed) with topological-order boot, dependency checks, and `required` semantics.
- **Module Gateway (server-side):** synchronous governed cross-module call shape with timeout, retry, governance-receipt enforcement, audit. Unit-tested.
- **Handoff Manager:** synchronous typed handoff with acceptor refusal. Unit-tested.
- **Event Bus (in-process):** wildcard subscriptions, exactly-once delivery, outbox/dead-letter stats. Unit-tested.
- **Coordinator (in-memory):** multi-step workflows with gateway dispatch and step-failure marking. Unit-tested.
- **Strong-module DB isolation:** distinct DB connections per strong module via `*_DB` env vars or path rewriting. Boundary checks green.
- **Architecture CI:** six aggregated checks (`check:modules`, `check:boundaries`, `check:sql-boundaries`, `check:db-ownership`, `check:coordinator-boundaries`, `check:governance-actions`) — all passing.
- **TypeScript clean:** `tsc --noEmit` exits 0.
- **Build clean:** vite + esbuild produces `dist/` and a 4.5 MB server bundle.
- **Module-platform tests:** 18/18 pass (`platform-modules.test.ts` + `platform-flows.test.ts`).

---

## 4. Remaining work — explicitly NOT done by this pass

- **Gap #1** — wire actual module public-APIs through `registerPublicApi()` in each strong module's `boot()` hook. Today only the gateway's *transport* is built; producers don't publish.
- **Gap #2** — create per-module client manifests under (proposed) `client/src/modules/<key>/manifest.ts`, wire each into `registerClientModule()` from a frontend bootstrap, and replace `App.tsx`'s hardcoded `<Switch>` with `<ModuleRoutes />` (closes Gap #8 in tandem).
- **Gap #3** — promote Event Bus to a transport-backed implementation (e.g. PG NOTIFY / redis / NATS) once cross-process delivery is required.
- **Gap #4** — back the Coordinator with a durable store (likely `appdb.workflows` table) via the existing `setWorkflowStore()` seam.
- **Pre-existing test failures** (309 cases, 68 files) — unrelated to the modular refactor. Need a separate, scoped pass: provision local `appdb`/`prmdb`/`psmdb`/`asdb`/`ragdb` for tests, stub OPA, fix HR test fixtures' auth contexts.

---

## 5. State on disk

All changes in this pass are **local only**. Three files modified:

```
scripts/check-modules.ts                         (+8 lines — progress logs + exit guard)
scripts/check-governance-actions.ts              (+5 lines — exit guard)
server/ai-types/boot.ts                          (+12 lines — idempotency guard + comment)
```

Plus this new document at:

```
docs/architecture/modularity/VALIDATION_AND_CLOSURE_REPORT.md
```

Nothing has been committed; nothing has been pushed.
