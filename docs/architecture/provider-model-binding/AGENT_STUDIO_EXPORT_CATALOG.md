# Agent Studio Export Catalog

**Status:** Active. Plan v3 Stage 8 (Phases 27–31) plus Stage 9–10
extensions (Phases 36–41) own the export path from Agent Studio to
the AI Types catalog.

---

## What this is

The contract by which a *published* Agent Studio agent becomes a row
in the AI Types `catalog_entries` table — without Agent Studio ever
writing to the catalog directly.

```
AS published agent ──┐                              ┌─→ catalog_entries
                     ├──► AS exportCatalog API ────►├
AS readiness         │  (gateway action)            │   (sourceType="agent",
   + governance ─────┘                              │    sourceId=agentId)
   + binding                                        │
                                                    └─→ ags_catalog_sync_log
                                                       (Phase 40 mirror)
```

---

## Six gateway actions

All on the `agentStudio.exportCatalog.*` namespace, registered in
`server/agent-studio/boot.ts`:

| Action | Risk | Receipt | Purpose |
|---|---|---|---|
| `listCandidates` | low | no | List published agents with derived export status |
| `getCandidate` | low | no | Single-agent fetch |
| `exportCandidate` | medium | yes | Call `aiTypes.catalog.register` via gateway |
| `markImported` | low | no | Advisory: confirm the import succeeded |
| `reconcileImports` | high | yes | Per-row admin override for `legacy_imported_unresolved` |
| `reconcileSync` | medium | yes | Bulk drift scan + repair (Phase 41) |

**`reconcileImports` vs `reconcileSync` are intentionally distinct.**
The former is a single-row admin override that wraps Phase 24's
`reconcileLegacyImport`. The latter is a bulk catalog↔sync-log drift
detector that walks every published agent and writes synthetic
sync-log rows where the AS-side mirror has fallen behind. They share
the export-catalog naming but cover different operational concerns.

---

## The export DTO (`AgentStudioExportCandidate`)

Phase 29 contract in `server/agent-studio/shared/export-candidate.ts`.
Carries identity, governance verdict, readiness snapshot, binding
ref, capabilities, and `exportStatus` (derived). Every field is
allowlisted via `AGENT_STUDIO_EXPORT_CANDIDATE_KEYS`. Recursive
forbidden-key check (`FORBIDDEN_EXPORT_CANDIDATE_KEYS`) blocks every
secret-shaped field even if nested inside `config`.

The DTO is the *only* shape that crosses from Agent Studio to AI
Types — it never carries a credential, never carries
`releaseNotes`/`approvalStateJson`/`systemInstructions`/
`roleInstructions` (PII or runtime-prompt material).

---

## Eligibility (Phase 31)

`evaluateExportEligibility(candidate)` runs nine gates before
`exportCandidate` is allowed to proceed. Every gate runs (no
short-circuit) so the verdict shows the full failure list:

1. `lifecycle_published` — `lifecycleState === "published"`
2. `governance_cleared` — Phase 27 verdict status `"cleared"`
3. `readiness_score_threshold` — score ≥ 70 (default)
4. `binding_present` — agent has a non-missing binding
5. `binding_active` — binding status `binding_v1`
6. `provider_connection_resolvable` — Provider Connections side green
7. `model_catalog_entry_resolvable` — AI Types catalog row exists
8. `not_already_imported` — `exportStatus !== "exported"`
9. `no_duplicate_canonical_entry` — no other `(sourceType="agent",
   sourceId=agentId)` row exists already

A candidate must pass all nine to be eligible. The handler refuses
ineligible candidates with a list of failed gates.

---

## Catalog write shape (Phase 37)

`prepareExportRegisterPayload` returns the register input with
fields placed correctly per the Phase 23 schema:

```ts
{
  entryType: "agent",
  sourceType: "agent",
  sourceId: candidate.agentId,
  fields: {
    name, displayName, description: null,
    scope: "app",
    status: "draft",                       // initial state — admins promote
    origin: "agent_studio",
    reviewState: "needs_review",
    activeSourceVersionId,                 // top-level (Phase 23 column)
    config: {
      exportDto: { ... AgentStudioExportCandidate snapshot ... },
      eligibilityGates: [{ gate, pass }, ...],
    },
    tags: ["agent-studio-export", ...capabilities],
    createdBy,
  },
  registeredBy,
}
```

The reviewer surface (existing `catalog-manage` tRPC routes) handles
draft → active promotion. AS doesn't promote; it just registers.

---

## Phase 40 sync mirror

When `aiTypes.catalog.register` succeeds, the AI Types module emits
`aiTypes.catalog.registered` (Phase 39, best-effort). The Agent
Studio module subscribes (Phase 40) and appends a row to
`ags_catalog_sync_log`. The latest log row's `eventType` is the
AS-side "current catalog status" via
`deriveCatalogStatusFromEventType`:

| Latest eventType | AS-side status |
|---|---|
| `aiTypes.catalog.registered` | `"registered"` |
| `aiTypes.catalog.published` | `"published"` |
| `aiTypes.catalog.deprecated` | `"deprecated"` |
| (no rows) | `"unknown"` |

---

## Phase 41 reconciliation

If the bus is down at register time, the sync log misses a row. The
bulk scan fixes that:

```ts
gatewayCall({
  ctx: { sourceModule: "...", targetModule: "agentStudio",
         actionKey: "agentStudio.exportCatalog.reconcileSync",
         governanceReceiptId: ... },
  input: { reconciledBy: 42, dryRun: true },  // preview before applying
});
```

Returns `{scanned, inSync, drift, repaired, dryRun, items[]}` —
admins can preview drift before applying repairs. Drift cases:
`missing_registered`, `missing_published`, `missing_deprecated`,
`no_catalog_entry` (informational, not repaired). The repair writes
synthetic events with deterministic `eventId`
(`as-recon-<driftCase>-<catalogEntryId>`) so reruns ON CONFLICT DO
NOTHING.

---

## Test coverage

- `server/agent-studio/services/export-catalog.test.ts` — list,
  get, prepareExportRegisterPayload, markCandidateImported,
  reconcileCandidateImports, reconcileExportCatalogSync (31 tests).
- `server/agent-studio/services/export-eligibility.test.ts` — Phase
  31 nine-gate verdict.
- `server/agent-studio/services/governance-adapter.test.ts` — Phase
  27 export verdict.
- `server/agent-studio/services/readiness.test.ts` — Phase 28
  snapshot.
- `server/agent-studio/services/catalog-sync-subscribers.test.ts` —
  Phase 40 subscriber handler.
- `server/agent-studio/publish-no-catalog-write.test.ts` — runtime
  guarantee that publish does not write `catalog_entries`.

---

## Where to read more

- `DECISION_RECORD.md` D6 — Agent Studio cannot write `catalog_entries`
- `CATALOG_WRITER_MIGRATION_MATRIX.md` — Phase 25 callers migrated
  to `aiTypes.catalog.register`
- `AI_TYPES_IMPORT_FROM_AGENT_STUDIO.md` — sister document, the
  AI Types-side consumer
