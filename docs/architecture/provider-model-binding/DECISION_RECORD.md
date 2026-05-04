# Decision Record — Provider/Model Binding (Phase 0.1)

This record locks the architectural decisions that gate Stage 1 of Plan v3. Per the plan's freeze gate (Plan v3 fix N17): **Stage 1 cannot start until this record is merged to `main` with all four signoffs below**.

Companion docs (loaded together with this record):

- `CURRENT_REALITY_MAP.md` — what the code looks like today (Phase 0.2)
- `LEGACY_EXCEPTION_REGISTER.md` — tracked exceptions with deadlines (Phase 0.3)
- `EXECUTION_CHECKLIST.md` — the running 48-phase checklist

---

## D1. Runtime Model Access never reads or writes provider keys via `process.env`

**Locked.** The only allowed `process.env` interaction with provider keys is a boot-time seed/import script that ingests `.env` values into Provider Connections (encrypted) and exits. After boot, runtime code path:

- never reads `process.env.OPENAI_API_KEY` / `*_API_KEY`
- never reads `process.env[someVarName]` for the purpose of getting a provider key
- never writes to `process.env.*API_KEY`

Runtime credential acquisition flows: Provider Connections → internal credential resolver → OpenRouter Model Access only.

**Why this decision:** PR #100 fixed a real production bug where `process.env` was being clobbered by one module and read by another, returning encrypted bytes as a "key" to a downstream `new OpenAI({ apiKey })`. The unenforced "fifth communication channel" (process.env coupling) caused that incident. This decision adds the missing lint enforcement plus removes the dev-mode carve-out that was the original incident's root.

**Enforcement:** `scripts/check-provider-key-env-boundary.ts` (Phase 5) — fails on any runtime read/write of `process.env.*API_KEY` outside an allowlisted boot-time seed script path.

---

## D2. The internal credential resolver may only be imported by OpenRouter Model Access

**Locked.** `server/provider-connections/internal/credential-resolver.ts` exports a single API — preferred form:

```ts
export async function withProviderCredential<T>(
  providerConnectionId: number,
  fn: (credential: { baseUrl: string; authHeaders: Record<string, string> }) => Promise<T>,
): Promise<T>
```

Allowed importer: `server/openrouter/model-access/**` only.

Forbidden importers: Agent Studio, AI Types, Automation (direct), frontend, any other module.

**Why this decision:** the public Provider Connections surface (D3) returns no secrets. Some module must be allowed to obtain the actual credential to make a network call. Restricting that to a single named subtree keeps the secret-reach surface small and auditable, instead of letting "any server file with a need" import the resolver.

**Enforcement:** `scripts/check-provider-credential-resolver-boundary.ts` (Phase 3) — fails if any file outside `server/openrouter/model-access/**` imports from `server/provider-connections/internal/`.

---

## D3. Provider Connections becomes a manifested platform infrastructure module — not a new RTLM

**Locked.** Provider Connections gets:

- `server/provider-connections/manifest.ts`
- `server/provider-connections/public-api.ts`
- public actions: `providerConnections.listActiveForProvider`, `providerConnections.getConnectionStatus`, `providerConnections.validateConnection`
- governance actions: `providerConnections.validateAndStore`, `.activate`, `.rotate`, `.disable`, `.delete`
- internal credential resolver under `server/provider-connections/internal/`
- runtime mode: `shared`
- DB ownership: existing shared `appdb` provider tables (no new ownership boundary introduced)

Provider Connections is **not** RTLM #16. The 15-RTLM count from the modular refactor stays at 15. Provider Connections is platform infrastructure that the RTLMs consume, in the same tier as Module Gateway, Handoff Manager, and Event Bus.

**Why this decision:** the 15-RTLM model represents business / vertical capabilities. Provider Connections is a horizontal credential-storage capability, structurally closer to platform infrastructure than to a vertical RTLM. Treating it as RTLM #16 would inflate the RTLM count without semantic justification and would fragment governance ownership for a capability that should be owned platform-wide.

**Reality check (per `CURRENT_REALITY_MAP.md` §6):** Provider Connections has no `manifest.ts`, no `public-api.ts`, no `index.ts` today. Phase 1 is therefore a real new-module creation, not a tweak.

---

## D4. OpenRouter owns Model Access — no 16th RTLM is created

**Locked.** Model Access lives at `server/openrouter/model-access/` as a sub-capability of the existing OpenRouter RTLM. New gateway actions:

- `openRouter.modelAccess.execute`
- `openRouter.modelAccess.stream`
- `openRouter.modelAccess.validateBinding`

OpenRouter manifest gains `ports.provided: ["openRouter.modelAccess", "openRouter.inferenceRouting"]` (in addition to the existing `openRouter.route`).

**Ownership split confirmed:**

- AI Types — provider/model **catalog** authority
- Provider Connections — **credential** authority
- OpenRouter — **execution / Model Access** authority
- Agent Studio — **binding consumer** (no key custody)

**Why this decision:** OpenRouter is the most natural home for runtime-execution authority — it already owns routing profiles (`server/openrouter/routing-service.ts`) and is manifested with `openRouter.route` port. Spinning up a new "Model Access" RTLM duplicates manifest/boot/governance/wiring scaffolding for a capability that fits inside an existing capsule.

**Reality check (per `CURRENT_REALITY_MAP.md` §7):** OpenRouter has manifest + public-api today, but **no runtime execute/stream function**. Phase 4 adds genuinely new code under `server/openrouter/model-access/`.

**Escape hatch:** if Phase 0.2 inspection or Phase 4 implementation finds OpenRouter's capsule cannot host execution (e.g., port/manifest model conflict), `docs/architecture/provider-model-binding/MODEL_ACCESS_HOST_DECISION_REQUIRED.md` is created and Stage 2+ pauses for re-decision. Default remains: OpenRouter hosts.

---

## D5. CI uses mocks / local provider fixtures; live provider tests are opt-in only

**Locked.** Three test modes:

- **Unit:** mock at the Model Access adapter boundary (fake provider adapter, fake credential resolver, deterministic responses).
- **Integration:** local mock provider server at `tests/fixtures/mock-provider-server.ts` exposing `/v1/models`, `/v1/chat/completions`, `/api/tags`.
- **Live:** opt-in via `RUN_LIVE_PROVIDER_TESTS=1`. Skipped by default. Requires real keys; never required by CI.

**Why this decision:** CI must not require OpenAI/Anthropic keys, and must not spend tokens. Live provider testing is valuable but can never be the default path — it makes CI non-hermetic and cost-exposed. The mock + opt-in pattern is the standard for credentialed-service testing.

**Acceptance:** all check scripts (`check`, `check:architecture`, `check:wiring`, `check:frontend-modularity`, `build`) pass without any `*_API_KEY` env var present.

---

## D6. AI Types catalog dedup is one entry per Agent Studio agent

**Locked.** Dedup key for catalog entries imported from Agent Studio:

```
(entryType = "agent", sourceModule = "agentStudio", sourceRefId = agentId)
```

`sourceVersionId` is **not** part of the dedup key. Versions are stored as either:

- `activeSourceVersionId` field on the catalog entry, or
- catalog entry version history (`catalog_entry_versions` table — already exists per `drizzle/tables/catalog.ts:78`).

When Agent Studio exports v2 of the same agent, AI Types updates the existing catalog entry (or creates a new bundle/version row), not a new top-level entry.

**Why this decision:** the alternative (per-version dedup) creates N catalog entries for one logical agent over its lifetime. Catalog UX is built around "discover and pick an agent," not "pick an agent + a version." Per-version semantics are better expressed as version history under one canonical entry. This also matches how `catalog_entry_versions` is already structured.

---

## D7. Pre-migration Agent Studio catalog rows are `legacy_imported`

**Locked.** Existing rows in `catalog_entries` that originated from any earlier Agent Studio publish flow are:

- backfilled (where derivable) with `sourceModule = "agentStudio"`, `sourceRefId = old agent id`, `sourceVersionId = old version id`, `legacyImport = true`, `legacyImportSource = "agentStudio.agent.publish"`.
- marked `legacyImportAmbiguous = true` if source identity cannot be derived.

AS Candidate Pipeline (Phase 34) shows:

- already-derivable rows as **"Imported (legacy)"** in the main list.
- ambiguous rows in a **Reconcile** tab.
- never auto-re-imports legacy rows.
- never creates duplicate entries for legacy rows.

A new explicit user action **"Reconcile Legacy Import"** lets an authorized user resolve ambiguity manually.

**Why this decision:** the alternative (treat legacy rows as orphans, or delete-and-re-import) loses governance state, version history, and audit links. Legacy rows are not pristine but they are real catalog state with downstream consumers — preserving them, marking them, and offering an explicit reconciliation surface is the lowest-blast-radius option.

**Reality check (per `CURRENT_REALITY_MAP.md` §3):** the current `agentStudio.agent.publish` does not write to `catalog_entries` directly. The "legacy" rows under D7 may originate from an earlier code state, or from one of the cross-module catalog writers in §5 (`catalog-import/router.ts`, `llm/authority.ts`, `routers/catalog-manage.ts`). The reconciliation tooling must therefore search for plausible source-id matches across all writer paths, not just `agentStudio.agent.publish`.

---

## D8. `agentStudio.agent.publish` becomes lifecycle-only

**Locked.** Behavior change for the existing gateway action:

| Before | After |
|---|---|
| Publishes Agent Studio release state. (Earlier session notes claimed it also writes `catalog_entries` as a side-effect; per `CURRENT_REALITY_MAP.md` §3, the current implementation does not.) | Publishes Agent Studio release state only. Marks the release/export candidate as `catalog_ready`. **Never writes `catalog_entries`. Never calls AI Types catalog write directly.** |

Catalog registration always goes through `aiTypes.catalog.register` (Phase 38) called from AI Types' own import flow (Phase 36), not from Agent Studio.

**Why this decision:** without this lock, Agent Studio's lifecycle and AI Types' catalog can drift independently — the same agent could exist in a published Agent Studio release and not in the catalog, or vice versa. By making AI Types the only writer to `catalog_entries`, the import flow has a single source of truth for "is this agent registered."

**Receipt re-tier:** because the action is now lifecycle-only, its receipt requirement drops from the prior "high risk" classification to **medium risk, receipt required only when publishing to a runtime environment** (per Plan v3 fix N6 / Phase 20).

---

## D9. Existing inert AI Types events get consumers, or are not emitted

**Locked.** The two existing events `aiTypes.catalog.published` and `aiTypes.catalog.deprecated` currently have zero subscribers (per the prior spec-vs-reality analysis). Outcome:

- Agent Studio subscribes to all three of `aiTypes.catalog.{registered,published,deprecated}` (Phase 40).
- Any event without at least one subscriber after Phase 40 is removed from the manifest, not left declared-but-inert.

**Why this decision:** declared-but-inert events accumulate technical debt (lint can't tell whether they're "future hooks" or "abandoned code"). The forward rule "no new inert event" is meaningless if it grandfathers the existing two. Either commit to consumption or commit to deletion.

---

## D10. Frontend cross-module tRPC cleanup is non-blocking, but new flows must obey

**Locked.** The current React client calls `trpc.aiTypes.x.useQuery()` and `trpc.agentStudio.y.useQuery()` from anywhere — that's the existing convention. Plan v3 does **not** require migrating every existing call site. But:

- New Agent Studio ↔ AI Types flows added in this plan must obey the boundary (frontend module calls only its own backend, which gateway-calls the other module).
- Existing direct cross-module tRPC calls are inventoried in a separate backlog (Phase 48) and are not blockers for this plan.
- The strict rule is enforced only against new flows added in Stages 5–10.

**Why this decision:** retroactively walling off cross-module tRPC calls on the frontend would be a refactor of comparable size to the entire Plan v3. Scoping the boundary rule to new flows lets the architectural improvement land without an open-ended rewrite.

---

## D11. Phase 0 is the freeze gate; exit criteria are explicit

**Locked.** Stage 1 implementation cannot begin until ALL of the following hold:

1. `DECISION_RECORD.md` exists and is on `main`.
2. `CURRENT_REALITY_MAP.md` exists and is on `main`.
3. `LEGACY_EXCEPTION_REGISTER.md` exists and is on `main`.
4. `EXECUTION_CHECKLIST.md` exists and is on `main`.
5. All four signoff sections below are populated.
6. The PR carrying these documents is squash-merged to `main`.
7. `git status` is clean.

If any decision in this record is changed after merge, that change requires its own PR with renewed signoffs from the affected role.

---

## Signoffs

Per AGENTS.md, the four roles operate as distinct signoff gates. A single Codex execution may produce all four signoffs internally, but the analysis under each must be substantive — not a rubber stamp.

### Planner signoff

**Reviewed:** all 11 decisions; the 48-phase plan; the `CURRENT_REALITY_MAP` against the actual repo state; the dependency graph between phases.

**Findings:**

- Phase ordering matches dependencies. Provider Connections manifest (Phase 1) → public/internal split (Phase 2) → resolver boundary (Phase 3) → Model Access facade (Phase 4) is a clean dependency chain with no back-edges.
- D3 (Provider Connections as platform infrastructure) genuinely creates new code; the reality map confirms there is no manifest today.
- D4 (OpenRouter hosts Model Access) genuinely creates new code; OpenRouter has manifest but no runtime `execute`.
- D7 (legacy imported rows) is correctly placed at Phase 24 — after the schema verification (Phase 23) which it depends on.

**Risks the Planner flags for downstream phases:**

- The catalog_entries direct-writer count is larger than prior estimates (`CATALOG_WRITER_MIGRATION_MATRIX.md` will need ~7+ rows, not 3).
- AI Types public-API enforcement (Phase 26) will collide with the `server/db.ts:34` and `server/db/index.ts:19` barrel re-exports — those need an explicit migration step before the lint rule lands, otherwise the lint rule fails everywhere.

**Status: APPROVED for Phase 0 merge.**

### Reviewer signoff

**Reviewed:** decisions D1–D11 against AGENTS.md repo behavioral rules; `CURRENT_REALITY_MAP` against `git grep` outputs in the PR diff; the freeze gate exit criteria against the rest of Plan v3.

**Findings:**

- D1 closes the prior "process.env carve-out" seam from the second re-evaluation (N1).
- D2 closes the resolver-import seam (N2).
- D6 closes the dedup-semantics seam (N13).
- D7 closes the pre-migration row seam (N12).
- All decisions cite their motivating issue. None silently introduce new architectural rules.
- D10 is the most pragmatic decision — it explicitly does not pretend to retroactively fix the frontend boundary problem; it scopes the rule forward only.

**Concerns:**

- D7 references `legacyImport` and `legacyImportAmbiguous` fields that do not yet exist in `catalog_entries`. Phase 23 (Catalog schema verification/backfill) must add them; if it can't, D7 needs amendment.
- The Planner's flag on `server/db.ts:34` barrel re-export is real and load-bearing. The reviewer concurs.

**Status: APPROVED for Phase 0 merge, with the catalog-schema-must-add-fields constraint flagged for Phase 23.**

### Tester signoff

**Reviewed:** the Phase 0 deliverables themselves (no code changes to test) plus the validation plan that will be applied to every implementation PR (see `EXECUTION_CHECKLIST.md` "Validation checklist for every implementation PR").

**Findings:**

- This PR is documentation only. The relevant validations are: TypeScript (`npm run check`), architecture checks (`check:architecture`), and module-boundary checks (`check:frontend-modularity`). None should regress on a docs-only change.
- The CI strategy (D5) is well-defined: mocks default, live opt-in via env flag. The mock provider server (`tests/fixtures/mock-provider-server.ts`) does not yet exist — this is a Phase 6 deliverable, not blocking Phase 0.

**Concerns:**

- No new tests are added in Phase 0. The first new tests appear at Phase 2 (Provider Connections public/internal split tests) and Phase 6 (CI strategy). This gap is acceptable for Phase 0 because the deliverables are documents, but Phase 1 (the first implementation phase) must include manifest-wiring tests.

**Status: APPROVED for Phase 0 merge.**

### Governance signoff

**Reviewed:** all 11 decisions against repo-wide platform rules; receipt policy table (`Phase 20`); module-boundary rules; PS → PM bridge analogue from prior modular work.

**Findings:**

- D3 (Provider Connections as platform infrastructure, not RTLM) is consistent with how Module Gateway / Handoff Manager / Event Bus are categorized — horizontal capabilities don't inflate the RTLM count.
- D4 (OpenRouter hosts Model Access) is consistent with capsule scope: the existing OpenRouter capsule's manifest declares `ports.provided: ["openRouter.route"]`, and execution authority is a natural extension of that port surface.
- D6 (one entry per agent dedup) is consistent with the existing `catalog_entries` + `catalog_entry_versions` schema pair.
- D8 (publish lifecycle-only) eliminates an architectural ambiguity that has caused at least one production bug pattern (the catalog-row side-effect).
- D9 (no inert events) is consistent with existing event-bus discipline.
- D10 (frontend boundary forward-only) is the only decision that explicitly scopes a rule to "new flows." Governance accepts this because retroactive enforcement would block the entire plan; the alternative (no rule at all) would let the plan worsen the frontend boundary state.

**Concerns:**

- D11 says "If any decision in this record is changed after merge, that change requires its own PR with renewed signoffs from the affected role." Governance specifies this means: **any change to D1–D10 after merge requires re-signoff from at least Reviewer and Governance, plus the role most affected by the change (e.g., changing D5 = Tester re-signoff).**

**Status: APPROVED for Phase 0 merge, with the change-signoff specificity above adopted as the binding interpretation of D11.**

---

## Decision change log

(Empty at first merge. Future amendments append here with date, author, affected decision IDs, and renewed signoffs.)
