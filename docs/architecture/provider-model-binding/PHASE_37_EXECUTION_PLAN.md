# Phase 37 — Execution Plan

**Captured:** 2026-05-08 against `main@7ba8e3a` (post-Phase-36 closure).
**Branch (this doc):** `docs/pmb-phase-37-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by the 2026-05-07 standing instruction (continuous phase execution after each closure).

---

## 1. Why Phase 37 exists

Phase 34's closure named the architectural exception **"PMT self-registration identity mismatch"** and proposed a future scope: **"PMB Phase X — register name-based identity for self-registered system agents"** + ADR. **Phase 37 IS that phase.** Closing it makes Plan v3's architectural-exception register reach finalist state — only `catalog-manage-bespoke-publish-machinery` (permanent by design, §36) remains after §37.

After §36 (publish redesign) and §37 (PMT redesign), the standing exception list will be:

- ✅ `publish-flip-to-published-mismatch` — CLOSED §36
- ✅ `PMT self-registration identity mismatch` — CLOSED §37 (this phase)
- 🔒 `catalog-manage-bespoke-publish-machinery` — PERMANENT (no future-phase scope)

That's the clean state Plan v3 has been driving toward.

---

## 2. Pre-flight audit findings

### PMT call sites

```
server/modules/pmt/context-translator-agent.ts
  L23:    import { createCatalogEntry, ... } from "../../ai-types/public-api";
  L28:    AGENT_CATALOG_ID = "ps.agent.context_translator"
  L1145:  existing.find(e => e.name === AGENT_CATALOG_ID)
  L1195:  await createCatalogEntry({ name: AGENT_CATALOG_ID, ... })

server/modules/pmt/idea-builder-agent.ts
  L19:    import { createCatalogEntry, ... } from "../../ai-types/public-api";
  L24:    AGENT_CATALOG_ID = "pm.agent.idea_to_pmi_builder"
  L606:   existing.find(e => e.name === AGENT_CATALOG_ID)
  L627:   await createCatalogEntry({ name: AGENT_CATALOG_ID, ... })
```

Both PMT agents:
- Identify themselves by **name** (`AGENT_CATALOG_ID` constant) — no domain table row, no numeric `sourceId`
- Use a "find-or-update" pre-flight: lookup by name → if exists, patch runtime config; if not, create
- Set `entryType: "agent"`, `origin: "system"`, `status: "active"`, `reviewState: "approved"` directly
- Currently use direct `createCatalogEntry` (intra-platform; boundary-lint compliant; documented as architectural exception in §34)

### Register's current input contract (Phase 25 sealed-identity invariant)

```ts
export interface RegisterCatalogEntryInput {
  entryType: string;
  sourceType: string;
  sourceId: number;          // ← required, numeric — Phase 25 invariant
  fields: Omit<InsertCatalogEntry, "entryType" | "sourceType" | "sourceId">;
  registeredBy: number;
  // ...
}
```

The duplicate guard uses `(sourceType, sourceId)` as the composite key for legacy-import detection. PMT agents have no numeric `sourceId` — that's the §34 mismatch.

### Three options, one decision

| Option | Description | Why rejected/picked |
|---|---|---|
| **(1)** Extend register input: `sourceId` optional + `sourceName?: string` for self-registered cases; "exactly one of" validation; duplicate guard dispatches by sourceName when present | Single canonical write path; existing numeric-ID callers unchanged; "exactly one" pattern is well-understood | **PICKED.** Best balance of minimalism + invariant preservation. |
| (2) Separate canonical action `aiTypes.catalog.registerSystemAgent` for self-registered agents; mandatory `sourceName`; different duplicate guard | Preserves Phase 25 numeric-ID invariant strictly; clean separation | Rejected. Two canonical actions for catalog writes inflates manifest surface and forces caller-side branching ("do I have a domain row? choose action accordingly") that the manifest doesn't otherwise require. |
| (3) Synthetic-identity sentinel: `sourceId: 0` + `sourceType: "self_registered"` + duplicate guard branches on sourceType | Reuses existing input shape | Rejected. **Synthetic-identity anti-pattern** explicitly called out in §34 lesson #3 + §35 lesson #3. |

Phase 25 sealed-identity invariant after redesign: **"every register call must have a source-of-record (numeric `sourceId` for domain-backed entries, `sourceName` string for self-registered system agents); the duplicate guard uses whichever is present."** Strictly weaker than the original, but explicit.

### Backwards compatibility

All existing numeric-ID callers (Phase 32: 5 importToCatalog procedures; Phase 34: sandbox-wf seed) continue to work unchanged. Their `sourceId: number` calls remain valid; no caller-side migration needed for the numeric path. Only PMT migrates (the new name-path).

### Duplicate guard adaptation

`checkDuplicateLegacyImport(db, { sourceType, sourceId })` becomes `checkDuplicateLegacyImport(db, { sourceType, sourceId?, sourceName? })`. When `sourceName` is provided:

- Skip legacy-import check (legacy imports always had numeric IDs from domain tables; self-registered agents have no legacy)
- Look up existing modern row by `(sourceType, name === sourceName)` — modern row update path or no-existing-row path
- **Cannot return `would_duplicate_legacy`** for the name path (no legacy by definition)

This narrows the guard's possible outcomes for the name path to two: `modern_row_update_path` or `no_existing_row`. Simpler than the numeric path's three outcomes.

### Test surface

- `server/ai-types/register.test.ts` (if it exists; otherwise `register-action.test.ts`) — exercises duplicate guard outcomes for numeric path. Will need new tests covering the name path.
- `server/ai-types/legacy-import.test.ts` — exercises `checkDuplicateLegacyImport`. Needs new tests for the name path (skipping legacy check, name-based modern-row lookup).
- `tests/pmb/wiring.test.ts` — exercises action manifest. No change needed (action key unchanged).

### catalog-manage interaction

catalog-manage's permanent exception (`catalog-manage-bespoke-publish-machinery`, §36) is unrelated to register. catalog-manage **does** call `createCatalogEntry` directly in some paths (e.g., the `syncProviders` procedure); those are unchanged because they have numeric `sourceId` from provider rows.

---

## 3. Sub-phase decomposition

### 37.0 — Plan freeze + ADR (this PR)

- [ ] Land `PHASE_37_EXECUTION_PLAN.md` (this doc).
- [ ] Land `docs/architecture/ai-types/PMT_NAME_BASED_IDENTITY.md` ADR co-merged at plan-freeze time (§36 closure-shape baseline).
- [ ] Memory: create `project_phase_37_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** docs land; CI 5/5 green.

### 37.1 — Extend register input + duplicate guard

Single PR. Two coupled changes:

- [ ] **Extend `RegisterCatalogEntryInput`** in `server/ai-types/register.ts`:
  - `sourceId: number` → `sourceId?: number`
  - Add `sourceName?: string`
  - Add JSDoc explaining "exactly one of `sourceId`/`sourceName`"
  - Throw at the top of `registerCatalogEntry` when neither or both are provided.
- [ ] **Extend duplicate guard** in `server/ai-types/legacy-import.ts`:
  - `checkDuplicateLegacyImport({ sourceType, sourceId })` → `checkDuplicateLegacyImport({ sourceType, sourceId?, sourceName? })`
  - When `sourceName` is provided: skip legacy-import lookup; check modern row by `(sourceType, name === sourceName)`; return `modern_row_update_path` or `no_existing_row`.
  - When `sourceId` is provided: existing behavior unchanged.
  - Throw at top if neither provided (defensive; should never reach here after the §37.1 input validation).
- [ ] **Update event payload helper**: `CatalogRegisteredPayload.sourceRefId` accepts both numeric (sourceId) and string (sourceName); document in JSDoc.
- [ ] **Add tests** in `legacy-import.test.ts` (or equivalent): name-path exercise of the guard (modern row found, modern row not found, both/neither inputs).
- [ ] **Add tests** in `register.test.ts` (or `register-action.test.ts`): name-path exercise of `registerCatalogEntry` (created action, updated action, validation errors).
- [ ] **Acceptance:** `tsc --noEmit` clean; existing numeric-path tests continue to pass; new name-path tests pass; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~50 LOC code, ~80 LOC tests.
- [ ] **Pause if:** the duplicate guard's existing semantics turn out to depend on `sourceId` in a way that doesn't generalize (unlikely after audit but flag if found).

### 37.2 — Migrate PMT context-translator-agent.ts

Single PR. Replace `createCatalogEntry({ name: AGENT_CATALOG_ID, ... })` at `context-translator-agent.ts:1195` with `gatewayCall("aiTypes.catalog.register", { sourceType: "self_registered_agent", sourceName: AGENT_CATALOG_ID, ... })`:

- [ ] Replace direct `createCatalogEntry` call with `gatewayCall<RegisterCatalogEntryInput, RegisterCatalogEntryResult>({...})`.
- [ ] Receipt: `pmt-context-translator-bootstrap-${AGENT_CATALOG_ID}-${Date.now()}` — system-actor pattern.
- [ ] Keep the find-or-update pre-flight (idempotency invariant) — register's name-path handles the "modern row exists" case via `action: "updated"`, but the existing pre-flight is more granular (patches runtime config drift). Decide caller-side: keep the pre-flight; only call register when no row exists; treat register's `action: "updated"` return as a no-op if it does fire.
- [ ] **Drop** the redundant `createCatalogAuditEvent({ eventType: "agent_registered" })` call (zero consumers per §34 audit).
- [ ] **Keep** `setEntryClassifications(entry.id, nodeIds)` call AFTER register — real-taxonomy classifications, intra-platform write, public-api permits this.
- [ ] **Acceptance:** `context-translator-agent.ts` no longer calls `createCatalogEntry` directly; `tsc --noEmit` clean; existing tests pass; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~80 LOC removed, ~50 LOC added (~30 LOC net removal).

### 37.3 — Migrate PMT idea-builder-agent.ts

Same shape as §37.2 for `idea-builder-agent.ts:627`. Single PR.

- [ ] Replace direct `createCatalogEntry` call with `gatewayCall("aiTypes.catalog.register", { sourceType: "self_registered_agent", sourceName: AGENT_CATALOG_ID, ... })`.
- [ ] Receipt: `pmt-idea-builder-bootstrap-${AGENT_CATALOG_ID}-${Date.now()}`.
- [ ] Same find-or-update pre-flight + audit-event-drop + setEntryClassifications-keep pattern.
- [ ] **Acceptance:** `idea-builder-agent.ts` no longer calls `createCatalogEntry` directly; `tsc --noEmit` clean; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~80 LOC removed, ~50 LOC added (~30 LOC net removal).

### 37.4 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_37_CLOSURE_REPORT.md`.
- [ ] Update memory: `project_phase_37_authority.md` → CLOSED; `project_pmb_phase_37_complete.md` created with PR ledger + carry-forward lessons; `MEMORY.md` index update; RAC-progress head SHA bump.
- [ ] **Acceptance:** all 5 PRs merged; CI fingerprint stable; "PMT self-registration identity mismatch" exception marked CLOSED in the architectural-exception register.
- [ ] **Estimate:** 1 PR, ~150 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.**

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Extend register input vs separate canonical action vs synthetic identity | **Extend (Option 1)** — single canonical write path; existing numeric-ID callers unchanged | 37.1 + ADR | Low (validated by callsite audit) |
| 2 | Phase 25 sealed-identity invariant | **Weakened to "exactly one of sourceId or sourceName, dispatcher uses whichever is present"** — explicit, documented in ADR | 37.0 ADR | Low |
| 3 | Duplicate guard for name-path | **Skip legacy lookup; check modern row by `(sourceType, name === sourceName)`** | 37.1 | Low |
| 4 | `sourceType` value for self-registered PMT agents | **`"self_registered_agent"`** — explicit type marker; future system agents can reuse | 37.2 + 37.3 | Low |
| 5 | PMT find-or-update pre-flight | **Keep** — idempotency invariant beyond what register provides; pattern from §32 | 37.2 + 37.3 | Low |
| 6 | PMT audit event `agent_registered` | **Drop** — zero consumers per §34 audit; canonical's `aiTypes.catalog.registered` event replaces | 37.2 + 37.3 | Low |
| 7 | PMT `setEntryClassifications` | **Keep AFTER register** — real-taxonomy classifications, intra-platform write | 37.2 + 37.3 | Low |
| 8 | Receipt sourcing for PMT | **`pmt-<agent-key>-bootstrap-<AGENT_CATALOG_ID>-${Date.now()}`** — system-actor pattern from §34.1/§36.2 | 37.2 + 37.3 | Low |
| 9 | ADR placement | **`docs/architecture/ai-types/PMT_NAME_BASED_IDENTITY.md`** | 37.0 | Low |

---

## 5. Test strategy

- **37.0:** docs only.
- **37.1:** unit tests for `checkDuplicateLegacyImport` name-path; unit tests for `registerCatalogEntry` name-path; existing numeric-path tests unchanged (regression guard).
- **37.2 + 37.3:** PMT agents have integration coverage; `tsc --noEmit` clean.
- **37.4:** docs only.

**CI fingerprint:** Phase 37 baseline is **5/5 green** at `7ba8e3a`. No matrix-shape changes.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 37.0 (this) | 1 | — | ~250 plan + ~150 ADR |
| 37.1 (canonical extension) | 1 | +50 -10 net | +80 tests |
| 37.2 (context-translator) | 1 | -30 net | ~5 |
| 37.3 (idea-builder) | 1 | -30 net | ~5 |
| 37.4 (closure) | 1 | — | ~150 |
| **Total** | **5** | **-20 net code, +80 tests** | **~560** |

Larger than §36 (4 PRs) due to two PMT agents migrated separately; same shape as Phase 32 (3 PRs around register) and Phase 34 (3 PRs).

---

## 7. CI fingerprint expectation

Phase 37 baseline is **5/5 green** as of `7ba8e3a` (post-Phase-36 close-out). No changes expected.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan. Phase 37 is the fourth phase under the **continuous-execution standing instruction**. Picked autonomously after Phase 36 closed at `7ba8e3a`.

**Surface of my reasoning in the kickoff:** §36 closure literally tagged "Phase 37 candidate" for this. PMT is the larger of the two named architectural exceptions (publish was smaller, picked first); after §37 closes PMT, Plan v3's architectural-exception register reaches finalist state (only `catalog-manage-bespoke-publish-machinery` permanent remains). The §36 closure-shape baseline (ADR co-merged at plan freeze) is reused.

**Pause and surface for sign-off if:**

1. The duplicate guard's existing numeric-path semantics turn out to depend on `sourceId` in a way that doesn't generalize cleanly to the name-path (audit suggests it doesn't, but flag if found).
2. PMT agents have a hidden caller (beyond the two `ensureXRegistered` functions) that does direct catalog interaction — would expand scope.
3. The find-or-update pre-flight in PMT turns out to require a register-level idempotency feature that doesn't exist (e.g., "skip update if no fields changed") — could prompt a register contract refinement.
4. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
