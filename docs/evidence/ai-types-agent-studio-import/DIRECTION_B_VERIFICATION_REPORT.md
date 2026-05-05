# Direction B — Provider/Model Binding Bridge — Verification Report

**Direction B:**
*Agent Studio Export Catalog → AI Types Import from Agent Studio → `aiTypes.catalog.register` → AI Types catalog lifecycle events → Agent Studio sync/reconciliation*

**Verification mode:** read-only audit (no application code changes), per AGENTS.md Reviewer + Tester roles.
**Branch:** `audit/direction-b-e2e-verification` (from `main@b64b7b3`)
**Audit run:** 2026-05-05
**Auditor:** Claude (Opus 4.7, 1M context)

---

## 1. Executive verdict

**Direction B is PARTIAL.**

The backend chain — Agent Studio Export Catalog actions, AI Types `importFromAgentStudio` gateway-only adapter, `aiTypes.catalog.register`, the `ags_catalog_sync_log` table + `processCatalogSyncEvent` subscriber, `reconcileExportCatalogSync` drift repair — is **complete and tested**. Boundary invariants 1, 3, 4, and 5 from the Phase 42 boundary-test pass at HEAD (61/61 PMB tests pass).

Three gaps remain:

- **B-D1 — `aiTypes.catalog.published` and `aiTypes.catalog.deprecated` emitters missing.** The payload contracts are declared (`server/ai-types/events.ts:94, 109`), the Agent Studio subscribers are wired (`server/agent-studio/boot.ts:549, 556`), but no `publishEvent(...)` call is made for either event. `publishCatalogEntry` (`server/ai-types/publishing.ts:44–106`) writes a `catalog.publish` audit row and flips `entry.status` to `"published"`, but does not emit the platform event. There is no formal `deprecateCatalogEntry` function at all — only generic `updateCatalogEntry({status: "deprecated"})` via `catalog-manage.ts:155`.
- **B-D2 — AS Candidate Pipeline UI is not source-aware.** The page exists (`/llm/catalogue/as-candidates` → `client/src/pages/ASCandidatePage.tsx` → `<CandidatePage mode="agentStudio">`), but in agentStudio mode the filter is locked to `entryType="agent"` and shows ALL agent catalog entries. An honest "pending backend support" banner is rendered (`CandidatePage.tsx:900–906`) and the source-code TODO at `CandidatePage.tsx:205–209` calls out the missing `aiTypes.catalog.asCandidates` server-side query.
- **B-D3 — Import Wizard "Import from Agent Studio" branch is a stub.** The method appears in `METHODS` (`CatalogImportWizard.tsx:144–150`, enabled: true), is selectable on Step 1, and on Step 2 renders an honest "pending integration" message (`CatalogImportWizard.tsx:951–970`) with a TODO comment (`:971–975`). It does not call `listImportableAgentStudioCandidates` or `importAgentStudioCandidate`.

The defects are honest stubs, not silent bugs — each is paired with explanatory UI text and source-code TODOs. None of them violate Direction B's boundary rules.

---

## 2. Branch and commit

```
$ git fetch origin
$ git checkout main && git pull --ff-only origin main          # already up to date
$ git checkout -b audit/direction-b-e2e-verification
$ git rev-parse HEAD
b64b7b389273ed3add0adda732b18dc99ab96b54
```

The audit branch is local-only at the time of this report. PR open step is at the end.

---

## 3. Inspection target 1 — Import Wizard

**File:** `client/src/components/CatalogImportWizard.tsx` (1,575 lines)

### Methods declared

| Method | enabled | Step-2 wiring | Backend call |
|---|---:|---|---|
| `api_discovery` | true | full UI: website discover + manual entry + provider select | `catalogManage.discoverProvider`, `catalogImport.discoverFromApi`, `catalogImport.bulkCreate`, `catalogManage.submitFromDiscovery` |
| `file_upload` | true | full UI: drag/drop + parse + preview + runtime defaults | `catalogImport.parseFileUpload`, `catalogImport.getPreview`, `catalogImport.bulkCreate` |
| **`agent_studio`** | **true** | **stub message only** (lines 951–970) | **NONE** — TODO at lines 971–975 |
| `registry_sync` | false | "Coming Soon" badge | none |
| `openapi_spec` | false | "Coming Soon" badge | none |

### Agent Studio branch — current state

```tsx
// CatalogImportWizard.tsx:951–970
{step === 2 && method === "agent_studio" && (
  <div className="space-y-4 py-4">
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 font-medium text-sm">
        <Bot className="h-4 w-4" />
        Agent Studio candidates
      </div>
      <p className="text-xs text-muted-foreground break-words">
        Eligible Agent Studio agents will appear here once
        {" "}
        <code>aiTypes.catalog.register</code> is wired to an Agent
        Studio public candidate-list action via the Module Gateway.
      </p>
      <p className="text-xs text-muted-foreground break-words">
        This option will only show real Agent Studio export candidates
        — no mock or placeholder entries are ever rendered as real.
      </p>
    </div>
  </div>
)}
{/* TODO: Wire Import from Agent Studio to aiTypes.catalog.register
    and an Agent Studio public candidate-list action exposed through
    the Module Gateway. Until then the option is selectable but the
    Step 2 panel intentionally shows an honest pending-integration
    message instead of fake data. */}
```

**Conclusion:** Confirmed B-D3. Selectable, honest stub, no backend call. The honest empty-state design is correct (no fake candidates rendered as real), but the wizard cannot actually import an Agent Studio candidate today.

---

## 4. Inspection target 2 — AI Types pages

### Capsule pages (`client/src/modules/ai-types/pages/`)

```
AITypesControlPanelPage.tsx
AITypesGovernancePage.tsx
AITypesOverviewPage.tsx
AITypesPage.tsx
AITypesRelationshipsPage.tsx
AITypesShell.tsx
AITypesTaxonomyPage.tsx
AITypesValidationPage.tsx
```

No file in the capsule contains `sourceModule` / `agentStudio` / `legacy_imported` / `reconcile` / `Sync status` / `CandidatePage` references.

### Top-level pages still at `client/src/pages/`

```
ASCandidatePage.tsx       — 6 lines, thin wrapper
CandidatePage.tsx         — 4,680 lines, generic candidate pipeline
CatalogAgentChat.tsx
CatalogManagePage.tsx     — 1,886 lines, manage catalogue surface
LLMCataloguePage.tsx
WSCatalogPage.tsx
```

### `ASCandidatePage.tsx` — full source

```tsx
import CandidatePage from "@/pages/CandidatePage";

export default function ASCandidatePage() {
  return <CandidatePage mode="agentStudio" />;
}
```

### `CandidatePage.tsx` — agentStudio-mode behavior

- **Lines 200–212** — TODO comment + degraded filter:
  > Replace the entryType-only filter with a server-side `aiTypes.catalog.asCandidates` query that also filters by `sourceModule === "agentStudio"`. The catalog_entries schema currently exposes `sourceType`/`sourceId` but no `sourceModule` field, so Agent Studio agents are not distinguishable from other agent entries in the API yet.
- **Lines 887–895** — header text differs in agentStudio mode ("AS Candidate Pipeline" vs "Candidate Pipeline").
- **Lines 900–906** — honest banner shown to users:
  > Showing all agent catalog entries. A dedicated Agent Studio source filter is pending backend support (see `aiTypes.catalog.asCandidates` TODO in code).
- **Lines 908–916** — Tabs: `catalog` (Register), `validation` (Validate), `publishing` (Publish), `audit` (Audit), `discovery-ops` (Discovery). **No Reconcile tab** in any mode.

### Schema reality check

The TODO comment's claim that "the catalog_entries schema currently exposes `sourceType/sourceId` but no `sourceModule` field" is **accurate for the column name** but misleading for the contract — `sourceType="ags_agent"` IS the canonical Agent Studio identifier in `catalog_entries` (Phase 23). `server/ai-types/legacy-import.ts:141` uses exactly that filter (`row.sourceType === "ags_agent"`) for legacy classification. So a source-aware filter IS implementable today; what's missing is the dedicated server query (`aiTypes.catalog.asCandidates`) that joins it with sync status and Export Catalog candidates.

**Conclusion:** Confirmed B-D2. The `ASCandidatePage` route exists, but the page is degraded — shows generic agent entries with an honest "pending backend support" banner. No Reconcile target exists.

---

## 5. Inspection target 3 — Route ownership

### Routes mounted in `client/src/App.tsx`

| Path | Component | Source file |
|---|---|---|
| `/llm/catalogue` | `LLMShellPage` (lazy) | `client/src/pages/LLMCataloguePage.tsx` (probable host) |
| `/llm/catalogue/manage` | `CatalogManagePage` | `client/src/pages/CatalogManagePage.tsx` |
| `/llm/catalogue/candidate` | `CandidatePage` | `client/src/pages/CandidatePage.tsx` (mode default) |
| `/llm/catalogue/as-candidates` | `ASCandidatePage` | `client/src/pages/ASCandidatePage.tsx` (→ `CandidatePage mode="agentStudio"`) |

### Cross-references in `CatalogManagePage.tsx`

- Line 792 — header click navigates to `/llm/catalogue`
- Line 814 — "Candidate" button navigates to `/llm/catalogue/candidate`
- Line 821 — "AS Candidates" button navigates to `/llm/catalogue/as-candidates`
- Line 880 — additional navigate target

**Conclusion:** Routes are wired and present. The pages live at `client/src/pages/` (legacy location, not the AI Types capsule). Capsule migration of these specific pages is out of Direction B scope.

`pnpm run check:frontend-modularity` exits 0 — no failures, 0 baseline warnings.

---

## 6. Inspection target 4 — Backend Direction B

### Agent Studio Export Catalog gateway actions (`server/agent-studio/manifest.ts:103–144`)

| Action | Risk | Receipt | Status |
|---|---|---|---|
| `agentStudio.exportCatalog.listCandidates` | low | no | declared + handler bound |
| `agentStudio.exportCatalog.getCandidate` | low | no | declared + handler bound |
| `agentStudio.exportCatalog.exportCandidate` | medium | **yes** | declared + handler bound; this is the primary action that internally calls `aiTypes.catalog.register` |
| `agentStudio.exportCatalog.markImported` | low | no | declared + handler bound |
| `agentStudio.exportCatalog.reconcileImports` | high | **yes** | declared + handler bound (legacy_imported_unresolved override) |
| `agentStudio.exportCatalog.reconcileSync` | medium | **yes** | declared + handler bound (Phase 41 bulk drift repair) |

Exact action names match the brief verbatim — none of the prior-roadmap incorrect names (`list`, `markCandidate`, `markCandidateImported`) appear in the manifest.

### AI Types backend (`server/ai-types/import-from-agent-studio.ts`)

| Function | Body | Notes |
|---|---|---|
| `listImportableAgentStudioCandidates` | `gatewayCall(actionKey: "agentStudio.exportCatalog.listCandidates")` | Returns opaque DTOs; defaults to `status: "ready"` |
| `importAgentStudioCandidate` | `gatewayCall(actionKey: "agentStudio.exportCatalog.exportCandidate")` | Stub receipt id `aitypes-import-<agentId>-<ts>` if caller doesn't supply one |

Both functions use `gatewayCall` only. **No direct import from `server/agent-studio/*`**. Module-gateway boundary is intact.

### `aiTypes.catalog.register`

`server/ai-types/register.ts:33` imports `publishEvent`. The function emits `aiTypes.catalog.registered` after a successful create OR update (line 273). Dedup uses `(entryType, sourceType, sourceId)` per the catalog schema's `sourceIdx` (`drizzle/tables/catalog.ts:99`); Agent Studio agents come in as `sourceType="ags_agent"` + `sourceId=<agent_id>`. Phase 24's `legacyImportState` column gates legacy rows.

### Test coverage (post-Phase 44 attestation)

- `server/ai-types/register.test.ts` — Phase 39 emit tests (lines 220, 253) confirm `aiTypes.catalog.registered` emit on create + update
- `server/ai-types/import-from-agent-studio.test.ts` — Phase 36 list + import tests
- `server/ai-types/legacy-import.test.ts` — Phase 24 classifier tests
- `server/agent-studio/services/export-catalog.test.ts` — Phase 30 export catalog + Phase 41 reconcileSync tests
- `server/agent-studio/services/catalog-sync-subscribers.test.ts` — Phase 40 subscriber tests
- `tests/pmb/wiring.test.ts` — 13/13 wiring assertions pass

**Conclusion:** Backend chain is complete, named correctly, and covered by tests.

---

## 7. Inspection target 5 — Catalog event emitter/subscriber inventory

### Event payload contracts

`server/ai-types/events.ts` declares all three:
- `CatalogRegisteredPayload` (lines 65–83)
- `CatalogPublishedPayload` (lines 94–106)
- `CatalogDeprecatedPayload` (lines 109–119)

### Emitters

| Event | Emit call site | Status |
|---|---|---|
| `aiTypes.catalog.registered` | `server/ai-types/register.ts:273` (`await publishEvent(...)`) | **wired** |
| `aiTypes.catalog.published` | none | **MISSING** |
| `aiTypes.catalog.deprecated` | none | **MISSING** |

The events.ts header comment at lines 88–92 confirms this gap explicitly:
> Phase 39 only emitted `registered`. The `published`/`deprecated` events are declared but not yet emitted from the publishing service; defining the payload here gives downstream subscribers (Agent Studio, Provider Connections) a typed contract to bind against ahead of the producer being wired in a follow-up phase.

### Subscribers (`server/agent-studio/boot.ts`)

| Event | Subscribe call | Handler |
|---|---|---|
| `aiTypes.catalog.registered` | line 538 | `processCatalogSyncEvent` |
| `aiTypes.catalog.published` | line 549 | `processCatalogSyncEvent` |
| `aiTypes.catalog.deprecated` | line 556 | `processCatalogSyncEvent` |

Subscribers exist for all three events. The subscriber for `published`/`deprecated` will never fire because no producer publishes them.

### Sync log + reconcile

- `drizzle/tables/agent-studio.ts:1310–1340` declares `ags_catalog_sync_log` with `sourceModule`, `sourceRefId`, `eventType`, `payload`, `processedAt`. Index on `sourceRefId`.
- `server/agent-studio/services/catalog-sync-subscribers.ts` exports `processCatalogSyncEvent`.
- `server/agent-studio/services/export-catalog.ts:473–498` — `reconcileExportCatalogSync` writes synthetic sync rows for missing events (Phase 41 drift repair).
- Action `agentStudio.exportCatalog.reconcileSync` declared at manifest line 138, risk medium, receipt required.

### Publish/deprecate transition discovery (B2 prerequisite)

| Transition | Formal function | Status flip | Audit event written | Platform event emitted |
|---|---|---|---|---|
| Publish | **`publishCatalogEntry`** (`server/ai-types/publishing.ts:44–106`) | `status → "published"` | `catalog.publish` audit row | **NO** |
| Deprecate | **none** — only generic `updateCatalogEntry({status: "deprecated"})` via `catalog-manage.ts:155` mutate-status endpoint | `status → "deprecated"` | none specific | **NO** |

`publishCatalogEntry` exists as a clean module-owned function ready to host the emitter. Deprecate has **no formal transition** — only a generic status mutate.

**Conclusion:** B-D1 confirmed. Decision: **B2 must split** into B2a (decision doc defining the deprecate transition) + B2b (emitter implementation). Publish has a transition target; deprecate does not.

---

## 8. Inspection target 6 — Legacy importToCatalog status

### Procedures with `warnLegacyImportToCatalog` (Phase 47 markers)

```
server/routers/agents.ts:575    importToCatalog: governedProcedure
server/routers/bots.ts:231      importToCatalog: governedProcedure
server/routers/llm.ts:434       importToCatalog: governedProcedure
server/routers/models.ts:225    importToCatalog: governedProcedure
```

**4 procedures, not the 5 the brief mentions.** The action-key-map at `server/governance/action-key-map.ts:46–235` lists 5 keys (agents, bots, llm, models, **providers**) but `server/routers/providers.ts` does not actually export an `importToCatalog` procedure. This is a stale map entry, not a missing procedure.

`server/governance/legacy-import-to-catalog-deprecation.ts` exports `warnLegacyImportToCatalog` (Phase 47), which is called from each of the 4 procedures.

### Active-caller list

Not produced as a separate doc. `tests/pmb/runtime-coverage.test.ts:93–96` references `legacy-import.test.ts` for "duplicate prevention," but a top-down enumeration of frontend callers of the 4 deprecated procedures has not been written.

### Phase 26.1 status

No `Phase 26.1` doc under `docs/architecture/provider-model-binding/`; tracked only as a follow-up note in memory and PR descriptions. The `LEGACY_PATH_DEPRECATION.md` doc at the same path (Phase 47 ship companion) covers the deprecation but not the migration.

**Conclusion:** Phase 47 deprecation markers are in place. Phase 26.1 caller migration is open and undocumented as a formal scoped doc. **No active Direction B flow currently depends on the legacy `*.importToCatalog` procedures** — the new path is `aiTypes.catalog.register` via Module Gateway, called from `agentStudio.exportCatalog.exportCandidate`'s handler. So Direction B can PASS without Phase 26.1 closing.

---

## 9. Validation commands and exit codes

| Command | Exit | Notes |
|---|---:|---|
| `pnpm run check` (tsc) | 0 | clean |
| `pnpm run check:architecture` | 0 | 0 failures, 27 baseline warnings (pre-existing LA-02 — AI Types public-API leakers, unchanged from prior audits) |
| `pnpm run check:wiring` | 0 | 16 modules tracked, 0 findings |
| `pnpm run check:frontend-modularity` | 0 | 0 failures, 0 baseline warnings |
| `pnpm run build` | 0 | client + server bundle (73s) |
| `pnpm exec vitest run tests/pmb/` | 0 | **61/61 pass** (boundary 15/15 + wiring 13/13 + runtime-coverage 33/33) |

---

## 10. Defects found

### B-D1 — `aiTypes.catalog.published` and `aiTypes.catalog.deprecated` emitters missing

- **Severity:** medium (subscribers will never fire)
- **Location:** `server/ai-types/publishing.ts:44–106` (publish target), `server/routers/catalog-manage.ts:155` mutate-status endpoint (deprecate fallback target)
- **Required fix:** PR B2 — see decision in §11.

### B-D2 — AS Candidate Pipeline UI is not source-aware

- **Severity:** medium (UI shows generic agent entries with honest banner — not misleading, but degraded)
- **Location:** `client/src/pages/CandidatePage.tsx:200–212` (filter degradation), `:900–906` (banner)
- **Required fix:** PR B3 Part A — needs an `aiTypes.catalog.asCandidates` server query (filtering by `sourceType="ags_agent"`, joining with `legacyImportState` + sync log + Export Catalog candidates), then a source-aware page.

### B-D3 — Import Wizard "Import from Agent Studio" branch is a stub

- **Severity:** medium (selectable but no backend call)
- **Location:** `client/src/components/CatalogImportWizard.tsx:951–975`
- **Required fix:** PR B3 Part B — wire Step 2 panel to `listImportableAgentStudioCandidates` (via `trpc.aiTypes.*`); wire Step 3 review + Step 4 confirm to `importAgentStudioCandidate`; add candidate-state UI per the Direction B brief's table.

---

## 11. Required fixes

### B2 conditional split — both halves needed

Discovery (§7) confirms:
- Publish has a formal transition (`publishCatalogEntry` in `publishing.ts`).
- Deprecate has no formal transition — only generic `updateCatalogEntry({status:"deprecated"})`.

Therefore B2 must split into:

- **B2a (decision doc):** create `docs/architecture/ai-types/CATALOG_LIFECYCLE_EVENT_DECISION.md` defining what counts as deprecate (does deprecate get a dedicated `deprecateCatalogEntry` function? Or does the platform event emit from the generic mutate-status endpoint when `status` transitions to `"deprecated"`?), who can trigger it, and what fields change.
- **B2b (emitters):** add `publishEvent("aiTypes.catalog.published", ...)` to `publishCatalogEntry` after the status flip; add `publishEvent("aiTypes.catalog.deprecated", ...)` at whatever transition point the decision doc names. Tests cover emit-on-success, no-emit-on-failure, payload shape, actor semantics.

### B3 — single PR (largest unknown is now answered)

B1 inspection shows:
- `ASCandidatePage` route exists; the page is a thin wrapper.
- No Reconcile target exists anywhere — Direction B brief's Option A (tab inside AS Candidate Pipeline) or Option B (stub page) must be added.
- Wizard's Agent Studio Step-2 panel is a stub — needs the candidate-state table + backend wiring.

**B3 scope:** server-side `aiTypes.catalog.asCandidates` query, source-aware `CandidatePage`-replacement (or `mode="agentStudio"` upgrade) that joins catalog rows with sync log + Export Catalog candidates, Reconcile path, wizard Step-2 wiring through `listImportableAgentStudioCandidates`, wizard Step-3/4 wiring through `importAgentStudioCandidate`, E2E or scripted smoke.

---

## 12. Recommended next PR

**Proceed to PR B2 (split into B2a + B2b).** The decision-doc path is mandatory because deprecate has no formal transition.

---

## 13. Final verdict

**Direction B = PARTIAL.**

- Backend chain: PASS.
- Boundary enforcement: PASS.
- Test coverage: PASS.
- Catalog event symmetry: **FAIL** (published + deprecated emitters missing).
- AS Candidate Pipeline source-aware UI: **PARTIAL** (route + page exist, but data filter is degraded with honest banner).
- Import Wizard Agent Studio branch: **PARTIAL** (option exists with honest stub message, no backend call).

After B2 (events) + B3 (UI) land and B4 reverifies, Direction B can flip PARTIAL → PASS provided the three PASS criteria hold (code shape verified + unit/integration tests cover each link + at least one E2E or scripted runtime trace runs through the chain).
