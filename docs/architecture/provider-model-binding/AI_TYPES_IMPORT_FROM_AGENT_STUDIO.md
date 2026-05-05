# AI Types — Import from Agent Studio

**Status:** Active. Phase 36 (PR #136) shipped the AI Types-side
consumer. Sister document to `AGENT_STUDIO_EXPORT_CATALOG.md`.

---

## What this is

The AI Types-side surface that consumes the Agent Studio export
catalog. Every call goes through the Module Gateway — AI Types never
imports `server/agent-studio/*` directly (per Decision D6).

---

## Two public functions (`server/ai-types/import-from-agent-studio.ts`)

```ts
listImportableAgentStudioCandidates(
  input: { workspaceId?: number; status?: ...; actorId: number },
): Promise<AgentStudioExportCandidateRef[]>;

importAgentStudioCandidate(
  input: { agentId: number; importedBy: number; ... },
): Promise<{ catalogEntryId, action, ... }>;
```

Both call `gatewayCall<...>` with `targetModule: "agentStudio"`.
`listImportable...` invokes `agentStudio.exportCatalog.listCandidates`;
`importAgentStudioCandidate` invokes
`agentStudio.exportCatalog.exportCandidate`. The latter is
receipt-required, so the import path generates a stub receipt id
(`aitypes-import-<agentId>-<ts>`) when none is passed in.

---

## D6 boundary

This file is the *one* place in `server/ai-types/` that touches
Agent Studio. It does so through `gatewayCall` only:

- No `import` from `server/agent-studio/<anything>` (asymmetric
  Phase 26 lint enforces this — AI Types has no public-API
  exemption).
- No reading from `getAsDb()`.
- No raw SQL on `ags_*` tables.

`tests/pmb/boundary.test.ts` invariants 3 + 4 verify these.

---

## Type sharing

`AgentStudioExportCandidateRef = Record<string, unknown>` (locally
declared as opaque). The canonical type lives in
`server/agent-studio/shared/export-candidate.ts`, but cross-module
type sharing must go through `shared/` modules — not direct imports
across the AS boundary. A future phase may promote a shared type
into `shared/agent-studio-export.ts` if other consumers appear.

---

## UI surface (Direction B B3 — shipped at PR #155 / `592ef62`)

The Catalog Import Wizard's "Import from Agent Studio" branch calls
the two functions above through the `catalogImport.*` tRPC router
(`server/catalog-import/router.ts`):

- `catalogImport.listAgentStudioCandidates` (`protectedProcedure`
  query) wraps `listImportableAgentStudioCandidates`.
- `catalogImport.importAgentStudioCandidate` (`governedProcedure`
  mutation) wraps `importAgentStudioCandidate`. Action key registered
  in `config/governance/platform_action_registry.yaml` and
  `server/governance/action-key-map.ts` (R2, capability
  `catalog.manage`, no approval, no evidence — risk parity with
  `catalogImport.bulkCreate`).

`client/src/components/CatalogImportWizard.tsx` consumes both:

1. Step 2 (`method === "agent_studio"`) — query `listAgentStudioCandidates({ status: "ready" })`,
   render each candidate as a checkbox row.
2. Step 3 — confirm selected agents.
3. Step 4 — iterate `importAgentStudioCandidate({ agentId })` per
   selected agent, accumulating `{ ok, reason }` per result.

The AS Candidate Pipeline (`CandidatePage` `mode="agentStudio"`,
mounted at `client/src/pages/ASCandidatePage.tsx`) additionally
narrows its `aiTypes.catalog.list` query to `sourceType="ags_agent"`
so it only shows AS-sourced rows.

**Open follow-up:** no UI button for `agentStudio.exportCatalog.reconcileSync`
(the Phase 41 sync-drift repair action) — admin-only via gateway today.

---

## Test coverage

- `server/ai-types/import-from-agent-studio.test.ts` — drives both
  functions through a mocked `gatewayCall`. Verifies request shape,
  receipt-id generation, and result-mapping behavior.
- `server/catalog-import/agent-studio-import.test.ts` (Direction B B3) —
  drives the two new tRPC procedures through `appRouter.createCaller`.
  Verifies the procedure layer wraps the AI Types-side functions
  correctly and rejects non-positive `agentId` at the schema.

---

## Where to read more

- `AGENT_STUDIO_EXPORT_CATALOG.md` — the producer side (this is the
  consumer side)
- `DECISION_RECORD.md` D6 — AS↔AI Types boundary direction
- `CATALOG_SOURCE_MAPPING.md` — Phase 23 source-versioning columns
  the import flow populates on the catalog side
