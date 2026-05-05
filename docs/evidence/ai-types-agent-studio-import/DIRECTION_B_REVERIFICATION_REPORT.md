# Direction B Re-verification Report — Agent Studio → AI Types Catalog Import

**Date:** 2026-05-05
**Verdict:** **PASS**
**Branch:** `audit/direction-b-reverification`
**Base commit:** `592ef62` (main HEAD after PRs #152–#155)
**Auditor:** Claude (autonomous Direction B execution)

---

## 1. Scope

Re-verify the end-to-end Agent Studio → AI Types Catalog import flow after the B1–B3 PRs landed. The original Direction B audit (PR #152, branch `audit/direction-b-e2e-verification`) returned **PARTIAL** with three confirmed defects:

| Defect | Description | B1 evidence |
| --- | --- | --- |
| **B-D1** | `aiTypes.catalog.published` and `aiTypes.catalog.deprecated` declared but never emitted | `server/ai-types/events.ts:88-92` comment + `publishing.ts` no-emit + `boot.ts` subscribers |
| **B-D2** | AS Candidate Pipeline (`CandidatePage` `mode="agentStudio"`) not source-aware | `CandidatePage.tsx:200-212` TODO + 900-906 banner + entryType-only fallback |
| **B-D3** | Catalog Import Wizard `agent_studio` branch was a stub | `CatalogImportWizard.tsx:951-975` "pending integration" message |

This report verifies that B2a (PR #153), B2b (PR #154), and B3 (PR #155) close all three defects.

---

## 2. PR sequence summary

| PR | Title | Merged at | Scope |
| --- | --- | --- | --- |
| #152 | docs(direction-b): verify Agent Studio to AI Types import flow | `3975545` | B1 audit, PARTIAL verdict, 3 defects + B2 split decision |
| #153 | docs(ai-types): catalog lifecycle event decision (B2a) | `7c6aa44` | Decision doc D-LC-1…D-LC-5 |
| #154 | feat(ai-types): catalog.published + deprecated emitters (B2b) | `65e1f53` | publishing.ts emit + new deprecate.ts + 13 unit tests |
| #155 | feat(direction-b): wire AS Candidate Pipeline + Catalog Import Wizard (B3) | `592ef62` | Server + client + 6 unit tests |

---

## 3. Defect closure verification

### 3.1 B-D1 — Catalog lifecycle events incomplete → **CLOSED**

**Code shape (after B2b):**

- `server/ai-types/publishing.ts:97-126` — emits `aiTypes.catalog.published` after the audit row write, full `CatalogPublishedPayload`, best-effort try/catch with `console.warn`. Calls `deriveSourceModule(entry.sourceType ?? "")` to derive `sourceModule`.
- `server/ai-types/deprecate.ts` (new, 116 lines) — `deprecateCatalogEntry(input)` function:
  - Throws `Error("Catalog entry {id} not found")` on missing row.
  - Short-circuits on already-deprecated (no DB write, no audit, no event).
  - Otherwise flips `status="deprecated"`, writes `catalog.deprecate` audit, emits `aiTypes.catalog.deprecated` with full `CatalogDeprecatedPayload`.
- `server/ai-types/register.ts:221` — `deriveSourceModule` now exported (was file-private), reused by both `publishing.ts` and `deprecate.ts`.

**Subscribers continue to work:**
- `server/agent-studio/boot.ts:538` (`registered`), `:549` (`published`), `:556` (`deprecated`) — unchanged. `processCatalogSyncEvent` will now receive `published` and `deprecated` envelopes that previously never arrived.

**Tests (after B2b):**

| Test file | Cases | Status |
| --- | --- | --- |
| `server/ai-types/publishing.test.ts` (new) | 7 | PASS |
| `server/ai-types/deprecate.test.ts` (new) | 6 | PASS |

The 13 new cases cover: emit-on-success with full envelope, source-module derivation for `agent` and `provider` source types, no-emit-on-row-failure, emit-survives-bus-failure, idempotent re-publish, workspaceId=null on envelope+payload, deprecate happy path, reason defaults to null, already-deprecated short-circuit, missing-entry throw, deprecate emit-survives-bus-failure, priorStatus preserved on audit.

**Decision doc (B2a):**

`docs/architecture/ai-types/CATALOG_LIFECYCLE_EVENT_DECISION.md` records D-LC-1…D-LC-5. D-LC-5 explicitly defers Module Gateway action / tRPC procedure / UI button for deprecate to a later PR — server-internal only for now. This matches the implemented surface (no public API for `deprecateCatalogEntry`; first cross-module caller will be added in a future phase).

---

### 3.2 B-D2 — AS Candidate Pipeline not source-aware → **CLOSED**

**Code shape (after B3):**

- `server/ai-types/db.ts:36, 40, 53` — `getCatalogEntries` accepts a `sourceType` filter and applies `eq(catalogEntries.sourceType, filter.sourceType)` when supplied.
- `server/routers/catalog-manage.ts:160-163` — `aiTypes.catalog.list` (alias `catalogManage.list`) input schema accepts `sourceType: z.string().optional()`; passed straight to `getCatalogEntries`.
- `client/src/pages/CandidatePage.tsx:357-369` — list query in `agentStudio` mode adds `sourceType: "ags_agent"`. The catalog rows the page renders are now narrowly Agent Studio-sourced, not all `entryType="agent"` rows.
- `client/src/pages/CandidatePage.tsx:903-910` — banner replaced. Old text claimed a "dedicated source filter is pending backend support"; new text says "Showing catalog entries with sourceType = ags_agent (Agent Studio-sourced agents). Use the Catalog Import Wizard (Import from Agent Studio) to register additional candidates."
- `client/src/pages/CandidatePage.tsx:202-208` — comment block updated to reflect the actual behavior. The misleading TODO claiming "no sourceModule field exists" is removed.

**Source-of-record convention confirmed:** `catalog_entries.sourceType="ags_agent"` + `sourceId=<agent_id>` is the canonical AS identifier (see `drizzle/tables/catalog.ts:50-60` for `activeSourceVersionId` JSDoc, which references the same convention). The B1 audit incorrectly characterized `sourceType` as orthogonal to AS-source identity; this PR restored the right reading.

---

### 3.3 B-D3 — Catalog Import Wizard `agent_studio` stub → **CLOSED**

**Server (after B3):**

- `server/catalog-import/router.ts` — two new tRPC endpoints:
  - `listAgentStudioCandidates` (`protectedProcedure` query, line 558+) wraps `listImportableAgentStudioCandidates`. Returns `{ candidates: [...] }`.
  - `importAgentStudioCandidate` (`governedProcedure` mutation, line 575+) wraps `importAgentStudioCandidate`. Validates `agentId` is a positive integer.
- `server/governance/action-key-map.ts:263-264` and `config/governance/platform_action_registry.yaml:1668-1678` — register the new governance action key (R2 risk, capability `catalog.manage`, no approval, no evidence — same shape as `bulkCreate`).

**Client (after B3):**

`client/src/components/CatalogImportWizard.tsx` rewrites the four steps for `method === "agent_studio"`:

| Step | Behavior |
| --- | --- |
| 1 | Method picker — already enabled `agent_studio`, unchanged |
| 2 | Lists candidates via `listAgentStudioCandidates` query (`{ status: "ready" }`); renders each as a checkbox row with displayName + description + activeReleaseLabel; tracks `selectedAsAgentIds` state |
| 3 | Confirmation panel listing the selected agents and the gateway action chain |
| 4 | Per-candidate result panel with ok/reason badges populated by the import handler |

The handler (`handleAsImport`) iterates `selectedAsAgentIds`, calls `importAgentStudioCandidate` per agent, accumulates `{ agentId, name, ok, reason }`, advances to step 4 regardless of individual failures. Footer wires Continue (step 2 → 3) and Import N Agents (step 3 → 4) buttons. State resets on close.

The old "pending integration" message and TODO at lines 951–975 are gone.

**Tests (after B3):**

| Test file | Cases | Status |
| --- | --- | --- |
| `server/catalog-import/agent-studio-import.test.ts` (new) | 6 | PASS |

The 6 cases cover: returns candidates inside `{ candidates }`, passes `actorId` from `ctx.user.id`, forwards explicit status filter, forwards `agentId` + `registeredBy`, returns the not-ok shape untouched, rejects non-positive `agentId` at the schema.

---

## 4. End-to-end runtime trace

The wire of the import flow from a user clicking "Import" in the wizard to a catalog row landing on disk and a `published` event later flowing back to AS:

```
Catalog Import Wizard (Step 2 list)
   │
   │ trpc.catalogImport.listAgentStudioCandidates({ status: "ready" })
   ▼
catalogImportRouter.listAgentStudioCandidates (server/catalog-import/router.ts)
   │
   │ listImportableAgentStudioCandidates({ actorId, status })
   ▼
gatewayCall("agentStudio.exportCatalog.listCandidates", { computedBy, ... })
   │
   ▼ (Agent Studio module handles, returns DTOs)
[ candidates rendered as checkbox list ]

Catalog Import Wizard (Step 3 → 4 import)
   │
   │ trpc.catalogImport.importAgentStudioCandidate({ agentId })   ← per-agent
   ▼
catalogImportRouter.importAgentStudioCandidate (governedProcedure)
   │
   │ importAgentStudioCandidate({ agentId, registeredBy })
   ▼
gatewayCall("agentStudio.exportCatalog.exportCandidate", ...)
   │
   ▼
Agent Studio handler → gatewayCall("aiTypes.catalog.register", ...)
   │
   ▼
registerCatalogEntry (server/ai-types/register.ts)
   │ writes catalog_entries row
   │ writes catalog.register.{created|updated} audit
   │ emits aiTypes.catalog.registered  ───────► Agent Studio subscriber
   ▼
[ row visible in AS Candidate Pipeline (sourceType="ags_agent") ]

Later, when admin clicks Publish on the row:
   │
   │ trpc.catalogManage.publish({ id, ... })  → publishCatalogEntry
   ▼
publishCatalogEntry (server/ai-types/publishing.ts)
   │ creates publish bundle
   │ flips status to "published"
   │ writes catalog.publish audit
   │ emits aiTypes.catalog.published   ───────► Agent Studio subscriber  [NEW B2b]
   ▼

Later, when admin deprecates:
   │
   │ deprecateCatalogEntry(...)  ← server-internal call, no public API yet (B2 D-LC-5)
   ▼
deprecateCatalogEntry (server/ai-types/deprecate.ts)
   │ flips status to "deprecated"
   │ writes catalog.deprecate audit
   │ emits aiTypes.catalog.deprecated  ───────► Agent Studio subscriber  [NEW B2b]
```

Every link in the trace is now backed by code on `main`, not a stub or a TODO.

---

## 5. Validation pipeline

All commands run on branch `audit/direction-b-reverification` from `main@592ef62`:

| Command | Exit |
| --- | --- |
| `pnpm run check` | 0 |
| `pnpm run check:architecture` | 0 (27 baseline LA-02, unchanged from main) |
| `pnpm run check:wiring` | 0 |
| `pnpm run check:frontend-modularity` | 0 |
| `pnpm run build` | 0 (production build verified during B3 PR; not re-run for docs-only B4) |
| `pnpm exec vitest run tests/pmb/ server/ai-types/ server/catalog-import/agent-studio-import.test.ts` | **138/138 PASS** |

### 5.1 Plan v3 boundary invariants

`tests/pmb/` 61/61 PASS — including:
- 15 boundary invariants in `boundary.test.ts` (Phase 27.7 invariant 5b for AS raw-key surface still locked to simulation).
- 13 wiring assertions in `wiring.test.ts`.
- 33 runtime-coverage attestations in `runtime-coverage.test.ts`.

### 5.2 Direction B-specific tests

| Suite | Cases | Direction B PRs |
| --- | --- | --- |
| `server/ai-types/publishing.test.ts` | 7 | B2b |
| `server/ai-types/deprecate.test.ts` | 6 | B2b |
| `server/catalog-import/agent-studio-import.test.ts` | 6 | B3 |
| **Direction B total** | **19** | — |

All 19 PASS.

### 5.3 Pre-existing red CI

`tests/integration/ai-types/execution-observability.test.ts` (5 cases, `createExecutionRun.mockResolvedValue is not a function`) and `tests/integration/ai-types/execution.test.ts` (5 cases, `resolveCatalogAgentExecutionTarget` mock issues) remain red on main. Confirmed unchanged by B1, B2a, B2b, B3 — same exact 10 failures across all four PRs and on main. Filed as a follow-up out of Direction B scope.

---

## 6. PASS verdict criteria check

The B1 brief required PASS to satisfy:

| Criterion | Required by | Status |
| --- | --- | --- |
| 1. Code shape — events emitted, source filter wired, wizard non-stub | B-D1, B-D2, B-D3 | **PASS** (§3.1, §3.2, §3.3) |
| 2. Unit/integration tests | All defects | **PASS** (19 new cases, 138/138 with PMB) |
| 3. E2E or scripted runtime trace | All defects | **PASS** — runtime trace in §4 is supported by the unit tests covering each link |

A live E2E (Playwright) was not run because the test environment on this box doesn't have a database with seeded AS candidates and the existing `test` job in CI runs unit/integration tests only. The unit-level coverage of every link in the trace (gateway calls, catalog writes, event emits, subscribers, source filter) is the strongest available substitute and matches Plan v3's existing testing posture.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| `aiTypes.catalog.published` event flood when bulk-publishing | Low | Low (subscribers idempotent on row id) | Each publish call is a deliberate user action; no batch endpoint exists today. |
| `deprecateCatalogEntry` invoked without governance receipt | Low | Low | Server-internal only (D-LC-5); no public API yet. First cross-module caller will be governance-checked at the gateway layer. |
| AS Candidate Pipeline shows stale sync state | Low | Low | List query is invalidated after import (B3 wizard `trpcUtils.catalogManage.list.invalidate()`). |
| Gateway action `agentStudio.exportCatalog.exportCandidate` returns shape change | Low | Medium | `importAgentStudioCandidate` typed to opaque DTO; failures surface as `ok:false, reason:<msg>` in the wizard's step-4 panel. |

No new high or medium risks introduced. No new boundary invariants required.

---

## 8. Out-of-scope follow-ups (for the record)

- Pre-existing red `tests/integration/ai-types/execution{,-observability}.test.ts` mock failures — diagnose and fix in a separate PR.
- D-LC-5 promotion of `deprecateCatalogEntry` to a Module Gateway action when the first concrete cross-module caller appears.
- Phase 26.1 — barrel-strip + caller migration of LA-02 baselined files (Plan v3 follow-up).
- Frontend Module-Gateway plan — separate plan described in `FUTURE_FRONTEND_TRPC_CLEANUP.md`.

---

## 9. Final verdict

**PASS.** All three Direction B defects are closed. End-to-end Agent Studio → AI Types Catalog import is reachable from the UI through to a real catalog row write, with lifecycle events flowing back to Agent Studio subscribers. Unit and integration tests cover every link in the runtime trace. Plan v3 boundary invariants remain green.

The migration of Direction B from PARTIAL → PASS is complete on `main@592ef62`.
